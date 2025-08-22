/**
 * Authentication Service
 * Handles password hashing, validation, lockout logic, and session management
 */

import argon2 from 'argon2';
import crypto from 'crypto';
import { db } from '../db';
import {
  users,
  loginAttempts,
  authEvents,
  sessions,
  systemSettings,
  passwordResetTokens,
  userRoles,
  roles
} from '@shared/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL || '';
const dbSql = neon(databaseUrl);

// Argon2id configuration for memory-hard hashing
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

export interface PasswordPolicy {
  minLength: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  rejectCommonPasswords?: boolean;
  preventPasswordReuse?: boolean;
  passwordHistoryCount?: number;
}

// Development-friendly defaults
const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 4,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSpecialChars: false,
  rejectCommonPasswords: false,
  preventPasswordReuse: false,
  passwordHistoryCount: 5
};

/**
 * Hash a password using Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_CONFIG);
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

/**
 * Fetch password policy from database
 */
async function getPasswordPolicy(): Promise<PasswordPolicy> {
  try {
    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'PASSWORD_POLICY'));
    
    if (settings.length > 0 && settings[0].value) {
      const policy = JSON.parse(settings[0].value as string);
      return { ...DEFAULT_PASSWORD_POLICY, ...policy };
    }
  } catch (error) {
    console.error('Error fetching password policy:', error);
  }
  
  return DEFAULT_PASSWORD_POLICY;
}

/**
 * Check if password exists in user's password history
 */
async function checkPasswordHistory(userId: number, password: string, historyCount: number): Promise<boolean> {
  if (historyCount <= 0) return false;
  
  try {
    // Get the last N password hashes for this user
    const history = await dbSql`
      SELECT password_hash 
      FROM password_history 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${historyCount}
    `;
    
    // Check if the new password matches any in history
    for (const record of history) {
      const matches = await argon2.verify(record.password_hash, password, ARGON2_CONFIG);
      if (matches) {
        return true; // Password found in history
      }
    }
  } catch (error) {
    console.error('Error checking password history:', error);
  }
  
  return false; // Password not in history
}

/**
 * Add password to user's history
 */
export async function addPasswordToHistory(userId: number, passwordHash: string): Promise<void> {
  try {
    await dbSql`
      INSERT INTO password_history (user_id, password_hash)
      VALUES (${userId}, ${passwordHash})
      ON CONFLICT (user_id, password_hash) DO NOTHING
    `;
    
    // Clean up old history entries (keep only the configured amount)
    const policy = await getPasswordPolicy();
    const maxHistory = policy.passwordHistoryCount || 5;
    
    await dbSql`
      DELETE FROM password_history
      WHERE user_id = ${userId}
      AND created_at < (
        SELECT created_at
        FROM password_history
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1 OFFSET ${maxHistory}
      )
    `;
  } catch (error) {
    console.error('Error adding password to history:', error);
  }
}

/**
 * Validate password against policy
 */
export async function validatePassword(
  password: string, 
  userId?: number,
  policy?: PasswordPolicy
): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  
  // Get policy from database if not provided
  if (!policy) {
    policy = await getPasswordPolicy();
  }

  // Check minimum length
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters long`);
  }

  // Check character requirements
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (policy.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check common passwords
  if (policy.rejectCommonPasswords) {
    // Generate common passwords dynamically based on patterns
    const commonPatterns = [
      password.toLowerCase() === 'password',
      /^password\d+$/.test(password.toLowerCase()),
      /^\d{6,8}$/.test(password),
      /^[a-z]{6,8}$/.test(password.toLowerCase()),
      /^qwerty/i.test(password),
      /^admin/i.test(password),
      /^letmein/i.test(password),
      /^welcome/i.test(password),
      /^123456/i.test(password)
    ];
    
    if (commonPatterns.some(pattern => pattern === true)) {
      errors.push('Password is too common. Please choose a more unique password');
    }
  }

  // Check password history if user ID provided
  if (userId && policy.preventPasswordReuse && policy.passwordHistoryCount && policy.passwordHistoryCount > 0) {
    const isInHistory = await checkPasswordHistory(userId, password, policy.passwordHistoryCount);
    if (isInHistory) {
      errors.push(`Password has been used recently. Please choose a different password`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get system settings for lockout configuration
 */
async function getLockoutSettings(): Promise<{
  threshold: number;
  windowMinutes: number;
  autoUnlockMinutes: number | null;
}> {
  const settings = await db
    .select()
    .from(systemSettings)
    .where(sql`key IN ('LOCKOUT_THRESHOLD', 'LOCKOUT_WINDOW_MINUTES', 'LOCKOUT_AUTO_UNLOCK_MINUTES')`);

  const settingsMap = settings.reduce((acc, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {} as Record<string, any>);

  return {
    threshold: settingsMap.LOCKOUT_THRESHOLD || 5,
    windowMinutes: settingsMap.LOCKOUT_WINDOW_MINUTES || 15,
    autoUnlockMinutes: settingsMap.LOCKOUT_AUTO_UNLOCK_MINUTES || 30
  };
}

/**
 * Check if account is locked
 */
async function isAccountLocked(userId: number): Promise<{ locked: boolean; reason?: string }> {
  const [user] = await db.select({
    isActive: users.isActive,
    lockedUntil: users.lockedUntil,
    failedLoginAttempts: users.failedLoginAttempts
  })
  .from(users)
  .where(eq(users.id, userId))
  .limit(1);

  if (!user) {
    return { locked: false };
  }

  // Check if account is explicitly locked
  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
  if (isLocked) {
    const settings = await getLockoutSettings();
    
    // Check for auto-unlock
    if (settings.autoUnlockMinutes) {
      const lockEvent = await db
        .select()
        .from(authEvents)
        .where(and(
          eq(authEvents.targetUserId, userId),
          eq(authEvents.eventType, 'account_locked')
        ))
        .orderBy(desc(authEvents.occurredAt))
        .limit(1);

      if (lockEvent.length > 0) {
        const lockTime = new Date(lockEvent[0].occurredAt);
        const unlockTime = new Date(lockTime.getTime() + settings.autoUnlockMinutes * 60000);
        
        if (new Date() >= unlockTime) {
          // Auto-unlock the account
          await unlockAccount(userId, 'auto_unlock');
          return { locked: false };
        }
      }
    }
    
    return { locked: true, reason: 'Account is locked due to too many failed login attempts' };
  }

  if (!user.isActive) {
    return { locked: true, reason: 'Account is disabled' };
  }

  return { locked: false };
}

/**
 * Record login attempt and check lockout
 */
export async function recordLoginAttempt(
  emailOrUsername: string,
  success: boolean,
  ip: string,
  userAgent?: string
): Promise<{ shouldLock: boolean; userId?: number }> {
  // Find user by email or username
  const userQuery = emailOrUsername.includes('@') 
    ? eq(users.email, emailOrUsername)
    : eq(users.username, emailOrUsername);
    
  const [user] = await db
    .select()
    .from(users)
    .where(userQuery)
    .limit(1);

  const userId = user?.id;
  const isLocked = user?.lockedUntil && new Date(user.lockedUntil) > new Date();
  const outcome = success ? 'succeeded' : (isLocked ? 'locked' : 'failed');

  // Record the attempt
  await db.insert(loginAttempts).values({
    userId,
    emailAttempted: user?.email || emailOrUsername,
    ip,
    userAgent,
    outcome: outcome as any,
    reason: !success ? 'Invalid credentials' : null
  });

  if (!user || success) {
    return { shouldLock: false, userId };
  }

  // Get lockout settings
  const settings = await getLockoutSettings();
  
  // Count recent failed attempts within the window
  const windowStart = new Date(Date.now() - settings.windowMinutes * 60000);
  const recentFailures = await db.select({
    count: sql<number>`COUNT(*)`
  })
  .from(loginAttempts)
  .where(and(
    eq(loginAttempts.userId, userId),
    eq(loginAttempts.outcome, 'failed'),
    gte(loginAttempts.attemptedAt, windowStart)
  ));

  const failureCount = Number(recentFailures[0]?.count || 0);

  // Update failed login count on user
  await db.update(users)
    .set({ 
      failedLoginAttempts: failureCount,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId));

  // Check if we should lock the account
  const shouldLock = failureCount >= settings.threshold;

  if (shouldLock && (!user.lockedUntil || new Date(user.lockedUntil) < new Date())) {
    await lockAccount(userId, 'threshold_exceeded');
  }

  return { shouldLock, userId };
}

/**
 * Lock user account
 */
async function lockAccount(userId: number, reason: string): Promise<void> {
  const lockDuration = 30; // Lock for 30 minutes
  await db.update(users)
    .set({ 
      lockedUntil: new Date(Date.now() + lockDuration * 60000),
      updatedAt: new Date()
    })
    .where(eq(users.id, userId));

  await db.insert(authEvents).values({
    targetUserId: userId,
    eventType: 'account_locked',
    details: { reason },
    eventKey: `lock-${userId}-${Date.now()}`
  });
}

/**
 * Unlock user account
 */
async function unlockAccount(userId: number, reason: string): Promise<void> {
  await db.update(users)
    .set({ 
      lockedUntil: null,
      failedLoginAttempts: 0,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId));

  await db.insert(authEvents).values({
    targetUserId: userId,
    eventType: 'account_unlocked',
    details: { reason },
    eventKey: `unlock-${userId}-${Date.now()}`
  });
}

/**
 * Perform login
 */
export async function login(
  emailOrUsername: string,
  password: string,
  ip: string,
  userAgent?: string
): Promise<{
  success: boolean;
  user?: any;
  sessionId?: string;
  error?: string;
}> {
  try {
    // Find user by email or username - select all fields
    const userQuery = emailOrUsername.includes('@') 
      ? eq(users.email, emailOrUsername)
      : eq(users.username, emailOrUsername);
      
    const [user] = await db
      .select()
      .from(users)
      .where(userQuery)
      .limit(1);

    if (!user) {
      // Record failed attempt
      await recordLoginAttempt(emailOrUsername, false, ip, userAgent);
      return { success: false, error: 'Invalid credentials' };
    }

    // Check if account is locked
    const lockStatus = await isAccountLocked(user.id);
    if (lockStatus.locked) {
      // Record attempt against locked account
      await db.insert(loginAttempts).values({
        userId: user.id,
        emailAttempted: user.email,
        ip,
        userAgent,
        outcome: 'locked',
        reason: lockStatus.reason
      });
      return { success: false, error: lockStatus.reason || 'Account is locked' };
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password);
    
    if (!passwordValid) {
      // Record failed attempt and check for lockout
      const { shouldLock } = await recordLoginAttempt(user.email, false, ip, userAgent);
      
      if (shouldLock) {
        return { success: false, error: 'Account has been locked due to too many failed attempts' };
      }
      
      return { success: false, error: 'Invalid credentials' };
    }

    // Check if IP is in trusted list (for logging/audit purposes only, not blocking)
    const { checkIpAllowlist, logIpDecision } = await import('./ip-allowlist-service');
    const ipCheck = await checkIpAllowlist(user.id, ip);
    
    // Log IP decision for audit trail
    await logIpDecision(user.id, ip, ipCheck.allowed, ipCheck.reason || '', ipCheck.matchedEntry);
    
    // Note: IP allowlist is non-restrictive - we track trusted IPs but don't block untrusted ones
    // This allows users to login from any IP without constant re-authentication

    // Password is valid and IP is allowed - reset failed login count
    await db.update(users)
      .set({ 
        failedLoginAttempts: 0,
        lastLogin: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id));

    // Record successful login
    await recordLoginAttempt(user.email, true, ip, userAgent);

    // Create session with standard express-session structure
    const sessionSid = `sess:${crypto.randomUUID()}`; // Generate sid for session store
    const expireTime = new Date(Date.now() + 86400000); // 24 hours from now
    
    // Insert session into the sessions table with standard express-session columns only
    await db.execute(sql`
      INSERT INTO sessions (sid, sess, expire)
      VALUES (
        ${sessionSid},
        ${JSON.stringify({
          cookie: { 
            originalMaxAge: 86400000, // 24 hours
            expires: expireTime.toISOString(),
            httpOnly: true,
            path: '/'
          },
          userId: user.id,
          passport: { user: user.id }
        })}::json,
        ${expireTime}
      )
    `);

    // Log login event with IP allowlist info
    await db.insert(authEvents).values({
      actorUserId: user.id,
      eventType: 'login_succeeded',
      ip,
      userAgent,
      details: { 
        email: user.email,
        username: user.username,
        ipAllowlistMatch: ipCheck.matchedEntry || null,
        hasAllowlist: ipCheck.hasAllowlist
      },
      eventKey: `login-${user.id}-${Date.now()}`
    });

    // Return user without password  
    const { password: _, ...userWithoutPassword } = user;
    return { 
      success: true, 
      user: userWithoutPassword,
      sessionId: sessionSid 
    };

  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'An error occurred during login' };
  }
}

/**
 * Perform logout
 */
export async function logout(sessionId: string, userId: number): Promise<void> {
  // Delete session (standard express-session approach)
  await db.execute(sql`
    DELETE FROM sessions 
    WHERE sid = ${sessionId}
  `);

  // Log logout event
  await db.insert(authEvents).values({
    actorUserId: userId,
    eventType: 'session_revoked',
    details: { sessionId, reason: 'user_logout' },
    eventKey: `logout-${userId}-${Date.now()}`
  });
}

/**
 * Validate session
 */
export async function validateSession(sessionId: string): Promise<{
  valid: boolean;
  userId?: number;
}> {
  const result = await db.execute(sql`
    SELECT sess, expire 
    FROM sessions 
    WHERE sid = ${sessionId}
    AND expire > NOW()
    LIMIT 1
  `);

  if (!result.rows || result.rows.length === 0) {
    return { valid: false };
  }

  const session = result.rows[0] as any;
  const sessionData = typeof session.sess === 'string' 
    ? JSON.parse(session.sess) 
    : session.sess;

  return { valid: true, userId: sessionData.userId };
}

/**
 * Revoke all sessions for a user
 */
export async function revokeAllUserSessions(userId: number, reason: string): Promise<void> {
  // Delete all sessions containing this userId
  await db.execute(sql`
    DELETE FROM sessions 
    WHERE sess::text LIKE '%"userId":${userId}%'
  `);

  await db.insert(authEvents).values({
    targetUserId: userId,
    eventType: 'session_revoked',
    details: { reason, scope: 'all_sessions' },
    eventKey: `revoke-all-${userId}-${Date.now()}`
  });
}

/**
 * Generate secure token for password reset or invitation
 */
export async function generateSecureToken(): Promise<string> {
  // Generate 32 bytes of random data and encode as base64url
  const buffer = crypto.randomBytes(32);
  return buffer.toString('base64url');
}

/**
 * Hash token for storage
 */
export async function hashToken(token: string): Promise<string> {
  // Use SHA-256 for token hashing (not passwords)
  const hash = crypto.createHash('sha256');
  hash.update(token);
  return hash.digest('hex');
}

/**
 * Create password reset token
 */
export async function createPasswordResetToken(email: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  try {
    // Always return success to prevent account enumeration
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      isActive: users.isActive
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

    if (!user || !user.isActive) {
      // Don't reveal if user exists
      return { success: true };
    }

    // Generate token
    const token = await generateSecureToken();
    const hashedToken = await hashToken(token);
    
    // Set expiry (1 hour)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Store token
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashedToken,
      expiresAt
    });

    // Log event
    await db.insert(authEvents).values({
      targetUserId: user.id,
      eventType: 'password_reset_requested',
      details: { email },
      eventKey: `reset-request-${user.id}-${Date.now()}`
    });

    return { success: true, token };

  } catch (error) {
    console.error('Password reset token error:', error);
    // Always return success to prevent enumeration
    return { success: true };
  }
}

/**
 * Check if a password reset token is valid without marking it as used
 */
export async function checkPasswordResetToken(token: string): Promise<{
  valid: boolean;
  userId?: number;
  error?: string;
}> {
  try {
    const hashedToken = await hashToken(token);
    
    // Find valid token
    const [resetToken] = await db.select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt
    })
    .from(passwordResetTokens)
    .where(and(
      eq(passwordResetTokens.tokenHash, hashedToken),
      sql`used_at IS NULL`,
      gte(passwordResetTokens.expiresAt, new Date())
    ))
    .limit(1);

    if (!resetToken) {
      return { valid: false, error: 'Invalid or expired token' };
    }

    // Don't mark as used - just check validity
    return { valid: true, userId: resetToken.userId };

  } catch (error) {
    console.error('Token check error:', error);
    return { valid: false, error: 'Token check failed' };
  }
}

/**
 * Validate and use password reset token
 */
export async function validatePasswordResetToken(token: string): Promise<{
  valid: boolean;
  userId?: number;
  error?: string;
}> {
  try {
    const hashedToken = await hashToken(token);
    
    // Find valid token
    const [resetToken] = await db.select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt
    })
    .from(passwordResetTokens)
    .where(and(
      eq(passwordResetTokens.tokenHash, hashedToken),
      sql`used_at IS NULL`,
      gte(passwordResetTokens.expiresAt, new Date())
    ))
    .limit(1);

    if (!resetToken) {
      return { valid: false, error: 'Invalid or expired token' };
    }

    // Mark token as used (single use)
    await db.update(passwordResetTokens)
      .set({ 
        usedAt: new Date()
      })
      .where(eq(passwordResetTokens.id, resetToken.id));

    return { valid: true, userId: resetToken.userId };

  } catch (error) {
    console.error('Token validation error:', error);
    return { valid: false, error: 'Token validation failed' };
  }
}

/**
 * Reset password with token
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Validate token
    const tokenValidation = await validatePasswordResetToken(token);
    if (!tokenValidation.valid || !tokenValidation.userId) {
      return { success: false, error: tokenValidation.error || 'Invalid token' };
    }

    // Validate new password with history check
    const passwordValidation = await validatePassword(newPassword, tokenValidation.userId);
    if (!passwordValidation.valid) {
      return { 
        success: false, 
        error: 'Password does not meet requirements',
        errors: passwordValidation.errors 
      } as any;
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await db.update(users)
      .set({ 
        password: hashedPassword,
        failedLoginAttempts: 0, // Reset failed attempts
        updatedAt: new Date()
      })
      .where(eq(users.id, tokenValidation.userId));
    
    // Add password to history
    await addPasswordToHistory(tokenValidation.userId, hashedPassword);

    // Revoke all sessions
    await revokeAllUserSessions(tokenValidation.userId, 'password_reset');

    // Log event
    await db.insert(authEvents).values({
      targetUserId: tokenValidation.userId,
      eventType: 'password_reset_completed',
      details: { method: 'reset_token' },
      eventKey: `reset-complete-${tokenValidation.userId}-${Date.now()}`
    });

    return { success: true };

  } catch (error) {
    console.error('Password reset error:', error);
    return { success: false, error: 'Password reset failed' };
  }
}

/**
 * Create invitation token
 */
export async function createInvitationToken(
  email: string,
  roleIdOrName: string,
  invitedBy: number
): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  invitationUrl?: string;
}> {
  try {
    // Check if user already exists
    const [existingUser] = await db.select({
      id: users.id
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

    if (existingUser) {
      return { success: false, error: 'User already exists' };
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Set expiry (7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create invited user with proper fields
    const [newUser] = await db.insert(users).values({
      username: email.split('@')[0] + '_' + Date.now(), // Temporary username
      email,
      password: await argon2.hash(crypto.randomBytes(32).toString('hex')), // Random hashed password
      role: 'lender' as any, // Default enum role (required by DB constraint, but RBAC will be used for actual permissions)
      emailVerified: false,
      isActive: true, // Active but not verified
      firstName: '',
      lastName: ''
    })
    .returning({ id: users.id });

    // If roleIdOrName is provided, assign the role
    if (roleIdOrName) {
      // Check if it's a roleId (UUID format) or role name
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roleIdOrName);
      
      if (isUuid) {
        // It's a role ID, assign directly
        await db.insert(userRoles).values({
          userId: newUser.id,
          roleId: roleIdOrName
        });
      } else {
        // It's a role name, find the role first
        const [role] = await db.select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, roleIdOrName))
          .limit(1);
        
        if (role) {
          await db.insert(userRoles).values({
            userId: newUser.id,
            roleId: role.id
          });
        }
      }
    }

    // Store invitation token
    await db.insert(passwordResetTokens).values({
      userId: newUser.id,
      tokenHash: hashedToken,
      expiresAt
    });

    // Log event
    await db.insert(authEvents).values({
      actorUserId: invitedBy,
      targetUserId: newUser.id,
      eventType: 'user_created',
      details: { email, role: roleIdOrName, invited: true },
      ip: null,
      userAgent: null
    });

    const invitationUrl = `/reset-password?token=${token}`;

    return { success: true, token, invitationUrl };

  } catch (error) {
    console.error('Invitation token error:', error);
    return { success: false, error: 'Failed to create invitation' };
  }
}

/**
 * Activate user account with invitation token
 */
export async function activateAccountWithToken(
  token: string,
  username: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<{
  success: boolean;
  user?: any;
  error?: string;
}> {
  try {
    // Validate token (reuses password reset token table)
    const tokenValidation = await validatePasswordResetToken(token);
    if (!tokenValidation.valid || !tokenValidation.userId) {
      return { success: false, error: tokenValidation.error || 'Invalid token' };
    }

    // Get invited user - use raw SQL since status field is in DB but not in schema
    const result = await db.execute(
      sql`SELECT * FROM users WHERE id = ${tokenValidation.userId} AND status = 'invited' LIMIT 1`
    );

    const invitedUser = result.rows?.[0];
    if (!invitedUser) {
      return { success: false, error: 'Invalid invitation' };
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return { 
        success: false, 
        error: 'Password does not meet requirements',
        errors: passwordValidation.errors 
      } as any;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Activate account - use raw SQL since status field is in DB but not in schema
    await db.execute(
      sql`UPDATE users 
          SET username = ${username},
              password = ${hashedPassword},
              first_name = ${firstName},
              last_name = ${lastName},
              status = 'active',
              password_updated_at = ${new Date()},
              updated_at = ${new Date()},
              is_active = true
          WHERE id = ${tokenValidation.userId}`
    );

    // Log activation
    await db.insert(authEvents).values({
      actorUserId: tokenValidation.userId,
      targetUserId: tokenValidation.userId,
      eventType: 'user_updated',
      details: { method: 'invitation', action: 'account_activated' },
      eventKey: `activate-${tokenValidation.userId}-${Date.now()}`,
      ip: null,
      userAgent: null
    });

    // Get updated user
    const [activatedUser] = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName
      // role field removed - using RBAC system
    })
    .from(users)
    .where(eq(users.id, tokenValidation.userId))
    .limit(1);

    return { success: true, user: activatedUser };

  } catch (error) {
    console.error('Account activation error:', error);
    return { success: false, error: 'Account activation failed' };
  }
}

/**
 * Rate limiting with token bucket algorithm
 */
export class RateLimiter {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();
  private lastCleanup: number = Date.now();
  private cleanupInterval: number = 30000; // Run cleanup every 30 seconds
  private maxBuckets: number = 10000; // Maximum number of buckets to prevent unbounded growth
  
  constructor(
    private maxTokens: number,
    private refillRate: number, // tokens per second
    private windowMs: number
  ) {}

  async checkLimit(key: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    
    // Auto-cleanup if needed (every 30 seconds or if too many buckets)
    if (now - this.lastCleanup > this.cleanupInterval || this.buckets.size > this.maxBuckets) {
      this.cleanup();
    }
    
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((timePassed / 1000) * this.refillRate);
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return { allowed: true };
    }

    // Calculate retry after
    const tokensNeeded = 1;
    const timeToWait = (tokensNeeded / this.refillRate) * 1000;
    
    return { 
      allowed: false, 
      retryAfter: Math.ceil(timeToWait / 1000) // in seconds
    };
  }

  // Clean up old buckets periodically
  cleanup(): void {
    const now = Date.now();
    const expiry = this.windowMs * 2; // Keep buckets for 2x the window to be safe
    let removed = 0;
    
    // Convert to array to avoid iterator issues
    const entries = Array.from(this.buckets.entries());
    for (const [key, bucket] of entries) {
      if (now - bucket.lastRefill > expiry) {
        this.buckets.delete(key);
        removed++;
      }
    }
    
    // If still too many buckets, remove oldest ones
    if (this.buckets.size > this.maxBuckets) {
      const sortedEntries = entries
        .sort((a, b) => a[1].lastRefill - b[1].lastRefill)
        .slice(0, this.buckets.size - this.maxBuckets);
      
      for (const [key] of sortedEntries) {
        this.buckets.delete(key);
        removed++;
      }
    }
    
    this.lastCleanup = now;
    
    if (removed > 0) {
      console.log(`[RateLimiter] Cleaned up ${removed} old buckets, ${this.buckets.size} remaining`);
    }
  }
  
  // Get current bucket count for monitoring
  getBucketCount(): number {
    return this.buckets.size;
  }
}

// Create rate limiters
export const ipRateLimiter = new RateLimiter(10, 0.17, 60000); // 10 requests per minute
export const emailRateLimiter = new RateLimiter(5, 0.017, 300000); // 5 requests per 5 minutes

// Store interval ID to allow cleanup
let cleanupIntervalId: NodeJS.Timeout | null = null;

// Only set up cleanup interval if not already running
if (!cleanupIntervalId) {
  cleanupIntervalId = setInterval(() => {
    ipRateLimiter.cleanup();
    emailRateLimiter.cleanup();
    
    // Log bucket counts periodically for monitoring
    if (Math.random() < 0.1) { // Log 10% of the time to avoid spam
      console.log(`[RateLimiter] IP buckets: ${ipRateLimiter.getBucketCount()}, Email buckets: ${emailRateLimiter.getBucketCount()}`);
    }
  }, 60000);
}

// Clean up on process exit
process.on('SIGINT', () => {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  process.exit(0);
});