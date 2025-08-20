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
  passwordResetTokens
} from '@shared/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';

// Argon2id configuration for memory-hard hashing
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

// Common weak passwords to reject
const COMMON_WEAK_PASSWORDS = [
  'password', 'password123', '123456', '12345678', 'qwerty', 'abc123',
  'monkey', '1234567', 'letmein', 'trustno1', 'dragon', 'baseball',
  'iloveyou', 'master', 'sunshine', 'ashley', 'bailey', 'passw0rd',
  'shadow', '123123', '654321', 'superman', 'qazwsx', 'michael'
];

export interface PasswordPolicy {
  minLength: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  rejectCommonPasswords?: boolean;
}

const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  rejectCommonPasswords: true
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
 * Validate password against policy
 */
export function validatePassword(password: string, policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

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
  if (policy.rejectCommonPasswords && COMMON_WEAK_PASSWORDS.includes(password.toLowerCase())) {
    errors.push('Password is too common. Please choose a more unique password');
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
  const settings = await db.select({
    key: systemSettings.key,
    value: systemSettings.value
  })
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
    status: users.status,
    failedLoginCount: users.failedLoginCount
  })
  .from(users)
  .where(eq(users.id, userId))
  .limit(1);

  if (!user) {
    return { locked: false };
  }

  // Check if account is explicitly locked or disabled
  if (user.status === 'locked') {
    const settings = await getLockoutSettings();
    
    // Check for auto-unlock
    if (settings.autoUnlockMinutes) {
      const lockEvent = await db.select({
        occurredAt: authEvents.occurredAt
      })
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

  if (user.status === 'suspended' || user.status === 'disabled') {
    return { locked: true, reason: `Account is ${user.status}` };
  }

  return { locked: false };
}

/**
 * Record login attempt and check lockout
 */
export async function recordLoginAttempt(
  email: string,
  success: boolean,
  ip: string,
  userAgent?: string
): Promise<{ shouldLock: boolean; userId?: number }> {
  // Find user by email
  const [user] = await db.select({
    id: users.id,
    failedLoginCount: users.failedLoginCount,
    status: users.status
  })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

  const userId = user?.id;
  const outcome = success ? 'succeeded' : (user?.status === 'locked' ? 'locked' : 'failed');

  // Record the attempt
  await db.insert(loginAttempts).values({
    userId,
    emailAttempted: email,
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
      failedLoginCount: failureCount,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId));

  // Check if we should lock the account
  const shouldLock = failureCount >= settings.threshold;

  if (shouldLock && user.status !== 'locked') {
    await lockAccount(userId, 'threshold_exceeded');
  }

  return { shouldLock, userId };
}

/**
 * Lock user account
 */
async function lockAccount(userId: number, reason: string): Promise<void> {
  await db.update(users)
    .set({ 
      status: 'locked',
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
      status: 'active',
      failedLoginCount: 0,
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
  email: string,
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
    // Find user by email
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Record failed attempt
      await recordLoginAttempt(email, false, ip, userAgent);
      return { success: false, error: 'Invalid credentials' };
    }

    // Check if account is locked
    const lockStatus = await isAccountLocked(user.id);
    if (lockStatus.locked) {
      // Record attempt against locked account
      await db.insert(loginAttempts).values({
        userId: user.id,
        emailAttempted: email,
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
      const { shouldLock } = await recordLoginAttempt(email, false, ip, userAgent);
      
      if (shouldLock) {
        return { success: false, error: 'Account has been locked due to too many failed attempts' };
      }
      
      return { success: false, error: 'Invalid credentials' };
    }

    // Password is valid - reset failed login count
    await db.update(users)
      .set({ 
        failedLoginCount: 0,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id));

    // Record successful login
    await recordLoginAttempt(email, true, ip, userAgent);

    // Create session
    const sessionId = crypto.randomUUID();
    await db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      ip,
      userAgent
    });

    // Log login event
    await db.insert(authEvents).values({
      actorUserId: user.id,
      eventType: 'login_succeeded',
      ip,
      userAgent,
      details: { email },
      eventKey: `login-${user.id}-${Date.now()}`
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return { 
      success: true, 
      user: userWithoutPassword,
      sessionId 
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
  // Revoke session
  await db.update(sessions)
    .set({ 
      revokedAt: new Date(),
      revokeReason: 'user_logout'
    })
    .where(and(
      eq(sessions.id, sessionId),
      eq(sessions.userId, userId)
    ));

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
  const [session] = await db.select({
    userId: sessions.userId,
    revokedAt: sessions.revokedAt
  })
  .from(sessions)
  .where(eq(sessions.id, sessionId))
  .limit(1);

  if (!session || session.revokedAt) {
    return { valid: false };
  }

  // Update last seen
  await db.update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return { valid: true, userId: session.userId };
}

/**
 * Revoke all sessions for a user
 */
export async function revokeAllUserSessions(userId: number, reason: string): Promise<void> {
  await db.update(sessions)
    .set({ 
      revokedAt: new Date(),
      revokeReason: reason
    })
    .where(and(
      eq(sessions.userId, userId),
      sql`revoked_at IS NULL`
    ));

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
      status: users.status
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

    if (!user || user.status === 'disabled') {
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

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
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
        passwordUpdatedAt: new Date(),
        failedLoginCount: 0, // Reset failed attempts
        updatedAt: new Date()
      })
      .where(eq(users.id, tokenValidation.userId));

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
  role: string,
  invitedBy: number
): Promise<{
  success: boolean;
  token?: string;
  error?: string;
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
    const token = await generateSecureToken();
    const hashedToken = await hashToken(token);
    
    // Set expiry (7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create invited user
    const [newUser] = await db.insert(users).values({
      username: email.split('@')[0] + '_' + Date.now(), // Temporary username
      email,
      password: crypto.randomBytes(32).toString('hex'), // Random password, will be set on activation
      role: role as any,
      status: 'invited',
      firstName: '',
      lastName: ''
    })
    .returning({ id: users.id });

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
      eventType: 'user_invited',
      details: { email, role },
      eventKey: `invite-${newUser.id}-${Date.now()}`
    });

    return { success: true, token };

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

    // Get invited user
    const [invitedUser] = await db.select()
      .from(users)
      .where(and(
        eq(users.id, tokenValidation.userId),
        eq(users.status, 'invited')
      ))
      .limit(1);

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

    // Activate account
    await db.update(users)
      .set({
        username,
        password: hashedPassword,
        firstName,
        lastName,
        status: 'active',
        passwordUpdatedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, tokenValidation.userId));

    // Log activation
    await db.insert(authEvents).values({
      actorUserId: tokenValidation.userId,
      targetUserId: tokenValidation.userId,
      eventType: 'account_activated',
      details: { method: 'invitation' },
      eventKey: `activate-${tokenValidation.userId}-${Date.now()}`
    });

    // Get updated user
    const [activatedUser] = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role
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
  
  constructor(
    private maxTokens: number,
    private refillRate: number, // tokens per second
    private windowMs: number
  ) {}

  async checkLimit(key: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
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
    const expiry = this.windowMs;
    
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > expiry) {
        this.buckets.delete(key);
      }
    }
  }
}

// Create rate limiters
export const ipRateLimiter = new RateLimiter(10, 0.17, 60000); // 10 requests per minute
export const emailRateLimiter = new RateLimiter(5, 0.017, 300000); // 5 requests per 5 minutes

// Cleanup old buckets every minute
setInterval(() => {
  ipRateLimiter.cleanup();
  emailRateLimiter.cleanup();
}, 60000);