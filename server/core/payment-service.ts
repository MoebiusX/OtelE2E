// Payment Service - Core Business Logic
// Clean separation of payment processing concerns

import { storage } from '../storage';
import { messageBroker, MessageContext } from '../infrastructure/messaging';
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
  messageId: string;
}

export class PaymentService {
  async processPayment(request: PaymentRequest, context: MessageContext): Promise<PaymentResult> {
    // Store payment record
    const payment = await storage.createPayment({
      ...request,
      traceId: context.traceId,
      spanId: context.spanId
    });

    // Publish to message broker for downstream processing
    const messageId = await messageBroker.publish('payment-processing', {
      paymentId: payment.id,
      amount: request.amount,
      currency: request.currency,
      recipient: request.recipient
    }, context);

    return {
      paymentId: payment.id,
      traceId: context.traceId,
      spanId: context.spanId,
      messageId
    };
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