/**
 * Admin User Management Routes
 * Comprehensive endpoints for user administration
 */

import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { db } from '../db';
import { 
  users, 
  userRoles, 
  roles,
  permissions,
  rolePermissions,
  userIpAllowlist, 
  sessions, 
  authEvents,
  loginAttempts,
  invitations,
  passwordResetTokens
} from '@shared/schema';
import { eq, and, or, like, sql, desc, inArray, isNull, lt, gte } from 'drizzle-orm';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { createInvitationToken } from '../auth/auth-service';
import { ipAllowlistService } from '../auth/ip-allowlist-service';

const router = Router();

// Middleware to check admin permissions
const requireAdmin = async (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check if user has admin role
  const adminRole = await db.select()
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(
      eq(userRoles.userId, req.user.id),
      eq(roles.name, 'admin')
    ))
    .limit(1);

  if (adminRole.length === 0) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

// Apply authentication and admin check to all routes
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/admin/users
 * List all users with filtering and pagination
 */
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '',
      role = '',
      isActive 
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    // Build base query conditions
    let baseConditions: any[] = [];
    
    // Add search filter
    if (search) {
      baseConditions.push(
        or(
          like(users.username, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`)
        )
      );
    }

    // Add active filter
    if (isActive !== undefined) {
      baseConditions.push(eq(users.isActive, isActive === 'true'));
    }

    const whereClause = baseConditions.length > 0 ? and(...baseConditions) : undefined;

    // Get total count
    const countQuery = db.select({ count: sql<number>`COUNT(*)` })
      .from(users);
    if (whereClause) {
      countQuery.where(whereClause);
    }
    const countResult = await countQuery;
    const totalCount = Number(countResult[0].count);

    // Get paginated users
    const usersQuery = db.select()
      .from(users);
    if (whereClause) {
      usersQuery.where(whereClause);
    }
    const usersList = await usersQuery
      .orderBy(desc(users.createdAt))
      .limit(Number(limit))
      .offset(offset);

    // Get roles for each user
    const userIds = usersList.map(u => u.id);
    let userRolesMap: Record<number, string[]> = {};
    
    if (userIds.length > 0) {
      const userRolesList = await db.select({
        userId: userRoles.userId,
        roleName: roles.name
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(inArray(userRoles.userId, userIds));

      // Group roles by user
      userRolesList.forEach(ur => {
        if (!userRolesMap[ur.userId]) {
          userRolesMap[ur.userId] = [];
        }
        userRolesMap[ur.userId].push(ur.roleName);
      });
    }

    // Filter by role if specified
    let filteredUsers = usersList;
    if (role && role !== 'all') {
      filteredUsers = usersList.filter(u => 
        userRolesMap[u.id]?.includes(role)
      );
    }

    // Combine users with their roles
    const results = filteredUsers.map(user => ({
      ...user,
      roles: userRolesMap[user.id] || []
    }));

    res.json({
      users: results,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/admin/users/roles
 * Get all available roles
 */
router.get('/roles', async (req, res) => {
  try {
    const rolesList = await db.select()
      .from(roles)
      .orderBy(roles.name);

    res.json({ roles: rolesList });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/**
 * GET /api/admin/users/:id
 * Get detailed user information
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Get user details
    const user = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user roles
    const userRolesList = await db.select({
      roleId: roles.id,
      roleName: roles.name,
      roleDescription: roles.description,
      assignedAt: userRoles.assignedAt,
      assignedBy: userRoles.assignedBy
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

    // Get recent login attempts
    const recentLogins = await db.select()
      .from(loginAttempts)
      .where(eq(loginAttempts.userId, userId))
      .orderBy(desc(loginAttempts.attemptedAt))
      .limit(10);

    // Get active sessions
    const activeSessions = await db.select()
      .from(sessions)
      .where(and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt)
      ))
      .orderBy(desc(sessions.lastSeenAt));

    // Get IP allowlist
    const ipAllowlist = await db.select()
      .from(userIpAllowlist)
      .where(eq(userIpAllowlist.userId, userId))
      .orderBy(desc(userIpAllowlist.createdAt));

    res.json({
      user: user[0],
      roles: userRolesList,
      recentLogins,
      activeSessions,
      ipAllowlist
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user information
 */
const updateUserSchema = z.object({
  username: z.string().optional(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional()
});

router.patch('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const updates = updateUserSchema.parse(req.body);

    // Update user
    const result = await db.update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log the update
    await db.insert(authEvents).values({
      eventType: 'user_updated',
      actorUserId: req.user.id,
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      details: { updates }
    });

    res.json({ user: result[0] });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * POST /api/admin/users/:id/lock
 * Lock a user account
 */
router.post('/:id/lock', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { duration = 30 } = req.body; // Duration in minutes

    const lockedUntil = new Date();
    lockedUntil.setMinutes(lockedUntil.getMinutes() + duration);

    const result = await db.update(users)
      .set({ 
        lockedUntil,
        failedLoginCount: 0 
      })
      .where(eq(users.id, userId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log the action
    await db.insert(authEvents).values({
      eventType: 'user_locked',
      actorUserId: req.user.id,
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      details: { lockedUntil, duration }
    });

    res.json({ 
      message: 'User locked successfully',
      lockedUntil,
      user: result[0] 
    });
  } catch (error) {
    console.error('Error locking user:', error);
    res.status(500).json({ error: 'Failed to lock user' });
  }
});

/**
 * POST /api/admin/users/:id/unlock
 * Unlock a user account
 */
router.post('/:id/unlock', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const result = await db.update(users)
      .set({ 
        lockedUntil: null,
        failedLoginCount: 0 
      })
      .where(eq(users.id, userId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log the action
    await db.insert(authEvents).values({
      eventType: 'user_unlocked',
      actorUserId: req.user.id,
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      details: {}
    });

    res.json({ 
      message: 'User unlocked successfully',
      user: result[0] 
    });
  } catch (error) {
    console.error('Error unlocking user:', error);
    res.status(500).json({ error: 'Failed to unlock user' });
  }
});

/**
 * POST /api/admin/users/:id/suspend
 * Suspend a user account
 */
router.post('/:id/suspend', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { reason } = req.body;

    const result = await db.update(users)
      .set({ isActive: false })
      .where(eq(users.id, userId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Revoke all sessions
    await db.update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt)
      ));

    // Log the action
    await db.insert(authEvents).values({
      eventType: 'user_suspended',
      actorUserId: req.user.id,
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      details: { reason }
    });

    res.json({ 
      message: 'User suspended successfully',
      user: result[0] 
    });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

/**
 * POST /api/admin/users/:id/activate
 * Activate a suspended user account
 */
router.post('/:id/activate', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const result = await db.update(users)
      .set({ isActive: true })
      .where(eq(users.id, userId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log the action
    await db.insert(authEvents).values({
      eventType: 'user_activated',
      actorUserId: req.user.id,
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      details: {}
    });

    res.json({ 
      message: 'User activated successfully',
      user: result[0] 
    });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

/**
 * POST /api/admin/users/:id/roles
 * Assign role to user
 */
router.post('/:id/roles', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { roleId } = req.body;

    if (!roleId) {
      return res.status(400).json({ error: 'Role ID is required' });
    }

    // Check if role exists
    const role = await db.select()
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);

    if (role.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Check if user already has this role
    const existing = await db.select()
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.roleId, roleId)
      ))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'User already has this role' });
    }

    // Assign role
    await db.insert(userRoles).values({
      userId,
      roleId,
      assignedBy: req.user.id
    });

    // Log the action
    await db.insert(authEvents).values({
      eventType: 'role_assigned',
      actorUserId: req.user.id,
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      details: { roleId, roleName: role[0].name }
    });

    res.json({ 
      message: 'Role assigned successfully',
      role: role[0]
    });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

/**
 * DELETE /api/admin/users/:id/roles/:roleId
 * Remove role from user
 */
router.delete('/:id/roles/:roleId', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { roleId } = req.params;

    // Get role details for logging
    const role = await db.select()
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);

    // Remove role
    const result = await db.delete(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.roleId, roleId)
      ))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Role assignment not found' });
    }

    // Log the action
    await db.insert(authEvents).values({
      eventType: 'role_removed',
      actorUserId: req.user.id,
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      details: { roleId, roleName: role[0]?.name }
    });

    res.json({ message: 'Role removed successfully' });
  } catch (error) {
    console.error('Error removing role:', error);
    res.status(500).json({ error: 'Failed to remove role' });
  }
});

/**
 * GET /api/admin/users/:id/sessions
 * Get user sessions
 */
router.get('/:id/sessions', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const userSessions = await db.select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.lastSeenAt));

    res.json({ sessions: userSessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * POST /api/admin/users/:id/sessions/:sessionId/revoke
 * Revoke a user session
 */
router.post('/:id/sessions/:sessionId/revoke', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { sessionId } = req.params;

    const result = await db.update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId)
      ))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Log the action
    await db.insert(authEvents).values({
      eventType: 'session_revoked',
      actorUserId: req.user.id,
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      details: { sessionId }
    });

    res.json({ message: 'Session revoked successfully' });
  } catch (error) {
    console.error('Error revoking session:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

/**
 * GET /api/admin/users/:id/audit-logs
 * Get user audit logs
 */
router.get('/:id/audit-logs', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const logs = await db.select()
      .from(authEvents)
      .where(or(
        eq(authEvents.actorUserId, userId),
        eq(authEvents.targetUserId, userId)
      ))
      .orderBy(desc(authEvents.occurredAt))
      .limit(Number(limit))
      .offset(offset);

    res.json({ auditLogs: logs });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * POST /api/admin/users/bulk-invite
 * Bulk invite users
 */
router.post('/bulk-invite', async (req, res) => {
  try {
    const { invitations: invitationList } = req.body;

    if (!Array.isArray(invitationList)) {
      return res.status(400).json({ error: 'Invitations must be an array' });
    }

    const results = [];
    const errors = [];

    for (const invitation of invitationList) {
      try {
        const { email, roleId } = invitation;
        
        // Check if user already exists
        const existing = await db.select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existing.length > 0) {
          errors.push({ email, error: 'User already exists' });
          continue;
        }

        // Create invitation
        const result = await createInvitationToken(email, roleId, req.user.id);
        
        if (result.success) {
          results.push({ email, success: true, invitationUrl: result.invitationUrl });
        } else {
          errors.push({ email, error: result.error });
        }
      } catch (error) {
        errors.push({ email: invitation.email, error: 'Failed to create invitation' });
      }
    }

    res.json({ 
      success: results,
      errors,
      summary: {
        total: invitationList.length,
        successful: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('Error in bulk invite:', error);
    res.status(500).json({ error: 'Failed to process bulk invitations' });
  }
});

/**
 * POST /api/admin/users/bulk-assign-roles
 * Bulk assign roles to users
 */
router.post('/bulk-assign-roles', async (req, res) => {
  try {
    const { userIds, roleId } = req.body;

    if (!Array.isArray(userIds) || !roleId) {
      return res.status(400).json({ error: 'User IDs and role ID are required' });
    }

    // Check if role exists
    const role = await db.select()
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);

    if (role.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const results = [];
    const errors = [];

    for (const userId of userIds) {
      try {
        // Check if user already has this role
        const existing = await db.select()
          .from(userRoles)
          .where(and(
            eq(userRoles.userId, userId),
            eq(userRoles.roleId, roleId)
          ))
          .limit(1);

        if (existing.length > 0) {
          errors.push({ userId, error: 'User already has this role' });
          continue;
        }

        // Assign role
        await db.insert(userRoles).values({
          userId,
          roleId,
          assignedBy: req.user.id
        });

        results.push({ userId, success: true });

        // Log each assignment
        await db.insert(authEvents).values({
          eventType: 'bulk_role_assigned',
          actorUserId: req.user.id,
          targetUserId: userId,
          ip: req.ip,
          userAgent: req.headers['user-agent'] || null,
          details: { roleId, roleName: role[0].name, bulk: true }
        });
      } catch (error) {
        errors.push({ userId, error: 'Failed to assign role' });
      }
    }

    res.json({ 
      success: results,
      errors,
      summary: {
        total: userIds.length,
        successful: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('Error in bulk role assignment:', error);
    res.status(500).json({ error: 'Failed to process bulk role assignments' });
  }
});

/**
 * GET /api/admin/roles
 * Get all available roles
 */
router.get('/roles', async (req, res) => {
  try {
    const rolesList = await db.select()
      .from(roles)
      .orderBy(roles.name);

    // Get permissions for each role
    const rolesWithPermissions = await Promise.all(
      rolesList.map(async (role) => {
        const perms = await db.select({
          resource: permissions.resource,
          level: permissions.level
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, role.id));

        return {
          ...role,
          permissions: perms
        };
      })
    );

    res.json({ roles: rolesWithPermissions });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

export { router as adminUsersRouter };