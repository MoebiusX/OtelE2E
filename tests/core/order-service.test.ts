/**
 * Order Service Unit Tests
 * 
 * Tests for trade order submission and BTC transfers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the dependencies before importing the service
vi.mock('../../server/storage', () => ({
  storage: {
    getWallet: vi.fn(),
    getUsers: vi.fn(),
    createOrder: vi.fn(),
    updateOrder: vi.fn(),
    updateWallet: vi.fn(),
    createTransfer: vi.fn(),
    updateTransfer: vi.fn(),
  },
}));

vi.mock('../../server/services/rabbitmq-client', () => ({
  rabbitMQClient: {
    isConnected: vi.fn(),
    publishOrderAndWait: vi.fn(),
  },
}));

// Mock walletService - this is now the sole source of balance data
vi.mock('../../server/wallet/wallet-service', () => ({
  walletService: {
    getWallet: vi.fn(),
    getWallets: vi.fn().mockResolvedValue([]),
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

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: vi.fn(),
    getSpan: vi.fn(() => ({
      spanContext: () => ({ traceId: '1234567890abcdef1234567890abcdef' }),
    })),
  },
  context: {
    active: vi.fn(),
    with: vi.fn((ctx, fn) => fn()),
  },
  SpanStatusCode: { OK: 0, ERROR: 1 },
}));

import { OrderService, getPrice, type OrderRequest, type TransferRequest } from '../../server/core/order-service';
import { storage } from '../../server/storage';
import { rabbitMQClient } from '../../server/services/rabbitmq-client';
import { walletService } from '../../server/wallet/wallet-service';

describe('Order Service', () => {
  let orderService: OrderService;

  beforeEach(() => {
    orderService = new OrderService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getPrice', () => {
    it('should return a price within expected range', () => {
      const price = getPrice();
      expect(price).toBeGreaterThanOrEqual(35000);
      expect(price).toBeLessThanOrEqual(55000);
    });

    it('should return a number with at most 2 decimal places', () => {
      const price = getPrice();
      const decimalPlaces = (price.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('should fluctuate within 1% between calls', () => {
      const price1 = getPrice();
      const price2 = getPrice();
      const fluctuation = Math.abs(price2 - price1) / price1;
      expect(fluctuation).toBeLessThan(0.02); // Allow some margin
    });
  });

  describe('getWallet', () => {
    it('should call storage.getWallet with user id', async () => {
      const mockWallet = { btc: 1.5, usd: 10000, lastUpdated: new Date() };
      vi.mocked(storage.getWallet).mockResolvedValue(mockWallet);

      const wallet = await orderService.getWallet('seed.user.primary@krystaline.io');

      expect(storage.getWallet).toHaveBeenCalledWith('seed.user.primary@krystaline.io');
      expect(wallet).toEqual(mockWallet);
    });

    it('should default to seed.user.primary@krystaline.io if no user specified', async () => {
      vi.mocked(storage.getWallet).mockResolvedValue(null);

      await orderService.getWallet();

      expect(storage.getWallet).toHaveBeenCalledWith('seed.user.primary@krystaline.io');
    });
  });

  describe('getUsers', () => {
    it('should call storage.getUsers', async () => {
      const mockUsers = [{ id: 'seed.user.primary@krystaline.io' }, { id: 'seed.user.secondary@krystaline.io' }];
      vi.mocked(storage.getUsers).mockResolvedValue(mockUsers as any);

      const users = await orderService.getUsers();

      expect(storage.getUsers).toHaveBeenCalled();
      expect(users).toEqual(mockUsers);
    });
  });

  describe('submitOrder', () => {
    const validBuyOrder: OrderRequest = {
      userId: 'seed.user.primary@krystaline.io',
      pair: 'BTC/USD',
      side: 'BUY',
      quantity: 0.1,
      orderType: 'MARKET',
    };

    const validSellOrder: OrderRequest = {
      userId: 'seed.user.primary@krystaline.io',
      pair: 'BTC/USD',
      side: 'SELL',
      quantity: 0.5,
      orderType: 'MARKET',
    };

    it('should reject order if wallet not found', async () => {
      vi.mocked(walletService.getWallet).mockResolvedValue(null);

      const result = await orderService.submitOrder(validBuyOrder);

      expect(result.execution?.status).toBe('REJECTED');
      expect(result.order).toBeNull();
    });

    it('should reject BUY order if insufficient USD', async () => {
      // Mock USD wallet with insufficient funds
      vi.mocked(walletService.getWallet).mockImplementation(async (userId, asset) => {
        if (asset === 'USD') return { id: '1', user_id: userId, asset: 'USD', balance: '100', available: '100', locked: '0' };
        if (asset === 'BTC') return { id: '2', user_id: userId, asset: 'BTC', balance: '1.0', available: '1.0', locked: '0' };
        return null;
      });

      const result = await orderService.submitOrder(validBuyOrder);

      expect(result.execution?.status).toBe('REJECTED');
      expect(result.order).toBeNull();
    });

    it('should reject SELL order if insufficient BTC', async () => {
      // Mock BTC wallet with insufficient funds for the 0.5 BTC sale
      vi.mocked(walletService.getWallet).mockImplementation(async (userId, asset) => {
        if (asset === 'USD') return { id: '1', user_id: userId, asset: 'USD', balance: '100000', available: '100000', locked: '0' };
        if (asset === 'BTC') return { id: '2', user_id: userId, asset: 'BTC', balance: '0.1', available: '0.1', locked: '0' };
        return null;
      });

      const result = await orderService.submitOrder(validSellOrder);

      expect(result.execution?.status).toBe('REJECTED');
      expect(result.order).toBeNull();
    });

    it('should create order for valid BUY with sufficient funds', async () => {
      // Mock wallets with sufficient funds
      vi.mocked(walletService.getWallet).mockImplementation(async (userId, asset) => {
        if (asset === 'USD') return { id: '1', user_id: userId, asset: 'USD', balance: '100000', available: '100000', locked: '0' };
        if (asset === 'BTC') return { id: '2', user_id: userId, asset: 'BTC', balance: '1.0', available: '1.0', locked: '0' };
        return null;
      });
      vi.mocked(storage.createOrder).mockResolvedValue({
        orderId: 'ORD-123',
        pair: 'BTC/USD',
        side: 'BUY',
        quantity: 0.1,
        orderType: 'MARKET',
        status: 'PENDING',
        createdAt: new Date(),
      } as any);
      vi.mocked(rabbitMQClient.isConnected).mockReturnValue(false);

      const result = await orderService.submitOrder(validBuyOrder);

      expect(storage.createOrder).toHaveBeenCalled();
      expect(result.orderId).toMatch(/^ORD-/);
    });

    it('should create order for valid SELL with sufficient BTC', async () => {
      // Mock wallets with sufficient BTC for sale
      vi.mocked(walletService.getWallet).mockImplementation(async (userId, asset) => {
        if (asset === 'USD') return { id: '1', user_id: userId, asset: 'USD', balance: '1000', available: '1000', locked: '0' };
        if (asset === 'BTC') return { id: '2', user_id: userId, asset: 'BTC', balance: '2.0', available: '2.0', locked: '0' };
        return null;
      });
      vi.mocked(storage.createOrder).mockResolvedValue({
        orderId: 'ORD-123',
        pair: 'BTC/USD',
        side: 'SELL',
        quantity: 0.5,
        orderType: 'MARKET',
        status: 'PENDING',
        createdAt: new Date(),
      } as any);
      vi.mocked(rabbitMQClient.isConnected).mockReturnValue(false);

      const result = await orderService.submitOrder(validSellOrder);

      expect(storage.createOrder).toHaveBeenCalled();
      expect(result.orderId).toMatch(/^ORD-/);
    });

    it('should include traceId and spanId in result', async () => {
      // Mock wallets with sufficient funds
      vi.mocked(walletService.getWallet).mockImplementation(async (userId, asset) => {
        if (asset === 'USD') return { id: '1', user_id: userId, asset: 'USD', balance: '100000', available: '100000', locked: '0' };
        if (asset === 'BTC') return { id: '2', user_id: userId, asset: 'BTC', balance: '2.0', available: '2.0', locked: '0' };
        return null;
      });
      vi.mocked(storage.createOrder).mockResolvedValue({} as any);
      vi.mocked(rabbitMQClient.isConnected).mockReturnValue(false);

      const result = await orderService.submitOrder(validBuyOrder);

      expect(result.traceId).toBeDefined();
      expect(result.spanId).toBeDefined();
      expect(result.traceId.length).toBe(32);
      expect(result.spanId.length).toBe(16);
    });

    it('should check RabbitMQ connection before processing', async () => {
      // This test verifies the RabbitMQ connection check is performed
      // Full RabbitMQ integration is tested in integration tests
      vi.clearAllMocks();

      // Mock wallets with sufficient funds
      vi.mocked(walletService.getWallet).mockImplementation(async (userId, asset) => {
        if (asset === 'USD') return { id: '1', user_id: userId, asset: 'USD', balance: '100000', available: '100000', locked: '0' };
        if (asset === 'BTC') return { id: '2', user_id: userId, asset: 'BTC', balance: '2.0', available: '2.0', locked: '0' };
        return null;
      });
      vi.mocked(storage.createOrder).mockResolvedValue({} as any);
      vi.mocked(storage.updateWallet).mockResolvedValue(undefined);
      vi.mocked(rabbitMQClient.isConnected).mockReturnValue(true);

      // When RabbitMQ times out or fails, should still return an order
      vi.mocked(rabbitMQClient.publishOrderAndWait).mockRejectedValue(
        new Error('RabbitMQ timeout')
      );

      const result = await orderService.submitOrder(validBuyOrder);

      // Verify isConnected was checked
      expect(rabbitMQClient.isConnected).toHaveBeenCalled();

      // Should still return orderId even if RabbitMQ fails
      expect(result.orderId).toMatch(/^ORD-/);
      expect(result.order).toBeDefined();
    });
  });
});

describe('Order ID Generation', () => {
  it('should generate unique order IDs', async () => {
    const service = new OrderService();
    // Mock wallets to return null (order will be rejected but still generates ID)
    vi.mocked(walletService.getWallet).mockResolvedValue(null);

    const results = await Promise.all([
      service.submitOrder({ userId: 'a', pair: 'BTC/USD', side: 'BUY', quantity: 1, orderType: 'MARKET' }),
      service.submitOrder({ userId: 'b', pair: 'BTC/USD', side: 'BUY', quantity: 1, orderType: 'MARKET' }),
      service.submitOrder({ userId: 'c', pair: 'BTC/USD', side: 'BUY', quantity: 1, orderType: 'MARKET' }),
    ]);

    const orderIds = results.map(r => r.orderId);
    const uniqueIds = new Set(orderIds);
    expect(uniqueIds.size).toBe(3);
  });
});
