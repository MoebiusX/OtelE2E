import { test, expect } from '@playwright/test';
import { register, login, logout } from './fixtures/auth';
import { getWalletBalance, submitBuyOrder, submitSellOrder, isOrderRejected } from './fixtures/trading';

/**
 * Trading Flow E2E Tests
 * 
 * Tests buy/sell orders, balance updates, and insufficient funds rejection
 */

test.describe('Trading Flow', () => {

    // Create unique test user for each test run
    let testEmail: string;

    test.beforeAll(() => {
        testEmail = `e2e-trade-${Date.now()}@test.com`;
    });

    test.describe('Buy Orders', () => {

        test('should execute buy order with sufficient funds', async ({ page }) => {
            // Register new user (has initial demo balance)
            await register(page, testEmail, 'TradeTest123!');

            // Navigate to trade page
            await page.goto('/trade');
            await page.waitForLoadState('networkidle');

            // Get initial balance
            const initialBalance = await getWalletBalance(page);
            console.log('Initial balance:', initialBalance);

            // Execute small buy order
            await submitBuyOrder(page, 0.0001);

            // Wait for balance to update
            await page.waitForTimeout(2000);

            // Verify balance changed
            const newBalance = await getWalletBalance(page);
            console.log('New balance:', newBalance);

            // BTC should increase, USD should decrease
            expect(newBalance.btc).toBeGreaterThan(initialBalance.btc);
        });

        test('should reject buy order with insufficient USD', async ({ page }) => {
            // Register new user
            const poorUser = `e2e-poor-${Date.now()}@test.com`;
            await register(page, poorUser, 'PoorTest123!');

            // Navigate to trade
            await page.goto('/trade');
            await page.waitForLoadState('networkidle');

            // Try to buy way more than balance allows (user has ~$10k USD)
            // Attempt to buy 100 BTC (~$4M worth)
            await page.click('button:has-text("Trade BTC")');
            await page.click('button:has-text("BUY")');
            await page.fill('input[type="number"]', '100');
            await page.click('button:has-text("Buy")');

            // Should show rejection/error
            const hasError = await isOrderRejected(page);
            expect(hasError).toBe(true);
        });
    });

    test.describe('Sell Orders', () => {

        test('should reject sell order with insufficient BTC', async ({ page }) => {
            // Register new user (starts with 0 BTC typically)
            const noBtcUser = `e2e-nobtc-${Date.now()}@test.com`;
            await register(page, noBtcUser, 'NoBtc123!');

            // Navigate to trade
            await page.goto('/trade');
            await page.waitForLoadState('networkidle');

            // Try to sell BTC when we have none
            await page.click('button:has-text("Trade BTC")');
            await page.click('button:has-text("SELL")');
            await page.fill('input[type="number"]', '1');
            await page.click('button:has-text("Sell")');

            // Should show rejection/error
            const hasError = await isOrderRejected(page);
            expect(hasError).toBe(true);
        });
    });

    test.describe('Trade Tracing', () => {

        test('should show trade in recent activity with trace link', async ({ page }) => {
            // Register and login
            const traceUser = `e2e-trace-${Date.now()}@test.com`;
            await register(page, traceUser, 'TraceTest123!');

            // Navigate to trade
            await page.goto('/trade');
            await page.waitForLoadState('networkidle');

            // Execute a trade
            await submitBuyOrder(page, 0.0001);

            // Wait for activity to update
            await page.waitForTimeout(3000);

            // Check recent activity shows the trade
            await expect(page.getByText('Recent Activity')).toBeVisible();
            await expect(page.getByText(/BUY.*BTC/i)).toBeVisible({ timeout: 10000 });

            // Trade should have trace link (Jaeger icon)
            const traceLink = page.locator('a[href*="localhost:16686/trace"]');
            await expect(traceLink.first()).toBeVisible({ timeout: 10000 });
        });

        test('should display trade execution confirmation', async ({ page }) => {
            // Register and login
            const confirmUser = `e2e-confirm-${Date.now()}@test.com`;
            await register(page, confirmUser, 'Confirm123!');

            // Navigate to trade
            await page.goto('/trade');
            await page.waitForLoadState('networkidle');

            // Execute a trade
            await page.click('button:has-text("Trade BTC")');
            await page.click('button:has-text("BUY")');
            await page.fill('input[type="number"]', '0.0001');
            await page.click('button:has-text("Buy")');

            // Should show execution confirmation
            await expect(page.getByText(/Executed|Submitted|Verified/i)).toBeVisible({ timeout: 15000 });
        });
    });
});
