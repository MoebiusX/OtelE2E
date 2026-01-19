# Krystaline Exchange - User Journey Design

## Executive Summary

This document defines the proper user journey for Krystaline Exchange, replacing the PoC prototype with a professional, production-ready experience that highlights our core value proposition: **Proof of Observability™**.

---

## Current State Analysis

### What Exists (Backend - KEEP)

| Component         | Status     | Notes                                  |
| ----------------- | ---------- | -------------------------------------- |
| User Registration | ✅ Working | Email + password, verification codes   |
| Login/JWT Auth    | ✅ Working | Access + refresh tokens                |
| Wallet System     | ✅ Working | Multi-asset balances, welcome bonus    |
| Convert/Swap      | ✅ Working | Real Binance prices, instant swap      |
| Trade Service     | ✅ Working | Market orders, order history           |
| Real Price Feed   | ✅ Working | Binance WebSocket, real-time BTC/ETH   |
| Transparency API  | ✅ Working | Public trades, system status           |
| Monitoring        | ✅ Working | Anomaly detection, WebSocket streaming |
| OpenTelemetry     | ✅ Working | Full distributed tracing               |

### What Exists (Frontend - MESSY)

| Page                        | Status      | Problem                                    |
| --------------------------- | ----------- | ------------------------------------------ |
| `/` (TransparencyDashboard) | ✅ Good     | Public landing, observability story        |
| `/register`                 | ✅ Good     | Clean registration flow                    |
| `/login`                    | ✅ Good     | Professional login                         |
| `/trade` (Dashboard)        | ✅ Good     | Trade with trace viewer integration        |
| `/portfolio`                | ✅ Good     | Real prices, first-trade CTA for new users |
| `/convert`                  | ✅ Good     | Proper swap functionality                  |
| `/monitor`                  | ⚠️ Advanced | Power user tool, linked from transparency  |

### Core Problems

1. **UserSwitcher Anti-Pattern**: Demo concept allowing switching between fake users - breaks auth
2. **Hardcoded Prices**: Some components still use fake rates (`42000`, `2500`)
3. **No Order Book**: Exchange without visible market depth
4. **Demo Links Exposed**: Kong, RabbitMQ, Jaeger links shown to end users
5. **No Transaction History**: Users can't see their activity
6. **Monitor Without Context**: Powerful tool, but users don't understand why

---

## Target User Journey

### Phase 1: Discovery (Public)

```
Landing Page → Proof of Observability Story → Sign Up CTA
```

**Goal**: Convince visitors that Krystaline is different - we prove our integrity through transparency.

**Page**: `/` (TransparencyDashboard) - ✅ Already good

### Phase 2: Onboarding

```
Register → Verify Email → Login → Welcome Modal → Wallet
```

**Goal**: Fast, frictionless signup with immediate value (welcome bonus).

| Step               | Current    | Target                         |
| ------------------ | ---------- | ------------------------------ |
| Register           | ✅ Works   | Keep                           |
| Email Verification | ✅ Works   | Keep                           |
| Login              | ✅ Works   | Keep                           |
| Welcome Modal      | ❌ Missing | Add first-time user experience |
| Initial Wallet     | ✅ Works   | Keep bonus, use real prices    |

### Phase 3: Core Exchange Experience

```
Portfolio → Trade → Activity → Transparency
```

#### 3a. Portfolio (My Assets)

**Route**: `/portfolio` ✅ DONE

**What it shows**:

- Total portfolio value (using REAL Binance prices)
- Asset breakdown with 24h change
- Quick actions: Deposit, Withdraw, Convert, Trade

**Design Principles**:

- Clean, Coinbase-style asset cards
- Real-time price updates
- Clear available vs locked balance

#### 3b. Trade

**Route**: `/trade` or `/trade/BTC-USDT`

**What it shows**:

- **Price Chart** (real data from Binance - can be simplified line chart)
- **Order Form** (Buy/Sell with amount, preview, confirm)
- **Order Book** (simplified - even if simulated, shows depth concept)
- **Recent Trades** (from our transparency API - real trades)
- **Your Open Orders** (if any limit orders)

**NOT included**:

- UserSwitcher (removed)
- Demo external links (removed)
- TraceViewer (moved to transparency section)

#### 3c. Activity / History

**Route**: `/activity`

**What it shows**:

- Transaction history (deposits, withdrawals, trades)
- Order history (filled, cancelled, pending)
- Filter by type, date range

**Why it matters**: Users need to see what happened with their money.

#### 3d. Transparency (Our Differentiator)

**Route**: `/transparency`

**What it shows**:

- **System Status**: Latency, uptime, error rates (from our monitoring)
- **Live Trace View**: Real traces flowing through (WebSocket stream)
- **Recent Anomalies**: Any issues detected, auto-resolved
- **Audit Trail**: Link every trade to its trace ID

**This is our killer feature**: No other exchange shows you HOW your trade was processed.

### Phase 4: Account & Settings

```
Profile → Security → API Keys → Verification
```

**Route**: `/settings` (or tabs within)

| Feature               | Priority | Notes                        |
| --------------------- | -------- | ---------------------------- |
| Profile (email, name) | P1       | Basic info                   |
| Change Password       | P1       | Security essential           |
| 2FA Setup             | P2       | Future - important for trust |
| Session Management    | P2       | See/revoke active sessions   |
| KYC Verification      | P3       | Limits unlocking             |
| API Keys              | P3       | For power users              |

---

## Proposed Navigation Structure

### Authenticated Users

```
┌─────────────────────────────────────────────────────────┐
│  [Logo] Krystaline    Portfolio  Trade  Activity        │
│                                          [User Menu ▾]  │
└─────────────────────────────────────────────────────────┘
```

**User Menu Dropdown**:

- Settings
- Transparency Dashboard
- Help
- Sign Out

### Unauthenticated Users

```
┌─────────────────────────────────────────────────────────┐
│  [Logo] Krystaline    Features  Transparency            │
│                                    [Sign In] [Register] │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Clean Up (Day 1-2)

- [ ] Remove `UserSwitcher` component entirely
- [ ] Remove demo external links from trading page
- [ ] Wire Portfolio buttons to actual routes
- [ ] Use real price service in all components (remove hardcoded rates)
- [x] Routes renamed: `/portfolio`, `/trade` ✅

### Phase 2: Core Trading (Day 3-5)

- [ ] Create proper Trade page with:
  - Simplified price chart (real Binance data)
  - Clean Buy/Sell form (no demo elements)
  - Your recent orders
  - Market trades feed
- [ ] Create Activity page (transaction + order history)
- [ ] Integrate real-time price updates in all views

### Phase 3: Transparency Story (Day 6-7)

- [ ] Create Transparency page combining:
  - System health (from monitoring)
  - Live trace stream (simplified, user-friendly)
  - Trade→Trace lookup (enter trade ID, see full journey)
- [ ] Add trace ID to order confirmations
- [ ] Add "View Trace" links in Activity history

### Phase 4: Polish (Day 8-10)

- [ ] Settings page (basic profile, password change)
- [ ] Welcome modal for first-time users
- [ ] Mobile responsiveness audit
- [ ] Error states and empty states
- [ ] Loading skeletons throughout

---

## Component Reuse Matrix

| Existing Component      | Reuse?      | Where                              |
| ----------------------- | ----------- | ---------------------------------- |
| `TransparencyDashboard` | ✅ Keep     | Landing page                       |
| `Layout`                | ✅ Keep     | All authenticated pages            |
| `TradeForm`             | ⚠️ Refactor | Remove user prop, use auth context |
| `TransferForm`          | ✅ Keep     | Transfer feature (P2)              |
| `TraceViewer`           | ⚠️ Move     | Transparency page                  |
| `UserSwitcher`          | ❌ Delete   | Was demo artifact                  |
| `PaymentForm`           | ❌ Delete   | PoC artifact                       |
| Monitor page            | ⚠️ Refactor | Transparency page (simplified)     |

---

## API Endpoints Needed

### Existing (Keep)

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/wallet/balances`
- `GET /api/trade/price-status` (new - shows Binance connection)
- `POST /api/trade/convert`
- `GET /api/public/trades`
- `GET /api/public/status`

### Need to Add

- `GET /api/orders` - User's order history (exists but needs auth fix)
- `GET /api/transactions` - User's transaction history
- `GET /api/trade/market/:pair` - Order book snapshot (can be simplified)
- `GET /api/trace/:traceId` - Lookup specific trace for transparency

---

## Success Metrics

| Metric                      | Current           | Target                     |
| --------------------------- | ----------------- | -------------------------- |
| Registration → First Trade  | Unknown           | < 3 minutes                |
| Users who view transparency | Unknown           | > 50% of traders           |
| Trade confirmation clarity  | Low               | Show exact path (trace ID) |
| Price accuracy              | ✅ Real (Binance) | Maintain                   |

---

## Out of Scope (For Now)

- Limit orders (market only is fine for MVP)
- Margin trading
- Staking/Earn
- Mobile app
- Multiple languages
- Advanced charts (TradingView)

---

## Next Steps

1. **Review this document** - Does this align with your vision?
2. **Prioritize** - What's essential for the next investor demo?
3. **Start Phase 1** - Clean up the mess first, then build properly

---

## Visual Mockup Concept

### Trade Page Layout

```
┌──────────────────────────────────────────────────────────────┐
│  BTC/USDT                                    $94,928.77 ▲2.3%│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────┐  ┌────────────────────────────┐ │
│  │                         │  │  BUY              SELL     │ │
│  │    [Price Chart]        │  ├────────────────────────────┤ │
│  │    Simplified           │  │  Amount: [________] BTC    │ │
│  │    24h line chart       │  │  ≈ $947.29                 │ │
│  │                         │  │                            │ │
│  │                         │  │  Available: 0.1000 BTC     │ │
│  └─────────────────────────┘  │                            │ │
│                               │  [ Buy BTC ]               │ │
│  ┌─────────────────────────┐  └────────────────────────────┘ │
│  │  Recent Trades          │                                 │
│  │  $94,928  0.0012  12:45 │  ┌────────────────────────────┐ │
│  │  $94,925  0.0050  12:44 │  │  Your Recent Orders        │ │
│  │  $94,930  0.0023  12:43 │  │  • Buy 0.01 BTC @ $948.23  │ │
│  └─────────────────────────┘  │    [View Trace]            │ │
│                               └────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Key Differentiation: "View Trace" Link

Every order shows its trace ID. Click it → see exactly how your order was processed through our system. **No other exchange does this.**

---

_Document created: January 16, 2026_
_Last updated: January 16, 2026_
