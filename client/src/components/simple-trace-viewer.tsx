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

  // Display traces as individual trace records showing payment processing flows
  const traceList = (traces as any[])?.filter(trace => trace.traceId).sort((a: any, b: any) => 
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  ) || [];

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
              <TraceCard key={trace.traceId} trace={trace} />
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