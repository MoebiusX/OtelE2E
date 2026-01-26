/**
 * Two-Factor Authentication Routes
 * 
 * Endpoints for:
 * - 2FA setup (generate TOTP secret and QR code)
 * - 2FA verification (verify TOTP code)
 * - 2FA enable/disable
 * - Backup codes management
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import crypto from 'crypto';
import db from '../db';
import { createLogger } from '../lib/logger';

const router = Router();
const logger = createLogger('2fa-routes');

// Zod schemas
const verifyTotpSchema = z.object({
    code: z.string().length(6, 'Code must be 6 digits'),
});

const disableTotpSchema = z.object({
    password: z.string().min(8),
});

// ============================================
// 2FA SETUP
// ============================================

/**
 * GET /api/auth/2fa/status
 * Get 2FA status for current user
 */
router.get('/status', async (req: Request, res: Response) => {
    try {
        const userId = req.headers['x-user-id'] as string;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const result = await db.query(
            'SELECT two_factor_enabled FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            enabled: result.rows[0].two_factor_enabled,
        });
    } catch (error) {
        logger.error({ err: error }, 'Failed to get 2FA status');
        res.status(500).json({ error: 'Failed to get 2FA status' });
    }
});

/**
 * POST /api/auth/2fa/setup
 * Generate TOTP secret and QR code for 2FA setup
 */
router.post('/setup', async (req: Request, res: Response) => {
    try {
        const userId = req.headers['x-user-id'] as string;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Get user email
        const userResult = await db.query(
            'SELECT email, two_factor_enabled FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (userResult.rows[0].two_factor_enabled) {
            return res.status(400).json({ error: '2FA is already enabled' });
        }

        // Generate TOTP secret
        const secret = new OTPAuth.Secret({ size: 20 });

        // Create TOTP instance
        const totp = new OTPAuth.TOTP({
            issuer: 'Krystaline',
            label: userResult.rows[0].email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: secret,
        });

        // Generate QR code as data URL
        const qrCodeUrl = await QRCode.toDataURL(totp.toString());

        // Store secret temporarily (not enabled yet)
        await db.query(
            'UPDATE users SET two_factor_secret = $1, updated_at = NOW() WHERE id = $2',
            [secret.base32, userId]
        );

        logger.info({ userId }, '2FA setup initiated');

        res.json({
            secret: secret.base32,
            qrCode: qrCodeUrl,
            manualEntry: {
                issuer: 'Krystaline',
                account: userResult.rows[0].email,
                secret: secret.base32,
            },
        });
    } catch (error) {
        logger.error({ err: error }, 'Failed to setup 2FA');
        res.status(500).json({ error: 'Failed to setup 2FA' });
    }
});

/**
 * POST /api/auth/2fa/verify
 * Verify TOTP code and enable 2FA
 */
router.post('/verify', async (req: Request, res: Response) => {
    try {
        const userId = req.headers['x-user-id'] as string;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const validation = verifyTotpSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: validation.error.errors[0].message });
        }

        const { code } = validation.data;

        // Get user's secret
        const userResult = await db.query(
            'SELECT email, two_factor_secret, two_factor_enabled FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { two_factor_secret, two_factor_enabled } = userResult.rows[0];

        if (!two_factor_secret) {
            return res.status(400).json({ error: 'Please run 2FA setup first' });
        }

        // Verify TOTP
        const totp = new OTPAuth.TOTP({
            issuer: 'Krystaline',
            label: userResult.rows[0].email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(two_factor_secret),
        });

        const delta = totp.validate({ token: code, window: 1 });

        if (delta === null) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Generate backup codes if enabling for first time
        if (!two_factor_enabled) {
            const backupCodes = Array.from({ length: 8 }, () =>
                crypto.randomBytes(4).toString('hex').toUpperCase()
            );

            await db.query(
                `UPDATE users SET 
          two_factor_enabled = true, 
          two_factor_backup_codes = $1,
          updated_at = NOW()
         WHERE id = $2`,
                [JSON.stringify(backupCodes), userId]
            );

            logger.info({ userId }, '2FA enabled successfully');

            return res.json({
                success: true,
                message: '2FA enabled successfully',
                backupCodes,
            });
        }

        // Just verification (2FA already enabled)
        res.json({ success: true, message: 'Code verified' });
    } catch (error) {
        logger.error({ err: error }, 'Failed to verify 2FA');
        res.status(500).json({ error: 'Failed to verify 2FA' });
    }
});

/**
 * POST /api/auth/2fa/disable
 * Disable 2FA (requires password)
 */
router.post('/disable', async (req: Request, res: Response) => {
    try {
        const userId = req.headers['x-user-id'] as string;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const validation = disableTotpSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: validation.error.errors[0].message });
        }

        const { password } = validation.data;

        // Import bcrypt dynamically
        const bcrypt = await import('bcrypt');

        // Verify password
        const userResult = await db.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isValid = await bcrypt.compare(password, userResult.rows[0].password_hash);
        if (!isValid) {
            return res.status(400).json({ error: 'Incorrect password' });
        }

        // Disable 2FA
        await db.query(
            `UPDATE users SET 
        two_factor_enabled = false,
        two_factor_secret = NULL,
        two_factor_backup_codes = NULL,
        updated_at = NOW()
       WHERE id = $1`,
            [userId]
        );

        logger.info({ userId }, '2FA disabled');
        res.json({ success: true, message: '2FA disabled successfully' });
    } catch (error) {
        logger.error({ err: error }, 'Failed to disable 2FA');
        res.status(500).json({ error: 'Failed to disable 2FA' });
    }
});

/**
 * GET /api/auth/2fa/backup-codes
 * Get new backup codes (regenerates them)
 */
router.get('/backup-codes', async (req: Request, res: Response) => {
    try {
        const userId = req.headers['x-user-id'] as string;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Check if 2FA is enabled
        const userResult = await db.query(
            'SELECT two_factor_enabled FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!userResult.rows[0].two_factor_enabled) {
            return res.status(400).json({ error: '2FA is not enabled' });
        }

        // Generate new backup codes
        const backupCodes = Array.from({ length: 8 }, () =>
            crypto.randomBytes(4).toString('hex').toUpperCase()
        );

        await db.query(
            'UPDATE users SET two_factor_backup_codes = $1, updated_at = NOW() WHERE id = $2',
            [JSON.stringify(backupCodes), userId]
        );

        logger.info({ userId }, 'Backup codes regenerated');
        res.json({ backupCodes });
    } catch (error) {
        logger.error({ err: error }, 'Failed to get backup codes');
        res.status(500).json({ error: 'Failed to get backup codes' });
    }
});

/**
 * POST /api/auth/2fa/verify-backup
 * Verify using backup code (for login recovery)
 */
router.post('/verify-backup', async (req: Request, res: Response) => {
    try {
        const userId = req.headers['x-user-id'] as string;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { code } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'Backup code required' });
        }

        // Get backup codes
        const userResult = await db.query(
            'SELECT two_factor_backup_codes FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const backupCodes: string[] = userResult.rows[0].two_factor_backup_codes || [];
        const normalizedCode = code.toUpperCase().replace(/-/g, '');
        const codeIndex = backupCodes.indexOf(normalizedCode);

        if (codeIndex === -1) {
            return res.status(400).json({ error: 'Invalid backup code' });
        }

        // Remove used backup code
        backupCodes.splice(codeIndex, 1);
        await db.query(
            'UPDATE users SET two_factor_backup_codes = $1, updated_at = NOW() WHERE id = $2',
            [JSON.stringify(backupCodes), userId]
        );

        logger.info({ userId }, 'Backup code used successfully');
        res.json({
            success: true,
            message: 'Backup code verified',
            remainingCodes: backupCodes.length,
        });
    } catch (error) {
        logger.error({ err: error }, 'Failed to verify backup code');
        res.status(500).json({ error: 'Failed to verify backup code' });
    }
});

export default router;
