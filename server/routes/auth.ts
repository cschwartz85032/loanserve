/**
 * Authentication Routes
 * Login, logout, and session management endpoints
 */

import { Router } from 'express';
import { 
  login,
  logout,
  validateSession,
  validatePassword,
  hashPassword,
  ipRateLimiter,
  emailRateLimiter
} from '../auth/auth-service';
import { db } from '../db';
import { users, authEvents } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS' 
      });
    }

    const ip = req.ip || 'unknown';
    const userAgent = req.get('user-agent');

    // Check IP rate limit
    const ipLimit = await ipRateLimiter.checkLimit(`ip-${ip}`);
    if (!ipLimit.allowed) {
      return res.status(429).json({ 
        error: 'Too many login attempts from this IP',
        code: 'IP_RATE_LIMIT',
        retryAfter: ipLimit.retryAfter 
      });
    }

    // Check email rate limit
    const emailLimit = await emailRateLimiter.checkLimit(`email-${email.toLowerCase()}`);
    if (!emailLimit.allowed) {
      return res.status(429).json({ 
        error: 'Too many login attempts for this email',
        code: 'EMAIL_RATE_LIMIT',
        retryAfter: emailLimit.retryAfter 
      });
    }

    // Attempt login (email can be either email or username)
    const result = await login(email, password, ip, userAgent);

    if (!result.success) {
      // Log failed attempt for audit
      await db.insert(authEvents).values({
        eventType: 'login_failed',
        ip,
        userAgent,
        details: { email, error: result.error },
        eventKey: `login-failed-${email}-${Date.now()}`
      });

      return res.status(401).json({ 
        error: result.error || 'Invalid credentials',
        code: 'LOGIN_FAILED' 
      });
    }

    // Set session in request
    if (req.session) {
      (req.session as any).userId = result.user.id;
      (req.session as any).sessionId = result.sessionId;
    }

    // Return success with user data
    res.json({
      success: true,
      user: result.user,
      sessionId: result.sessionId
    });

  } catch (error) {
    console.error('Login endpoint error:', error);
    res.status(500).json({ 
      error: 'An error occurred during login',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/auth/logout
 * End user session
 */
router.post('/logout', async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    const sessionId = (req.session as any)?.sessionId;

    if (!userId || !sessionId) {
      return res.status(400).json({ 
        error: 'No active session',
        code: 'NO_SESSION' 
      });
    }

    // Perform logout
    await logout(sessionId, userId);

    // Clear session
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
        }
      });
    }

    res.json({ 
      success: true,
      message: 'Logged out successfully' 
    });

  } catch (error) {
    console.error('Logout endpoint error:', error);
    res.status(500).json({ 
      error: 'An error occurred during logout',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * GET /api/auth/session
 * Check current session status
 */
router.get('/session', async (req, res) => {
  try {
    const sessionId = (req.session as any)?.sessionId;

    if (!sessionId) {
      return res.json({ 
        authenticated: false 
      });
    }

    const session = await validateSession(sessionId);

    if (!session.valid) {
      // Clear invalid session
      if (req.session) {
        req.session.destroy(() => {});
      }
      
      return res.json({ 
        authenticated: false 
      });
    }

    // Get user details
    const [user] = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role
    })
    .from(users)
    .where(eq(users.id, session.userId!))
    .limit(1);

    res.json({ 
      authenticated: true,
      user: user || null,
      sessionId 
    });

  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({ 
      error: 'An error occurred checking session',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED' 
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current and new passwords are required',
        code: 'MISSING_PASSWORDS' 
      });
    }

    // Validate new password
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'New password does not meet requirements',
        code: 'INVALID_PASSWORD',
        errors: validation.errors 
      });
    }

    // Get current user
    const [user] = await db.select({
      id: users.id,
      password: users.password
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

    // Verify current password
    const { verifyPassword } = await import('../auth/auth-service');
    const isValid = await verifyPassword(currentPassword, user.password);

    if (!isValid) {
      return res.status(401).json({ 
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD' 
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await db.update(users)
      .set({ 
        password: hashedPassword,
        passwordUpdatedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    // Log password change
    await db.insert(authEvents).values({
      actorUserId: userId,
      targetUserId: userId,
      eventType: 'password_reset_completed',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: { method: 'change_password' },
      eventKey: `password-change-${userId}-${Date.now()}`
    });

    res.json({ 
      success: true,
      message: 'Password changed successfully' 
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ 
      error: 'An error occurred changing password',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/auth/validate-password
 * Check if a password meets policy requirements
 */
router.post('/validate-password', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ 
      error: 'Password is required',
      code: 'MISSING_PASSWORD' 
    });
  }

  const validation = validatePassword(password);

  res.json({
    valid: validation.valid,
    errors: validation.errors
  });
});

/**
 * POST /api/auth/password-reset/request
 * Request password reset token
 */
router.post('/password-reset/request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required',
        code: 'MISSING_EMAIL' 
      });
    }

    // Import email service
    const { 
      createPasswordResetToken,
      sendPasswordResetEmail,
      sendGenericResponseEmail 
    } = await import('../auth/auth-service');
    const emailService = await import('../auth/email-service');

    // Create reset token
    const result = await createPasswordResetToken(email);

    // Send email
    if (result.token) {
      // User exists, send reset email
      await emailService.sendPasswordResetEmail(email, result.token);
    } else {
      // User doesn't exist or is disabled, send generic response
      await emailService.sendGenericResponseEmail(email);
    }

    // Always return success to prevent account enumeration
    res.json({ 
      success: true,
      message: 'If an account exists with this email, you will receive password reset instructions.' 
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      error: 'An error occurred processing your request',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/auth/password-reset/confirm
 * Reset password with token
 */
router.post('/password-reset/confirm', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        error: 'Token and new password are required',
        code: 'MISSING_PARAMS' 
      });
    }

    // Import auth service
    const { resetPasswordWithToken } = await import('../auth/auth-service');

    // Reset password
    const result = await resetPasswordWithToken(token, newPassword);

    if (!result.success) {
      return res.status(400).json({ 
        error: result.error || 'Password reset failed',
        code: 'RESET_FAILED',
        errors: (result as any).errors
      });
    }

    res.json({ 
      success: true,
      message: 'Password reset successfully. Please login with your new password.' 
    });

  } catch (error) {
    console.error('Password reset confirm error:', error);
    res.status(500).json({ 
      error: 'An error occurred resetting your password',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/auth/validate-token
 * Validate an invitation or reset token
 */
router.post('/validate-token', async (req, res) => {
  try {
    const { token, type = 'invitation' } = req.body;

    if (!token) {
      return res.status(400).json({ 
        error: 'Token is required',
        code: 'MISSING_TOKEN' 
      });
    }

    // Import required modules
    const { passwordResetTokens, users } = await import('@shared/schema');
    const crypto = await import('crypto');
    
    // Hash the token to match storage
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find the token
    const [tokenRecord] = await db.select({
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashedToken))
    .limit(1);
    
    if (!tokenRecord) {
      return res.status(400).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN' 
      });
    }
    
    // Check if already used
    if (tokenRecord.usedAt) {
      return res.status(400).json({ 
        error: 'Token has already been used',
        code: 'TOKEN_ALREADY_USED' 
      });
    }
    
    // Check if expired
    if (new Date(tokenRecord.expiresAt) < new Date()) {
      return res.status(400).json({ 
        error: 'Token has expired',
        code: 'EXPIRED_TOKEN' 
      });
    }
    
    // Get user info
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName
    })
    .from(users)
    .where(eq(users.id, tokenRecord.userId))
    .limit(1);
    
    if (!user) {
      return res.status(400).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND' 
      });
    }
    
    res.json({ 
      success: true,
      valid: true,
      user: {
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
    
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({ 
      error: 'An error occurred validating the token',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/auth/activate
 * Activate account with invitation token
 */
router.post('/activate', async (req, res) => {
  try {
    const { token, username, password, firstName, lastName } = req.body;

    if (!token || !username || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        error: 'All fields are required',
        code: 'MISSING_FIELDS' 
      });
    }

    // Import auth service
    const { activateAccountWithToken } = await import('../auth/auth-service');

    // Activate account
    const result = await activateAccountWithToken(
      token,
      username,
      password,
      firstName,
      lastName
    );

    if (!result.success) {
      return res.status(400).json({ 
        error: result.error || 'Account activation failed',
        code: 'ACTIVATION_FAILED',
        errors: (result as any).errors
      });
    }

    res.json({ 
      success: true,
      message: 'Account activated successfully. You can now login.',
      user: result.user
    });

  } catch (error) {
    console.error('Account activation error:', error);
    res.status(500).json({ 
      error: 'An error occurred activating your account',
      code: 'INTERNAL_ERROR' 
    });
  }
});

export default router;