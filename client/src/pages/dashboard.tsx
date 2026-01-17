import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TradeForm } from "@/components/trade-form";
import { TransferForm } from "@/components/transfer-form";
import { TraceViewer } from "@/components/trace-viewer";
import { formatTimeAgo } from "@/lib/utils";
import { Bitcoin, TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, Send, ArrowRightLeft } from "lucide-react";
import type { Order, Transfer } from "@shared/schema";
import Layout from "@/components/Layout";
import { useLocation } from "wouter";

type TabType = 'trade' | 'transfer';

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('trade');

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
  }, [navigate]);

  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    refetchInterval: 3000,
  });

  const { data: transfers, isLoading: transfersLoading } = useQuery<Transfer[]>({
    queryKey: ["/api/transfers"],
    refetchInterval: 3000,
  });

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Left Column - Trade/Transfer */}
          <div className="space-y-6">
            {/* Tab Buttons */}
            <div className="flex gap-2">
              <Button
                variant={activeTab === 'trade' ? 'default' : 'outline'}
                onClick={() => setActiveTab('trade')}
                className={activeTab === 'trade'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'border-slate-600 text-slate-300 hover:bg-slate-700'}
              >
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Trade BTC
              </Button>
              <Button
                variant={activeTab === 'transfer' ? 'default' : 'outline'}
                onClick={() => setActiveTab('transfer')}
                className={activeTab === 'transfer'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'border-slate-600 text-slate-300 hover:bg-slate-700'}
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
              <TransferForm currentUser={currentUser} />
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
                {(ordersLoading || transfersLoading) ? (
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
                        className="flex items-center justify-between p-3 bg-slate-800 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {order.side === 'BUY' ? (
                            <ArrowUpRight className="w-5 h-5 text-green-400" />
                          ) : (
                            <ArrowDownRight className="w-5 h-5 text-red-400" />
                          )}
                          <div>
                            <p className={`font-medium ${order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                              {order.side} {order.quantity?.toFixed(6)} BTC
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatTimeAgo(new Date(order.createdAt))}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono text-slate-300">
                            ${order.fillPrice?.toLocaleString() || 'Market'}
                          </p>
                          <p className={`text-xs ${getStatusColor(order.status, order.side)}`}>
                            {order.status}
                          </p>
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
                            <p className="text-xs text-slate-500">
                              {transfer.fromUserId} → {transfer.toUserId}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs ${getStatusColor(transfer.status)}`}>
                            {transfer.status}
                          </p>
                        </div>
                      </div>
                    ))}

                    {(!orders?.length && !transfers?.length) && (
                      <div className="text-center py-8 text-slate-500">
                        <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No activity yet</p>
                        <p className="text-sm">Submit a trade or transfer to get started</p>
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
