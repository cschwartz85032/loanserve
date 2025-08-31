/**
 * Phase 10 Zero-Trust Security Middleware
 * Implements RBAC/ABAC, tenant isolation, and security policies
 */

import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { phase10AuditService } from '../services/phase10-audit-service';
import { randomUUID } from 'crypto';

export interface SecurityContext {
  tenantId: string;
  userId: string;
  userRoles: string[];
  userPermissions: string[];
  deviceFingerprint?: string;
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  correlationId: string;
}

export interface ABACAttributes {
  location?: {
    country: string;
    region: string;
    city: string;
  };
  device?: {
    type: string;
    trusted: boolean;
    fingerprint: string;
  };
  time?: {
    timestamp: Date;
    businessHours: boolean;
    timezone: string;
  };
  clearance?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

declare global {
  namespace Express {
    interface Request {
      security?: SecurityContext;
      abacAttributes?: ABACAttributes;
    }
  }
}

export class Phase10SecurityService {
  private defaultTenantId = '00000000-0000-0000-0000-000000000001';

  /**
   * Extract security context from request
   */
  async extractSecurityContext(req: Request): Promise<SecurityContext> {
    const userId = req.user?.id || req.headers['x-user-id'] as string;
    const tenantId = req.headers['x-tenant-id'] as string || this.defaultTenantId;
    const sessionId = req.sessionID || req.headers['x-session-id'] as string || randomUUID();
    const correlationId = req.headers['x-correlation-id'] as string || randomUUID();

    const context: SecurityContext = {
      tenantId,
      userId,
      userRoles: [],
      userPermissions: [],
      ipAddress: this.extractRealIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      sessionId,
      correlationId
    };

    // Load user roles and permissions if user is authenticated
    if (userId && tenantId) {
      try {
        const client = await pool.connect();
        
        // Set tenant context for RLS
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);

        // Get user roles
        const rolesResult = await client.query(`
          SELECT sr.role_name 
          FROM security_user_roles sur
          JOIN security_roles sr ON sur.role_id = sr.role_id
          WHERE sur.user_id = $1::uuid 
            AND sur.tenant_id = $2::uuid 
            AND sur.is_active = true
            AND (sur.expires_at IS NULL OR sur.expires_at > now())
        `, [userId, tenantId]);

        context.userRoles = rolesResult.rows.map(row => row.role_name);

        // Get user permissions
        const permsResult = await client.query(`
          SELECT DISTINCT sp.permission_name, sp.resource_type, sp.action
          FROM security_user_roles sur
          JOIN security_role_permissions srp ON sur.role_id = srp.role_id
          JOIN security_permissions sp ON srp.permission_id = sp.permission_id
          WHERE sur.user_id = $1::uuid 
            AND sur.tenant_id = $2::uuid 
            AND sur.is_active = true
            AND sp.is_active = true
            AND (sur.expires_at IS NULL OR sur.expires_at > now())
        `, [userId, tenantId]);

        context.userPermissions = permsResult.rows.map(row => 
          `${row.resource_type}:${row.action}`
        );

        client.release();
      } catch (error) {
        console.error('[Phase10Security] Failed to load user context:', error);
      }
    }

    return context;
  }

  /**
   * Extract ABAC attributes from request
   */
  extractABACAttributes(req: Request): ABACAttributes {
    const userAgent = req.get('user-agent') || '';
    const now = new Date();

    return {
      location: {
        // In production, would use IP geolocation service
        country: req.headers['cf-ipcountry'] as string || 'US',
        region: req.headers['cf-region'] as string || 'unknown',
        city: req.headers['cf-city'] as string || 'unknown'
      },
      device: {
        type: this.detectDeviceType(userAgent),
        trusted: false, // Would implement device trust scoring
        fingerprint: req.headers['x-device-fingerprint'] as string || 'unknown'
      },
      time: {
        timestamp: now,
        businessHours: this.isBusinessHours(now),
        timezone: req.headers['x-timezone'] as string || 'UTC'
      },
      riskLevel: 'low' // Would implement risk assessment
    };
  }

  /**
   * Check if user has permission for resource and action
   */
  async hasPermission(
    context: SecurityContext,
    resourceType: string,
    action: string,
    resourceId?: string
  ): Promise<boolean> {
    const permissionKey = `${resourceType}:${action}`;
    
    // Check direct permissions
    if (context.userPermissions.includes(permissionKey)) {
      return true;
    }

    // Check ABAC policies
    try {
      const client = await pool.connect();
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', context.tenantId]);

      const result = await client.query(`
        SELECT COUNT(*) as count
        FROM security_abac_policies sap
        JOIN security_permissions sp ON sap.permission_id = sp.permission_id
        WHERE sp.resource_type = $1 
          AND sp.action = $2
          AND sap.is_active = true
          AND sp.is_active = true
          AND sap.tenant_id = $3::uuid
      `, [resourceType, action, context.tenantId]);

      client.release();

      // Simplified ABAC check - in production would evaluate actual attribute conditions
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('[Phase10Security] Permission check failed:', error);
      return false;
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    context: SecurityContext,
    eventType: string,
    resourceUrn: string,
    success: boolean,
    details: Record<string, any> = {}
  ): Promise<void> {
    try {
      await phase10AuditService.logEvent({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        eventType: `SECURITY.${eventType}`,
        actorId: context.userId,
        actorType: 'user',
        resourceUrn,
        payload: {
          success,
          userRoles: context.userRoles,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          sessionId: context.sessionId,
          ...details
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        sessionId: context.sessionId
      });
    } catch (error) {
      console.error('[Phase10Security] Failed to log security event:', error);
    }
  }

  private extractRealIP(req: Request): string {
    const xForwardedFor = req.headers['x-forwarded-for'];
    const xRealIP = req.headers['x-real-ip'];
    const cfConnectingIP = req.headers['cf-connecting-ip'];
    
    if (xForwardedFor) {
      const forwarded = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
      return forwarded.split(',')[0].trim();
    }
    
    if (cfConnectingIP && typeof cfConnectingIP === 'string') {
      return cfConnectingIP;
    }
    
    if (xRealIP && typeof xRealIP === 'string') {
      return xRealIP;
    }
    
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private detectDeviceType(userAgent: string): string {
    if (/mobile/i.test(userAgent)) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
  }

  private isBusinessHours(date: Date): boolean {
    const hour = date.getHours();
    const day = date.getDay();
    return day >= 1 && day <= 5 && hour >= 9 && hour <= 17; // Mon-Fri 9AM-5PM
  }
}

export const phase10Security = new Phase10SecurityService();

/**
 * Middleware to establish security context
 */
export const establishSecurityContext = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Extract security context
    req.security = await phase10Security.extractSecurityContext(req);
    req.abacAttributes = phase10Security.extractABACAttributes(req);

    // Set correlation ID header for downstream services
    res.setHeader('X-Correlation-ID', req.security.correlationId);

    // Log access attempt
    await phase10Security.logSecurityEvent(
      req.security,
      'ACCESS_ATTEMPT',
      `urn:endpoint:${req.method}:${req.path}`,
      true,
      {
        method: req.method,
        path: req.path,
        query: req.query
      }
    );

    next();
  } catch (error) {
    console.error('[Phase10Security] Failed to establish security context:', error);
    res.status(500).json({ error: 'Security context establishment failed' });
  }
};

/**
 * Middleware to require authentication
 */
export const requireAuth = (
  req: Request, 
  res: Response, 
  next: NextFunction
): void => {
  if (!req.security?.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
};

/**
 * Middleware factory to require specific permissions
 */
export const requirePermission = (resourceType: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.security) {
      res.status(500).json({ error: 'Security context not established' });
      return;
    }

    const hasPermission = await phase10Security.hasPermission(
      req.security,
      resourceType,
      action,
      req.params.id
    );

    if (!hasPermission) {
      await phase10Security.logSecurityEvent(
        req.security,
        'PERMISSION_DENIED',
        `urn:${resourceType}:${req.params.id || 'collection'}`,
        false,
        {
          requiredPermission: `${resourceType}:${action}`,
          userPermissions: req.security.userPermissions
        }
      );

      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    await phase10Security.logSecurityEvent(
      req.security,
      'PERMISSION_GRANTED',
      `urn:${resourceType}:${req.params.id || 'collection'}`,
      true,
      {
        grantedPermission: `${resourceType}:${action}`
      }
    );

    next();
  };
};

/**
 * Middleware to enforce tenant isolation
 */
export const enforceTenantIsolation = (
  req: Request, 
  res: Response, 
  next: NextFunction
): void => {
  if (!req.security?.tenantId) {
    res.status(400).json({ error: 'Tenant context required' });
    return;
  }

  // Add tenant ID to all database queries by setting RLS context
  // This is handled automatically by the security context establishment
  next();
};

/**
 * Rate limiting middleware with tenant-aware limits
 */
export const rateLimiter = (
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxRequests: number = 100
) => {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.security?.tenantId || 'anonymous'}:${req.security?.userId || req.ip}`;
    const now = Date.now();
    
    let requestData = requestCounts.get(key);
    
    if (!requestData || now > requestData.resetTime) {
      requestData = { count: 1, resetTime: now + windowMs };
    } else {
      requestData.count++;
    }
    
    requestCounts.set(key, requestData);
    
    if (requestData.count > maxRequests) {
      res.status(429).json({ 
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((requestData.resetTime - now) / 1000)
      });
      return;
    }
    
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - requestData.count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(requestData.resetTime / 1000).toString());
    
    next();
  };
};