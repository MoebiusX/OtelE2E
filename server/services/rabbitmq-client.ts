import * as amqp from 'amqplib';
import { trace, context, SpanStatusCode, SpanKind, propagation } from '@opentelemetry/api';
import { config } from '../config';
import { createLogger } from '../lib/logger';
import { ExternalServiceError, TimeoutError } from '../lib/errors';

const logger = createLogger('rabbitmq');

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
  private readonly ORDERS_QUEUE: string;
  private readonly RESPONSE_QUEUE: string;
  private readonly LEGACY_QUEUE: string;
  private readonly LEGACY_RESPONSE: string;
  private tracer;

  private pendingResponses: Map<string, ResponseCallback> = new Map();

  constructor() {
    this.ORDERS_QUEUE = config.rabbitmq.ordersQueue;
    this.RESPONSE_QUEUE = config.rabbitmq.responseQueue;
    this.LEGACY_QUEUE = config.rabbitmq.legacyQueue;
    this.LEGACY_RESPONSE = config.rabbitmq.legacyResponseQueue;
    this.tracer = trace.getTracer('rabbitmq-client', '1.0.0');
  }

  async connect(): Promise<boolean> {
    try {
      logger.info({ url: config.rabbitmq.url.replace(/\/\/.*@/, '//*****@') }, 'Connecting to RabbitMQ...');
      this.connection = await amqp.connect(config.rabbitmq.url);
      this.channel = await this.connection.createChannel();

      // Declare queues
      await this.channel.assertQueue(this.ORDERS_QUEUE, { durable: true });
      await this.channel.assertQueue(this.RESPONSE_QUEUE, { durable: true });
      // Keep legacy queues for backwards compat
      await this.channel.assertQueue(this.LEGACY_QUEUE, { durable: true });
      await this.channel.assertQueue(this.LEGACY_RESPONSE, { durable: true });

      logger.info({
        queues: [this.ORDERS_QUEUE, this.RESPONSE_QUEUE, this.LEGACY_QUEUE, this.LEGACY_RESPONSE],
      }, 'RabbitMQ connected successfully');
      return true;
    } catch (error) {
      logger.error({ err: error }, 'RabbitMQ connection failed');
      throw new ExternalServiceError('RabbitMQ', error as Error);
    }
  }

  /**
   * Publish order and wait for execution response from matcher
   */
  async publishOrderAndWait(order: OrderMessage, timeoutMs: number = 5000): Promise<ExecutionResponse> {
    if (!this.channel) {
      throw new ExternalServiceError('RabbitMQ', new Error('No channel available'));
    }

    return new Promise((resolve, reject) => {
      const correlationId = order.correlationId;

      const timeout = setTimeout(() => {
        this.pendingResponses.delete(correlationId);
        reject(new TimeoutError('Order execution', timeoutMs));
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

          logger.debug({
            orderId: order.orderId,
            correlationId,
            publishTraceparent: publishHeaders.traceparent?.slice(0, 40),
          }, 'Injecting trace headers for order');

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
            logger.info({
              orderId: order.orderId,
              side: order.side,
              quantity: order.quantity,
              correlationId,
            }, `Published order to ${this.LEGACY_QUEUE}`);
            span.setStatus({ code: SpanStatusCode.OK });
          } else {
            clearTimeout(timeout);
            this.pendingResponses.delete(correlationId);
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'Failed to send' });
            reject(new ExternalServiceError('RabbitMQ', new Error('Failed to send order to queue')));
          }
        } catch (error: any) {
          clearTimeout(timeout);
          this.pendingResponses.delete(correlationId);
          logger.error({ err: error, orderId: order.orderId }, 'Failed to publish order');
          span.recordException(error);
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
      logger.warn('No channel available for consumer');
      return;
    }

    logger.info('Starting order response consumer...');

    // Listen on legacy response queue
    await this.channel.consume(this.LEGACY_RESPONSE, (msg) => {
      if (msg) {
        try {
          const response = JSON.parse(msg.content.toString());
          const correlationId = response.correlationId || msg.properties.correlationId;

          logger.debug({
            correlationId: correlationId?.slice(0, 8),
            status: response.status,
          }, 'Received execution response');

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
            logger.debug({ correlationId }, 'Execution delivered to waiting caller');
          } else {
            logger.warn({ correlationId }, 'No pending callback found for execution response');
          }

          this.channel!.ack(msg);
        } catch (error: any) {
          logger.error({ err: error }, 'Response consumer error');
          this.channel!.nack(msg, false, false);
        }
      }
    });

    logger.info(`Consumer started - listening on ${this.LEGACY_RESPONSE}`);
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
      logger.info('RabbitMQ disconnected');
    } catch (error: any) {
      logger.error({ err: error }, 'Error disconnecting from RabbitMQ');
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }
}

export const rabbitMQClient = new RabbitMQClient();