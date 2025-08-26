import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { rabbitmqConfig } from '../services/rabbitmq-config';
import { db } from '../db';
import { userRoles, roles } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { sendError } from '../utils/response-utils';

const router = Router();

// Middleware to check admin permissions
const requireAdmin = async (req: any, res: any, next: any) => {
  // Get user ID from either req.user or session
  const userId = req.user?.id || req.session?.passport?.user || req.session?.userId;
  
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
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
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};

// Apply authentication and admin check to all routes
router.use(requireAuth);
router.use(requireAdmin);

// Get current RabbitMQ prefetch configuration
router.get('/api/admin/rabbitmq/config', async (req, res) => {
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
router.put('/api/admin/rabbitmq/config', async (req, res) => {
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
router.post('/api/admin/rabbitmq/config/reset', async (req, res) => {
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
router.post('/api/admin/rabbitmq/config/recommend', async (req, res) => {
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