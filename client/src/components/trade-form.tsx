import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, Loader2, Bitcoin, CheckCircle2, Clock, ExternalLink } from "lucide-react";

// Type-safe error message extraction
const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'An error occurred';

// Order schema
const orderSchema = z.object({
    pair: z.literal("BTC/USD"),
    side: z.enum(["BUY", "SELL"]),
    quantity: z.number().positive().max(10),
    orderType: z.literal("MARKET"),
});

type OrderFormData = z.infer<typeof orderSchema>;

interface WalletData {
    btc: number;
    usd: number;
    btcValue: number;
    totalValue: number;
    lastUpdated: string;
    address?: string;  // Krystaline wallet address (kx1...)
}

interface PriceData {
    pair: string;
    price: number;
    change24h: number;
    timestamp: string;
}

interface TradeFormProps {
    currentUser?: string;
    walletAddress?: string;  // Optional kx1 address
}

// Helper to format wallet address for display
function formatAddress(address: string): string {
    if (!address || address.length < 12) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function TradeForm({ currentUser: propUser, walletAddress: propAddress }: TradeFormProps) {
    const [side, setSide] = useState<"BUY" | "SELL">("BUY");
    const [lastTrade, setLastTrade] = useState<{
        traceId: string;
        side: string;
        quantity: number;
        fillPrice: number;
        executionTimeMs: number;
        timestamp: Date;
    } | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Get user and wallet address from props or localStorage
    const [currentUser, setCurrentUser] = useState<string>(propUser || 'alice');
    const [walletAddress, setWalletAddress] = useState<string | undefined>(propAddress);
    
    useEffect(() => {
        if (!propUser) {
            const userData = localStorage.getItem('user');
            if (userData) {
                try {
                    const parsed = JSON.parse(userData);
                    // Use email as userId since wallets are keyed by email
                    setCurrentUser(parsed.email || parsed.id || 'alice');
                    // Get wallet address if stored
                    setWalletAddress(parsed.walletAddress);
                } catch {}
            }
        }
    }, [propUser]);

    // Fetch wallet balance for current user
    const { data: wallet } = useQuery<WalletData>({
        queryKey: ["/api/wallet", { userId: currentUser }],
        queryFn: async () => {
            const res = await fetch(`http://localhost:8000/api/wallet?userId=${currentUser}`);
            return res.json();
        },
        refetchInterval: 5000,
    });

    // Fetch current price
    const { data: priceData } = useQuery<PriceData>({
        queryKey: ["/api/price"],
        refetchInterval: 3000,
    });

    const form = useForm<OrderFormData>({
        resolver: zodResolver(orderSchema),
        defaultValues: {
            pair: "BTC/USD",
            side: "BUY",
            quantity: 0.01,
            orderType: "MARKET",
        },
    });

    // Update form when side changes
    useEffect(() => {
        form.setValue("side", side);
    }, [side, form]);

    const orderMutation = useMutation({
        mutationFn: async (data: OrderFormData) => {
            const tracer = trace.getTracer('kx-wallet');
            const token = localStorage.getItem('accessToken');

            // Create a parent span for the entire order flow on the client
            return tracer.startActiveSpan('order.submit.client', async (parentSpan) => {
                // Save the parent context before async operations
                const parentContext = context.active();

                try {
                    parentSpan.setAttribute('order.side', data.side);
                    parentSpan.setAttribute('order.quantity', data.quantity);
                    parentSpan.setAttribute('order.pair', data.pair);

                    // Route through Kong Gateway for proper API gateway tracing
                    const response = await fetch('http://localhost:8000/api/orders', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({ ...data, userId: currentUser }),
                    });

                    const result = await response.json();

                    if (!response.ok) {
                        throw new Error(result.error || 'Order failed');
                    }

                    // Create a child span for response processing, explicitly within parent context
                    context.with(trace.setSpan(parentContext, parentSpan), () => {
                        const responseSpan = tracer.startSpan('order.response.received');
                        responseSpan.setAttribute('order.id', result.orderId || 'unknown');
                        responseSpan.setAttribute('order.status', result.execution?.status || 'PENDING');
                        responseSpan.setAttribute('order.fillPrice', result.execution?.fillPrice || 0);
                        responseSpan.setStatus({ code: SpanStatusCode.OK });
                        responseSpan.end();
                    });

                    parentSpan.setStatus({ code: SpanStatusCode.OK });
                    return result;
                } catch (error: unknown) {
                    parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: getErrorMessage(error) });
                    throw error;
                } finally {
                    parentSpan.end();
                }
            });
        },
        onSuccess: (data) => {
            const execution = data.execution;
            const traceId = data.traceId;

            // Store last trade for visual feedback
            setLastTrade({
                traceId,
                side: data.order.side,
                quantity: data.order.quantity,
                fillPrice: execution?.fillPrice || 0,
                executionTimeMs: execution?.executionTimeMs || 0,
                timestamp: new Date(),
            });

            // Clear success state after 10 seconds
            setTimeout(() => setLastTrade(null), 10000);

            toast({
                title: execution?.status === 'FILLED' ? "✓ Trade Verified & Traced" : "Order Submitted",
                description: (
                    <div className="space-y-3">
                        <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-mono font-medium">
                                    {data.order.side} {data.order.quantity.toFixed(6)} BTC
                                </span>
                                {execution && (
                                    <span className="font-bold text-emerald-400">@ ${execution.fillPrice?.toLocaleString()}</span>
                                )}
                            </div>
                            {execution && (
                                <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
                                    <span>Total: ${execution.totalValue?.toFixed(2)}</span>
                                    <span className="flex items-center gap-1 text-amber-400">
                                        <Clock className="w-3 h-3" />
                                        {execution.executionTimeMs || '< 1'}ms
                                    </span>
                                </div>
                            )}
                        </div>
                        <a
                            href={`http://localhost:16686/trace/${traceId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-purple-500/25"
                        >
                            <ExternalLink className="w-4 h-4" />
                            View Full Trace in Jaeger
                        </a>
                        <p className="text-xs text-center text-slate-500">
                            Trace ID: {traceId.slice(0, 16)}...
                        </p>
                    </div>
                ),
            });

            // Refresh data
            queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
            queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            queryClient.invalidateQueries({ queryKey: ["/api/traces"] });

            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ["/api/traces"] });
            }, 1500);
        },
        onError: (error) => {
            toast({
                title: "Order Failed",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: OrderFormData) => {
        orderMutation.mutate(data);
    };

    const currentPrice = priceData?.price || 42500;
    const quantity = form.watch("quantity") || 0;
    const estimatedValue = quantity * currentPrice;

    return (
        <Card className="w-full bg-slate-900 border-slate-700 text-white">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Bitcoin className="w-5 h-5 text-orange-500" />
                        BTC/USD Trade
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        <span className="text-lg font-mono font-bold text-green-400">
                            ${currentPrice.toLocaleString()}
                        </span>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* Success Banner - Shows after trade */}
                {lastTrade && (
                    <div className="animate-in slide-in-from-top-2 duration-300 p-4 bg-gradient-to-r from-emerald-900/40 to-cyan-900/40 rounded-xl border border-emerald-500/30">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-emerald-500/20 rounded-full">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-semibold text-emerald-400">Trade Executed & Verified</h4>
                                    <span className="text-xs text-amber-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {lastTrade.executionTimeMs || '< 1'}ms
                                    </span>
                                </div>
                                <p className="text-sm text-slate-300 mt-1">
                                    {lastTrade.side} {lastTrade.quantity.toFixed(6)} BTC @ ${lastTrade.fillPrice.toLocaleString()}
                                </p>
                                <a
                                    href={`http://localhost:16686/trace/${lastTrade.traceId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 mt-2 text-xs text-purple-400 hover:text-purple-300"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    View trace: {lastTrade.traceId.slice(0, 12)}...
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                {/* Wallet Balance */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-orange-400" />
                        <div>
                            <p className="text-xs text-slate-400">BTC Balance</p>
                            <p className="font-mono font-bold text-orange-400">
                                {(wallet?.btc ?? 0).toFixed(6)}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-green-400 font-bold">$</span>
                        <div>
                            <p className="text-xs text-slate-400">USD Balance</p>
                            <p className="font-mono font-bold text-green-400">
                                {(wallet?.usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Buy/Sell Toggle */}
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        type="button"
                        variant={side === "BUY" ? "default" : "outline"}
                        className={`h-12 ${side === "BUY"
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "border-slate-600 text-slate-400 hover:bg-slate-800"}`}
                        onClick={() => setSide("BUY")}
                    >
                        <ArrowUpRight className="w-5 h-5 mr-2" />
                        BUY
                    </Button>
                    <Button
                        type="button"
                        variant={side === "SELL" ? "default" : "outline"}
                        className={`h-12 ${side === "SELL"
                            ? "bg-red-600 hover:bg-red-700 text-white"
                            : "border-slate-600 text-slate-400 hover:bg-slate-800"}`}
                        onClick={() => setSide("SELL")}
                    >
                        <ArrowDownRight className="w-5 h-5 mr-2" />
                        SELL
                    </Button>
                </div>

                {/* Order Form */}
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="quantity"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-slate-300">Amount (BTC)</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            step="0.001"
                                            min="0.001"
                                            max="10"
                                            placeholder="0.01"
                                            {...field}
                                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                            className="bg-slate-800 border-slate-600 text-white font-mono text-lg h-12"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Estimated Value */}
                        <div className="p-3 bg-slate-800 rounded-lg">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-400">Estimated Value</span>
                                <span className="font-mono font-bold text-lg">
                                    ${estimatedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={orderMutation.isPending}
                            className={`w-full h-14 text-lg font-bold ${side === "BUY"
                                ? "bg-green-600 hover:bg-green-700"
                                : "bg-red-600 hover:bg-red-700"
                                }`}
                        >
                            {orderMutation.isPending ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    {side === "BUY" ? "Buy" : "Sell"} {quantity.toFixed(4)} BTC
                                </>
                            )}
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
