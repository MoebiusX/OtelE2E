/**
 * History Store Tests
 * 
 * Tests for the monitor history persistence store.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpanBaseline, Anomaly, AnalysisResponse } from '../../server/monitor/types';

// Mock fs and path before importing
vi.mock('fs', () => ({
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({
        baselines: [],
        anomalies: [],
        analyses: [],
        timeBaselines: [],
        lastUpdated: new Date().toISOString()
    })),
    writeFileSync: vi.fn(),
}));

vi.mock('path', () => ({
    join: vi.fn((...args) => args.join('/')),
}));

vi.mock('../../server/lib/logger', () => ({
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }))
}));

import { HistoryStore } from '../../server/monitor/history-store';

describe('HistoryStore', () => {
    let store: HistoryStore;

    beforeEach(() => {
        vi.clearAllMocks();
        store = new HistoryStore();
    });

    afterEach(() => {
        store.stop();
    });

    // ============================================
    // Initialization
    // ============================================
    describe('Initialization', () => {
        it('should create store instance', () => {
            expect(store).toBeDefined();
        });

        it('should start auto-save interval', () => {
            store.start();
            // Should not throw
            expect(store).toBeDefined();
        });

        it('should stop and save on stop()', () => {
            store.start();
            store.stop();
            // Should not throw
            expect(store).toBeDefined();
        });
    });

    // ============================================
    // Baseline Operations
    // ============================================
    describe('Baseline Operations', () => {
        it('should update baselines', () => {
            const baselines: SpanBaseline[] = [
                {
                    service: 'kx-wallet',
                    operation: 'transfer',
                    spanKey: 'kx-wallet:transfer',
                    mean: 100,
                    stdDev: 20,
                    variance: 400,
                    p50: 95,
                    p95: 140,
                    p99: 180,
                    min: 50,
                    max: 200,
                    sampleCount: 1000,
                    lastUpdated: new Date()
                }
            ];

            store.updateBaselines(baselines);
            
            const retrieved = store.getBaselines();
            expect(retrieved).toHaveLength(1);
            expect(retrieved[0].service).toBe('kx-wallet');
        });

        it('should get baselines', () => {
            const baselines = store.getBaselines();
            expect(Array.isArray(baselines)).toBe(true);
        });
    });

    // ============================================
    // Anomaly Operations
    // ============================================
    describe('Anomaly Operations', () => {
        const createAnomaly = (id: string, service: string, severity: 1 | 2 | 3 | 4 | 5 = 3): Anomaly => ({
            id,
            traceId: `trace-${id}`,
            spanId: `span-${id}`,
            service,
            operation: 'test-op',
            duration: 500,
            expectedMean: 100,
            expectedStdDev: 30,
            deviation: 13.3,
            severity,
            severityName: 'Moderate',
            timestamp: new Date(),
            attributes: {}
        });

        it('should add anomaly', () => {
            const anomaly = createAnomaly('a1', 'kx-wallet');
            store.addAnomaly(anomaly);

            const history = store.getAnomalyHistory();
            expect(history.some(a => a.id === 'a1')).toBe(true);
        });

        it('should not add duplicate anomaly', () => {
            const anomaly = createAnomaly('dup-1', 'kx-wallet');
            store.addAnomaly(anomaly);
            store.addAnomaly(anomaly);

            const history = store.getAnomalyHistory();
            const duplicates = history.filter(a => a.id === 'dup-1');
            expect(duplicates.length).toBe(1);
        });

        it('should filter anomalies by hours', () => {
            const recentAnomaly = createAnomaly('recent', 'kx-wallet');
            store.addAnomaly(recentAnomaly);

            const history = store.getAnomalyHistory({ hours: 1 });
            expect(history.some(a => a.id === 'recent')).toBe(true);
        });

        it('should filter anomalies by service', () => {
            store.addAnomaly(createAnomaly('wallet-1', 'kx-wallet'));
            store.addAnomaly(createAnomaly('exchange-1', 'kx-exchange'));

            const walletHistory = store.getAnomalyHistory({ service: 'kx-wallet' });
            expect(walletHistory.every(a => a.service === 'kx-wallet')).toBe(true);
        });

        it('should limit anomaly results', () => {
            for (let i = 0; i < 10; i++) {
                store.addAnomaly(createAnomaly(`limit-${i}`, 'kx-wallet'));
            }

            const limited = store.getAnomalyHistory({ limit: 5 });
            expect(limited.length).toBeLessThanOrEqual(5);
        });

        it('should sort anomalies by timestamp descending', () => {
            const older = createAnomaly('older', 'kx-wallet');
            older.timestamp = new Date(Date.now() - 60000);
            
            const newer = createAnomaly('newer', 'kx-wallet');
            newer.timestamp = new Date();

            store.addAnomaly(older);
            store.addAnomaly(newer);

            const history = store.getAnomalyHistory();
            if (history.length >= 2) {
                const newerIdx = history.findIndex(a => a.id === 'newer');
                const olderIdx = history.findIndex(a => a.id === 'older');
                expect(newerIdx).toBeLessThan(olderIdx);
            }
        });
    });

    // ============================================
    // Analysis Operations
    // ============================================
    describe('Analysis Operations', () => {
        it('should add analysis', () => {
            const analysis: AnalysisResponse = {
                traceId: 'trace-1',
                anomalyId: 'anomaly-1',
                summary: 'Test analysis',
                rootCause: 'Database connection timeout',
                recommendations: ['Check connection pool', 'Review query performance'],
                confidence: 0.85,
                model: 'llama3.2:1b',
                processingTimeMs: 1500,
                timestamp: new Date()
            };

            store.addAnalysis(analysis);

            const cached = store.getAnalysis('trace-1');
            expect(cached?.summary).toBe('Test analysis');
        });

        it('should return undefined for non-existent analysis', () => {
            const result = store.getAnalysis('nonexistent');
            expect(result).toBeUndefined();
        });
    });

    // ============================================
    // Hourly Trend
    // ============================================
    describe('Hourly Trend', () => {
        it('should return hourly trend data', () => {
            const trend = store.getHourlyTrend(24);

            expect(Array.isArray(trend)).toBe(true);
        });

        it('should include count and critical fields', () => {
            // Add some anomalies first
            store.addAnomaly({
                id: 'trend-1',
                traceId: 'trace-1',
                spanId: 'span-1',
                service: 'kx-wallet',
                operation: 'test',
                duration: 500,
                expectedMean: 100,
                expectedStdDev: 30,
                deviation: 5,
                severity: 1,
                severityName: 'Critical',
                timestamp: new Date(),
                attributes: {}
            });

            const trend = store.getHourlyTrend(1);

            if (trend.length > 0) {
                expect(trend[0]).toHaveProperty('hour');
                expect(trend[0]).toHaveProperty('count');
                expect(trend[0]).toHaveProperty('critical');
            }
        });
    });

    // ============================================
    // Time Baselines
    // ============================================
    describe('Time Baselines', () => {
        it('should update time baselines', () => {
            const timeBaselines = [
                {
                    spanKey: 'kx-wallet:transfer',
                    service: 'kx-wallet',
                    operation: 'transfer',
                    dayOfWeek: 1,
                    hourOfDay: 10,
                    mean: 100,
                    stdDev: 20,
                    sampleCount: 500,
                    thresholds: {
                        sev5: 1.3,
                        sev4: 1.65,
                        sev3: 2.0,
                        sev2: 2.6,
                        sev1: 3.3
                    },
                    lastUpdated: new Date()
                }
            ];

            store.setTimeBaselines(timeBaselines);

            const retrieved = store.getTimeBaselines();
            expect(retrieved).toHaveLength(1);
        });

        it('should get time baselines', () => {
            // First set some baselines
            const timeBaselines = [
                {
                    spanKey: 'test:op',
                    service: 'test',
                    operation: 'op',
                    dayOfWeek: 1,
                    hourOfDay: 10,
                    mean: 100,
                    stdDev: 20,
                    sampleCount: 500,
                    thresholds: { sev5: 1.3, sev4: 1.65, sev3: 2.0, sev2: 2.6, sev1: 3.3 },
                    lastUpdated: new Date()
                }
            ];
            store.setTimeBaselines(timeBaselines);
            
            const baselines = store.getTimeBaselines();
            expect(Array.isArray(baselines)).toBe(true);
        });
    });
});
