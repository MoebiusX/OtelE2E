// Clean API Routes - Enterprise Payment Processing
// Authentic OpenTelemetry instrumentation only

import type { Express } from "express";
import { Request, Response } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { paymentService } from "../core/payment-service";
import { insertPaymentSchema } from "@shared/schema";
import { traces } from "../otel";

export function registerRoutes(app: Express) {
  console.log("Registering API routes...");

  // Payment submission endpoint
  app.post("/api/payments", async (req: Request, res: Response) => {
    try {
      // Extract trace context from headers (injected by Kong Gateway)
      const traceId = req.headers['x-trace-id'] as string || 
                     req.headers['traceparent']?.toString().split('-')[1] || 
                     generateTraceId();
      const spanId = req.headers['x-span-id'] as string || 
                    req.headers['traceparent']?.toString().split('-')[2] || 
                    generateSpanId();

      // Validate request
      const validation = insertPaymentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: fromZodError(validation.error).message 
        });
      }

      const paymentData = validation.data;

      // Process payment
      const result = await paymentService.processPayment({
        amount: paymentData.amount,
        currency: paymentData.currency,
        recipient: paymentData.recipient,
        description: paymentData.description || 'Payment processing'
      }, {
        traceId,
        spanId
      });

      // Return result
      const payment = await paymentService.getPayment(result.paymentId);
      res.json({ 
        success: true, 
        payment,
        traceId: result.traceId,
        spanId: result.spanId,
        messageId: result.messageId
      });

    } catch (error: any) {
      console.error(`Payment processing error: ${error.message}`);
      res.status(500).json({ error: "Failed to process payment" });
    }
  });

  // Get payments
  app.get("/api/payments", async (req: Request, res: Response) => {
    try {
      const payments = await paymentService.getPayments(10);
      res.json(payments);
    } catch (error: any) {
      console.error(`Error fetching payments: ${error.message}`);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // Get OpenTelemetry traces
  app.get("/api/traces", async (req: Request, res: Response) => {
    try {
      // Filter authentic OpenTelemetry spans - no GET requests, only business operations
      const businessTraces = traces.filter(trace => {
        const spans = trace.spans || [];
        return spans.some((span: any) => 
          span.name?.includes('POST') || 
          span.name?.includes('Queue') ||
          span.name?.includes('payment')
        );
      });

      res.json(businessTraces.slice(0, 10));
    } catch (error: any) {
      console.error(`Error fetching traces: ${error.message}`);
      res.status(500).json({ error: "Failed to fetch traces" });
    }
  });

  // Get spans for a specific trace
  app.get("/api/traces/:traceId/spans", async (req: Request, res: Response) => {
    try {
      const { traceId } = req.params;
      const trace = traces.find(t => t.traceId === traceId);
      
      if (!trace) {
        return res.status(404).json({ error: "Trace not found" });
      }

      res.json(trace.spans || []);
    } catch (error: any) {
      console.error(`Error fetching spans: ${error.message}`);
      res.status(500).json({ error: "Failed to fetch spans" });
    }
  });

  // Clear all data
  app.delete("/api/clear", async (req: Request, res: Response) => {
    try {
      const { clearTraces } = await import('../otel');
      await paymentService.clearAllData();
      clearTraces();
      
      res.json({ 
        success: true, 
        message: "All recorded transactions cleared" 
      });
    } catch (error: any) {
      console.error(`Clear operation error: ${error.message}`);
      res.status(500).json({ error: "Failed to clear data" });
    }
  });
}

function generateTraceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function generateSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}