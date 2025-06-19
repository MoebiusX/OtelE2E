// Message Processors - Business Logic for Queue Processing
// Clean separation of messaging concerns

import { messageBroker, Message, MessageContext } from '../infrastructure/messaging';

export class PaymentProcessors {
  constructor() {
    this.setupProcessors();
  }

  private setupProcessors() {
    // Main payment processing
    messageBroker.subscribe('payment-processing', async (message: Message) => {
      console.log(`[Payment Processor] Processing payment: ${message.payload.paymentId}`);
      
      // Route to downstream queues with proper trace context
      const baseContext = message.context;
      
      await this.routeToValidation(message.payload, baseContext);
      await this.routeToNotification(message.payload, baseContext);
      await this.routeToAudit(message.payload, baseContext);
    });

    // Payment validation
    messageBroker.subscribe('payment-validation', async (message: Message) => {
      console.log(`[Payment Processor] Validating payment: ${message.payload.paymentId}`);
      // Simulate validation processing with realistic delay
      await this.delay(100 + Math.random() * 200);
    });

    // Payment notification  
    messageBroker.subscribe('payment-notification', async (message: Message) => {
      console.log(`[Payment Processor] Sending notification for payment: ${message.payload.paymentId}`);
      // Simulate notification processing
      await this.delay(150 + Math.random() * 300);
    });

    // Payment audit
    messageBroker.subscribe('payment-audit', async (message: Message) => {
      console.log(`[Payment Processor] Auditing payment: ${message.payload.paymentId}`);
      // Simulate audit processing
      await this.delay(80 + Math.random() * 150);
    });

    console.log('[Payment Processors] All message processors initialized');
  }

  private async routeToValidation(payload: any, parentContext: MessageContext) {
    await messageBroker.publish('payment-validation', {
      ...payload,
      validationRequired: true,
      validationType: 'fraud_check'
    }, {
      traceId: parentContext.traceId,
      spanId: this.generateSpanId(),
      parentSpanId: parentContext.spanId
    });
  }

  private async routeToNotification(payload: any, parentContext: MessageContext) {
    await messageBroker.publish('payment-notification', {
      recipient: payload.recipient,
      amount: payload.amount,
      currency: payload.currency,
      paymentId: payload.paymentId,
      notificationType: 'email'
    }, {
      traceId: parentContext.traceId,
      spanId: this.generateSpanId(),
      parentSpanId: parentContext.spanId
    });
  }

  private async routeToAudit(payload: any, parentContext: MessageContext) {
    await messageBroker.publish('payment-audit', {
      ...payload,
      processedAt: new Date().toISOString(),
      auditType: 'compliance'
    }, {
      traceId: parentContext.traceId,
      spanId: this.generateSpanId(),
      parentSpanId: parentContext.spanId
    });
  }

  private generateSpanId(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const paymentProcessors = new PaymentProcessors();