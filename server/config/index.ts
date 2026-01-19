/**
 * Configuration Management
 * 
 * Centralized, type-safe configuration with validation.
 * All environment variables are loaded and validated here.
 */

import { z } from 'zod';

// ============================================
// CONFIGURATION SCHEMA
// ============================================

const configSchema = z.object({
  env: z.enum(['development', 'production', 'test']).default('development'),
  
  server: z.object({
    port: z.number().int().positive().default(5000),
    host: z.string().default('0.0.0.0'),
    jwtSecret: z.string().default('dev-secret-change-in-production'),
  }),

  database: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(5433),
    name: z.string().default('crypto_exchange'),
    user: z.string().default('exchange'),
    password: z.string().default('exchange123'),
    maxConnections: z.number().int().positive().default(20),
    idleTimeoutMs: z.number().int().positive().default(30000),
    connectionTimeoutMs: z.number().int().positive().default(2000),
  }),

  rabbitmq: z.object({
    url: z.string().default('amqp://admin:admin123@localhost:5672'),
    ordersQueue: z.string().default('orders'),
    responseQueue: z.string().default('order_response'),
    // Legacy queue names for backward compatibility
    legacyQueue: z.string().default('payments'),
    legacyResponseQueue: z.string().default('payment_response'),
  }),

  kong: z.object({
    gatewayUrl: z.string().default('http://localhost:8000'),
    adminUrl: z.string().default('http://localhost:8001'),
  }),

  observability: z.object({
    jaegerUrl: z.string().default('http://localhost:16686'),
    prometheusUrl: z.string().default('http://localhost:9090'),
    otelCollectorUrl: z.string().optional(),
  }),

  ai: z.object({
    ollamaUrl: z.string().default('http://localhost:11434'),
    model: z.string().default('llama3.2:1b'),
  }).optional(),

  smtp: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(1025),
    secure: z.boolean().default(false),
    user: z.string().optional(),
    password: z.string().optional(),
  }).optional(),

  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    pretty: z.boolean().default(false),
  }),
});

// ============================================
// CONFIGURATION LOADER
// ============================================

function loadConfig() {
  const rawConfig = {
    env: process.env.NODE_ENV || 'development',
    
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
      host: process.env.HOST || '0.0.0.0',
      jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    },

    database: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5433,
      name: process.env.DB_NAME || 'crypto_exchange',
      user: process.env.DB_USER || 'exchange',
      password: process.env.DB_PASSWORD || 'exchange123',
      maxConnections: process.env.DB_MAX_CONNECTIONS 
        ? parseInt(process.env.DB_MAX_CONNECTIONS, 10) 
        : 20,
      idleTimeoutMs: process.env.DB_IDLE_TIMEOUT_MS
        ? parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10)
        : 30000,
      connectionTimeoutMs: process.env.DB_CONNECTION_TIMEOUT_MS
        ? parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10)
        : 2000,
    },

    rabbitmq: {
      url: process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672',
      ordersQueue: process.env.RABBITMQ_ORDERS_QUEUE || 'orders',
      responseQueue: process.env.RABBITMQ_RESPONSE_QUEUE || 'order_response',
      legacyQueue: process.env.RABBITMQ_LEGACY_QUEUE || 'payments',
      legacyResponseQueue: process.env.RABBITMQ_LEGACY_RESPONSE_QUEUE || 'payment_response',
    },

    kong: {
      gatewayUrl: process.env.KONG_GATEWAY_URL || 'http://localhost:8000',
      adminUrl: process.env.KONG_ADMIN_URL || 'http://localhost:8001',
    },

    observability: {
      jaegerUrl: process.env.JAEGER_URL || 'http://localhost:16686',
      prometheusUrl: process.env.PROMETHEUS_URL || 'http://localhost:9090',
      otelCollectorUrl: process.env.OTEL_COLLECTOR_URL,
    },

    ai: process.env.OLLAMA_URL ? {
      ollamaUrl: process.env.OLLAMA_URL,
      model: process.env.OLLAMA_MODEL || 'llama3.2:1b',
    } : undefined,

    smtp: process.env.SMTP_HOST ? {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 1025,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
    } : undefined,

    logging: {
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      pretty: process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV === 'development',
    },
  };

  try {
    const validatedConfig = configSchema.parse(rawConfig);
    
    // Log successful configuration load (using console since logger isn't ready yet)
    console.log('[CONFIG] Configuration loaded and validated successfully');
    console.log(`[CONFIG] Environment: ${validatedConfig.env}`);
    console.log(`[CONFIG] Server: ${validatedConfig.server.host}:${validatedConfig.server.port}`);
    
    return validatedConfig;
  } catch (error) {
    console.error('[CONFIG] ❌ Configuration validation failed:');
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error(error);
    }
    console.error('[CONFIG] Please check your environment variables and try again.');
    process.exit(1);
  }
}

// ============================================
// EXPORTS
// ============================================

export const config = loadConfig();
export type Config = z.infer<typeof configSchema>;

// Export a function to check if config is loaded (useful for tests)
export function isConfigLoaded(): boolean {
  return config !== undefined;
}
