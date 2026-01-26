import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    nodePolyfills({
      // Enable polyfills for Node.js modules used by OpenTelemetry
      include: ['os', 'path', 'util', 'stream', 'buffer'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
      ? [
        await import("@replit/vite-plugin-cartographer").then((m) =>
          m.cartographer(),
        ),
      ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    // Bind to all interfaces for Docker accessibility
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      // Use Docker service name when running in container, localhost otherwise
      '/api': {
        target: process.env.DOCKER_ENV ? 'http://kx-exchange:5000' : 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/kong': {
        target: process.env.DOCKER_ENV ? 'http://kx-exchange:5000' : 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: process.env.DOCKER_ENV ? 'ws://kx-exchange:5000' : 'ws://localhost:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    // Pre-bundle OpenTelemetry packages for better ESM compatibility
    include: [
      '@opentelemetry/api',
      '@opentelemetry/sdk-trace-web',
      '@opentelemetry/sdk-trace-base',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/context-zone',
      '@opentelemetry/instrumentation',
      '@opentelemetry/instrumentation-fetch',
    ],
  },
});
