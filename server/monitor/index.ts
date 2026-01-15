/**
 * Monitor Module - Index
 * 
 * Exports all monitor services and starts background processes.
 */

export { traceProfiler } from './trace-profiler';
export { anomalyDetector } from './anomaly-detector';
export { historyStore } from './history-store';
export { analysisService } from './analysis-service';
export { default as monitorRoutes } from './routes';
export * from './types';

import { traceProfiler } from './trace-profiler';
import { anomalyDetector } from './anomaly-detector';
import { historyStore } from './history-store';

/**
 * Start all monitor services
 */
export function startMonitor(): void {
    console.log('[MONITOR] Starting trace monitoring services...');

    // Start history store (for auto-save)
    historyStore.start();

    // Start trace profiler (polls Jaeger every 30s)
    traceProfiler.start();

    // Start anomaly detector (checks every 10s)
    // Delay start to allow baselines to populate
    setTimeout(() => {
        anomalyDetector.start();
    }, 35000); // Start after first baseline collection

    console.log('[MONITOR] ✅ Monitor services started');
}

/**
 * Stop all monitor services
 */
export function stopMonitor(): void {
    console.log('[MONITOR] Stopping trace monitoring services...');

    anomalyDetector.stop();
    traceProfiler.stop();
    historyStore.stop();

    console.log('[MONITOR] Stopped');
}
