/**
 * Policy Engine for Role-Based Access Control
 * Implements resource registry, permission resolution, and PII masking
 */

import { db } from "../db";
import { 
  users, 
  roles, 
  userRoles, 
  permissions, 
  rolePermissions,
  authEvents,
  systemSettings
} from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

// Resource Registry - Maps resources to actual application modules
export const ResourceRegistry = {
  'Users and Roles': {
    routes: ['/api/admin/users', '/api/admin/roles'],
    tables: ['users', 'roles', 'user_roles'],
  },
  'Loans': {
    routes: ['/api/loans'],
    tables: ['loans', 'loan_fees', 'loan_ledger'],
  },
  'Payments and Allocations': {
    routes: ['/api/payments'],
    tables: ['payments', 'payment_allocations'],
  },
  'Escrow and Disbursements': {
    routes: ['/api/escrow'],
    tables: ['escrow_accounts', 'escrow_transactions', 'escrow_disbursements'],
  },
  'Investor Positions and Distributions': {
    routes: ['/api/investors'],
    tables: ['investor_positions', 'investor_distributions'],
  },
  'Reports': {
    routes: ['/api/reports'],
    tables: [],
  },
  'Settings': {
    routes: ['/api/settings'],
    tables: ['system_settings'],
  },
  'Audit Logs': {
    routes: ['/api/audit'],
    tables: ['audit_logs', 'auth_events'],
  },
} as const;

// Permission levels
export enum PermissionLevel {
  None = 'none',
  Read = 'read',
  Write = 'write',
  Admin = 'admin'
}

// Permission hierarchy - higher levels include lower levels
const permissionHierarchy = {
  [PermissionLevel.None]: 0,
  [PermissionLevel.Read]: 1,
  [PermissionLevel.Write]: 2,
  [PermissionLevel.Admin]: 3,
};

export interface UserPermission {
  resource: string;
  level: PermissionLevel;
  scope?: {
    own_records_only?: boolean;
    pii_masked?: boolean;
    [key: string]: any;
  };
}

export interface UserPolicy {
  userId: number;
  username: string;
  email: string;
  roles: string[];
  permissions: UserPermission[];
  isAdmin: boolean;
}

/**
 * Resolve effective permissions for a user
 * Combines all permissions from assigned roles
 */
export async function resolveUserPermissions(userId: number): Promise<UserPolicy> {
  // Get user details (ignoring the legacy enum role field)
  const user = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
  })
  .from(users)
  .where(eq(users.id, userId))
  .limit(1);

  if (!user.length) {
    throw new Error(`User ${userId} not found`);
  }

  // Get user's roles from RBAC system ONLY
  const userRolesData = await db.select({
    roleId: userRoles.roleId,
    roleName: roles.name,
  })
  .from(userRoles)
  .innerJoin(roles, eq(userRoles.roleId, roles.id))
  .where(eq(userRoles.userId, userId));

  const roleNames = userRolesData.map((r: any) => r.roleName);
  const roleIds = userRolesData.map((r: any) => r.roleId);
  
  let userPermissions: any[] = [];
  
  // Check if user has admin role in RBAC system
  const hasAdminRole = roleNames.includes('admin');
  
  if (hasAdminRole) {
    // Admin gets full permissions
    userPermissions = [
      'Users', 'Loans', 'Payments', 'Escrow', 
      'Investor Positions', 'Reports', 'Settings', 'Audit Logs'
    ].map(resource => ({
      resource,
      level: 'admin',
      scope: null
    }));
  } else {
    // Get permissions by joining role_permissions with permissions table
    if (roleIds.length > 0) {
      // Query permissions one by one to avoid array issues
      for (const roleId of roleIds) {
        const perms = await db.execute(sql`
          SELECT p.resource, p.level, rp.scope
          FROM role_permissions rp
          JOIN permissions p ON rp.permission_id = p.id
          WHERE rp.role_id = ${roleId}::uuid
        `);
        userPermissions.push(...perms.rows);
      }
    }
  }

  // Merge permissions, taking the highest level for each resource
  const mergedPermissions = new Map<string, UserPermission>();
  
  for (const perm of userPermissions) {
    const existing = mergedPermissions.get(perm.resource);
    const currentLevel = permissionHierarchy[perm.level as PermissionLevel];
    const existingLevel = existing ? permissionHierarchy[existing.level] : -1;
    
    if (currentLevel > existingLevel) {
      mergedPermissions.set(perm.resource, {
        resource: perm.resource,
        level: perm.level as PermissionLevel,
        scope: perm.scope as any,
      });
    } else if (currentLevel === existingLevel && perm.scope) {
      // Merge scopes if same level
      mergedPermissions.set(perm.resource, {
        resource: perm.resource,
        level: perm.level as PermissionLevel,
        scope: { ...existing?.scope, ...perm.scope as any },
      });
    }
  }

  return {
    userId: user[0].id,
    username: user[0].username,
    email: user[0].email,
    roles: roleNames,
    permissions: Array.from(mergedPermissions.values()),
    isAdmin: roleNames.includes('admin'),
  };
}

/**
 * Check if user has required permission level for a resource
 */
export function hasPermission(
  policy: UserPolicy,
  resource: string,
  requiredLevel: PermissionLevel
): boolean {
  // Admins have full access
  if (policy.isAdmin) return true;

  const permission = policy.permissions.find(p => p.resource === resource);
  if (!permission) return false;

  const userLevel = permissionHierarchy[permission.level];
  const required = permissionHierarchy[requiredLevel];
  
  return userLevel >= required;
}

/**
 * Check if row-level security applies to a user
 */
export function hasRowLevelRestrictions(
  policy: UserPolicy,
  resource: string
): { restricted: boolean; scope?: any } {
  const permission = policy.permissions.find(p => p.resource === resource);
  
  if (!permission?.scope?.own_records_only) {
    return { restricted: false };
  }

  return { 
    restricted: true, 
    scope: permission.scope 
  };
}

/**
 * Build row-level filter for queries
 */
export function buildRowLevelFilter(
  policy: UserPolicy,
  resource: string,
  tableName: string
): any {
  const restriction = hasRowLevelRestrictions(policy, resource);
  if (!restriction.restricted) {
    return null;
  }

  // Return filter conditions based on role and resource
  if (policy.roles.includes('borrower')) {
    if (tableName === 'loans') {
      return { borrowerId: policy.userId };
    }
    if (tableName === 'payments') {
      return { borrowerId: policy.userId };
    }
  }
  
  if (policy.roles.includes('investor')) {
    if (tableName === 'investor_positions') {
      return { investorId: policy.userId };
    }
    if (tableName === 'investor_distributions') {
      return { investorId: policy.userId };
    }
  }

  return null;
}

/**
 * PII Masking utilities for regulator role
 */
export const PIIMasker = {
  /**
   * Mask email address - show first letter and domain only
   */
  maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain}`;
  },

  /**
   * Mask phone number - show area code only
   */
  maskPhone(phone: string): string {
    if (!phone) return phone;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) return '***-***-****';
    return `${cleaned.substring(0, 3)}-***-****`;
  },

  /**
   * Mask SSN - show last 4 digits only
   */
  maskSSN(ssn: string): string {
    if (!ssn) return ssn;
    const cleaned = ssn.replace(/\D/g, '');
    if (cleaned.length !== 9) return '***-**-****';
    return `***-**-${cleaned.substring(5)}`;
  },

  /**
   * Mask address - show city and state only
   */
  maskAddress(address: any): any {
    if (!address) return address;
    return {
      ...address,
      address: '***',
      address_2: '***',
      zip_code: address.zip_code ? address.zip_code.substring(0, 3) + '**' : null,
    };
  },

  /**
   * Apply PII masking to an object based on policy
   */
  applyMasking(data: any, policy: UserPolicy, resource: string): any {
    const permission = policy.permissions.find(p => p.resource === resource);
    if (!permission?.scope?.pii_masked) {
      return data;
    }

    // Deep clone to avoid mutating original
    const masked = JSON.parse(JSON.stringify(data));

    // Apply masking to common PII fields
    if (masked.email) masked.email = this.maskEmail(masked.email);
    if (masked.phone) masked.phone = this.maskPhone(masked.phone);
    if (masked.mobile_phone) masked.mobile_phone = this.maskPhone(masked.mobile_phone);
    if (masked.ssn) masked.ssn = this.maskSSN(masked.ssn);
    if (masked.date_of_birth) masked.date_of_birth = null;
    
    // Mask address fields
    if (masked.address || masked.city || masked.state) {
      masked.address = masked.address ? '***' : null;
      masked.address_2 = masked.address_2 ? '***' : null;
      masked.zip_code = masked.zip_code ? masked.zip_code.substring(0, 3) + '**' : null;
    }

    // Mask financial details
    if (masked.bank_account_number) masked.bank_account_number = '****' + masked.bank_account_number.slice(-4);
    if (masked.routing_number) masked.routing_number = '****' + masked.routing_number.slice(-4);

    return masked;
  },

  /**
   * Apply masking to an array of objects
   */
  applyMaskingToArray(data: any[], policy: UserPolicy, resource: string): any[] {
    return data.map(item => this.applyMasking(item, policy, resource));
  }
};

/**
 * Log permission check for audit
 */
export async function logPermissionCheck(
  userId: number,
  resource: string,
  action: string,
  allowed: boolean,
  details: any = {}
): Promise<void> {
  try {
    await db.insert(authEvents).values({
      actorUserId: userId,
      eventType: allowed ? 'permission_granted' : 'permission_denied',
      details: {
        resource,
        action,
        allowed,
        ...details,
      },
      eventKey: `${userId}-${resource}-${action}-${Date.now()}`,
    });
  } catch (error) {
    console.error('Failed to log permission check:', error);
  }
}

/**
 * Get resource for a given route
 */
export function getResourceForRoute(route: string): string | null {
  for (const [resource, config] of Object.entries(ResourceRegistry)) {
    if (config.routes.some(r => route.startsWith(r))) {
      return resource;
    }
  }
  return null;
}

/**
 * Check if a user can perform an action on a specific record
 */
export async function canAccessRecord(
  policy: UserPolicy,
  resource: string,
  recordId: any,
  action: PermissionLevel
): Promise<boolean> {
  // Check base permission
  if (!hasPermission(policy, resource, action)) {
    return false;
  }

  const permission = policy.permissions.find(p => p.resource === resource);
  
  // If no scope restrictions, allow access
  if (!permission?.scope?.own_records_only) {
    return true;
  }

  // Check ownership based on resource type
  // Note: These checks would need to be implemented with actual table references
  // For now, returning true if user has the permission
  // In production, you would import the actual table schemas and use proper queries
  
  // Example implementation (would need actual table imports):
  // if (resource === 'Loans' && policy.roles.includes('borrower')) {
  //   const loan = await db.select()
  //     .from(loans)
  //     .where(and(eq(loans.id, recordId), eq(loans.borrowerId, policy.userId)))
  //     .limit(1);
  //   return loan.length > 0;
  // }

  return true;
}

/**
 * Cache for user policies to avoid repeated database queries
 */
const policyCache = new Map<number, { policy: UserPolicy; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedUserPolicy(userId: number): Promise<UserPolicy> {
  const cached = policyCache.get(userId);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.policy;
  }

  const policy = await resolveUserPermissions(userId);
  policyCache.set(userId, { policy, timestamp: Date.now() });
  
  return policy;
}

export function clearPolicyCache(userId?: number): void {
  if (userId) {
    policyCache.delete(userId);
  } else {
    policyCache.clear();
  }
}