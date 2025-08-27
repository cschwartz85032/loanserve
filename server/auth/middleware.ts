/**
 * Authentication and Authorization Middleware
 * Uses policy engine to enforce permissions on routes
 */

import { Request, Response, NextFunction } from 'express';
import { 
  resolveUserPermissions,
  getCachedUserPolicy,
  hasPermission,
  getResourceForRoute,
  PermissionLevel,
  PIIMasker,
  logPermissionCheck,
  buildRowLevelFilter,
  UserPolicy,
  clearPolicyCache
} from './policy-engine';

// Extend Express Request to include user policy
declare global {
  namespace Express {
    interface Request {
      userPolicy?: UserPolicy;
      rowLevelFilter?: any;
    }
  }
}

/**
 * Load user policy and attach to request
 */
export async function loadUserPolicy(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip policy loading for non-API routes
    if (!req.path.startsWith('/api')) {
      return next();
    }
    
    // Get user ID from passport session first, then fall back to custom session
    const userId = (req.user as any)?.id || (req.session as any)?.passport?.user || (req.session as any)?.userId;
    
    if (!userId) {
      return next();
    }

    // Load and cache user policy
    const policy = await getCachedUserPolicy(userId);
    req.userPolicy = policy;
    
    // Also populate req.user for backward compatibility with admin routes
    if (!req.user && userId) {
      const { db } = await import('../db');
      const { users } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (user) {
        (req as any).user = user;
      }
    }
    
    next();
  } catch (error) {
    console.error('Failed to load user policy:', error);
    // Log more details for debugging
    console.error('Session data:', {
      hasUser: !!req.user,
      hasSession: !!req.session,
      sessionData: req.session ? Object.keys(req.session) : [],
      userId: (req.user as any)?.id || (req.session as any)?.passport?.user || (req.session as any)?.userId
    });
    // Don't silently continue - this is a critical error
    // If we can't load policies, authentication is broken
    res.status(500).json({ 
      error: 'Failed to load user permissions',
      code: 'POLICY_LOAD_ERROR' 
    });
  }
}

/**
 * Require authentication
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.userPolicy) {
    res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED' 
    });
    return;
  }
  
  next();
}

/**
 * Require specific permission level for a resource
 */
export function requirePermission(
  resource: string,
  level: PermissionLevel
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Ensure user is authenticated
      if (!req.userPolicy) {
        res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED' 
        });
        return;
      }

      // Check permission
      const allowed = hasPermission(req.userPolicy, resource, level);
      
      // Log the permission check
      await logPermissionCheck(
        req.userPolicy.userId,
        resource,
        level,
        allowed,
        { 
          method: req.method,
          path: req.path,
          ip: req.ip 
        }
      );

      if (!allowed) {
        res.status(403).json({ 
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: { resource, level } 
        });
        return;
      }

      // Apply row-level filter if needed
      const filter = buildRowLevelFilter(req.userPolicy, resource, getTableFromRoute(req.path));
      if (filter) {
        req.rowLevelFilter = filter;
      }

      next();
    } catch (error) {
      console.error('Permission check failed:', error);
      res.status(500).json({ 
        error: 'Authorization check failed',
        code: 'AUTH_CHECK_FAILED' 
      });
    }
  };
}

/**
 * Auto-detect resource and required permission from route
 */
export function autoRequirePermission() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Ensure user is authenticated
      if (!req.userPolicy) {
        res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED' 
        });
        return;
      }

      // Detect resource from route
      const resource = getResourceForRoute(req.path);
      if (!resource) {
        // No resource mapping found, allow through
        return next();
      }

      // Determine required permission level based on HTTP method
      let level: PermissionLevel;
      switch (req.method) {
        case 'GET':
        case 'HEAD':
        case 'OPTIONS':
          level = PermissionLevel.Read;
          break;
        case 'POST':
        case 'PUT':
        case 'PATCH':
          level = PermissionLevel.Write;
          break;
        case 'DELETE':
          level = PermissionLevel.Admin;
          break;
        default:
          level = PermissionLevel.Read;
      }

      // Check permission
      const allowed = hasPermission(req.userPolicy, resource, level);
      
      // Log the permission check
      await logPermissionCheck(
        req.userPolicy.userId,
        resource,
        level,
        allowed,
        { 
          method: req.method,
          path: req.path,
          ip: req.ip 
        }
      );

      if (!allowed) {
        res.status(403).json({ 
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: { resource, level } 
        });
        return;
      }

      // Apply row-level filter if needed
      const filter = buildRowLevelFilter(req.userPolicy, resource, getTableFromRoute(req.path));
      if (filter) {
        req.rowLevelFilter = filter;
      }

      next();
    } catch (error) {
      console.error('Auto permission check failed:', error);
      res.status(500).json({ 
        error: 'Authorization check failed',
        code: 'AUTH_CHECK_FAILED' 
      });
    }
  };
}

/**
 * Apply PII masking to response data for regulators
 */
export function applyPIIMasking() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userPolicy) {
      return next();
    }

    // Check if user is a regulator
    if (!req.userPolicy.roles.includes('regulator')) {
      return next();
    }

    // Override res.json to apply masking
    const originalJson = res.json.bind(res);
    res.json = function(data: any) {
      const resource = getResourceForRoute(req.path);
      if (resource && data) {
        if (Array.isArray(data)) {
          data = PIIMasker.applyMaskingToArray(data, req.userPolicy!, resource);
        } else if (typeof data === 'object') {
          data = PIIMasker.applyMasking(data, req.userPolicy!, resource);
        }
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Require admin role
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.userPolicy) {
    res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED' 
    });
    return;
  }

  if (!req.userPolicy.isAdmin) {
    res.status(403).json({ 
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED' 
    });
    return;
  }

  next();
}

/**
 * Require specific role(s)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userPolicy) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED' 
      });
      return;
    }

    const hasRole = roles.some(role => req.userPolicy!.roles.includes(role));
    
    if (!hasRole) {
      res.status(403).json({ 
        error: 'Required role not found',
        code: 'ROLE_REQUIRED',
        required: roles 
      });
      return;
    }

    next();
  };
}

/**
 * Require borrower role and load borrower details
 */
export async function requireBorrower(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check authentication
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED' 
      });
      return;
    }

    // Check if user has borrower role (from RBAC)
    // We check the user object directly to bypass policy engine issues
    const hasBorrowerRole = req.user.roleNames?.includes('borrower') || req.user.role === 'borrower';
    
    if (!hasBorrowerRole) {
      res.status(403).json({ 
        error: 'Borrower access required',
        code: 'BORROWER_REQUIRED' 
      });
      return;
    }

    // Load borrower details
    const { db } = await import('../db');
    const { borrowerUsers } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    const [borrowerUser] = await db
      .select()
      .from(borrowerUsers)
      .where(eq(borrowerUsers.email, req.user.email))
      .limit(1);

    if (!borrowerUser) {
      res.status(403).json({ 
        error: 'Borrower profile not found',
        code: 'BORROWER_PROFILE_NOT_FOUND' 
      });
      return;
    }

    // Attach borrower details to request
    (req.user as any).borrowerUserId = borrowerUser.id;
    (req.user as any).borrowerEntityId = borrowerUser.borrowerEntityId;

    // Update last login
    await db
      .update(borrowerUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(borrowerUsers.id, borrowerUser.id));

    next();
  } catch (error) {
    console.error('Borrower auth middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication check failed',
      code: 'AUTH_CHECK_FAILED' 
    });
  }
}

/**
 * Clear user policy cache on logout or role change
 */
export function clearUserPolicyCache(userId: number): void {
  clearPolicyCache(userId);
}

/**
 * Helper to extract table name from route
 */
function getTableFromRoute(path: string): string {
  // Extract table name from route path
  // Example: /api/loans -> loans
  const parts = path.split('/').filter(p => p);
  if (parts.length >= 2) {
    return parts[1];
  }
  return '';
}

/**
 * Log all authenticated requests for audit
 */
export async function auditLog(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (req.userPolicy) {
    try {
      const { authEvents } = await import('@shared/schema');
      const { db } = await import('../db');
      
      await db.insert(authEvents).values({
        actorUserId: req.userPolicy.userId,
        eventType: 'api_request',
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
        details: {
          method: req.method,
          path: req.path,
          query: req.query,
          statusCode: res.statusCode
        },
        eventKey: `api-${req.userPolicy.userId}-${Date.now()}`
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }
  
  next();
}

/**
 * Rate limiting middleware based on user policy
 */
export function rateLimit(
  maxRequests: number = 100,
  windowMs: number = 60000
) {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.userPolicy ? `user-${req.userPolicy.userId}` : `ip-${req.ip}`;
    const now = Date.now();
    
    let record = requestCounts.get(key);
    
    if (!record || record.resetTime < now) {
      record = { count: 0, resetTime: now + windowMs };
      requestCounts.set(key, record);
    }
    
    record.count++;
    
    if (record.count > maxRequests) {
      res.status(429).json({ 
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((record.resetTime - now) / 1000) 
      });
      return;
    }
    
    next();
  };
}