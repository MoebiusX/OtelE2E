import { z } from "zod";

// User schema
export const insertUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  password: z.string(),
});

// Payment schema
export const insertPaymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(1),
  recipient: z.string().email(),
  description: z.string().optional(),
});

export const paymentSchema = z.object({
  id: z.number(),
  amount: z.number(),
  currency: z.string(),
  recipient: z.string(),
  description: z.string().optional(),
  status: z.string(),
  traceId: z.string(),
  spanId: z.string(),
  createdAt: z.date(),
});

// Trace schema
export const insertTraceSchema = z.object({
  traceId: z.string(),
  rootSpanId: z.string(),
});

export const traceSchema = z.object({
  id: z.number(),
  traceId: z.string(),
  rootSpanId: z.string(),
  status: z.string(),
  duration: z.number().nullable(),
  startTime: z.date(),
  endTime: z.date().nullable(),
});

// Span schema
export const insertSpanSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  operationName: z.string(),
  serviceName: z.string(),
  status: z.string().optional(),
  duration: z.number().optional(),
  endTime: z.string().optional(),
  tags: z.string().optional(),
});

export const spanSchema = z.object({
  id: z.number(),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  operationName: z.string(),
  serviceName: z.string(),
  status: z.string(),
  duration: z.number().nullable(),
  startTime: z.date(),
  endTime: z.date().nullable(),
  tags: z.string().nullable(),
});

// TypeScript types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = z.infer<typeof userSchema>;

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = z.infer<typeof paymentSchema>;

export type InsertTrace = z.infer<typeof insertTraceSchema>;
export type Trace = z.infer<typeof traceSchema>;

export type InsertSpan = z.infer<typeof insertSpanSchema>;
export type Span = z.infer<typeof spanSchema>;