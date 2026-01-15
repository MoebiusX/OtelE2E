import { z } from "zod";

// ============================================
// CRYPTO EXCHANGE SCHEMAS
// ============================================

// Trade Order - submitted by client
export const insertOrderSchema = z.object({
  pair: z.literal("BTC/USD"),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  orderType: z.enum(["MARKET"]),
});

export const orderSchema = z.object({
  orderId: z.string(),
  pair: z.literal("BTC/USD"),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number(),
  orderType: z.enum(["MARKET"]),
  status: z.enum(["PENDING", "FILLED", "REJECTED"]),
  fillPrice: z.number().optional(),
  totalValue: z.number().optional(),
  traceId: z.string(),
  spanId: z.string(),
  createdAt: z.date(),
});

// Trade Execution - returned by order matcher
export const executionSchema = z.object({
  orderId: z.string(),
  executionId: z.string(),
  pair: z.string(),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number(),
  fillPrice: z.number(),
  totalValue: z.number(),
  status: z.enum(["FILLED", "REJECTED"]),
  processorId: z.string(),
  timestamp: z.string(),
});

// Wallet Balance
export const walletSchema = z.object({
  btc: z.number(),
  usd: z.number(),
  lastUpdated: z.date(),
});

// Price Data
export const priceSchema = z.object({
  pair: z.literal("BTC/USD"),
  price: z.number(),
  change24h: z.number(),
  timestamp: z.date(),
});

// ============================================
// MULTI-USER & TRANSFER SCHEMAS
// ============================================

// User
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
});

// User Wallet (extends base wallet with userId)
export const userWalletSchema = walletSchema.extend({
  userId: z.string(),
});

// BTC Transfer between users
export const insertTransferSchema = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  amount: z.number().positive(),
});

export const transferSchema = z.object({
  transferId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  amount: z.number(),
  status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
  traceId: z.string(),
  spanId: z.string(),
  createdAt: z.date(),
});

// ============================================
// TRACE SCHEMAS (unchanged)
// ============================================

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

// ============================================
// TypeScript Types
// ============================================

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Execution = z.infer<typeof executionSchema>;
export type Wallet = z.infer<typeof walletSchema>;
export type Price = z.infer<typeof priceSchema>;

// Multi-user types
export type User = z.infer<typeof userSchema>;
export type UserWallet = z.infer<typeof userWalletSchema>;
export type InsertTransfer = z.infer<typeof insertTransferSchema>;
export type Transfer = z.infer<typeof transferSchema>;

export type InsertTrace = z.infer<typeof insertTraceSchema>;
export type Trace = z.infer<typeof traceSchema>;
export type InsertSpan = z.infer<typeof insertSpanSchema>;
export type Span = z.infer<typeof spanSchema>;

// Legacy type alias for backwards compatibility during migration
export type Payment = Order;
export type InsertPayment = InsertOrder;