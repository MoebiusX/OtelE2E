import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Clock, Activity, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
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

  // Get operation info from spans
  const orderSpan = trace.spans.find(s => s.operationName?.includes('order')) || trace.spans[0];
  const operation = orderSpan?.operationName || 'Trade';

  return (
    <div className="border border-slate-700 rounded-lg bg-slate-800 hover:bg-slate-750 transition-colors">
      <div
        className="p-4 cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <Activity className="w-4 h-4 text-orange-400" />
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-medium text-white text-sm">
                {operation}
              </span>
              <Badge className="bg-green-500/20 text-green-400 border-none text-xs">
                OK
              </Badge>
            </div>
            <div className="text-xs text-slate-500">
              {truncateId(trace.traceId)} • {trace.duration?.toFixed(1)}ms • {formatTimeAgo(new Date(trace.startTime))}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge className="bg-purple-500/20 text-purple-400 border-none text-xs">
            {trace.spans.length} spans
          </Badge>
          <a
            href={`http://localhost:16686/trace/${trace.traceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700 bg-slate-850 p-4">
          <div className="mb-3">
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Trace Flow</h4>
          </div>
          <div className="space-y-2">
            {trace.spans.map((span) => (
              <div key={span.spanId} className="flex items-center justify-between text-sm py-1.5 px-2 bg-slate-900 rounded">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span className="font-medium text-slate-300">{span.operationName}</span>
                  <span className="text-xs text-slate-500">({span.serviceName})</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-slate-500 font-mono">
                    {span.duration ? `${span.duration.toFixed(2)}ms` : '0ms'}
                  </span>
                  <div className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                    ✓
                  </div>
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
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
    }
  });

  const traceList = traces || [];

  if (isLoading) {
    return (
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Traces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-800 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 text-white">
            <Clock className="w-5 h-5 text-purple-400" />
            <span>Traces ({traceList.length})</span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="text-red-400 border-slate-600 hover:bg-red-500/10 hover:border-red-500/50"
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
            <p className="font-medium">No traces yet</p>
            <p className="text-sm">Submit a trade to see OpenTelemetry traces</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}