/**
 * Check Demo User Wallet Balances
 *
 * Prints wallet balances for Alice and Bob.
 * Run with: npx tsx scripts/check-demo-balances.ts
 */

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'crypto_exchange',
  user: 'exchange',
  password: 'exchange123',
});

const DEMO_USERS = ['alice@demo.com', 'bob@demo.com'];

async function checkBalances() {
  const client = await pool.connect();
  try {
    for (const email of DEMO_USERS) {
      const userRes = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRes.rows.length === 0) {
        console.log(`❌ User not found: ${email}`);
        continue;
      }
      const userId = userRes.rows[0].id;
      const walletRes = await client.query(
        'SELECT asset, balance, available, locked FROM wallets WHERE user_id = $1',
        [userId],
      );
      console.log(`\nBalances for ${email}:`);
      if (walletRes.rows.length === 0) {
        console.log('  (No wallets found)');
      } else {
        for (const row of walletRes.rows) {
          console.log(
            `  ${row.asset}: balance=${row.balance} available=${row.available} locked=${row.locked}`,
          );
        }
      }
    }
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

checkBalances();
