import * as http from 'http';

import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { config } from '../config';
import { createLogger } from '../lib/logger';
import { ExternalServiceError } from '../lib/errors';

const logger = createLogger('kong');

export class KongClient {
  private kongUrl: string;
  private adminUrl: string;

  constructor() {
    this.kongUrl = config.kong.gatewayUrl;
    this.adminUrl = config.kong.adminUrl;
  }

  // Create proxy middleware for routing through Kong
  createProxy() {
    const options: any = {
      target: this.kongUrl,
      changeOrigin: true,
      pathRewrite: {
        '^/kong': '', // Remove /kong prefix when forwarding to Kong
      },
      onProxyReq: (proxyReq: http.ClientRequest, req: any, res: any) => {
        // Add OpenTelemetry trace headers
        const traceId = req.headers['x-trace-id'] as string;
        const spanId = req.headers['x-span-id'] as string;

        if (traceId) proxyReq.setHeader('x-trace-id', traceId);
        if (spanId) proxyReq.setHeader('x-parent-span-id', spanId);

        logger.debug(
          {
            method: req.method,
            path: req.path,
            traceId: traceId?.slice(0, 8),
          },
          'Proxying request to Kong Gateway',
        );
      },
      onProxyRes: (proxyRes: any, req: any, res: any) => {
        logger.debug(
          {
            method: req.method,
            path: req.path,
            statusCode: proxyRes.statusCode,
          },
          'Received response from Kong',
        );
      },
      onError: (err: any, req: any, res: any) => {
        logger.error(
          {
            err: {
              message: err.message,
              code: err.code,
            },
            method: req.method,
            path: req.path,
          },
          'Kong proxy error',
        );

        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Kong Gateway is unavailable',
        });
      },
    };

    return createProxyMiddleware(options);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.adminUrl}/status`);
      const healthy = response.ok;

      if (healthy) {
        logger.info({ adminUrl: this.adminUrl }, 'Kong Gateway is healthy');
      } else {
        logger.warn({ adminUrl: this.adminUrl, status: response.status }, 'Kong Gateway unhealthy');
      }

      return healthy;
    } catch (error) {
      logger.warn(
        {
          err: error,
          adminUrl: this.adminUrl,
        },
        'Kong Gateway not available',
      );
      return false;
    }
  }

  // Configure Kong service for our payment API
  async configureService() {
    try {
      // Create service
      const serviceConfig = {
        name: 'payment-api',
        url: 'http://host.docker.internal:5000',
      };

      let response = await fetch(`${this.adminUrl}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(serviceConfig),
      });

      if (response.status === 409) {
        logger.info('Kong service already exists');
      } else if (response.ok) {
        logger.info('Kong payment service created successfully');
      } else {
        logger.warn({ status: response.status }, 'Failed to create Kong service');
      }

      // Create route
      const routeConfig = {
        'paths[]': '/api',
        strip_path: 'false',
        preserve_host: 'false',
      };

      response = await fetch(`${this.adminUrl}/services/payment-api/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(routeConfig),
      });

      if (response.status === 409) {
        logger.info('Kong route already exists');
        return true;
      } else if (response.ok) {
        logger.info('Kong payment route created successfully');
        return true;
      } else {
        logger.warn({ status: response.status }, 'Failed to create Kong route');
        return false;
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to configure Kong service');
      throw new ExternalServiceError('Kong', error as Error);
    }
  }
}

export const kongClient = new KongClient();
