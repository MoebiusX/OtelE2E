import { Page, expect } from '@playwright/test';

/**
 * Trading fixture helpers for E2E tests
 */

export interface WalletBalance {
    btc: number;
    usd: number;
    totalValue: number;
}

/**
 * Get current wallet balance from the portfolio panel
 */
export async function getWalletBalance(page: Page): Promise<WalletBalance> {
    // Navigate to trade page if not already there
    if (!page.url().includes('/trade')) {
        await page.goto('/trade');
    }

    // Wait for portfolio to load
    await page.getByText('Your Portfolio').waitFor({ timeout: 10000 });

    // Try to extract balances from the portfolio panel
    // These are approximate - actual selectors depend on DOM structure
    let btc = 0;
    let usd = 0;
    let totalValue = 0;

    try {
        // Look for BTC indicator and grab the balance
        const btcSection = page.locator('div').filter({ hasText: /BTC|Bitcoin/i }).first();
        const btcText = await btcSection.locator('p').first().textContent() || '0';
        btc = parseFloat(btcText.replace(/[^0-9.]/g, '')) || 0;
    } catch { btc = 0; }

    try {
        // Look for USD indicator and grab the balance
        const usdSection = page.locator('div').filter({ hasText: /USD|Dollar/i }).first();
        const usdText = await usdSection.locator('p').first().textContent() || '0';
        usd = parseFloat(usdText.replace(/[^0-9.]/g, '')) || 0;
    } catch { usd = 0; }

    try {
        // Get total balance from header section
        const totalText = await page.getByText(/Total Balance/i).locator('xpath=following-sibling::p').textContent() || '0';
        totalValue = parseFloat(totalText.replace(/[^0-9.]/g, '')) || 0;
    } catch { totalValue = btc * 40000 + usd; }

    return { btc, usd, totalValue };
}

/**
 * Submit a buy order through the UI
 */
export async function submitBuyOrder(page: Page, amount: number): Promise<void> {
    // Ensure we're on the trade page
    if (!page.url().includes('/trade')) {
        await page.goto('/trade');
    }

    // Wait for trade form to load
    await page.getByText('BTC/USD Trade').waitFor({ timeout: 10000 });

    // Click BUY toggle button
    await page.getByRole('button', { name: /^BUY$/i }).click();

    // Fill amount
    await page.locator('input[type="number"]').first().fill(amount.toString());

    // Submit order - button text is "Buy X.XXXX BTC"
    await page.getByRole('button', { name: /Buy.*BTC/i }).click();

    // Wait for execution toast or confirmation
    await page.getByText(/Trade.*Verified|Order Submitted|Executed/i).waitFor({ timeout: 15000 });
}

/**
 * Submit a sell order through the UI
 */
export async function submitSellOrder(page: Page, amount: number): Promise<void> {
    // Ensure we're on the trade page
    if (!page.url().includes('/trade')) {
        await page.goto('/trade');
    }

    // Wait for trade form to load
    await page.getByText('BTC/USD Trade').waitFor({ timeout: 10000 });

    // Click SELL toggle button
    await page.getByRole('button', { name: /^SELL$/i }).click();

    // Fill amount
    await page.locator('input[type="number"]').first().fill(amount.toString());

    // Submit order - button text is "Sell X.XXXX BTC"
    await page.getByRole('button', { name: /Sell.*BTC/i }).click();

    // Wait for execution toast or confirmation
    await page.getByText(/Trade.*Verified|Order Submitted|Executed/i).waitFor({ timeout: 15000 });
}

/**
 * Wait for trade to appear in recent activity
 */
export async function waitForTradeInActivity(page: Page, side: 'BUY' | 'SELL'): Promise<void> {
    await page.getByText(side).waitFor({ timeout: 10000 });
}

/**
 * Check if order was rejected (insufficient funds)
 */
export async function isOrderRejected(page: Page): Promise<boolean> {
    const rejectedText = page.getByText(/insufficient|rejected|failed|error/i);
    try {
        await rejectedText.first().waitFor({ timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}
