// Message Processors - Business Logic for Queue Processing
// Clean separation of messaging concerns

import { messageBroker, Message, MessageContext } from '../infrastructure/messaging';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';

export class PaymentProcessors {
  private tracer = trace.getTracer('payment-processors');

  constructor() {
    this.setupProcessors();
  }

  private setupProcessors() {
    // Main payment processing
    messageBroker.subscribe('payment-processing', async (message: Message) => {
      const span = this.tracer.startSpan('payment-processing', {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'solace',
          'messaging.destination': 'payment-processing',
          'messaging.operation': 'process',
          'payment.id': message.payload.paymentId,
          'service.name': 'payment-processor'
        }
      });

      try {
        console.log(`[Payment Processor] Processing payment: ${message.payload.paymentId}`);
        
        // Route to downstream queues with proper trace context
        const baseContext = message.context;
        
        await this.routeToValidation(message.payload, baseContext);
        await this.routeToNotification(message.payload, baseContext);
        await this.routeToAudit(message.payload, baseContext);
        
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error: any) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.end();
      }
    });

    // Payment validation
    messageBroker.subscribe('payment-validation', async (message: Message) => {
      const span = this.tracer.startSpan('payment-validation', {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'solace',
          'messaging.destination': 'payment-validation',
          'messaging.operation': 'validate',
          'payment.id': message.payload.paymentId,
          'service.name': 'validation-service'
        }
      });

      try {
        console.log(`[Payment Processor] Validating payment: ${message.payload.paymentId}`);
        await this.delay(100 + Math.random() * 200);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error: any) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.end();
      }
    });

    // Payment notification  
    messageBroker.subscribe('payment-notification', async (message: Message) => {
      const span = this.tracer.startSpan('payment-notification', {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'solace',
          'messaging.destination': 'payment-notification',
          'messaging.operation': 'notify',
          'payment.id': message.payload.paymentId,
          'service.name': 'notification-service'
        }
      });

      try {
        console.log(`[Payment Processor] Sending notification for payment: ${message.payload.paymentId}`);
        await this.delay(150 + Math.random() * 300);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error: any) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.end();
      }
    });

    // Payment audit
    messageBroker.subscribe('payment-audit', async (message: Message) => {
      const span = this.tracer.startSpan('payment-audit', {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'solace',
          'messaging.destination': 'payment-audit',
          'messaging.operation': 'audit',
          'payment.id': message.payload.paymentId,
          'service.name': 'audit-service'
        }
      });

      try {
        console.log(`[Payment Processor] Auditing payment: ${message.payload.paymentId}`);
        await this.delay(80 + Math.random() * 150);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error: any) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.end();
      }
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