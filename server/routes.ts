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

      // Create payment record with trace correlation
      const payment = await storage.createPayment({
        ...validatedData,
        traceId: traceId,
        spanId: spanId,
      });

      // Note: OpenTelemetry automatic instrumentation will create actual spans 
      // that are sent to Jaeger. No synthetic spans are created here.

      res.json({ 
        success: true, 
        payment,
        traceId,
        spanId
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

  // Get traces (for UI demonstration only - real traces go to Jaeger)
  app.get("/api/traces", async (req: Request, res: Response) => {
    try {
      const traces = await storage.getTraces(10);
      res.json(traces);
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