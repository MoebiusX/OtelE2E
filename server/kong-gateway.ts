#!/usr/bin/env tsx
// Kong Gateway - Separate Process
// Runs on port 3001 and proxies to backend on port 5000

import express, { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const KONG_PORT = 3001;
const BACKEND_PORT = 5000;

// Middleware to parse JSON bodies before proxying
app.use(express.json());

// Kong Gateway Interceptor - Context Injection
app.use('/api/payments', (req: Request, res: Response, next) => {
  if (req.method !== 'POST') {
    return next();
  }

  console.log(`[Kong Gateway] Intercepting ${req.method} ${req.path}`);

  // Check if client provided trace headers
  const clientTraceId = req.headers['x-trace-id'] as string;
  const clientSpanId = req.headers['x-span-id'] as string;

  if (clientTraceId && clientSpanId) {
    // Client provided context - convert to W3C traceparent
    const traceparent = `00-${clientTraceId}-${clientSpanId}-01`;
    req.headers['traceparent'] = traceparent;
    console.log(`[Kong Gateway] Preserving client trace: ${clientTraceId}`);
  } else {
    // No client context - Kong injects new trace
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    const traceparent = `00-${traceId}-${spanId}-01`;
    
    req.headers['traceparent'] = traceparent;
    console.log(`[Kong Gateway] Injecting new trace: ${traceId}`);
  }

  next();
});

// Proxy all requests to backend
const proxy = createProxyMiddleware({
  target: `http://localhost:${BACKEND_PORT}`,
  changeOrigin: true
});

app.use('/', proxy);

function generateTraceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function generateSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

app.listen(KONG_PORT, () => {
  console.log(`🦍 Kong Gateway running on port ${KONG_PORT}`);
  console.log(`   Proxying to backend on port ${BACKEND_PORT}`);
  console.log(`   Context injection enabled for /api/payments`);
});