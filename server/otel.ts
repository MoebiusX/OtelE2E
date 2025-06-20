import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SimpleSpanProcessor, SpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Store traces for local visualization
export const traces: any[] = [];

// Clear traces function for proper isolation
export function clearTraces() {
  traces.length = 0;
}

// Custom trace collector for demo visualization
class TraceCollector implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    spans.forEach(span => {
      // Show only business-critical spans (authentic OpenTelemetry data)
      const httpMethod = span.attributes?.['http.method'];
      const spanName = span.name || '';
      const component = span.attributes?.['component'];
      
      // Skip GET requests - they're UI polling noise
      if (httpMethod === 'GET') {
        return;
      }
      
      // Only show business operations: POST/DELETE requests, Kong Gateway, AMQP operations
      const isBusinessSpan = httpMethod === 'POST' || httpMethod === 'DELETE' || 
                            component === 'kong-gateway' || 
                            spanName.includes('kong') || 
                            spanName.includes('amqp') || 
                            spanName.includes('rabbitmq') ||
                            span.attributes?.['messaging.system'] === 'rabbitmq' ||
                            span.attributes?.['http.url']?.toString().includes(':8000') || // Kong Gateway requests
                            span.kind === 3 || // Client spans (outgoing requests)
                            span.kind === 4;   // Producer spans (message publishing)
      
      if (!isBusinessSpan) {
        return;
      }
      
      // Debug logging to see what spans are being captured
      const operation = span.attributes?.['messaging.operation'] || httpMethod || spanName;
      console.log(`[OTEL] Capturing span: ${spanName} | Operation: ${operation} | TraceID: ${span.spanContext().traceId} | Service: ${span.attributes?.['service.name']}`);
      
      // Show attributes for debugging span capture
      if (span.attributes?.['messaging.system'] || spanName.includes('amqp') || spanName.includes('rabbitmq')) {
        console.log(`[OTEL] RabbitMQ span captured:`, {
          name: span.name,
          messaging: {
            system: span.attributes?.['messaging.system'],
            operation: span.attributes?.['messaging.operation'],
            destination: span.attributes?.['messaging.destination']
          }
        });
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
      
      // Only add if this span doesn't already exist to prevent duplicates
      const existingSpan = traces.find(t => t.traceId === traceData.traceId && t.spanId === traceData.spanId);
      if (!existingSpan) {
        traces.push(traceData);
        console.log(`[OTEL] Stored span in traces array. Total traces: ${traces.length}`);
        console.log(`[OTEL] All traces now:`, traces.map(t => ({ name: t.name, traceId: t.traceId.slice(0, 8) })));
      }
      
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

// Configure Tempo OTLP exporter
const tempoExporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
  headers: {},
});

// Initialize OpenTelemetry SDK with multiple exporters
const sdk = new NodeSDK({
  serviceName: 'payment-api',
  spanProcessors: [
    new SimpleSpanProcessor(traceCollector),     // For local UI
    new BatchSpanProcessor(tempoExporter)        // For Grafana Tempo
  ],
  instrumentations: [getNodeAutoInstrumentations({
    // Disable fs instrumentation to reduce noise
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
    // Enable AMQP instrumentation for RabbitMQ spans
    '@opentelemetry/instrumentation-amqplib': {
      enabled: true,
    },
    // Enable HTTP instrumentation for Kong proxy spans
    '@opentelemetry/instrumentation-http': {
      enabled: true,
    },
  })],
});

// Start the SDK
sdk.start();

export { sdk };