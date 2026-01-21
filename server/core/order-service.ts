// Order Service - Crypto Exchange Core Business Logic
// Handles trade orders and BTC transfers between users

import { storage } from '../storage';
import { rabbitMQClient } from '../services/rabbitmq-client';
import { walletService } from '../wallet/wallet-service';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { createLogger } from '../lib/logger';
import { OrderError, ValidationError, InsufficientFundsError, getErrorMessage } from '../lib/errors';

const logger = createLogger('order');

// ============================================
// PRICE SIMULATION
// ============================================

let currentPrice = 42500;

export function getPrice() {
    const fluctuation = (Math.random() - 0.5) * 0.01;
    currentPrice = currentPrice * (1 + fluctuation);
    currentPrice = Math.max(35000, Math.min(55000, currentPrice));
    return Math.round(currentPrice * 100) / 100;
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

export interface OrderRequest {
    userId: string;
    pair: string;
    side: "BUY" | "SELL";
    quantity: number;
    orderType: "MARKET";
}

export interface OrderResult {
    orderId: string;
    traceId: string;
    spanId: string;
    order: any;
    execution?: {
        status: string;
        fillPrice: number;
        totalValue: number;
        processedAt: string;
        processorId: string;
    };
}

export interface TransferRequest {
    fromUserId: string;
    toUserId: string;
    amount: number;
}

export interface TransferResult {
    transferId: string;
    traceId: string;
    spanId: string;
    transfer: any;
    status: string;
    message?: string;
}

// ============================================
// ORDER SERVICE
// ============================================

export class OrderService {
    private orderCounter = 0;
    private transferCounter = 0;

    // Get wallet for a specific user
    async getWallet(userId: string = 'alice') {
        return storage.getWallet(userId);
    }

    // Get all users
    async getUsers() {
        return storage.getUsers();
    }

    // Submit a trade order
    async submitOrder(request: OrderRequest): Promise<OrderResult> {
        const activeSpan = trace.getActiveSpan();
        const spanContext = activeSpan?.spanContext();

        const traceId = spanContext?.traceId || this.generateTraceId();
        const spanId = spanContext?.spanId || this.generateSpanId();
        const correlationId = this.generateCorrelationId();
        const orderId = `ORD-${Date.now()}-${++this.orderCounter}`;
        const userId = request.userId || 'alice';

        logger.info({
            userId,
            side: request.side,
            quantity: request.quantity,
            orderId
        }, 'Submitting trade order');

        const price = getPrice();
        const totalValue = price * request.quantity;

        // Get user's actual wallet balances from database
        const usdWallet = await walletService.getWallet(userId, 'USD');
        const btcWallet = await walletService.getWallet(userId, 'BTC');

        // Fallback to legacy storage for demo users (alice, bob)
        const isLegacyUser = ['alice', 'bob'].includes(userId);
        let usdBalance = 0;
        let btcBalance = 0;

        if (isLegacyUser) {
            const legacyWallet = await storage.getWallet(userId);
            usdBalance = legacyWallet?.usd || 0;
            btcBalance = legacyWallet?.btc || 0;
        } else {
            usdBalance = usdWallet ? parseFloat(usdWallet.available) : 0;
            btcBalance = btcWallet ? parseFloat(btcWallet.available) : 0;
        }

        // Validation
        if (request.side === 'BUY' && totalValue > usdBalance) {
            logger.warn({
                userId,
                required: totalValue,
                available: usdBalance
            }, 'Order rejected - insufficient USD');
            return {
                orderId, traceId, spanId,
                order: null,
                execution: { status: 'REJECTED', fillPrice: price, totalValue, processedAt: new Date().toISOString(), processorId: 'local-validator' }
            };
        }

        if (request.side === 'SELL' && request.quantity > btcBalance) {
            logger.warn({
                userId,
                required: request.quantity,
                available: btcBalance
            }, 'Order rejected - insufficient BTC');
            return {
                orderId, traceId, spanId,
                order: null,
                execution: { status: 'REJECTED', fillPrice: price, totalValue, processedAt: new Date().toISOString(), processorId: 'local-validator' }
            };
        }

        // Store order
        const order = await storage.createOrder({
            orderId,
            pair: request.pair,
            side: request.side,
            quantity: request.quantity,
            orderType: request.orderType,
            traceId,
            spanId,
            userId
        });

        // Process via RabbitMQ - MUST preserve the current context for proper trace propagation
        const isRabbitConnected = rabbitMQClient.isConnected();
        logger.info({
            orderId,
            rabbitMQConnected: isRabbitConnected
        }, 'Order processing - checking RabbitMQ connection');

        if (isRabbitConnected) {
            // Capture the current context to ensure it's passed to RabbitMQ
            const currentContext = context.active();
            const activeSpanForRabbit = trace.getSpan(currentContext);

            logger.info({
                hasContext: !!activeSpanForRabbit,
                contextTraceId: activeSpanForRabbit?.spanContext().traceId,
            }, 'Calling RabbitMQ with captured context');

            try {
                // Execute within the captured context to ensure trace propagation
                const executionResponse = await context.with(currentContext, () =>
                    rabbitMQClient.publishOrderAndWait({
                        orderId,
                        correlationId,
                        pair: request.pair,
                        side: request.side,
                        quantity: request.quantity,
                        orderType: request.orderType,
                        currentPrice: price,
                        traceId,
                        spanId,
                        userId,
                        timestamp: new Date().toISOString()
                    }, 5000)
                );

                logger.info({
                    orderId,
                    status: executionResponse.status,
                    fillPrice: executionResponse.fillPrice,
                    processorId: executionResponse.processorId
                }, 'Order execution response received');

                if (executionResponse.status === 'FILLED') {
                    await this.updateUserWallet(userId, request.side, request.quantity, executionResponse.fillPrice);
                }

                await storage.updateOrder(orderId, {
                    status: executionResponse.status as "PENDING" | "FILLED" | "REJECTED",
                    fillPrice: executionResponse.fillPrice,
                    totalValue: executionResponse.totalValue
                });

                return {
                    orderId, traceId, spanId,
                    order,
                    execution: {
                        status: executionResponse.status,
                        fillPrice: executionResponse.fillPrice,
                        totalValue: executionResponse.totalValue,
                        processedAt: executionResponse.processedAt,
                        processorId: executionResponse.processorId
                    }
                };
            } catch (error: unknown) {
                logger.warn({
                    err: error,
                    orderId
                }, 'Order matcher timeout');
                return { orderId, traceId, spanId, order };
            }
        } else {
            // Fallback: local execution
            logger.warn({
                orderId,
                reason: 'RabbitMQ not connected - using local fallback'
            }, 'Order processed locally (kx-matcher bypassed)');
            await this.updateUserWallet(userId, request.side, request.quantity, price);
            return {
                orderId, traceId, spanId,
                order,
                execution: {
                    status: 'FILLED',
                    fillPrice: price,
                    totalValue,
                    processedAt: new Date().toISOString(),
                    processorId: 'local-fallback'
                }
            };
        }
    }

    // Process BTC transfer between users
    async processTransfer(request: TransferRequest): Promise<TransferResult> {
        const tracer = trace.getTracer('kx-exchange');

        return tracer.startActiveSpan('btc.transfer', async (span) => {
            const activeSpan = trace.getActiveSpan();
            const spanContext = activeSpan?.spanContext();

            const traceId = spanContext?.traceId || this.generateTraceId();
            const spanId = spanContext?.spanId || this.generateSpanId();
            const transferId = `TXN-${Date.now()}-${++this.transferCounter}`;

            span.setAttribute('transfer.id', transferId);
            span.setAttribute('transfer.from', request.fromUserId);
            span.setAttribute('transfer.to', request.toUserId);
            span.setAttribute('transfer.amount', request.amount);

            logger.info({
                transferId,
                from: request.fromUserId,
                to: request.toUserId,
                amount: request.amount
            }, 'Processing BTC transfer');

            try {
                // Get both wallets
                const fromWallet = await storage.getWallet(request.fromUserId);
                const toWallet = await storage.getWallet(request.toUserId);

                if (!fromWallet || !toWallet) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'User not found' });
                    span.end();
                    return {
                        transferId, traceId, spanId,
                        transfer: null,
                        status: 'FAILED',
                        message: 'User not found'
                    };
                }

                // Check balance
                if (fromWallet.btc < request.amount) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'Insufficient BTC' });
                    span.end();
                    return {
                        transferId, traceId, spanId,
                        transfer: null,
                        status: 'FAILED',
                        message: `Insufficient BTC. ${request.fromUserId} has ${fromWallet.btc} BTC`
                    };
                }

                // Create transfer record
                const transfer = await storage.createTransfer({
                    transferId,
                    fromAddress: request.fromUserId,  // Use userId as address for legacy compatibility
                    toAddress: request.toUserId,      // Use userId as address for legacy compatibility
                    amount: request.amount,
                    traceId,
                    spanId
                });

                // Update wallets
                await storage.updateWallet(request.fromUserId, { btc: fromWallet.btc - request.amount });
                await storage.updateWallet(request.toUserId, { btc: toWallet.btc + request.amount });

                // Update transfer status
                await storage.updateTransfer(transferId, 'COMPLETED');

                logger.info({
                    transferId,
                    fromUserId: request.fromUserId,
                    fromBalance: fromWallet.btc - request.amount,
                    toUserId: request.toUserId,
                    toBalance: toWallet.btc + request.amount
                }, 'Transfer completed successfully');

                span.setAttribute('transfer.status', 'COMPLETED');
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();

                return {
                    transferId, traceId, spanId,
                    transfer: { ...transfer, status: 'COMPLETED' },
                    status: 'COMPLETED'
                };
            } catch (error: unknown) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: getErrorMessage(error) });
                span.end();
                return {
                    transferId, traceId, spanId,
                    transfer: null,
                    status: 'FAILED',
                    message: getErrorMessage(error)
                };
            }
        });
    }

    // Update user's wallet after trade
    private async updateUserWallet(userId: string, side: "BUY" | "SELL", quantity: number, price: number) {
        const wallet = await storage.getWallet(userId);
        if (!wallet) return;

        const totalValue = quantity * price;

        if (side === 'BUY') {
            await storage.updateWallet(userId, {
                btc: wallet.btc + quantity,
                usd: wallet.usd - totalValue
            });
        } else {
            await storage.updateWallet(userId, {
                btc: wallet.btc - quantity,
                usd: wallet.usd + totalValue
            });
        }

        logger.debug({
            userId,
            btc: wallet.btc.toFixed(6),
            usd: wallet.usd.toFixed(2)
        }, 'Wallet updated after trade');
    }

    async getOrders(limit: number = 10) {
        return storage.getOrders(limit);
    }

    async getTransfers(limit: number = 10) {
        return storage.getTransfers(limit);
    }

    async clearAllData() {
        return storage.clearAllData();
    }

    private generateCorrelationId(): string {
        return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }

    private generateTraceId(): string {
        return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    private generateSpanId(): string {
        return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
}

export const orderService = new OrderService();
