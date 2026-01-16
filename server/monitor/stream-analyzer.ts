/**
 * Stream Analyzer
 * 
 * Batches anomalies and streams LLM analysis in real-time.
 * Implements tiered detection with use-case specific prompts.
 */

import type { Anomaly } from './types';
import { wsServer } from './ws-server';
import { metricsCorrelator } from './metrics-correlator';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';

// Batch configuration
const BATCH_SIZE = 10;           // Max anomalies per batch
const BATCH_TIMEOUT_MS = 30000;  // 30 seconds - wait before processing batch

// Use case detection patterns
interface UseCase {
    id: string;
    name: string;
    priority: 'P0' | 'P1' | 'P2';
    match: (anomaly: Anomaly) => boolean;
    promptTemplate: string;
}

const USE_CASES: UseCase[] = [
    {
        id: 'payment-gateway-down',
        name: 'Payment Gateway Down',
        priority: 'P0',
        match: (a) =>
            a.service.includes('payment') &&
            (a.attributes?.['http.status_code'] >= 500 ||
                a.attributes?.['error'] === true),
        promptTemplate: 'Payment gateway failure detected. Check provider status, failover options.'
    },
    {
        id: 'cert-expired',
        name: 'Certificate Expired',
        priority: 'P0',
        match: (a) =>
            String(a.attributes?.['error.message'] || '').toLowerCase().includes('cert') ||
            String(a.attributes?.['error.message'] || '').toLowerCase().includes('ssl'),
        promptTemplate: 'TLS/SSL certificate issue. Immediate action: check cert expiry, renew or contact provider.'
    },
    {
        id: 'dos-attack',
        name: 'DoS Attack',
        priority: 'P0',
        match: (a) =>
            a.service.includes('gateway') &&
            a.attributes?.['http.status_code'] === 429,
        promptTemplate: 'Rate limiting triggered. Possible DoS. Enable WAF, check traffic patterns.'
    },
    {
        id: 'auth-down',
        name: 'Auth Service Down',
        priority: 'P0',
        match: (a) =>
            a.service.includes('auth') &&
            a.attributes?.['http.status_code'] >= 500,
        promptTemplate: 'Auth service failure. CRITICAL: all user operations blocked.'
    },
    {
        id: 'cloud-degradation',
        name: 'Cloud Provider Issue',
        priority: 'P1',
        match: (a) =>
            a.deviation > 5 &&
            a.duration > a.expectedMean * 3,
        promptTemplate: 'Multi-service latency spike. Check cloud provider status page.'
    },
    {
        id: 'queue-backlog',
        name: 'Queue Backlog',
        priority: 'P1',
        match: (a) =>
            a.service.includes('matcher') || a.service.includes('order'),
        promptTemplate: 'Order processing delayed. Check queue depth, consumer health.'
    },
    {
        id: 'third-party-timeout',
        name: 'Third Party Timeout',
        priority: 'P1',
        match: (a) =>
            a.duration > 10000 &&
            (a.operation.includes('external') || a.operation.includes('api')),
        promptTemplate: 'External service timeout. Consider fallback, async processing.'
    },
    {
        id: 'db-exhaustion',
        name: 'Database Issue',
        priority: 'P2',
        match: (a) =>
            a.operation.toLowerCase().includes('query') ||
            a.operation.toLowerCase().includes('db'),
        promptTemplate: 'Database performance issue. Check connection pool, query optimization.'
    },
    {
        id: 'generic-anomaly',
        name: 'Performance Anomaly',
        priority: 'P2',
        match: () => true,  // Catch-all
        promptTemplate: 'Performance anomaly detected. Review trace for bottleneck.'
    }
];

class StreamAnalyzer {
    private buffer: Anomaly[] = [];
    private batchTimer: NodeJS.Timeout | null = null;
    private isProcessing = false;

    /**
     * Enqueue anomaly for batch analysis
     */
    async enqueue(anomaly: Anomaly): Promise<void> {
        // Detect use case
        const useCase = USE_CASES.find(uc => uc.match(anomaly));

        // P0 critical: immediate alert
        if (useCase?.priority === 'P0') {
            wsServer.alert('critical', `${useCase.name}: ${anomaly.service}`, {
                anomalyId: anomaly.id,
                service: anomaly.service,
                operation: anomaly.operation,
                duration: anomaly.duration
            });
        }

        this.buffer.push(anomaly);
        console.log(`[STREAM] Buffered anomaly: ${anomaly.service} (${this.buffer.length}/${BATCH_SIZE})`);

        // Process immediately if batch full
        if (this.buffer.length >= BATCH_SIZE) {
            await this.processBatch();
        } else if (!this.batchTimer) {
            // Start timeout for partial batch
            this.batchTimer = setTimeout(() => this.processBatch(), BATCH_TIMEOUT_MS);
        }
    }

    /**
     * Process buffered anomalies
     */
    private async processBatch(): Promise<void> {
        if (this.buffer.length === 0 || this.isProcessing) return;

        // Clear timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        this.isProcessing = true;
        const batch = this.buffer.splice(0, BATCH_SIZE);
        const anomalyIds = batch.map(a => a.id);

        console.log(`[STREAM] Processing batch of ${batch.length} anomalies`);
        wsServer.analysisStart(anomalyIds);

        try {
            await this.streamAnalysis(batch);
        } catch (error: any) {
            console.error('[STREAM] Analysis failed:', error.message);
            wsServer.analysisComplete(anomalyIds, `Analysis failed: ${error.message}`);
        }

        this.isProcessing = false;

        // Process remaining if any
        if (this.buffer.length > 0) {
            this.batchTimer = setTimeout(() => this.processBatch(), BATCH_TIMEOUT_MS);
        }
    }

    /**
     * Stream LLM analysis to WebSocket clients
     */
    private async streamAnalysis(anomalies: Anomaly[]): Promise<void> {
        const prompt = this.buildBatchPrompt(anomalies);
        const anomalyIds = anomalies.map(a => a.id);

        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                prompt,
                stream: true,
                options: {
                    temperature: 0.7,
                    num_predict: 400,
                    repeat_penalty: 1.3,
                    repeat_last_n: 64
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama returned ${response.status}`);
        }

        // Stream response chunks
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Parse NDJSON lines
            const lines = chunk.split('\n').filter(l => l.trim());
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.response) {
                        fullResponse += json.response;
                        wsServer.streamChunk(json.response, anomalyIds);
                    }
                } catch {
                    // Skip invalid JSON
                }
            }
        }

        wsServer.analysisComplete(anomalyIds, fullResponse);
    }

    /**
     * Build condensed batch prompt
     */
    private buildBatchPrompt(anomalies: Anomaly[]): string {
        const summaries = anomalies.map((a, i) => {
            const useCase = USE_CASES.find(uc => uc.match(a));
            const statusCode = a.attributes?.['http.status_code'] || '';
            return `${i + 1}. [SEV${a.severity}] ${a.service}:${a.operation} ${a.duration}ms (+${a.deviation.toFixed(1)}σ) ${statusCode ? `HTTP ${statusCode}` : ''}`;
        }).join('\n');

        return `You are monitoring a crypto exchange. Analyze these ${anomalies.length} anomalies briefly:

${summaries}

For each numbered anomaly, provide:
- Likely cause (1 line)
- Action to take (1 line)

Be concise and actionable. Focus on business impact.`;
    }
}

// Singleton
export const streamAnalyzer = new StreamAnalyzer();
