// Payment Service - Core Business Logic
// Clean separation of payment processing concerns
// NOTE: This is a legacy service - the system now uses order-service.ts for trades

import { rabbitMQClient } from '../services/rabbitmq-client';
import { trace } from '@opentelemetry/api';
import { createLogger } from '../lib/logger';

const logger = createLogger('payment');

export interface PaymentRequest {
  amount: number;
  currency: string;
  recipient: string;
  description: string;
}

export interface PaymentResult {
  paymentId: number;
  traceId: string;
  spanId: string;
  processorResponse?: {
    status: string;
    processedAt: string;
    processorId: string;
  };
}

// In-memory payment storage (legacy - not persisted)
interface StoredPayment {
  id: number;
  amount: number;
  currency: string;
  recipient: string;
  description?: string;
  traceId: string;
  spanId: string;
  createdAt: Date;
}

const paymentsStore: StoredPayment[] = [];
let paymentIdCounter = 1;

export class PaymentService {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Get REAL trace context from OpenTelemetry active span
    const activeSpan = trace.getActiveSpan();
    const spanContext = activeSpan?.spanContext();

    // Use real OTEL trace/span IDs if available, otherwise generate fallback
    const traceId = spanContext?.traceId || this.generateTraceId();
    const spanId = spanContext?.spanId || this.generateSpanId();
    const correlationId = this.generateCorrelationId();

    logger.info({
      traceId: traceId.slice(0, 8),
      spanId: spanId.slice(0, 8),
      amount: request.amount,
      currency: request.currency
    }, 'Processing payment with OTEL trace context');

    // Store payment record in memory
    const payment: StoredPayment = {
      id: paymentIdCounter++,
      amount: request.amount,
      currency: request.currency,
      recipient: request.recipient,
      description: request.description,
      traceId,
      spanId,
      createdAt: new Date()
    };
    paymentsStore.push(payment);

    // Publish payment and wait for processor response
    if (rabbitMQClient.isConnected()) {
      try {
        const processorResponse = await rabbitMQClient.publishPaymentAndWait({
          paymentId: payment.id,
          correlationId,
          amount: payment.amount,
          currency: payment.currency,
          recipient: payment.recipient,
          description: payment.description || '',
          traceId,
          spanId,
          timestamp: payment.createdAt.toISOString()
        }, 5000); // 5 second timeout

        logger.info({
          paymentId: payment.id,
          status: processorResponse.status,
          processorId: processorResponse.processorId
        }, 'Payment processor response received');

        return {
          paymentId: payment.id,
          traceId,
          spanId,
          processorResponse: {
            status: processorResponse.status,
            processedAt: processorResponse.processedAt,
            processorId: processorResponse.processorId
          }
        };
      } catch (error: unknown) {
        logger.warn({
          err: error,
          paymentId: payment.id
        }, 'Payment processor timeout or error');
        
        // Return without processor response on timeout
        return {
          paymentId: payment.id,
          traceId,
          spanId
        };
      }
    } else {
      logger.warn({ paymentId: payment.id }, 'RabbitMQ not connected - payment processed without queue');
    }

    return {
      paymentId: payment.id,
      traceId,
      spanId
    };
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private generateTraceId(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private generateSpanId(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  async getPayments(limit: number = 10): Promise<StoredPayment[]> {
    return paymentsStore.slice(-limit);
  }

  async getPayment(id: number): Promise<StoredPayment | undefined> {
    return paymentsStore.find(p => p.id === id);
  }

  async clearAllData(): Promise<void> {
    paymentsStore.length = 0;
    paymentIdCounter = 1;
  }
}

export const paymentService = new PaymentService();