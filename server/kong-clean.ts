import { Request, Response, NextFunction } from 'express';
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
    const paymentService: KongService = {
      id: 'payment-service',
      name: 'payment-api',
      url: 'http://localhost:5000',
      protocol: 'http',
      host: 'localhost',
      port: 5000,
      path: '/api'
    };

    this.services.set('payment-service', paymentService);
  }

  private setupDefaultRoutes() {
    const paymentRoute: KongRoute = {
      id: 'payment-route',
      name: 'payment-processing',
      methods: ['POST'],
      paths: ['/api/payments'],
      service: 'payment-service',
      plugins: ['rate-limiting', 'cors', 'tracing']
    };

    this.routes.set('payment-route', paymentRoute);
  }

  private setupDefaultPlugins() {
    const plugins: KongPlugin[] = [
      {
        name: 'rate-limiting',
        config: {
          minute: 100,
          hour: 1000,
          policy: 'local',
          fault_tolerant: true,
          hide_client_headers: false
        },
        enabled: true
      },
      {
        name: 'cors',
        config: {
          origins: ['*'],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          headers: ['Accept', 'Content-Type', 'Authorization', 'X-Trace-Id', 'X-Span-Id'],
          exposed_headers: ['X-Kong-Upstream-Latency', 'X-Kong-Proxy-Latency'],
          credentials: true,
          max_age: 3600,
          preflight_continue: false
        },
        enabled: true
      },
      {
        name: 'opentelemetry',
        config: {
          endpoint: 'http://jaeger:14268/api/traces',
          service_name: 'kong-gateway',
          resource_attributes: {
            'service.name': 'kong-gateway',
            'service.version': '3.4.2'
          }
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
    return async (req: Request, res: Response, next: NextFunction) => {
      // Only intercept payment POST requests for demonstration
      if (!req.path.startsWith('/api/payments') || req.method !== 'POST') {
        return next();
      }

      // Extract trace context first to determine behavior
      let traceId = req.headers['x-trace-id'] as string;
      let spanId = req.headers['x-span-id'] as string;
      const traceparent = req.headers['traceparent'] as string;
      
      const hasIncomingTrace = !!(traceId && spanId) || !!traceparent;
      
      let span: any = null;
      const startTime = Date.now();
      
      // Kong Gateway only creates span when injecting context (no incoming trace)
      if (!hasIncomingTrace) {
        // Context injection scenario - Kong creates ROOT span and generates trace context
        const { tracer } = await import('./tracing');
        span = tracer.startSpan('Kong Gateway Context Injection', {
          kind: 1, // SERVER span kind - this is the entry point
          attributes: {
            'service.name': 'kong-gateway',
            'kong.gateway': true,
            'kong.context_injection': true,
            'http.method': req.method,
            'http.route': req.path,
            'http.url': req.url,
            'trace.mode': 'kong-generated'
          }
        });
        
        traceId = this.generateTraceId();
        spanId = this.generateSpanId();
        req.headers['x-trace-id'] = traceId;
        req.headers['x-span-id'] = spanId;
        
        // Add OpenTelemetry traceparent header for proper context propagation
        const traceFlags = '01';
        req.headers['traceparent'] = `00-${traceId}-${spanId}-${traceFlags}`;
        
        span.setAttributes({
          'trace.generated_id': traceId,
          'span.generated_id': spanId
        });
      }
      // If trace headers exist, Kong just passes them through (no Kong span created)

      // Kong Gateway processing with authentic timing
      
      // Add Kong headers for demonstration
      res.set({
        'X-Kong-Upstream-Latency': '0',
        'X-Kong-Proxy-Latency': '3',
        'X-Kong-Request-Id': uuidv4(),
        'Via': '1.1 kong/3.4.2'
      });

      // Complete Kong Gateway span after response (only if span was created)
      if (span) {
        res.on('finish', () => {
          const duration = Date.now() - startTime;
          span.setAttributes({
            'http.status_code': res.statusCode,
            'kong.latency_ms': duration,
            'kong.upstream_latency': 0,
            'kong.proxy_latency': 3
          });
          span.setStatus({ code: res.statusCode < 400 ? 1 : 2 });
          span.end();
        });
      }

      next();
    };
  }

  private matchRoute(req: Request): KongRoute | null {
    for (const route of Array.from(this.routes.values())) {
      if (route.methods.includes(req.method) && 
          route.paths.some((path: string) => req.path.startsWith(path))) {
        return route;
      }
    }
    return null;
  }

  private transformPath(originalPath: string, route: KongRoute): string {
    // Simple path transformation for demonstration
    return originalPath;
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
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private generateSpanId(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private executePlugin(plugin: KongPlugin, req: Request, res: Response) {
    // Plugin execution logic - OpenTelemetry auto-instruments this
    switch (plugin.name) {
      case 'rate-limiting':
        // Rate limiting logic
        break;
      case 'cors':
        // CORS headers already set
        break;
      case 'opentelemetry':
        // OpenTelemetry instrumentation
        break;
    }
  }

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