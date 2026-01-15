/**
 * Trace Profiler
 * 
 * Polls Jaeger API for traces and calculates baseline statistics
 * for each span type (service:operation).
 */

import type {
    JaegerTrace,
    JaegerSpan,
    SpanBaseline
} from './types';

const JAEGER_API_URL = process.env.JAEGER_URL || 'http://localhost:16686';
const POLL_INTERVAL = 30000; // 30 seconds
const LOOKBACK_WINDOW = '1h'; // 1 hour of historical data

// Services to monitor
const MONITORED_SERVICES = [
    'crypto-wallet',
    'api-gateway',
    'exchange-api',
    'order-matcher'
];

export class TraceProfiler {
    private baselines: Map<string, SpanBaseline> = new Map();
    private pollInterval: NodeJS.Timeout | null = null;
    private isRunning = false;

    /**
     * Start the profiler polling loop
     */
    start(): void {
        if (this.isRunning) return;

        console.log('[PROFILER] Starting trace profiler...');
        this.isRunning = true;

        // Initial collection
        this.collectAndUpdate();

        // Schedule periodic updates
        this.pollInterval = setInterval(() => {
            this.collectAndUpdate();
        }, POLL_INTERVAL);
    }

    /**
     * Stop the profiler
     */
    stop(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.isRunning = false;
        console.log('[PROFILER] Stopped');
    }

    /**
     * Get current baselines
     */
    getBaselines(): SpanBaseline[] {
        return Array.from(this.baselines.values());
    }

    /**
     * Get baseline for specific span
     */
    getBaseline(service: string, operation: string): SpanBaseline | undefined {
        return this.baselines.get(`${service}:${operation}`);
    }

    /**
     * Collect traces and update baselines
     */
    private async collectAndUpdate(): Promise<void> {
        try {
            const allSpans: Array<{ span: JaegerSpan; service: string }> = [];

            // Collect traces from all monitored services
            for (const service of MONITORED_SERVICES) {
                const traces = await this.fetchTraces(service);

                for (const trace of traces) {
                    for (const span of trace.spans) {
                        const process = trace.processes[span.processID];
                        if (process) {
                            allSpans.push({
                                span,
                                service: process.serviceName
                            });
                        }
                    }
                }
            }

            // Update baselines
            this.updateBaselines(allSpans);

            console.log(`[PROFILER] Updated ${this.baselines.size} baselines from ${allSpans.length} spans`);
        } catch (error: any) {
            console.error('[PROFILER] Error collecting traces:', error.message);
        }
    }

    /**
     * Fetch traces from Jaeger API for a service
     */
    private async fetchTraces(service: string): Promise<JaegerTrace[]> {
        try {
            const url = `${JAEGER_API_URL}/api/traces?service=${service}&lookback=${LOOKBACK_WINDOW}&limit=100`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Jaeger API returned ${response.status}`);
            }

            const data = await response.json();
            return data.data || [];
        } catch (error: any) {
            // Jaeger might not be ready on startup
            if (error.cause?.code === 'ECONNREFUSED') {
                console.log(`[PROFILER] Jaeger not ready for ${service}`);
                return [];
            }
            throw error;
        }
    }

    /**
     * Update baselines using Welford's online algorithm
     * This allows incremental updates without storing all values
     */
    private updateBaselines(spans: Array<{ span: JaegerSpan; service: string }>): void {
        // Group spans by service:operation
        const spanGroups = new Map<string, number[]>();

        for (const { span, service } of spans) {
            const key = `${service}:${span.operationName}`;
            const durationMs = span.duration / 1000; // Convert μs to ms

            if (!spanGroups.has(key)) {
                spanGroups.set(key, []);
            }
            spanGroups.get(key)!.push(durationMs);
        }

        // Calculate statistics for each span type
        for (const [key, durations] of spanGroups) {
            const [service, operation] = key.split(':');

            // Sort for percentiles
            durations.sort((a, b) => a - b);

            const n = durations.length;
            const mean = durations.reduce((a, b) => a + b, 0) / n;
            const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / n;
            const stdDev = Math.sqrt(variance);

            const baseline: SpanBaseline = {
                service,
                operation,
                spanKey: key,
                mean: Math.round(mean * 100) / 100,
                stdDev: Math.round(stdDev * 100) / 100,
                variance: Math.round(variance * 100) / 100,
                p50: durations[Math.floor(n * 0.5)] || 0,
                p95: durations[Math.floor(n * 0.95)] || 0,
                p99: durations[Math.floor(n * 0.99)] || 0,
                min: durations[0] || 0,
                max: durations[n - 1] || 0,
                sampleCount: n,
                lastUpdated: new Date()
            };

            this.baselines.set(key, baseline);
        }
    }
}

// Singleton instance
export const traceProfiler = new TraceProfiler();
