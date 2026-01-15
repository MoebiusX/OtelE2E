import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

// Severity configuration (SEV 1-5)
const SEVERITY_CONFIG = {
    1: { name: 'Critical', color: 'bg-red-600', textColor: 'text-red-400', icon: '🔴' },
    2: { name: 'Major', color: 'bg-orange-600', textColor: 'text-orange-400', icon: '🟠' },
    3: { name: 'Moderate', color: 'bg-amber-600', textColor: 'text-amber-400', icon: '🟡' },
    4: { name: 'Minor', color: 'bg-yellow-600', textColor: 'text-yellow-400', icon: '🟢' },
    5: { name: 'Low', color: 'bg-lime-600', textColor: 'text-lime-400', icon: '⚪' },
} as const;

type SeverityLevel = 1 | 2 | 3 | 4 | 5;

// Types
interface ServiceHealth {
    name: string;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    avgDuration: number;
    spanCount: number;
    activeAnomalies: number;
    lastSeen: string;
}

interface SpanBaseline {
    service: string;
    operation: string;
    spanKey: string;
    mean: number;
    stdDev: number;
    p50: number;
    p95: number;
    p99: number;
    sampleCount: number;
    lastUpdated: string;
}

interface Anomaly {
    id: string;
    traceId: string;
    service: string;
    operation: string;
    duration: number;
    expectedMean: number;
    expectedStdDev: number;
    deviation: number;
    severity: SeverityLevel;
    severityName: string;
    timestamp: string;
    dayOfWeek?: number;
    hourOfDay?: number;
}

interface AnalysisResponse {
    traceId: string;
    summary: string;
    possibleCauses: string[];
    recommendations: string[];
    confidence: 'low' | 'medium' | 'high';
}

interface RecalculateResponse {
    success: boolean;
    baselinesCount: number;
    duration: number;
    message: string;
}

interface CorrelatedMetrics {
    anomalyId: string;
    timestamp: string;
    service: string;
    metrics: {
        cpuPercent: number | null;
        memoryMB: number | null;
        requestRate: number | null;
        errorRate: number | null;
        p99LatencyMs: number | null;
        activeConnections: number | null;
    };
    insights: string[];
    healthy: boolean;
}

export default function Monitor() {
    const [, navigate] = useLocation();
    const queryClient = useQueryClient();
    const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
    const [minSeverity, setMinSeverity] = useState<SeverityLevel>(5); // Show all by default (SEV 5 = lowest)

    // Fetch health data
    const { data: healthData } = useQuery<{ status: string; services: ServiceHealth[] }>({
        queryKey: ["/api/monitor/health"],
        refetchInterval: 5000,
    });

    // Fetch baselines
    const { data: baselinesData } = useQuery<{ baselines: SpanBaseline[] }>({
        queryKey: ["/api/monitor/baselines"],
        refetchInterval: 10000,
    });

    // Fetch anomalies
    const { data: anomaliesData } = useQuery<{ active: Anomaly[] }>({
        queryKey: ["/api/monitor/anomalies"],
        refetchInterval: 5000,
    });

    // Analyze mutation
    const analyzeMutation = useMutation({
        mutationFn: async (traceId: string) => {
            const res = await fetch("/api/monitor/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ traceId }),
            });
            return res.json() as Promise<AnalysisResponse>;
        },
    });

    // Metrics correlation mutation
    const correlationMutation = useMutation({
        mutationFn: async (anomaly: Anomaly) => {
            const res = await fetch("/api/monitor/correlate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    anomalyId: anomaly.id,
                    service: anomaly.service,
                    timestamp: anomaly.timestamp,
                }),
            });
            return res.json() as Promise<CorrelatedMetrics>;
        },
    });

    // Recalculate baselines mutation
    const recalculateMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/monitor/recalculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            return res.json() as Promise<RecalculateResponse>;
        },
        onSuccess: () => {
            // Refresh all data after recalculation
            queryClient.invalidateQueries({ queryKey: ["/api/monitor"] });
        },
    });

    // Handler to select anomaly and reset previous analysis
    const handleSelectAnomaly = (anomaly: Anomaly) => {
        setSelectedAnomaly(anomaly);
        analyzeMutation.reset();
        correlationMutation.reset();
        // Auto-fetch correlated metrics
        correlationMutation.mutate(anomaly);
    };

    // Handler to clear selection
    const handleClearSelection = () => {
        setSelectedAnomaly(null);
        analyzeMutation.reset();
        correlationMutation.reset();
    };

    // Get severity badge styling
    const getSeverityBadge = (severity: SeverityLevel) => {
        const config = SEVERITY_CONFIG[severity];
        return {
            className: `${config.color} text-white font-bold`,
            label: `SEV${severity}`,
            name: config.name,
            icon: config.icon,
        };
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy': return 'bg-emerald-500';
            case 'warning': return 'bg-amber-500';
            case 'critical': return 'bg-red-500';
            default: return 'bg-slate-500';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'healthy': return '✅';
            case 'warning': return '⚠️';
            case 'critical': return '🔴';
            default: return '⚪';
        }
    };

    const formatDuration = (ms: number) => {
        if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
        if (ms < 1000) return `${ms.toFixed(1)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };


    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">🔍 Trace Monitor</h1>
                    <Badge
                        className={`${getStatusColor(healthData?.status || 'unknown')} text-white text-base px-3 py-1`}
                    >
                        {healthData?.status?.toUpperCase() || 'LOADING'}
                    </Badge>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate("/")}
                        className="px-4 py-2 rounded-md border border-slate-600 bg-slate-800 text-white hover:bg-slate-700 text-base font-medium transition-colors"
                    >
                        ← Dashboard
                    </button>
                    <button
                        onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ["/api/monitor"] });
                        }}
                        className="px-4 py-2 rounded-md border border-slate-600 bg-slate-800 text-white hover:bg-slate-700 text-base font-medium transition-colors"
                    >
                        ↻ Refresh
                    </button>
                    <button
                        onClick={() => recalculateMutation.mutate()}
                        disabled={recalculateMutation.isPending}
                        className="px-4 py-2 rounded-md bg-purple-700 text-white hover:bg-purple-600 text-base font-medium transition-colors disabled:opacity-50"
                    >
                        {recalculateMutation.isPending ? '⏳ Calculating...' : '📊 Recalculate Baselines'}
                    </button>
                    <button
                        onClick={() => window.open("http://localhost:16686", "_blank")}
                        className="px-4 py-2 rounded-md border border-slate-600 bg-slate-800 text-white hover:bg-slate-700 text-base font-medium transition-colors"
                    >
                        🔍 Jaeger
                    </button>
                </div>
            </div>

            {/* Recalculation Status */}
            {recalculateMutation.data && (
                <div className={`mb-4 p-3 rounded-lg ${recalculateMutation.data.success ? 'bg-emerald-900/50 border border-emerald-700' : 'bg-red-900/50 border border-red-700'}`}>
                    <span className="text-base">
                        {recalculateMutation.data.success ? '✅' : '❌'} {recalculateMutation.data.message}
                        {recalculateMutation.data.success && ` (${recalculateMutation.data.duration}ms)`}
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Service Health Panel */}
                <Card className="bg-slate-900 border-slate-700">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-white text-xl font-semibold">Service Health</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {healthData?.services?.map((service) => (
                                <div
                                    key={service.name}
                                    className="flex items-center justify-between p-4 rounded-lg bg-slate-800 border border-slate-700"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">{getStatusIcon(service.status)}</span>
                                        <span className="font-mono text-base text-white">{service.name}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-base text-slate-200 font-medium">
                                            {formatDuration(service.avgDuration)} avg
                                        </div>
                                        {service.activeAnomalies > 0 && (
                                            <div className="text-amber-400 text-sm font-medium">
                                                {service.activeAnomalies} alert{service.activeAnomalies > 1 ? 's' : ''}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {(!healthData?.services || healthData.services.length === 0) && (
                                <div className="text-slate-400 text-center py-6 text-base">
                                    Collecting baseline data...
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Active Anomalies Panel */}
                <Card className="bg-slate-900 border-slate-700 lg:col-span-2">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-white text-xl font-semibold flex items-center gap-3">
                                Active Alerts
                                {anomaliesData?.active && anomaliesData.active.length > 0 && (
                                    <Badge variant="destructive" className="text-base px-3">{anomaliesData.active.length}</Badge>
                                )}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400 text-sm">Min Level:</span>
                                <select
                                    value={minSeverity}
                                    onChange={(e) => setMinSeverity(Number(e.target.value) as SeverityLevel)}
                                    className="bg-slate-800 border border-slate-600 text-white rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                    <option value={5}>All (SEV5+)</option>
                                    <option value={4}>SEV4+ Minor</option>
                                    <option value={3}>SEV3+ Moderate</option>
                                    <option value={2}>SEV2+ Major</option>
                                    <option value={1}>SEV1 Critical Only</option>
                                </select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3 max-h-72 overflow-y-auto">
                            {anomaliesData?.active?.filter(a => a.severity <= minSeverity).map((anomaly) => {
                                const sevBadge = getSeverityBadge(anomaly.severity);
                                const borderColor = anomaly.severity <= 2
                                    ? 'border-red-600 bg-red-950/50 hover:bg-red-950/70'
                                    : anomaly.severity <= 3
                                        ? 'border-amber-600 bg-amber-950/50 hover:bg-amber-950/70'
                                        : 'border-yellow-600 bg-yellow-950/50 hover:bg-yellow-950/70';

                                return (
                                    <div
                                        key={anomaly.id}
                                        className={`p-4 rounded-lg cursor-pointer transition-all border-2 ${selectedAnomaly?.id === anomaly.id ? 'ring-2 ring-purple-500' : ''
                                            } ${borderColor}`}
                                        onClick={() => handleSelectAnomaly(anomaly)}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge className={`${sevBadge.className} text-xs px-2 py-0.5`}>
                                                        {sevBadge.label}
                                                    </Badge>
                                                    <span className="text-slate-400 text-sm">{sevBadge.name}</span>
                                                </div>
                                                <div className="font-mono text-base text-white font-medium">
                                                    <span className="text-cyan-400">{anomaly.service}</span>
                                                    <span className="text-slate-400">:</span>
                                                    <span className="text-white">{anomaly.operation}</span>
                                                </div>
                                                <div className="text-base text-slate-200 mt-1">
                                                    <span className="text-red-400 font-semibold">{formatDuration(anomaly.duration)}</span>
                                                    {' '}({anomaly.deviation.toFixed(1)}σ from mean)
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-300 text-sm">{formatTime(anomaly.timestamp)}</div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-sm h-7 px-2 mt-1 text-cyan-400 hover:text-cyan-300"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(`http://localhost:16686/trace/${anomaly.traceId}`, "_blank");
                                                    }}
                                                >
                                                    View Trace →
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {(!anomaliesData?.active || anomaliesData.active.filter(a => a.severity <= minSeverity).length === 0) && (
                                <div className="text-slate-400 text-center py-10 text-lg">
                                    {anomaliesData?.active?.length ? `No anomalies at SEV${minSeverity} or higher` : '✅ No active anomalies'}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* AI Analysis Panel - placed before Baseline Statistics for easier access */}
            <Card className="bg-slate-900 border-slate-700 mt-6">
                <CardHeader className="pb-4">
                    <CardTitle className="text-white text-xl font-semibold flex items-center gap-3">
                        🤖 AI Analysis
                        {selectedAnomaly && (
                            <Badge variant="outline" className="text-base border-purple-500 text-purple-400">
                                Trace: {selectedAnomaly.traceId.slice(0, 8)}...
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {selectedAnomaly ? (
                        <div className="space-y-5">
                            <div className="flex gap-3">
                                <Button
                                    onClick={() => analyzeMutation.mutate(selectedAnomaly.traceId)}
                                    disabled={analyzeMutation.isPending}
                                    className="bg-purple-600 hover:bg-purple-700 text-base px-5 py-2"
                                >
                                    {analyzeMutation.isPending ? "Analyzing..." : "Analyze with Ollama"}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleClearSelection}
                                    className="border-slate-600 text-base"
                                    style={{ color: 'white' }}
                                >
                                    Clear
                                </Button>
                            </div>

                            {analyzeMutation.data && (
                                <div className="bg-slate-800 rounded-lg p-5 space-y-4 border border-slate-700">
                                    <div>
                                        <div className="text-base text-slate-400 mb-2 font-medium">Summary</div>
                                        <div className="text-base text-white leading-relaxed">{analyzeMutation.data.summary}</div>
                                    </div>

                                    {analyzeMutation.data.possibleCauses.length > 0 && (
                                        <div>
                                            <div className="text-base text-slate-400 mb-2 font-medium">Possible Causes</div>
                                            <ul className="list-disc list-inside text-base text-white space-y-2">
                                                {analyzeMutation.data.possibleCauses.map((cause, i) => (
                                                    <li key={i} className="leading-relaxed">{cause}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {analyzeMutation.data.recommendations.length > 0 && (
                                        <div>
                                            <div className="text-base text-slate-400 mb-2 font-medium">Recommendations</div>
                                            <ul className="list-disc list-inside text-base text-emerald-400 space-y-2">
                                                {analyzeMutation.data.recommendations.map((rec, i) => (
                                                    <li key={i} className="leading-relaxed">{rec}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 pt-2">
                                        <span className="text-slate-400 text-base">Confidence:</span>
                                        <Badge
                                            variant="outline"
                                            className={`text-base px-3 ${analyzeMutation.data.confidence === 'high'
                                                ? 'border-emerald-500 text-emerald-400'
                                                : analyzeMutation.data.confidence === 'medium'
                                                    ? 'border-amber-500 text-amber-400'
                                                    : 'border-slate-500 text-slate-400'
                                                }`}
                                        >
                                            {analyzeMutation.data.confidence}
                                        </Badge>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-slate-400 text-center py-10 text-lg">
                            Click on an anomaly above to analyze it with AI
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Correlated Metrics Panel */}
            <Card className="bg-slate-900 border-slate-700 mt-6">
                <CardHeader className="pb-4">
                    <CardTitle className="text-white text-xl font-semibold flex items-center gap-3">
                        📊 Correlated Metrics
                        {correlationMutation.isPending && (
                            <span className="text-slate-400 text-sm font-normal">Loading...</span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {selectedAnomaly ? (
                        correlationMutation.data ? (
                            <div className="space-y-4">
                                {/* Metrics Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                    {/* CPU */}
                                    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                        <div className="text-slate-400 text-sm mb-1">CPU Usage</div>
                                        <div className={`text-2xl font-bold ${(correlationMutation.data.metrics.cpuPercent ?? 0) >= 80
                                                ? 'text-red-400'
                                                : (correlationMutation.data.metrics.cpuPercent ?? 0) >= 60
                                                    ? 'text-amber-400'
                                                    : 'text-emerald-400'
                                            }`}>
                                            {correlationMutation.data.metrics.cpuPercent !== null
                                                ? `${correlationMutation.data.metrics.cpuPercent.toFixed(1)}%`
                                                : 'N/A'}
                                        </div>
                                    </div>

                                    {/* Memory */}
                                    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                        <div className="text-slate-400 text-sm mb-1">Memory</div>
                                        <div className={`text-2xl font-bold ${(correlationMutation.data.metrics.memoryMB ?? 0) >= 512
                                                ? 'text-amber-400'
                                                : 'text-emerald-400'
                                            }`}>
                                            {correlationMutation.data.metrics.memoryMB !== null
                                                ? `${correlationMutation.data.metrics.memoryMB.toFixed(0)}MB`
                                                : 'N/A'}
                                        </div>
                                    </div>

                                    {/* Request Rate */}
                                    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                        <div className="text-slate-400 text-sm mb-1">Request Rate</div>
                                        <div className="text-2xl font-bold text-white">
                                            {correlationMutation.data.metrics.requestRate !== null
                                                ? `${correlationMutation.data.metrics.requestRate.toFixed(1)}/s`
                                                : 'N/A'}
                                        </div>
                                    </div>

                                    {/* Error Rate */}
                                    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                        <div className="text-slate-400 text-sm mb-1">Error Rate</div>
                                        <div className={`text-2xl font-bold ${(correlationMutation.data.metrics.errorRate ?? 0) >= 5
                                                ? 'text-red-400'
                                                : (correlationMutation.data.metrics.errorRate ?? 0) >= 1
                                                    ? 'text-amber-400'
                                                    : 'text-emerald-400'
                                            }`}>
                                            {correlationMutation.data.metrics.errorRate !== null
                                                ? `${correlationMutation.data.metrics.errorRate.toFixed(1)}%`
                                                : '0%'}
                                        </div>
                                    </div>

                                    {/* P99 Latency */}
                                    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                        <div className="text-slate-400 text-sm mb-1">P99 Latency</div>
                                        <div className="text-2xl font-bold text-white">
                                            {correlationMutation.data.metrics.p99LatencyMs !== null
                                                ? `${correlationMutation.data.metrics.p99LatencyMs.toFixed(0)}ms`
                                                : 'N/A'}
                                        </div>
                                    </div>

                                    {/* Active Connections */}
                                    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                        <div className="text-slate-400 text-sm mb-1">Connections</div>
                                        <div className={`text-2xl font-bold ${(correlationMutation.data.metrics.activeConnections ?? 0) >= 100
                                                ? 'text-amber-400'
                                                : 'text-white'
                                            }`}>
                                            {correlationMutation.data.metrics.activeConnections !== null
                                                ? correlationMutation.data.metrics.activeConnections
                                                : 'N/A'}
                                        </div>
                                    </div>
                                </div>

                                {/* Auto-Insights */}
                                {correlationMutation.data.insights.length > 0 && (
                                    <div className="bg-amber-900/30 rounded-lg p-4 border border-amber-700/50">
                                        <div className="text-amber-400 font-semibold mb-2">💡 Auto-Insights</div>
                                        <ul className="space-y-1">
                                            {correlationMutation.data.insights.map((insight, i) => (
                                                <li key={i} className="text-white text-base">{insight}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Healthy indicator */}
                                {correlationMutation.data.insights.length === 0 && (
                                    <div className="bg-emerald-900/30 rounded-lg p-4 border border-emerald-700/50 text-center">
                                        <span className="text-emerald-400">✅ No obvious resource issues detected at time of anomaly</span>
                                    </div>
                                )}
                            </div>
                        ) : correlationMutation.isPending ? (
                            <div className="text-slate-400 text-center py-6 text-lg">
                                Fetching correlated metrics...
                            </div>
                        ) : (
                            <div className="text-slate-400 text-center py-6 text-lg">
                                Unable to fetch metrics (is Prometheus running?)
                            </div>
                        )
                    ) : (
                        <div className="text-slate-400 text-center py-10 text-lg">
                            Select an anomaly to see correlated metrics
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Baselines Table */}
            <Card className="bg-slate-900 border-slate-700 mt-6">
                <CardHeader className="pb-4">
                    <CardTitle className="text-white text-xl font-semibold">
                        Baseline Statistics
                        {baselinesData?.baselines && (
                            <span className="text-base font-normal text-slate-400 ml-3">
                                ({baselinesData.baselines.length} spans tracked)
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-700 hover:bg-transparent">
                                    <TableHead className="text-slate-300 text-base font-semibold">Span</TableHead>
                                    <TableHead className="text-slate-300 text-base font-semibold text-right">Mean</TableHead>
                                    <TableHead className="text-slate-300 text-base font-semibold text-right">Std Dev (σ)</TableHead>
                                    <TableHead className="text-slate-300 text-base font-semibold text-right">P95</TableHead>
                                    <TableHead className="text-slate-300 text-base font-semibold text-right">P99</TableHead>
                                    <TableHead className="text-slate-300 text-base font-semibold text-right">Samples</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {baselinesData?.baselines?.slice(0, 15).map((baseline, index) => (
                                    <TableRow
                                        key={baseline.spanKey}
                                        className={`border-slate-700 ${index % 2 === 0 ? 'bg-slate-800/50' : 'bg-slate-900'}`}
                                    >
                                        <TableCell className="font-mono text-base py-3">
                                            <span className="text-cyan-400 font-medium">{baseline.service}</span>
                                            <span className="text-slate-500 mx-1">:</span>
                                            <span className="text-white">{baseline.operation}</span>
                                        </TableCell>
                                        <TableCell className="text-right text-base text-white font-medium">
                                            {formatDuration(baseline.mean)}
                                        </TableCell>
                                        <TableCell className="text-right text-base text-slate-300">
                                            ±{formatDuration(baseline.stdDev)}
                                        </TableCell>
                                        <TableCell className="text-right text-base text-white">
                                            {formatDuration(baseline.p95)}
                                        </TableCell>
                                        <TableCell className="text-right text-base text-white">
                                            {formatDuration(baseline.p99)}
                                        </TableCell>
                                        <TableCell className="text-right text-base text-slate-300">
                                            {baseline.sampleCount.toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {(!baselinesData?.baselines || baselinesData.baselines.length === 0) && (
                            <div className="text-slate-400 text-center py-10 text-lg">
                                Collecting baseline data from Jaeger...
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
