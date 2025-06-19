// Initialize OpenTelemetry first
import "./otel";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
// Removed all simulated components - using only authentic OpenTelemetry

const app = express();

// Kong Gateway MUST run first, before any other middleware
// This allows Kong to inject context before OpenTelemetry HTTP instrumentation
(async () => {
  const { kongGateway } = await import('./kong-clean');
  app.use(kongGateway.gatewayMiddleware());
})();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
  // Initialize Solace queue processors for payment processing
  const { setupPaymentProcessor } = await import('./queue-clean');
  await setupPaymentProcessor(queueSimulator);

  // Kong Gateway middleware - intercepts ALL requests to demonstrate tracing
  const { kongGateway } = await import('./kong-clean');
  app.use(kongGateway.gatewayMiddleware());

  // Register API routes
  registerRoutes(app);

  // Kong Gateway router for /kong routes - after API routes but before Vite
  app.use('/kong', createKongRouter());

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
