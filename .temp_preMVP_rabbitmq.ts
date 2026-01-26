import * as amqp from 'amqplib';
import { trace, context, SpanStatusCode, SpanKind, propagation } from '@opentelemetry/api';

export interface OrderMessage {
  orderId: string;
  correlationId: string;
  pair: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderType: "MARKET";
  currentPrice: number;
  traceId: string;
  spanId: string;
  timestamp: string;
}

export interface ExecutionResponse {
  orderId: string;
  correlationId: string;
  status: 'FILLED' | 'REJECTED';
  fillPrice: number;
  totalValue: number;
  processedAt: string;
  processorId: string;
}

type ResponseCallback = (response: ExecutionResponse) => void;

export class RabbitMQClient {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private rabbitUrl: string;
  private readonly ORDERS_QUEUE = 'orders';
  private readonly RESPONSE_QUEUE = 'order_response';
  // Keep old queue names for compatibility during transition
  private readonly LEGACY_QUEUE = 'payments';
  private readonly LEGACY_RESPONSE = 'payment_response';
  private tracer;

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

      // Declare queues
      await this.channel.assertQueue(this.ORDERS_QUEUE, { durable: true });
      await this.channel.assertQueue(this.RESPONSE_QUEUE, { durable: true });
      // Keep legacy queues for backwards compat
      await this.channel.assertQueue(this.LEGACY_QUEUE, { durable: true });
      await this.channel.assertQueue(this.LEGACY_RESPONSE, { durable: true });

      console.log('[RABBITMQ] Connected successfully');
      return true;
    } catch (error) {
      console.warn('[RABBITMQ] Connection failed:', (error as Error).message);
      return false;
    }
  }

  /**
   * Publish order and wait for execution response from matcher
   */
  async publishOrderAndWait(order: OrderMessage, timeoutMs: number = 5000): Promise<ExecutionResponse> {
    if (!this.channel) {
      throw new Error('No channel available');
    }

    return new Promise((resolve, reject) => {
      const correlationId = order.correlationId;

      const timeout = setTimeout(() => {
        this.pendingResponses.delete(correlationId);
        reject(new Error(`Order execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingResponses.set(correlationId, (response: ExecutionResponse) => {
        clearTimeout(timeout);
        this.pendingResponses.delete(correlationId);
        resolve(response);
      });

      // Create span as child of the current active span
      const parentContext = context.active();
      const span = this.tracer.startSpan('publish orders', {
        kind: SpanKind.PRODUCER,
        attributes: {
          'messaging.system': 'rabbitmq',
          'messaging.destination': this.LEGACY_QUEUE,
          'messaging.operation': 'publish',
          'order.id': order.orderId,
          'order.pair': order.pair,
          'order.side': order.side,
          'order.quantity': order.quantity
        }
      }, parentContext);

      // Set span in context and inject for propagation
      const spanContext = trace.setSpan(parentContext, span);

      context.with(spanContext, () => {
        try {
          const message = JSON.stringify(order);

          // Inject publish span context for order-matcher
          const publishHeaders: Record<string, string> = {};
          propagation.inject(spanContext, publishHeaders);

          // Also inject parent context (POST span) for response routing
          const parentHeaders: Record<string, string> = {};
          propagation.inject(parentContext, parentHeaders);

          console.log(`[RABBITMQ] Injecting headers - publish: ${publishHeaders.traceparent?.slice(0, 40)}...`);
          console.log(`[RABBITMQ] Injecting headers - parent for response: ${parentHeaders.traceparent?.slice(0, 40)}...`);

          // Send to legacy queue with both contexts
          const sent = this.channel!.sendToQueue(
            this.LEGACY_QUEUE,
            Buffer.from(message),
            {
              persistent: true,
              correlationId: correlationId,
              headers: {
                ...publishHeaders,
                'x-correlation-id': correlationId,
                'x-parent-traceparent': parentHeaders.traceparent || '',
                'x-parent-tracestate': parentHeaders.tracestate || ''
              }
            }
          );

          if (sent) {
            console.log(`[RABBITMQ] Published order ${order.orderId} (${order.side} ${order.quantity} BTC)`);
            span.setStatus({ code: SpanStatusCode.OK });
          } else {
            clearTimeout(timeout);
            this.pendingResponses.delete(correlationId);
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'Failed to send' });
            reject(new Error('Failed to send order to queue'));
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

  // Legacy method for backwards compatibility
  async publishPaymentAndWait(payment: any, timeoutMs: number = 5000): Promise<any> {
    // Convert payment to order format
    const order: OrderMessage = {
      orderId: `ORD-${payment.paymentId}`,
      correlationId: payment.correlationId,
      pair: 'BTC/USD',
      side: 'BUY',
      quantity: payment.amount / 42500, // Convert to BTC
      orderType: 'MARKET',
      currentPrice: 42500,
      traceId: payment.traceId,
      spanId: payment.spanId,
      timestamp: payment.timestamp
    };

    const response = await this.publishOrderAndWait(order, timeoutMs);

    // Convert response back to legacy format
    return {
      paymentId: payment.paymentId,
      correlationId: response.correlationId,
      status: response.status === 'FILLED' ? 'acknowledged' : 'rejected',
      processedAt: response.processedAt,
      processorId: response.processorId
    };
  }

  async startConsumer(): Promise<void> {
    if (!this.channel) {
      console.warn('[RABBITMQ] No channel available for consumer');
      return;
    }

    console.log('[RABBITMQ] Starting order response consumer...');

    // Listen on legacy response queue
    await this.channel.consume(this.LEGACY_RESPONSE, (msg) => {
      if (msg) {
        try {
          const response = JSON.parse(msg.content.toString());
          const correlationId = response.correlationId || msg.properties.correlationId;

          console.log(`[RABBITMQ] Received execution for order (correlation: ${correlationId?.slice(0, 8)}...)`);

          // Convert legacy response format
          const executionResponse: ExecutionResponse = {
            orderId: response.orderId || `ORD-${response.paymentId}`,
            correlationId,
            // Handle both new (FILLED) and legacy (acknowledged) status formats
            status: (response.status === 'FILLED' || response.status === 'acknowledged') ? 'FILLED' : 'REJECTED',
            fillPrice: response.fillPrice || 42500,
            totalValue: response.totalValue || 0,
            processedAt: response.processedAt,
            processorId: response.processorId
          };

          const callback = this.pendingResponses.get(correlationId);
          if (callback) {
            callback(executionResponse);
            console.log(`[RABBITMQ] Execution delivered to waiting caller`);
          }

          this.channel!.ack(msg);
        } catch (error: any) {
          console.error('[RABBITMQ] Response consumer error:', error.message);
          this.channel!.nack(msg, false, false);
        }
      }
    });

    console.log('[RABBITMQ] Consumer started - listening for order executions');
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
