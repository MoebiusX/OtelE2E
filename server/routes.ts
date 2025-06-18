import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPaymentSchema } from "@shared/schema";
import { createSpan, generateTraceId, generateSpanId, addSpanAttributes } from "./tracing";
import { queueSimulator, setupPaymentProcessor } from "./queue";
import { kongGateway } from "./kong";

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

  // Grafana Tempo UI proxy endpoint
  app.get("/api/tempo", async (req, res) => {
    const { span, finish } = createSpan("tempo.redirect");
    
    try {
      // In a real deployment, this would proxy to actual Grafana/Tempo instance
      // For demo purposes, provide configuration for Grafana Tempo
      const tempoConfig = {
        ui_url: process.env.GRAFANA_UI_URL || "http://localhost:3000",
        tempo_endpoint: process.env.TEMPO_ENDPOINT || "http://localhost:3200",
        query_url: process.env.TEMPO_QUERY_URL || "http://localhost:3200/api/search",
        status: "demo_mode",
        traces_available: true,
        datasource: "tempo",
        export_format: "otlp",
        services: ["payment-api", "kong-gateway", "solace-queue", "payment-processor", "notification-service", "audit-service"]
      };
      
      finish('success');
      res.json(tempoConfig);
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Kong Admin API endpoints
  app.get("/admin/services", async (req, res) => {
    const { span, finish } = createSpan("kong.admin.services");
    
    try {
      const services = kongGateway.getServices();
      finish('success');
      res.json({
        data: services,
        total: services.length
      });
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.get("/admin/routes", async (req, res) => {
    const { span, finish } = createSpan("kong.admin.routes");
    
    try {
      const routes = kongGateway.getRoutes();
      finish('success');
      res.json({
        data: routes,
        total: routes.length
      });
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.get("/admin/plugins", async (req, res) => {
    const { span, finish } = createSpan("kong.admin.plugins");
    
    try {
      const plugins = kongGateway.getPlugins();
      finish('success');
      res.json({
        data: plugins,
        total: plugins.length
      });
    } catch (error) {
      finish('error');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.post("/admin/services", async (req, res) => {
    const { span, finish } = createSpan("kong.admin.create_service");
    
    try {
      const newService = kongGateway.addService(req.body);
      finish('success');
      res.status(201).json(newService);
    } catch (error) {
      finish('error');
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Invalid service data" 
      });
    }
  });

  app.post("/admin/routes", async (req, res) => {
    const { span, finish } = createSpan("kong.admin.create_route");
    
    try {
      const newRoute = kongGateway.addRoute(req.body);
      finish('success');
      res.status(201).json(newRoute);
    } catch (error) {
      finish('error');
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Invalid route data" 
      });
    }
  });

  // Kong status endpoint
  app.get("/admin/status", async (req, res) => {
    const { span, finish } = createSpan("kong.admin.status");
    
    try {
      const status = {
        database: {
          reachable: true
        },
        memory: {
          workers_lua_vms: [
            {
              http_allocated_gc: "0.02 MiB",
              pid: process.pid
            }
          ]
        },
        server: {
          connections_accepted: 42,
          connections_active: 1,
          connections_handled: 42,
          connections_reading: 0,
          connections_waiting: 0,
          connections_writing: 1,
          total_requests: 42
        },
        configuration_hash: "a9a166c59873245db8f1a747ba9a80a7",
        version: "3.4.2",
        hostname: "kong-gateway",
        lua_version: "LuaJIT 2.1.0-beta3",
        plugins: {
          available_on_server: kongGateway.getPlugins().map(p => p.name),
          enabled_in_cluster: kongGateway.getPlugins().filter(p => p.enabled).map(p => p.name)
        }
      };
      
      finish('success');
      res.json(status);
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
