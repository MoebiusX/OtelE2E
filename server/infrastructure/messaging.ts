// Enterprise Message Broker - Clean Implementation
// Simple, reliable messaging without external dependencies

import { EventEmitter } from 'events';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';

export interface MessageContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface Message {
  id: string;
  queueName: string;
  payload: any;
  context: MessageContext;
  timestamp: Date;
}

export class MessageBroker extends EventEmitter {
  private queues: Map<string, Message[]> = new Map();
  private consumers: Map<string, ((message: Message) => Promise<void>)[]> = new Map();

  constructor() {
    super();
    this.initializeQueues();
  }

  private initializeQueues() {
    const queueNames = [
      'payment-processing',
      'payment-validation',
      'payment-notification',
      'payment-audit'
    ];

    queueNames.forEach(name => {
      this.queues.set(name, []);
      this.consumers.set(name, []);
    });

    console.log('[Message Broker] Initialized queues:', queueNames.join(', '));
  }

  async publish(queueName: string, payload: any, context: MessageContext): Promise<string> {
    const message: Message = {
      id: uuidv4(),
      queueName,
      payload,
      context,
      timestamp: new Date()
    };

    console.log(`[Message Broker] Publishing to ${queueName}: ${message.id}`);
    console.log(`[Message Broker] Trace: ${context.traceId}/${context.spanId}`);

    // Store message
    this.queues.get(queueName)?.push(message);

    // Deliver to consumers
    setTimeout(() => {
      this.deliverMessage(queueName, message);
    }, 10 + Math.random() * 50); // 10-60ms realistic delivery time

    return message.id;
  }

  subscribe(queueName: string, handler: (message: Message) => Promise<void>) {
    if (!this.consumers.has(queueName)) {
      this.consumers.set(queueName, []);
    }
    
    this.consumers.get(queueName)?.push(handler);
    console.log(`[Message Broker] Consumer registered for ${queueName}`);
  }

  private async deliverMessage(queueName: string, message: Message) {
    const consumers = this.consumers.get(queueName);
    if (!consumers || consumers.length === 0) return;

    // Deliver to all consumers (fan-out pattern)
    for (const handler of consumers) {
      try {
        await handler(message);
      } catch (error) {
        console.error(`[Message Broker] Consumer error for ${queueName}:`, error);
      }
    }
  }

  getStats() {
    const stats: Record<string, any> = {};
    this.queues.forEach((messages, queueName) => {
      stats[queueName] = {
        messages: messages.length,
        consumers: this.consumers.get(queueName)?.length || 0
      };
    });
    return stats;
  }
}

export const messageBroker = new MessageBroker();