import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Globe, Clock, Shield, List, Server } from "lucide-react";
import { formatTimeAgo, truncateId } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";

function TraceCard({ trace }: { trace: any }) {
  const [expanded, setExpanded] = useState(false);
  const { data: spans } = useQuery({
    queryKey: [`/api/traces/${trace.traceId}/spans`],
    enabled: expanded
  });

  const getServiceIcon = (serviceName: string) => {
    switch (serviceName) {
      case 'kong-gateway':
        return <Shield className="w-4 h-4 text-slate-600" />;
      case 'payment-api':
        return <Globe className="w-4 h-4 text-blue-600" />;
      case 'solace-queue':
        return <List className="w-4 h-4 text-amber-600" />;
      case 'payment-processor':
        return <Server className="w-4 h-4 text-green-600" />;
      default:
        return <Server className="w-4 h-4 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500/20 text-green-500">Success</Badge>;
      case 'active':
        return <Badge className="bg-blue-500/20 text-blue-500">Active</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div
      className="p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-transparent cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Globe className="w-4 h-4 text-blue-600" />
          <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">
            {truncateId(trace.traceId, 16)}
          </code>
        </div>
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <span>{formatTimeAgo(new Date(trace.startTime))}</span>
          {getStatusBadge(trace.status)}
          <span className="text-xs">{trace.duration || 0}ms</span>
        </div>
      </div>
      
      {expanded && spans && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <h4 className="text-sm font-medium text-slate-700">Payment Processing Flow:</h4>
          {spans.slice(0, 5).map((span: any) => (
            <div key={span.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                {getServiceIcon(span.serviceName)}
                <span className="font-medium">{span.operationName}</span>
                <span className="text-slate-500">({span.serviceName})</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-3 h-3" />
                <span className="text-xs">{span.duration}ms</span>
                {getStatusBadge(span.status)}
              </div>
            </div>
          ))}
          {spans.length > 5 && (
            <div className="text-xs text-slate-500 pl-6">
              ... and {spans.length - 5} more operations
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SimpleTraceViewer() {
  const { data: traces, isLoading } = useQuery({
    queryKey: ['/api/traces'],
    refetchInterval: 3000
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', '/api/clear');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/traces'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
    }
  });

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
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="text-red-600 hover:bg-red-50 border-red-200"
          >
            <Trash2 className={`w-4 h-4 mr-1 ${clearMutation.isPending ? 'animate-pulse' : ''}`} />
            Clear
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