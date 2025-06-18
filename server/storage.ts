import { type User, type InsertUser, type Payment, type InsertPayment, type Trace, type InsertTrace, type Span, type InsertSpan } from "@shared/schema";

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

  // Trace operations - Note: With Jaeger integration, these are primarily for demo UI
  createTrace(trace: InsertTrace): Promise<Trace>;
  getTrace(traceId: string): Promise<Trace | undefined>;
  getTraces(limit?: number): Promise<Trace[]>;
  updateTraceStatus(traceId: string, status: string, duration?: number): Promise<Trace | undefined>;

  // Span operations - Note: With Jaeger integration, these are primarily for demo UI
  createSpan(span: InsertSpan): Promise<Span>;
  getSpan(spanId: string): Promise<Span | undefined>;
  getSpansByTrace(traceId: string): Promise<Span[]>;
  updateSpan(spanId: string, updates: Partial<Span>): Promise<Span | undefined>;
}

export class MemoryStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private payments: Map<number, Payment> = new Map();
  private traces: Map<string, Trace> = new Map();
  private spans: Map<string, Span> = new Map();
  private nextId = 1;

  constructor() {
    this.createDemoData();
  }

  private createDemoData() {
    // Demo payment for UI demonstration
    const demoPayment: Payment = {
      id: this.nextId++,
      amount: 250.75,
      currency: "USD",
      recipient: "alice@example.com",
      description: "Demo payment for Jaeger tracing",
      status: "completed",
      traceId: "demo-trace-001",
      spanId: "demo-span-001",
      createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    };
    this.payments.set(demoPayment.id, demoPayment);

    // Demo trace for UI demonstration
    const demoTrace: Trace = {
      id: this.nextId++,
      traceId: "demo-trace-001",
      rootSpanId: "demo-span-001",
      status: "completed",
      duration: 245,
      startTime: new Date(Date.now() - 1000 * 60 * 30),
      endTime: new Date(Date.now() - 1000 * 60 * 29),
    };
    this.traces.set(demoTrace.traceId, demoTrace);

    // Demo spans for UI demonstration
    const demoSpans: Span[] = [
      {
        id: this.nextId++,
        traceId: "demo-trace-001",
        spanId: "demo-span-001",
        parentSpanId: null,
        operationName: "Payment Request Received",
        serviceName: "payment-api",
        status: "completed",
        duration: 245,
        startTime: new Date(Date.now() - 1000 * 60 * 30),
        endTime: new Date(Date.now() - 1000 * 60 * 29),
        tags: JSON.stringify({ component: "payment-api", amount: 250.75 })
      },
      {
        id: this.nextId++,
        traceId: "demo-trace-001",
        spanId: "demo-span-002",
        parentSpanId: "demo-span-001",
        operationName: "Kong Gateway Route",
        serviceName: "kong-gateway",
        status: "completed",
        duration: 12,
        startTime: new Date(Date.now() - 1000 * 60 * 30),
        endTime: new Date(Date.now() - 1000 * 60 * 29),
        tags: JSON.stringify({ component: "kong-gateway", route: "/payments" })
      }
    ];
    
    demoSpans.forEach(span => this.spans.set(span.spanId, span));
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.username === username) return user;
    }
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      id: this.nextId++,
      username: insertUser.username,
      password: insertUser.password,
    };
    this.users.set(user.id, user);
    return user;
  }

  async createPayment(paymentData: InsertPayment & { traceId: string; spanId: string }): Promise<Payment> {
    const payment: Payment = {
      id: this.nextId++,
      ...paymentData,
      status: "completed",
      createdAt: new Date(),
    };
    this.payments.set(payment.id, payment);
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
      payment.status = status;
      return payment;
    }
    return undefined;
  }

  async createTrace(traceData: InsertTrace): Promise<Trace> {
    const trace: Trace = {
      id: this.nextId++,
      ...traceData,
      status: "active",
      duration: null,
      startTime: new Date(),
      endTime: null,
    };
    this.traces.set(trace.traceId, trace);
    return trace;
  }

  async getTrace(traceId: string): Promise<Trace | undefined> {
    return this.traces.get(traceId);
  }

  async getTraces(limit: number = 10): Promise<Trace[]> {
    const allTraces = Array.from(this.traces.values());
    return allTraces
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  async updateTraceStatus(traceId: string, status: string, duration?: number): Promise<Trace | undefined> {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.status = status;
      trace.duration = duration || null;
      trace.endTime = new Date();
      return trace;
    }
    return undefined;
  }

  async createSpan(spanData: InsertSpan): Promise<Span> {
    const span: Span = {
      id: this.nextId++,
      ...spanData,
      startTime: new Date(),
      endTime: spanData.endTime ? new Date(spanData.endTime) : null,
    };
    this.spans.set(span.spanId, span);
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
      Object.assign(span, updates);
      return span;
    }
    return undefined;
  }
}

export const storage = new MemoryStorage();