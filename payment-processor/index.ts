/**
 * Payment Processor Service
 * 
 * A standalone microservice that:
 * 1. Consumes payment messages from the "payments" queue
 * 2. Processes the payment (simulated)
 * 3. Sends an acknowledgment response to the "payment_response" queue
 * 
 * Run with: node payment-processor/index.js
 */

import * as amqp from 'amqplib';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, context, SpanStatusCode, SpanKind, propagation } from '@opentelemetry/api';

// Initialize OpenTelemetry
const sdk = new NodeSDK({
    serviceName: 'payment-processor',
    traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
    }),
    instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();

// Message interfaces
interface PaymentMessage {
    paymentId: number;
    correlationId: string;  // For correlation wait pattern
    amount: number;
    currency: string;
    recipient: string;
    description: string;
    traceId: string;
    spanId: string;
    timestamp: string;
}

interface PaymentResponse {
    paymentId: number;
    correlationId: string;  // Echo back for correlation
    status: 'acknowledged' | 'rejected' | 'error';
    processedAt: string;
    processorId: string;
}

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672';
const PAYMENTS_QUEUE = 'payments';
const RESPONSE_QUEUE = 'payment_response';
const PROCESSOR_ID = `processor-${Date.now()}`;

const tracer = trace.getTracer('payment-processor', '1.0.0');

async function main() {
    console.log(`[PROCESSOR] Starting Payment Processor Service (ID: ${PROCESSOR_ID})...`);

    try {
        // Connect to RabbitMQ
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();

        // Declare queues
        await channel.assertQueue(PAYMENTS_QUEUE, { durable: true });
        await channel.assertQueue(RESPONSE_QUEUE, { durable: true });

        console.log(`[PROCESSOR] Connected to RabbitMQ`);
        console.log(`[PROCESSOR] Listening on queue: ${PAYMENTS_QUEUE}`);
        console.log(`[PROCESSOR] Responses sent to: ${RESPONSE_QUEUE}`);

        // Consume messages from payments queue
        await channel.consume(PAYMENTS_QUEUE, async (msg) => {
            if (!msg) return;

            // Extract trace context from message headers
            const parentContext = propagation.extract(context.active(), msg.properties.headers || {});

            // Create processing span
            const span = tracer.startSpan('payment.process', {
                kind: SpanKind.CONSUMER,
                attributes: {
                    'messaging.system': 'rabbitmq',
                    'messaging.source': PAYMENTS_QUEUE,
                    'messaging.destination': RESPONSE_QUEUE,
                    'messaging.operation': 'process',
                    'processor.id': PROCESSOR_ID
                }
            }, parentContext);

            await context.with(trace.setSpan(parentContext, span), async () => {
                try {
                    const payment: PaymentMessage = JSON.parse(msg.content.toString());

                    console.log(`[PROCESSOR] Processing payment ${payment.paymentId}:`, {
                        amount: payment.amount,
                        currency: payment.currency,
                        recipient: payment.recipient
                    });

                    span.setAttributes({
                        'payment.id': payment.paymentId,
                        'payment.amount': payment.amount,
                        'payment.currency': payment.currency,
                        'payment.recipient': payment.recipient
                    });

                    // Simulate processing (validation, fraud check, etc.)
                    await simulateProcessing(100);

                    // Create response with correlationId for correlation
                    const response: PaymentResponse = {
                        paymentId: payment.paymentId,
                        correlationId: payment.correlationId,
                        status: 'acknowledged',
                        processedAt: new Date().toISOString(),
                        processorId: PROCESSOR_ID
                    };

                    // Send response to payment_response queue - with proper trace context
                    const responseSpan = tracer.startSpan('payment.respond', {
                        kind: SpanKind.PRODUCER,
                        attributes: {
                            'messaging.system': 'rabbitmq',
                            'messaging.destination': RESPONSE_QUEUE,
                            'messaging.operation': 'publish',
                            'payment.id': payment.paymentId,
                            'payment.status': response.status
                        }
                    });

                    // Inject trace context WITHIN the responseSpan context
                    context.with(trace.setSpan(context.active(), responseSpan), () => {
                        const responseHeaders: Record<string, string> = {};
                        propagation.inject(context.active(), responseHeaders);

                        channel.sendToQueue(
                            RESPONSE_QUEUE,
                            Buffer.from(JSON.stringify(response)),
                            {
                                persistent: true,
                                headers: responseHeaders
                            }
                        );
                    });

                    responseSpan.setStatus({ code: SpanStatusCode.OK });
                    responseSpan.end();

                    // Acknowledge original message
                    channel.ack(msg);

                    span.setStatus({ code: SpanStatusCode.OK });
                    console.log(`[PROCESSOR] Payment ${payment.paymentId} processed → response sent`);

                } catch (error: any) {
                    console.error(`[PROCESSOR] Error:`, error.message);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                    channel.nack(msg, false, false);
                } finally {
                    span.end();
                }
            });
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('[PROCESSOR] Shutting down...');
            await channel.close();
            await connection.close();
            await sdk.shutdown();
            process.exit(0);
        });

    } catch (error: any) {
        console.error('[PROCESSOR] Failed to start:', error.message);
        process.exit(1);
    }
}

function simulateProcessing(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main();
