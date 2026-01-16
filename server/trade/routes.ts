/**
 * Trading Routes
 * 
 * API endpoints for crypto conversion and trading.
 */

import { Router } from 'express';
import { tradeService } from './trade-service';
import { authenticate } from '../auth/routes';

const router = Router();

/**
 * GET /api/trade/pairs
 * Get all trading pairs with prices
 */
router.get('/pairs', (req, res) => {
    const pairs = tradeService.getPairs();
    res.json({ success: true, pairs });
});

/**
 * GET /api/trade/price/:asset
 * Get current price for an asset
 */
router.get('/price/:asset', (req, res) => {
    const price = tradeService.getPrice(req.params.asset);
    res.json({ success: true, asset: req.params.asset.toUpperCase(), price });
});

/**
 * GET /api/trade/rate/:from/:to
 * Get exchange rate between two assets
 */
router.get('/rate/:from/:to', (req, res) => {
    const rate = tradeService.getRate(req.params.from, req.params.to);
    res.json({
        success: true,
        from: req.params.from.toUpperCase(),
        to: req.params.to.toUpperCase(),
        rate
    });
});

/**
 * POST /api/trade/convert/quote
 * Get a quote for converting assets
 */
router.post('/convert/quote', authenticate, (req, res) => {
    try {
        const { fromAsset, toAsset, amount } = req.body;

        if (!fromAsset || !toAsset || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }

        const quote = tradeService.getConvertQuote(fromAsset, toAsset, amount);
        res.json({ success: true, quote });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/trade/convert
 * Execute a conversion
 */
router.post('/convert', authenticate, async (req, res) => {
    try {
        const { fromAsset, toAsset, amount } = req.body;

        if (!fromAsset || !toAsset || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }

        const result = await tradeService.executeConvert(
            req.user!.id,
            fromAsset,
            toAsset,
            amount
        );

        res.json({
            success: true,
            message: `Converted ${amount} ${fromAsset} to ${result.toAmount.toFixed(8)} ${toAsset}`,
            toAmount: result.toAmount,
            orderId: result.orderId
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/trade/order
 * Place a limit order
 */
router.post('/order', authenticate, async (req, res) => {
    try {
        const { pair, side, price, quantity } = req.body;

        if (!pair || !side || !price || !quantity) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['buy', 'sell'].includes(side)) {
            return res.status(400).json({ error: 'Side must be buy or sell' });
        }

        const order = await tradeService.placeLimitOrder(
            req.user!.id,
            pair,
            side,
            price,
            quantity
        );

        res.json({ success: true, order });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * DELETE /api/trade/order/:id
 * Cancel an order
 */
router.delete('/order/:id', authenticate, async (req, res) => {
    try {
        await tradeService.cancelOrder(req.user!.id, req.params.id);
        res.json({ success: true, message: 'Order cancelled' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/trade/orders
 * Get user's orders
 */
router.get('/orders', authenticate, async (req, res) => {
    try {
        const status = req.query.status as string | undefined;
        const orders = await tradeService.getOrders(req.user!.id, status);
        res.json({ success: true, orders });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
