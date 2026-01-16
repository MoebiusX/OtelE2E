/**
 * Database Connection
 * 
 * PostgreSQL connection pool for the crypto exchange.
 */

import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'crypto_exchange',
    user: process.env.DB_USER || 'exchange',
    password: process.env.DB_PASSWORD || 'exchange123',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
    console.log('[DB] Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected error:', err.message);
});

export const db = {
    query: (text: string, params?: any[]) => pool.query(text, params),

    getClient: () => pool.connect(),

    // Transaction helper
    async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    // Health check
    async checkHealth(): Promise<boolean> {
        try {
            await pool.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }
};

export default db;
