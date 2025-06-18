import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPaymentSchema } from "@shared/schema";
import { createSpan, generateTraceId, generateSpanId, addSpanAttributes } from "./tracing";
import { queueSimulator, setupPaymentProcessor } from "./queue";

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize queue processor
  await setupPaymentProcessor(queueSimulator);
  // Payment submission endpoint
  app.post("/api/payments", async (req, res) => {
    const { span, traceId, spanId, finish } = createSpan("payment.submit");
    
    try {
      const validatedData = insertPaymentSchema.parse(req.body);
      
      addSpanAttributes(span, {
        'payment.amount': validatedData.amount,
        'payment.currency': validatedData.currency || 'USD',
        'payment.recipient': validatedData.recipient,
      });

      // Create trace record
      await storage.createTrace({
        traceId: traceId,
        rootSpanId: spanId,
      });

      // Create root span record
      const startTime = new Date();
      await storage.createSpan({
        traceId: traceId,
        spanId: spanId,
        parentSpanId: null,
        operationName: "payment.submit",
        serviceName: "payment-api",
        status: "active",
        duration: 0,
        startTime: startTime,
        tags: JSON.stringify({
          'payment.amount': validatedData.amount,
          'payment.currency': validatedData.currency,
        }),
      });

      // Create payment record
      const payment = await storage.createPayment({
        ...validatedData,
        traceId: traceId,
        spanId: spanId,
      });

      // Simulate Kong Gateway span
      const kongSpan = createSpan("kong.gateway", spanId);
      addSpanAttributes(kongSpan.span, {
        'gateway.service': 'payment-api',
        'gateway.duration': 12,
      });
      
      await storage.createSpan({
        traceId: traceId,
        spanId: kongSpan.spanId,
        parentSpanId: spanId,
        operationName: "kong.gateway",
        serviceName: "kong-gateway",
        status: "success",
        duration: 12,
        startTime: new Date(startTime.getTime() + 5),
        endTime: new Date(startTime.getTime() + 17),
        tags: JSON.stringify({ 'gateway.service': 'payment-api' }),
      });
      kongSpan.finish('success');

      // Send to JMS queue for processing
      await queueSimulator.publish('payment-queue', {
        paymentId: payment.id,
        amount: validatedData.amount,
        currency: validatedData.currency || 'USD',
        recipient: validatedData.recipient,
        description: validatedData.description,
      }, traceId, spanId);

      // Simulate database write
      const dbSpan = createSpan("database.write", spanId);
      addSpanAttributes(dbSpan.span, {
        'db.operation': 'INSERT',
        'db.table': 'payments',
      });

      await storage.createSpan({
        traceId: traceId,
        spanId: dbSpan.spanId,
        parentSpanId: spanId,
        operationName: "database.write",
        serviceName: "database",
        status: "success",
        duration: 78,
        startTime: new Date(startTime.getTime() + 70),
        endTime: new Date(startTime.getTime() + 148),
        tags: JSON.stringify({ 'db.operation': 'INSERT' }),
      });
      dbSpan.finish('success');

      // Update payment status
      setTimeout(async () => {
        await storage.updatePaymentStatus(payment.id, "completed");
        await storage.updateTraceStatus(traceId, "completed", 245);
        
        // Update root span
        await storage.updateSpan(spanId, {
          status: "success",
          duration: 245,
          endTime: new Date(startTime.getTime() + 245),
        });
      }, 100);

      finish('success');
      
      res.json({
        success: true,
        payment,
        traceId: traceId,
        spanId: spanId,
      });

    } catch (error) {
      finish('error');
      res.status(400).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get recent payments
  app.get("/api/payments", async (req, res) => {
    const { span, finish } = createSpan("payments.list");
    
    try {
      const payments = await storage.getPayments(10);
      finish('success');
      res.json(payments);
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get traces
  app.get("/api/traces", async (req, res) => {
    const { span, finish } = createSpan("traces.list");
    
    try {
      const traces = await storage.getTraces(10);
      finish('success');
      res.json(traces);
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get spans for a trace
  app.get("/api/traces/:traceId/spans", async (req, res) => {
    const { span, finish } = createSpan("trace.spans");
    
    try {
      const { traceId } = req.params;
      const spans = await storage.getSpansByTrace(traceId);
      finish('success');
      res.json(spans);
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // System metrics endpoint
  app.get("/api/metrics", async (req, res) => {
    const { span, finish } = createSpan("metrics.get");
    
    try {
      const payments = await storage.getPayments(1000);
      const traces = await storage.getTraces(1000);
      
      const successfulPayments = payments.filter(p => p.status === 'completed').length;
      const successRate = payments.length > 0 ? (successfulPayments / payments.length * 100).toFixed(1) : '0';
      
      const completedTraces = traces.filter(t => t.duration !== null);
      const avgLatency = completedTraces.length > 0 
        ? Math.round(completedTraces.reduce((sum, t) => sum + (t.duration || 0), 0) / completedTraces.length)
        : 0;

      const activeTraces = traces.filter(t => t.status === 'active').length;

      const metrics = {
        totalRequests: payments.length,
        successRate: `${successRate}%`,
        avgLatency: `${avgLatency}ms`,
        activeTraces: activeTraces,
      };

      finish('success');
      res.json(metrics);
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Queue stats endpoint
  app.get("/api/queues", async (req, res) => {
    const { span, finish } = createSpan("queues.stats");
    
    try {
      const queueStats = queueSimulator.getQueueStats();
      finish('success');
      res.json(queueStats);
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Jaeger UI proxy endpoint
  app.get("/api/jaeger", async (req, res) => {
    const { span, finish } = createSpan("jaeger.redirect");
    
    try {
      // In a real deployment, this would proxy to actual Jaeger instance
      // For demo purposes, provide mock Jaeger interface or redirect
      const jaegerConfig = {
        ui_url: process.env.JAEGER_UI_URL || "http://localhost:16686",
        query_url: process.env.JAEGER_QUERY_URL || "http://localhost:16686/api",
        status: "demo_mode",
        traces_available: true,
        services: ["payment-api", "kong-gateway", "solace-queue", "payment-processor", "notification-service", "audit-service"]
      };
      
      finish('success');
      res.json(jaegerConfig);
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
