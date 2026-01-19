/**
 * Seed Demo Users Script
 *
 * Creates two pre-verified demo users for demonstration purposes.
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
  { email: 'alice@demo.com', password: 'Demo1234' },
  { email: 'bob@demo.com', password: 'Demo1234' },
];

const INITIAL_BALANCES: Record<string, number> = {
  BTC: 1,
  ETH: 10,
  USDT: 10000,
  USD: 5000,
  EUR: 4500,
};

async function seedDemoUsers() {
  console.log('🌱 Seeding demo users...\n');

  const client = await pool.connect();

  try {
    for (const demoUser of DEMO_USERS) {
      // Check if user already exists
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [
        demoUser.email,
      ]);

      if (existing.rows.length > 0) {
        console.log(`⏭️  User ${demoUser.email} already exists, skipping...`);
        continue;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(demoUser.password, 12);

      // Create user (already verified)
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, status, kyc_level)
                 VALUES ($1, $2, 'verified', 1)
                 RETURNING id, email`,
        [demoUser.email, passwordHash],
      );

      const user = userResult.rows[0];
      console.log(`✅ Created user: ${user.email} (ID: ${user.id})`);

      // Create wallets with initial balances
      for (const [asset, balance] of Object.entries(INITIAL_BALANCES)) {
        await client.query(
          `INSERT INTO wallets (user_id, asset, balance, available, locked)
                     VALUES ($1, $2, $3, $3, 0)`,
          [user.id, asset, balance],
        );
      }
      console.log(`   💰 Created wallets with initial balances`);

      // Get BTC wallet for bonus transaction
      const walletResult = await client.query(
        `SELECT id FROM wallets WHERE user_id = $1 AND asset = 'BTC'`,
        [user.id],
      );

      if (walletResult.rows.length > 0) {
        await client.query(
          `INSERT INTO transactions (user_id, wallet_id, type, amount, description)
                     VALUES ($1, $2, 'bonus', $3, 'Demo account welcome bonus')`,
          [user.id, walletResult.rows[0].id, INITIAL_BALANCES.BTC],
        );
      }
    }

    console.log('\n✨ Demo users ready!\n');
    console.log('📋 Login credentials:');
    console.log('   ┌─────────────────────────────────────┐');
    console.log('   │  Email: alice@demo.com              │');
    console.log('   │  Password: Demo1234                 │');
    console.log('   ├─────────────────────────────────────┤');
    console.log('   │  Email: bob@demo.com                │');
    console.log('   │  Password: Demo1234                 │');
    console.log('   └─────────────────────────────────────┘');
    console.log('\n🚀 Demo flow:');
    console.log('   1. Login as alice@demo.com');
    console.log('   2. Go to /trade and buy/sell BTC');
    console.log('   3. Go to /activity to see traces');
    console.log('   4. Open a second browser, login as bob@demo.com');
    console.log("   5. On Alice's browser, go to /convert and transfer BTC to Bob");
    console.log('   6. View traces in Jaeger: http://localhost:16686');
  } catch (error) {
    console.error('❌ Error seeding users:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seedDemoUsers();
