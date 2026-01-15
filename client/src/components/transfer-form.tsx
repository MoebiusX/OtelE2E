import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Loader2, Send, Bitcoin } from "lucide-react";

const transferSchema = z.object({
    fromUserId: z.string(),
    toUserId: z.string(),
    amount: z.number().positive().max(10),
});

type TransferFormData = z.infer<typeof transferSchema>;

interface User {
    id: string;
    name: string;
    avatar?: string;
}

interface TransferFormProps {
    currentUser: string;
}

export function TransferForm({ currentUser }: TransferFormProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: users } = useQuery<User[]>({
        queryKey: ["/api/users"],
    });

    const otherUser = users?.find(u => u.id !== currentUser);

    const form = useForm<TransferFormData>({
        resolver: zodResolver(transferSchema),
        defaultValues: {
            fromUserId: currentUser,
            toUserId: otherUser?.id || '',
            amount: 0.01,
        },
    });

    // Update form when user changes
    if (form.getValues('fromUserId') !== currentUser && otherUser) {
        form.setValue('fromUserId', currentUser);
        form.setValue('toUserId', otherUser.id);
    }

    const transferMutation = useMutation({
        mutationFn: async (data: TransferFormData) => {
            const tracer = trace.getTracer('crypto-wallet');

            return tracer.startActiveSpan('transfer.submit.client', async (parentSpan) => {
                const parentContext = context.active();

                try {
                    parentSpan.setAttribute('transfer.from', data.fromUserId);
                    parentSpan.setAttribute('transfer.to', data.toUserId);
                    parentSpan.setAttribute('transfer.amount', data.amount);

                    const response = await apiRequest("POST", "/api/transfer", data);
                    const result = await response.json();

                    context.with(trace.setSpan(parentContext, parentSpan), () => {
                        const responseSpan = tracer.startSpan('transfer.response.received');
                        responseSpan.setAttribute('transfer.id', result.transferId || 'unknown');
                        responseSpan.setAttribute('transfer.status', result.status || 'UNKNOWN');
                        responseSpan.setStatus({ code: SpanStatusCode.OK });
                        responseSpan.end();
                    });

                    parentSpan.setStatus({ code: SpanStatusCode.OK });
                    return result;
                } catch (error: any) {
                    parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                    throw error;
                } finally {
                    parentSpan.end();
                }
            });
        },
        onSuccess: (data) => {
            const fromUser = users?.find(u => u.id === form.getValues('fromUserId'));
            const toUser = users?.find(u => u.id === form.getValues('toUserId'));

            toast({
                title: data.status === 'COMPLETED' ? "Transfer Complete! ✓" : "Transfer Failed",
                description: (
                    <div className="space-y-1 text-sm">
                        <p>
                            {fromUser?.avatar} {fromUser?.name} → {toUser?.avatar} {toUser?.name}
                        </p>
                        <p className="font-mono">{form.getValues('amount')} BTC</p>
                        {data.message && <p className="text-red-400">{data.message}</p>}
                        <a
                            href={`http://localhost:16686/trace/${data.traceId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline text-xs block mt-2"
                        >
                            View trace in Jaeger →
                        </a>
                    </div>
                ),
                variant: data.status === 'COMPLETED' ? 'default' : 'destructive',
            });

            queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
            queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
            queryClient.invalidateQueries({ queryKey: ["/api/traces"] });
        },
        onError: (error) => {
            toast({
                title: "Transfer Failed",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: TransferFormData) => {
        transferMutation.mutate({
            ...data,
            fromUserId: currentUser,
            toUserId: otherUser?.id || ''
        });
    };

    const currentUserData = users?.find(u => u.id === currentUser);

    return (
        <Card className="w-full bg-slate-900 border-slate-700 text-white">
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Send className="w-5 h-5 text-purple-400" />
                    Transfer BTC
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* Transfer Direction */}
                <div className="flex items-center justify-center gap-4 p-4 bg-slate-800 rounded-lg">
                    <div className="text-center">
                        <div className="text-3xl mb-1">{currentUserData?.avatar}</div>
                        <div className="text-sm font-medium">{currentUserData?.name}</div>
                        <div className="text-xs text-slate-400">Sender</div>
                    </div>
                    <ArrowRight className="w-8 h-8 text-purple-400" />
                    <div className="text-center">
                        <div className="text-3xl mb-1">{otherUser?.avatar}</div>
                        <div className="text-sm font-medium">{otherUser?.name}</div>
                        <div className="text-xs text-slate-400">Recipient</div>
                    </div>
                </div>

                {/* Transfer Form */}
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="amount"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-slate-300 flex items-center gap-2">
                                        <Bitcoin className="w-4 h-4 text-orange-400" />
                                        Amount (BTC)
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            step="0.001"
                                            min="0.001"
                                            max="10"
                                            placeholder="0.1"
                                            {...field}
                                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                            className="bg-slate-800 border-slate-600 text-white font-mono text-lg h-12"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button
                            type="submit"
                            disabled={transferMutation.isPending || !otherUser}
                            className="w-full h-14 text-lg font-bold bg-purple-600 hover:bg-purple-700"
                        >
                            {transferMutation.isPending ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5 mr-2" />
                                    Send {form.watch("amount")?.toFixed(4) || '0'} BTC to {otherUser?.name}
                                </>
                            )}
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
