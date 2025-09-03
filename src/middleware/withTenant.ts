/**
 * Tenant Isolation Middleware
 * Extracts tenant context from authenticated user and enforces RLS
 */

import { Request, Response, NextFunction } from 'express';

export interface TenantContext {
  id: string;
}

export interface RequestWithTenant extends Request {
  tenant?: TenantContext;
  user?: any; // User object from authentication middleware
}

/**
 * Middleware to extract and validate tenant context from authenticated user
 */
export function withTenant() {
  return async (req: RequestWithTenant, res: Response, next: NextFunction) => {
    try {
      // Extract tenant from authenticated user
      const tenantId = req.user?.tenant_id || req.user?.claims?.tenant_id;
      
      if (!tenantId) {
        console.error('[Tenant] Missing tenant context for authenticated request', {
          userId: req.user?.id || req.user?.claims?.sub,
          path: req.path,
          method: req.method
        });
        
        return res.status(403).json({
          error: 'Tenant context required',
          code: 'TENANT_MISSING'
        });
      }

      // Validate tenant ID format (should be UUID)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
        console.error('[Tenant] Invalid tenant ID format', {
          tenantId,
          userId: req.user?.id || req.user?.claims?.sub,
          path: req.path
        });
        
        return res.status(403).json({
          error: 'Invalid tenant context',
          code: 'TENANT_INVALID'
        });
      }

      // Attach tenant context to request
      req.tenant = { id: tenantId };
      
      console.debug('[Tenant] Tenant context established', {
        tenantId,
        userId: req.user?.id || req.user?.claims?.sub,
        path: req.path
      });

      next();
    } catch (error) {
      console.error('[Tenant] Failed to establish tenant context', error);
      res.status(500).json({
        error: 'Failed to establish tenant context',
        code: 'TENANT_ERROR'
      });
    }
  };
}

/**
 * Optional middleware for routes that can work without tenant context
 * Sets tenant context if available but doesn't require it
 */
export function withOptionalTenant() {
  return async (req: RequestWithTenant, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user?.tenant_id || req.user?.claims?.tenant_id;
      
      if (tenantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
        req.tenant = { id: tenantId };
        console.debug('[Tenant] Optional tenant context established', {
          tenantId,
          path: req.path
        });
      }

      next();
    } catch (error) {
      console.error('[Tenant] Failed to establish optional tenant context', error);
      // Continue without tenant context for optional routes
      next();
    }
  };
}