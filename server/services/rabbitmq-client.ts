import * as amqp from 'amqplib';
import { trace, context, SpanStatusCode, SpanKind, propagation } from '@opentelemetry/api';

export interface PaymentMessage {
  paymentId: number;
  correlationId: string;  // Added for correlation
  amount: number;
  currency: string;
  recipient: string;
  description: string;
  traceId: string;
  spanId: string;
  timestamp: string;
}

export interface PaymentResponse {
  paymentId: number;
  correlationId: string;
  status: 'acknowledged' | 'rejected' | 'error';
  processedAt: string;
  processorId: string;
}

type ResponseCallback = (response: PaymentResponse) => void;

export class RabbitMQClient {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private rabbitUrl: string;
  private readonly PAYMENTS_QUEUE = 'payments';
  private readonly RESPONSE_QUEUE = 'payment_response';
  private tracer;

  // Map of correlationId -> callback for pending responses
  private pendingResponses: Map<string, ResponseCallback> = new Map();

  constructor() {
    this.rabbitUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672';
    this.tracer = trace.getTracer('rabbitmq-client', '1.0.0');
  }

  async connect(): Promise<boolean> {
    try {
      console.log('[RABBITMQ] Connecting to RabbitMQ...');
      this.connection = await amqp.connect(this.rabbitUrl);
      this.channel = await this.connection.createChannel();

      // Declare both queues
      await this.channel.assertQueue(this.PAYMENTS_QUEUE, { durable: true });
      await this.channel.assertQueue(this.RESPONSE_QUEUE, { durable: true });

      console.log('[RABBITMQ] Connected successfully');
      return true;
    } catch (error) {
      console.warn('[RABBITMQ] Connection failed:', (error as Error).message);
      return false;
    }
  }

  /**
   * Publish payment and wait for response from processor
   * Returns the processor's acknowledgment response
   */
  async publishPaymentAndWait(payment: PaymentMessage, timeoutMs: number = 5000): Promise<PaymentResponse> {
    if (!this.channel) {
      throw new Error('No channel available');
    }

    return new Promise((resolve, reject) => {
      const correlationId = payment.correlationId;

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(correlationId);
        reject(new Error(`Payment response timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Register callback for this correlation ID
      this.pendingResponses.set(correlationId, (response: PaymentResponse) => {
        clearTimeout(timeout);
        this.pendingResponses.delete(correlationId);
        resolve(response);
      });

      // Create publish span
      const span = this.tracer.startSpan('rabbitmq.publish', {
        kind: SpanKind.PRODUCER,
        attributes: {
          'messaging.system': 'rabbitmq',
          'messaging.destination': this.PAYMENTS_QUEUE,
          'messaging.operation': 'publish',
          'payment.id': payment.paymentId,
          'payment.correlationId': correlationId
        }
      });

      context.with(trace.setSpan(context.active(), span), () => {
        try {
          const message = JSON.stringify(payment);
          const headers: Record<string, string> = {};
          propagation.inject(context.active(), headers);

          const sent = this.channel!.sendToQueue(
            this.PAYMENTS_QUEUE,
            Buffer.from(message),
            {
              persistent: true,
              correlationId: correlationId,
              headers: {
                ...headers,
                'x-correlation-id': correlationId
              }
            }
          );

          if (sent) {
            console.log(`[RABBITMQ] Published payment ${payment.paymentId} (correlation: ${correlationId.slice(0, 8)}...)`);
            span.setStatus({ code: SpanStatusCode.OK });
          } else {
            clearTimeout(timeout);
            this.pendingResponses.delete(correlationId);
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'Failed to send' });
            reject(new Error('Failed to send message to queue'));
          }
        } catch (error: any) {
          clearTimeout(timeout);
          this.pendingResponses.delete(correlationId);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          reject(error);
        } finally {
          span.end();
        }
      });
    });
  }

  async startConsumer(): Promise<void> {
    if (!this.channel) {
      console.warn('[RABBITMQ] No channel available for consumer');
      return;
    }

    console.log('[RABBITMQ] Starting payment response consumer...');

    await this.channel.consume(this.RESPONSE_QUEUE, (msg) => {
      if (msg) {
        try {
          const response: PaymentResponse = JSON.parse(msg.content.toString());
          const correlationId = response.correlationId || msg.properties.correlationId;

          console.log(`[RABBITMQ] Received response for payment ${response.paymentId} (correlation: ${correlationId?.slice(0, 8)}...)`);

          // Find and call the pending callback
          const callback = this.pendingResponses.get(correlationId);
          if (callback) {
            callback(response);
            console.log(`[RABBITMQ] Response delivered to waiting caller`);
          } else {
            console.log(`[RABBITMQ] No pending request for correlation ${correlationId?.slice(0, 8)}... (may have timed out)`);
          }

          this.channel!.ack(msg);
        } catch (error: any) {
          console.error('[RABBITMQ] Response consumer error:', error.message);
          this.channel!.nack(msg, false, false);
        }
      }
    });

    console.log('[RABBITMQ] Consumer started - listening for payment responses');
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      console.log('[RABBITMQ] Disconnected');
    } catch (error: any) {
      console.error('[RABBITMQ] Disconnect error:', error.message);
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }
}

export const rabbitMQClient = new RabbitMQClient();