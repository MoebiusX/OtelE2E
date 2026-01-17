/**
 * Order API Integration Tests
 * 
 * Tests for /api/orders endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../../server/db', () => ({
  default: {
    query: vi.fn(),
  },
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getWallet: vi.fn(),
    getUsers: vi.fn(),
    getOrders: vi.fn(),
    createOrder: vi.fn(),
    updateOrder: vi.fn(),
    updateWallet: vi.fn(),
    createTransfer: vi.fn(),
    updateTransfer: vi.fn(),
  },
}));

vi.mock('../../server/services/rabbitmq-client', () => ({
  rabbitMQClient: {
    isConnected: vi.fn().mockReturnValue(false),
    publishOrderAndWait: vi.fn(),
  },
}));

vi.mock('../../server/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../server/otel', () => ({
  traces: {
    startSpan: vi.fn(),
  },
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: vi.fn(),
    getSpan: vi.fn(() => ({
      spanContext: () => ({ traceId: 'abcd1234abcd1234abcd1234abcd1234', spanId: 'efgh5678efgh5678' }),
    })),
    getTracer: vi.fn(() => ({
      startActiveSpan: vi.fn((name, fn) => fn({
        end: vi.fn(),
        recordException: vi.fn(),
        setStatus: vi.fn(),
        setAttribute: vi.fn(),
        spanContext: () => ({ traceId: 'abcd1234abcd1234abcd1234abcd1234', spanId: 'efgh5678efgh5678' }),
      })),
    })),
  },
  context: {
    active: vi.fn(),
    with: vi.fn((ctx, fn) => fn()),
  },
  SpanStatusCode: { OK: 0, ERROR: 1 },
}));

import { registerRoutes } from '../../server/api/routes';
import { storage } from '../../server/storage';

function createApp() {
  const app = express();
  app.use(express.json());
  registerRoutes(app);
  return app;
}

describe('Order API Integration', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
    
    // Default mock for getWallet (sufficient funds)
    vi.mocked(storage.getWallet).mockResolvedValue({
      btc: 10.0,
      usd: 500000,
      lastUpdated: new Date(),
    });
    
    // Default mock for createOrder
    vi.mocked(storage.createOrder).mockResolvedValue({
      orderId: 'ORD-test-123',
      pair: 'BTC/USD',
      side: 'BUY',
      quantity: 0.1,
      orderType: 'MARKET',
      status: 'PENDING',
      createdAt: new Date(),
    } as any);
    
    vi.mocked(storage.updateWallet).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/orders', () => {
    it('should create a valid BUY order', async () => {
      const orderRequest = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 0.1,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.orderId).toMatch(/^ORD-/);
      expect(response.body.order.pair).toBe('BTC/USD');
      expect(response.body.order.side).toBe('BUY');
      expect(response.body.order.quantity).toBe(0.1);
    });

    it('should create a valid SELL order', async () => {
      const orderRequest = {
        pair: 'BTC/USD',
        side: 'SELL',
        quantity: 0.5,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.side).toBe('SELL');
    });

    it('should include traceId and spanId in response', async () => {
      const orderRequest = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 0.1,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest);

      expect(response.body.traceId).toBeDefined();
      expect(response.body.spanId).toBeDefined();
    });

    it('should accept custom userId', async () => {
      const orderRequest = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 0.1,
        orderType: 'MARKET',
        userId: 'bob@demo.com',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest);

      expect(response.status).toBe(200);
      expect(storage.getWallet).toHaveBeenCalledWith('bob@demo.com');
    });

    it('should return 400 for invalid order data', async () => {
      const invalidOrder = {
        pair: 'BTC/USD',
        // missing side
        quantity: 0.1,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(invalidOrder);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid order request');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for invalid side value', async () => {
      const invalidOrder = {
        pair: 'BTC/USD',
        side: 'INVALID',
        quantity: 0.1,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(invalidOrder);

      expect(response.status).toBe(400);
    });

    it('should return 400 for negative quantity', async () => {
      const invalidOrder = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: -1,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(invalidOrder);

      expect(response.status).toBe(400);
    });

    it('should return 400 for zero quantity', async () => {
      const invalidOrder = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 0,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(invalidOrder);

      expect(response.status).toBe(400);
    });

    it('should return execution details for successful order', async () => {
      const orderRequest = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 0.1,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest);

      expect(response.body.execution).toBeDefined();
      expect(response.body.execution.status).toBeDefined();
    });

    it('should return updated wallet after order', async () => {
      const orderRequest = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 0.1,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest);

      expect(response.body.wallet).toBeDefined();
    });

    it('should handle incoming traceparent header', async () => {
      const orderRequest = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 0.1,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest)
        .set('traceparent', '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/orders', () => {
    it('should return list of orders', async () => {
      vi.mocked(storage.getOrders).mockResolvedValue([
        {
          orderId: 'ORD-1',
          pair: 'BTC/USD',
          side: 'BUY',
          quantity: 0.5,
          status: 'FILLED',
          createdAt: new Date(),
        },
        {
          orderId: 'ORD-2',
          pair: 'BTC/USD',
          side: 'SELL',
          quantity: 0.2,
          status: 'PENDING',
          createdAt: new Date(),
        },
      ] as any);

      const response = await request(app).get('/api/orders');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should return empty array when no orders exist', async () => {
      vi.mocked(storage.getOrders).mockResolvedValue([]);

      const response = await request(app).get('/api/orders');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should handle database errors', async () => {
      vi.mocked(storage.getOrders).mockRejectedValue(new Error('DB Error'));

      const response = await request(app).get('/api/orders');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch orders');
    });
  });

  describe('Order Validation Edge Cases', () => {
    it('should only accept BTC/USD pair (schema constraint)', async () => {
      // The schema is strict - only BTC/USD is allowed
      const orderRequest = {
        pair: 'ETH/USD',
        side: 'BUY',
        quantity: 1.0,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest);

      // ETH/USD is not a valid pair according to the schema
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid order request');
    });

    it('should accept very small quantities', async () => {
      const orderRequest = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 0.00001,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest);

      expect(response.status).toBe(200);
    });

    it('should accept large quantities', async () => {
      const orderRequest = {
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 100,
        orderType: 'MARKET',
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderRequest);

      expect(response.status).toBe(200);
    });
  });
});
