import { test as base, expect, Page } from '@playwright/test';

/**
 * Authentication fixture for E2E tests
 * Provides helper methods for login, register, and authenticated state
 * 
 * Updated to match actual form structure:
 * - Registration: email, password, confirmPassword (no name field)
 * - Registration requires email verification (handled via MailDev API)
 */

// Test user credentials
export const TEST_USER = {
    email: 'e2e-test@demo.com',
    password: 'TestPassword123!',
};

// MailDev API for fetching verification codes
const MAILDEV_API = 'http://localhost:1080';

// Extend base test with auth helpers
export const test = base.extend<{
    authenticatedPage: Page;
}>({
    authenticatedPage: async ({ page }, use) => {
        // Login before test
        await login(page, TEST_USER.email, TEST_USER.password);
        await use(page);
    },
});

/**
 * Fetch verification code from MailDev
 */
async function getVerificationCode(email: string): Promise<string | null> {
    try {
        // Wait for email to arrive
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Fetch emails from MailDev API
        const response = await fetch(`${MAILDEV_API}/email`);
        const emails = await response.json();

        // Find the most recent email for this address
        const targetEmail = emails.find((e: any) =>
            e.to.some((t: any) => t.address === email)
        );

        if (!targetEmail) {
            console.log('No email found for:', email);
            return null;
        }

        // Extract 6-digit code from email body
        const codeMatch = targetEmail.text?.match(/\b(\d{6})\b/) ||
            targetEmail.html?.match(/\b(\d{6})\b/);

        return codeMatch ? codeMatch[1] : null;
    } catch (error) {
        console.error('Failed to fetch verification code:', error);
        return null;
    }
}

/**
 * Register a new user
 * Handles the 2-step registration flow (register + email verification)
 */
export async function register(page: Page, email: string, password: string, _name: string = 'Test User') {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // Fill registration form (no name field in current form)
    await page.fill('input#email', email);
    await page.fill('input#password', password);
    await page.fill('input#confirmPassword', password);

    // Submit registration
    await page.click('button[type="submit"]');

    // Wait for verification step or error
    await page.waitForTimeout(2000);

    // Check if we're on verification step
    const verificationInput = await page.locator('input#code').isVisible();

    if (verificationInput) {
        // Get verification code from MailDev
        const code = await getVerificationCode(email);

        if (code) {
            await page.fill('input#code', code);
            await page.click('button[type="submit"]');

            // Wait for redirect to trade page
            await page.waitForURL(/\/(portfolio|trade)/, { timeout: 15000 });
        } else {
            // If no code available, try placeholder code for demo
            console.warn('Could not fetch verification code, using demo flow');
            await page.fill('input#code', '123456');
            await page.click('button[type="submit"]');

            // May fail, but continue
            await page.waitForTimeout(2000);
        }
    } else {
        // Direct registration (maybe demo mode)
        await page.waitForURL(/\/(portfolio|trade|login)/, { timeout: 10000 });
    }
}

/**
 * Login with credentials
 */
export async function login(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('input#email', email);
    await page.fill('input#password', password);

    await page.click('button[type="submit"]');

    // Wait for redirect to portfolio
    await page.waitForURL(/\/portfolio/, { timeout: 10000 });
}

/**
 * Logout current user
 */
export async function logout(page: Page) {
    // Look for logout link or button
    const logoutLink = page.locator('a:has-text("Logout"), button:has-text("Logout")');
    if (await logoutLink.isVisible()) {
        await logoutLink.click();
        await page.waitForURL('/');
    }
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
    await page.goto('/trade');
    await page.waitForLoadState('networkidle');
    // If redirected to login, not authenticated
    return !page.url().includes('/login') && !page.url().includes('/register');
}

export { expect };
