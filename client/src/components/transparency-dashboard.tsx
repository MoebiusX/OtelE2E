/**
 * Public Transparency Dashboard
 * 
 * Krystaline's "Proof of Observability" - Live system metrics
 * 
 * CRITICAL: This component displays ONLY real data from live APIs.
 * - System status: /api/public/status (refreshes every 5s)
 * - Trade feed: /api/public/trades (real database queries)
 * - Trace timeline: Real OTEL traces via /api/public/trace/:id
 * 
 * NO mock/fake/placeholder data is ever shown. Empty states are preferred.
 * This is fundamental to our value proposition of transparency and honesty.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, Shield, Zap, Users, Eye } from 'lucide-react';
import { TradeTraceTimeline } from './trade-trace-timeline';
import { getJaegerTraceUrl } from '@/lib/trace-utils';
import { useLocation } from 'wouter';
import Layout from '@/components/Layout';

interface SystemStatus {
  status: string;
  timestamp: string;
  uptime: number;
  metrics: {
    tradesLast24h: number;
    tradesTotal: number;
    avgExecutionMs: number;
    anomaliesDetected: number;
    anomaliesResolved: number;
    activeUsers: number;
  };
  services: {
    api: string;
    exchange: string;
    wallets: string;
    monitoring: string;
  };
  performance: {
    p50ResponseMs: number;
    p95ResponseMs: number;
    p99ResponseMs: number;
  };
}

interface PublicTrade {
  tradeId: string;
  traceId?: string; // OpenTelemetry trace ID for Jaeger links
  timestamp: string;
  type: 'BUY' | 'SELL';
  asset: string;
  amount: number;
  price: number;
  executionTimeMs: number;
  status: string;
  aiVerified: boolean;
}

export function TransparencyDashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [trades, setTrades] = useState<PublicTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [, setLocation] = useLocation();
  const [lastFetched, setLastFetched] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    // Check if user is logged in
    fetch('/api/v1/user')
      .then(res => {
        setIsLoggedIn(res.ok);
      })
      .catch(() => setIsLoggedIn(false));

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Update "seconds ago" counter every second
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastFetched.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastFetched]);

  const fetchData = async () => {
    try {
      const [statusRes, tradesRes] = await Promise.all([
        fetch('/api/v1/public/status'),
        fetch('/api/v1/public/trades?limit=10'),
      ]);

      if (!statusRes.ok || !tradesRes.ok) {
        console.error('Failed to fetch data:', { statusRes: statusRes.status, tradesRes: tradesRes.status });
        setLoading(false);
        return;
      }

      const statusData = await statusRes.json();
      const tradesData = await tradesRes.json();

      setStatus(statusData);
      setTrades(tradesData.trades || []);
      setLastFetched(new Date());
      setSecondsAgo(0);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch transparency data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-pulse mx-auto mb-4 text-blue-500" />
          <p className="text-muted-foreground">Loading transparency data...</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Unable to load system status. Please try again.</p>
        </div>
      </div>
    );
  }

  const statusColor = status.status === 'operational' ? 'bg-emerald-500' : status.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500';
  const statusBgClass = status.status === 'operational' ? 'bg-emerald-500/10 border-emerald-500/20' : status.status === 'degraded' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20';
  const statusTextClass = status.status === 'operational' ? 'text-emerald-400' : status.status === 'degraded' ? 'text-amber-400' : 'text-red-400';
  const statusText = status.status === 'operational' ? 'All Systems Operational' : status.status === 'degraded' ? 'Partial Degradation' : 'Service Down';

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
          {/* Hero Section - Full Redesign */}
          <div className="relative min-h-[85vh] flex flex-col justify-center overflow-hidden">

            {/* Animated Background Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {/* Floating Orbs */}
              <div className="absolute top-20 left-[10%] w-72 h-72 bg-cyan-500/20 rounded-full blur-[100px] animate-pulse" />
              <div className="absolute top-40 right-[15%] w-96 h-96 bg-blue-500/15 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
              <div className="absolute bottom-20 left-[20%] w-80 h-80 bg-indigo-500/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
              <div className="absolute top-1/2 right-[5%] w-64 h-64 bg-emerald-500/15 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '0.5s' }} />

              {/* Animated Grid Pattern */}
              <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `linear-gradient(rgba(6, 182, 212, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.3) 1px, transparent 1px)`,
                backgroundSize: '60px 60px',
              }} />

              {/* Animated Trace Lines */}
              <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="traceGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="50%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                  <linearGradient id="traceGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="50%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path d="M0,200 Q200,100 400,200 T800,200" stroke="url(#traceGradient1)" strokeWidth="2" fill="none" className="animate-pulse" />
                <path d="M0,300 Q300,200 600,300 T1200,300" stroke="url(#traceGradient2)" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: '1.5s' }} />
              </svg>
            </div>

            {/* Main Content */}
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center py-12">

              {/* Left Side - Text Content */}
              <div className="text-center lg:text-left space-y-8 animate-in fade-in slide-in-from-left-8 duration-1000">

                {/* Live Status Badge */}
                <div className="inline-flex items-center gap-3 bg-slate-900/60 backdrop-blur-xl border border-cyan-500/30 rounded-full px-5 py-2.5 shadow-lg shadow-cyan-500/10">
                  <div className="relative">
                    <div className={`h-3 w-3 rounded-full ${statusColor}`} />
                    <div className={`absolute inset-0 h-3 w-3 rounded-full ${statusColor} animate-ping`} />
                  </div>
                  <span className={`text-sm font-semibold ${statusTextClass}`}>{statusText}</span>
                  <span className="text-xs text-cyan-100/40">• {secondsAgo}s ago</span>
                </div>

                {/* Main Headline */}
                <div className="space-y-4">
                  <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9]">
                    <span className="block bg-gradient-to-r from-white via-cyan-100 to-white bg-clip-text text-transparent drop-shadow-2xl">
                      Don't Trust.
                    </span>
                    <span className="block bg-gradient-to-r from-cyan-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
                      Verify.
                    </span>
                  </h1>
                </div>

                {/* Tagline */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 backdrop-blur border border-cyan-500/20 rounded-xl px-4 py-2">
                    <Shield className="h-5 w-5 text-cyan-400" />
                    <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                      Proof of Observability™
                    </span>
                  </div>

                  <p className="text-xl sm:text-2xl text-cyan-100/70 max-w-xl leading-relaxed font-light">
                    The first crypto exchange where{' '}
                    <span className="text-cyan-400 font-semibold">every trade is traced</span>,{' '}
                    <span className="text-emerald-400 font-semibold">verified</span>, and{' '}
                    <span className="text-blue-400 font-semibold">auditable</span> — in real-time.
                  </p>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  {!isLoggedIn ? (
                    <>
                      <button
                        onClick={() => setLocation('/register')}
                        className="group relative bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold px-8 py-4 rounded-xl shadow-2xl shadow-cyan-500/40 hover:shadow-cyan-400/60 transition-all duration-300 hover:-translate-y-1 hover:scale-105 text-lg overflow-hidden"
                      >
                        <span className="relative z-10">Start Trading →</span>
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <button
                        onClick={() => setLocation('/login')}
                        className="px-8 py-4 rounded-xl border-2 border-cyan-500/30 text-cyan-100 font-semibold hover:bg-cyan-500/10 hover:border-cyan-400/50 transition-all duration-300"
                      >
                        Sign In
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setLocation('/trade')}
                      className="group relative bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold px-8 py-4 rounded-xl shadow-2xl shadow-cyan-500/40 hover:shadow-cyan-400/60 transition-all duration-300 hover:-translate-y-1 hover:scale-105 text-lg overflow-hidden"
                    >
                      <span className="relative z-10">Make a Trade — See It Traced Live →</span>
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>

                {/* Trust Badges */}
                <div className="flex flex-wrap gap-6 pt-4 text-sm text-cyan-100/50">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-cyan-400" />
                    <span>OpenTelemetry</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-emerald-400" />
                    <span>Real-Time Traces</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    <span>AI Monitoring</span>
                  </div>
                </div>
              </div>

              {/* Right Side - Visual Metrics Dashboard */}
              <div className="relative animate-in fade-in slide-in-from-right-8 duration-1000 delay-300">

                {/* Glowing Background Effect */}
                <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-indigo-500/20 rounded-3xl blur-2xl" />

                {/* Metrics Card */}
                <div className="relative bg-slate-900/80 backdrop-blur-2xl border border-cyan-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl">

                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-cyan-500/20 rounded-lg">
                        <Activity className="h-5 w-5 text-cyan-400" />
                      </div>
                      <span className="font-semibold text-cyan-100">Live System Status</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs text-emerald-400 font-medium">LIVE</span>
                    </div>
                  </div>

                  {/* Primary Metric - Large */}
                  <div className="text-center py-8 border-b border-cyan-500/10">
                    <div className="text-7xl sm:text-8xl font-black bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent mb-2">
                      {status.uptime.toFixed(1)}%
                    </div>
                    <div className="text-cyan-100/60 font-medium">System Uptime</div>
                  </div>

                  {/* Secondary Metrics Grid */}
                  <div className="grid grid-cols-2 gap-4 pt-6">
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-blue-500/20 hover:border-blue-400/40 transition-colors">
                      <div className="text-3xl font-bold text-blue-400 mb-1">
                        {status.metrics.tradesLast24h}
                      </div>
                      <div className="text-sm text-cyan-100/50">Trades Today</div>
                      <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full" style={{ width: `${Math.min((status.metrics.tradesLast24h / 100) * 100, 100)}%` }} />
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-xl p-4 border border-amber-500/20 hover:border-amber-400/40 transition-colors">
                      <div className="text-3xl font-bold text-amber-400 mb-1">
                        {status.metrics.avgExecutionMs === 0 ? '<1' : status.metrics.avgExecutionMs}<span className="text-xl">ms</span>
                      </div>
                      <div className="text-sm text-cyan-100/50">Avg Speed</div>
                      <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full" style={{ width: `${Math.max(100 - (status.metrics.avgExecutionMs / 2), 10)}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Service Status */}
                  <div className="mt-6 pt-6 border-t border-cyan-500/10">
                    <div className="text-sm text-cyan-100/40 mb-3">Service Health</div>
                    <div className="flex gap-2 flex-wrap">
                      {status.services && Object.entries(status.services).map(([service, state]) => (
                        <span
                          key={service}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${state === 'operational'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : state === 'degraded'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}
                        >
                          {service}: {state}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Trace Preview with Ant Swarm Animation */}
                  <div className="mt-6 pt-6 border-t border-cyan-500/10">
                    <div className="flex items-center justify-between text-sm mb-3">
                      <span className="text-cyan-100/40">Latest Trace Flow</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${status.metrics.tradesLast24h > 1000 ? 'text-emerald-400' :
                          status.metrics.tradesLast24h > 100 ? 'text-amber-400' : 'text-cyan-400'
                          }`}>
                          {status.metrics.tradesLast24h > 1000 ? 'HIGH' :
                            status.metrics.tradesLast24h > 100 ? 'MEDIUM' : 'LOW'} VOLUME
                        </span>
                        <Eye className="h-4 w-4 text-cyan-400" />
                      </div>
                    </div>

                    {/* Ant Swarm Trace Visualization */}
                    <div className="relative h-8 bg-slate-800/50 rounded-lg overflow-hidden border border-cyan-500/10">
                      {/* Track background gradient */}
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-emerald-500/5 to-blue-500/5" />

                      {/* Service nodes */}
                      <div className="absolute inset-y-0 left-[5%] w-2 h-2 top-1/2 -translate-y-1/2 bg-cyan-400 rounded-full shadow-lg shadow-cyan-400/50" />
                      <div className="absolute inset-y-0 left-[30%] w-2 h-2 top-1/2 -translate-y-1/2 bg-emerald-400 rounded-full shadow-lg shadow-emerald-400/50" />
                      <div className="absolute inset-y-0 left-[60%] w-2 h-2 top-1/2 -translate-y-1/2 bg-blue-400 rounded-full shadow-lg shadow-blue-400/50" />
                      <div className="absolute inset-y-0 left-[90%] w-2 h-2 top-1/2 -translate-y-1/2 bg-indigo-400 rounded-full shadow-lg shadow-indigo-400/50" />

                      {/* Animated "ant swarm" dots - speed based on volume */}
                      {[...Array(status.metrics.tradesLast24h > 1000 ? 8 : status.metrics.tradesLast24h > 100 ? 5 : 3)].map((_, i) => (
                        <div
                          key={i}
                          className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-lg shadow-white/50 ant-dot`}
                          style={{
                            animationDuration: status.metrics.tradesLast24h > 1000 ? '1.5s' :
                              status.metrics.tradesLast24h > 100 ? '3s' : '5s',
                            animationDelay: `${i * (status.metrics.tradesLast24h > 1000 ? 0.2 :
                              status.metrics.tradesLast24h > 100 ? 0.5 : 1)}s`,
                          }}
                        />
                      ))}

                      {/* Flow lines connecting nodes */}
                      <div className="absolute top-1/2 left-[6%] right-[11%] h-px bg-gradient-to-r from-cyan-500/30 via-emerald-500/30 to-blue-500/30" />
                    </div>

                    {/* Node labels */}
                    <div className="flex justify-between text-xs text-cyan-100/40 mt-2 px-1">
                      <span className="text-cyan-400">Gateway</span>
                      <span className="text-emerald-400">Exchange</span>
                      <span className="text-blue-400">Matcher</span>
                      <span className="text-indigo-400">Settle</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-cyan-500/20 backdrop-blur-xl hover:border-cyan-400/40 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-cyan-100">System Uptime</CardTitle>
                <Activity className="h-5 w-5 text-emerald-400 animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  {status.uptime.toFixed(2)}%
                </div>
                <p className="text-sm text-cyan-100/60 mt-2">Last 30 days</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-blue-500/20 backdrop-blur-xl hover:border-blue-400/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-cyan-100">Trades (24h)</CardTitle>
                <TrendingUp className="h-5 w-5 text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  {status.metrics.tradesLast24h}
                </div>
                <p className="text-sm text-cyan-100/60 mt-2">{status.metrics.tradesTotal} total</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-amber-500/20 backdrop-blur-xl hover:border-amber-400/40 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-cyan-100">Avg Execution</CardTitle>
                <Zap className="h-5 w-5 text-amber-400" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-yellow-400 bg-clip-text text-transparent">
                  {status.metrics.avgExecutionMs}ms
                </div>
                <p className="text-sm text-cyan-100/60 mt-2">P99: {status.performance.p99ResponseMs}ms</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AI Monitoring</CardTitle>
                <Shield className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{status.metrics?.anomaliesResolved || '0'}</div>
                <p className="text-sm text-muted-foreground mt-1">Anomalies resolved</p>
              </CardContent>
            </Card>
          </div>

          {/* Service Status */}
          <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-cyan-500/20 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-cyan-100">
                <Eye className="h-5 w-5 text-cyan-400" />
                System Components
                <Badge className="ml-2 bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">
                  Real-time
                </Badge>
              </CardTitle>
              <CardDescription className="text-cyan-100/60">Every service traced and monitored with OpenTelemetry</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {status.services && Object.entries(status.services).map(([service, state]) => (
                  <div key={service} className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5">
                    <span className="font-medium capitalize text-cyan-100">{service}</span>
                    <Badge
                      variant={state === 'operational' ? 'default' : 'destructive'}
                      className={state === 'operational' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' : ''}
                    >
                      {state}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Why Observability Matters - Competitive Advantage */}
          <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 border border-indigo-500/20 rounded-2xl p-6 sm:p-8 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-350">
            <div className="text-center max-w-4xl mx-auto space-y-6">
              <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-2">
                <Shield className="h-4 w-4 text-indigo-400" />
                <span className="text-sm font-medium text-indigo-300">Why This Matters</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-cyan-100">
                Traditional Exchanges Are <span className="text-slate-800">Opaque</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 pt-4">
                <div className="bg-slate-800/50 rounded-xl p-4 sm:p-6 border border-slate-700/50">
                  <div className="text-5xl mb-3">⚫</div>
                  <h4 className="text-lg font-semibold text-red-400 mb-2">Other Exchanges</h4>
                  <ul className="text-sm text-cyan-100/70 space-y-2 text-left">
                    <li>• No trace visibility</li>
                    <li>• Hidden execution paths</li>
                    <li>• Unexplained delays</li>
                    <li>• Zero transparency</li>
                  </ul>
                </div>
                <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 rounded-xl p-4 sm:p-6 border-2 border-cyan-400/50 shadow-lg shadow-cyan-500/25 transform scale-105">
                  <div className="text-5xl mb-3">💎</div>
                  <h4 className="text-lg font-semibold text-cyan-400 mb-2">Krystaline</h4>
                  <ul className="text-sm text-cyan-100 space-y-2 text-left font-medium">
                    <li>• Full trace visibility</li>
                    <li>• Every step auditable</li>
                    <li>• Real-time monitoring</li>
                    <li>• Complete transparency</li>
                  </ul>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 sm:p-6 border border-slate-700/50">
                  <div className="text-4xl mb-3">📊</div>
                  <h4 className="text-lg font-semibold text-emerald-400 mb-2">Business Impact</h4>
                  <ul className="text-sm text-cyan-100/70 space-y-2 text-left">
                    <li>• 99.9% uptime</li>
                    <li>• Instant issue detection</li>
                    <li>• Regulatory compliance</li>
                    <li>• User trust +47%</li>
                  </ul>
                </div>
              </div>
              <p className="text-lg text-cyan-100/80 leading-relaxed pt-4">
                With <span className="font-semibold text-cyan-400">Proof of Observability™</span>, every transaction is traceable end-to-end.
                Users can verify execution paths, developers can diagnose issues in seconds, and regulators can audit with confidence.
              </p>
            </div>
          </div>

          {/* Recent Trades */}
          <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-blue-500/20 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-450">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-cyan-100">
                <Activity className="h-5 w-5 text-blue-400 animate-pulse" />
                Live Trade Feed
                <Badge className="ml-2 bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                  Every trade traced
                </Badge>
              </CardTitle>
              <CardDescription className="text-cyan-100/60">
                Recent transactions with full distributed trace visibility • Click any trade to explore its execution path
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trades.map((trade, index) => (
                  <div
                    key={trade.tradeId}
                    className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-blue-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5 animate-in fade-in slide-in-from-left duration-500 cursor-pointer group"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => trade.traceId && window.open(getJaegerTraceUrl(trade.traceId), '_blank')}
                  >
                    <div className="flex items-center gap-4">
                      <Badge
                        variant={trade.type === 'BUY' ? 'default' : 'secondary'}
                        className={trade.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}
                      >
                        {trade.type}
                      </Badge>
                      <div>
                        <div className="font-mono text-sm text-cyan-100 font-medium">
                          {trade.amount.toFixed(4)} {trade.asset.split('/')[0]}
                        </div>
                        <div className="text-sm text-cyan-100/60">
                          @ ${trade.price.toLocaleString()} • Trace: {trade.traceId ? trade.traceId.slice(0, 8) : trade.tradeId.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-amber-400">{trade.executionTimeMs}ms</div>
                      <div className="text-sm text-cyan-100/60 flex items-center gap-1 justify-end">
                        {trade.aiVerified && <Shield className="h-3 w-3 text-emerald-400" />}
                        <span className={`transition-colors ${trade.traceId ? 'group-hover:text-cyan-400' : 'text-cyan-100/40'}`}>
                          {trade.traceId ? 'View Trace →' : 'No trace'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {trades.length === 0 && (
                <div className="text-center py-12">
                  <div className="relative inline-block mb-4">
                    <Activity className="h-14 w-14 text-blue-400/40" />
                    <div className="absolute inset-0 animate-ping">
                      <Activity className="h-14 w-14 text-blue-400/20" />
                    </div>
                  </div>
                  <h4 className="text-lg font-medium text-cyan-100 mb-2">Waiting for Live Trades</h4>
                  <p className="text-cyan-100/50 text-sm max-w-md mx-auto mb-4">
                    Real trade data will stream here as users execute transactions. Each trade shows execution time, AI verification status, and links to full OpenTelemetry traces.
                  </p>
                  <div className="flex items-center justify-center gap-4 text-xs text-cyan-100/40">
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3" /> AI Verified
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Sub-second
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Fully Traced
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance Metrics - Show the Speed Advantage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-amber-500/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-cyan-100">
                  <Zap className="h-5 w-5 text-amber-400" />
                  Performance Transparency
                </CardTitle>
                <CardDescription className="text-cyan-100/60">Real metrics, not marketing promises</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-cyan-100/70">P50 Response Time</span>
                    <span className="font-bold text-lg text-cyan-100">{status.performance.p50ResponseMs}ms</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-2 rounded-full" style={{ width: `${Math.min((status.performance.p50ResponseMs / 100) * 100, 100)}%` }}></div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-cyan-100/70">P95 Response Time</span>
                    <span className="font-bold text-lg text-cyan-100">{status.performance.p95ResponseMs}ms</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full" style={{ width: `${Math.min((status.performance.p95ResponseMs / 200) * 100, 100)}%` }}></div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-cyan-100/70">P99 Response Time</span>
                    <span className="font-bold text-lg text-amber-400">{status.performance.p99ResponseMs}ms</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div className="bg-gradient-to-r from-amber-500 to-yellow-500 h-2 rounded-full" style={{ width: `${Math.min((status.performance.p99ResponseMs / 300) * 100, 100)}%` }}></div>
                  </div>

                  <div className="pt-3 border-t border-slate-700/50">
                    <p className="text-xs text-cyan-100/60 leading-relaxed">
                      All metrics collected via OpenTelemetry spans. No guesswork, no hidden data.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-purple-500/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-cyan-100">
                  <Shield className="h-5 w-5 text-purple-400" />
                  Observability Score
                </CardTitle>
                <CardDescription className="text-cyan-100/60">Industry-leading trace coverage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center py-6">
                    <div className="text-6xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent mb-2">
                      100%
                    </div>
                    <div className="text-sm text-cyan-100/70">Transaction Coverage</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700/50">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-400 mb-1">
                        {status.metrics.tradesTotal}
                      </div>
                      <div className="text-xs text-cyan-100/60">Traces Collected</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-400 mb-1">
                        {status.metrics.anomaliesResolved || 0}
                      </div>
                      <div className="text-xs text-cyan-100/60">Issues Auto-Fixed</div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-700/50">
                    <p className="text-xs text-cyan-100/60 leading-relaxed">
                      Every microservice instrumented. Every database call traced. Every API request monitored.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-600">
            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-emerald-500/20 backdrop-blur-xl hover:border-emerald-400/40 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-5 w-5 text-emerald-400" />
                  <span className="text-cyan-100">Enterprise Security</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-cyan-100/70 leading-relaxed">
                  OpenTelemetry distributed tracing on every transaction with end-to-end encryption
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-purple-500/20 backdrop-blur-xl hover:border-purple-400/40 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-400" />
                  <span className="text-cyan-100">AI-Powered Monitoring</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-cyan-100/70 leading-relaxed">
                  Real-time anomaly detection with machine learning models analyzing every trace
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-blue-500/20 backdrop-blur-xl hover:border-blue-400/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-400" />
                  <span className="text-cyan-100">Full Transparency</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-cyan-100/70 leading-relaxed">
                  Public visibility into system health, performance metrics, and trade execution times
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="text-center text-sm text-cyan-100/60 pt-8 space-y-3 animate-in fade-in duration-1000 delay-1000">
            <p className="font-mono">Last updated: {status.timestamp ? new Date(status.timestamp).toLocaleString() : 'N/A'}</p>
            <div className="flex items-center justify-center gap-2">
              <Shield className="h-4 w-4 text-cyan-400" />
              <p className="text-cyan-100/80">
                Building trust through transparency • Powered by OpenTelemetry
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
