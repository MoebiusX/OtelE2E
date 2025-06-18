import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentForm } from "@/components/payment-form";
import { TraceVisualization } from "@/components/trace-visualization";
import { SystemMetrics } from "@/components/system-metrics";
import { QueueMonitor } from "@/components/queue-monitor";
import { TempoDashboard } from "@/components/tempo-dashboard";
import { formatCurrency, formatTimeAgo, truncateId } from "@/lib/utils";
import { ChartLine, Settings } from "lucide-react";
import type { Payment } from "@shared/schema";

export default function Dashboard() {
  const { data: payments, isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-otel-green';
      case 'pending':
        return 'bg-otel-amber';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-trace-bg">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <ChartLine className="text-otel-blue text-xl" />
                <h1 className="text-xl font-semibold text-slate-800">OpenTelemetry Payment Demo</h1>
              </div>
              <Badge className="px-2 py-1 bg-otel-blue/10 text-otel-blue text-xs font-medium">
                Context Propagation
              </Badge>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-slate-600">
                <div className="w-2 h-2 bg-otel-green rounded-full animate-pulse"></div>
                <span>Tracing Active</span>
              </div>
              <button className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors flex items-center">
                <Settings className="w-4 h-4 mr-1" />
                Config
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column */}
          <div className="space-y-6">
            <PaymentForm />

            {/* Recent Submissions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-800">Recent Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentsLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : payments && payments.length > 0 ? (
                  <div className="space-y-3">
                    {payments.slice(0, 5).map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 ${getStatusColor(payment.status)} rounded-full`}></div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{payment.description}</p>
                            <p className="text-xs text-slate-500">
                              {formatTimeAgo(new Date(payment.createdAt))}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-800">
                            {formatCurrency(payment.amount, payment.currency)}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            {truncateId(payment.traceId)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <p>No payments submitted yet</p>
                    <p className="text-sm">Submit your first payment to see it here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <TraceVisualization />
            <TempoDashboard />
            <div className="grid grid-cols-1 gap-6">
              <SystemMetrics />
              <QueueMonitor />
            </div>
          </div>
        </div>

        {/* Technical Details */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">OpenTelemetry Implementation Details</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <h3 className="font-medium text-slate-700 flex items-center">
                <ChartLine className="w-4 h-4 text-otel-blue mr-2" />
                Context Propagation
              </h3>
              <div className="text-sm text-slate-600 space-y-2">
                <p>• W3C Trace Context headers</p>
                <p>• Automatic span correlation</p>
                <p>• Cross-service trace linking</p>
                <p>• Baggage propagation support</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-slate-700 flex items-center">
                <ChartLine className="w-4 h-4 text-otel-green mr-2" />
                Instrumentation
              </h3>
              <div className="text-sm text-slate-600 space-y-2">
                <p>• Automatic HTTP instrumentation</p>
                <p>• Custom span creation</p>
                <p>• Queue operation tracking</p>
                <p>• Error span recording</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-slate-700 flex items-center">
                <ChartLine className="w-4 h-4 text-otel-amber mr-2" />
                Exporters
              </h3>
              <div className="text-sm text-slate-600 space-y-2">
                <p>• Jaeger trace exporter</p>
                <p>• Console debugging output</p>
                <p>• OTLP protocol support</p>
                <p>• Prometheus metrics</p>
              </div>
            </div>
          </div>

          {/* Configuration Example */}
          <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h4 className="text-sm font-medium text-slate-700 mb-2">Sample Configuration</h4>
            <pre className="text-xs text-slate-600 overflow-x-auto">
              <code>{`// OpenTelemetry SDK Configuration
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({
    endpoint: 'http://jaeger:14268/api/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();`}</code>
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
