import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Globe, Clock } from "lucide-react";
import { formatTimeAgo, truncateId } from "@/lib/utils";

export function SimpleTraceViewer() {
  const { data: traces, isLoading, refetch } = useQuery({
    queryKey: ['/api/traces'],
    refetchInterval: 3000
  });

  const getStatusBadge = (status: any) => {
    const statusCode = typeof status === 'object' ? status?.code : status;
    const statusText = typeof status === 'object' ? 
      (statusCode === 1 ? 'OK' : statusCode === 2 ? 'ERROR' : 'UNSET') : 
      status;

    switch (statusText) {
      case 'OK':
        return <Badge className="bg-green-500/20 text-green-500">OK</Badge>;
      case 'ERROR':
        return <Badge className="bg-red-500/20 text-red-500">Error</Badge>;
      default:
        return <Badge variant="secondary">Running</Badge>;
    }
  };

  const groupedTraces = (traces as any[])?.reduce((acc: any, trace: any) => {
    if (!acc[trace.traceId]) {
      acc[trace.traceId] = {
        traceId: trace.traceId,
        spans: [],
        latestTime: trace.startTime
      };
    }
    acc[trace.traceId].spans.push(trace);
    if (new Date(trace.startTime) > new Date(acc[trace.traceId].latestTime)) {
      acc[trace.traceId].latestTime = trace.startTime;
    }
    return acc;
  }, {}) || {};

  const traceList = Object.values(groupedTraces).sort((a: any, b: any) => 
    new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime()
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-800">
            OpenTelemetry Traces
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="text-slate-700 hover:bg-slate-200"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {traceList.length > 0 ? (
          <div className="space-y-3">
            {traceList.slice(0, 10).map((trace: any) => (
              <div
                key={trace.traceId}
                className="p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-transparent"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Globe className="w-4 h-4 text-blue-600" />
                    <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">
                      {truncateId(trace.traceId, 16)}
                    </code>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-slate-500">
                    <span>{formatTimeAgo(new Date(trace.latestTime))}</span>
                    <Badge variant="outline">{trace.spans.length} spans</Badge>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {trace.spans.slice(0, 3).map((span: any, index: number) => (
                    <div
                      key={span.spanId}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                        <span className="font-medium">{span.name}</span>
                        <span className="text-slate-500">({span.serviceName})</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span className="text-xs">{Math.round(span.duration || 0)}ms</span>
                        </div>
                        {getStatusBadge(span.status)}
                      </div>
                    </div>
                  ))}
                  {trace.spans.length > 3 && (
                    <div className="text-xs text-slate-500 pl-4">
                      ... and {trace.spans.length - 3} more spans
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">OpenTelemetry + Kong + Solace Integration</p>
            <p className="text-sm mt-2">Traces flow through complete microservices architecture</p>
            <p className="text-sm">Submit a payment to see context propagation in action</p>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs">
              <p className="font-medium text-blue-700">Trace Flow:</p>
              <p className="text-blue-600">Frontend → Kong Gateway → Backend → Solace Queues → Processors → OpenTelemetry Collector</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}