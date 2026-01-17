/**
 * Binance Price Feed
 * 
 * Connects to Binance public WebSocket API for real-time prices.
 * No API key required - uses public market data streams.
 * 
 * Docs: https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams
 */

import WebSocket from 'ws';
import { priceService } from './price-service';
import { createLogger } from '../lib/logger';

const logger = createLogger('binance-feed');

// Binance WebSocket endpoints
const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';

// Symbols we care about (Binance format: lowercase + usdt)
const SYMBOLS = ['btcusdt', 'ethusdt'];

// Map Binance symbols to our format
const SYMBOL_MAP: Record<string, string> = {
  btcusdt: 'BTC',
  ethusdt: 'ETH',
};

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Binance Price Feed Service
 */
export const binanceFeed = {
  /**
   * Start the price feed connection
   */
  start(): void {
    if (isRunning) {
      logger.warn('Binance feed already running');
      return;
    }
    
    isRunning = true;
    this.connect();
    logger.info('Binance price feed started');
  },

  /**
   * Stop the price feed connection
   */
  stop(): void {
    isRunning = false;
    
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    if (ws) {
      ws.close();
      ws = null;
    }
    
    priceService.setConnected(false, 'binance');
    logger.info('Binance price feed stopped');
  },

  /**
   * Connect to Binance WebSocket
   */
  connect(): void {
    if (!isRunning) return;
    
    try {
      // Subscribe to mini ticker streams for all symbols
      const streams = SYMBOLS.map(s => `${s}@miniTicker`).join('/');
      const url = `${BINANCE_WS_URL}/${streams}`;
      
      ws = new WebSocket(url);
      
      ws.on('open', () => {
        logger.info('Connected to Binance WebSocket');
        priceService.setConnected(true, 'binance');
      });
      
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (err) {
          logger.error('Failed to parse Binance message', err);
        }
      });
      
      ws.on('close', () => {
        logger.warn('Binance WebSocket closed');
        priceService.setConnected(false, 'binance');
        this.scheduleReconnect();
      });
      
      ws.on('error', (err) => {
        logger.error('Binance WebSocket error', err);
        priceService.setConnected(false, 'binance');
      });
      
    } catch (err) {
      logger.error('Failed to connect to Binance', err);
      this.scheduleReconnect();
    }
  },

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(message: any): void {
    // Mini ticker format: { e: '24hrMiniTicker', s: 'BTCUSDT', c: '42000.00', ... }
    if (message.e === '24hrMiniTicker') {
      const symbol = message.s?.toLowerCase();
      const price = parseFloat(message.c);
      
      if (symbol && !isNaN(price) && SYMBOL_MAP[symbol]) {
        priceService.updatePrice(SYMBOL_MAP[symbol], price, 'binance');
      }
    }
  },

  /**
   * Schedule reconnection after disconnect
   */
  scheduleReconnect(): void {
    if (!isRunning) return;
    
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    
    // Reconnect after 5 seconds
    reconnectTimer = setTimeout(() => {
      logger.info('Attempting to reconnect to Binance...');
      this.connect();
    }, 5000);
  },

  /**
   * Get current connection status
   */
  isConnected(): boolean {
    return ws?.readyState === WebSocket.OPEN;
  },
};

export default binanceFeed;
