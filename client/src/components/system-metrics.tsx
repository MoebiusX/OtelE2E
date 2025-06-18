import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Metrics {
  totalRequests: number;
  successRate: string;
  avgLatency: string;
  activeTraces: number;
}

export function SystemMetrics() {
  const { data: metrics, isLoading } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const services = [
    { name: "Frontend", status: "healthy", color: "bg-otel-green" },
    { name: "Kong Gateway", status: "healthy", color: "bg-otel-green" },
    { name: "Payment API", status: "healthy", color: "bg-otel-green" },
    { name: "Solace Queue", status: "high load", color: "bg-otel-amber" },
  ];

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-800">System Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-800">System Metrics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-otel-blue">
              {metrics?.totalRequests || 0}
            </div>
            <div className="text-sm text-slate-600">Total Requests</div>
          </div>
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-otel-green">
              {metrics?.successRate || "0%"}
            </div>
            <div className="text-sm text-slate-600">Success Rate</div>
          </div>
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-otel-amber">
              {metrics?.avgLatency || "0ms"}
            </div>
            <div className="text-sm text-slate-600">Avg Latency</div>
          </div>
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-slate-800">
              {metrics?.activeTraces || 0}
            </div>
            <div className="text-sm text-slate-600">Active Traces</div>
          </div>
        </div>

        {/* Service Health */}
        <div className="space-y-3">
          <h4 className="font-medium text-slate-700">Service Health</h4>
          
          {services.map((service, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 ${service.color} rounded-full`}></div>
                <span className="text-sm font-medium text-slate-800">{service.name}</span>
              </div>
              <span className="text-xs text-slate-500 capitalize">{service.status}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
