/**
 * Correlation ID Middleware
 * Attaches correlation IDs to all requests and traces
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { correlationStorage, withCorrelationId } from '../observability/telemetry';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Middleware to ensure every request has a correlation ID
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract correlation ID from headers or generate new one
  const correlationId = 
    req.headers['x-correlation-id'] as string ||
    req.headers['x-request-id'] as string ||
    req.query.correlationId as string ||
    randomUUID();

  // Attach to request object
  req.correlationId = correlationId;

  // Set response header
  res.setHeader('X-Correlation-ID', correlationId);

  // Add to logging context if available
  if ((req as any).log) {
    (req as any).log = (req as any).log.child({ correlationId });
  }

  // Run the rest of the request within correlation context
  withCorrelationId(correlationId, () => {
    next();
  });
}

/**
 * Helper to extract correlation ID from various sources
 */
export function extractCorrelationId(source: any): string {
  return source?.correlationId ||
         source?.headers?.['x-correlation-id'] ||
         source?.headers?.['x-request-id'] ||
         source?.properties?.correlationId ||
         source?.metadata?.correlationId ||
         randomUUID();
}

/**
 * Helper to attach correlation ID to outgoing requests
 */
export function attachCorrelationId(target: any, correlationId: string) {
  if (!correlationId) return;

  // For HTTP requests
  if (target.headers) {
    target.headers['x-correlation-id'] = correlationId;
  }
  
  // For RabbitMQ messages
  if (target.properties) {
    target.properties.correlationId = correlationId;
  }
  
  // For generic metadata
  if (target.metadata) {
    target.metadata.correlationId = correlationId;
  }
}

/**
 * Express error handler that includes correlation ID
 */
export function correlationErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const correlationId = req.correlationId || 'unknown';
  
  console.error(`[Error] Correlation ID: ${correlationId}`, err);
  
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    correlationId,
    timestamp: new Date().toISOString(),
  });
}