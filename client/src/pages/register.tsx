import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Register() {
    const [, setLocation] = useLocation();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [step, setStep] = useState<"register" | "verify">("register");
    const [verificationCode, setVerificationCode] = useState("");

    const registerMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || data.details?.join(", ") || "Registration failed");
            }
            return res.json();
        },
        onSuccess: () => {
            setStep("verify");
            setError("");
        },
        onError: (err: Error) => {
            setError(err.message);
        },
    });

    const verifyMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/auth/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, code: verificationCode }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Verification failed");
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

    const handleRegister = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        registerMutation.mutate();
    };

    const handleVerify = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        verifyMutation.mutate();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-slate-900/80 border-slate-700 backdrop-blur">
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                        {step === "register" ? "Create Account" : "Verify Email"}
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        {step === "register"
                            ? "Start trading crypto in minutes"
                            : `We sent a code to ${email}`}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {step === "register" ? (
                        <form onSubmit={handleRegister} className="space-y-4">
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
                                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" className="text-slate-200">Confirm Password</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="Repeat password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                                disabled={registerMutation.isPending}
                            >
                                {registerMutation.isPending ? "Creating Account..." : "Create Account"}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleVerify} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="code" className="text-slate-200">Verification Code</Label>
                                <Input
                                    id="code"
                                    type="text"
                                    placeholder="Enter 6-digit code"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value)}
                                    maxLength={6}
                                    required
                                    className="bg-slate-800 border-slate-700 text-white text-center text-2xl tracking-widest"
                                />
                                <p className="text-sm text-slate-400 text-center">
                                    Check your email or view at <a href="http://localhost:1080" target="_blank" className="text-purple-400 hover:underline">localhost:1080</a>
                                </p>
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                                disabled={verifyMutation.isPending}
                            >
                                {verifyMutation.isPending ? "Verifying..." : "Verify & Continue"}
                            </Button>
                        </form>
                    )}
                </CardContent>

                <CardFooter className="flex flex-col gap-2">
                    <div className="text-sm text-slate-400">
                        Already have an account?{" "}
                        <a href="/login" className="text-purple-400 hover:underline">
                            Sign in
                        </a>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
