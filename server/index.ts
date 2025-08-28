// Build version: 2025-01-24-v3 - Force rebuild to fix servicing_fee_type
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import { initializeTelemetry, shutdownTelemetry } from './observability/telemetry';
import { correlationIdMiddleware, correlationErrorHandler } from './middleware/correlation-id';
import { startMetricsCollection, stopMetricsCollection } from './observability/metrics-collector';
import { runStartupValidations } from './utils/schema-validator';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local if it exists for Twilio and other local configs
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('[Config] Loaded .env.local');
}

// Initialize telemetry before anything else
initializeTelemetry();

const app = express();

// Configure CORS with credentials support
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // In production, allow requests from the same domain or Replit domains
    const allowedOrigins = [
      /^https:\/\/.*\.repl\.co$/,
      /^https:\/\/.*\.replit\.dev$/,
      /^https:\/\/.*\.replit\.app$/,
      /^https:\/\/readysetclose.*$/
    ];
    
    // Allow requests with no origin (same-origin requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
    
    if (isAllowed || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400 // Cache preflight response for 24 hours
};

app.use(cors(corsOptions));

// Add correlation ID middleware before other middlewares
app.use(correlationIdMiddleware);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

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
  // Run database migrations (idempotent and forward-only)
  // Running in both dev and production ensures schema consistency
  const { runMigrations } = await import('./migrations');
  await runMigrations();
  
  // Run startup validations (schema and environment checks)
  try {
    console.log('[Server] About to run startup validations...');
    await runStartupValidations();
    console.log('[Server] Startup validations completed');
  } catch (error) {
    console.error('[Server] Startup validation error:', error);
    // Continue server startup even if validations fail (non-fatal)
  }
  
  // Start payment processing consumers with idempotency
  try {
    const { startPaymentConsumers } = await import('./consumers/index');
    await startPaymentConsumers();
    console.log('[Server] Payment consumers started successfully');
  } catch (error) {
    console.error('[Server] Failed to start payment consumers:', error);
    // Continue server startup even if consumers fail
  }
  
  // Start metrics collection
  startMetricsCollection();
  console.log('[Server] Metrics collection started');
  
  // Start CRM notification checks (run every hour)
  try {
    const { runCRMNotificationChecks } = await import('./crm/check-overdue-tasks');
    
    // Run immediately on startup
    runCRMNotificationChecks().catch(err => 
      console.error('[Server] CRM notification check error:', err)
    );
    
    // Schedule to run every hour
    setInterval(() => {
      runCRMNotificationChecks().catch(err => 
        console.error('[Server] CRM notification check error:', err)
      );
    }, 60 * 60 * 1000); // 1 hour
    
    console.log('[Server] CRM notification checks scheduled (hourly)');
  } catch (error) {
    console.error('[Server] Failed to start CRM notification checks:', error);
  }
  
  // Start Remittance Scheduler
  try {
    const { neonConfig } = await import('@neondatabase/serverless');
    const { Pool } = await import('@neondatabase/serverless');
    const { RemittanceScheduler } = await import('./remittance/scheduler');
    
    neonConfig.fetchConnectionCache = true;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const scheduler = new RemittanceScheduler(pool);
    scheduler.start();
    console.log('[Server] Remittance scheduler started successfully');
  } catch (error) {
    console.error('[Server] Failed to start remittance scheduler:', error);
  }
  
  // Start Compliance Scheduler (Phase 9)
  try {
    const { initializeComplianceScheduler } = await import('./compliance');
    initializeComplianceScheduler();
    console.log('[Server] Compliance scheduler initialized successfully');
  } catch (error) {
    console.error('[Server] Failed to initialize compliance scheduler:', error);
  }
  
  const server = await registerRoutes(app);

  // Use correlation error handler
  app.use(correlationErrorHandler);
  
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
