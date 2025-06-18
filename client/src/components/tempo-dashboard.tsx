import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  Database, 
  ExternalLink, 
  BarChart3,
  Clock,
  Layers,
  TrendingUp,
  Zap
} from "lucide-react";

interface TempoConfig {
  ui_url: string;
  tempo_endpoint: string;
  query_url: string;
  status: string;
  traces_available: boolean;
  datasource: string;
  export_format: string;
  services: string[];
}

export function TempoDashboard() {
  const { data: tempoConfig, isLoading } = useQuery<TempoConfig>({
    queryKey: ["/api/tempo"],
  });

  const { data: traces } = useQuery({
    queryKey: ["/api/traces"],
  });

  const { data: metrics } = useQuery({
    queryKey: ["/api/metrics"],
  });

  const tempoFeatures = [
    {
      icon: <Zap className="w-5 h-5 text-yellow-500" />,
      title: "High-Scale Ingestion",
      description: "OTLP HTTP export with efficient storage"
    },
    {
      icon: <Database className="w-5 h-5 text-blue-500" />,
      title: "Cost-Effective Storage",
      description: "Object storage backend (S3, GCS, Azure)"
    },
    {
      icon: <BarChart3 className="w-5 h-5 text-green-500" />,
      title: "Grafana Integration",
      description: "Native dashboards and alerting"
    },
    {
      icon: <Activity className="w-5 h-5 text-purple-500" />,
      title: "TraceQL Queries",
      description: "Powerful trace search language"
    }
  ];

  const exportMetrics = [
    {
      label: "Export Format",
      value: tempoConfig?.export_format?.toUpperCase() || "OTLP",
      color: "text-otel-blue"
    },
    {
      label: "Endpoint Status",
      value: tempoConfig?.status === 'demo_mode' ? "Demo" : "Connected",
      color: tempoConfig?.status === 'demo_mode' ? "text-otel-amber" : "text-otel-green"
    },
    {
      label: "Datasource",
      value: tempoConfig?.datasource || "tempo",
      color: "text-slate-700"
    },
    {
      label: "Services",
      value: tempoConfig?.services?.length?.toString() || "0",
      color: "text-otel-green"
    }
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-800 flex items-center">
            <Layers className="w-5 h-5 text-otel-blue mr-2" />
            Grafana Tempo Integration
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="text-slate-700 hover:bg-slate-200"
            onClick={() => {
              if (tempoConfig) {
                if (tempoConfig.status === 'demo_mode') {
                  alert(`Tempo Configuration:\n\nEndpoint: ${tempoConfig.tempo_endpoint}\nGrafana: ${tempoConfig.ui_url}\nQuery API: ${tempoConfig.query_url}\nFormat: ${tempoConfig.export_format}\n\nIn production, traces would be visible in Grafana dashboards with TraceQL queries.`);
                } else {
                  window.open(tempoConfig.ui_url, '_blank');
                }
              }
            }}
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            Open Grafana
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* Export Status */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {exportMetrics.map((metric, index) => (
                <div key={index} className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className={`text-lg font-bold ${metric.color}`}>
                    {metric.value}
                  </div>
                  <div className="text-xs text-slate-600">{metric.label}</div>
                </div>
              ))}
            </div>

            {/* Tempo Features */}
            <div className="space-y-3">
              <h4 className="font-medium text-slate-700 flex items-center">
                <TrendingUp className="w-4 h-4 text-otel-blue mr-2" />
                Tempo Capabilities
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tempoFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                    {feature.icon}
                    <div>
                      <h5 className="font-medium text-slate-800 text-sm">{feature.title}</h5>
                      <p className="text-xs text-slate-600">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* TraceQL Examples */}
            <div className="space-y-3">
              <h4 className="font-medium text-slate-700 flex items-center">
                <Database className="w-4 h-4 text-otel-blue mr-2" />
                TraceQL Query Examples
              </h4>
              
              <div className="space-y-2">
                <div className="p-3 bg-slate-900 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">Find payment traces with errors:</div>
                  <code className="text-sm text-green-400 font-mono">
                    {`{ .service.name = "payment-api" && .status = "error" }`}
                  </code>
                </div>
                
                <div className="p-3 bg-slate-900 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">Slow payment processing (greater than 500ms):</div>
                  <code className="text-sm text-green-400 font-mono">
                    {`{ .service.name = "payment-processor" && .duration > 500ms }`}
                  </code>
                </div>
                
                <div className="p-3 bg-slate-900 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">Queue operations by service:</div>
                  <code className="text-sm text-green-400 font-mono">
                    {`{ .service.name = "solace-queue" && .operation =~ "queue.*" }`}
                  </code>
                </div>
              </div>
            </div>

            {/* Real-time Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gradient-to-r from-otel-blue/10 to-transparent rounded-lg border border-otel-blue/20">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-slate-800">Active Traces</h5>
                  <Clock className="w-4 h-4 text-otel-blue" />
                </div>
                <div className="text-2xl font-bold text-otel-blue">
                  {Array.isArray(traces) ? traces.filter((t: any) => t.status === 'active').length : 0}
                </div>
                <div className="text-xs text-slate-600">Being exported to Tempo</div>
              </div>
              
              <div className="p-4 bg-gradient-to-r from-otel-green/10 to-transparent rounded-lg border border-otel-green/20">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-slate-800">Export Rate</h5>
                  <Activity className="w-4 h-4 text-otel-green" />
                </div>
                <div className="text-2xl font-bold text-otel-green">
                  {metrics?.totalRequests || 0}/min
                </div>
                <div className="text-xs text-slate-600">OTLP HTTP exports</div>
              </div>
            </div>

            {/* Connection Status */}
            <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-slate-200">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Tempo Connection Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Tempo Endpoint:</span>
                  <div className="font-mono text-xs bg-white p-1 rounded mt-1">
                    {tempoConfig?.tempo_endpoint || 'http://localhost:3200'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Grafana UI:</span>
                  <div className="font-mono text-xs bg-white p-1 rounded mt-1">
                    {tempoConfig?.ui_url || 'http://localhost:3000'}
                  </div>
                </div>
              </div>
              
              <div className="mt-3 flex items-center space-x-2">
                <Badge className={`text-xs ${tempoConfig?.traces_available ? 'bg-otel-green/20 text-otel-green' : 'bg-otel-amber/20 text-otel-amber'}`}>
                  {tempoConfig?.traces_available ? 'Traces Available' : 'Initializing'}
                </Badge>
                <Badge className="text-xs bg-otel-blue/20 text-otel-blue">
                  {tempoConfig?.status === 'demo_mode' ? 'Demo Mode' : 'Production'}
                </Badge>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}