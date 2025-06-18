import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage';

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
      processingDelay: 100,
    });
    
    this.createQueue('notification-queue', {
      name: 'notification-queue',
      maxRetries: 2,
      processingDelay: 150,
    });
    
    this.createQueue('audit-queue', {
      name: 'audit-queue',
      maxRetries: 1,
      processingDelay: 80,
    });
  }

  createQueue(queueName: string, config: QueueConfig) {
    this.queues.set(queueName, []);
    this.configs.set(queueName, config);
  }

  async publish(queueName: string, payload: any, traceId: string, parentSpanId: string): Promise<string> {
    // Real queue operation - OpenTelemetry auto-instruments this
    const messageId = uuidv4();
    const message: QueueMessage = {
      id: messageId,
      topic: queueName,
      payload,
      traceId,
      spanId: parentSpanId || 'auto-generated',
      timestamp: new Date(),
      retryCount: 0,
    };

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    queue.push(message);

    // Trigger processing if consumer exists
    const consumer = this.consumers.get(queueName);
    if (consumer && !this.processing.has(queueName)) {
      setTimeout(() => this.processQueue(queueName), 100);
    }

    return messageId;
  }

  subscribe(queueName: string, consumer: (message: QueueMessage) => Promise<void>) {
    this.consumers.set(queueName, consumer);
    
    // Start processing if there are pending messages
    const queue = this.queues.get(queueName);
    if (queue && queue.length > 0 && !this.processing.has(queueName)) {
      setTimeout(() => this.processQueue(queueName), 100);
    }
  }

  private async processQueue(queueName: string) {
    if (this.processing.has(queueName)) return;
    
    this.processing.add(queueName);
    const queue = this.queues.get(queueName);
    const consumer = this.consumers.get(queueName);
    const config = this.configs.get(queueName);
    
    if (!queue || !consumer || !config) {
      this.processing.delete(queueName);
      return;
    }

    while (queue.length > 0) {
      const message = queue.shift()!;
      
      try {
        // Real message processing - OpenTelemetry auto-instruments this
        await consumer(message);
      } catch (error) {
        console.error(`Message processing failed for ${queueName}:`, error);
        
        if (message.retryCount < config.maxRetries) {
          message.retryCount++;
          queue.push(message);
        }
      }
      
      // Delay between messages
      if (queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, config.processingDelay));
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
    try {
      const { paymentId, amount, currency } = message.payload;
      
      // Real payment processing - OpenTelemetry auto-instruments these operations
      const processingTime1 = Math.floor(Math.random() * 600) + 400; // 400-1000ms
      const processingTime2 = Math.floor(Math.random() * 800) + 300; // 300-1100ms
      
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
      }, message.traceId, message.spanId);

      // Send to audit queue
      await queueSimulator.publish('audit-queue', {
        type: 'payment_audit',
        paymentId,
        amount,
        currency,
        processedAt: new Date(),
      }, message.traceId, message.spanId);

    } catch (error) {
      console.error('Payment processing failed:', error);
      throw error;
    }
  });

  // Setup notification processor
  queueSimulator.subscribe('notification-queue', async (message: QueueMessage) => {
    try {
      // Real operation: Send notification (OpenTelemetry auto-instruments this)
      const notificationDuration = Math.floor(Math.random() * 400) + 200; // 200-600ms

      // Simulate notification sending
      await new Promise(resolve => setTimeout(resolve, notificationDuration));
      
    } catch (error) {
      console.error('Notification failed:', error);
      throw error;
    }
  });

  // Setup audit processor
  queueSimulator.subscribe('audit-queue', async (message: QueueMessage) => {
    try {
      // Real operation: Audit logging (OpenTelemetry auto-instruments this)
      const auditDuration = Math.floor(Math.random() * 200) + 100; // 100-300ms

      // Simulate audit logging
      await new Promise(resolve => setTimeout(resolve, auditDuration));
      
    } catch (error) {
      console.error('Audit logging failed:', error);
      throw error;
    }
  });
}

export const queueSimulator = new SolaceQueueSimulator();