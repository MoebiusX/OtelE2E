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
  private tracer = trace.getTracer('jms-broker', '1.0.0');

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
    // Create JMS publish span
    const span = this.tracer.startSpan('jms-message-publish', {
      kind: SpanKind.PRODUCER,
      attributes: {
        'messaging.system': 'jms',
        'messaging.destination': queueName,
        'messaging.destination_kind': 'queue',
        'messaging.operation': 'publish',
        'component': 'solace-jms'
      }
    });

    const message: Message = {
      id: uuidv4(),
      queueName,
      payload,
      context,
      timestamp: new Date()
    };

    console.log(`[JMS Broker] Publishing to ${queueName}: ${message.id}`);
    console.log(`[JMS Broker] Trace: ${context.traceId}/${context.spanId}`);

    // Simulate JMS publish latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 8 + 3));

    // Store message
    this.queues.get(queueName)?.push(message);

    span.setAttributes({
      'messaging.message_id': message.id,
      'messaging.message_payload_size_bytes': JSON.stringify(payload).length,
      'jms.queue': queueName
    });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

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
      // Create JMS consume span
      const span = this.tracer.startSpan('jms-message-consume', {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'jms',
          'messaging.destination': queueName,
          'messaging.destination_kind': 'queue',
          'messaging.operation': 'receive',
          'messaging.message_id': message.id,
          'component': 'solace-jms'
        }
      });

      try {
        // Simulate JMS consume latency
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5 + 2));
        
        await handler(message);
        
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        console.error(`[JMS Broker] Consumer error for ${queueName}:`, error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error instanceof Error ? error.message : 'Unknown error' 
        });
      } finally {
        span.end();
      }
    }
  }

  getStats() {
    const stats: Record<string, any> = {};
    this.queues.forEach((messages, queueName) => {
      stats[queueName] = {
        queueLength: messages.length,
        consumers: this.consumers.get(queueName)?.length || 0
      };
    });
    return stats;
  }

  async clearAllData() {
    this.queues.forEach((messages, queueName) => {
      messages.length = 0;
    });
    console.log('[Message Broker] All queues cleared');
  }
}

export const messageBroker = new MessageBroker();