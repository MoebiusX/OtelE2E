import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Layout from "@/components/Layout";

interface Wallet {
    asset: string;
    balance: string;
    available: string;
    locked: string;
}

interface User {
    id: string;
    email: string;
    status: string;
    kyc_level: number;
}

interface PriceData {
    BTC: number;
    ETH: number;
    source: string;
}

// Asset icons and colors
const ASSET_CONFIG: Record<string, { icon: string; color: string; name: string }> = {
    BTC: { icon: "₿", color: "text-orange-400", name: "Bitcoin" },
    ETH: { icon: "Ξ", color: "text-purple-400", name: "Ethereum" },
    USDT: { icon: "₮", color: "text-emerald-400", name: "Tether" },
    USD: { icon: "$", color: "text-green-400", name: "US Dollar" },
    EUR: { icon: "€", color: "text-blue-400", name: "Euro" },
};

export default function MyWallet() {
    const [, navigate] = useLocation();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem("user");
        if (!storedUser) {
            navigate("/login");
            return;
        }
        setUser(JSON.parse(storedUser));
    }, [navigate]);

    // Fetch real prices from Binance API
    const { data: priceData } = useQuery<PriceData>({
        queryKey: ["/api/price"],
        refetchInterval: 3000, // Update every 3 seconds
    });

    const { data: walletsData, isLoading } = useQuery<{ wallets: Wallet[] }>({
        queryKey: ["/api/wallet/balances"],
        queryFn: async () => {
            const token = localStorage.getItem("accessToken");
            const res = await fetch("/api/wallet/balances", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                if (res.status === 401) {
                    localStorage.clear();
                    navigate("/login");
                }
                throw new Error("Failed to fetch wallets");
            }
            return res.json();
        },
        enabled: !!user,
    });

    // Get rate for an asset using real Binance prices
    const getRate = (asset: string): number => {
        if (priceData) {
            if (asset === 'BTC') return priceData.BTC;
            if (asset === 'ETH') return priceData.ETH;
        }
        // Fallback for stablecoins
        if (asset === 'USDT' || asset === 'USD') return 1;
        if (asset === 'EUR') return 1.1;
        return 0;
    };

    // Calculate total balance in USD using real prices
    const calculateTotalUSD = () => {
        if (!walletsData?.wallets) return 0;
        return walletsData.wallets.reduce((total, w) => {
            const rate = getRate(w.asset);
            return total + parseFloat(w.balance) * rate;
        }, 0);
    };

    if (!user) return null;

    return (
        <Layout>
            <div className="container mx-auto px-4 py-8">
                {/* Total Balance Card */}
                <Card className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border-cyan-500/30 mb-8 backdrop-blur">
                    <CardContent className="py-8">
                        <div className="text-center">
                            <p className="text-cyan-100/60 mb-2">Total Balance (Est.)</p>
                            <p className="text-5xl font-bold text-cyan-100">
                                ${calculateTotalUSD().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-cyan-100/60 mt-2 text-sm">
                                Welcome bonus credited! Start trading now.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <Button 
                        className="h-16 bg-emerald-600 hover:bg-emerald-700 text-lg font-semibold"
                        onClick={() => navigate("/trade")}
                    >
                        Deposit
                    </Button>
                    <Button 
                        className="h-16 bg-blue-600 hover:bg-blue-700 text-lg font-semibold"
                        onClick={() => navigate("/trade")}
                    >
                        Withdraw
                    </Button>
                    <Button 
                        className="h-16 bg-cyan-600 hover:bg-cyan-700 text-lg font-semibold"
                        onClick={() => navigate("/convert")}
                    >
                        Convert
                    </Button>
                    <Button 
                        className="h-16 bg-indigo-600 hover:bg-indigo-700 text-lg font-semibold"
                        onClick={() => navigate("/trade")}
                    >
                        Trade
                    </Button>
                </div>

                {/* Wallets Grid */}
                <h2 className="text-2xl font-semibold text-cyan-100 mb-4">Your Assets</h2>

                {isLoading ? (
                    <div className="text-center py-8 text-slate-400">Loading wallets...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {walletsData?.wallets.map((wallet) => {
                            const config = ASSET_CONFIG[wallet.asset] || { icon: "?", color: "text-slate-400", name: wallet.asset };
                            const balance = parseFloat(wallet.balance);
                            const usdValue = balance * getRate(wallet.asset);

                            return (
                                <Card key={wallet.asset} className="bg-slate-800/50 border-cyan-500/30 hover:border-cyan-400/50 transition-all backdrop-blur">
                                    <CardContent className="p-6">
                                        <div className="flex items-center gap-4">
                                            <div className={`text-4xl ${config.color}`}>
                                                {config.icon}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-white text-lg">{wallet.asset}</span>
                                                    <span className="text-slate-400 text-sm">{config.name}</span>
                                                </div>
                                                <div className="text-2xl font-bold text-white">
                                                    {parseFloat(wallet.balance).toLocaleString(undefined, {
                                                        minimumFractionDigits: wallet.asset === 'BTC' ? 8 : 2,
                                                        maximumFractionDigits: wallet.asset === 'BTC' ? 8 : 2,
                                                    })}
                                                </div>
                                                <div className="text-sm text-slate-400">
                                                    ≈ ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                        </div>
                                        {parseFloat(wallet.locked) > 0 && (
                                            <div className="mt-4 text-sm text-amber-400">
                                                🔒 {wallet.locked} locked in orders
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </Layout>
    );
}
