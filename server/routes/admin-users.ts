/**
 * Admin User Management Routes
 * Endpoints for user invitation and management
 */

import { Router } from 'express';
import { requireAuth, requirePermission } from '../auth/middleware';
import { 
  createInvitationToken
} from '../auth/auth-service';
import { sendInvitationEmail } from '../auth/email-service';
import { db } from '../db';
import { users, authEvents, userRoles } from '@shared/schema';
import { eq, and, or, like, sql, desc } from 'drizzle-orm';

const router = Router();

// All routes require authentication and admin permissions
router.use(requireAuth);
router.use(requirePermission('users', 'admin'));

/**
 * POST /api/admin/users/invite
 * Invite a new user to the system
 */
router.post('/invite', async (req, res) => {
  try {
    const { email, role, permissions } = req.body;
    const invitedBy = (req as any).user?.id;

    if (!invitedBy) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED' 
      });
    }

    // Validate input
    if (!email || !role) {
      return res.status(400).json({ 
        error: 'Email and role are required',
        code: 'MISSING_FIELDS' 
      });
    }

    // Validate role
    const validRoles = ['admin', 'lender', 'borrower', 'investor', 'title', 'legal', 'regulator'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role',
        code: 'INVALID_ROLE',
        validRoles 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format',
        code: 'INVALID_EMAIL' 
      });
    }

    // Create invitation
    const result = await createInvitationToken(email, role, invitedBy);

    if (!result.success) {
      return res.status(400).json({ 
        error: result.error || 'Failed to create invitation',
        code: 'INVITATION_FAILED' 
      });
    }

    // Send invitation email
    if (result.token) {
      await sendInvitationEmail(email, result.token, role, invitedBy);
    }

    // If custom permissions provided, store them
    if (permissions && typeof permissions === 'object') {
      const [invitedUser] = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (invitedUser) {
        // Store custom permissions in user_roles table
        for (const [resource, level] of Object.entries(permissions)) {
          if (typeof level === 'string' && ['none', 'read', 'write', 'admin'].includes(level)) {
            await db.insert(userRoles).values({
              userId: invitedUser.id,
              role: role as any,
              resource,
              permissionLevel: level as any
            })
            .onConflictDoUpdate({
              target: [userRoles.userId, userRoles.role, userRoles.resource],
              set: { permissionLevel: level as any }
            });
          }
        }
      }
    }

    res.json({ 
      success: true,
      message: `Invitation sent to ${email}` 
    });

  } catch (error) {
    console.error('User invitation error:', error);
    res.status(500).json({ 
      error: 'An error occurred sending the invitation',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * GET /api/admin/users
 * List all users with filters
 */
router.get('/', async (req, res) => {
  try {
    const { 
      role, 
      status, 
      search, 
      page = 1, 
      limit = 20 
    } = req.query;

    // Build query
    let query = db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      failedLoginCount: users.failedLoginCount,
      invitedBy: users.invitedBy,
      invitedAt: users.invitedAt
    })
    .from(users);

    // Apply filters
    const conditions = [];

    if (role && typeof role === 'string') {
      conditions.push(eq(users.role, role as any));
    }

    if (status && typeof status === 'string') {
      conditions.push(eq(users.status, status as any));
    }

    if (search && typeof search === 'string') {
      conditions.push(or(
        like(users.username, `%${search}%`),
        like(users.email, `%${search}%`),
        like(users.firstName, `%${search}%`),
        like(users.lastName, `%${search}%`)
      )!);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Apply pagination
    const offset = (Number(page) - 1) * Number(limit);
    query = query.limit(Number(limit)).offset(offset) as any;

    // Execute query
    const userList = await query.orderBy(desc(users.createdAt));

    // Get total count
    const countQuery = db.select({ count: sql<number>`COUNT(*)` })
      .from(users);

    if (conditions.length > 0) {
      (countQuery as any).where(and(...conditions));
    }

    const [{ count }] = await countQuery;

    res.json({
      users: userList,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(count),
        pages: Math.ceil(Number(count) / Number(limit))
      }
    });

  } catch (error) {
    console.error('User list error:', error);
    res.status(500).json({ 
      error: 'An error occurred fetching users',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * GET /api/admin/users/:id
 * Get user details including permissions
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID',
        code: 'INVALID_ID' 
      });
    }

    // Get user details
    const [user] = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastLoginAt: users.lastLoginAt,
      lastLoginIp: users.lastLoginIp,
      failedLoginCount: users.failedLoginCount,
      passwordUpdatedAt: users.passwordUpdatedAt,
      invitedBy: users.invitedBy,
      invitedAt: users.invitedAt,
      mfaEnabled: users.mfaEnabled,
      ipAllowlist: users.ipAllowlist
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND' 
      });
    }

    // Get custom permissions
    const permissions = await db.select({
      resource: userRoles.resource,
      permissionLevel: userRoles.permissionLevel
    })
    .from(userRoles)
    .where(and(
      eq(userRoles.userId, userId),
      eq(userRoles.role, user.role)
    ));

    // Get recent auth events
    const events = await db.select({
      eventType: authEvents.eventType,
      occurredAt: authEvents.occurredAt,
      ip: authEvents.ip,
      userAgent: authEvents.userAgent,
      details: authEvents.details
    })
    .from(authEvents)
    .where(or(
      eq(authEvents.actorUserId, userId),
      eq(authEvents.targetUserId, userId)
    )!)
    .orderBy(desc(authEvents.occurredAt))
    .limit(10);

    res.json({
      user,
      permissions: permissions.reduce((acc, p) => {
        acc[p.resource] = p.permissionLevel;
        return acc;
      }, {} as Record<string, string>),
      recentEvents: events
    });

  } catch (error) {
    console.error('User details error:', error);
    res.status(500).json({ 
      error: 'An error occurred fetching user details',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user details and permissions
 */
router.patch('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const actorUserId = (req as any).user?.id;

    if (isNaN(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID',
        code: 'INVALID_ID' 
      });
    }

    const { 
      status, 
      role, 
      permissions,
      firstName,
      lastName,
      ipAllowlist
    } = req.body;

    // Start transaction
    const updates: any = { updatedAt: new Date() };

    // Update user fields
    if (status) updates.status = status;
    if (role) updates.role = role;
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (ipAllowlist !== undefined) updates.ipAllowlist = ipAllowlist;

    // Update user
    await db.update(users)
      .set(updates)
      .where(eq(users.id, userId));

    // Update permissions if provided
    if (permissions && typeof permissions === 'object' && role) {
      // Delete existing custom permissions
      await db.delete(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.role, role)
        ));

      // Insert new permissions
      for (const [resource, level] of Object.entries(permissions)) {
        if (typeof level === 'string' && ['none', 'read', 'write', 'admin'].includes(level)) {
          await db.insert(userRoles).values({
            userId,
            role: role as any,
            resource,
            permissionLevel: level as any
          });
        }
      }
    }

    // Log the update
    await db.insert(authEvents).values({
      actorUserId,
      targetUserId: userId,
      eventType: 'user_updated',
      details: { updates, permissions },
      eventKey: `user-update-${userId}-${Date.now()}`
    });

    res.json({ 
      success: true,
      message: 'User updated successfully' 
    });

  } catch (error) {
    console.error('User update error:', error);
    res.status(500).json({ 
      error: 'An error occurred updating the user',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/admin/users/:id/unlock
 * Unlock a locked user account
 */
router.post('/:id/unlock', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const actorUserId = (req as any).user?.id;

    if (isNaN(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID',
        code: 'INVALID_ID' 
      });
    }

    // Unlock account
    await db.update(users)
      .set({ 
        status: 'active',
        failedLoginCount: 0,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    // Log unlock event
    await db.insert(authEvents).values({
      actorUserId,
      targetUserId: userId,
      eventType: 'account_unlocked',
      details: { reason: 'admin_unlock' },
      eventKey: `unlock-${userId}-${Date.now()}`
    });

    res.json({ 
      success: true,
      message: 'Account unlocked successfully' 
    });

  } catch (error) {
    console.error('Account unlock error:', error);
    res.status(500).json({ 
      error: 'An error occurred unlocking the account',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/admin/users/:id/revoke-sessions
 * Revoke all sessions for a user
 */
router.post('/:id/revoke-sessions', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const actorUserId = (req as any).user?.id;

    if (isNaN(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID',
        code: 'INVALID_ID' 
      });
    }

    // Import auth service
    const { revokeAllUserSessions } = await import('../auth/auth-service');

    // Revoke sessions
    await revokeAllUserSessions(userId, 'admin_revoke');

    // Log additional event for admin action
    await db.insert(authEvents).values({
      actorUserId,
      targetUserId: userId,
      eventType: 'session_revoked',
      details: { reason: 'admin_revoke', scope: 'all_sessions' },
      eventKey: `admin-revoke-${userId}-${Date.now()}`
    });

    res.json({ 
      success: true,
      message: 'All sessions revoked successfully' 
    });

  } catch (error) {
    console.error('Session revoke error:', error);
    res.status(500).json({ 
      error: 'An error occurred revoking sessions',
      code: 'INTERNAL_ERROR' 
    });
  }
});

export default router;