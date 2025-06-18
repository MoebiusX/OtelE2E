import { users, payments, traces, spans, type User, type InsertUser, type Payment, type InsertPayment, type Trace, type InsertTrace, type Span, type InsertSpan } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Payment operations
  createPayment(payment: InsertPayment & { traceId: string; spanId: string }): Promise<Payment>;
  getPayment(id: number): Promise<Payment | undefined>;
  getPayments(limit?: number): Promise<Payment[]>;
  updatePaymentStatus(id: number, status: string): Promise<Payment | undefined>;

  // Trace operations
  createTrace(trace: InsertTrace): Promise<Trace>;
  getTrace(traceId: string): Promise<Trace | undefined>;
  getTraces(limit?: number): Promise<Trace[]>;
  updateTraceStatus(traceId: string, status: string, duration?: number): Promise<Trace | undefined>;

  // Span operations
  createSpan(span: InsertSpan): Promise<Span>;
  getSpan(spanId: string): Promise<Span | undefined>;
  getSpansByTrace(traceId: string): Promise<Span[]>;
  updateSpan(spanId: string, updates: Partial<Span>): Promise<Span | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createPayment(paymentData: InsertPayment & { traceId: string; spanId: string }): Promise<Payment> {
    const [payment] = await db
      .insert(payments)
      .values({
        ...paymentData,
        currency: paymentData.currency || "USD",
        status: "pending",
      })
      .returning();
    return payment;
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  async getPayments(limit: number = 10): Promise<Payment[]> {
    const result = await db
      .select()
      .from(payments)
      .orderBy(desc(payments.createdAt))
      .limit(limit);
    return result;
  }

  async updatePaymentStatus(id: number, status: string): Promise<Payment | undefined> {
    const [payment] = await db
      .update(payments)
      .set({ status })
      .where(eq(payments.id, id))
      .returning();
    return payment || undefined;
  }

  async createTrace(traceData: InsertTrace): Promise<Trace> {
    const [trace] = await db
      .insert(traces)
      .values({
        ...traceData,
        status: "active",
        duration: null,
      })
      .returning();
    return trace;
  }

  async getTrace(traceId: string): Promise<Trace | undefined> {
    const [trace] = await db.select().from(traces).where(eq(traces.traceId, traceId));
    return trace || undefined;
  }

  async getTraces(limit: number = 10): Promise<Trace[]> {
    const result = await db
      .select()
      .from(traces)
      .orderBy(desc(traces.createdAt))
      .limit(limit);
    return result;
  }

  async updateTraceStatus(traceId: string, status: string, duration?: number): Promise<Trace | undefined> {
    const [trace] = await db
      .update(traces)
      .set({ 
        status, 
        duration: duration !== undefined ? duration : undefined
      })
      .where(eq(traces.traceId, traceId))
      .returning();
    return trace || undefined;
  }

  async createSpan(spanData: InsertSpan): Promise<Span> {
    const [span] = await db
      .insert(spans)
      .values({
        ...spanData,
        status: spanData.status || "active",
        parentSpanId: spanData.parentSpanId || null,
        tags: spanData.tags || null,
        endTime: spanData.endTime || null,
      })
      .returning();
    return span;
  }

  async getSpan(spanId: string): Promise<Span | undefined> {
    const [span] = await db.select().from(spans).where(eq(spans.spanId, spanId));
    return span || undefined;
  }

  async getSpansByTrace(traceId: string): Promise<Span[]> {
    const result = await db
      .select()
      .from(spans)
      .where(eq(spans.traceId, traceId))
      .orderBy(spans.startTime);
    return result;
  }

  async updateSpan(spanId: string, updates: Partial<Span>): Promise<Span | undefined> {
    const [span] = await db
      .update(spans)
      .set(updates)
      .where(eq(spans.spanId, spanId))
      .returning();
    return span || undefined;
  }
}

export const storage = new DatabaseStorage();
