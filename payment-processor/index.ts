/**
 * Order Matcher Service (formerly Payment Processor)
 * 
 * A standalone microservice that:
 * 1. Consumes trade orders from the "payments" queue (legacy name kept for compat)
 * 2. Simulates order matching with price execution
 * 3. Sends execution response to the "payment_response" queue
 * 
 * Run with: npx tsx payment-processor/index.ts
 */

import * as amqp from 'amqplib';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, context, SpanStatusCode, SpanKind, propagation } from '@opentelemetry/api';

// Initialize OpenTelemetry
const sdk = new NodeSDK({
    serviceName: 'order-matcher',
    traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
    }),
    instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();

// Message interfaces
interface OrderMessage {
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
    // Legacy fields (for backwards compat)
    paymentId?: number;
    amount?: number;
    currency?: string;
}

interface ExecutionResponse {
    orderId: string;
    correlationId: string;
    paymentId?: number;  // Legacy field
    status: 'FILLED' | 'REJECTED' | 'acknowledged';  // acknowledged for legacy compat
    fillPrice: number;
    totalValue: number;
    processedAt: string;
    processorId: string;
}

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672';
const ORDERS_QUEUE = 'payments';  // Keep legacy queue name for compat
const RESPONSE_QUEUE = 'payment_response';  // Keep legacy queue name
const PROCESSOR_ID = `matcher-${Date.now()}`;

const tracer = trace.getTracer('order-matcher', '1.0.0');

// Price simulation with volatility
function simulateExecution(price: number, side: string): { fillPrice: number; slippage: number } {
    // Simulate slippage: 0.01% to 0.5%
    const slippage = (Math.random() * 0.005 + 0.0001);
    const direction = side === 'BUY' ? 1 : -1;
    const fillPrice = price * (1 + (slippage * direction));
    return {
        fillPrice: Math.round(fillPrice * 100) / 100,
        slippage: Math.round(slippage * 10000) / 100
    };
}

async function main() {
    console.log(`[MATCHER] Starting Order Matcher Service (ID: ${PROCESSOR_ID})...`);

    try {
        // Connect to RabbitMQ
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();

        // Declare queues
        await channel.assertQueue(ORDERS_QUEUE, { durable: true });
        await channel.assertQueue(RESPONSE_QUEUE, { durable: true });

        console.log(`[MATCHER] Connected to RabbitMQ`);
        console.log(`[MATCHER] Listening on queue: ${ORDERS_QUEUE}`);
        console.log(`[MATCHER] Responses sent to: ${RESPONSE_QUEUE}`);

        // Consume orders
        await channel.consume(ORDERS_QUEUE, async (msg) => {
            if (!msg) return;

            // Extract trace context from message headers
            const headers = msg.properties.headers || {};

            // Extract the parent context (for order.match span)
            const parentContext = propagation.extract(context.active(), headers);

            // Also get the original POST span context (for response)
            const originalPostTraceparent = headers['x-parent-traceparent'];
            const originalPostTracestate = headers['x-parent-tracestate'];
            console.log(`[MATCHER] Original POST context: ${originalPostTraceparent?.slice(0, 40) || 'none'}...`);

            // Create processing span as child of extracted context
            const span = tracer.startSpan('order.match', {
                kind: SpanKind.CONSUMER,
                attributes: {
                    'messaging.system': 'rabbitmq',
                    'messaging.source': ORDERS_QUEUE,
                    'messaging.destination': RESPONSE_QUEUE,
                    'messaging.operation': 'process',
                    'processor.id': PROCESSOR_ID
                }
            }, parentContext);

            console.log(`[MATCHER] Created span with traceId: ${span.spanContext().traceId}`);

            // Store original POST context for response routing
            const originalContext = { traceparent: originalPostTraceparent, tracestate: originalPostTracestate };

            await context.with(trace.setSpan(parentContext, span), async () => {
                try {
                    const order: OrderMessage = JSON.parse(msg.content.toString());

                    // Handle both new order format and legacy payment format
                    const orderId = order.orderId || `ORD-${order.paymentId}`;
                    const pair = order.pair || 'BTC/USD';
                    const side = order.side || 'BUY';
                    const quantity = order.quantity || (order.amount ? order.amount / 42500 : 0.001);
                    const currentPrice = order.currentPrice || 42500;

                    console.log(`[MATCHER] Processing ${side} order: ${quantity.toFixed(8)} BTC @ ~$${currentPrice}`);

                    span.setAttributes({
                        'order.id': orderId,
                        'order.pair': pair,
                        'order.side': side,
                        'order.quantity': quantity,
                        'order.price': currentPrice
                    });

                    // Simulate order matching (validation, price lookup, execution)
                    await simulateProcessing(80);

                    // Calculate execution
                    const { fillPrice, slippage } = simulateExecution(currentPrice, side);
                    const totalValue = fillPrice * quantity;

                    console.log(`[MATCHER] Executed: ${side} ${quantity.toFixed(8)} BTC @ $${fillPrice} (slip: ${slippage}%)`);

                    // Create response
                    const response: ExecutionResponse = {
                        orderId,
                        correlationId: order.correlationId,
                        paymentId: order.paymentId,  // Legacy field
                        status: 'FILLED',
                        fillPrice,
                        totalValue,
                        processedAt: new Date().toISOString(),
                        processorId: PROCESSOR_ID
                    };

                    // Send response with ORIGINAL POST context (not order-matcher context)
                    // This makes exchange-api response consumer a sibling of publish span
                    const responseSpan = tracer.startSpan('order.response', {
                        kind: SpanKind.PRODUCER,
                        attributes: {
                            'messaging.system': 'rabbitmq',
                            'messaging.destination': RESPONSE_QUEUE,
                            'messaging.operation': 'publish',
                            'order.id': orderId,
                            'order.status': response.status,
                            'order.fillPrice': fillPrice
                        }
                    });

                    // Send response with original POST context headers
                    const responseHeaders: Record<string, string> = {};
                    if (originalContext.traceparent) {
                        responseHeaders['traceparent'] = originalContext.traceparent;
                    }
                    if (originalContext.tracestate) {
                        responseHeaders['tracestate'] = originalContext.tracestate;
                    }
                    console.log(`[MATCHER] Response with POST context: ${originalContext.traceparent?.slice(0, 40) || 'none'}...`);

                    channel.sendToQueue(
                        RESPONSE_QUEUE,
                        Buffer.from(JSON.stringify(response)),
                        {
                            persistent: true,
                            headers: responseHeaders
                        }
                    );

                    responseSpan.setStatus({ code: SpanStatusCode.OK });
                    responseSpan.end();

                    // Acknowledge original message
                    channel.ack(msg);

                    span.setStatus({ code: SpanStatusCode.OK });
                    console.log(`[MATCHER] Order ${orderId} filled → response sent`);

                } catch (error: any) {
                    console.error(`[MATCHER] Error:`, error.message);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                    channel.nack(msg, false, false);
                } finally {
                    span.end();
                }
            });
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('[MATCHER] Shutting down...');
            await channel.close();
            await connection.close();
            await sdk.shutdown();
            process.exit(0);
        });

    } catch (error: any) {
        console.error('[MATCHER] Failed to start:', error.message);
        process.exit(1);
    }
}

function simulateProcessing(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main();
