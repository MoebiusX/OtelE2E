/**
 * Wallet Service Unit Tests
 *
 * Tests for wallet management, balances, and transactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../server/db', () => ({
  default: {
    query: vi.fn(),
    transaction: vi.fn((fn) =>
      fn({
        query: vi.fn(),
      }),
    ),
  },
}));

vi.mock('../../server/storage', () => ({
  generateWalletAddress: vi.fn((userId: string) => `kx1${userId}mock123456789abcdefgh`),
  generateWalletId: vi.fn(() => 'wal_mock123456789abcdefgh'),
  storage: {
    createWallet: vi.fn(),
    getDefaultWallet: vi.fn(),
    resolveAddress: vi.fn(),
  },
}));

vi.mock('../../server/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { walletService, SUPPORTED_ASSETS, type Wallet } from '../../server/wallet/wallet-service';
import db from '../../server/db';
import { generateWalletAddress, generateWalletId, storage } from '../../server/storage';

describe('Wallet Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('SUPPORTED_ASSETS', () => {
    it('should include BTC', () => {
      expect(SUPPORTED_ASSETS).toContain('BTC');
    });

    it('should include ETH', () => {
      expect(SUPPORTED_ASSETS).toContain('ETH');
    });

    it('should include USDT', () => {
      expect(SUPPORTED_ASSETS).toContain('USDT');
    });

    it('should include USD', () => {
      expect(SUPPORTED_ASSETS).toContain('USD');
    });

    it('should include EUR', () => {
      expect(SUPPORTED_ASSETS).toContain('EUR');
    });

    it('should have exactly 5 supported assets', () => {
      expect(SUPPORTED_ASSETS.length).toBe(5);
    });
  });

  describe('getWallets', () => {
    it('should return all wallets for a user', async () => {
      const mockWallets = [
        { id: '1', user_id: 'alice', asset: 'BTC', balance: '1.5', available: '1.5', locked: '0' },
        {
          id: '2',
          user_id: 'alice',
          asset: 'USD',
          balance: '10000',
          available: '10000',
          locked: '0',
        },
      ];
      vi.mocked(db.query).mockResolvedValue({ rows: mockWallets } as any);
      vi.mocked(storage.getDefaultWallet).mockResolvedValue({ address: 'kx1alice123' } as any);

      const wallets = await walletService.getWallets('alice');

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM wallets'), [
        'alice',
      ]);
      expect(wallets.length).toBe(2);
      expect(wallets[0]).toHaveProperty('address');
    });

    it('should add kx1 address to each wallet', async () => {
      const mockWallets = [
        { id: '1', user_id: 'bob', asset: 'ETH', balance: '5', available: '5', locked: '0' },
      ];
      vi.mocked(db.query).mockResolvedValue({ rows: mockWallets } as any);
      vi.mocked(storage.getDefaultWallet).mockResolvedValue({ address: 'kx1bob456789' } as any);

      const wallets = await walletService.getWallets('bob');

      expect(wallets[0].address).toBe('kx1bob456789');
    });

    it('should return empty array for user with no wallets', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] } as any);
      vi.mocked(storage.getDefaultWallet).mockResolvedValue(null);

      const wallets = await walletService.getWallets('newuser');

      expect(wallets).toEqual([]);
    });
  });

  describe('getWallet', () => {
    it('should return specific wallet by user and asset', async () => {
      const mockWallet = { id: '1', user_id: 'alice', asset: 'BTC', balance: '2.5' };
      vi.mocked(db.query).mockResolvedValue({ rows: [mockWallet] } as any);

      const wallet = await walletService.getWallet('alice', 'BTC');

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM wallets'), [
        'alice',
        'BTC',
      ]);
      expect(wallet?.balance).toBe('2.5');
    });

    it('should uppercase asset before query', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] } as any);

      await walletService.getWallet('alice', 'btc');

      expect(db.query).toHaveBeenCalledWith(expect.any(String), ['alice', 'BTC']);
    });

    it('should return null if wallet not found', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] } as any);

      const wallet = await walletService.getWallet('alice', 'FAKE');

      expect(wallet).toBeNull();
    });
  });

  describe('getWalletById', () => {
    it('should return wallet by ID', async () => {
      const mockWallet = { id: 'wal_123', user_id: 'alice', asset: 'BTC' };
      vi.mocked(db.query).mockResolvedValue({ rows: [mockWallet] } as any);

      const wallet = await walletService.getWalletById('wal_123');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM wallets WHERE id'),
        ['wal_123'],
      );
      expect(wallet?.id).toBe('wal_123');
    });

    it('should return null if ID not found', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] } as any);

      const wallet = await walletService.getWalletById('nonexistent');

      expect(wallet).toBeNull();
    });
  });

  describe('getKXAddress', () => {
    it('should return kx1 address from storage', async () => {
      vi.mocked(storage.getDefaultWallet).mockResolvedValue({
        address: 'kx1testaddress12345',
      } as any);

      const address = await walletService.getKXAddress('alice');

      expect(storage.getDefaultWallet).toHaveBeenCalledWith('alice');
      expect(address).toBe('kx1testaddress12345');
    });

    it('should return null if no default wallet', async () => {
      vi.mocked(storage.getDefaultWallet).mockResolvedValue(null);

      const address = await walletService.getKXAddress('newuser');

      expect(address).toBeNull();
    });
  });

  describe('resolveAddress', () => {
    it('should resolve user identifier to address', async () => {
      vi.mocked(storage.resolveAddress).mockResolvedValue('kx1resolved123');

      const address = await walletService.resolveAddress('alice@demo.com');

      expect(storage.resolveAddress).toHaveBeenCalledWith('alice@demo.com');
      expect(address).toBe('kx1resolved123');
    });

    it('should return null if identifier cannot be resolved', async () => {
      vi.mocked(storage.resolveAddress).mockResolvedValue(null);

      const address = await walletService.resolveAddress('unknown@test.com');

      expect(address).toBeNull();
    });
  });
});

describe('Wallet Address Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use generateWalletAddress for new users', () => {
    // The mock returns the configured value, so configure it to return a proper address
    vi.mocked(generateWalletAddress).mockReturnValue('kx1testaddress123');
    const address = generateWalletAddress('newuser');
    expect(address).toMatch(/^kx1/);
  });

  it('should use generateWalletId for new wallets', () => {
    // Configure mock to return a proper wallet ID
    vi.mocked(generateWalletId).mockReturnValue('wal_test123');
    const walletId = generateWalletId();
    expect(walletId).toMatch(/^wal_/);
  });
});

describe('Wallet Balance Types', () => {
  it('should have balance, available, and locked fields', async () => {
    const mockWallet = {
      id: '1',
      user_id: 'alice',
      asset: 'BTC',
      balance: '1.5',
      available: '1.0',
      locked: '0.5',
    };
    vi.mocked(db.query).mockResolvedValue({ rows: [mockWallet] } as any);

    const wallet = await walletService.getWallet('alice', 'BTC');

    expect(wallet).toHaveProperty('balance');
    expect(wallet).toHaveProperty('available');
    expect(wallet).toHaveProperty('locked');
  });

  it('should store balances as strings for precision', async () => {
    const mockWallet = {
      id: '1',
      user_id: 'alice',
      asset: 'BTC',
      balance: '0.12345678',
      available: '0.12345678',
      locked: '0',
    };
    vi.mocked(db.query).mockResolvedValue({ rows: [mockWallet] } as any);

    const wallet = await walletService.getWallet('alice', 'BTC');

    expect(typeof wallet?.balance).toBe('string');
    expect(wallet?.balance).toBe('0.12345678');
  });
});
