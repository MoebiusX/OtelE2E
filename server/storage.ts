import { type Order, type Trace, type InsertTrace, type Span, type InsertSpan, type User, type UserWallet, type Transfer } from "@shared/schema";

// ============================================
// USERS - Alice & Bob
// ============================================

export const USERS: User[] = [
  { id: 'alice', name: 'Alice', avatar: '👩' },
  { id: 'bob', name: 'Bob', avatar: '👨' },
];

// ============================================
// STORAGE INTERFACE
// ============================================

export interface IStorage {
  // User operations
  getUsers(): Promise<User[]>;
  getUser(userId: string): Promise<User | undefined>;

  // Wallet operations (per user)
  getWallet(userId: string): Promise<UserWallet | undefined>;
  updateWallet(userId: string, updates: { btc?: number; usd?: number }): Promise<UserWallet | undefined>;

  // Transfer operations
  createTransfer(data: { transferId: string; fromUserId: string; toUserId: string; amount: number; traceId: string; spanId: string }): Promise<Transfer>;
  getTransfers(limit?: number): Promise<Transfer[]>;
  updateTransfer(transferId: string, status: "PENDING" | "COMPLETED" | "FAILED"): Promise<Transfer | undefined>;

  // Order operations
  createOrder(order: { orderId: string; pair: string; side: string; quantity: number; orderType: string; traceId: string; spanId: string; userId?: string }): Promise<Order>;
  getOrders(limit?: number): Promise<Order[]>;
  updateOrder(orderId: string, updates: { status?: "PENDING" | "FILLED" | "REJECTED"; fillPrice?: number; totalValue?: number }): Promise<Order | undefined>;

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

  // Clear all data
  clearAllData(): Promise<void>;
}

// ============================================
// MEMORY STORAGE IMPLEMENTATION
// ============================================

export class MemoryStorage implements IStorage {
  private wallets: Map<string, UserWallet> = new Map();
  private transfers: Map<string, Transfer> = new Map();
  private orders: Map<string, Order> = new Map();
  private traces: Map<string, Trace> = new Map();
  private spans: Map<string, Span> = new Map();
  private nextId = 1;

  constructor() {
    // Initialize wallets for Alice and Bob
    this.wallets.set('alice', {
      userId: 'alice',
      btc: 1.5,
      usd: 50000,
      lastUpdated: new Date(),
    });
    this.wallets.set('bob', {
      userId: 'bob',
      btc: 0.5,
      usd: 10000,
      lastUpdated: new Date(),
    });
  }

  // ============================================
  // USER OPERATIONS
  // ============================================

  async getUsers(): Promise<User[]> {
    return USERS;
  }

  async getUser(userId: string): Promise<User | undefined> {
    return USERS.find(u => u.id === userId);
  }

  // ============================================
  // WALLET OPERATIONS
  // ============================================

  async getWallet(userId: string): Promise<UserWallet | undefined> {
    return this.wallets.get(userId);
  }

  async updateWallet(userId: string, updates: { btc?: number; usd?: number }): Promise<UserWallet | undefined> {
    const wallet = this.wallets.get(userId);
    if (wallet) {
      if (updates.btc !== undefined) wallet.btc = updates.btc;
      if (updates.usd !== undefined) wallet.usd = updates.usd;
      wallet.lastUpdated = new Date();
      return wallet;
    }
    return undefined;
  }

  // ============================================
  // TRANSFER OPERATIONS
  // ============================================

  async createTransfer(data: { transferId: string; fromUserId: string; toUserId: string; amount: number; traceId: string; spanId: string }): Promise<Transfer> {
    const transfer: Transfer = {
      transferId: data.transferId,
      fromUserId: data.fromUserId,
      toUserId: data.toUserId,
      amount: data.amount,
      status: "PENDING",
      traceId: data.traceId,
      spanId: data.spanId,
      createdAt: new Date(),
    };
    this.transfers.set(transfer.transferId, transfer);
    return transfer;
  }

  async getTransfers(limit: number = 10): Promise<Transfer[]> {
    const allTransfers = Array.from(this.transfers.values());
    return allTransfers
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async updateTransfer(transferId: string, status: "PENDING" | "COMPLETED" | "FAILED"): Promise<Transfer | undefined> {
    const transfer = this.transfers.get(transferId);
    if (transfer) {
      transfer.status = status;
      return transfer;
    }
    return undefined;
  }

  // ============================================
  // ORDER OPERATIONS
  // ============================================

  async createOrder(orderData: { orderId: string; pair: string; side: string; quantity: number; orderType: string; traceId: string; spanId: string; userId?: string }): Promise<Order> {
    const order: Order = {
      orderId: orderData.orderId,
      pair: "BTC/USD",
      side: orderData.side as "BUY" | "SELL",
      quantity: orderData.quantity,
      orderType: "MARKET",
      status: "PENDING",
      traceId: orderData.traceId,
      spanId: orderData.spanId,
      createdAt: new Date(),
    };
    this.orders.set(order.orderId, order);
    return order;
  }

  async getOrders(limit: number = 10): Promise<Order[]> {
    const allOrders = Array.from(this.orders.values());
    return allOrders
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async updateOrder(orderId: string, updates: { status?: "PENDING" | "FILLED" | "REJECTED"; fillPrice?: number; totalValue?: number }): Promise<Order | undefined> {
    const order = this.orders.get(orderId);
    if (order) {
      if (updates.status) order.status = updates.status;
      if (updates.fillPrice) order.fillPrice = updates.fillPrice;
      if (updates.totalValue) order.totalValue = updates.totalValue;
      return order;
    }
    return undefined;
  }

  // ============================================
  // TRACE OPERATIONS
  // ============================================

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

  // ============================================
  // SPAN OPERATIONS
  // ============================================

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

  // ============================================
  // CLEAR ALL DATA
  // ============================================

  async clearAllData(): Promise<void> {
    this.orders.clear();
    this.transfers.clear();
    this.traces.clear();
    this.spans.clear();
    this.nextId = 1;

    // Reset wallets to initial state
    this.wallets.set('alice', {
      userId: 'alice',
      btc: 1.5,
      usd: 50000,
      lastUpdated: new Date(),
    });
    this.wallets.set('bob', {
      userId: 'bob',
      btc: 0.5,
      usd: 10000,
      lastUpdated: new Date(),
    });
  }
}

export const storage = new MemoryStorage();