/**
 * Seed Demo Users Script
 * 
 * Creates two pre-verified demo users for demonstration purposes.
 * If users already exist, their wallets are RESET to initial balances.
 * Run with: npx tsx scripts/seed-demo-users.ts
 */

import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'crypto_exchange',
    user: 'exchange',
    password: 'exchange123',
});

const DEMO_USERS = [
    { email: 'seed.user.primary@krystaline.io', password: 'Demo1234' },
    { email: 'seed.user.secondary@krystaline.io', password: 'Demo1234' },
];

// Balances stored in base units: satoshis (BTC), gwei (ETH), cents (USD)
// 1 BTC = 100,000,000 satoshis
// 1 USD = 100 cents
const INITIAL_BALANCES: Record<string, number> = {
    BTC: 100000000,    // 1 BTC in satoshis
    ETH: 10000000000,  // 10 ETH in gwei (10^9)
    USDT: 1000000,     // 10000 USDT in cents
    USD: 500000,       // $5000 USD in cents
    EUR: 450000,       // €4500 EUR in cents
};


async function seedDemoUsers() {
    console.log('🌱 Seeding demo users and resetting wallets...\n');

    const client = await pool.connect();

    try {
        for (const demoUser of DEMO_USERS) {
            // Check if user already exists
            const existing = await client.query(
                'SELECT id FROM users WHERE email = $1',
                [demoUser.email]
            );

            let userId: string;

            if (existing.rows.length > 0) {
                userId = existing.rows[0].id;
                console.log(`🔄 User ${demoUser.email} exists, resetting wallets...`);

                // Delete existing wallets and transactions to reset balances
                await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
                await client.query('DELETE FROM wallets WHERE user_id = $1', [userId]);
                console.log(`   🗑️  Cleared old wallets and transactions`);
            } else {
                // Hash password
                const passwordHash = await bcrypt.hash(demoUser.password, 12);

                // Create user (already verified)
                const userResult = await client.query(
                    `INSERT INTO users (email, password_hash, status, kyc_level)
                     VALUES ($1, $2, 'verified', 1)
                     RETURNING id, email`,
                    [demoUser.email, passwordHash]
                );

                userId = userResult.rows[0].id;
                console.log(`✅ Created user: ${demoUser.email} (ID: ${userId})`);
            }

            // Create wallets with initial balances (for both new and existing users)
            for (const [asset, balance] of Object.entries(INITIAL_BALANCES)) {
                await client.query(
                    `INSERT INTO wallets (user_id, asset, balance, available, locked)
                     VALUES ($1, $2, $3, $3, 0)`,
                    [userId, asset, balance]
                );
            }
            console.log(`   💰 Created wallets with initial balances`);

            // Get BTC wallet for bonus transaction
            const walletResult = await client.query(
                `SELECT id FROM wallets WHERE user_id = $1 AND asset = 'BTC'`,
                [userId]
            );

            if (walletResult.rows.length > 0) {
                await client.query(
                    `INSERT INTO transactions (user_id, wallet_id, type, amount, description)
                     VALUES ($1, $2, 'bonus', $3, 'Demo account welcome bonus')`,
                    [userId, walletResult.rows[0].id, INITIAL_BALANCES.BTC]
                );
            }
        }

        console.log('\n✨ Demo users ready!\n');
        console.log('📋 Login credentials:');
        console.log('   ┌──────────────────────────────────────────────────┐');
        console.log('   │  Email: seed.user.primary@krystaline.io          │');
        console.log('   │  Password: Demo1234                              │');
        console.log('   ├──────────────────────────────────────────────────┤');
        console.log('   │  Email: seed.user.secondary@krystaline.io        │');
        console.log('   │  Password: Demo1234                              │');
        console.log('   └──────────────────────────────────────────────────┘');
        console.log('\n🚀 Demo flow:');
        console.log('   1. Login as seed.user.primary@krystaline.io');
        console.log('   2. Go to /trade and buy/sell BTC');
        console.log('   3. Go to /activity to see traces');
        console.log('   4. Open a second browser, login as seed.user.secondary@krystaline.io');
        console.log('   5. On Primary\'s browser, go to /convert and transfer BTC to Secondary');
        console.log('   6. View traces in Jaeger: http://localhost:16686');

    } catch (error) {
        console.error('❌ Error seeding users:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

seedDemoUsers();
