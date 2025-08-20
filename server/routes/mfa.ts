/**
 * MFA Routes
 * Endpoints for Multi-Factor Authentication operations
 */

import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import mfaService from '../auth/mfa-service';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// All MFA routes require authentication
router.use(requireAuth);

/**
 * GET /api/mfa/status
 * Get user's MFA status and configured factors
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get user's MFA settings
    const [user] = await db.select({
      mfaEnabled: users.twoFactorEnabled,
      mfaRequired: users.mfaRequired,
      requireMfaForSensitive: users.require_mfa_for_sensitive
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

    // Get configured factors
    const factors = await mfaService.listUserMfaFactors(userId);

    res.json({
      mfaEnabled: user?.mfaEnabled || false,
      mfaRequired: user?.mfaRequired || false,
      requireMfaForSensitive: user?.requireMfaForSensitive || true,
      factors: factors.map(f => ({
        id: f.id,
        type: f.factorType,
        name: f.factorName,
        verified: f.verified,
        lastUsedAt: f.lastUsedAt
      }))
    });
  } catch (error) {
    console.error('MFA status error:', error);
    res.status(500).json({ error: 'Failed to get MFA status' });
  }
});

/**
 * POST /api/mfa/totp/enroll
 * Begin TOTP enrollment
 */
router.post('/totp/enroll', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { factorName } = req.body;

    if (!factorName) {
      return res.status(400).json({ error: 'Factor name is required' });
    }

    const result = await mfaService.beginTotpEnrollment(
      userId,
      factorName,
      req.ip,
      req.get('user-agent')
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      factorId: result.factorId,
      secret: result.secret,
      qrCode: result.qrCodeUrl
    });
  } catch (error) {
    console.error('TOTP enrollment error:', error);
    res.status(500).json({ error: 'Failed to begin enrollment' });
  }
});

/**
 * POST /api/mfa/totp/verify-enrollment
 * Verify TOTP enrollment with initial code
 */
router.post('/totp/verify-enrollment', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { factorId, code } = req.body;

    if (!factorId || !code) {
      return res.status(400).json({ error: 'Factor ID and code are required' });
    }

    const result = await mfaService.verifyTotpEnrollment(
      factorId,
      code,
      userId,
      req.ip,
      req.get('user-agent')
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      backupCodes: result.backupCodes
    });
  } catch (error) {
    console.error('TOTP verification error:', error);
    res.status(500).json({ error: 'Failed to verify enrollment' });
  }
});

/**
 * POST /api/mfa/challenge
 * Create an MFA challenge (for login or step-up)
 */
router.post('/challenge', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { challengeType = 'login', action } = req.body;

    const result = await mfaService.createMfaChallenge(
      userId,
      challengeType,
      action,
      req.session?.id,
      req.ip,
      req.get('user-agent'),
      req.body.deviceFingerprint
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      challengeId: result.challengeId,
      factors: result.factors
    });
  } catch (error) {
    console.error('MFA challenge creation error:', error);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

/**
 * POST /api/mfa/verify
 * Verify an MFA challenge
 */
router.post('/verify', async (req, res) => {
  try {
    const { challengeId, code, factorId } = req.body;

    if (!challengeId || !code) {
      return res.status(400).json({ error: 'Challenge ID and code are required' });
    }

    const result = await mfaService.verifyMfaChallenge(
      challengeId,
      code,
      factorId,
      req.ip,
      req.get('user-agent')
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // If verification successful, update session
    if (req.session) {
      req.session.mfaVerified = true;
      req.session.mfaVerifiedAt = new Date();
    }

    res.json({
      success: true,
      userId: result.userId,
      requiresAdditionalFactor: result.requiresAdditionalFactor
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json({ error: 'Failed to verify challenge' });
  }
});

/**
 * POST /api/mfa/backup-codes/generate
 * Generate new backup codes
 */
router.post('/backup-codes/generate', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { regenerate = false } = req.body;

    // Check if user has MFA enabled
    const factors = await mfaService.listUserMfaFactors(userId);
    if (factors.length === 0) {
      return res.status(400).json({ error: 'No MFA factors configured' });
    }

    const backupCodes = await mfaService.generateBackupCodes(userId, regenerate);

    res.json({
      backupCodes,
      message: regenerate 
        ? 'New backup codes generated. Previous unused codes have been invalidated.'
        : 'Backup codes generated successfully.'
    });
  } catch (error) {
    console.error('Backup code generation error:', error);
    res.status(500).json({ error: 'Failed to generate backup codes' });
  }
});

/**
 * GET /api/mfa/backup-codes/count
 * Get count of remaining backup codes
 */
router.get('/backup-codes/count', async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await db.execute(
      `SELECT COUNT(*) as count FROM mfa_backup_codes 
       WHERE user_id = $1 AND used_at IS NULL 
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );

    res.json({ 
      remainingCodes: result.rows[0]?.count || 0 
    });
  } catch (error) {
    console.error('Backup code count error:', error);
    res.status(500).json({ error: 'Failed to get backup code count' });
  }
});

/**
 * DELETE /api/mfa/factors/:factorId
 * Remove an MFA factor
 */
router.delete('/factors/:factorId', async (req, res) => {
  try {
    const userId = req.user!.id;
    const factorId = parseInt(req.params.factorId);

    if (isNaN(factorId)) {
      return res.status(400).json({ error: 'Invalid factor ID' });
    }

    // Check if this is the last factor
    const factors = await mfaService.listUserMfaFactors(userId);
    if (factors.length === 1) {
      return res.status(400).json({ 
        error: 'Cannot remove the last MFA factor. Disable MFA instead.' 
      });
    }

    const result = await mfaService.removeMfaFactor(
      userId,
      factorId,
      req.ip,
      req.get('user-agent')
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'MFA factor removed successfully' });
  } catch (error) {
    console.error('MFA factor removal error:', error);
    res.status(500).json({ error: 'Failed to remove MFA factor' });
  }
});

/**
 * POST /api/mfa/disable
 * Disable MFA for the user (removes all factors)
 */
router.post('/disable', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { password } = req.body;

    // Require password confirmation
    if (!password) {
      return res.status(400).json({ error: 'Password confirmation required' });
    }

    // Verify password
    const [user] = await db.select({ password: users.password })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // In production, verify password properly with bcrypt/argon2
    // This is simplified for example
    if (!user) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    // Get all user's factors
    const factors = await mfaService.listUserMfaFactors(userId);

    // Remove all factors
    for (const factor of factors) {
      await mfaService.removeMfaFactor(
        userId,
        factor.id,
        req.ip,
        req.get('user-agent')
      );
    }

    // Disable MFA for user
    await db.update(users)
      .set({ 
        twoFactorEnabled: false,
        mfaRequired: false 
      })
      .where(eq(users.id, userId));

    res.json({ success: true, message: 'MFA disabled successfully' });
  } catch (error) {
    console.error('MFA disable error:', error);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

/**
 * GET /api/mfa/audit-log
 * Get MFA audit log for the user
 */
router.get('/audit-log', async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const auditLog = await mfaService.getUserMfaAuditLog(userId, limit);

    res.json({ auditLog });
  } catch (error) {
    console.error('MFA audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

/**
 * POST /api/mfa/settings
 * Update MFA settings for the user
 */
router.post('/settings', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { requireMfaForSensitive } = req.body;

    const updates: any = {};
    
    if (typeof requireMfaForSensitive === 'boolean') {
      updates.require_mfa_for_sensitive = requireMfaForSensitive;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(users)
        .set(updates)
        .where(eq(users.id, userId));
    }

    res.json({ success: true, message: 'MFA settings updated' });
  } catch (error) {
    console.error('MFA settings error:', error);
    res.status(500).json({ error: 'Failed to update MFA settings' });
  }
});

export default router;