import { Request, Response, NextFunction } from 'express';
import { createSpan } from './tracing';
import { v4 as uuidv4 } from 'uuid';

interface KongRoute {
  id: string;
  name: string;
  methods: string[];
  paths: string[];
  service: string;
  plugins: string[];
}

interface KongService {
  id: string;
  name: string;
  url: string;
  protocol: string;
  host: string;
  port: number;
  path?: string;
}

interface KongPlugin {
  name: string;
  config: Record<string, any>;
  enabled: boolean;
}

export class KongGateway {
  private routes: Map<string, KongRoute> = new Map();
  private services: Map<string, KongService> = new Map();
  private plugins: Map<string, KongPlugin> = new Map();

  constructor() {
    this.setupDefaultServices();
    this.setupDefaultRoutes();
    this.setupDefaultPlugins();
  }

  private setupDefaultServices() {
    // Payment API Service
    const paymentService: KongService = {
      id: 'payment-api-service',
      name: 'payment-api',
      url: 'http://localhost:5000',
      protocol: 'http',
      host: 'localhost',
      port: 5000,
      path: '/api'
    };

    this.services.set(paymentService.id, paymentService);
  }

  private setupDefaultRoutes() {
    // Payment Routes
    const paymentRoutes: KongRoute[] = [
      {
        id: 'payment-route',
        name: 'payment-operations',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        paths: ['/payments', '/payments/*'],
        service: 'payment-api-service',
        plugins: ['rate-limiting', 'opentelemetry', 'cors']
      },
      {
        id: 'trace-route',
        name: 'trace-operations',
        methods: ['GET'],
        paths: ['/traces', '/traces/*'],
        service: 'payment-api-service',
        plugins: ['opentelemetry', 'cors']
      },
      {
        id: 'metrics-route',
        name: 'metrics-operations',
        methods: ['GET'],
        paths: ['/metrics'],
        service: 'payment-api-service',
        plugins: ['opentelemetry', 'cors']
      }
    ];

    paymentRoutes.forEach(route => {
      this.routes.set(route.id, route);
    });
  }

  private setupDefaultPlugins() {
    const plugins: KongPlugin[] = [
      {
        name: 'rate-limiting',
        config: {
          minute: 100,
          hour: 1000,
          policy: 'local'
        },
        enabled: true
      },
      {
        name: 'opentelemetry',
        config: {
          endpoint: 'http://localhost:3200/v1/traces',
          service_name: 'kong-gateway',
          resource_attributes: {
            'service.name': 'kong-gateway',
            'service.version': '3.4.2'
          }
        },
        enabled: true
      },
      {
        name: 'cors',
        config: {
          origins: ['*'],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          headers: ['Accept', 'Content-Type', 'Authorization', 'traceparent', 'tracestate'],
          exposed_headers: ['X-Kong-Upstream-Latency', 'X-Kong-Proxy-Latency'],
          credentials: false,
          max_age: 3600
        },
        enabled: true
      },
      {
        name: 'prometheus',
        config: {
          per_consumer: false,
          status_code_metrics: true,
          latency_metrics: true,
          bandwidth_metrics: true,
          upstream_health_metrics: true
        },
        enabled: true
      }
    ];

    plugins.forEach(plugin => {
      this.plugins.set(plugin.name, plugin);
    });
  }

  // Kong Gateway Middleware
  public gatewayMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const { span, finish } = createSpan('kong.gateway.request');
      
      const startTime = Date.now();
      const route = this.matchRoute(req);
      
      if (!route) {
        finish('error');
        return res.status(404).json({ 
          message: 'Route not found',
          request_id: uuidv4()
        });
      }

      // Apply plugins
      this.applyPlugins(route, req, res);

      // Add Kong headers
      res.set({
        'X-Kong-Upstream-Latency': '0',
        'X-Kong-Proxy-Latency': '1',
        'X-Kong-Request-Id': uuidv4(),
        'Via': '1.1 kong/3.4.2'
      });

      // Transform path for upstream service
      const originalUrl = req.url;
      req.url = this.transformPath(req.url, route);

      // Add tracing context
      span.setAttributes({
        'kong.route.id': route.id,
        'kong.route.name': route.name,
        'kong.service.name': route.service,
        'http.method': req.method,
        'http.url': originalUrl,
        'http.upstream.url': req.url
      });

      // Intercept response to add metrics
      const originalSend = res.send;
      res.send = function(body) {
        const endTime = Date.now();
        const latency = endTime - startTime;
        
        res.set('X-Kong-Proxy-Latency', latency.toString());
        
        span.setAttributes({
          'http.status_code': res.statusCode,
          'kong.latency.proxy': latency,
          'kong.latency.request': latency
        });

        finish(res.statusCode >= 400 ? 'error' : 'success');
        return originalSend.call(this, body);
      };

      next();
    };
  }

  private matchRoute(req: Request): KongRoute | null {
    const routes = Array.from(this.routes.values());
    for (const route of routes) {
      if (route.methods.includes(req.method)) {
        for (const path of route.paths) {
          const pattern = path.replace('*', '.*');
          const regex = new RegExp(`^${pattern}$`);
          if (regex.test(req.path)) {
            return route;
          }
        }
      }
    }
    return null;
  }

  private transformPath(originalPath: string, route: KongRoute): string {
    // Remove /kong prefix and route to appropriate API endpoint
    return originalPath.replace('/kong', '/api');
  }

  private applyPlugins(route: KongRoute, req: Request, res: Response) {
    route.plugins.forEach(pluginName => {
      const plugin = this.plugins.get(pluginName);
      if (plugin && plugin.enabled) {
        this.executePlugin(plugin, req, res);
      }
    });
  }

  private generateTraceId(): string {
    return Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private generateSpanId(): string {
    return Array.from({length: 16}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private executePlugin(plugin: KongPlugin, req: Request, res: Response) {
    switch (plugin.name) {
      case 'rate-limiting':
        // Simple rate limiting implementation
        const clientId = req.ip || 'unknown';
        // In production, you'd use Redis or similar for distributed rate limiting
        break;
        
      case 'opentelemetry':
        // Inject OpenTelemetry context if not present
        if (!req.headers['traceparent']) {
          const traceId = this.generateTraceId();
          const spanId = this.generateSpanId();
          const traceparent = `00-${traceId}-${spanId}-01`;
          
          // Inject tracing headers into request
          req.headers['traceparent'] = traceparent;
          req.headers['tracestate'] = `kong=gateway-${spanId}`;
          
          // Add response headers for visibility
          res.setHeader('X-Kong-Trace-Injected', 'true');
          res.setHeader('X-Kong-Trace-ID', traceId);
          res.setHeader('X-Kong-Span-ID', spanId);
        } else {
          // Pass through existing trace context
          const existingTrace = req.headers['traceparent'] as string;
          const traceId = existingTrace.split('-')[1];
          res.setHeader('X-Kong-Trace-Injected', 'false');
          res.setHeader('X-Kong-Trace-ID', traceId);
        }
        break;
        
      case 'cors':
        const corsConfig = plugin.config;
        res.set({
          'Access-Control-Allow-Origin': corsConfig.origins[0],
          'Access-Control-Allow-Methods': corsConfig.methods.join(', '),
          'Access-Control-Allow-Headers': corsConfig.headers.join(', '),
          'Access-Control-Max-Age': corsConfig.max_age.toString()
        });
        break;
        
      case 'prometheus':
        // Metrics are handled by our existing metrics system
        break;
    }
  }

  // Kong Admin API Methods
  public getServices(): KongService[] {
    return Array.from(this.services.values());
  }

  public getRoutes(): KongRoute[] {
    return Array.from(this.routes.values());
  }

  public getPlugins(): KongPlugin[] {
    return Array.from(this.plugins.values());
  }

  public addService(service: Omit<KongService, 'id'>): KongService {
    const newService: KongService = {
      id: uuidv4(),
      ...service
    };
    this.services.set(newService.id, newService);
    return newService;
  }

  public addRoute(route: Omit<KongRoute, 'id'>): KongRoute {
    const newRoute: KongRoute = {
      id: uuidv4(),
      ...route
    };
    this.routes.set(newRoute.id, newRoute);
    return newRoute;
  }
}

export const kongGateway = new KongGateway();