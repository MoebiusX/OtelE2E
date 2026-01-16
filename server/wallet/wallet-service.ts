/**
 * Wallet Service
 * 
 * Manages user wallets, balances, and transactions.
 */

import db from '../db';

// Supported assets
export const SUPPORTED_ASSETS = ['BTC', 'ETH', 'USDT', 'USD', 'EUR'];

// Initial test balances for new users
const INITIAL_BALANCES: Record<string, number> = {
    USDT: 10000,
    BTC: 1,
    ETH: 10,
    USD: 5000,
    EUR: 4500,
};

export interface Wallet {
    id: string;
    user_id: string;
    asset: string;
    balance: string;
    available: string;
    locked: string;
}

export interface Transaction {
    id: string;
    user_id: string;
    wallet_id: string;
    type: string;
    amount: string;
    fee: string;
    status: string;
    reference_id: string | null;
    description: string | null;
    created_at: Date;
}

export const walletService = {
    /**
     * Create default wallets for a new user with test funds
     */
    async createDefaultWallets(userId: string): Promise<Wallet[]> {
        const wallets: Wallet[] = [];

        await db.transaction(async (client) => {
            for (const asset of SUPPORTED_ASSETS) {
                const balance = INITIAL_BALANCES[asset] || 0;

                const result = await client.query(
                    `INSERT INTO wallets (user_id, asset, balance, available, locked)
                     VALUES ($1, $2, $3, $3, 0)
                     RETURNING *`,
                    [userId, asset, balance]
                );

                wallets.push(result.rows[0]);

                // Log bonus transaction if balance > 0
                if (balance > 0) {
                    await client.query(
                        `INSERT INTO transactions (user_id, wallet_id, type, amount, description)
                         VALUES ($1, $2, 'bonus', $3, 'Welcome bonus - test funds')`,
                        [userId, result.rows[0].id, balance]
                    );
                }
            }
        });

        console.log(`[WALLET] Created ${wallets.length} wallets for user ${userId}`);
        return wallets;
    },

    /**
     * Get all wallets for a user
     */
    async getWallets(userId: string): Promise<Wallet[]> {
        const result = await db.query(
            `SELECT * FROM wallets WHERE user_id = $1 ORDER BY asset`,
            [userId]
        );
        return result.rows;
    },

    /**
     * Get a specific wallet
     */
    async getWallet(userId: string, asset: string): Promise<Wallet | null> {
        const result = await db.query(
            `SELECT * FROM wallets WHERE user_id = $1 AND asset = $2`,
            [userId, asset.toUpperCase()]
        );
        return result.rows[0] || null;
    },

    /**
     * Get wallet by ID
     */
    async getWalletById(walletId: string): Promise<Wallet | null> {
        const result = await db.query(
            `SELECT * FROM wallets WHERE id = $1`,
            [walletId]
        );
        return result.rows[0] || null;
    },

    /**
     * Credit funds to a wallet
     */
    async credit(
        userId: string,
        asset: string,
        amount: number,
        type: 'deposit' | 'trade_buy' | 'bonus' = 'deposit',
        description?: string,
        referenceId?: string
    ): Promise<Transaction> {
        return db.transaction(async (client) => {
            // Update wallet balance
            const walletResult = await client.query(
                `UPDATE wallets 
                 SET balance = balance + $1, available = available + $1, updated_at = NOW()
                 WHERE user_id = $2 AND asset = $3
                 RETURNING *`,
                [amount, userId, asset.toUpperCase()]
            );

            if (walletResult.rows.length === 0) {
                throw new Error(`Wallet not found for asset: ${asset}`);
            }

            // Create transaction record
            const txResult = await client.query(
                `INSERT INTO transactions (user_id, wallet_id, type, amount, description, reference_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [userId, walletResult.rows[0].id, type, amount, description, referenceId]
            );

            console.log(`[WALLET] Credited ${amount} ${asset} to user ${userId}`);
            return txResult.rows[0];
        });
    },

    /**
     * Debit funds from a wallet
     */
    async debit(
        userId: string,
        asset: string,
        amount: number,
        type: 'withdrawal' | 'trade_sell' | 'fee',
        description?: string,
        referenceId?: string
    ): Promise<Transaction> {
        return db.transaction(async (client) => {
            // Check available balance
            const walletResult = await client.query(
                `SELECT * FROM wallets WHERE user_id = $1 AND asset = $2 FOR UPDATE`,
                [userId, asset.toUpperCase()]
            );

            if (walletResult.rows.length === 0) {
                throw new Error(`Wallet not found for asset: ${asset}`);
            }

            const wallet = walletResult.rows[0];
            if (parseFloat(wallet.available) < amount) {
                throw new Error(`Insufficient balance. Available: ${wallet.available} ${asset}`);
            }

            // Update wallet balance
            await client.query(
                `UPDATE wallets 
                 SET balance = balance - $1, available = available - $1, updated_at = NOW()
                 WHERE id = $2`,
                [amount, wallet.id]
            );

            // Create transaction record
            const txResult = await client.query(
                `INSERT INTO transactions (user_id, wallet_id, type, amount, description, reference_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [userId, wallet.id, type, -amount, description, referenceId]
            );

            console.log(`[WALLET] Debited ${amount} ${asset} from user ${userId}`);
            return txResult.rows[0];
        });
    },

    /**
     * Lock funds for a pending order
     */
    async lockFunds(userId: string, asset: string, amount: number): Promise<void> {
        await db.query(
            `UPDATE wallets 
             SET available = available - $1, locked = locked + $1, updated_at = NOW()
             WHERE user_id = $2 AND asset = $3 AND available >= $1`,
            [amount, userId, asset.toUpperCase()]
        );
    },

    /**
     * Unlock funds (order cancelled)
     */
    async unlockFunds(userId: string, asset: string, amount: number): Promise<void> {
        await db.query(
            `UPDATE wallets 
             SET available = available + $1, locked = locked - $1, updated_at = NOW()
             WHERE user_id = $2 AND asset = $3 AND locked >= $1`,
            [amount, userId, asset.toUpperCase()]
        );
    },

    /**
     * Get transaction history
     */
    async getTransactions(userId: string, limit = 50): Promise<Transaction[]> {
        const result = await db.query(
            `SELECT t.*, w.asset 
             FROM transactions t
             JOIN wallets w ON t.wallet_id = w.id
             WHERE t.user_id = $1
             ORDER BY t.created_at DESC
             LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    },

    /**
     * Get balance summary (formatted for display)
     */
    async getBalanceSummary(userId: string): Promise<Record<string, { balance: string; available: string; locked: string }>> {
        const wallets = await this.getWallets(userId);
        const summary: Record<string, any> = {};

        for (const wallet of wallets) {
            summary[wallet.asset] = {
                balance: wallet.balance,
                available: wallet.available,
                locked: wallet.locked,
            };
        }

        return summary;
    }
};

export default walletService;
