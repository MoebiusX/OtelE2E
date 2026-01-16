// Initialize OpenTelemetry first
import "./otel";

// Initialize configuration and logging
import { config } from "./config";
import { createLogger } from "./lib/logger";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler, notFoundHandler, handleUnhandledRejection, handleUncaughtException } from "./middleware/error-handler";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./api/routes";
import { setupVite, serveStatic, log } from "./vite";
import { kongClient } from "./services/kong-client";
import { rabbitMQClient } from "./services/rabbitmq-client";
import { monitorRoutes, startMonitor } from "./monitor";
import { metricsMiddleware, registerMetricsEndpoint } from "./metrics/prometheus";
import { transparencyService } from "./services/transparency-service";
import authRoutes from "./auth/routes";
import walletRoutes from "./wallet/routes";
import tradeRoutes from "./trade/routes";
import publicRoutes from "./api/public-routes";

const logger = createLogger('server');
const app = express();

// Setup global error handlers for unhandled errors
handleUnhandledRejection();
handleUncaughtException();

// Register Prometheus metrics endpoint FIRST (before other middleware)
registerMetricsEndpoint(app);

// Apply metrics collection middleware
app.use(metricsMiddleware);

// Request logging with correlation IDs (early in middleware chain)
app.use(requestLogger);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS configuration for Kong Gateway requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-trace-id, x-span-id, traceparent');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

(async () => {
  // Initialize external services
  logger.info('Initializing external services...');

  // Setup Kong Gateway proxy routes with OTEL span attribute middleware
  app.use('/kong', async (req, res, next) => {
    // Mark this span as api-gateway component for proper service identification
    const { trace } = await import('@opentelemetry/api');
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute('component', 'api-gateway');
    }
    next();
  }, kongClient.createProxy());

  // Initialize RabbitMQ connection
  try {
    await rabbitMQClient.connect();
    await rabbitMQClient.startConsumer();
    console.log('[INIT] RabbitMQ connected and consumer started');
  } catch (error) {
    console.warn('[INIT] RabbitMQ initialization failed - continuing without message queue');
  }

  // Check Kong Gateway health
  const kongHealthy = await kongClient.checkHealth();
  if (kongHealthy) {
    console.log('[INIT] Kong Gateway available');
    await kongClient.configureService();
  } else {
    console.warn('[INIT] Kong Gateway not available - continuing without proxy');
  }

  // Register API routes
  registerRoutes(app);

  // Register auth routes
  app.use('/api/auth', authRoutes);

  // Register wallet routes
  app.use('/api/wallet', walletRoutes);

  // Register trade routes
  app.use('/api/trade', tradeRoutes);

  // Register monitor routes
  app.use('/api/monitor', monitorRoutes);

  // Register public transparency routes (unauthenticated)
  app.use('/api/public', publicRoutes);

  // Start trace monitoring services (polls Jaeger for baselines/anomalies)
  startMonitor();

  // Start transparency service for public metrics
  transparencyService.start();

  // 404 handler for undefined routes (before error handler)
  app.use(notFoundHandler);

  // Global error handler (MUST be last)
  app.use(errorHandler);

  // Create server
  const { createServer } = await import("http");
  const server = createServer(app);

  // Setup WebSocket server for real-time monitoring
  const { wsServer } = await import("./monitor/ws-server");
  wsServer.setup(server);

  // Setup Vite in development or serve static in production
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Setup Vite in development or serve static in production
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // Start server
  const port = config.server.port;
  const host = config.server.host;
  
  server.listen(port, host, () => {
    logger.info({
      port,
      host,
      env: config.env,
    }, `Server started successfully`);
    logger.info(`Serving on http://${host}:${port}`);
    logger.info(`WebSocket available at ws://localhost:${port}/ws/monitor`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    
    server.close(() => {
      logger.info('HTTP server closed');
    });

    await rabbitMQClient.disconnect();
    
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})();