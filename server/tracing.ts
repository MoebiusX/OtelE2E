import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';

// Configure console exporter for development
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  headers: {},
});

// Initialize OpenTelemetry SDK with OTLP exporter
const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
  })],
});

// Start the SDK
sdk.start();

export const tracer = trace.getTracer('payment-api');

export function generateTraceId(): string {
  return uuidv4().replace(/-/g, '');
}

export function generateSpanId(): string {
  return uuidv4().replace(/-/g, '').substring(0, 16);
}

export function createSpan(name: string, parentSpanId?: string, attributes?: Record<string, string | number | boolean>) {
  const span = tracer.startSpan(name, {
    kind: SpanKind.SERVER,
  });
  
  // Set initial attributes if provided
  if (attributes) {
    span.setAttributes(attributes);
  }
  
  return {
    span,
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    finish: (status: 'success' | 'error' | 'timeout' = 'success') => {
      if (status === 'error') {
        span.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
    }
  };
}

export function addSpanAttributes(span: any, attributes: Record<string, string | number | boolean>) {
  Object.entries(attributes).forEach(([key, value]) => {
    span.setAttributes({ [key]: value });
  });
}

export { context, trace };
