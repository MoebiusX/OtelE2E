# Krystaline Exchange - OpenTelemetry Demo

A **multi-user cryptocurrency exchange** demonstrating end-to-end distributed tracing with OpenTelemetry. Trade BTC/USD with proper blockchain-style wallet addresses (`kx1...`), and watch your requests flow through the entire system in Jaeger.

## Quick Start

```bash
# Start all services
npm run dev

# Clean restart (kills all processes, restarts Docker + app)
scripts\restart.bat
```

**Open**: http://localhost:5173

## What This Demo Shows

### Full Distributed Trace (17 spans)
```
kx-wallet: order.submit.client             ← Browser starts trade
├── kx-wallet: HTTP POST                   ← Fetch request
│   └── api-gateway: kong                  ← Kong Gateway (routes + plugins)
│       └── api-gateway: kong.balancer
│           └── kx-exchange: POST          ← Exchange API handler
│               ├── kx-exchange: publish orders      ← RabbitMQ publish
│               │   └── kx-exchange: publish <default>
│               │       └── kx-matcher: order.match  ← Consumer processes
│               │           └── kx-matcher: order.response
│               └── kx-exchange: payment_response process  ← Response received
└── kx-wallet: order.response.received     ← Browser receives FILLED
```

### Multi-User Transfers
```
kx-wallet: transfer.submit.client          ← Browser starts transfer
├── kx-wallet: HTTP POST                   ← Fetch request
│   └── api-gateway: kong → kx-exchange: btc.transfer
└── kx-wallet: transfer.response.received
```

### Services & OTEL Names

| Service | URL | OTEL Service Name |
|---------|-----|-------------------|
| Krystaline Wallet (Browser) | http://localhost:5173 | `kx-wallet` |
| Krystaline Exchange API (Server) | http://localhost:5000 | `kx-exchange` |
| Krystaline Matcher (Processor) | RabbitMQ consumer | `kx-matcher` |
| Kong Gateway | http://localhost:8000 | `api-gateway` |
| Jaeger UI | http://localhost:16686 | - |
| RabbitMQ | http://localhost:15672 | - |

## Architecture

```
Browser (kx-wallet)
    ↓ HTTP POST /api/orders (or /api/transfer)
Kong Gateway (api-gateway)
    ↓
Krystaline Exchange API (kx-exchange)
    ↓ RabbitMQ publish (with trace context)
Order Matcher (order-matcher)
    ↓ Execute trade
    ↓ RabbitMQ response (with parent context)
Exchange API (update wallet)
    ↓
Browser (order.response.received)
```

## Features

### Trading
- **Dark themed** crypto trading UI
- **BTC/USD trading** with simulated price (~$42K range)
- **BUY/SELL orders** with fill price and slippage
- **Real-time wallet** balance updates

### Multi-User
- **User switcher** - Toggle between Alice 👩 and Bob 👨
- **BTC transfers** - Send BTC between users
- **Per-user wallets** - Each user has separate BTC/USD balance

### Tracing
- **17 spans** for order flow
- **4 services** in distributed trace
- **Context propagation** through RabbitMQ
- **Client-side spans** showing response processing

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET | List users (Alice, Bob) |
| `/api/wallet?userId=alice` | GET | Get user's wallet |
| `/api/orders` | POST | Submit trade order |
| `/api/transfer` | POST | Transfer BTC between users |
| `/api/transfers` | GET | List recent transfers |
| `/api/price` | GET | Current BTC price |

## Testing

### Manual Test - Order
1. Go to http://localhost:5173
2. Select Alice or Bob
3. Enter BTC amount (e.g., 0.01)
4. Click BUY or SELL
5. Check Jaeger at http://localhost:16686 → service `crypto-wallet`

### Manual Test - Transfer
1. Select Alice
2. Click "Transfer BTC" tab
3. Enter amount (e.g., 0.1)
4. Click Send → BTC moves to Bob
5. Switch to Bob to verify balance

## Technical Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS
- **Backend**: Express.js, TypeScript
- **Messaging**: RabbitMQ with W3C trace context propagation
- **Gateway**: Kong Gateway with OpenTelemetry plugin
- **Tracing**: OpenTelemetry SDK (browser + Node.js)
- **Visualization**: Jaeger

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development environment |
| `scripts\restart.bat` | Clean restart (Docker + app) |
| `npm run test:e2e` | Run E2E tests |
| `npm run build` | Build for production |