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

      // Create comprehensive payment processing trace for UI demonstration
      await storage.createTrace({
        traceId: traceId,
        rootSpanId: spanId,
        status: 'active',
        startTime: new Date(),
        endTime: null,
        duration: null
      });

      // Kong Gateway Entry Point Span
      await storage.createSpan({
        traceId: traceId,
        spanId: generateSpanId(),
        parentSpanId: null,
        operationName: "Kong Gateway Entry",
        serviceName: 'kong-gateway',
        status: 'success',
        duration: 2,
        startTime: new Date(Date.now() - 50),
        endTime: new Date(Date.now() - 48),
        tags: JSON.stringify({
          'kong.route': '/api/payments',
          'kong.method': 'POST',
          'kong.plugin': 'rate-limiting,cors,tracing'
        })
      });

      // Validate payment data
      const result = insertPaymentSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ error: validationError.message });
      }

      const validatedData = result.data;

      // Payment Validation Span
      await storage.createSpan({
        traceId: traceId,
        spanId: generateSpanId(),
        parentSpanId: spanId,
        operationName: "Payment Validation",
        serviceName: 'payment-api',
        status: 'success',
        duration: 8,
        startTime: new Date(Date.now() - 40),
        endTime: new Date(Date.now() - 32),
        tags: JSON.stringify({
          'payment.amount': validatedData.amount,
          'payment.currency': validatedData.currency,
          'validation.result': 'success'
        })
      });

      // Create payment record with trace correlation
      const payment = await storage.createPayment({
        ...validatedData,
        traceId: traceId,
        spanId: spanId,
      });

      // Database Operation Span
      await storage.createSpan({
        traceId: traceId,
        spanId: generateSpanId(),
        parentSpanId: spanId,
        operationName: "Database Insert",
        serviceName: 'payment-api',
        status: 'success',
        duration: 15,
        startTime: new Date(Date.now() - 30),
        endTime: new Date(Date.now() - 15),
        tags: JSON.stringify({
          'db.operation': 'INSERT',
          'db.table': 'payments',
          'payment.id': payment.id
        })
      });

      // Publish to Solace queue for downstream processing
      const messageId = await queueSimulator.publish('payment-queue', {
        paymentId: payment.id,
        amount: validatedData.amount,
        currency: validatedData.currency,
        recipient: validatedData.recipient
      }, traceId, spanId);

      // Complete the trace
      await storage.updateTraceStatus(traceId, 'success', 50);

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

  // Get traces (demonstration traces showing payment processing flow)
  app.get("/api/traces", async (req: Request, res: Response) => {
    try {
      // Return meaningful payment processing traces for demonstration
      const paymentTraces = await storage.getTraces(10);
      res.json(paymentTraces);
    } catch (error: any) {
      log(`Error fetching traces: ${error.message}`, "error");
      res.status(500).json({ error: "Failed to fetch traces" });
    }
  });

  // Get spans for a trace (for UI demonstration only - real spans go to Jaeger)
  app.get("/api/traces/:traceId/spans", async (req: Request, res: Response) => {
    try {
      const spans = await storage.getSpansByTrace(req.params.traceId);
      res.json(spans);
    } catch (error: any) {
      log(`Error fetching spans: ${error.message}`, "error");
      res.status(500).json({ error: "Failed to fetch spans" });
    }
  });
}