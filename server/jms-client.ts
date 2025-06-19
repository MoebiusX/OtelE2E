// JMS Client - Enterprise Message Queue Client
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

interface MessageOptions {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

interface JMSMessage {
  messageId: string;
  queueName: string;
  payload: any;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  timestamp: Date;
  properties: Record<string, any>;
}

export class JMSClient extends EventEmitter {
  private isConnected = false;
  private messageHandlers: Map<string, ((message: JMSMessage) => Promise<void>)[]> = new Map();
  
  constructor() {
    super();
    this.connect();
  }

  private async connect() {
    // Simulate connection to message broker
    setTimeout(() => {
      this.isConnected = true;
      console.log('[JMS Client] Connected to message broker');
      this.emit('connected');
    }, 100);
  }

  async publishMessage(queueName: string, payload: any, options: MessageOptions): Promise<string> {
    if (!this.isConnected) {
      throw new Error('JMS Client not connected to broker');
    }

    const messageId = uuidv4();
    const message: JMSMessage = {
      messageId,
      queueName,
      payload,
      traceId: options.traceId,
      spanId: options.spanId,
      parentSpanId: options.parentSpanId,
      timestamp: new Date(),
      properties: {
        traceId: options.traceId,
        spanId: options.spanId,
        parentSpanId: options.parentSpanId
      }
    };

    console.log(`[JMS Client] Publishing message ${messageId} to ${queueName}`);
    console.log(`[JMS Client] Trace context: ${options.traceId}/${options.spanId}`);
    
    // Simulate async message delivery
    setTimeout(() => {
      this.emit('message', message);
      this.deliverToHandlers(queueName, message);
    }, Math.random() * 50 + 10); // 10-60ms delivery time
    
    return messageId;
  }

  private async deliverToHandlers(queueName: string, message: JMSMessage) {
    const handlers = this.messageHandlers.get(queueName);
    if (handlers && handlers.length > 0) {
      // Deliver to all subscribers (fan-out pattern)
      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (error) {
          console.error(`[JMS Client] Handler error for queue ${queueName}:`, error);
        }
      }
    }
  }

  subscribeToQueue(queueName: string, handler: (message: JMSMessage) => Promise<void>) {
    if (!this.messageHandlers.has(queueName)) {
      this.messageHandlers.set(queueName, []);
    }
    
    this.messageHandlers.get(queueName)?.push(handler);
    console.log(`[JMS Client] Subscribed to queue: ${queueName}`);
    console.log(`[JMS Client] Active subscribers for ${queueName}: ${this.messageHandlers.get(queueName)?.length}`);
  }

  close() {
    this.isConnected = false;
    this.messageHandlers.clear();
    console.log('[JMS Client] Disconnected from message broker');
  }

  getStats() {
    const stats: Record<string, number> = {};
    this.messageHandlers.forEach((handlers, queueName) => {
      stats[queueName] = handlers.length;
    });
    return {
      connected: this.isConnected,
      subscriberCounts: stats
    };
  }
}

// Create and setup JMS client with message processors
export const jmsClient = new JMSClient();

// Setup payment processing handlers
jmsClient.subscribeToQueue('payment-processing', async (message) => {
  console.log(`[JMS Processor] Processing payment: ${message.payload.paymentId}`);
  
  // Route to downstream queues
  await jmsClient.publishMessage('payment-validation', {
    ...message.payload,
    validationRequired: true
  }, {
    traceId: message.traceId,
    spanId: generateSpanId(),
    parentSpanId: message.spanId
  });

  await jmsClient.publishMessage('payment-notification', {
    recipient: message.payload.recipient,
    amount: message.payload.amount,
    currency: message.payload.currency,
    paymentId: message.payload.paymentId
  }, {
    traceId: message.traceId,
    spanId: generateSpanId(),
    parentSpanId: message.spanId
  });

  await jmsClient.publishMessage('payment-audit', {
    ...message.payload,
    processedAt: new Date().toISOString()
  }, {
    traceId: message.traceId,
    spanId: generateSpanId(),
    parentSpanId: message.spanId
  });
});

jmsClient.subscribeToQueue('payment-validation', async (message) => {
  console.log(`[JMS Processor] Validating payment: ${message.payload.paymentId}`);
  // Simulate validation processing
});

jmsClient.subscribeToQueue('payment-notification', async (message) => {
  console.log(`[JMS Processor] Sending notification for payment: ${message.payload.paymentId}`);
  // Simulate notification processing
});

jmsClient.subscribeToQueue('payment-audit', async (message) => {
  console.log(`[JMS Processor] Auditing payment: ${message.payload.paymentId}`);
  // Simulate audit processing
});

function generateSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}