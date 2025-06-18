import express, { type Request, type Response, type Router } from 'express';
import { kongGateway } from './kong-clean';
import { createSpan } from './tracing';
import { v4 as uuidv4 } from 'uuid';

export function createKongRouter(): Router {
  const router = express.Router();

  // Kong Gateway middleware for all Kong routes
  router.use((req: Request, res: Response, next) => {
    const { span, finish } = createSpan('kong.gateway.route');
    const startTime = Date.now();

    // Add Kong headers
    res.set({
      'X-Kong-Upstream-Latency': '0',
      'X-Kong-Proxy-Latency': '1',
      'X-Kong-Request-Id': uuidv4(),
      'Via': '1.1 kong/3.4.2'
    });

    // Apply Kong plugins (rate limiting, CORS, etc.)
    const plugins = kongGateway.getPlugins();
    plugins.forEach(plugin => {
      if (plugin.enabled) {
        switch (plugin.name) {
          case 'cors':
            res.set({
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, traceparent, tracestate'
            });
            break;
          case 'rate-limiting':
            res.set({
              'X-RateLimit-Limit-Minute': '100',
              'X-RateLimit-Remaining-Minute': '99'
            });
            break;
        }
      }
    });

    // Intercept response to add Kong metrics
    const originalSend = res.send;
    res.send = function(body) {
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      res.set('X-Kong-Proxy-Latency', latency.toString());
      
      span.setAttributes({
        'http.status_code': res.statusCode,
        'kong.latency.proxy': latency,
        'kong.latency.request': latency,
        'kong.route.matched': true
      });

      finish(res.statusCode >= 400 ? 'error' : 'success');
      return originalSend.call(this, body);
    };

    next();
  });

  // Kong Payments Route - proxy to /api/payments
  router.all('/payments*', (req: Request, res: Response, next) => {
    // Transform Kong route to API route - handle both exact match and wildcard
    const newUrl = req.url.replace(/^\/payments/, '/api/payments');
    const newOriginalUrl = req.originalUrl.replace(/\/kong\/payments/, '/api/payments');
    
    req.url = newUrl;
    req.originalUrl = newOriginalUrl;
    
    // Forward to next middleware (which will be the API routes)
    next();
  });

  // Kong Traces Route - proxy to /api/traces
  router.all('/traces*', (req: Request, res: Response, next) => {
    // Transform Kong route to API route
    req.url = req.url.replace('/kong/traces', '/api/traces');
    req.originalUrl = req.originalUrl.replace('/kong/traces', '/api/traces');
    
    next();
  });



  // Kong Admin API Routes
  router.get('/admin/services', (req: Request, res: Response) => {
    const services = kongGateway.getServices();
    res.json({
      data: services,
      total: services.length
    });
  });

  router.get('/admin/routes', (req: Request, res: Response) => {
    const routes = kongGateway.getRoutes();
    res.json({
      data: routes,
      total: routes.length
    });
  });

  router.get('/admin/plugins', (req: Request, res: Response) => {
    const plugins = kongGateway.getPlugins();
    res.json({
      data: plugins,
      total: plugins.length
    });
  });

  // Kong Status Route
  router.get('/status', (req: Request, res: Response) => {
    res.json({
      database: { reachable: true },
      server: { 
        connections_accepted: 42, 
        connections_active: 1, 
        connections_handled: 42, 
        connections_reading: 0, 
        connections_waiting: 0, 
        connections_writing: 1, 
        total_requests: 42 
      },
      memory: { 
        workers_lua_vms: [{ 
          http_allocated_gc: "0.02 MiB", 
          pid: 1 
        }], 
        lua_shared_dicts: { 
          kong: { 
            allocated_slabs: "0.04 MiB", 
            capacity: "5.00 MiB" 
          } 
        } 
      }
    });
  });

  // Handle Kong admin and status routes that don't need proxying

  return router;
}