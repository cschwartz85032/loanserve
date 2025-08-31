import { Router } from 'express';
import { DatabaseStorage } from '../storage';
import { neon } from '@neondatabase/serverless';
import { sendSuccess, sendError } from '../utils/response-utils';
import { requireAuth, requirePermission } from '../auth/middleware';
import { PermissionLevel } from '../auth/policy-engine';

const router = Router();
const storage = new DatabaseStorage();
const databaseUrl = process.env.DATABASE_URL || '';
const sql = neon(databaseUrl);

// Import RabbitMQ service for connection management
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';

// Get system settings
router.get('/admin/settings', requireAuth, requirePermission('system_settings', PermissionLevel.ADMIN), async (req, res) => {
  try {
    // Get all settings from system_settings table
    const settings = await sql`
      SELECT category, key, value 
      FROM system_settings 
      WHERE category IN ('password_policy', 'lockout_policy', 'session_settings', 'caller_verification')
    `;

    // Initialize default settings
    const passwordPolicy: any = {
      enabled: false,
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      preventPasswordReuse: true,
      passwordHistoryCount: 5,
      passwordExpiryDays: 90
    };

    const lockoutPolicy: any = {
      enabled: false,
      maxFailedAttempts: 5,
      lockoutDurationMinutes: 30,
      lockoutStrategy: 'progressive'
    };

    const sessionSettings: any = {
      sessionTimeoutMinutes: 30,
      extendSessionOnActivity: true,
      requireReauthForSensitive: true,
      allowMultipleSessions: false,
      maxConcurrentSessions: 1
    };

    const callerVerification: any = {
      enabled: false,
      requireForPIIAccess: true,
      verificationMethods: {
        lastFourSSN: true,
        dateOfBirth: true,
        accountNumber: false,
        securityQuestions: false,
        twoFactorAuth: false
      },
      maxVerificationAttempts: 3,
      lockoutDurationMinutes: 15,
      requireReVerificationAfterMinutes: 60,
      applicableRoles: ['borrower', 'lender', 'investor', 'escrow_officer', 'legal', 'servicer'],
      exemptRoles: ['admin'],
      auditAllAccess: true,
      notifyOnFailedVerification: true
    };

    // Parse settings from database
    settings.forEach((setting: any) => {
      const category = setting.category;
      const key = setting.key;
      const value = setting.value;
      
      let targetPolicy: any = null;
      if (category === 'password_policy') targetPolicy = passwordPolicy;
      else if (category === 'lockout_policy') targetPolicy = lockoutPolicy;
      else if (category === 'session_settings') targetPolicy = sessionSettings;
      else if (category === 'caller_verification') targetPolicy = callerVerification;
      
      if (targetPolicy && key in targetPolicy) {
        // Handle nested objects and arrays
        if (typeof value === 'object' && value !== null) {
          targetPolicy[key] = value;
        } else if (value === 'true') {
          targetPolicy[key] = true;
        } else if (value === 'false') {
          targetPolicy[key] = false;
        } else if (!isNaN(Number(value))) {
          targetPolicy[key] = Number(value);
        } else {
          targetPolicy[key] = value;
        }
      }
    });

    res.json({ 
      passwordPolicy, 
      lockoutPolicy, 
      sessionSettings,
      callerVerification 
    });
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return sendError(res, 'Failed to fetch settings', 500);
  }
});

// Update system settings
router.put('/admin/settings', requireAuth, requirePermission('system_settings', PermissionLevel.ADMIN), async (req, res) => {
  try {
    const { passwordPolicy, lockoutPolicy, sessionSettings, callerVerification } = req.body;
    
    const promises: Promise<any>[] = [];
    
    // Save password policy settings
    if (passwordPolicy) {
      Object.entries(passwordPolicy).forEach(([key, value]) => {
        const settingValue = typeof value === 'object' ? value : String(value);
        promises.push(sql`
          INSERT INTO system_settings (category, key, value, updated_by, updated_at)
          VALUES ('password_policy', ${key}, ${JSON.stringify(settingValue)}, ${(req as any).user?.id || 1}, NOW())
          ON CONFLICT (category, key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_by = EXCLUDED.updated_by,
              updated_at = EXCLUDED.updated_at
        `);
      });
    }
    
    // Save lockout policy settings
    if (lockoutPolicy) {
      Object.entries(lockoutPolicy).forEach(([key, value]) => {
        const settingValue = typeof value === 'object' ? value : String(value);
        promises.push(sql`
          INSERT INTO system_settings (category, key, value, updated_by, updated_at)
          VALUES ('lockout_policy', ${key}, ${JSON.stringify(settingValue)}, ${(req as any).user?.id || 1}, NOW())
          ON CONFLICT (category, key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_by = EXCLUDED.updated_by,
              updated_at = EXCLUDED.updated_at
        `);
      });
    }
    
    // Save session settings
    if (sessionSettings) {
      Object.entries(sessionSettings).forEach(([key, value]) => {
        const settingValue = typeof value === 'object' ? value : String(value);
        promises.push(sql`
          INSERT INTO system_settings (category, key, value, updated_by, updated_at)
          VALUES ('session_settings', ${key}, ${JSON.stringify(settingValue)}, ${(req as any).user?.id || 1}, NOW())
          ON CONFLICT (category, key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_by = EXCLUDED.updated_by,
              updated_at = EXCLUDED.updated_at
        `);
      });
    }
    
    // Save caller verification settings
    if (callerVerification) {
      Object.entries(callerVerification).forEach(([key, value]) => {
        const settingValue = typeof value === 'object' ? value : String(value);
        promises.push(sql`
          INSERT INTO system_settings (category, key, value, updated_by, updated_at)
          VALUES ('caller_verification', ${key}, ${JSON.stringify(settingValue)}, ${(req as any).user?.id || 1}, NOW())
          ON CONFLICT (category, key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_by = EXCLUDED.updated_by,
              updated_at = EXCLUDED.updated_at
        `);
      });
    }

    await Promise.all(promises);

    return sendSuccess(res, { success: true });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return sendError(res, 'Failed to update settings', 500);
  }
});

// Get current password policy (for validation)
router.get('/password-policy', async (req, res) => {
  try {
    const settings = await sql`
      SELECT key, value 
      FROM system_settings 
      WHERE key LIKE 'password_policy.%'
    `;

    const policy: any = {
      enabled: false,
      minLength: 4,
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSpecialChars: false,
      rejectWeakPasswords: false
    };

    settings.forEach(setting => {
      const key = setting.key.replace('password_policy.', '');
      const value = setting.value;
      
      if (value === 'true') {
        policy[key] = true;
      } else if (value === 'false') {
        policy[key] = false;
      } else if (!isNaN(Number(value))) {
        policy[key] = Number(value);
      }
    });

    res.json(policy);
  } catch (error: any) {
    // Return default policy if settings not found
    res.json({
      enabled: false,
      minLength: 4,
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSpecialChars: false,
      rejectWeakPasswords: false
    });
  }
});

// Emergency endpoint to force close all RabbitMQ connections
router.post('/admin/rabbitmq/force-disconnect', requireAuth, requirePermission('system_settings', PermissionLevel.ADMIN), async (req, res) => {
  try {
    console.log('[Admin] Emergency RabbitMQ connection cleanup requested');
    
    // 1. Shutdown enhanced RabbitMQ service
    const rabbitmqService = getEnhancedRabbitMQService();
    await rabbitmqService.forceDisconnectAll();
    
    // 2. Shutdown the main rabbit service
    try {
      const { rabbit } = await import('../messaging/index');
      await rabbit.shutdown();
      console.log('[Admin] Main rabbit service shutdown complete');
    } catch (error) {
      console.log('[Admin] Main rabbit service shutdown error (expected):', error.message);
    }
    
    // 3. Shutdown the old RabbitMQ service if it exists
    try {
      const { getRabbitMQService } = await import('../services/rabbitmq');
      const legacyService = getRabbitMQService();
      if (legacyService) {
        await legacyService.disconnect();
        console.log('[Admin] Legacy RabbitMQ service shutdown complete');
      }
    } catch (error) {
      console.log('[Admin] Legacy RabbitMQ service shutdown error (expected):', error.message);
    }
    
    // 4. Nuclear option: Create maximum connections to force CloudAMQP to close idle ones
    console.log('[Admin] Forcing CloudAMQP connection limit to close stale connections...');
    const connections: any[] = [];
    try {
      const amqp = await import('amqplib');
      const url = process.env.CLOUDAMQP_URL || '';
      
      // Create connections up to CloudAMQP's limit to force closure of old ones
      for (let i = 0; i < 50; i++) {
        try {
          // Use unified client for connection testing
          const { rabbitmqClient } = await import('../services/rabbitmq-unified');
          const conn = await rabbitmqClient.getAdminConnection();
          connections.push(conn);
          console.log(`[Admin] Created pressure connection ${i + 1}`);
        } catch (error) {
          console.log(`[Admin] Hit connection limit at ${i + 1} connections`);
          break;
        }
      }
      
      // Immediately close all pressure connections  
      for (const conn of connections) {
        try {
          if (conn !== (await import('../services/rabbitmq-unified')).rabbitmqClient.getAdminConnection()) {
            await conn.close();
          }
        } catch (error) {
          // Ignore close errors
        }
      }
      console.log('[Admin] Closed all pressure connections');
      
    } catch (error) {
      console.log('[Admin] Connection pressure failed (expected):', error.message);
    }
    
    // 5. Wait for cleanup to take effect
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const stats = rabbitmqService.getConnectionPoolStats();
    console.log('[Admin] Post-cleanup connection stats:', stats);
    
    return sendSuccess(res, { 
      message: 'Emergency RabbitMQ cleanup completed - used connection pressure to force closure of stale connections',
      connectionStats: stats,
      shutdownTargets: ['Enhanced Service', 'Main Service', 'Legacy Service', 'Connection Pressure Cleanup']
    });
  } catch (error) {
    console.error('[Admin] Failed to force disconnect RabbitMQ connections:', error);
    return sendError(res, 'Failed to force disconnect connections', 500);
  }
});

export { router as settingsRouter };