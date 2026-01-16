import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Login() {
    const [, setLocation] = useLocation();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const loginMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Login failed");
            }
            return res.json();
        },
        onSuccess: (data) => {
            // Store tokens
            localStorage.setItem("accessToken", data.tokens.accessToken);
            localStorage.setItem("refreshToken", data.tokens.refreshToken);
            localStorage.setItem("user", JSON.stringify(data.user));
            // Redirect to wallet page
            setLocation("/my-wallet");
        },
        onError: (err: Error) => {
            setError(err.message);
        },
    });

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        loginMutation.mutate();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-slate-900/80 border-slate-700 backdrop-blur">
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                        Welcome Back
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Sign in to your crypto exchange account
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-200">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-200">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                            disabled={loginMutation.isPending}
                        >
                            {loginMutation.isPending ? "Signing in..." : "Sign In"}
                        </Button>
                    </form>
                </CardContent>

                <CardFooter className="flex flex-col gap-2">
                    <div className="text-sm text-slate-400">
                        Don't have an account?{" "}
                        <a href="/register" className="text-purple-400 hover:underline">
                            Create one
                        </a>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
