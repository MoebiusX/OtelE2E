// Initialize OpenTelemetry first
import "./otel";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./api/routes";
import { setupVite, serveStatic, log } from "./vite";
import { kongClient } from "./services/kong-client";
import { rabbitMQClient } from "./services/rabbitmq-client";
import { monitorRoutes, startMonitor } from "./monitor";
import { metricsMiddleware, registerMetricsEndpoint } from "./metrics/prometheus";

const app = express();

// Register Prometheus metrics endpoint FIRST (before other middleware)
registerMetricsEndpoint(app);

// Apply metrics collection middleware
app.use(metricsMiddleware);

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

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Filter out GET requests to payments and traces endpoints to reduce console noise
      if (req.method === "GET" && (path.includes("/api/payments") || path.includes("/api/traces"))) {
        return;
      }

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize external services
  console.log('[INIT] Initializing external services...');

  // Setup Kong Gateway proxy routes
  app.use('/kong', kongClient.createProxy());

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

  // Register monitor routes
  app.use('/api/monitor', monitorRoutes);

  // Start trace monitoring services (polls Jaeger for baselines/anomalies)
  startMonitor();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Create server
  const { createServer } = await import("http");
  const server = createServer(app);

  // Setup Vite in development or serve static in production
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
