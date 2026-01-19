/**
 * Payment Service Unit Tests
 *
 * Tests for legacy payment processing service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../server/services/rabbitmq-client', () => ({
  rabbitMQClient: {
    isConnected: vi.fn(),
    publishPaymentAndWait: vi.fn(),
  },
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: vi.fn(),
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

import { PaymentService, paymentService } from '../../server/core/payment-service';
import { rabbitMQClient } from '../../server/services/rabbitmq-client';
import { trace } from '@opentelemetry/api';

describe('Payment Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear payment store between tests
    paymentService.clearAllData();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('processPayment', () => {
    const testPayment = {
      amount: 100,
      currency: 'USD',
      recipient: 'user@example.com',
      description: 'Test payment',
    };

    describe('Without RabbitMQ', () => {
      beforeEach(() => {
        vi.mocked(rabbitMQClient.isConnected).mockReturnValue(false);
      });

      it('should process payment and return result', async () => {
        const result = await paymentService.processPayment(testPayment);

        expect(result.paymentId).toBe(1);
        expect(result.traceId).toBeDefined();
        expect(result.spanId).toBeDefined();
        expect(result.processorResponse).toBeUndefined();
      });

      it('should store payment in memory', async () => {
        await paymentService.processPayment(testPayment);

        const payments = await paymentService.getPayments();
        expect(payments.length).toBe(1);
        expect(payments[0].amount).toBe(100);
        expect(payments[0].currency).toBe('USD');
      });

      it('should increment payment ID', async () => {
        const result1 = await paymentService.processPayment(testPayment);
        const result2 = await paymentService.processPayment(testPayment);

        expect(result1.paymentId).toBe(1);
        expect(result2.paymentId).toBe(2);
      });

      it('should generate unique trace IDs', async () => {
        const result1 = await paymentService.processPayment(testPayment);
        const result2 = await paymentService.processPayment(testPayment);

        expect(result1.traceId).not.toBe(result2.traceId);
      });
    });

    describe('With RabbitMQ connected', () => {
      beforeEach(() => {
        vi.mocked(rabbitMQClient.isConnected).mockReturnValue(true);
      });

      it('should publish to RabbitMQ and wait for response', async () => {
        vi.mocked(rabbitMQClient.publishPaymentAndWait).mockResolvedValue({
          status: 'completed',
          processedAt: new Date().toISOString(),
          processorId: 'proc-123',
        });

        const result = await paymentService.processPayment(testPayment);

        expect(rabbitMQClient.publishPaymentAndWait).toHaveBeenCalledWith(
          expect.objectContaining({
            paymentId: 1,
            amount: 100,
            currency: 'USD',
          }),
          5000,
        );
        expect(result.processorResponse).toBeDefined();
        expect(result.processorResponse?.status).toBe('completed');
      });

      it('should handle RabbitMQ timeout', async () => {
        vi.mocked(rabbitMQClient.publishPaymentAndWait).mockRejectedValue(new Error('Timeout'));

        const result = await paymentService.processPayment(testPayment);

        expect(result.paymentId).toBe(1);
        expect(result.processorResponse).toBeUndefined();
      });

      it('should handle RabbitMQ error gracefully', async () => {
        vi.mocked(rabbitMQClient.publishPaymentAndWait).mockRejectedValue(
          new Error('Connection lost'),
        );

        const result = await paymentService.processPayment(testPayment);

        expect(result.paymentId).toBeDefined();
        expect(result.traceId).toBeDefined();
      });
    });

    describe('OpenTelemetry integration', () => {
      it('should use active span context when available', async () => {
        vi.mocked(rabbitMQClient.isConnected).mockReturnValue(false);
        vi.mocked(trace.getActiveSpan).mockReturnValue({
          spanContext: () => ({
            traceId: 'real-trace-id-12345678901234567890',
            spanId: 'real-span-123456789012',
          }),
        } as any);

        const result = await paymentService.processPayment(testPayment);

        expect(result.traceId).toBe('real-trace-id-12345678901234567890');
        expect(result.spanId).toBe('real-span-123456789012');
      });

      it('should generate fallback IDs when no active span', async () => {
        vi.mocked(rabbitMQClient.isConnected).mockReturnValue(false);
        vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

        const result = await paymentService.processPayment(testPayment);

        expect(result.traceId).toHaveLength(32);
        expect(result.spanId).toHaveLength(16);
      });
    });
  });

  describe('getPayments', () => {
    beforeEach(() => {
      vi.mocked(rabbitMQClient.isConnected).mockReturnValue(false);
    });

    it('should return empty array initially', async () => {
      const payments = await paymentService.getPayments();
      expect(payments).toEqual([]);
    });

    it('should return stored payments', async () => {
      await paymentService.processPayment({
        amount: 50,
        currency: 'EUR',
        recipient: 'user1@test.com',
        description: 'Test 1',
      });
      await paymentService.processPayment({
        amount: 75,
        currency: 'GBP',
        recipient: 'user2@test.com',
        description: 'Test 2',
      });

      const payments = await paymentService.getPayments();

      expect(payments.length).toBe(2);
    });

    it('should limit results', async () => {
      for (let i = 0; i < 15; i++) {
        await paymentService.processPayment({
          amount: i * 10,
          currency: 'USD',
          recipient: 'user@test.com',
          description: `Payment ${i}`,
        });
      }

      const payments = await paymentService.getPayments(5);

      expect(payments.length).toBe(5);
    });

    it('should return most recent payments', async () => {
      for (let i = 1; i <= 15; i++) {
        await paymentService.processPayment({
          amount: i * 100,
          currency: 'USD',
          recipient: 'user@test.com',
          description: `Payment ${i}`,
        });
      }

      const payments = await paymentService.getPayments(3);

      // Should be last 3 (amounts 1300, 1400, 1500)
      expect(payments[0].amount).toBe(1300);
      expect(payments[2].amount).toBe(1500);
    });
  });

  describe('getPayment', () => {
    beforeEach(() => {
      vi.mocked(rabbitMQClient.isConnected).mockReturnValue(false);
    });

    it('should return undefined for non-existent payment', async () => {
      const payment = await paymentService.getPayment(999);
      expect(payment).toBeUndefined();
    });

    it('should return payment by ID', async () => {
      await paymentService.processPayment({
        amount: 200,
        currency: 'USD',
        recipient: 'target@test.com',
        description: 'Find me',
      });

      const payment = await paymentService.getPayment(1);

      expect(payment).toBeDefined();
      expect(payment?.amount).toBe(200);
      expect(payment?.recipient).toBe('target@test.com');
    });

    it('should find correct payment among multiple', async () => {
      await paymentService.processPayment({
        amount: 100,
        currency: 'USD',
        recipient: 'user1@test.com',
        description: 'First',
      });
      await paymentService.processPayment({
        amount: 200,
        currency: 'EUR',
        recipient: 'user2@test.com',
        description: 'Second',
      });
      await paymentService.processPayment({
        amount: 300,
        currency: 'GBP',
        recipient: 'user3@test.com',
        description: 'Third',
      });

      const payment = await paymentService.getPayment(2);

      expect(payment?.amount).toBe(200);
      expect(payment?.currency).toBe('EUR');
    });
  });

  describe('clearAllData', () => {
    beforeEach(() => {
      vi.mocked(rabbitMQClient.isConnected).mockReturnValue(false);
    });

    it('should clear all payments', async () => {
      await paymentService.processPayment({
        amount: 100,
        currency: 'USD',
        recipient: 'user@test.com',
        description: 'Test',
      });

      await paymentService.clearAllData();

      const payments = await paymentService.getPayments();
      expect(payments).toEqual([]);
    });

    it('should reset payment ID counter', async () => {
      await paymentService.processPayment({
        amount: 100,
        currency: 'USD',
        recipient: 'user@test.com',
        description: 'First',
      });
      await paymentService.processPayment({
        amount: 200,
        currency: 'USD',
        recipient: 'user@test.com',
        description: 'Second',
      });

      await paymentService.clearAllData();

      const result = await paymentService.processPayment({
        amount: 300,
        currency: 'USD',
        recipient: 'user@test.com',
        description: 'After clear',
      });

      expect(result.paymentId).toBe(1);
    });
  });

  describe('PaymentService class', () => {
    it('should be instantiable', () => {
      const service = new PaymentService();
      expect(service).toBeInstanceOf(PaymentService);
    });

    it('should have all required methods', () => {
      const service = new PaymentService();

      expect(typeof service.processPayment).toBe('function');
      expect(typeof service.getPayments).toBe('function');
      expect(typeof service.getPayment).toBe('function');
      expect(typeof service.clearAllData).toBe('function');
    });
  });
});
