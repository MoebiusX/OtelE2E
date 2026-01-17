/**
 * Structured Logging Service
 * 
 * Provides structured JSON logging with OpenTelemetry trace context integration.
 * Uses Pino for high-performance logging.
 */

import pino, { Logger } from 'pino';
import { trace, Span } from '@opentelemetry/api';
import { config } from '../config';

// ============================================
// LOGGER CONFIGURATION
// ============================================

const pinoConfig: pino.LoggerOptions = {
  level: config.logging.level,
  
  // Format log level labels
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
    }),
  },

  // Add timestamp
  timestamp: pino.stdTimeFunctions.isoTime,

  // Pretty print in development (if enabled)
  transport: config.logging.pretty ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
      messageFormat: '[{component}] {msg}',
    },
  } : undefined,
};

// Base logger instance
const baseLogger = pino(pinoConfig);

// ============================================
// TRACE CONTEXT HELPER
// ============================================

/**
 * Extract OpenTelemetry trace context from active span
 */
function getTraceContext(): { traceId?: string; spanId?: string } {
  const span: Span | undefined = trace.getActiveSpan();
  const spanContext = span?.spanContext();
  
  if (spanContext && spanContext.traceId && spanContext.spanId) {
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }
  
  return {};
}

// ============================================
// LOGGER FACTORY
// ============================================

export interface ComponentLogger {
  trace(obj: object, msg?: string): void;
  trace(msg: string): void;
  debug(obj: object, msg?: string): void;
  debug(msg: string): void;
  info(obj: object, msg?: string): void;
  info(msg: string): void;
  warn(obj: object, msg?: string): void;
  warn(msg: string): void;
  error(obj: object, msg?: string): void;
  error(msg: string): void;
  fatal(obj: object, msg?: string): void;
  fatal(msg: string): void;
  child: (bindings: object) => ComponentLogger;
}

/**
 * Create a logger for a specific component with automatic trace context
 * 
 * @param component - Component name (e.g., 'server', 'rabbitmq', 'kong')
 * @param defaultBindings - Additional default bindings to include in all logs
 * 
 * @example
 * const logger = createLogger('payment-service');
 * logger.info('Processing payment', { amount: 100 });
 * 
 * @example
 * const logger = createLogger('rabbitmq', { queue: 'orders' });
 * logger.debug('Message published');
 */
export function createLogger(
  component: string,
  defaultBindings: object = {}
): ComponentLogger {
  const componentLogger = baseLogger.child({
    component,
    ...defaultBindings,
  });

  // Wrapper that automatically injects trace context
  const wrapLogMethod = (method: keyof Logger) => {
    return (...args: any[]) => {
      const traceContext = getTraceContext();
      
      // If first arg is an object, merge trace context
      if (typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
        args[0] = { ...args[0], ...traceContext };
      } else if (typeof args[0] === 'string') {
        // If first arg is a string, prepend trace context object
        args.unshift(traceContext);
      }
      
      return (componentLogger[method] as any)(...args);
    };
  };

  return {
    trace: wrapLogMethod('trace'),
    debug: wrapLogMethod('debug'),
    info: wrapLogMethod('info'),
    warn: wrapLogMethod('warn'),
    error: wrapLogMethod('error'),
    fatal: wrapLogMethod('fatal'),
    child: (bindings: object) => createLogger(component, { ...defaultBindings, ...bindings }),
  } as ComponentLogger;
}

// ============================================
// BASE LOGGER EXPORT
// ============================================

/**
 * Base logger instance (without component context)
 * Use createLogger() instead for component-specific logging
 */
export const logger = baseLogger;

/**
 * Create a logger with explicit trace context (useful for async operations)
 * 
 * @param component - Component name
 * @param traceId - Explicit trace ID
 * @param spanId - Explicit span ID
 */
export function createLoggerWithContext(
  component: string,
  traceId: string,
  spanId: string
): Logger {
  return baseLogger.child({
    component,
    traceId,
    spanId,
  });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Log an error with full stack trace and context
 */
export function logError(
  logger: ComponentLogger,
  error: Error,
  context?: object
): void {
  logger.error({
    err: {
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
    ...context,
  }, error.message);
}

/**
 * Log performance metrics
 */
export function logPerformance(
  logger: ComponentLogger,
  operation: string,
  durationMs: number,
  metadata?: object
): void {
  logger.info({
    operation,
    durationMs,
    ...metadata,
  }, `${operation} completed in ${durationMs}ms`);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  baseLogger.info('SIGTERM received, flushing logs...');
  baseLogger.flush();
});
