import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Clock, Globe, ChevronDown, ChevronRight } from "lucide-react";
import { formatTimeAgo, truncateId } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";

interface TraceData {
  traceId: string;
  rootSpanId: string;
  status: string;
  duration: number;
  startTime: string;
  spans: SpanData[];
}

interface SpanData {
  spanId: string;
  parentSpanId: string | null;
  traceId: string;
  operationName: string;
  serviceName: string;
  duration: number;
  startTime: string;
  endTime: string;
  tags: Record<string, any>;
}

function TraceItem({ trace }: { trace: TraceData }) {
  const [expanded, setExpanded] = useState(false);
  
  const httpMethod = trace.spans[0]?.tags?.['http.method'] || 'Unknown';
  const httpUrl = trace.spans[0]?.tags?.['http.target'] || '/api/unknown';
  const statusCode = trace.spans[0]?.tags?.['http.status_code'] || 'N/A';
  
  return (
    <div className="border rounded-lg bg-white hover:shadow-sm transition-shadow">
      <div 
        className="p-4 cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
          <Globe className="w-4 h-4 text-blue-600" />
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-medium text-slate-800">
                {httpMethod} {httpUrl}
              </span>
              <Badge variant={statusCode === 200 ? "default" : "destructive"}>
                {statusCode}
              </Badge>
            </div>
            <div className="text-sm text-slate-500">
              Trace ID: {truncateId(trace.traceId)} • 
              Duration: {trace.duration.toFixed(2)}ms • 
              {formatTimeAgo(new Date(trace.startTime))}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge className="bg-green-500/20 text-green-500">
            {trace.spans.length} spans
          </Badge>
        </div>
      </div>
      
      {expanded && (
        <div className="border-t bg-slate-50 p-4">
          <div className="space-y-2">
            {trace.spans.map((span) => (
              <div key={span.spanId} className="flex items-center space-x-3 text-sm">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="flex-1">
                  <span className="font-medium text-slate-700">{span.operationName}</span>
                  <span className="text-slate-500 ml-2">({span.serviceName})</span>
                </div>
                <div className="text-slate-500">
                  {span.duration ? `${span.duration.toFixed(2)}ms` : 'N/A'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TraceViewer() {
  const { data: traces, isLoading } = useQuery<TraceData[]>({
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

  const traceList = traces || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>OpenTelemetry Traces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Clock className="w-5 h-5" />
            <span>Recent Traces ({traceList.length})</span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {traceList.length > 0 ? (
          <div className="space-y-3">
            {traceList.map((trace) => (
              <TraceItem key={trace.traceId} trace={trace} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No traces captured yet</p>
            <p className="text-sm">Submit a payment to see OpenTelemetry traces</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}