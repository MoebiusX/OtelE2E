import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bitcoin,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  ArrowRightLeft,
  Sparkles,
  X,
  CheckCircle2,
  Eye,
  Zap,
} from 'lucide-react';
import { useLocation, useSearch } from 'wouter';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TradeForm } from '@/components/trade-form';
import { TransferForm } from '@/components/transfer-form';
import { TraceViewer } from '@/components/trace-viewer';
import { formatTimeAgo } from '@/lib/utils';
import type { Order, Transfer } from '@shared/schema';
import Layout from '@/components/Layout';

type TabType = 'trade' | 'transfer';

// Journey step indicator for new users
function JourneyProgress({ currentStep }: { currentStep: 1 | 2 | 3 | 4 }) {
  const steps = [
    { num: 1, label: 'Account Created', icon: CheckCircle2 },
    { num: 2, label: 'Make First Trade', icon: Zap },
    { num: 3, label: 'View Trace Proof', icon: Eye },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              step.num < currentStep
                ? 'bg-green-500/20 text-green-400'
                : step.num === currentStep
                  ? 'bg-cyan-500/20 text-cyan-400 ring-2 ring-cyan-500/50'
                  : 'bg-slate-800 text-slate-500'
            }`}
          >
            {step.num < currentStep ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <step.icon className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{step.label}</span>
            <span className="sm:hidden">{step.num}</span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-8 h-0.5 mx-1 ${
                step.num < currentStep ? 'bg-green-500/50' : 'bg-slate-700'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [activeTab, setActiveTab] = useState<TabType>('trade');
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasCompletedFirstTrade, setHasCompletedFirstTrade] = useState(false);
  const [hasViewedTrace, setHasViewedTrace] = useState(false);

  // Get current user from localStorage
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        // Use email as userId since wallets are keyed by email
        setCurrentUser(parsed.email || parsed.id || 'alice');
      } catch {
        navigate('/login');
      }
    } else {
      navigate('/login');
    }

    // Check if user has already viewed a trace
    if (localStorage.getItem('hasViewedTrace') === 'true') {
      setHasViewedTrace(true);
    }
    // Check if user has already completed first trade
    if (localStorage.getItem('hasCompletedFirstTrade') === 'true') {
      setHasCompletedFirstTrade(true);
    }
  }, [navigate]);

  // Listen for traceViewed event from TraceViewer
  useEffect(() => {
    const handleTraceViewed = () => {
      setHasViewedTrace(true);
    };
    window.addEventListener('traceViewed', handleTraceViewed);
    return () => window.removeEventListener('traceViewed', handleTraceViewed);
  }, []);

  // Check for welcome flow (new user)
  useEffect(() => {
    const isNewUser = localStorage.getItem('isNewUser');
    const params = new URLSearchParams(searchString);
    if (isNewUser === 'true' || params.get('welcome') === 'true') {
      setShowWelcome(true);
    }
  }, [searchString]);

  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders'],
    refetchInterval: 3000,
  });

  const { data: transfers, isLoading: transfersLoading } = useQuery<Transfer[]>({
    queryKey: ['/api/transfers'],
    refetchInterval: 3000,
  });

  // Track first trade completion
  useEffect(() => {
    if (orders && orders.length > 0) {
      const hadFirstTrade = localStorage.getItem('hasCompletedFirstTrade');
      if (!hadFirstTrade && localStorage.getItem('isNewUser')) {
        localStorage.setItem('hasCompletedFirstTrade', 'true');
        setHasCompletedFirstTrade(true);
      }
    }
  }, [orders]);

  const getStatusColor = (status: string, side?: string) => {
    if (status === 'FILLED' || status === 'COMPLETED' || status === 'completed') {
      if (side === 'BUY') return 'text-green-400';
      if (side === 'SELL') return 'text-red-400';
      return 'text-purple-400';
    }
    if (status === 'REJECTED' || status === 'FAILED') return 'text-red-500';
    return 'text-yellow-400';
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Bitcoin className="w-6 h-6 text-orange-500" />
                <h1 className="text-xl font-bold text-white">Trade</h1>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Banner for New Users */}
          {showWelcome && (
            <div className="mb-8">
              <JourneyProgress currentStep={hasViewedTrace ? 4 : hasCompletedFirstTrade ? 3 : 2} />

              <Card className="bg-gradient-to-r from-cyan-900/40 via-blue-900/40 to-indigo-900/40 border-cyan-500/30 relative overflow-hidden">
                <button
                  onClick={() => {
                    setShowWelcome(false);
                    localStorage.removeItem('isNewUser');
                  }}
                  className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <CardContent className="py-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      {!hasCompletedFirstTrade ? (
                        <>
                          <h3 className="text-xl font-bold text-white mb-1">
                            Welcome to Krystaline! 🎉
                          </h3>
                          <p className="text-cyan-100/70 mb-4">
                            You have{' '}
                            <span className="text-cyan-400 font-semibold">
                              $10,000 demo balance
                            </span>{' '}
                            to explore. Make your first trade below and watch it get traced in
                            real-time on the right.
                          </p>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-4 h-4" /> Account verified
                            </span>
                            <span className="flex items-center gap-1 text-cyan-400 animate-pulse">
                              <Zap className="w-4 h-4" /> Ready to trade
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="text-xl font-bold text-white mb-1">Trade Executed! 🚀</h3>
                          <p className="text-cyan-100/70 mb-4">
                            Your trade was captured with full observability. Check the{' '}
                            <span className="text-cyan-400 font-semibold">Trace Viewer</span> on the
                            right to see every step - from order to settlement. Click any trace to
                            open it in Jaeger.
                          </p>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-4 h-4" /> First trade complete
                            </span>
                            <span className="flex items-center gap-1 text-purple-400">
                              <Eye className="w-4 h-4" /> Traces available
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Trade/Transfer */}
            <div className="space-y-6">
              {/* Tab Buttons */}
              <div className="flex gap-2">
                <Button
                  variant={activeTab === 'trade' ? 'default' : 'outline'}
                  onClick={() => setActiveTab('trade')}
                  className={
                    activeTab === 'trade'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                  }
                >
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Trade BTC
                </Button>
                <Button
                  variant={activeTab === 'transfer' ? 'default' : 'outline'}
                  onClick={() => setActiveTab('transfer')}
                  className={
                    activeTab === 'transfer'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                  }
                >
                  <Send className="w-4 h-4 mr-2" />
                  Transfer BTC
                </Button>
              </div>

              {/* Active Form */}
              {!currentUser ? (
                <Card className="bg-slate-900 border-slate-700 p-8 text-center">
                  <Skeleton className="h-32 w-full bg-slate-800" />
                </Card>
              ) : activeTab === 'trade' ? (
                <TradeForm currentUser={currentUser} />
              ) : (
                <TransferForm />
              )}

              {/* Recent Activity */}
              <Card className="bg-slate-900 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {ordersLoading || transfersLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full bg-slate-800" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Orders */}
                      {orders?.slice(0, 3).map((order) => (
                        <div
                          key={order.orderId}
                          className="flex items-center justify-between p-3 bg-slate-800 rounded-lg group hover:bg-slate-750 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {order.side === 'BUY' ? (
                              <ArrowUpRight className="w-5 h-5 text-green-400" />
                            ) : (
                              <ArrowDownRight className="w-5 h-5 text-red-400" />
                            )}
                            <div>
                              <p
                                className={`font-medium ${order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}
                              >
                                {order.side} {order.quantity?.toFixed(6)} BTC
                              </p>
                              <p className="text-sm text-slate-400">
                                {formatTimeAgo(new Date(order.createdAt))}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-mono text-slate-300">
                                ${order.fillPrice?.toLocaleString() || 'Market'}
                              </p>
                              <p
                                className={`text-sm font-medium ${getStatusColor(order.status, order.side)}`}
                              >
                                {order.status}
                              </p>
                            </div>
                            {order.traceId && (
                              <a
                                href={`http://localhost:16686/trace/${order.traceId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-400 hover:text-purple-300 transition-colors opacity-0 group-hover:opacity-100"
                                title="View trace in Jaeger"
                              >
                                <Eye className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Transfers */}
                      {transfers?.slice(0, 2).map((transfer) => (
                        <div
                          key={transfer.transferId}
                          className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border-l-2 border-purple-500"
                        >
                          <div className="flex items-center gap-3">
                            <Send className="w-5 h-5 text-purple-400" />
                            <div>
                              <p className="font-medium text-purple-400">
                                Transfer {transfer.amount?.toFixed(6)} BTC
                              </p>
                              <p className="text-sm text-slate-400">
                                {transfer.fromUserId} → {transfer.toUserId}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-medium ${getStatusColor(transfer.status)}`}>
                              {transfer.status}
                            </p>
                          </div>
                        </div>
                      ))}

                      {!orders?.length && !transfers?.length && (
                        <div className="text-center py-10">
                          <div className="relative inline-block mb-4">
                            <Wallet className="w-12 h-12 text-cyan-500/40" />
                            <div className="absolute inset-0 animate-ping">
                              <Wallet className="w-12 h-12 text-cyan-500/20" />
                            </div>
                          </div>
                          <p className="text-lg font-medium text-slate-300 mb-1">
                            Ready to Start Trading
                          </p>
                          <p className="text-sm text-slate-500 mb-4 max-w-xs mx-auto">
                            Use the form on the left to make your first trade. Each transaction is
                            traced with OpenTelemetry.
                          </p>
                          <div className="flex items-center justify-center gap-2 text-xs text-purple-400/60">
                            <Eye className="w-3 h-3" />
                            <span>Traces will appear in real-time</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Traces */}
            <div>
              <TraceViewer />
            </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}
