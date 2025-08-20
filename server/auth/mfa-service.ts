/**
 * MFA Service
 * Handles TOTP enrollment, verification, backup codes, and device trust
 */

import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { db } from '../db';
import {
  userMfaFactors,
  mfaBackupCodes,
  mfaChallenges,
  mfaAuditLog,
  users
} from '@shared/schema';
import { eq, and, gt, isNull, desc } from 'drizzle-orm';

// Configuration
const MFA_CONFIG = {
  // TOTP configuration
  totp: {
    issuer: 'LoanServe Pro',
    algorithm: 'sha1',
    digits: 6,
    period: 30,
    window: 2, // Accept codes from 2 time steps before and after
    encoding: 'base32' as const
  },
  // Challenge configuration
  challenge: {
    expiryMinutes: 10,
    maxAttempts: 5,
    lockoutMinutes: 15
  },
  // Backup codes
  backup: {
    count: 10,
    length: 8,
    expiryDays: 365
  }
};

/**
 * Generate a secure random string
 */
function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a value using SHA-256
 */
function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Encrypt sensitive data (TOTP secret) at rest
 */
function encryptData(data: string): string {
  // In production, use proper encryption with KMS or similar
  // This is a simplified example
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(
    process.env.ENCRYPTION_KEY || 'default-key-change-in-production',
    'salt',
    32
  );
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    encrypted,
    authTag: authTag.toString('hex'),
    iv: iv.toString('hex')
  });
}

/**
 * Decrypt sensitive data
 */
function decryptData(encryptedData: string): string {
  try {
    const { encrypted, authTag, iv } = JSON.parse(encryptedData);
    
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(
      process.env.ENCRYPTION_KEY || 'default-key-change-in-production',
      'salt',
      32
    );
    
    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Begin TOTP enrollment for a user
 */
export async function beginTotpEnrollment(
  userId: number,
  factorName: string,
  ip?: string,
  userAgent?: string
): Promise<{
  success: boolean;
  secret?: string;
  qrCodeUrl?: string;
  factorId?: number;
  error?: string;
}> {
  try {
    // Check if user already has an active TOTP factor
    const existingFactors = await db.select()
      .from(userMfaFactors)
      .where(and(
        eq(userMfaFactors.userId, userId),
        eq(userMfaFactors.factorType, 'totp'),
        eq(userMfaFactors.isActive, true)
      ));

    if (existingFactors.length >= 3) {
      return { success: false, error: 'Maximum number of TOTP devices reached' };
    }

    // Get user email for TOTP label
    const [user] = await db.select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `${MFA_CONFIG.totp.issuer}:${user.email}`,
      issuer: MFA_CONFIG.totp.issuer,
      length: 32
    });

    // Encrypt the secret for storage
    const encryptedSecret = encryptData(secret.base32);

    // Create unverified MFA factor
    const [factor] = await db.insert(userMfaFactors).values({
      userId,
      factorType: 'totp',
      factorName,
      totpSecret: encryptedSecret,
      totpIssuer: MFA_CONFIG.totp.issuer,
      totpAlgorithm: MFA_CONFIG.totp.algorithm.toUpperCase(),
      totpDigits: MFA_CONFIG.totp.digits,
      totpPeriod: MFA_CONFIG.totp.period,
      verified: false,
      enrolledIp: ip,
      enrolledUserAgent: userAgent,
      isActive: false // Not active until verified
    }).returning({ id: userMfaFactors.id });

    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    // Log enrollment attempt
    await db.insert(mfaAuditLog).values({
      userId,
      factorId: factor.id,
      eventType: 'enrollment_started',
      eventDetails: { factorName, factorType: 'totp' },
      ip,
      userAgent,
      success: true
    });

    return {
      success: true,
      secret: secret.base32, // Return for manual entry
      qrCodeUrl,
      factorId: factor.id
    };

  } catch (error) {
    console.error('TOTP enrollment error:', error);
    
    // Log failure
    await db.insert(mfaAuditLog).values({
      userId,
      eventType: 'enrollment_failed',
      eventDetails: { factorName, factorType: 'totp' },
      ip,
      userAgent,
      success: false,
      failureReason: error.message
    });

    return { success: false, error: 'Failed to begin enrollment' };
  }
}

/**
 * Verify TOTP enrollment
 */
export async function verifyTotpEnrollment(
  factorId: number,
  code: string,
  userId: number,
  ip?: string,
  userAgent?: string
): Promise<{
  success: boolean;
  backupCodes?: string[];
  error?: string;
}> {
  try {
    // Get the unverified factor
    const [factor] = await db.select()
      .from(userMfaFactors)
      .where(and(
        eq(userMfaFactors.id, factorId),
        eq(userMfaFactors.userId, userId),
        eq(userMfaFactors.verified, false)
      ))
      .limit(1);

    if (!factor) {
      return { success: false, error: 'Invalid enrollment session' };
    }

    // Decrypt the secret
    const secret = decryptData(factor.totpSecret!);

    // Verify the code
    const verified = speakeasy.totp.verify({
      secret,
      encoding: MFA_CONFIG.totp.encoding,
      token: code,
      window: MFA_CONFIG.totp.window,
      algorithm: factor.totpAlgorithm!.toLowerCase() as any
    });

    if (!verified) {
      // Log failed attempt
      await db.insert(mfaAuditLog).values({
        userId,
        factorId,
        eventType: 'enrollment_verification_failed',
        eventDetails: { reason: 'invalid_code' },
        ip,
        userAgent,
        success: false,
        failureReason: 'Invalid verification code'
      });

      return { success: false, error: 'Invalid verification code' };
    }

    // Mark factor as verified and active
    await db.update(userMfaFactors)
      .set({
        verified: true,
        verifiedAt: new Date(),
        isActive: true
      })
      .where(eq(userMfaFactors.id, factorId));

    // Enable MFA for the user
    await db.update(users)
      .set({ twoFactorEnabled: true })
      .where(eq(users.id, userId));

    // Generate backup codes
    const backupCodes = await generateBackupCodes(userId);

    // Log successful enrollment
    await db.insert(mfaAuditLog).values({
      userId,
      factorId,
      eventType: 'enrollment_completed',
      eventDetails: { factorName: factor.factorName },
      ip,
      userAgent,
      success: true
    });

    return { success: true, backupCodes };

  } catch (error) {
    console.error('TOTP verification error:', error);
    return { success: false, error: 'Failed to verify enrollment' };
  }
}

/**
 * Generate backup codes for a user
 */
export async function generateBackupCodes(
  userId: number,
  regenerate: boolean = false
): Promise<string[]> {
  try {
    // If regenerating, mark existing codes as expired
    if (regenerate) {
      await db.update(mfaBackupCodes)
        .set({ expiresAt: new Date() })
        .where(and(
          eq(mfaBackupCodes.userId, userId),
          isNull(mfaBackupCodes.usedAt)
        ));
    }

    const codes: string[] = [];
    const codeRecords = [];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + MFA_CONFIG.backup.expiryDays);

    // Generate codes
    for (let i = 0; i < MFA_CONFIG.backup.count; i++) {
      const code = crypto.randomBytes(MFA_CONFIG.backup.length)
        .toString('hex')
        .toUpperCase()
        .substring(0, MFA_CONFIG.backup.length);
      
      codes.push(code);
      codeRecords.push({
        userId,
        codeHash: hashValue(code),
        expiresAt
      });
    }

    // Store hashed codes
    await db.insert(mfaBackupCodes).values(codeRecords);

    return codes;

  } catch (error) {
    console.error('Backup code generation error:', error);
    throw new Error('Failed to generate backup codes');
  }
}

/**
 * Create an MFA challenge for login or step-up authentication
 */
export async function createMfaChallenge(
  userId: number,
  challengeType: 'login' | 'step_up' | 'enrollment',
  action?: string,
  sessionId?: string,
  ip?: string,
  userAgent?: string,
  deviceFingerprint?: string
): Promise<{
  success: boolean;
  challengeId?: string;
  factors?: Array<{ id: number; factorName: string; factorType: string }>;
  error?: string;
}> {
  try {
    // Get user's active MFA factors
    const factors = await db.select({
      id: userMfaFactors.id,
      factorName: userMfaFactors.factorName,
      factorType: userMfaFactors.factorType
    })
    .from(userMfaFactors)
    .where(and(
      eq(userMfaFactors.userId, userId),
      eq(userMfaFactors.isActive, true),
      eq(userMfaFactors.verified, true)
    ));

    if (factors.length === 0 && challengeType !== 'enrollment') {
      return { success: false, error: 'No MFA factors configured' };
    }

    // Check for existing pending challenges
    const existingChallenges = await db.select()
      .from(mfaChallenges)
      .where(and(
        eq(mfaChallenges.userId, userId),
        eq(mfaChallenges.status, 'pending'),
        gt(mfaChallenges.expiresAt, new Date())
      ))
      .limit(1);

    if (existingChallenges.length > 0) {
      // Return existing challenge
      return {
        success: true,
        challengeId: existingChallenges[0].challengeId,
        factors
      };
    }

    // Create new challenge
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + MFA_CONFIG.challenge.expiryMinutes);

    await db.insert(mfaChallenges).values({
      challengeId,
      userId,
      sessionId,
      challengeType,
      action,
      status: 'pending',
      ip,
      userAgent,
      deviceFingerprint,
      expiresAt
    });

    // Log challenge creation
    await db.insert(mfaAuditLog).values({
      userId,
      challengeId,
      eventType: 'challenge_created',
      eventDetails: { challengeType, action },
      ip,
      userAgent,
      deviceFingerprint,
      success: true
    });

    return {
      success: true,
      challengeId,
      factors
    };

  } catch (error) {
    console.error('MFA challenge creation error:', error);
    return { success: false, error: 'Failed to create MFA challenge' };
  }
}

/**
 * Verify an MFA challenge with TOTP code
 */
export async function verifyMfaChallenge(
  challengeId: string,
  code: string,
  factorId?: number,
  ip?: string,
  userAgent?: string
): Promise<{
  success: boolean;
  userId?: number;
  requiresAdditionalFactor?: boolean;
  error?: string;
}> {
  try {
    // Get the challenge
    const [challenge] = await db.select()
      .from(mfaChallenges)
      .where(and(
        eq(mfaChallenges.challengeId, challengeId),
        eq(mfaChallenges.status, 'pending'),
        gt(mfaChallenges.expiresAt, new Date())
      ))
      .limit(1);

    if (!challenge) {
      return { success: false, error: 'Invalid or expired challenge' };
    }

    // Check rate limiting
    if (challenge.lockedUntil && challenge.lockedUntil > new Date()) {
      return { success: false, error: 'Too many failed attempts. Please try again later.' };
    }

    // Check if it's a backup code (8 hex characters)
    const isBackupCode = /^[A-F0-9]{8}$/i.test(code);

    let verified = false;
    let usedFactorId: number | null = null;

    if (isBackupCode) {
      // Verify backup code
      const codeHash = hashValue(code.toUpperCase());
      const [backupCode] = await db.select()
        .from(mfaBackupCodes)
        .where(and(
          eq(mfaBackupCodes.userId, challenge.userId),
          eq(mfaBackupCodes.codeHash, codeHash),
          isNull(mfaBackupCodes.usedAt),
          gt(mfaBackupCodes.expiresAt, new Date())
        ))
        .limit(1);

      if (backupCode) {
        // Mark backup code as used
        await db.update(mfaBackupCodes)
          .set({
            usedAt: new Date(),
            usedIp: ip
          })
          .where(eq(mfaBackupCodes.id, backupCode.id));

        verified = true;

        // Log backup code usage
        await db.insert(mfaAuditLog).values({
          userId: challenge.userId,
          challengeId,
          eventType: 'backup_code_used',
          eventDetails: { codeId: backupCode.id },
          ip,
          userAgent,
          success: true
        });
      }
    } else {
      // Verify TOTP code
      let factors;
      
      if (factorId) {
        // Use specific factor
        factors = await db.select()
          .from(userMfaFactors)
          .where(and(
            eq(userMfaFactors.id, factorId),
            eq(userMfaFactors.userId, challenge.userId),
            eq(userMfaFactors.factorType, 'totp'),
            eq(userMfaFactors.isActive, true)
          ))
          .limit(1);
      } else {
        // Try all user's TOTP factors
        factors = await db.select()
          .from(userMfaFactors)
          .where(and(
            eq(userMfaFactors.userId, challenge.userId),
            eq(userMfaFactors.factorType, 'totp'),
            eq(userMfaFactors.isActive, true)
          ));
      }

      // Try each factor until one verifies
      for (const factor of factors) {
        const secret = decryptData(factor.totpSecret!);
        
        const isValid = speakeasy.totp.verify({
          secret,
          encoding: MFA_CONFIG.totp.encoding,
          token: code,
          window: MFA_CONFIG.totp.window,
          algorithm: factor.totpAlgorithm!.toLowerCase() as any
        });

        if (isValid) {
          verified = true;
          usedFactorId = factor.id;

          // Update factor last used
          await db.update(userMfaFactors)
            .set({ lastUsedAt: new Date() })
            .where(eq(userMfaFactors.id, factor.id));

          break;
        }
      }
    }

    if (!verified) {
      // Increment attempts
      const newAttempts = (challenge.attempts || 0) + 1;
      const updates: any = { 
        attempts: newAttempts,
        lastAttemptAt: new Date()
      };

      // Lock if max attempts reached
      if (newAttempts >= MFA_CONFIG.challenge.maxAttempts) {
        const lockedUntil = new Date();
        lockedUntil.setMinutes(lockedUntil.getMinutes() + MFA_CONFIG.challenge.lockoutMinutes);
        updates.lockedUntil = lockedUntil;
        updates.status = 'failed';
      }

      await db.update(mfaChallenges)
        .set(updates)
        .where(eq(mfaChallenges.id, challenge.id));

      // Log failed attempt
      await db.insert(mfaAuditLog).values({
        userId: challenge.userId,
        factorId: usedFactorId,
        challengeId,
        eventType: 'challenge_verification_failed',
        eventDetails: { attempts: newAttempts },
        ip,
        userAgent,
        success: false,
        failureReason: 'Invalid code'
      });

      return { 
        success: false, 
        error: newAttempts >= MFA_CONFIG.challenge.maxAttempts 
          ? 'Maximum attempts exceeded. Challenge locked.'
          : 'Invalid verification code' 
      };
    }

    // Update challenge
    await db.update(mfaChallenges)
      .set({
        status: 'verified',
        verifiedAt: new Date(),
        completedFactors: 1,
        factorId: usedFactorId
      })
      .where(eq(mfaChallenges.id, challenge.id));

    // Log successful verification
    await db.insert(mfaAuditLog).values({
      userId: challenge.userId,
      factorId: usedFactorId,
      challengeId,
      eventType: 'challenge_verified',
      eventDetails: { challengeType: challenge.challengeType },
      ip,
      userAgent,
      success: true
    });

    return {
      success: true,
      userId: challenge.userId,
      requiresAdditionalFactor: false // Could be extended for multi-factor requirements
    };

  } catch (error) {
    console.error('MFA challenge verification error:', error);
    return { success: false, error: 'Failed to verify challenge' };
  }
}

/**
 * Check if a user requires MFA
 */
export async function userRequiresMfa(
  userId: number,
  action?: string
): Promise<boolean> {
  try {
    const [user] = await db.select({
      mfaEnabled: users.twoFactorEnabled,
      mfaRequired: users.mfaRequired,
      requireMfaForSensitive: users.require_mfa_for_sensitive
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

    if (!user) return false;

    // Always require MFA if mfaRequired is true
    if (user.mfaRequired) return true;

    // Require MFA if enabled and this is a sensitive action
    const sensitiveActions = [
      'transfer_funds',
      'change_password',
      'add_user',
      'delete_user',
      'modify_permissions',
      'export_data'
    ];

    if (user.mfaEnabled && user.requireMfaForSensitive && action && sensitiveActions.includes(action)) {
      return true;
    }

    // Otherwise, MFA is optional but enabled
    return user.mfaEnabled || false;

  } catch (error) {
    console.error('MFA requirement check error:', error);
    return false;
  }
}

/**
 * List user's MFA factors
 */
export async function listUserMfaFactors(userId: number) {
  return db.select({
    id: userMfaFactors.id,
    factorType: userMfaFactors.factorType,
    factorName: userMfaFactors.factorName,
    verified: userMfaFactors.verified,
    lastUsedAt: userMfaFactors.lastUsedAt,
    enrolledAt: userMfaFactors.enrolledAt
  })
  .from(userMfaFactors)
  .where(and(
    eq(userMfaFactors.userId, userId),
    eq(userMfaFactors.isActive, true)
  ))
  .orderBy(desc(userMfaFactors.enrolledAt));
}

/**
 * Remove an MFA factor
 */
export async function removeMfaFactor(
  userId: number,
  factorId: number,
  ip?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify factor belongs to user
    const [factor] = await db.select()
      .from(userMfaFactors)
      .where(and(
        eq(userMfaFactors.id, factorId),
        eq(userMfaFactors.userId, userId)
      ))
      .limit(1);

    if (!factor) {
      return { success: false, error: 'Factor not found' };
    }

    // Mark as inactive instead of deleting
    await db.update(userMfaFactors)
      .set({ isActive: false })
      .where(eq(userMfaFactors.id, factorId));

    // Check if user has any remaining active factors
    const remainingFactors = await db.select()
      .from(userMfaFactors)
      .where(and(
        eq(userMfaFactors.userId, userId),
        eq(userMfaFactors.isActive, true)
      ));

    // If no factors remain, disable MFA for user
    if (remainingFactors.length === 0) {
      await db.update(users)
        .set({ twoFactorEnabled: false })
        .where(eq(users.id, userId));
    }

    // Log removal
    await db.insert(mfaAuditLog).values({
      userId,
      factorId,
      eventType: 'factor_removed',
      eventDetails: { factorName: factor.factorName },
      ip,
      userAgent,
      success: true
    });

    return { success: true };

  } catch (error) {
    console.error('MFA factor removal error:', error);
    return { success: false, error: 'Failed to remove factor' };
  }
}

/**
 * Get MFA audit log for a user
 */
export async function getUserMfaAuditLog(
  userId: number,
  limit: number = 50
) {
  return db.select()
    .from(mfaAuditLog)
    .where(eq(mfaAuditLog.userId, userId))
    .orderBy(desc(mfaAuditLog.createdAt))
    .limit(limit);
}

export default {
  beginTotpEnrollment,
  verifyTotpEnrollment,
  generateBackupCodes,
  createMfaChallenge,
  verifyMfaChallenge,
  userRequiresMfa,
  listUserMfaFactors,
  removeMfaFactor,
  getUserMfaAuditLog
};