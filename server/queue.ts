import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage';
import { createSpan, addSpanAttributes } from './tracing';

interface QueueMessage {
  id: string;
  topic: string;
  payload: any;
  traceId: string;
  spanId: string;
  timestamp: Date;
  retryCount: number;
}

interface QueueConfig {
  name: string;
  maxRetries: number;
  processingDelay: number;
}

export class SolaceQueueSimulator extends EventEmitter {
  private queues: Map<string, QueueMessage[]> = new Map();
  private consumers: Map<string, (message: QueueMessage) => Promise<void>> = new Map();
  private configs: Map<string, QueueConfig> = new Map();
  private processing: Set<string> = new Set();

  constructor() {
    super();
    this.setupDefaultQueues();
  }

  private setupDefaultQueues() {
    this.createQueue('payment-queue', {
      name: 'payment-queue',
      maxRetries: 3,
      processingDelay: 1500,
    });

    this.createQueue('notification-queue', {
      name: 'notification-queue', 
      maxRetries: 2,
      processingDelay: 800,
    });

    this.createQueue('audit-queue', {
      name: 'audit-queue',
      maxRetries: 1,
      processingDelay: 500,
    });
  }

  createQueue(queueName: string, config: QueueConfig) {
    this.queues.set(queueName, []);
    this.configs.set(queueName, config);
  }

  async publish(queueName: string, payload: any, traceId: string, parentSpanId: string): Promise<string> {
    const { span, spanId, finish } = createSpan(`queue.publish.${queueName}`, parentSpanId);
    
    try {
      addSpanAttributes(span, {
        'queue.name': queueName,
        'queue.operation': 'publish',
        'message.size': JSON.stringify(payload).length,
      });

      const messageId = uuidv4();
      const message: QueueMessage = {
        id: messageId,
        topic: queueName,
        payload,
        traceId,
        spanId: spanId,
        timestamp: new Date(),
        retryCount: 0,
      };

      const queue = this.queues.get(queueName);
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      queue.push(message);

      // Real operation: Message published to queue (OpenTelemetry auto-instruments this)

      // Trigger processing if consumer exists
      const consumer = this.consumers.get(queueName);
      if (consumer && !this.processing.has(queueName)) {
        setTimeout(() => this.processQueue(queueName), 100);
      }

      finish('success');
      this.emit('messagePublished', { queueName, messageId, traceId });
      
      return messageId;
    } catch (error) {
      finish('error');
      throw error;
    }
  }

  subscribe(queueName: string, consumer: (message: QueueMessage) => Promise<void>) {
    this.consumers.set(queueName, consumer);
    // Start processing immediately if queue has messages
    if (this.queues.get(queueName)?.length) {
      setTimeout(() => this.processQueue(queueName), 100);
    }
  }

  private async processQueue(queueName: string) {
    if (this.processing.has(queueName)) return;
    
    const queue = this.queues.get(queueName);
    const config = this.configs.get(queueName);
    const consumer = this.consumers.get(queueName);
    
    if (!queue || !config || !consumer) return;

    this.processing.add(queueName);

    while (queue.length > 0) {
      const message = queue.shift()!;
      const { span, spanId, finish } = createSpan(`queue.consume.${queueName}`, message.spanId);

      try {
        addSpanAttributes(span, {
          'queue.name': queueName,
          'queue.operation': 'consume',
          'message.id': message.id,
          'message.retry_count': message.retryCount,
        });

        // Real operation: Message consumed from queue (OpenTelemetry auto-instruments this)

        // Simulate processing delay
        const processingDelay = Math.floor(Math.random() * config.processingDelay) + (config.processingDelay / 2);
        await new Promise(resolve => setTimeout(resolve, processingDelay));

        // Process message
        await consumer(message);

        // Update span as successful
        await storage.updateSpan(spanId, {
          status: 'success',
          endTime: new Date(),
        });

        finish('success');
        this.emit('messageProcessed', { queueName, messageId: message.id, traceId: message.traceId });

      } catch (error) {
        message.retryCount++;
        
        if (message.retryCount <= config.maxRetries) {
          // Retry logic
          queue.push(message);
          await storage.updateSpan(spanId, {
            status: 'error',
            endTime: new Date(),
            tags: JSON.stringify({
              'queue.name': queueName,
              'error.message': error instanceof Error ? error.message : 'Unknown error',
              'retry.count': message.retryCount,
            }),
          });
        } else {
          // Dead letter queue simulation
          await storage.updateSpan(spanId, {
            status: 'error',
            endTime: new Date(),
            tags: JSON.stringify({
              'queue.name': queueName,
              'error.message': 'Max retries exceeded',
              'dlq.sent': true,
            }),
          });
          this.emit('messageDeadLettered', { queueName, messageId: message.id, traceId: message.traceId });
        }

        finish('error');
      }
    }

    this.processing.delete(queueName);
  }

  getQueueStats() {
    const stats: Record<string, any> = {};
    
    Array.from(this.queues.entries()).forEach(([queueName, queue]) => {
      const config = this.configs.get(queueName);
      stats[queueName] = {
        messageCount: queue.length,
        isProcessing: this.processing.has(queueName),
        hasConsumer: this.consumers.has(queueName),
        config,
      };
    });
    
    return stats;
  }
}

// Payment processor that consumes from payment queue
export async function setupPaymentProcessor(queueSimulator: SolaceQueueSimulator) {
  queueSimulator.subscribe('payment-queue', async (message: QueueMessage) => {
    const { span, spanId, finish } = createSpan('payment.process', message.spanId);
    
    try {
      const { paymentId, amount, currency } = message.payload;
      
      addSpanAttributes(span, {
        'payment.id': paymentId,
        'payment.amount': amount,
        'payment.currency': currency,
        'processor.name': 'payment-processor',
      });

      // Store payment processing span with randomized duration
      const processingTime1 = Math.floor(Math.random() * 600) + 400; // 400-1000ms
      const processingTime2 = Math.floor(Math.random() * 800) + 300; // 300-1100ms
      const totalProcessingTime = processingTime1 + processingTime2;
      
      // Real operation: Payment processing complete (OpenTelemetry auto-instruments this)

      // Simulate payment processing steps
      await new Promise(resolve => setTimeout(resolve, processingTime1));

      // Update payment status
      await storage.updatePaymentStatus(paymentId, 'processing');
      
      // Simulate additional processing time
      await new Promise(resolve => setTimeout(resolve, processingTime2));

      // Finalize payment
      await storage.updatePaymentStatus(paymentId, 'completed');

      // Send to notification queue
      await queueSimulator.publish('notification-queue', {
        type: 'payment_completed',
        paymentId,
        amount,
        currency,
      }, message.traceId, spanId);

      // Send to audit queue
      await queueSimulator.publish('audit-queue', {
        type: 'payment_audit',
        paymentId,
        amount,
        currency,
        processedAt: new Date(),
      }, message.traceId, spanId);

      // Update span as completed
      await storage.updateSpan(spanId, {
        status: 'success',
        duration: 1500,
        endTime: new Date(),
      });

      finish('success');
    } catch (error) {
      await storage.updateSpan(spanId, {
        status: 'error',
        duration: 1500,
        endTime: new Date(),
        tags: JSON.stringify({
          'error.message': error instanceof Error ? error.message : 'Processing failed',
        }),
      });
      finish('error');
      throw error;
    }
  });

  // Setup notification processor
  queueSimulator.subscribe('notification-queue', async (message: QueueMessage) => {
    const { span, spanId, finish } = createSpan('notification.send', message.spanId);
    
    try {
      addSpanAttributes(span, {
        'notification.type': message.payload.type,
        'notification.payment_id': message.payload.paymentId,
      });

      // Real operation: Send notification (OpenTelemetry auto-instruments this)
      const notificationDuration = Math.floor(Math.random() * 400) + 200; // 200-600ms

      // Simulate notification sending
      await new Promise(resolve => setTimeout(resolve, notificationDuration));
      
      finish('success');
    } catch (error) {
      finish('error');
      throw error;
    }
  });

  // Setup audit processor
  queueSimulator.subscribe('audit-queue', async (message: QueueMessage) => {
    const { span, spanId, finish } = createSpan('audit.log', message.spanId);
    
    try {
      addSpanAttributes(span, {
        'audit.type': message.payload.type,
        'audit.payment_id': message.payload.paymentId,
      });

      // Real operation: Audit logging (OpenTelemetry auto-instruments this)
      const auditDuration = Math.floor(Math.random() * 200) + 100; // 100-300ms

      // Simulate audit logging
      await new Promise(resolve => setTimeout(resolve, auditDuration));
      
      finish('success');
    } catch (error) {
      finish('error');
      throw error;
    }
  });
}

export const queueSimulator = new SolaceQueueSimulator();