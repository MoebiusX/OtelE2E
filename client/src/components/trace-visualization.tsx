import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { truncateId } from "@/lib/utils";
import { 
  RefreshCw, 
  ExternalLink, 
  Globe, 
  Shield, 
  Server, 
  List, 
  Database,
  Clock
} from "lucide-react";
import type { Trace, Span } from "@shared/schema";

export function TraceVisualization() {
  const { data: traces, isLoading: tracesLoading, refetch: refetchTraces } = useQuery<Trace[]>({
    queryKey: ["/api/traces"],
  });

  const activeTrace = traces?.[0];

  const { data: spans, isLoading: spansLoading } = useQuery<Span[]>({
    queryKey: ["/api/traces", activeTrace?.traceId, "spans"],
    enabled: !!activeTrace?.traceId,
  });

  const handleRefresh = () => {
    refetchTraces();
  };

  const getSpanIcon = (serviceName: string) => {
    switch (serviceName) {
      case 'payment-api':
        return <Globe className="w-4 h-4 text-otel-blue" />;
      case 'kong-gateway':
        return <Shield className="w-4 h-4 text-purple-500" />;
      case 'solace-queue':
        return <List className="w-4 h-4 text-otel-amber" />;
      case 'payment-processor':
        return <Server className="w-4 h-4 text-green-600" />;
      case 'notification-service':
        return <ExternalLink className="w-4 h-4 text-blue-600" />;
      case 'audit-service':
        return <Clock className="w-4 h-4 text-purple-600" />;
      case 'database':
        return <Database className="w-4 h-4 text-blue-500" />;
      default:
        return <Server className="w-4 h-4 text-otel-green" />;
    }
  };

  const getSpanColor = (serviceName: string) => {
    switch (serviceName) {
      case 'payment-api':
        return 'border-otel-blue bg-gradient-to-r from-otel-blue/10 to-transparent';
      case 'kong-gateway':
        return 'border-purple-500 bg-gradient-to-r from-purple-500/10 to-transparent';
      case 'solace-queue':
        return 'border-otel-amber bg-gradient-to-r from-otel-amber/10 to-transparent';
      case 'database':
        return 'border-blue-500 bg-gradient-to-r from-blue-500/10 to-transparent';
      default:
        return 'border-otel-green bg-gradient-to-r from-otel-green/10 to-transparent';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-otel-green/20 text-otel-green">Success</Badge>;
      case 'active':
        return <Badge className="bg-otel-amber/20 text-otel-amber">Active</Badge>;
      case 'error':
        return <Badge className="bg-red-500/20 text-red-500">Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Sort spans by hierarchy (root first, then children)
  const sortedSpans = spans ? [...spans].sort((a, b) => {
    if (!a.parentSpanId && b.parentSpanId) return -1;
    if (a.parentSpanId && !b.parentSpanId) return 1;
    return a.startTime.getTime() - b.startTime.getTime();
  }) : [];

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-800">Trace Visualization</CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={tracesLoading}
              className="text-slate-700 hover:bg-slate-200"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${tracesLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              className="bg-otel-blue hover:bg-blue-700 text-white"
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Jaeger UI
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {tracesLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-3/4" />
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ) : activeTrace ? (
          <>
            <div className="flex items-center space-x-2 text-sm text-slate-600">
              <span className="font-medium">Active Trace:</span>
              <code className="px-2 py-1 bg-slate-100 rounded text-xs font-mono">
                {truncateId(activeTrace.traceId, 32)}
              </code>
              {getStatusBadge(activeTrace.status)}
            </div>

            {/* Span Hierarchy */}
            <div className="space-y-2">
              {spansLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : sortedSpans.length > 0 ? (
                sortedSpans.map((span, index) => {
                  const isRoot = !span.parentSpanId;
                  const marginLeft = isRoot ? '' : 'ml-6';
                  
                  return (
                    <div
                      key={span.id}
                      className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${getSpanColor(span.serviceName)} ${marginLeft}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          {getSpanIcon(span.serviceName)}
                          <span className="font-medium text-slate-800">{span.operationName}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-slate-500">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Duration: {span.duration}ms</span>
                        </div>
                        {getStatusBadge(span.status)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No spans available for this trace</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No active traces found</p>
            <p className="text-sm">Submit a payment to generate traces</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
