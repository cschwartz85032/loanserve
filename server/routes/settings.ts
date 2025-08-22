import { Router } from 'express';
import { DatabaseStorage } from '../storage';
import { neon } from '@neondatabase/serverless';
import { sendSuccess, sendError } from '../utils/response-utils';

const router = Router();
const storage = new DatabaseStorage();
const databaseUrl = process.env.DATABASE_URL || '';
const sql = neon(databaseUrl);

// Get system settings
router.get('/api/admin/settings', async (req, res) => {
  try {
    // Get password policy settings from system_settings table
    const settings = await sql`
      SELECT key, value 
      FROM system_settings 
      WHERE key LIKE 'password_policy.%'
    `;

    // Convert to nested object structure
    const passwordPolicy: any = {
      enabled: false,
      minLength: 4,
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSpecialChars: false,
      rejectWeakPasswords: false,
      useOnlineWeakPasswordCheck: false,
      enablePasswordHistory: false,
      passwordHistoryCount: 5,
      passwordExpirationDays: 90,
      enablePasswordExpiration: false
    };

    // Parse settings from database
    settings.forEach(setting => {
      const key = setting.key.replace('password_policy.', '');
      const value = setting.value;
      
      // Convert string values to appropriate types
      if (value === 'true') {
        passwordPolicy[key] = true;
      } else if (value === 'false') {
        passwordPolicy[key] = false;
      } else if (!isNaN(Number(value))) {
        passwordPolicy[key] = Number(value);
      } else {
        passwordPolicy[key] = value;
      }
    });

    res.json({ passwordPolicy });
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return errorResponse(res, 'Failed to fetch settings', 500);
  }
});

// Update system settings
router.put('/api/admin/settings', async (req, res) => {
  try {
    const { passwordPolicy } = req.body;
    
    if (!passwordPolicy) {
      return errorResponse(res, 'Invalid settings data', 400);
    }

    // Save each password policy setting
    const promises = Object.entries(passwordPolicy).map(async ([key, value]) => {
      const settingKey = `password_policy.${key}`;
      const settingValue = String(value);
      
      // Upsert the setting
      await sql`
        INSERT INTO system_settings (key, value, updated_by, updated_at)
        VALUES (${settingKey}, ${settingValue}, ${req.user?.id || 1}, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
      `;
    });

    await Promise.all(promises);

    return standardResponse(res, { success: true });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return errorResponse(res, 'Failed to update settings', 500);
  }
});

// Get current password policy (for validation)
router.get('/api/password-policy', async (req, res) => {
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

export { router as settingsRouter };