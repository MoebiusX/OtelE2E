/**
 * History Store
 * 
 * Persists baselines, anomalies, and analyses to JSON file
 * for trend analysis and recovery after restart.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
    SpanBaseline,
    Anomaly,
    AnalysisResponse,
    MonitorHistory,
    TimeBaseline
} from './types';
import { createLogger } from '../lib/logger';

const logger = createLogger('history-store');

const DATA_DIR = path.join(process.cwd(), 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'monitor-history.json');
const TIME_BASELINES_FILE = path.join(DATA_DIR, 'time-baselines.json');
const MAX_ANOMALIES = 1000; // Keep last 1000 anomalies
const SAVE_INTERVAL = 60000; // Save every minute

interface ExtendedHistory extends MonitorHistory {
    timeBaselines?: TimeBaseline[];
}

export class HistoryStore {
    private history: ExtendedHistory = {
        baselines: [],
        anomalies: [],
        analyses: [],
        timeBaselines: [],
        lastUpdated: new Date()
    };
    private saveInterval: NodeJS.Timeout | null = null;
    private dirty = false;

    constructor() {
        this.ensureDataDir();
        this.load();
    }

    /**
     * Start auto-save interval
     */
    start(): void {
        this.saveInterval = setInterval(() => {
            if (this.dirty) {
                this.save();
            }
        }, SAVE_INTERVAL);
        logger.info('History store started');
    }

    /**
     * Stop and save
     */
    stop(): void {
        if (this.saveInterval) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }
        this.save();
        logger.info('History store stopped');
    }

    /**
     * Update baselines
     */
    updateBaselines(baselines: SpanBaseline[]): void {
        this.history.baselines = baselines;
        this.history.lastUpdated = new Date();
        this.dirty = true;
    }

    /**
     * Add anomaly
     */
    addAnomaly(anomaly: Anomaly): void {
        // Check for duplicate
        if (this.history.anomalies.some(a => a.id === anomaly.id)) {
            return;
        }

        this.history.anomalies.push(anomaly);

        // Trim to max size
        if (this.history.anomalies.length > MAX_ANOMALIES) {
            this.history.anomalies = this.history.anomalies.slice(-MAX_ANOMALIES);
        }

        this.dirty = true;
    }

    /**
     * Add analysis
     */
    addAnalysis(analysis: AnalysisResponse): void {
        this.history.analyses.push(analysis);

        // Keep last 100 analyses
        if (this.history.analyses.length > 100) {
            this.history.analyses = this.history.analyses.slice(-100);
        }

        this.dirty = true;
    }

    /**
     * Get anomaly history with optional filtering
     */
    getAnomalyHistory(options: {
        hours?: number;
        service?: string;
        limit?: number;
    } = {}): Anomaly[] {
        let anomalies = [...this.history.anomalies];

        // Filter by time
        if (options.hours) {
            const since = Date.now() - options.hours * 60 * 60 * 1000;
            anomalies = anomalies.filter(a => new Date(a.timestamp).getTime() > since);
        }

        // Filter by service
        if (options.service) {
            anomalies = anomalies.filter(a => a.service === options.service);
        }

        // Sort by timestamp descending
        anomalies.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        // Limit
        if (options.limit) {
            anomalies = anomalies.slice(0, options.limit);
        }

        return anomalies;
    }

    /**
     * Get hourly anomaly counts for trend chart
     */
    getHourlyTrend(hours: number = 24): Array<{ hour: string; count: number; critical: number }> {
        const buckets = new Map<string, { count: number; critical: number }>();

        // Initialize hourly buckets
        const now = new Date();
        for (let i = 0; i < hours; i++) {
            const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
            const key = hour.toISOString().slice(0, 13); // "2026-01-15T08"
            buckets.set(key, { count: 0, critical: 0 });
        }

        // Count anomalies per hour
        for (const anomaly of this.history.anomalies) {
            const hour = new Date(anomaly.timestamp).toISOString().slice(0, 13);
            if (buckets.has(hour)) {
                const bucket = buckets.get(hour)!;
                bucket.count++;
                // SEV 1-2 are considered critical
                if (anomaly.severity <= 2) {
                    bucket.critical++;
                }
            }
        }

        // Convert to array
        return Array.from(buckets.entries())
            .map(([hour, data]) => ({
                hour: hour.slice(11) + ':00', // "08:00"
                count: data.count,
                critical: data.critical
            }))
            .reverse();
    }

    /**
     * Get stored baselines
     */
    getBaselines(): SpanBaseline[] {
        return this.history.baselines;
    }

    /**
     * Get analysis for trace
     */
    getAnalysis(traceId: string): AnalysisResponse | undefined {
        return this.history.analyses.find(a => a.traceId === traceId);
    }

    /**
     * Set time baselines (from calculator)
     */
    setTimeBaselines(baselines: TimeBaseline[]): void {
        this.history.timeBaselines = baselines;
        this.dirty = true;
        this.saveTimeBaselines();
    }

    /**
     * Get time baselines
     */
    getTimeBaselines(): TimeBaseline[] {
        return this.history.timeBaselines || [];
    }

    /**
     * Ensure data directory exists
     */
    private ensureDataDir(): void {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    /**
     * Load history from file
     */
    private load(): void {
        try {
            if (fs.existsSync(HISTORY_FILE)) {
                const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
                this.history = JSON.parse(data);
                logger.info({ anomaliesCount: this.history.anomalies.length, baselinesCount: this.history.baselines.length }, 'Loaded history from file');
            }
            // Also load time baselines
            if (fs.existsSync(TIME_BASELINES_FILE)) {
                const data = fs.readFileSync(TIME_BASELINES_FILE, 'utf-8');
                this.history.timeBaselines = JSON.parse(data);
                logger.info({ timeBaselinesCount: this.history.timeBaselines?.length || 0 }, 'Loaded time baselines from file');
            }
        } catch (error: any) {
            logger.warn({ err: error }, 'Could not load history from file');
        }
    }

    /**
     * Save history to file
     */
    private save(): void {
        try {
            const data = JSON.stringify(this.history, null, 2);
            fs.writeFileSync(HISTORY_FILE, data, 'utf-8');
            this.dirty = false;
            logger.info({ anomaliesCount: this.history.anomalies.length }, 'Saved history to file');
        } catch (error: any) {
            logger.error({ err: error }, 'Could not save history to file');
        }
    }

    /**
     * Save time baselines to separate file (they can be large)
     */
    private saveTimeBaselines(): void {
        try {
            if (this.history.timeBaselines && this.history.timeBaselines.length > 0) {
                const data = JSON.stringify(this.history.timeBaselines, null, 2);
                fs.writeFileSync(TIME_BASELINES_FILE, data, 'utf-8');
                logger.info({ timeBaselinesCount: this.history.timeBaselines.length }, 'Saved time baselines to file');
            }
        } catch (error: any) {
            logger.error({ err: error }, 'Could not save time baselines to file');
        }
    }
}

// Singleton instance
export const historyStore = new HistoryStore();

