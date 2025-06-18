import { users, payments, traces, spans, type User, type InsertUser, type Payment, type InsertPayment, type Trace, type InsertTrace, type Span, type InsertSpan } from "@shared/schema";

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

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private payments: Map<number, Payment>;
  private traces: Map<string, Trace>;
  private spans: Map<string, Span>;
  private currentUserId: number;
  private currentPaymentId: number;
  private currentTraceId: number;
  private currentSpanId: number;

  constructor() {
    this.users = new Map();
    this.payments = new Map();
    this.traces = new Map();
    this.spans = new Map();
    this.currentUserId = 1;
    this.currentPaymentId = 1;
    this.currentTraceId = 1;
    this.currentSpanId = 1;
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Payment operations
  async createPayment(paymentData: InsertPayment & { traceId: string; spanId: string }): Promise<Payment> {
    const id = this.currentPaymentId++;
    const payment: Payment = {
      ...paymentData,
      id,
      status: "pending",
      createdAt: new Date(),
    };
    this.payments.set(id, payment);
    return payment;
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async getPayments(limit: number = 10): Promise<Payment[]> {
    const allPayments = Array.from(this.payments.values());
    return allPayments
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async updatePaymentStatus(id: number, status: string): Promise<Payment | undefined> {
    const payment = this.payments.get(id);
    if (payment) {
      const updatedPayment = { ...payment, status };
      this.payments.set(id, updatedPayment);
      return updatedPayment;
    }
    return undefined;
  }

  // Trace operations
  async createTrace(traceData: InsertTrace): Promise<Trace> {
    const id = this.currentTraceId++;
    const trace: Trace = {
      ...traceData,
      id,
      status: "active",
      duration: null,
      createdAt: new Date(),
    };
    this.traces.set(traceData.traceId, trace);
    return trace;
  }

  async getTrace(traceId: string): Promise<Trace | undefined> {
    return this.traces.get(traceId);
  }

  async getTraces(limit: number = 10): Promise<Trace[]> {
    const allTraces = Array.from(this.traces.values());
    return allTraces
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async updateTraceStatus(traceId: string, status: string, duration?: number): Promise<Trace | undefined> {
    const trace = this.traces.get(traceId);
    if (trace) {
      const updatedTrace = { ...trace, status, duration: duration || trace.duration };
      this.traces.set(traceId, updatedTrace);
      return updatedTrace;
    }
    return undefined;
  }

  // Span operations
  async createSpan(spanData: InsertSpan): Promise<Span> {
    const id = this.currentSpanId++;
    const span: Span = {
      ...spanData,
      id,
      endTime: spanData.endTime || null,
    };
    this.spans.set(spanData.spanId, span);
    return span;
  }

  async getSpan(spanId: string): Promise<Span | undefined> {
    return this.spans.get(spanId);
  }

  async getSpansByTrace(traceId: string): Promise<Span[]> {
    const allSpans = Array.from(this.spans.values());
    return allSpans
      .filter(span => span.traceId === traceId)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  async updateSpan(spanId: string, updates: Partial<Span>): Promise<Span | undefined> {
    const span = this.spans.get(spanId);
    if (span) {
      const updatedSpan = { ...span, ...updates };
      this.spans.set(spanId, updatedSpan);
      return updatedSpan;
    }
    return undefined;
  }
}

export const storage = new MemStorage();
