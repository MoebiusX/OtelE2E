import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  RefreshCw, 
  Layers, 
  Activity, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  TrendingUp
} from "lucide-react";

interface QueueStats {
  [queueName: string]: {
    messageCount: number;
    isProcessing: boolean;
    hasConsumer: boolean;
    config: {
      name: string;
      maxRetries: number;
      processingDelay: number;
    };
  };
}

export function QueueMonitor() {
  const { data: queueStats, isLoading, refetch } = useQuery<QueueStats>({
    queryKey: ["/api/queues"],
    refetchInterval: 2000, // Refresh every 2 seconds for real-time monitoring
  });

  const getQueueStatusIcon = (stats: QueueStats[string]) => {
    if (!stats.hasConsumer) {
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    }
    if (stats.isProcessing) {
      return <Activity className="w-4 h-4 text-otel-blue animate-pulse" />;
    }
    if (stats.messageCount === 0) {
      return <CheckCircle className="w-4 h-4 text-otel-green" />;
    }
    return <Clock className="w-4 h-4 text-otel-amber" />;
  };

  const getQueueStatusText = (stats: QueueStats[string]) => {
    if (!stats.hasConsumer) return "No Consumer";
    if (stats.isProcessing) return "Processing";
    if (stats.messageCount === 0) return "Idle";
    return "Queued";
  };

  const getQueueStatusColor = (stats: QueueStats[string]) => {
    if (!stats.hasConsumer) return "bg-red-100 text-red-800";
    if (stats.isProcessing) return "bg-blue-100 text-blue-800";
    if (stats.messageCount === 0) return "bg-green-100 text-green-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const getTotalMessages = () => {
    if (!queueStats) return 0;
    return Object.values(queueStats).reduce((sum, stats) => sum + stats.messageCount, 0);
  };

  const getActiveQueues = () => {
    if (!queueStats) return 0;
    return Object.values(queueStats).filter(stats => stats.isProcessing || stats.messageCount > 0).length;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-800 flex items-center">
            <Layers className="w-5 h-5 text-otel-blue mr-2" />
            Solace Queue Monitor
          </CardTitle>
          <div className="flex items-center space-x-2">
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
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </div>
        ) : queueStats ? (
          <>
            {/* Summary Metrics */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-otel-blue">
                  {Object.keys(queueStats).length}
                </div>
                <div className="text-sm text-slate-600">Total Queues</div>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-otel-amber">
                  {getTotalMessages()}
                </div>
                <div className="text-sm text-slate-600">Pending Messages</div>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-otel-green">
                  {getActiveQueues()}
                </div>
                <div className="text-sm text-slate-600">Active Queues</div>
              </div>
            </div>

            {/* Queue Details */}
            <div className="space-y-3">
              <h4 className="font-medium text-slate-700 flex items-center">
                <TrendingUp className="w-4 h-4 text-otel-blue mr-2" />
                Queue Status
              </h4>
              
              {Object.entries(queueStats).map(([queueName, stats]) => (
                <div key={queueName} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      {getQueueStatusIcon(stats)}
                      <div>
                        <h5 className="font-medium text-slate-800">{queueName}</h5>
                        <p className="text-xs text-slate-500">
                          Max Retries: {stats.config.maxRetries} | Processing Time: {stats.config.processingDelay}ms
                        </p>
                      </div>
                    </div>
                    <Badge className={`text-xs ${getQueueStatusColor(stats)}`}>
                      {getQueueStatusText(stats)}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center p-2 bg-white rounded border">
                      <div className="font-semibold text-slate-800">{stats.messageCount}</div>
                      <div className="text-xs text-slate-500">Messages</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded border">
                      <div className="font-semibold text-slate-800">
                        {stats.hasConsumer ? "Yes" : "No"}
                      </div>
                      <div className="text-xs text-slate-500">Consumer</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded border">
                      <div className="font-semibold text-slate-800">
                        {stats.isProcessing ? "Active" : "Idle"}
                      </div>
                      <div className="text-xs text-slate-500">Processing</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* JMS Provider Info */}
            <div className="mt-6 p-4 bg-gradient-to-r from-otel-blue/5 to-otel-green/5 rounded-lg border border-slate-200">
              <h4 className="text-sm font-medium text-slate-700 mb-2">Solace JMS Provider</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500">Connection Status:</span>
                  <span className="ml-2 text-otel-green font-medium">Connected</span>
                </div>
                <div>
                  <span className="text-slate-500">Message Durability:</span>
                  <span className="ml-2 text-slate-700 font-medium">Persistent</span>
                </div>
                <div>
                  <span className="text-slate-500">Protocol:</span>
                  <span className="ml-2 text-slate-700 font-medium">SMF over TCP</span>
                </div>
                <div>
                  <span className="text-slate-500">Acknowledgment:</span>
                  <span className="ml-2 text-slate-700 font-medium">Auto</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No queue information available</p>
            <p className="text-sm">Queue service may be starting up</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}