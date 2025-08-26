import { Router } from 'express';
import { rabbitmqConfig } from '../services/rabbitmq-config';
import { db } from '../db';
import { userRoles, roles, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { sendError } from '../utils/response-utils';

const router = Router();

// Combined authentication and admin check middleware
const requireAuthAndAdmin = async (req: any, res: any, next: any) => {
  try {
    // Get user ID from multiple possible sources
    const userId = req.user?.id || 
                  req.session?.passport?.user || 
                  req.session?.userId ||
                  req.userPolicy?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED' 
      });
    }

    // Ensure req.user is populated for backward compatibility
    if (!req.user) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user) {
        req.user = user;
      } else {
        return res.status(401).json({ 
          error: 'User not found',
          code: 'USER_NOT_FOUND' 
        });
      }
    }

    // Check if user has admin role using RBAC system
    const userRoleRecords = await db.select({
      roleName: roles.name
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

    const hasAdminRole = userRoleRecords.some(r => r.roleName === 'admin');
    
    if (!hasAdminRole) {
      return res.status(403).json({ 
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      code: 'AUTH_ERROR' 
    });
  }
};

// Get current RabbitMQ prefetch configuration
router.get('/api/admin/rabbitmq/config', requireAuthAndAdmin, async (req, res) => {
  try {
    const config = await rabbitmqConfig.getConfig();
    res.json({ config });
  } catch (error) {
    console.error('Error fetching RabbitMQ config:', error);
    res.status(500).json({ 
      message: 'Failed to fetch RabbitMQ configuration' 
    });
  }
});

// Update RabbitMQ prefetch configuration
router.put('/api/admin/rabbitmq/config', requireAuthAndAdmin, async (req, res) => {
  try {
    const { config } = req.body;
    
    if (!config) {
      return res.status(400).json({ 
        message: 'Configuration is required' 
      });
    }

    // Validate that all values are numbers between 1 and 1000
    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== 'number' || value < 1 || value > 1000) {
        return res.status(400).json({ 
          message: `Invalid value for ${key}: must be a number between 1 and 1000` 
        });
      }
    }

    const userId = (req as any).user?.id || (req as any).session?.passport?.user || (req as any).session?.userId;
    await rabbitmqConfig.saveConfig(config, userId);
    
    res.json({ 
      success: true,
      message: 'Configuration saved successfully' 
    });
  } catch (error) {
    console.error('Error saving RabbitMQ config:', error);
    res.status(500).json({ 
      message: 'Failed to save RabbitMQ configuration' 
    });
  }
});

// Reset RabbitMQ configuration to defaults
router.post('/api/admin/rabbitmq/config/reset', requireAuthAndAdmin, async (req, res) => {
  try {
    const userId = (req as any).user?.id || (req as any).session?.passport?.user || (req as any).session?.userId;
    await rabbitmqConfig.resetToDefaults(userId);
    
    res.json({ 
      success: true,
      message: 'Configuration reset to defaults' 
    });
  } catch (error) {
    console.error('Error resetting RabbitMQ config:', error);
    res.status(500).json({ 
      message: 'Failed to reset RabbitMQ configuration' 
    });
  }
});

// Get prefetch recommendation based on processing time
router.post('/api/admin/rabbitmq/config/recommend', requireAuthAndAdmin, async (req, res) => {
  try {
    const { avgProcessingTimeMs, networkRoundTripMs } = req.body;
    
    if (!avgProcessingTimeMs || avgProcessingTimeMs < 0) {
      return res.status(400).json({ 
        message: 'Average processing time is required' 
      });
    }

    const recommended = rabbitmqConfig.getRecommendedPrefetch(
      avgProcessingTimeMs,
      networkRoundTripMs || 10
    );
    
    res.json({ 
      recommended,
      processingTimeMs: avgProcessingTimeMs,
      networkRoundTripMs: networkRoundTripMs || 10,
      ratio: avgProcessingTimeMs / (networkRoundTripMs || 10)
    });
  } catch (error) {
    console.error('Error getting recommendation:', error);
    res.status(500).json({ 
      message: 'Failed to calculate recommendation' 
    });
  }
});

export default router;