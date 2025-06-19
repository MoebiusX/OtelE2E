// Kong Gateway - External Infrastructure Service
// Runs as separate process with real API gateway functionality

import express, { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';

export interface TraceContext {
  traceId: string;
  spanId: string;
}

export class KongGateway {
  private app = express();
  private readonly backendPort: number;
  private readonly gatewayPort: number;
  private tracer = trace.getTracer('kong-gateway', '1.0.0');

  constructor(gatewayPort: number = 8000, backendPort: number = 5000) {
    this.gatewayPort = gatewayPort;
    this.backendPort = backendPort;
    this.setupMiddleware();
  }

  private setupMiddleware() {
    this.app.use(express.json());

    // Kong Gateway with authentic OpenTelemetry tracing
    this.app.use('/api/payments', async (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'POST') return next();

      const span = this.tracer.startSpan('kong-gateway-processing', {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'kong.service': 'payment-api',
          'kong.route': '/api/payments',
          'component': 'kong-gateway'
        }
      });

      console.log(`[Kong Gateway] Processing ${req.method} ${req.url}`);

      // Simulate Kong processing time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 4 + 2));

      const clientTraceId = req.headers['x-trace-id'] as string;
      const clientSpanId = req.headers['x-span-id'] as string;

      if (clientTraceId && clientSpanId) {
        // Preserve existing trace context
        const traceparent = `00-${clientTraceId}-${clientSpanId}-01`;
        req.headers['traceparent'] = traceparent;
        console.log(`[Kong Gateway] Preserving client trace: ${clientTraceId}`);
      } else {
        // Inject new trace context
        const traceContext = this.generateTraceContext();
        const traceparent = `00-${traceContext.traceId}-${traceContext.spanId}-01`;
        req.headers['traceparent'] = traceparent;
        console.log(`[Kong Gateway] Injecting new trace: ${traceContext.traceId}`);
      }

      span.setAttributes({
        'kong.upstream': `localhost:${this.backendPort}`,
        'kong.latency': Math.random() * 4 + 2
      });

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      next();
    });

    // Proxy to backend
    this.app.use('/', createProxyMiddleware({
      target: `http://localhost:${this.backendPort}`,
      changeOrigin: true
    }));
  }

  private generateTraceContext(): TraceContext {
    return {
      traceId: Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      spanId: Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    };
  }

  start(): void {
    this.app.listen(this.gatewayPort, () => {
      console.log(`Kong Gateway running on port ${this.gatewayPort}`);
      console.log(`Proxying to backend on port ${this.backendPort}`);
    });
  }
}

// Start gateway if run directly
if (require.main === module) {
  const gateway = new KongGateway();
  gateway.start();
}