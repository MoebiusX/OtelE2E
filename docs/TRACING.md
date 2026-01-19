# OpenTelemetry Tracing Configuration

> **⚠️ IMPORTANT**: This document explains the distributed tracing setup. **Read this when renaming services** to avoid breaking trace correlation in Jaeger.

## Service Naming Convention

KrystalineX uses a consistent `kx-*` naming convention for all services:

| Service         | OTEL Service Name | Tracer Name   | Description                           |
| --------------- | ----------------- | ------------- | ------------------------------------- |
| Web Client      | `kx-wallet`       | `kx-wallet`   | Browser-based React frontend          |
| API Gateway     | `api-gateway`     | (Kong plugin) | Kong gateway for routing              |
| Exchange Server | `kx-exchange`     | `kx-exchange` | Main Express.js API server            |
| Order Matcher   | `kx-matcher`      | `kx-matcher`  | RabbitMQ consumer for order execution |

## How Trace Context Flows

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  kx-wallet  │────▶│ api-gateway │────▶│ kx-exchange │────▶│ kx-matcher  │
│  (browser)  │     │   (Kong)    │     │  (server)   │     │ (processor) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     HTTP              HTTP               RabbitMQ           RabbitMQ
  traceparent        traceparent         propagation         propagation
```

### 1. Browser → Server (HTTP)

The browser client injects W3C trace context headers (`traceparent`, `tracestate`) via the OpenTelemetry Fetch instrumentation.

### 2. Kong Gateway

Kong's OpenTelemetry plugin extracts and propagates trace context, adding gateway-specific spans.

### 3. Server → Order Matcher (RabbitMQ)

The server publishes orders to RabbitMQ with trace context in message headers:

- `traceparent`: Current span context for parent-child relationship
- `x-parent-traceparent`: Original POST span context for response routing

### 4. Order Matcher Response

The matcher creates child spans using the extracted trace context, ensuring spans appear in the same trace tree.

## Configuration Files

### Browser OTEL (`client/src/lib/otel.ts`)

```typescript
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: 'kx-wallet', // ← Service name here
  // ...
});
```

### Server OTEL (`server/otel.ts`)

```typescript
const sdk = new NodeSDK({
  serviceName: 'kx-exchange', // ← Service name here
  // ...
});
```

### Order Matcher OTEL (`payment-processor/index.ts`)

```typescript
const sdk = new NodeSDK({
  serviceName: 'kx-matcher', // ← Service name here
  // ...
});
```

### Tracer Instances

When creating tracers, **always use the same name as the service**:

```typescript
// ✅ Correct - matches service name
const tracer = trace.getTracer('kx-exchange');

// ❌ Wrong - different from service name
const tracer = trace.getTracer('rabbitmq-client');
```

## UI Service Mappings

These files contain mappings for display names, icons, and colors based on service names:

1. **`client/src/components/trade-trace-timeline.tsx`**
   - `SERVICE_ICONS` - Icon for each service in trace timeline
   - `SERVICE_COLORS` - Background color for each service

2. **`client/src/pages/transparency.tsx`**
   - `SERVICE_DISPLAY_NAMES` - Human-readable names and descriptions

3. **`scripts/e2e-test.js`**
   - Service names for querying Jaeger traces

## Renaming Services Checklist

When renaming a service (e.g., from `exchange-api` to `kx-exchange`):

### Step 1: Update OTEL Configuration

- [ ] Update `serviceName` in the SDK config
- [ ] Update all `trace.getTracer('service-name')` calls

### Step 2: Update UI Mappings

- [ ] `trade-trace-timeline.tsx` - SERVICE_ICONS and SERVICE_COLORS
- [ ] `transparency.tsx` - SERVICE_DISPLAY_NAMES

### Step 3: Update Scripts

- [ ] `scripts/e2e-test.js` - Jaeger query service names

### Step 4: Keep Legacy Fallbacks

Always add legacy fallbacks in UI mappings to handle traces captured before the rename:

```typescript
const SERVICE_ICONS: Record<string, any> = {
  'kx-exchange': Activity, // New name
  'exchange-api': Activity, // Legacy fallback
  // ...
};
```

### Step 5: Update Documentation

- [ ] `README.md` - Manual testing instructions
- [ ] This file (`docs/TRACING.md`) - Service naming table

## Troubleshooting

### Spans appear disconnected in Jaeger

**Symptom**: Service spans appear as separate traces instead of a connected tree.

**Cause**: Tracer name doesn't match service name, or trace context isn't being propagated.

**Fix**:

1. Verify `trace.getTracer('name')` matches the `serviceName` in OTEL config
2. Check that RabbitMQ messages include `traceparent` header
3. Verify payment-processor is running and consuming messages

### Order Matcher spans not appearing

**Symptom**: `kx-matcher` spans don't appear in the trade trace.

**Cause**: RabbitMQ not connected, causing fallback to local execution.

**Fix**:

1. Check if `payment-processor/index.ts` is running: `npx tsx payment-processor/index.ts`
2. Verify RabbitMQ is accessible at `amqp://admin:admin123@localhost:5672`
3. Check order-service logs for "local-fallback" execution path

### Kong Gateway spans missing

**Symptom**: `api-gateway` spans don't appear between client and server.

**Cause**: Kong OpenTelemetry plugin not configured.

**Fix**:

1. Run `node scripts/enable-kong-otel.js`
2. Verify plugin is enabled: `curl http://localhost:8001/plugins`

## Ports Reference

| Service                  | Port  | Purpose                                |
| ------------------------ | ----- | -------------------------------------- |
| Frontend (Vite)          | 5173  | React dev server                       |
| Backend API              | 3000  | Express.js API (internal)              |
| Kong Gateway             | 8000  | Public API endpoint                    |
| Kong Admin               | 8001  | Kong configuration API                 |
| Jaeger UI                | 16686 | Trace visualization                    |
| OTEL Collector (Server)  | 4318  | Server trace ingestion                 |
| OTEL Collector (Browser) | 4319  | Browser trace ingestion (CORS enabled) |
| RabbitMQ                 | 5672  | Message queue                          |
| RabbitMQ Management      | 15672 | RabbitMQ admin UI                      |
| PostgreSQL               | 5432  | Database                               |
| Prometheus               | 9090  | Metrics                                |

---

_Last updated: January 17, 2026 - Fixed kx-_ service naming after third rename incident\*
