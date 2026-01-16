import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LayoutProps {
    children: ReactNode;
    showAuth?: boolean; // Show login/logout in header
}

interface User {
    id: string;
    email: string;
    status: string;
}

export default function Layout({ children, showAuth = true }: LayoutProps) {
    const [location, setLocation] = useLocation();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const handleLogout = () => {
        const token = localStorage.getItem("accessToken");
        fetch("/api/auth/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        }).finally(() => {
            localStorage.clear();
            setUser(null);
            setLocation("/login");
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex flex-col">
            {/* Header */}
            <header className="border-b border-cyan-500/20 bg-slate-900/80 backdrop-blur-lg sticky top-0 z-50">
                <div className="container mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        {/* Logo */}
                        <a href={user ? "/trading" : "/"} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                                <span className="text-white text-sm font-bold">K</span>
                            </div>
                            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                                Krystaline
                            </h1>
                        </a>

                        {/* Nav Links */}
                        <nav className="hidden md:flex items-center gap-1">
                            <a
                                href={user ? "/trading" : "/"}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${(location === '/' && !user) || (location === '/trading' && user) ? 'bg-cyan-500/10 text-cyan-400' : 'text-cyan-100/70 hover:text-cyan-100 hover:bg-slate-800/50'}`}
                            >
                                Home
                            </a>
                            {user && (
                                <>
                                    <a
                                        href="/my-wallet"
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${location === '/my-wallet' ? 'bg-cyan-500/10 text-cyan-400' : 'text-cyan-100/70 hover:text-cyan-100 hover:bg-slate-800/50'}`}
                                    >
                                        Wallet
                                    </a>
                                    <a
                                        href="/convert"
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${location === '/convert' ? 'bg-cyan-500/10 text-cyan-400' : 'text-cyan-100/70 hover:text-cyan-100 hover:bg-slate-800/50'}`}
                                    >
                                        Convert
                                    </a>
                                </>
                            )}
                            <a
                                href="/monitor"
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${location === '/monitor' ? 'bg-cyan-500/10 text-cyan-400' : 'text-cyan-100/70 hover:text-cyan-100 hover:bg-slate-800/50'}`}
                            >
                                Monitor
                            </a>
                        </nav>
                    </div>

                    {/* Right side */}
                    {showAuth && (
                        <div className="flex items-center gap-3">
                            {user ? (
                                <>
                                    <span className="text-cyan-100/70 text-sm hidden sm:inline">{user.email}</span>
                                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 hidden sm:flex bg-emerald-500/5">
                                        Verified
                                    </Badge>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleLogout}
                                        className="text-cyan-100/70 hover:text-cyan-100 hover:bg-slate-800/50"
                                    >
                                        Logout
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <a href="/login">
                                        <Button variant="ghost" size="sm" className="text-cyan-100/70 hover:text-cyan-100 hover:bg-slate-800/50">
                                            Sign In
                                        </Button>
                                    </a>
                                    <a href="/register">
                                        <Button size="sm" className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25">
                                            Get Started
                                        </Button>
                                    </a>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1">
                {children}
            </main>

            {/* Footer */}
            <footer className="border-t border-cyan-500/20 bg-slate-900/80 backdrop-blur-lg mt-auto">
                <div className="container mx-auto px-4 py-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        {/* Brand */}
                        <div className="col-span-1 md:col-span-2">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                                    <span className="text-white text-sm font-bold">K</span>
                                </div>
                                <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                                    Krystaline
                                </h2>
                            </div>
                            <p className="text-cyan-100/70 text-sm mb-2">The First Crypto Exchange with Proof of Observability™</p>
                            <p className="text-cyan-100/50 text-xs">
                                Building trust through transparency • Powered by OpenTelemetry
                            </p>
                        </div>

                        {/* Links */}
                        <div>
                            <h3 className="text-cyan-100 font-semibold mb-3">Platform</h3>
                            <ul className="space-y-2 text-sm">
                                <li><a href="/trading" className="text-cyan-100/60 hover:text-cyan-400 transition-colors">Trading</a></li>
                                <li><a href="/my-wallet" className="text-cyan-100/60 hover:text-cyan-400 transition-colors">Wallet</a></li>
                                <li><a href="/convert" className="text-cyan-100/60 hover:text-cyan-400 transition-colors">Convert</a></li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-cyan-100 font-semibold mb-3">Transparency</h3>
                            <ul className="space-y-2 text-sm">
                                <li><a href="/" className="text-cyan-100/60 hover:text-cyan-400 transition-colors">Live Dashboard</a></li>
                                <li><a href="/monitor" className="text-cyan-100/60 hover:text-cyan-400 transition-colors">System Monitor</a></li>
                                <li><a href="#" className="text-cyan-100/60 hover:text-cyan-400 transition-colors">API Status</a></li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-cyan-500/20 mt-8 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-cyan-100/50 text-xs">
                            © 2026 Krystaline. All rights reserved.
                        </p>
                        <p className="text-cyan-100/40 text-xs">
                            Last updated: {new Date().toLocaleString()}
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
