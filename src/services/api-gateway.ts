/**
 * API Gateway - Phase 3: Unified Service Coordination and Load Balancing
 * Routes requests to appropriate microservices and handles service discovery
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Connection } from 'amqplib';
import { globalServiceRegistry, type ServiceInstance } from './service-registry';

// Service route mappings
const SERVICE_ROUTES = {
  '/api/v3/payments': {
    serviceName: 'payment-service',
    capability: 'payment.processing',
    target: 'http://localhost:5001'
  },
  '/api/v3/documents': {
    serviceName: 'document-service',
    capability: 'document.processing',
    target: 'http://localhost:5002'
  },
  '/api/v3/escrow': {
    serviceName: 'escrow-service',
    capability: 'escrow.disbursement',
    target: 'http://localhost:5003'
  },
  '/api/v3/loans': {
    serviceName: 'loan-service',
    capability: 'loan.management',
    target: 'http://localhost:5004' // Future loan service
  }
} as const;

type ServiceRoute = keyof typeof SERVICE_ROUTES;
type ServiceRouteConfig = (typeof SERVICE_ROUTES)[ServiceRoute];

export class ApiGateway {
  private app: express.Application;
  private connection: Connection | null = null;
  private serviceRoutes: Map<string, express.RequestHandler> = new Map();

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Initialize API gateway
   */
  async initialize(connection: Connection): Promise<void> {
    this.connection = connection;
    
    console.log('[API Gateway] Initializing microservice API gateway...');
    
    // Setup service proxies
    this.setupServiceProxies();
    
    console.log('[API Gateway] ✅ API gateway initialized');
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // CORS middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[API Gateway] ${req.method} ${req.path} -> ${this.getTargetService(req.path)}`);
      next();
    });

    // Health checks for services
    this.app.use('/api/v3/*/health', (req: Request, res: Response, next: NextFunction) => {
      const serviceName = this.getServiceNameFromPath(req.path);
      const healthyInstances = globalServiceRegistry.getHealthyInstances(serviceName);
      
      if (healthyInstances.length === 0) {
        return res.status(503).json({
          error: 'Service unavailable',
          service: serviceName,
          message: 'No healthy instances available'
        });
      }
      
      next();
    });
  }

  /**
   * Setup API gateway routes
   */
  private setupRoutes(): void {
    // Gateway health endpoint
    this.app.get('/api/v3/gateway/health', (_req: Request, res: Response) => {
      const stats = globalServiceRegistry.getStats();
      const services = globalServiceRegistry.getAllServices();
      
      res.json({
        status: 'healthy',
        gateway: 'api-gateway',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          total: stats.totalServices,
          healthy: stats.healthyServices,
          unhealthy: stats.unhealthyServices,
          by_name: stats.servicesByName
        },
        instances: services.map(service => ({
          service_name: service.serviceName,
          service_id: service.serviceId,
          status: service.status,
          capabilities: service.metadata.capabilities,
          last_health_check: service.lastHealthCheck
        }))
      });
    });

    // Service discovery endpoint
    this.app.get('/api/v3/gateway/services', (req: Request, res: Response) => {
      const { capability, service_name } = req.query;
      
      let services: ServiceInstance[];
      
      if (capability) {
        services = globalServiceRegistry.getServicesByCapability(capability as string);
      } else if (service_name) {
        services = globalServiceRegistry.getHealthyInstances(service_name as string);
      } else {
        services = globalServiceRegistry.getAllServices();
      }

      res.json({
        success: true,
        services: services.map(service => ({
          service_id: service.serviceId,
          service_name: service.serviceName,
          version: service.version,
          host: service.host,
          port: service.port,
          status: service.status,
          capabilities: service.metadata.capabilities,
          registered_at: service.registeredAt,
          last_health_check: service.lastHealthCheck
        })),
        total: services.length
      });
    });

    // Load balancer status
    this.app.get('/api/v3/gateway/load-balancer', (_req: Request, res: Response) => {
      const routeStats = Array.from(this.serviceRoutes.entries()).map(([route]) => ({
        route,
        target: (SERVICE_ROUTES as Record<string, ServiceRouteConfig>)[route]?.target,
        service_name: (SERVICE_ROUTES as Record<string, ServiceRouteConfig>)[route]?.serviceName,
        healthy_instances: globalServiceRegistry.getHealthyInstances(
          (SERVICE_ROUTES as Record<string, ServiceRouteConfig>)[route]?.serviceName || ''
        ).length
      }));

      res.json({
        success: true,
        routes: routeStats,
        load_balancing: 'round_robin', // Future enhancement
        circuit_breaker: 'enabled' // Future enhancement
      });
    });

    // Frontend redirect - redirect non-API routes to core server  
    this.app.use('*', (req: Request, res: Response, next: NextFunction) => {
      // Skip API routes - they're handled by service proxies
      if (req.path.startsWith('/api/v3/')) {
        return next();
      }
      
      // Build URL safely; Express Request has no `search`
      const url = new URL(req.originalUrl, `http://${req.headers.host ?? 'localhost'}`);
      const coreServerUrl = `http://localhost:4000${url.pathname}${url.search}`;
      console.log(`[API Gateway] Redirecting frontend request to: ${coreServerUrl}`);
      res.redirect(302, coreServerUrl);
    });
  }

  /**
   * Setup service proxy middleware
   */
  private setupServiceProxies(): void {
    Object.entries(SERVICE_ROUTES).forEach(([route, config]) => {
      const proxyMiddleware = createProxyMiddleware({
        target: config.target,
        changeOrigin: true,
        pathRewrite: {
          [`^${route}`]: '' // Remove route prefix when forwarding
        },
        onProxyReq: (proxyReq: any, req: Request, _res: Response) => {
          // Add service routing headers
          proxyReq.setHeader('X-Gateway-Route', route);
          proxyReq.setHeader('X-Service-Name', config.serviceName);
          proxyReq.setHeader('X-Request-ID', this.generateRequestId());
        },
        onProxyRes: (proxyRes: any, _req: Request, _res: Response) => {
          // Add gateway response headers
          proxyRes.headers['X-Gateway'] = 'api-gateway-v1';
          proxyRes.headers['X-Service-Route'] = route;
        },
        onError: (err: Error, _req: Request, res: Response) => {
          console.error(`[API Gateway] Proxy error for ${route}:`, err.message);
          
          // Handle service unavailable
          if (res && !res.headersSent) {
            (res as express.Response).status(503).json({
              error: 'Service temporarily unavailable',
              service: config.serviceName,
              route: route,
              message: err.message,
              retry_after: 30
            });
          }
        }
      } as any);

      this.app.use(route, proxyMiddleware);
      this.serviceRoutes.set(route, proxyMiddleware);
      
      console.log(`[API Gateway] Registered route: ${route} -> ${config.target} (${config.serviceName})`);
    });
  }

  /**
   * Get target service name from request path
   */
  private getTargetService(path: string): string {
    for (const [route, config] of Object.entries(SERVICE_ROUTES)) {
      if (path.startsWith(route)) {
        return config.serviceName;
      }
    }
    return 'unknown';
  }

  /**
   * Get service name from health check path
   */
  private getServiceNameFromPath(path: string): string {
    const parts = path.split('/');
    if (parts.length >= 4 && parts[1] === 'api' && parts[2] === 'v3') {
      const servicePath = parts[3];
      switch (servicePath) {
        case 'payments': return 'payment-service';
        case 'documents': return 'document-service';
        case 'escrow': return 'escrow-service';
        case 'loans': return 'loan-service';
        default: return 'unknown';
      }
    }
    return 'unknown';
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start the API gateway server
   */
  async start(): Promise<void> {
    const port = 6000; // API Gateway port (separate from main app)
    
    this.app.listen(port, '0.0.0.0', () => {
      console.log(`[API Gateway] 🚀 API Gateway running on port ${port}`);
      console.log('[API Gateway] Available routes:');
      Object.entries(SERVICE_ROUTES).forEach(([route, config]) => {
        console.log(`  ${route} -> ${config.serviceName} (${config.target})`);
      });
    });
  }

  /**
   * Stop the API gateway
   */
  async stop(): Promise<void> {
    console.log('[API Gateway] API Gateway stopped');
  }
}

// Export gateway instance
export const apiGateway = new ApiGateway();