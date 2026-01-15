import type {
    JaegerTrace,
    JaegerSpan,
    Anomaly,
    ServiceHealth,
    SeverityLevel
} from './types';
import { SEVERITY_CONFIG } from './types';
import { traceProfiler } from './trace-profiler';

const JAEGER_API_URL = process.env.JAEGER_URL || 'http://localhost:16686';
const DETECTION_INTERVAL = 10000; // 10 seconds
const ANOMALY_WINDOW = 5 * 60 * 1000; // 5 minutes - keep anomalies for this long

// Default thresholds (used without adaptive baselines)
const DEFAULT_THRESHOLDS = {
    sev5: 1.3,   // ~80th percentile
    sev4: 1.65,  // ~90th percentile
    sev3: 2.0,   // ~95th percentile
    sev2: 2.6,   // ~99th percentile
    sev1: 3.3,   // ~99.9th percentile
};
const MIN_SAMPLES = 10;       // Need at least 10 samples for reliable baseline

export class AnomalyDetector {
    private anomalies: Map<string, Anomaly> = new Map();
    private detectionInterval: NodeJS.Timeout | null = null;
    private isRunning = false;
    private lastCheckedTraceIds: Set<string> = new Set();

    /**
     * Start the anomaly detection loop
     */
    start(): void {
        if (this.isRunning) return;

        console.log('[DETECTOR] Starting anomaly detector...');
        this.isRunning = true;

        // Schedule periodic detection
        this.detectionInterval = setInterval(() => {
            this.detectAnomalies();
        }, DETECTION_INTERVAL);
    }

    /**
     * Stop the detector
     */
    stop(): void {
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
        this.isRunning = false;
        console.log('[DETECTOR] Stopped');
    }

    /**
     * Get active anomalies (within the window)
     */
    getActiveAnomalies(): Anomaly[] {
        const now = Date.now();
        const active: Anomaly[] = [];

        const entries = Array.from(this.anomalies.entries());
        for (const [id, anomaly] of entries) {
            if (now - anomaly.timestamp.getTime() < ANOMALY_WINDOW) {
                active.push(anomaly);
            } else {
                // Clean up old anomalies
                this.anomalies.delete(id);
            }
        }

        return active.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    /**
     * Get all anomalies (for history)
     */
    getAllAnomalies(): Anomaly[] {
        return Array.from(this.anomalies.values());
    }

    /**
     * Get service health summary
     */
    getServiceHealth(): ServiceHealth[] {
        const baselines = traceProfiler.getBaselines();
        const activeAnomalies = this.getActiveAnomalies();

        // Group by service
        const serviceMap = new Map<string, ServiceHealth>();

        for (const baseline of baselines) {
            if (!serviceMap.has(baseline.service)) {
                serviceMap.set(baseline.service, {
                    name: baseline.service,
                    status: 'healthy',
                    avgDuration: 0,
                    spanCount: 0,
                    activeAnomalies: 0,
                    lastSeen: baseline.lastUpdated
                });
            }

            const health = serviceMap.get(baseline.service)!;
            health.avgDuration += baseline.mean;
            health.spanCount++;

            if (baseline.lastUpdated > health.lastSeen) {
                health.lastSeen = baseline.lastUpdated;
            }
        }

        // Calculate averages and check anomalies
        const healthEntries = Array.from(serviceMap.entries());
        for (const [name, health] of healthEntries) {
            if (health.spanCount > 0) {
                health.avgDuration = Math.round(health.avgDuration / health.spanCount * 100) / 100;
            }

            // Count active anomalies for this service
            health.activeAnomalies = activeAnomalies.filter(a => a.service === name).length;

            // Determine status (SEV 1-2 = critical, SEV 3-4 = warning)
            const criticalCount = activeAnomalies.filter(
                a => a.service === name && a.severity <= 2
            ).length;
            const warningCount = activeAnomalies.filter(
                a => a.service === name && a.severity >= 3 && a.severity <= 4
            ).length;

            if (criticalCount > 0) {
                health.status = 'critical';
            } else if (warningCount > 0) {
                health.status = 'warning';
            } else {
                health.status = 'healthy';
            }
        }

        return Array.from(serviceMap.values());
    }

    /**
     * Run anomaly detection on recent traces
     */
    private async detectAnomalies(): Promise<void> {
        try {
            // Fetch recent traces (last 1 minute)
            const traces = await this.fetchRecentTraces();
            let newAnomalies = 0;

            for (const trace of traces) {
                // Skip if we've already checked this trace
                if (this.lastCheckedTraceIds.has(trace.traceID)) continue;
                this.lastCheckedTraceIds.add(trace.traceID);

                // Check each span
                for (const span of trace.spans) {
                    const process = trace.processes[span.processID];
                    if (!process) continue;

                    const anomaly = this.checkSpan(span, process.serviceName, trace.traceID);
                    if (anomaly) {
                        this.anomalies.set(anomaly.id, anomaly);
                        newAnomalies++;

                        console.log(
                            `[DETECTOR] 🚨 SEV${anomaly.severity} ${anomaly.severityName}: ` +
                            `${anomaly.service}:${anomaly.operation} ` +
                            `${anomaly.duration.toFixed(0)}ms (${anomaly.deviation.toFixed(1)}σ)`
                        );
                    }
                }
            }

            // Limit checked trace IDs to prevent memory growth
            if (this.lastCheckedTraceIds.size > 1000) {
                const arr = Array.from(this.lastCheckedTraceIds);
                this.lastCheckedTraceIds = new Set(arr.slice(-500));
            }

            if (newAnomalies > 0) {
                console.log(`[DETECTOR] Found ${newAnomalies} new anomalies`);
            }
        } catch (error: any) {
            console.error('[DETECTOR] Error:', error.message);
        }
    }

    /**
     * Determine severity level based on deviation and thresholds
     */
    private getSeverity(deviation: number, thresholds = DEFAULT_THRESHOLDS): { level: SeverityLevel; name: string } | null {
        if (deviation >= thresholds.sev1) return { level: 1, name: SEVERITY_CONFIG[1].name };
        if (deviation >= thresholds.sev2) return { level: 2, name: SEVERITY_CONFIG[2].name };
        if (deviation >= thresholds.sev3) return { level: 3, name: SEVERITY_CONFIG[3].name };
        if (deviation >= thresholds.sev4) return { level: 4, name: SEVERITY_CONFIG[4].name };
        if (deviation >= thresholds.sev5) return { level: 5, name: SEVERITY_CONFIG[5].name };
        return null; // Not anomalous
    }

    /**
     * Check if a span is anomalous
     */
    private checkSpan(span: JaegerSpan, service: string, traceId: string): Anomaly | null {
        const baseline = traceProfiler.getBaseline(service, span.operationName);

        // Need baseline to detect anomalies
        if (!baseline || baseline.sampleCount < MIN_SAMPLES) {
            return null;
        }

        const durationMs = span.duration / 1000;

        // Skip if stdDev is too small (avoid division issues)
        if (baseline.stdDev < 1) {
            return null;
        }

        // Calculate deviation from mean
        const deviation = (durationMs - baseline.mean) / baseline.stdDev;

        // Only flag positive deviations (slower than normal)
        if (deviation < DEFAULT_THRESHOLDS.sev5) {
            return null;
        }

        // Determine severity
        const severityInfo = this.getSeverity(deviation);
        if (!severityInfo) {
            return null;
        }

        // Extract span attributes
        const attributes: Record<string, any> = {};
        for (const tag of span.tags) {
            attributes[tag.key] = tag.value;
        }

        // Get time context
        const timestamp = new Date(span.startTime / 1000);

        return {
            id: `${traceId}-${span.spanID}`,
            traceId,
            spanId: span.spanID,
            service,
            operation: span.operationName,
            duration: Math.round(durationMs * 100) / 100,
            expectedMean: baseline.mean,
            expectedStdDev: baseline.stdDev,
            deviation: Math.round(deviation * 100) / 100,
            severity: severityInfo.level,
            severityName: severityInfo.name,
            timestamp,
            attributes,
            dayOfWeek: timestamp.getDay(),
            hourOfDay: timestamp.getHours(),
        };
    }

    /**
     * Fetch recent traces from Jaeger
     */
    private async fetchRecentTraces(): Promise<JaegerTrace[]> {
        const traces: JaegerTrace[] = [];

        try {
            // Get recent traces from each service
            for (const service of ['crypto-wallet', 'exchange-api', 'order-matcher']) {
                const url = `${JAEGER_API_URL}/api/traces?service=${service}&lookback=1m&limit=20`;
                const response = await fetch(url);

                if (response.ok) {
                    const data = await response.json();
                    traces.push(...(data.data || []));
                }
            }
        } catch (error: any) {
            // Jaeger might not be available
            if (error.cause?.code !== 'ECONNREFUSED') {
                throw error;
            }
        }

        // Deduplicate by trace ID
        const seen = new Set<string>();
        return traces.filter(t => {
            if (seen.has(t.traceID)) return false;
            seen.add(t.traceID);
            return true;
        });
    }
}

// Singleton instance
export const anomalyDetector = new AnomalyDetector();
