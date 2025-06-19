import { Request, Response, NextFunction } from 'express';

// Kong Gateway context injection - runs before OpenTelemetry
export function kongContextMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only process payment POST requests
  if (!req.path.startsWith('/api/payments') || req.method !== 'POST') {
    return next();
  }

  console.log(`[Kong] Intercepting ${req.method} ${req.path}`);

  // Check if client already provided trace headers
  const clientTraceId = req.headers['x-trace-id'] as string;
  const clientSpanId = req.headers['x-span-id'] as string;

  if (clientTraceId && clientSpanId) {
    // Client provided trace context - convert to W3C traceparent format
    const traceparent = `00-${clientTraceId}-${clientSpanId}-01`;
    req.headers['traceparent'] = traceparent;
    console.log(`[Kong] Converting client headers to traceparent: ${traceparent}`);
  } else {
    // No client trace context - Kong generates new trace
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    const traceparent = `00-${traceId}-${spanId}-01`;
    
    req.headers['traceparent'] = traceparent;
    console.log(`[Kong] Context injection - generated trace: ${traceId}`);
  }

  next();
}

function generateTraceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function generateSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}