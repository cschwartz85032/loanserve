/**
 * Attribute-Based Access Control (ABAC) 
 * Handles tenant scoping and ownership-based authorization
 */

export interface DbContext {
  tenantId: string;
  userSub: string;
}

/**
 * Middleware to set tenant and user context for database operations
 * Enforces RLS (Row Level Security) through app.tenant_id setting
 */
export function setTenantAndUserContext() {
  return async (req: any, res: any, next: any) => {
    // Extract tenant from JWT claims or session
    const tenantId = req.user?.tenant_id || req.session?.tenant_id;
    const userSub = req.user?.sub || "system";

    if (!tenantId) {
      return res.status(400).json({ 
        error: "missing tenant context", 
        message: "All requests must include tenant identification" 
      });
    }

    req.dbContext = {
      tenantId,
      userSub
    } as DbContext;

    next();
  };
}

/**
 * Apply database context to connection
 * Sets app.tenant_id for RLS enforcement
 */
export async function applyDbContext(client: any, context: DbContext) {
  await client.query(`SET LOCAL app.tenant_id = $1`, [context.tenantId]);
  await client.query(`SET LOCAL app.user_sub = $1`, [context.userSub]);
}

/**
 * Loan ACL ownership check
 * Determines if user has access to specific loan
 */
export async function checkLoanAccess(
  client: any, 
  context: DbContext, 
  loanId: string, 
  requiredRole: string = "viewer"
): Promise<boolean> {
  try {
    const result = await client.query(`
      SELECT roles FROM loan_acl 
      WHERE tenant_id = $1 AND loan_id = $2 AND user_sub = $3
    `, [context.tenantId, loanId, context.userSub]);

    if (result.rows.length === 0) {
      return false; // No ACL entry = no access
    }

    const userRoles: string[] = result.rows[0].roles || [];
    return userRoles.includes(requiredRole) || userRoles.includes("admin");
  } catch (error) {
    console.error('[ABAC] Loan access check failed:', error);
    return false;
  }
}

/**
 * Grant loan access to user
 */
export async function grantLoanAccess(
  client: any,
  context: DbContext,
  loanId: string,
  targetUserSub: string,
  roles: string[]
) {
  await client.query(`
    INSERT INTO loan_acl (tenant_id, loan_id, user_sub, roles)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (tenant_id, loan_id, user_sub)
    DO UPDATE SET roles = $4, updated_at = now()
  `, [context.tenantId, loanId, targetUserSub, roles]);
}

/**
 * Express middleware to check loan ownership
 */
export function requireLoanAccess(role: string = "viewer") {
  return async (req: any, res: any, next: any) => {
    const loanId = req.params.loanId || req.body.loanId;
    if (!loanId) {
      return res.status(400).json({ error: "loan ID required" });
    }

    const { pool } = await import('../server/db');
    const client = await pool.connect();
    
    try {
      await applyDbContext(client, req.dbContext);
      const hasAccess = await checkLoanAccess(client, req.dbContext, loanId, role);
      
      if (!hasAccess) {
        return res.status(403).json({ 
          error: "loan access denied",
          loan_id: loanId,
          required_role: role
        });
      }
      
      next();
    } catch (error) {
      console.error('[ABAC] Loan access middleware error:', error);
      res.status(500).json({ error: "access control error" });
    } finally {
      client.release();
    }
  };
}