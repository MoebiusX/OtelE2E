import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import * as http from 'http';

export class KongClient {
  private kongUrl: string;
  private adminUrl: string;

  constructor() {
    this.kongUrl = process.env.KONG_GATEWAY_URL || 'http://localhost:8000';
    this.adminUrl = process.env.KONG_ADMIN_URL || 'http://localhost:8001';
  }

  // Create proxy middleware for routing through Kong
  createProxy() {
    const options: Options = {
      target: this.kongUrl,
      changeOrigin: true,
      pathRewrite: {
        '^/kong': '', // Remove /kong prefix when forwarding to Kong
      },
      onProxyReq: (proxyReq: http.ClientRequest, req: any) => {
        // Add OpenTelemetry trace headers
        const traceId = req.headers['x-trace-id'] as string;
        const spanId = req.headers['x-span-id'] as string;
        
        if (traceId) proxyReq.setHeader('x-trace-id', traceId);
        if (spanId) proxyReq.setHeader('x-parent-span-id', spanId);
        
        console.log(`[KONG] Proxying ${req.method} ${req.path} to Kong Gateway`);
      },
      onProxyRes: (proxyRes: any, req: any) => {
        console.log(`[KONG] Response from Kong: ${proxyRes.statusCode}`);
      },
      onError: (err: any, req: any, res: any) => {
        console.error(`[KONG] Proxy error:`, err.message);
        if (!res.headersSent) {
          (res as Response).status(503).json({
            error: 'Kong Gateway unavailable',
            message: 'Please ensure KONG_GATEWAY_URL is configured and Kong is running'
          });
        }
      }
    } as Options;
    
    return createProxyMiddleware(options);
  }

  // Check Kong Gateway health
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.adminUrl}/status`);
      return response.ok;
    } catch (error) {
      console.warn(`[KONG] Gateway not available at ${this.adminUrl}`);
      return false;
    }
  }

  // Configure Kong service for our payment API
  async configureService() {
    try {
      // Create service
      const serviceConfig = {
        name: 'payment-api',
        url: 'http://host.docker.internal:5000'
      };

      let response = await fetch(`${this.adminUrl}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(serviceConfig)
      });

      if (response.status === 409) {
        console.log('[KONG] Service already exists');
      } else if (response.ok) {
        console.log('[KONG] Payment service created successfully');
      }

      // Create route
      const routeConfig = {
        'paths[]': '/api',
        strip_path: 'false',
        preserve_host: 'false'
      };

      response = await fetch(`${this.adminUrl}/services/payment-api/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(routeConfig)
      });

      if (response.status === 409) {
        console.log('[KONG] Route already exists');
        return true;
      } else if (response.ok) {
        console.log('[KONG] Payment route created successfully');
        return true;
      }

    } catch (error) {
      console.warn('[KONG] Service configuration failed:', (error as Error).message);
    }
    return false;
  }
}

export const kongClient = new KongClient();