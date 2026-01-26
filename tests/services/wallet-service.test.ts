/**
 * Wallet Service Tests
 * 
 * Comprehensive unit tests for wallet service operations.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock dependencies before importing
vi.mock('../../server/db', () => ({
    default: {
        query: vi.fn(),
        transaction: vi.fn((callback) => callback({
            query: vi.fn()
        })),
    }
}));

vi.mock('../../server/storage', () => ({
    generateWalletAddress: vi.fn((userId: string) => `kx1test${userId.slice(0, 20)}`),
    generateWalletId: vi.fn(() => 'wallet-id-123'),
    SEED_WALLETS: {
        primary: { ownerId: 'primary-user-id', address: 'kx1testprimary' },
        secondary: { ownerId: 'secondary-user-id', address: 'kx1testsecondary' },
    },
    storage: {
        createWallet: vi.fn(),
        getDefaultWallet: vi.fn(),
        resolveAddress: vi.fn(),
    }
}));

vi.mock('../../server/lib/logger', () => ({
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }))
}));

import db from '../../server/db';
import { storage, generateWalletAddress } from '../../server/storage';
import { walletService, SUPPORTED_ASSETS } from '../../server/wallet/wallet-service';

describe('Wallet Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ============================================
    // SUPPORTED ASSETS
    // ============================================
    describe('SUPPORTED_ASSETS', () => {
        it('should include all expected assets', () => {
            expect(SUPPORTED_ASSETS).toContain('BTC');
            expect(SUPPORTED_ASSETS).toContain('ETH');
            expect(SUPPORTED_ASSETS).toContain('USDT');
            expect(SUPPORTED_ASSETS).toContain('USD');
            expect(SUPPORTED_ASSETS).toContain('EUR');
        });

        it('should have 5 supported assets', () => {
            expect(SUPPORTED_ASSETS).toHaveLength(5);
        });
    });

    // ============================================
    // createDefaultWallets
    // ============================================
    describe('createDefaultWallets', () => {
        it('should create wallets for all supported assets', async () => {
            const mockClient = {
                query: vi.fn()
                    .mockResolvedValueOnce({ rows: [{ id: '1', user_id: 'user1', asset: 'BTC', balance: '1' }] })
                    .mockResolvedValueOnce({ rows: [] }) // transaction insert
                    .mockResolvedValueOnce({ rows: [{ id: '2', user_id: 'user1', asset: 'ETH', balance: '10' }] })
                    .mockResolvedValueOnce({ rows: [] })
                    .mockResolvedValueOnce({ rows: [{ id: '3', user_id: 'user1', asset: 'USDT', balance: '10000' }] })
                    .mockResolvedValueOnce({ rows: [] })
                    .mockResolvedValueOnce({ rows: [{ id: '4', user_id: 'user1', asset: 'USD', balance: '5000' }] })
                    .mockResolvedValueOnce({ rows: [] })
                    .mockResolvedValueOnce({ rows: [{ id: '5', user_id: 'user1', asset: 'EUR', balance: '4500' }] })
                    .mockResolvedValueOnce({ rows: [] })
            };

            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));
            (storage.createWallet as Mock).mockResolvedValue({});

            const wallets = await walletService.createDefaultWallets('user1');

            expect(wallets).toHaveLength(5);
            expect(generateWalletAddress).toHaveBeenCalledWith('user1');
            expect(storage.createWallet).toHaveBeenCalledWith('user1', 'Main Trading Wallet');
        });

        it('should handle in-memory storage errors gracefully', async () => {
            const mockClient = {
                query: vi.fn()
                    .mockResolvedValue({ rows: [{ id: '1', user_id: 'user1', asset: 'BTC', balance: '1' }] })
            };

            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));
            (storage.createWallet as Mock).mockRejectedValue(new Error('Already exists'));

            // Should not throw despite storage error
            await expect(walletService.createDefaultWallets('user1')).resolves.toBeDefined();
        });
    });

    // ============================================
    // getKXAddress
    // ============================================
    describe('getKXAddress', () => {
        it('should return address when wallet exists', async () => {
            (storage.getDefaultWallet as Mock).mockResolvedValue({ address: 'kx1testaddress123' });

            const address = await walletService.getKXAddress('user1');

            expect(address).toBe('kx1testaddress123');
            expect(storage.getDefaultWallet).toHaveBeenCalledWith('user1');
        });

        it('should return null when no wallet exists', async () => {
            (storage.getDefaultWallet as Mock).mockResolvedValue(null);

            const address = await walletService.getKXAddress('user1');

            expect(address).toBeNull();
        });

        it('should return null when wallet has no address', async () => {
            (storage.getDefaultWallet as Mock).mockResolvedValue({ id: '1' });

            const address = await walletService.getKXAddress('user1');

            expect(address).toBeNull();
        });
    });

    // ============================================
    // resolveAddress
    // ============================================
    describe('resolveAddress', () => {
        it('should return address for valid identifier', async () => {
            (storage.resolveAddress as Mock).mockResolvedValue('kx1resolved123');

            const address = await walletService.resolveAddress('user@example.com');

            expect(address).toBe('kx1resolved123');
            expect(storage.resolveAddress).toHaveBeenCalledWith('user@example.com');
        });

        it('should return null for unknown identifier', async () => {
            (storage.resolveAddress as Mock).mockResolvedValue(null);

            const address = await walletService.resolveAddress('unknown@example.com');

            expect(address).toBeNull();
        });
    });

    // ============================================
    // getWallets
    // ============================================
    describe('getWallets', () => {
        it('should return all wallets with KX address', async () => {
            const mockWallets = [
                { id: '1', user_id: 'user1', asset: 'BTC', balance: '1', available: '1', locked: '0' },
                { id: '2', user_id: 'user1', asset: 'ETH', balance: '10', available: '10', locked: '0' },
            ];
            (db.query as Mock).mockResolvedValue({ rows: mockWallets });
            (storage.getDefaultWallet as Mock).mockResolvedValue({ address: 'kx1test123' });

            const wallets = await walletService.getWallets('user1');

            expect(wallets).toHaveLength(2);
            expect(wallets[0].address).toBe('kx1test123');
            expect(wallets[1].address).toBe('kx1test123');
        });

        it('should return empty array for user with no wallets', async () => {
            (db.query as Mock).mockResolvedValue({ rows: [] });
            (storage.getDefaultWallet as Mock).mockResolvedValue(null);

            const wallets = await walletService.getWallets('newuser');

            expect(wallets).toEqual([]);
        });
    });

    // ============================================
    // getWallet
    // ============================================
    describe('getWallet', () => {
        it('should return wallet for valid asset', async () => {
            const mockWallet = { id: '1', user_id: 'user1', asset: 'BTC', balance: '1' };
            (db.query as Mock).mockResolvedValue({ rows: [mockWallet] });

            const wallet = await walletService.getWallet('user1', 'btc');

            expect(wallet).toEqual(mockWallet);
            expect(db.query).toHaveBeenCalledWith(
                expect.any(String),
                ['user1', 'BTC']
            );
        });

        it('should return null for non-existent wallet', async () => {
            (db.query as Mock).mockResolvedValue({ rows: [] });

            const wallet = await walletService.getWallet('user1', 'XYZ');

            expect(wallet).toBeNull();
        });

        it('should normalize asset to uppercase', async () => {
            (db.query as Mock).mockResolvedValue({ rows: [] });

            await walletService.getWallet('user1', 'eth');

            expect(db.query).toHaveBeenCalledWith(
                expect.any(String),
                ['user1', 'ETH']
            );
        });
    });

    // ============================================
    // getWalletById
    // ============================================
    describe('getWalletById', () => {
        it('should return wallet for valid ID', async () => {
            const mockWallet = { id: 'wallet-123', user_id: 'user1', asset: 'BTC' };
            (db.query as Mock).mockResolvedValue({ rows: [mockWallet] });

            const wallet = await walletService.getWalletById('wallet-123');

            expect(wallet).toEqual(mockWallet);
        });

        it('should return null for non-existent ID', async () => {
            (db.query as Mock).mockResolvedValue({ rows: [] });

            const wallet = await walletService.getWalletById('invalid-id');

            expect(wallet).toBeNull();
        });
    });

    // ============================================
    // credit
    // ============================================
    describe('credit', () => {
        it('should credit funds and create transaction', async () => {
            const mockClient = {
                query: vi.fn()
                    .mockResolvedValueOnce({ rows: [{ id: 'wallet-1' }] }) // UPDATE
                    .mockResolvedValueOnce({ rows: [{ id: 'tx-1', type: 'deposit', amount: '100' }] }) // INSERT
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            const tx = await walletService.credit('user1', 'btc', 100, 'deposit', 'Test deposit');

            expect(tx.type).toBe('deposit');
            expect(mockClient.query).toHaveBeenCalledTimes(2);
        });

        it('should throw when wallet not found', async () => {
            const mockClient = {
                query: vi.fn().mockResolvedValue({ rows: [] })
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            await expect(walletService.credit('user1', 'xyz', 100))
                .rejects.toThrow('Wallet not found for asset: xyz');
        });

        it('should use default type of deposit', async () => {
            const mockClient = {
                query: vi.fn()
                    .mockResolvedValueOnce({ rows: [{ id: 'wallet-1' }] })
                    .mockResolvedValueOnce({ rows: [{ id: 'tx-1', type: 'deposit' }] })
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            await walletService.credit('user1', 'BTC', 50);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO transactions'),
                expect.arrayContaining(['deposit'])
            );
        });
    });

    // ============================================
    // debit
    // ============================================
    describe('debit', () => {
        it('should debit funds when sufficient balance', async () => {
            const mockClient = {
                query: vi.fn()
                    .mockResolvedValueOnce({ rows: [{ id: 'wallet-1', available: '200' }] }) // SELECT
                    .mockResolvedValueOnce({ rows: [] }) // UPDATE
                    .mockResolvedValueOnce({ rows: [{ id: 'tx-1', type: 'withdrawal', amount: '-50' }] }) // INSERT
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            const tx = await walletService.debit('user1', 'btc', 50, 'withdrawal');

            expect(tx.type).toBe('withdrawal');
        });

        it('should throw when insufficient balance', async () => {
            const mockClient = {
                query: vi.fn().mockResolvedValue({ rows: [{ id: 'wallet-1', available: '30' }] })
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            await expect(walletService.debit('user1', 'btc', 50, 'withdrawal'))
                .rejects.toThrow('Insufficient balance');
        });

        it('should throw when wallet not found', async () => {
            const mockClient = {
                query: vi.fn().mockResolvedValue({ rows: [] })
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            await expect(walletService.debit('user1', 'xyz', 50, 'withdrawal'))
                .rejects.toThrow('Wallet not found for asset: xyz');
        });
    });

    // ============================================
    // lockFunds / unlockFunds
    // ============================================
    describe('lockFunds', () => {
        it('should lock funds for pending order', async () => {
            (db.query as Mock).mockResolvedValue({ rows: [] });

            await walletService.lockFunds('user1', 'usdt', 1000);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('locked = locked + $1'),
                [1000, 'user1', 'USDT']
            );
        });
    });

    describe('unlockFunds', () => {
        it('should unlock funds when order cancelled', async () => {
            (db.query as Mock).mockResolvedValue({ rows: [] });

            await walletService.unlockFunds('user1', 'usdt', 1000);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('locked = locked - $1'),
                [1000, 'user1', 'USDT']
            );
        });
    });

    // ============================================
    // getTransactions
    // ============================================
    describe('getTransactions', () => {
        it('should return transaction history with default limit', async () => {
            const mockTxs = [
                { id: 'tx-1', type: 'deposit', amount: '100', asset: 'BTC' },
                { id: 'tx-2', type: 'withdrawal', amount: '-50', asset: 'BTC' },
            ];
            (db.query as Mock).mockResolvedValue({ rows: mockTxs });

            const txs = await walletService.getTransactions('user1');

            expect(txs).toHaveLength(2);
            expect(db.query).toHaveBeenCalledWith(expect.any(String), ['user1', 50]);
        });

        it('should respect custom limit', async () => {
            (db.query as Mock).mockResolvedValue({ rows: [] });

            await walletService.getTransactions('user1', 10);

            expect(db.query).toHaveBeenCalledWith(expect.any(String), ['user1', 10]);
        });
    });

    // ============================================
    // getBalanceSummary
    // ============================================
    describe('getBalanceSummary', () => {
        it('should return formatted balance summary', async () => {
            const mockWallets = [
                { asset: 'BTC', balance: '1.5', available: '1.2', locked: '0.3' },
                { asset: 'USD', balance: '5000', available: '4500', locked: '500' },
            ];
            (db.query as Mock).mockResolvedValue({ rows: mockWallets });
            (storage.getDefaultWallet as Mock).mockResolvedValue({ address: 'kx1test' });

            const summary = await walletService.getBalanceSummary('user1');

            expect(summary.BTC).toEqual({
                balance: '1.5',
                available: '1.2',
                locked: '0.3',
            });
            expect(summary.USD).toEqual({
                balance: '5000',
                available: '4500',
                locked: '500',
            });
        });
    });

    // ============================================
    // transfer
    // ============================================
    describe('transfer', () => {
        it('should transfer funds between users', async () => {
            const mockClient = {
                query: vi.fn()
                    .mockResolvedValueOnce({ rows: [{ id: 'sender-wallet', available: '1000' }] }) // sender SELECT
                    .mockResolvedValueOnce({ rows: [{ id: 'receiver-wallet' }] }) // receiver SELECT
                    .mockResolvedValueOnce({ rows: [] }) // sender UPDATE
                    .mockResolvedValueOnce({ rows: [] }) // receiver UPDATE
                    .mockResolvedValueOnce({ rows: [] }) // sender tx INSERT
                    .mockResolvedValueOnce({ rows: [] }) // receiver tx INSERT
                    .mockResolvedValueOnce({ rows: [{ available: '500' }] }) // sender balance
                    .mockResolvedValueOnce({ rows: [{ available: '500' }] }) // receiver balance
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            const result = await walletService.transfer('sender', 'receiver', 'BTC', 0.5);

            expect(result.success).toBe(true);
            expect(result.transferId).toMatch(/^TXF-/);
            expect(result.fromBalance).toBe('500');
            expect(result.toBalance).toBe('500');
        });

        it('should throw when sender wallet not found', async () => {
            const mockClient = {
                query: vi.fn().mockResolvedValue({ rows: [] })
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            await expect(walletService.transfer('sender', 'receiver', 'BTC', 0.5))
                .rejects.toThrow('Sender wallet not found');
        });

        it('should throw when insufficient funds', async () => {
            const mockClient = {
                query: vi.fn().mockResolvedValue({ rows: [{ id: 'wallet', available: '0.1' }] })
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            await expect(walletService.transfer('sender', 'receiver', 'BTC', 1.0))
                .rejects.toThrow(); // InsufficientFundsError
        });

        it('should throw when receiver wallet not found', async () => {
            const mockClient = {
                query: vi.fn()
                    .mockResolvedValueOnce({ rows: [{ id: 'sender', available: '100' }] })
                    .mockResolvedValueOnce({ rows: [] }) // receiver not found
            };
            (db.transaction as Mock).mockImplementation(async (callback) => callback(mockClient));

            await expect(walletService.transfer('sender', 'receiver', 'BTC', 0.5))
                .rejects.toThrow('Receiver wallet not found');
        });
    });
});
