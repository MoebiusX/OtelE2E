import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertPaymentSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { generateTraceId, generateSpanId, createTraceHeaders } from "@/lib/tracing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, User, MessageSquare, Coins, Route, Send, CheckCircle, Loader2 } from "lucide-react";
import type { z } from "zod";

type PaymentFormData = z.infer<typeof insertPaymentSchema>;

export function PaymentForm() {
  const [currentTraceId, setCurrentTraceId] = useState(generateTraceId());
  const [currentSpanId, setCurrentSpanId] = useState(generateSpanId());
  const [useEmptyTrace, setUseEmptyTrace] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(insertPaymentSchema),
    defaultValues: {
      amount: 1000,
      currency: "USD",
      recipient: "john.doe@example.com",
      description: "Payment for services",
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      // Note: With Jaeger integration, spans are automatically sent to Jaeger
      // via OpenTelemetry SDK instrumentation, not stored in local database

      const headers = useEmptyTrace 
        ? {} // No trace headers - let Kong Gateway inject context
        : {
            'x-trace-id': currentTraceId,
            'x-span-id': currentSpanId,
            ...createTraceHeaders(currentTraceId, currentSpanId)
          };
      
      console.log('Payment submission - useEmptyTrace:', useEmptyTrace, 'headers:', headers);
      const response = await apiRequest("POST", "/api/payments", data, headers);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Payment Submitted Successfully",
        description: `Payment processed with trace ID: ${data.traceId.substring(0, 8)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/traces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      
      // Generate new trace IDs for next payment
      setCurrentTraceId(generateTraceId());
      setCurrentSpanId(generateSpanId());
    },
    onError: (error) => {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PaymentFormData) => {
    paymentMutation.mutate(data);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-800">Submit Payment Request</CardTitle>
          <Badge variant="secondary" className="text-xs">
            Demo Mode
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Payment Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-sm font-medium text-slate-700">
                      <DollarSign className="w-4 h-4 text-slate-400 mr-1" />
                      Amount
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="1000.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        className="focus:ring-2 focus:ring-otel-blue focus:border-otel-blue"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-sm font-medium text-slate-700">
                      <Coins className="w-4 h-4 text-slate-400 mr-1" />
                      Currency
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="focus:ring-2 focus:ring-otel-blue focus:border-otel-blue">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="recipient"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-sm font-medium text-slate-700">
                    <User className="w-4 h-4 text-slate-400 mr-1" />
                    Recipient Account
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="john.doe@example.com"
                      {...field}
                      className="focus:ring-2 focus:ring-otel-blue focus:border-otel-blue"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-sm font-medium text-slate-700">
                    <MessageSquare className="w-4 h-4 text-slate-400 mr-1" />
                    Description
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Payment for services"
                      {...field}
                      className="focus:ring-2 focus:ring-otel-blue focus:border-otel-blue"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Trace Configuration */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center">
                <Route className="w-4 h-4 text-otel-blue mr-2" />
                OpenTelemetry Configuration
              </h3>
              
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <label className="text-xs font-medium text-slate-600">Empty Trace Headers</label>
                  <p className="text-xs text-slate-500">Test Kong Gateway context injection</p>
                </div>
                <Switch
                  checked={useEmptyTrace}
                  onCheckedChange={setUseEmptyTrace}
                />
              </div>

              {!useEmptyTrace && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Trace ID</label>
                    <Input
                      value={currentTraceId}
                      readOnly
                      className="text-xs bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Span ID</label>
                    <Input
                      value={currentSpanId}
                      readOnly
                      className="text-xs bg-white font-mono"
                    />
                  </div>
                </div>
              )}

              {useEmptyTrace && (
                <div className="text-center py-3 text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded">
                  No trace headers will be sent - Kong Gateway will inject context
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={paymentMutation.isPending}
              className="w-full bg-otel-blue hover:bg-blue-700 text-white font-medium py-3 px-4 transition-colors"
            >
              {paymentMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : paymentMutation.isSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Success!
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit Payment
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
