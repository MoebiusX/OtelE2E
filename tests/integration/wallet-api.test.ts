/**
 * Wallet API Integration Tests
 * 
 * Tests for /api/wallet endpoints
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
    createOrder: vi.fn(),
    updateOrder: vi.fn(),
    updateWallet: vi.fn(),
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
import db from '../../server/db';

function createApp() {
  const app = express();
  app.use(express.json());
  registerRoutes(app);
  return app;
}

describe('Wallet API Integration', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/wallet', () => {
    it('should return wallet for default user (alice)', async () => {
      vi.mocked(storage.getWallet).mockResolvedValue({
        btc: 1.5,
        usd: 50000,
        lastUpdated: new Date(),
      });

      const response = await request(app).get('/api/wallet');

      expect(response.status).toBe(200);
      expect(response.body.btc).toBe(1.5);
      expect(response.body.usd).toBe(50000);
      expect(response.body.btcValue).toBeTypeOf('number');
      expect(response.body.totalValue).toBeTypeOf('number');
    });

    it('should calculate btcValue based on current price', async () => {
      vi.mocked(storage.getWallet).mockResolvedValue({
        btc: 2.0,
        usd: 10000,
        lastUpdated: new Date(),
      });

      const response = await request(app).get('/api/wallet');

      // btcValue should be btc * price (price is between 35000-55000)
      expect(response.body.btcValue).toBeGreaterThan(70000); // 2 * 35000
      expect(response.body.btcValue).toBeLessThan(110000); // 2 * 55000
    });

    it('should accept userId query parameter', async () => {
      vi.mocked(storage.getWallet).mockResolvedValue({
        btc: 0.5,
        usd: 1000,
        lastUpdated: new Date(),
      });

      const response = await request(app).get('/api/wallet?userId=bob');

      expect(response.status).toBe(200);
      expect(storage.getWallet).toHaveBeenCalledWith('bob');
    });

    it('should return 404 for non-existent user', async () => {
      vi.mocked(storage.getWallet).mockResolvedValue(null);

      const response = await request(app).get('/api/wallet?userId=nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('should handle database errors', async () => {
      vi.mocked(storage.getWallet).mockRejectedValue(new Error('DB connection failed'));

      const response = await request(app).get('/api/wallet');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch wallet');
    });
  });

  describe('GET /api/wallet/:userId', () => {
    it('should return wallet for specific user', async () => {
      vi.mocked(storage.getWallet).mockResolvedValue({
        btc: 3.0,
        usd: 25000,
        lastUpdated: new Date(),
      });

      const response = await request(app).get('/api/wallet/charlie');

      expect(response.status).toBe(200);
      expect(storage.getWallet).toHaveBeenCalledWith('charlie');
      expect(response.body.btc).toBe(3.0);
    });

    it('should return 404 for non-existent user', async () => {
      vi.mocked(storage.getWallet).mockResolvedValue(null);

      const response = await request(app).get('/api/wallet/unknown');

      expect(response.status).toBe(404);
    });

    it('should include totalValue calculation', async () => {
      vi.mocked(storage.getWallet).mockResolvedValue({
        btc: 1.0,
        usd: 5000,
        lastUpdated: new Date(),
      });

      const response = await request(app).get('/api/wallet/alice');

      // totalValue = usd + (btc * price)
      expect(response.body.totalValue).toBeGreaterThan(40000); // 5000 + 35000
      expect(response.body.totalValue).toBeLessThan(60000); // 5000 + 55000
    });
  });

  describe('GET /api/price', () => {
    it('should return current BTC price', async () => {
      const response = await request(app).get('/api/price');

      expect(response.status).toBe(200);
      expect(response.body.pair).toBe('BTC/USD');
      expect(response.body.price).toBeTypeOf('number');
      expect(response.body.price).toBeGreaterThan(30000);
      expect(response.body.price).toBeLessThan(60000);
    });

    it('should include 24h change', async () => {
      const response = await request(app).get('/api/price');

      expect(response.body.change24h).toBeTypeOf('number');
    });

    it('should include timestamp', async () => {
      const response = await request(app).get('/api/price');

      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/users', () => {
    it('should return list of verified users', async () => {
      vi.mocked(db.query).mockResolvedValue({
        rows: [
          { id: '1', email: 'alice@demo.com', status: 'verified' },
          { id: '2', email: 'bob@demo.com', status: 'verified' },
        ],
      } as any);

      const response = await request(app).get('/api/users');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('email');
      expect(response.body[0]).toHaveProperty('name');
    });

    it('should extract name from email', async () => {
      vi.mocked(db.query).mockResolvedValue({
        rows: [{ id: '1', email: 'testuser@example.com', status: 'verified' }],
      } as any);

      const response = await request(app).get('/api/users');

      expect(response.body[0].name).toBe('testuser');
    });

    it('should include avatar', async () => {
      vi.mocked(db.query).mockResolvedValue({
        rows: [{ id: '1', email: 'user@test.com', status: 'verified' }],
      } as any);

      const response = await request(app).get('/api/users');

      expect(response.body[0].avatar).toBe('👤');
    });

    it('should handle database errors', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      const response = await request(app).get('/api/users');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch users');
    });
  });
});
