#!/usr/bin/env tsx
// Apache QPID JMS Message Broker - Separate Process
// AMQP 1.0 compliant message broker for enterprise messaging

import * as rhea from 'rhea';
import { v4 as uuidv4 } from 'uuid';

const BROKER_PORT = 5672;
const BROKER_HOST = '0.0.0.0';

interface QueueMessage {
  messageId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  topic: string;
  payload: any;
  timestamp: Date;
  properties: Record<string, any>;
}

class AMQPBroker {
  private container: any;
  private listeners: Map<string, any[]> = new Map();
  private queues: Map<string, QueueMessage[]> = new Map();

  constructor() {
    this.container = rhea.create_container();
    this.setupQueues();
    this.setupListeners();
  }

  private setupQueues() {
    // Create enterprise payment processing queues
    const queueNames = [
      'payment-processing',
      'payment-validation', 
      'payment-notification',
      'payment-audit',
      'payment-deadletter'
    ];

    queueNames.forEach(queueName => {
      this.queues.set(queueName, []);
      console.log(`[JMS Broker] Queue created: ${queueName}`);
    });
  }

  private setupListeners() {
    // Accept incoming connections
    this.container.on('connection_open', (context: any) => {
      console.log('[JMS Broker] Client connected');
    });

    // Handle sender links (producers)
    this.container.on('sender_open', (context: any) => {
      const queueName = context.sender.target.address;
      console.log(`[JMS Broker] Producer connected to queue: ${queueName}`);
    });

    // Handle receiver links (consumers)
    this.container.on('receiver_open', (context: any) => {
      const queueName = context.receiver.source.address;
      console.log(`[JMS Broker] Consumer connected to queue: ${queueName}`);
      
      if (!this.listeners.has(queueName)) {
        this.listeners.set(queueName, []);
      }
      this.listeners.get(queueName)?.push(context.receiver);
    });

    // Handle incoming messages
    this.container.on('message', (context: any) => {
      const queueName = context.receiver.source.address;
      const message = context.message;
      
      const queueMessage: QueueMessage = {
        messageId: message.message_id || uuidv4(),
        traceId: message.application_properties?.traceId || '',
        spanId: message.application_properties?.spanId || '',
        parentSpanId: message.application_properties?.parentSpanId,
        topic: queueName,
        payload: message.body,
        timestamp: new Date(),
        properties: message.application_properties || {}
      };

      console.log(`[JMS Broker] Message received on ${queueName}: ${queueMessage.messageId}`);
      console.log(`[JMS Broker] Trace context: ${queueMessage.traceId}/${queueMessage.spanId}`);

      // Store message in queue
      this.queues.get(queueName)?.push(queueMessage);

      // Process message immediately (simulate processing)
      this.processMessage(queueName, queueMessage);
    });
  }

  private processMessage(queueName: string, message: QueueMessage) {
    // Simulate message processing delay
    setTimeout(() => {
      console.log(`[JMS Broker] Processing message ${message.messageId} from ${queueName}`);
      
      // Route to downstream queues based on message type
      if (queueName === 'payment-processing') {
        this.routePaymentMessage(message);
      }
    }, Math.random() * 1000 + 500); // 500-1500ms processing time
  }

  private routePaymentMessage(message: QueueMessage) {
    const payload = message.payload;
    
    // Route to validation queue
    this.publishToQueue('payment-validation', {
      ...payload,
      validationRequired: true
    }, message.traceId, message.spanId);

    // Route to notification queue  
    this.publishToQueue('payment-notification', {
      recipient: payload.recipient,
      amount: payload.amount,
      currency: payload.currency
    }, message.traceId, message.spanId);

    // Route to audit queue
    this.publishToQueue('payment-audit', {
      ...payload,
      processedAt: new Date().toISOString()
    }, message.traceId, message.spanId);
  }

  private publishToQueue(queueName: string, payload: any, traceId: string, parentSpanId: string) {
    const spanId = this.generateSpanId();
    
    const message: QueueMessage = {
      messageId: uuidv4(),
      traceId,
      spanId,
      parentSpanId,
      topic: queueName,
      payload,
      timestamp: new Date(),
      properties: { traceId, spanId, parentSpanId }
    };

    this.queues.get(queueName)?.push(message);
    console.log(`[JMS Broker] Published to ${queueName}: ${message.messageId}`);
    
    // Notify consumers
    const listeners = this.listeners.get(queueName);
    if (listeners && listeners.length > 0) {
      // Send to first available consumer (round-robin would be more realistic)
      const consumer = listeners[0];
      consumer.send({
        message_id: message.messageId,
        body: payload,
        application_properties: message.properties
      });
    }
  }

  private generateSpanId(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  public start() {
    this.container.listen({ 
      port: BROKER_PORT, 
      host: BROKER_HOST 
    });
    
    console.log(`🚀 JMS Message Broker (AMQP 1.0) started`);
    console.log(`   Listening on ${BROKER_HOST}:${BROKER_PORT}`);
    console.log(`   Queues: ${Array.from(this.queues.keys()).join(', ')}`);
  }

  public getStats() {
    const stats: Record<string, number> = {};
    this.queues.forEach((messages, queueName) => {
      stats[queueName] = messages.length;
    });
    return stats;
  }
}

// Start the broker
const broker = new AMQPBroker();
broker.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[JMS Broker] Shutting down gracefully...');
  process.exit(0);
});