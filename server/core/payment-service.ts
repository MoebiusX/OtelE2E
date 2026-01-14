// Payment Service - Core Business Logic
// Clean separation of payment processing concerns

import { storage } from '../storage';
import { rabbitMQClient } from '../services/rabbitmq-client';
import { InsertPayment } from '@shared/schema';

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

export class PaymentService {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Generate trace context for authentic OpenTelemetry spans
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();
    const correlationId = this.generateCorrelationId();

    // Store payment record
    const payment = await storage.createPayment({
      ...request,
      traceId,
      spanId
    });

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
          timestamp: payment.createdAt instanceof Date ? payment.createdAt.toISOString() : new Date().toISOString()
        }, 5000); // 5 second timeout

        console.log(`[PAYMENT] Processor response: ${processorResponse.status}`);

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
      } catch (error: any) {
        console.warn(`[PAYMENT] Processor response timeout or error: ${error.message}`);
        // Return without processor response on timeout
        return {
          paymentId: payment.id,
          traceId,
          spanId
        };
      }
    } else {
      console.warn('[PAYMENT] RabbitMQ not connected - payment processed without queue');
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

  async getPayments(limit: number = 10) {
    return storage.getPayments(limit);
  }

  async getPayment(id: number) {
    return storage.getPayment(id);
  }

  async clearAllData() {
    return storage.clearAllData();
  }
}

export const paymentService = new PaymentService();