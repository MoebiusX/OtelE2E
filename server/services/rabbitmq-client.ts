import * as amqp from 'amqplib';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';

export interface PaymentMessage {
  paymentId: number;
  amount: number;
  currency: string;
  recipient: string;
  description: string;
  traceId: string;
  spanId: string;
  timestamp: string;
}

export class RabbitMQClient {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private rabbitUrl: string;
  private readonly QUEUE_NAME = 'payments';
  private tracer;

  constructor() {
    this.rabbitUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672';
    this.tracer = trace.getTracer('rabbitmq-client', '1.0.0');
  }

  async connect(): Promise<boolean> {
    try {
      console.log('[RABBITMQ] Connecting to RabbitMQ...');
      this.connection = await amqp.connect(this.rabbitUrl);
      this.channel = await this.connection.createChannel();
      
      // Declare the payments queue
      await this.channel.assertQueue(this.QUEUE_NAME, {
        durable: true
      });

      console.log('[RABBITMQ] Connected successfully');
      return true;
    } catch (error) {
      console.warn('[RABBITMQ] Connection failed:', (error as Error).message);
      return false;
    }
  }

  async publishPayment(payment: PaymentMessage): Promise<boolean> {
    if (!this.channel) {
      console.error('[RABBITMQ] No channel available');
      return false;
    }

    return new Promise((resolve) => {
      const span = this.tracer.startSpan('rabbitmq.publish', {
        kind: SpanKind.PRODUCER,
        attributes: {
          'messaging.system': 'rabbitmq',
          'messaging.destination': this.QUEUE_NAME,
          'messaging.operation': 'publish',
          'payment.id': payment.paymentId,
          'payment.amount': payment.amount,
          'payment.currency': payment.currency
        }
      });

      context.with(trace.setSpan(context.active(), span), () => {
        try {
          const message = JSON.stringify(payment);
          const sent = this.channel!.sendToQueue(
            this.QUEUE_NAME,
            Buffer.from(message),
            {
              persistent: true,
              headers: {
                'x-trace-id': payment.traceId,
                'x-span-id': payment.spanId
              }
            }
          );

          if (sent) {
            console.log(`[RABBITMQ] Published payment ${payment.paymentId} to queue`);
            span.setStatus({ code: SpanStatusCode.OK });
            resolve(true);
          } else {
            console.error('[RABBITMQ] Failed to send message to queue');
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'Failed to send message' });
            resolve(false);
          }
        } catch (error) {
          console.error('[RABBITMQ] Publish error:', error.message);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          resolve(false);
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

    console.log('[RABBITMQ] Starting payment message consumer...');
    
    await this.channel.consume(this.QUEUE_NAME, (msg) => {
      if (msg) {
        const span = this.tracer.startSpan('rabbitmq.consume', {
          kind: SpanKind.CONSUMER,
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.destination': this.QUEUE_NAME,
            'messaging.operation': 'receive'
          }
        });

        context.with(trace.setSpan(context.active(), span), () => {
          try {
            const payment: PaymentMessage = JSON.parse(msg.content.toString());
            
            // Extract trace context from headers
            const traceId = msg.properties.headers?.['x-trace-id'];
            const parentSpanId = msg.properties.headers?.['x-span-id'];
            
            console.log(`[RABBITMQ] Received payment message:`, {
              paymentId: payment.paymentId,
              amount: payment.amount,
              currency: payment.currency,
              recipient: payment.recipient,
              traceId: traceId || payment.traceId,
              timestamp: payment.timestamp
            });

            span.setAttributes({
              'payment.id': payment.paymentId,
              'payment.amount': payment.amount,
              'payment.currency': payment.currency,
              'trace.id': traceId || payment.traceId
            });

            // Acknowledge the message
            this.channel!.ack(msg);
            span.setStatus({ code: SpanStatusCode.OK });
            
          } catch (error) {
            console.error('[RABBITMQ] Consumer error:', error.message);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            this.channel!.nack(msg, false, false);
          } finally {
            span.end();
          }
        });
      }
    });
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
    } catch (error) {
      console.error('[RABBITMQ] Disconnect error:', error.message);
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }
}

export const rabbitMQClient = new RabbitMQClient();