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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
            {/* Header */}
            <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur-lg sticky top-0 z-50">
                <div className="container mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        {/* Logo */}
                        <a href="/" className="flex items-center gap-2">
                            <span className="text-2xl">💎</span>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                                Krystaline
                            </h1>
                        </a>

                        {/* Nav Links */}
                        <nav className="hidden md:flex items-center gap-4">
                            <a
                                href="/"
                                className={`text-sm transition-colors ${location === '/' ? 'text-purple-400' : 'text-slate-400 hover:text-white'}`}
                            >
                                Dashboard
                            </a>
                            {user && (
                                <>
                                    <a
                                        href="/my-wallet"
                                        className={`text-sm transition-colors ${location === '/my-wallet' ? 'text-purple-400' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        Wallet
                                    </a>
                                    <a
                                        href="/convert"
                                        className={`text-sm transition-colors ${location === '/convert' ? 'text-purple-400' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        Convert
                                    </a>
                                </>
                            )}
                            <a
                                href="/monitor"
                                className={`text-sm transition-colors ${location === '/monitor' ? 'text-purple-400' : 'text-slate-400 hover:text-white'}`}
                            >
                                Monitor
                            </a>
                        </nav>
                    </div>

                    {/* Right side */}
                    {showAuth && (
                        <div className="flex items-center gap-4">
                            {user ? (
                                <>
                                    <span className="text-slate-400 text-sm hidden sm:inline">{user.email}</span>
                                    <Badge variant="outline" className="border-emerald-500 text-emerald-400 hidden sm:flex">
                                        ✓ Verified
                                    </Badge>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleLogout}
                                        className="text-slate-400 hover:text-white"
                                    >
                                        Logout
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <a href="/login">
                                        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                                            Sign In
                                        </Button>
                                    </a>
                                    <a href="/register">
                                        <Button size="sm" className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
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
            <footer className="border-t border-slate-700 bg-slate-900/80 backdrop-blur-lg mt-auto">
                <div className="container mx-auto px-4 py-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        {/* Brand */}
                        <div className="col-span-1 md:col-span-2">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-2xl">💎</span>
                                <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                                    Krystaline
                                </h2>
                            </div>
                            <p className="text-slate-400 text-sm mb-2">Crystal Clear Crypto</p>
                            <p className="text-slate-500 text-xs">
                                Proof of Observability • Proof of Trust
                            </p>
                        </div>

                        {/* Links */}
                        <div>
                            <h3 className="text-white font-semibold mb-3">Platform</h3>
                            <ul className="space-y-2 text-sm">
                                <li><a href="/my-wallet" className="text-slate-400 hover:text-purple-400 transition-colors">Wallet</a></li>
                                <li><a href="#" className="text-slate-400 hover:text-purple-400 transition-colors">Trade</a></li>
                                <li><a href="#" className="text-slate-400 hover:text-purple-400 transition-colors">Convert</a></li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-white font-semibold mb-3">Resources</h3>
                            <ul className="space-y-2 text-sm">
                                <li><a href="/monitor" className="text-slate-400 hover:text-purple-400 transition-colors">Observability</a></li>
                                <li><a href="#" className="text-slate-400 hover:text-purple-400 transition-colors">API Docs</a></li>
                                <li><a href="#" className="text-slate-400 hover:text-purple-400 transition-colors">Support</a></li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-slate-800 mt-8 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-slate-500 text-xs">
                            © 2026 Krystaline. All rights reserved.
                        </p>
                        <Badge variant="outline" className="border-purple-500/50 text-purple-400 text-xs">
                            Demo Mode - Test Environment
                        </Badge>
                    </div>
                </div>
            </footer>
        </div>
    );
}
