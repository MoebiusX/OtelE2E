import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, SpanExporter } from '@opentelemetry/sdk-trace-node';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';

// Store traces for local visualization
export const traces: any[] = [];

// Custom trace collector for demo visualization
class TraceCollector implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    spans.forEach(span => {
      // Filter out only GET requests - preserve all business operations
      const httpMethod = span.attributes?.['http.method'];
      const spanName = span.name || '';
      
      // Skip only GET requests - they're frontend polling noise
      if (httpMethod === 'GET' || spanName.includes('GET ')) {
        return;
      }
      
      const traceData = {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        parentSpanId: span.parentSpanContext?.spanId || null,
        name: span.name,
        kind: span.kind,
        status: span.status,
        startTime: new Date(span.startTime[0] * 1000 + span.startTime[1] / 1000000),
        endTime: span.endTime ? new Date(span.endTime[0] * 1000 + span.endTime[1] / 1000000) : null,
        duration: span.endTime ? (span.endTime[0] - span.startTime[0]) * 1000 + (span.endTime[1] - span.startTime[1]) / 1000000 : null,
        attributes: span.attributes,
        serviceName: span.resource?.attributes?.[SemanticResourceAttributes.SERVICE_NAME] || 'payment-api',
        events: span.events || []
      };
      
      // Store trace data for API endpoint
      traces.push(traceData);
      
      // Keep only last 100 traces
      if (traces.length > 100) {
        traces.shift();
      }
    });
    
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const traceCollector = new TraceCollector();

// Initialize OpenTelemetry SDK with custom collector
const sdk = new NodeSDK({
  serviceName: 'payment-api',
  spanProcessor: new BatchSpanProcessor(traceCollector),
  instrumentations: [getNodeAutoInstrumentations({
    // Disable fs instrumentation to reduce noise
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
  })],
});

// Start the SDK
sdk.start();

export { sdk };