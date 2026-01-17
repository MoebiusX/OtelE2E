/**
 * Price Service
 * 
 * Provides real-time cryptocurrency prices from external APIs.
 * 
 * PHILOSOPHY: Everything MUST be real. No fake/mocked data.
 * If prices are unavailable, we clearly indicate that rather than fake it.
 */

import { createLogger } from '../lib/logger';

const logger = createLogger('price-service');

export interface PriceData {
  symbol: string;
  price: number;
  source: string;
  timestamp: Date;
}

export interface PriceServiceStatus {
  connected: boolean;
  source: string;
  lastUpdate: Date | null;
  availableAssets: string[];
}

// Cache for prices with TTL
const priceCache: Map<string, PriceData> = new Map();
const CACHE_TTL_MS = 60000; // 1 minute cache

// Service status
let serviceStatus: PriceServiceStatus = {
  connected: false,
  source: 'none',
  lastUpdate: null,
  availableAssets: [],
};

// Stable coin prices (these are pegged, not variable)
const STABLE_PRICES: Record<string, number> = {
  USDT: 1.00,
  USDC: 1.00,
  USD: 1.00,
};

/**
 * Price Service - Real prices only, no fakes
 */
export const priceService = {
  /**
   * Get current price for an asset
   * Returns null if price is not available (NOT a fake price)
   */
  getPrice(symbol: string): PriceData | null {
    const upperSymbol = symbol.toUpperCase();
    
    // Stable coins have fixed prices
    if (STABLE_PRICES[upperSymbol] !== undefined) {
      return {
        symbol: upperSymbol,
        price: STABLE_PRICES[upperSymbol],
        source: 'stable-peg',
        timestamp: new Date(),
      };
    }
    
    // Check cache
    const cached = priceCache.get(upperSymbol);
    if (cached) {
      const age = Date.now() - cached.timestamp.getTime();
      if (age < CACHE_TTL_MS) {
        return cached;
      }
      // Cache expired, remove it
      priceCache.delete(upperSymbol);
    }
    
    // No cached price available
    return null;
  },

  /**
   * Get exchange rate between two assets
   * Returns null if either price is unavailable
   */
  getRate(fromSymbol: string, toSymbol: string): number | null {
    const fromPrice = this.getPrice(fromSymbol);
    const toPrice = this.getPrice(toSymbol);
    
    if (!fromPrice || !toPrice) {
      return null;
    }
    
    if (toPrice.price === 0) {
      return null;
    }
    
    return fromPrice.price / toPrice.price;
  },

  /**
   * Check if prices are available for trading
   */
  isPriceAvailable(symbol: string): boolean {
    return this.getPrice(symbol) !== null;
  },

  /**
   * Get service status
   */
  getStatus(): PriceServiceStatus {
    return { ...serviceStatus };
  },

  /**
   * Update price from external source
   * Called by WebSocket handlers or polling mechanisms
   */
  updatePrice(symbol: string, price: number, source: string): void {
    const upperSymbol = symbol.toUpperCase();
    
    const priceData: PriceData = {
      symbol: upperSymbol,
      price,
      source,
      timestamp: new Date(),
    };
    
    priceCache.set(upperSymbol, priceData);
    
    serviceStatus.lastUpdate = new Date();
    if (!serviceStatus.availableAssets.includes(upperSymbol)) {
      serviceStatus.availableAssets.push(upperSymbol);
    }
    
    logger.debug(`Price updated: ${upperSymbol} = $${price} (${source})`);
  },

  /**
   * Set service connection status
   */
  setConnected(connected: boolean, source: string): void {
    serviceStatus.connected = connected;
    serviceStatus.source = source;
    logger.info(`Price service ${connected ? 'connected' : 'disconnected'}: ${source}`);
  },

  /**
   * Clear all cached prices (for testing/reset)
   */
  clearCache(): void {
    priceCache.clear();
    serviceStatus.availableAssets = [];
    serviceStatus.lastUpdate = null;
  },

  /**
   * Get all available prices
   */
  getAllPrices(): PriceData[] {
    const prices: PriceData[] = [];
    
    // Add stable coins
    for (const [symbol, price] of Object.entries(STABLE_PRICES)) {
      prices.push({
        symbol,
        price,
        source: 'stable-peg',
        timestamp: new Date(),
      });
    }
    
    // Add cached prices
    for (const priceData of priceCache.values()) {
      const age = Date.now() - priceData.timestamp.getTime();
      if (age < CACHE_TTL_MS) {
        prices.push(priceData);
      }
    }
    
    return prices;
  },
};

export default priceService;
