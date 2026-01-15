/**
 * Baseline Calculator
 * 
 * Calculates time-aware baselines with adaptive thresholds.
 * Designed to run nightly or on manual trigger.
 */

import type {
    TimeBaseline,
    AdaptiveThresholds,
    JaegerTrace,
    JaegerSpan
} from './types';
import { historyStore } from './history-store';

const JAEGER_URL = process.env.JAEGER_URL || 'http://localhost:16686';
const MONITORED_SERVICES = ['crypto-wallet', 'api-gateway', 'exchange-api', 'order-matcher'];
const LOOKBACK_DAYS = 30;
const MIN_SAMPLES_FOR_THRESHOLD = 10;

// Default thresholds when not enough data
const DEFAULT_THRESHOLDS: AdaptiveThresholds = {
    sev5: 1.3,   // ~80th percentile of normal distribution
    sev4: 1.65,  // ~90th percentile
    sev3: 2.0,   // ~95th percentile
    sev2: 2.6,   // ~99th percentile
    sev1: 3.3,   // ~99.9th percentile
};

interface SpanData {
    service: string;
    operation: string;
    durationMs: number;
    dayOfWeek: number;
    hourOfDay: number;
    deviation?: number;
}

interface BucketStats {
    durations: number[];
    deviations: number[];
}

export class BaselineCalculator {
    private timeBaselines: Map<string, TimeBaseline> = new Map();
    private isCalculating = false;
    private lastCalculation: Date | null = null;

    /**
     * Get bucket key for time-aware lookup
     */
    private getBucketKey(spanKey: string, dayOfWeek: number, hourOfDay: number): string {
        return `${spanKey}:${dayOfWeek}:${hourOfDay}`;
    }

    /**
     * Fetch traces from Jaeger for the lookback period
     */
    private async fetchHistoricalTraces(service: string, days: number): Promise<JaegerTrace[]> {
        const endTime = Date.now() * 1000; // microseconds
        const startTime = endTime - (days * 24 * 60 * 60 * 1000 * 1000);
        const limit = 5000; // Max traces per service

        try {
            const url = `${JAEGER_URL}/api/traces?service=${service}&start=${startTime}&end=${endTime}&limit=${limit}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.warn(`[CALCULATOR] Failed to fetch traces for ${service}: ${response.status}`);
                return [];
            }

            const data = await response.json();
            return data.data || [];
        } catch (error: any) {
            console.error(`[CALCULATOR] Error fetching traces for ${service}:`, error.message);
            return [];
        }
    }

    /**
     * Extract span data with time context
     */
    private extractSpanData(traces: JaegerTrace[]): SpanData[] {
        const spans: SpanData[] = [];

        for (const trace of traces) {
            for (const span of trace.spans) {
                const process = trace.processes[span.processID];
                if (!process) continue;

                const timestampMs = span.startTime / 1000;
                const date = new Date(timestampMs);

                spans.push({
                    service: process.serviceName,
                    operation: span.operationName,
                    durationMs: span.duration / 1000,
                    dayOfWeek: date.getDay(),
                    hourOfDay: date.getHours(),
                });
            }
        }

        return spans;
    }

    /**
     * Group spans into time buckets
     */
    private groupIntoBuckets(spans: SpanData[]): Map<string, BucketStats> {
        const buckets = new Map<string, BucketStats>();

        // First pass: calculate mean per bucket
        const bucketSums = new Map<string, { sum: number; count: number }>();

        for (const span of spans) {
            const spanKey = `${span.service}:${span.operation}`;
            const bucketKey = this.getBucketKey(spanKey, span.dayOfWeek, span.hourOfDay);

            if (!bucketSums.has(bucketKey)) {
                bucketSums.set(bucketKey, { sum: 0, count: 0 });
            }
            const bucket = bucketSums.get(bucketKey)!;
            bucket.sum += span.durationMs;
            bucket.count++;
        }

        // Calculate means
        const bucketMeans = new Map<string, number>();
        for (const [key, stats] of Array.from(bucketSums.entries())) {
            bucketMeans.set(key, stats.sum / stats.count);
        }

        // Second pass: calculate stdDev and collect deviations
        const bucketVariances = new Map<string, { sumSq: number; count: number }>();

        for (const span of spans) {
            const spanKey = `${span.service}:${span.operation}`;
            const bucketKey = this.getBucketKey(spanKey, span.dayOfWeek, span.hourOfDay);
            const mean = bucketMeans.get(bucketKey) || 0;

            if (!bucketVariances.has(bucketKey)) {
                bucketVariances.set(bucketKey, { sumSq: 0, count: 0 });
            }
            const bucket = bucketVariances.get(bucketKey)!;
            bucket.sumSq += Math.pow(span.durationMs - mean, 2);
            bucket.count++;
        }

        // Calculate stdDevs
        const bucketStdDevs = new Map<string, number>();
        for (const [key, stats] of Array.from(bucketVariances.entries())) {
            const variance = stats.count > 1 ? stats.sumSq / (stats.count - 1) : 0;
            bucketStdDevs.set(key, Math.sqrt(variance));
        }

        // Third pass: collect deviations for threshold calculation
        for (const span of spans) {
            const spanKey = `${span.service}:${span.operation}`;
            const bucketKey = this.getBucketKey(spanKey, span.dayOfWeek, span.hourOfDay);
            const mean = bucketMeans.get(bucketKey) || 0;
            const stdDev = bucketStdDevs.get(bucketKey) || 1;

            if (!buckets.has(bucketKey)) {
                buckets.set(bucketKey, { durations: [], deviations: [] });
            }
            const bucket = buckets.get(bucketKey)!;
            bucket.durations.push(span.durationMs);

            // Calculate deviation (σ from mean)
            const deviation = stdDev > 0 ? (span.durationMs - mean) / stdDev : 0;
            bucket.deviations.push(deviation);
        }

        return buckets;
    }

    /**
     * Calculate percentile from sorted array
     */
    private percentile(sorted: number[], p: number): number {
        if (sorted.length === 0) return 0;
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
    }

    /**
     * Calculate adaptive thresholds from deviations
     */
    private calculateThresholds(deviations: number[]): AdaptiveThresholds {
        if (deviations.length < MIN_SAMPLES_FOR_THRESHOLD) {
            return { ...DEFAULT_THRESHOLDS };
        }

        // Sort deviations (only positive - we care about slow, not fast)
        const positiveDeviations = deviations.filter(d => d > 0).sort((a, b) => a - b);

        if (positiveDeviations.length < MIN_SAMPLES_FOR_THRESHOLD) {
            return { ...DEFAULT_THRESHOLDS };
        }

        return {
            sev5: Math.max(0.5, this.percentile(positiveDeviations, 80)),
            sev4: Math.max(1.0, this.percentile(positiveDeviations, 90)),
            sev3: Math.max(1.5, this.percentile(positiveDeviations, 95)),
            sev2: Math.max(2.0, this.percentile(positiveDeviations, 99)),
            sev1: Math.max(2.5, this.percentile(positiveDeviations, 99.9)),
        };
    }

    /**
     * Run the baseline calculation
     */
    async recalculate(): Promise<{
        success: boolean;
        baselinesCount: number;
        duration: number;
        message: string;
    }> {
        if (this.isCalculating) {
            return {
                success: false,
                baselinesCount: 0,
                duration: 0,
                message: 'Calculation already in progress'
            };
        }

        this.isCalculating = true;
        const startTime = Date.now();
        console.log(`[CALCULATOR] Starting baseline recalculation (${LOOKBACK_DAYS} days)...`);

        try {
            // Collect all spans from all services
            const allSpans: SpanData[] = [];

            for (const service of MONITORED_SERVICES) {
                console.log(`[CALCULATOR] Fetching traces for ${service}...`);
                const traces = await this.fetchHistoricalTraces(service, LOOKBACK_DAYS);
                const spans = this.extractSpanData(traces);
                allSpans.push(...spans);
                console.log(`[CALCULATOR] ${service}: ${traces.length} traces, ${spans.length} spans`);
            }

            if (allSpans.length === 0) {
                return {
                    success: false,
                    baselinesCount: 0,
                    duration: Date.now() - startTime,
                    message: 'No trace data available'
                };
            }

            // Group into buckets
            console.log(`[CALCULATOR] Processing ${allSpans.length} total spans...`);
            const buckets = this.groupIntoBuckets(allSpans);

            // Calculate baselines for each bucket
            const newBaselines = new Map<string, TimeBaseline>();

            for (const [bucketKey, stats] of Array.from(buckets.entries())) {
                // Parse bucket key: "service:operation:day:hour"
                const parts = bucketKey.split(':');
                const hourOfDay = parseInt(parts.pop()!, 10);
                const dayOfWeek = parseInt(parts.pop()!, 10);
                const operation = parts.pop()!;
                const service = parts.join(':'); // Handle services with colons

                const spanKey = `${service}:${operation}`;

                // Calculate stats
                const durations = stats.durations;
                const sum = durations.reduce((a, b) => a + b, 0);
                const mean = sum / durations.length;

                const variance = durations.length > 1
                    ? durations.reduce((acc, d) => acc + Math.pow(d - mean, 2), 0) / (durations.length - 1)
                    : 0;
                const stdDev = Math.sqrt(variance);

                // Calculate adaptive thresholds
                const thresholds = this.calculateThresholds(stats.deviations);

                const baseline: TimeBaseline = {
                    spanKey,
                    service,
                    operation,
                    dayOfWeek,
                    hourOfDay,
                    mean: Math.round(mean * 100) / 100,
                    stdDev: Math.round(stdDev * 100) / 100,
                    sampleCount: durations.length,
                    thresholds,
                    lastUpdated: new Date(),
                };

                newBaselines.set(bucketKey, baseline);
            }

            // Update storage
            this.timeBaselines = newBaselines;
            this.lastCalculation = new Date();

            // Persist to history store
            historyStore.setTimeBaselines(Array.from(newBaselines.values()));

            const duration = Date.now() - startTime;
            console.log(`[CALCULATOR] ✅ Calculated ${newBaselines.size} time-aware baselines in ${duration}ms`);

            return {
                success: true,
                baselinesCount: newBaselines.size,
                duration,
                message: `Calculated ${newBaselines.size} baselines from ${allSpans.length} spans`
            };

        } catch (error: any) {
            console.error('[CALCULATOR] Recalculation failed:', error.message);
            return {
                success: false,
                baselinesCount: 0,
                duration: Date.now() - startTime,
                message: error.message
            };
        } finally {
            this.isCalculating = false;
        }
    }

    /**
     * Get baseline for specific time bucket
     */
    getBaseline(spanKey: string, dayOfWeek: number, hourOfDay: number): TimeBaseline | null {
        const bucketKey = this.getBucketKey(spanKey, dayOfWeek, hourOfDay);
        return this.timeBaselines.get(bucketKey) || null;
    }

    /**
     * Get baseline with fallback logic:
     * 1. Specific bucket (day + hour)
     * 2. Any day, same hour
     * 3. Same day, any hour
     * 4. Global (any day, any hour)
     */
    getBaselineWithFallback(spanKey: string, dayOfWeek: number, hourOfDay: number): TimeBaseline | null {
        // Try specific bucket first
        let baseline = this.getBaseline(spanKey, dayOfWeek, hourOfDay);
        if (baseline && baseline.sampleCount >= MIN_SAMPLES_FOR_THRESHOLD) {
            return baseline;
        }

        // Fallback: same hour, any day
        for (let d = 0; d < 7; d++) {
            baseline = this.getBaseline(spanKey, d, hourOfDay);
            if (baseline && baseline.sampleCount >= MIN_SAMPLES_FOR_THRESHOLD) {
                return baseline;
            }
        }

        // Fallback: same day, any hour
        for (let h = 0; h < 24; h++) {
            baseline = this.getBaseline(spanKey, dayOfWeek, h);
            if (baseline && baseline.sampleCount >= MIN_SAMPLES_FOR_THRESHOLD) {
                return baseline;
            }
        }

        // Fallback: any bucket for this span
        for (const b of Array.from(this.timeBaselines.values())) {
            if (b.spanKey === spanKey && b.sampleCount >= MIN_SAMPLES_FOR_THRESHOLD) {
                return b;
            }
        }

        return null;
    }

    /**
     * Get all time baselines
     */
    getAllBaselines(): TimeBaseline[] {
        return Array.from(this.timeBaselines.values());
    }

    /**
     * Get calculation status
     */
    getStatus(): {
        isCalculating: boolean;
        lastCalculation: Date | null;
        baselineCount: number;
    } {
        return {
            isCalculating: this.isCalculating,
            lastCalculation: this.lastCalculation,
            baselineCount: this.timeBaselines.size,
        };
    }

    /**
     * Load baselines from storage
     */
    loadFromStorage(): void {
        const baselines = historyStore.getTimeBaselines();
        if (baselines && baselines.length > 0) {
            this.timeBaselines.clear();
            for (const b of baselines) {
                const key = this.getBucketKey(b.spanKey, b.dayOfWeek, b.hourOfDay);
                this.timeBaselines.set(key, b);
            }
            console.log(`[CALCULATOR] Loaded ${this.timeBaselines.size} time baselines from storage`);
        }
    }
}

// Singleton instance
export const baselineCalculator = new BaselineCalculator();
