// Browser OpenTelemetry SDK Initialization
// Creates spans for fetch() requests and exports to OTEL collector

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// Flag to control whether browser OTEL is active
let otelEnabled = false;
let provider: WebTracerProvider | null = null;

export function initBrowserOtel(): void {
    if (provider) {
        console.log('[OTEL] Browser instrumentation already initialized');
        return;
    }

    console.log('[OTEL] Initializing browser OpenTelemetry...');

    // Create resource with service name using OTEL v2 API
    const resource = resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: 'react-client',
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'web',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    });

    // Configure OTLP exporter to send traces to the OTEL collector (with CORS)
    const exporter = new OTLPTraceExporter({
        url: 'http://localhost:4319/v1/traces',
        headers: {},
    });

    // Create the tracer provider with resource and span processors (OTEL v2 API)
    provider = new WebTracerProvider({
        resource,
        spanProcessors: [new SimpleSpanProcessor(exporter)],
    });

    // Register the provider with zone context manager
    provider.register({
        contextManager: new ZoneContextManager(),
    });

    // Register fetch instrumentation
    registerInstrumentations({
        instrumentations: [
            new FetchInstrumentation({
                // Only instrument API calls, not static assets
                ignoreUrls: [
                    /\/assets\//,
                    /\.(js|css|png|jpg|svg|ico|woff|woff2)$/,
                    /localhost:16686/,  // Don't trace Jaeger UI requests
                    /localhost:3000/,   // Don't trace Grafana
                    /localhost:4319/,   // Don't trace OTEL collector
                ],
                // Propagate trace context to all origins
                propagateTraceHeaderCorsUrls: [
                    /localhost:8000/,   // Kong Gateway
                    /localhost:5000/,   // Payment API
                ],
                // Add useful attributes to spans
                applyCustomAttributesOnSpan: (span, request, _result) => {
                    span.setAttribute('http.url', request.url || '');
                },
            }),
        ],
    });

    otelEnabled = true;
    console.log('[OTEL] Browser instrumentation initialized - service.name: react-client');
}

export function isOtelEnabled(): boolean {
    return otelEnabled;
}

export function getTracer() {
    if (!provider) {
        throw new Error('OTEL not initialized - call initBrowserOtel() first');
    }
    return provider.getTracer('react-client');
}
