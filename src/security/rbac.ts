type Role = "admin" | "investor.admin" | "investor.operator" | "investor.viewer" | "escrow.operator" | "borrower";

/**
 * Fixed permissions matrix - no decisions required
 * Based on principle of least privilege
 */
const PERMS: Record<string, Role[]> = {
  "loan:read": ["admin", "investor.admin", "investor.operator", "investor.viewer", "escrow.operator"],
  "loan:write": ["admin", "investor.admin", "investor.operator", "escrow.operator"],
  "loan:delete": ["admin"],
  "export:run": ["admin", "investor.admin", "investor.operator"],
  "export:manage": ["admin", "investor.admin"],
  "qc:run": ["admin", "investor.admin", "investor.operator"],
  "qc:manage": ["admin", "investor.admin"],
  "notify:request": ["admin", "investor.admin", "investor.operator", "escrow.operator"],
  "notify:manage": ["admin", "investor.admin"],
  "docs:upload": ["admin", "investor.admin", "escrow.operator"],
  "docs:manage": ["admin", "investor.admin"],
  "wire:approve": ["admin", "investor.admin"],
  "wire:request": ["admin", "investor.admin", "investor.operator"],
  "escrow:manage": ["admin", "escrow.operator"],
  "tenant:admin": ["admin"],
  "audit:read": ["admin", "investor.admin"],
  "retention:manage": ["admin"],
  "security:manage": ["admin"]
};

export function hasPerm(user: any, perm: string): boolean {
  const roles: Role[] = user?.roles || [];
  const allowed = PERMS[perm] || [];
  return roles.some((r: Role) => allowed.includes(r));
}

export function requirePerm(perm: string) {
  return (req: any, res: any, next: any) => {
    if (!hasPerm(req.user, perm)) {
      console.warn(`[RBAC] Permission denied: ${req.user?.sub} requested ${perm}`);
      return res.status(403).json({ error: "forbidden", required_permission: perm });
    }
    next();
  };
}

export function getUserRoles(user: any): Role[] {
  return user?.roles || [];
}

export function hasRole(user: any, role: Role): boolean {
  const roles = getUserRoles(user);
  return roles.includes(role);
}

// Tenant-specific role assignment
export function setDefaultTenantRole(user: any, tenantId: string): void {
  if (!user.roles || user.roles.length === 0) {
    user.roles = [process.env.DEFAULT_TENANT_ROLE || "investor.viewer"];
  }
  user.tenant_id = tenantId;
}