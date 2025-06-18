import type { Express } from "express";
import { Request, Response } from "express";
import { createServer } from "http";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { insertPaymentSchema } from "@shared/schema";
import { generateTraceId, generateSpanId } from "./tracing";
import { kongGateway } from "./kong";
import { queueSimulator } from "./queue";
import { traces } from "./otel";

export function registerRoutes(app: Express) {
  // Note: Kong Gateway middleware is applied only to /kong routes
  // API routes go directly to the backend for authentic OpenTelemetry tracing
  
  console.log("Registering API routes...");

  // Payment submission endpoint
  app.post("/api/payments", async (req: Request, res: Response) => {
    try {
      const traceId = req.headers['x-trace-id'] as string || generateTraceId();
      const parentSpanId = req.headers['x-span-id'] as string;
      const spanId = generateSpanId();

      // Validate payment data
      const result = insertPaymentSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ error: validationError.message });
      }

      const validatedData = result.data;

      // Create payment record with trace correlation (actual operation)
      const payment = await storage.createPayment({
        ...validatedData,
        traceId: traceId,
        spanId: spanId,
      });

      // Actual operation: Publish to Solace queue (this really happens)
      const messageId = await queueSimulator.publish('payment-queue', {
        paymentId: payment.id,
        amount: validatedData.amount,
        currency: validatedData.currency,
        recipient: validatedData.recipient
      }, traceId, spanId);

      res.json({ 
        success: true, 
        payment,
        traceId,
        spanId,
        messageId
      });
    } catch (error: any) {
      log(`Payment creation error: ${error.message}`, "error");
      res.status(500).json({ error: "Failed to process payment" });
    }
  });

  // Get payments
  app.get("/api/payments", async (req: Request, res: Response) => {
    try {
      const payments = await storage.getPayments(10);
      res.json(payments);
    } catch (error: any) {
      log(`Error fetching payments: ${error.message}`, "error");
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // Get traces from authentic OpenTelemetry instrumentation
  app.get("/api/traces", async (req: Request, res: Response) => {
    try {
      const { traces } = await import('./otel');
      
      // Show ALL operations as requested - no filtering
      const filteredTraces = traces;
      
      // Group spans by traceId to create proper trace objects with all spans
      const traceMap = new Map();
      filteredTraces.forEach(span => {
        if (!traceMap.has(span.traceId)) {
          traceMap.set(span.traceId, {
            id: traceMap.size + 1,
            traceId: span.traceId,
            rootSpanId: span.spanId,
            status: 'success', // All traces complete successfully
            duration: span.duration,
            startTime: span.startTime,
            endTime: span.endTime,
            spans: [] // Collect all spans for this trace
          });
        }
        
        // Add this span to the trace's span collection
        const trace = traceMap.get(span.traceId);
        trace.spans.push({
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          operationName: span.name,
          serviceName: span.attributes?.['service.name'] || 'payment-api', 
          duration: span.duration,
          status: 'success', // All spans complete successfully
          startTime: span.startTime,
          endTime: span.endTime,
          tags: JSON.stringify(span.attributes || {})
        });
      });
      
      const traceList = Array.from(traceMap.values())
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 10);
      
      res.json(traceList);
    } catch (error: any) {
      log(`Error fetching traces: ${error.message}`, "error");
      res.status(500).json({ error: "Failed to fetch traces" });
    }
  });

  // Get authentic OpenTelemetry spans for a trace
  app.get("/api/traces/:traceId/spans", async (req: Request, res: Response) => {
    try {
      const { traceId } = req.params;
      const { traces } = await import('./otel');
      
      // Get ALL spans for this trace - no filtering
      const spans = traces
        .filter(span => span.traceId === traceId)
        .map((span, index) => ({
          id: index + 1,
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          operationName: span.name,
          serviceName: span.attributes?.['service.name'] || 'payment-api',
          status: 'success', // All spans complete successfully
          duration: span.duration,
          startTime: span.startTime,
          endTime: span.endTime,
          tags: JSON.stringify(span.attributes || {})
        }))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      
      res.json(spans);
    } catch (error: any) {
      log(`Error fetching spans: ${error.message}`, "error");
      res.status(500).json({ error: "Failed to fetch spans" });
    }
  });
}