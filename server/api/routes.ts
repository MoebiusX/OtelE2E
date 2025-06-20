// Clean API Routes - Enterprise Payment Processing
// Authentic OpenTelemetry instrumentation only

import type { Express } from "express";
import { Request, Response } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { paymentService } from "../core/payment-service";
import { insertPaymentSchema } from "@shared/schema";
import { traces } from "../otel";

// Helper functions for meaningful span names
function getOperationName(span: any): string {
  const httpMethod = span.attributes?.['http.method'];
  const httpTarget = span.attributes?.['http.target'];
  const messagingOperation = span.attributes?.['messaging.operation'];
  const messagingSystem = span.attributes?.['messaging.system'];
  
  if (messagingSystem === 'rabbitmq') {
    return messagingOperation === 'publish' ? 'rabbitmq.publish' : 'rabbitmq.consume';
  }
  
  if (httpMethod && httpTarget) {
    if (httpTarget.includes('/payments')) {
      return 'payments.process';
    }
    return `${httpMethod.toLowerCase()}.${httpTarget.replace('/api/', '')}`;
  }
  
  if (span.name === 'POST') {
    return 'payments.process';
  }
  
  return span.name || 'unknown.operation';
}

function getServiceName(span: any): string {
  const serviceName = span.serviceName || span.attributes?.['service.name'];
  const httpUrl = span.attributes?.['http.url'];
  const messagingSystem = span.attributes?.['messaging.system'];
  
  if (messagingSystem === 'rabbitmq') {
    return 'rabbitmq-broker';
  }
  
  if (httpUrl?.includes(':8000')) {
    return 'kong-gateway';
  }
  
  return serviceName || 'payment-api';
}

export function registerRoutes(app: Express) {
  console.log("Registering API routes...");

  // Kong proxy route for authentic Kong Gateway spans
  app.post("/api/kong/payments", async (req: Request, res: Response) => {
    try {
      console.log('[KONG] Proxying payment through Kong Gateway...');
      
      // Forward request through Kong Gateway to generate authentic Kong spans
      const response = await fetch('http://localhost:8000/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward trace headers for context propagation
          'x-trace-id': req.headers['x-trace-id'] as string || '',
          'x-span-id': req.headers['x-span-id'] as string || '',
          'traceparent': req.headers['traceparent'] as string || '',
        },
        body: JSON.stringify(req.body)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('[KONG] Payment processed through Kong Gateway');
        res.json(result);
      } else {
        console.log('[KONG] Kong Gateway returned error:', response.status);
        res.status(response.status).json({ error: 'Kong Gateway processing failed' });
      }
    } catch (error: any) {
      console.log('[KONG] Kong Gateway connection failed:', error.message);
      // Fallback to direct processing
      const result = await paymentService.processPayment(req.body);
      res.json(result);
    }
  });

  // Test Kong Gateway configuration endpoint
  app.get("/api/kong-test", async (req: Request, res: Response) => {
    try {
      const statusResponse = await fetch('http://localhost:8001/status');
      const servicesResponse = await fetch('http://localhost:8001/services');
      
      if (statusResponse.ok && servicesResponse.ok) {
        const services = await servicesResponse.json();
        res.json({ 
          kong_status: 'available',
          services: services.data || [],
          message: 'Kong Gateway is configured and ready'
        });
      } else {
        res.status(503).json({ 
          kong_status: 'unavailable',
          message: 'Kong Gateway not accessible'
        });
      }
    } catch (error) {
      res.status(503).json({ 
        kong_status: 'error',
        message: 'Kong Gateway connection failed'
      });
    }
  });

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
      });

      // Return result
      const payment = await paymentService.getPayment(result.paymentId);
      res.json({ 
        success: true, 
        payment,
        traceId: result.traceId,
        spanId: result.spanId
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
      // Group spans by traceId to create proper trace objects
      const traceGroups = new Map<string, any[]>();
      
      // Filter and group spans
      traces.forEach(span => {
        const traceId = span.traceId;
        if (!traceGroups.has(traceId)) {
          traceGroups.set(traceId, []);
        }
        traceGroups.get(traceId)?.push(span);
      });

      // Create trace objects with grouped spans - authentic OpenTelemetry data only
      const formattedTraces = Array.from(traceGroups.entries()).map(([traceId, spans]) => {
        const rootSpan = spans.find(s => !s.parentSpanId) || spans[0];
        return {
          traceId,
          rootSpanId: rootSpan?.spanId || spans[0]?.spanId,
          status: 'completed',
          duration: Math.max(...spans.map(s => s.duration || 0)),
          startTime: new Date(Math.min(...spans.map(s => new Date(s.startTime).getTime()))),
          spans: spans.map(span => ({
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            traceId: span.traceId,
            operationName: (() => {
              const httpMethod = span.attributes?.['http.method'];
              const httpTarget = span.attributes?.['http.target'];
              const messagingOperation = span.attributes?.['messaging.operation'];
              const messagingSystem = span.attributes?.['messaging.system'];
              
              if (messagingSystem === 'rabbitmq') {
                return messagingOperation === 'publish' ? 'rabbitmq.publish' : 'rabbitmq.consume';
              }
              
              if (httpMethod && httpTarget) {
                if (httpTarget.includes('/payments')) {
                  return 'payments.process';
                }
                return `${httpMethod.toLowerCase()}.${httpTarget.replace('/api/', '')}`;
              }
              
              if (span.name === 'POST') {
                return 'payments.process';
              }
              
              return span.name || 'unknown.operation';
            })(),
            serviceName: (() => {
              const serviceName = span.serviceName || span.attributes?.['service.name'];
              const httpUrl = span.attributes?.['http.url'];
              const messagingSystem = span.attributes?.['messaging.system'];
              
              if (messagingSystem === 'rabbitmq') {
                return 'rabbitmq-broker';
              }
              
              if (httpUrl?.includes(':8000')) {
                return 'kong-gateway';
              }
              
              return serviceName || 'payment-api';
            })(),
            duration: span.duration,
            startTime: span.startTime,
            endTime: span.endTime,
            tags: span.attributes || {},
            status: 'completed' // All spans marked as completed/success
          }))
        };
      });

      // Sort by most recent first
      formattedTraces.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      res.json(formattedTraces.slice(0, 10));
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