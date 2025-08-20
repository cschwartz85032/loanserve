/**
 * IP Allowlist Management Routes
 * Endpoints for managing user IP allowlists
 */

import { Router } from 'express';
import { requireAuth, requirePermission } from '../auth/middleware';
import {
  addIpToAllowlist,
  removeIpFromAllowlist,
  updateIpAllowlistEntry,
  getUserIpAllowlist,
  bulkUpdateIpAllowlist
} from '../auth/ip-allowlist-service';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/ip-allowlist
 * Get current user's IP allowlist
 */
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const includeInactive = req.query.includeInactive === 'true';
    
    const allowlist = await getUserIpAllowlist(userId, includeInactive);
    
    res.json({
      entries: allowlist,
      count: allowlist.length,
      currentIp: req.ip
    });
    
  } catch (error) {
    console.error('Get IP allowlist error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch IP allowlist',
      code: 'FETCH_FAILED' 
    });
  }
});

/**
 * POST /api/ip-allowlist
 * Add IP to current user's allowlist
 */
router.post('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { cidr, label } = req.body;
    
    if (!cidr) {
      return res.status(400).json({ 
        error: 'CIDR is required',
        code: 'MISSING_CIDR' 
      });
    }
    
    const result = await addIpToAllowlist(userId, cidr, label, userId);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        code: 'ADD_FAILED' 
      });
    }
    
    res.json({
      success: true,
      id: result.id,
      message: 'IP added to allowlist'
    });
    
  } catch (error) {
    console.error('Add IP to allowlist error:', error);
    res.status(500).json({ 
      error: 'Failed to add IP to allowlist',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * PUT /api/ip-allowlist/:id
 * Update IP allowlist entry
 */
router.put('/:id', async (req, res) => {
  try {
    const entryId = req.params.id;
    const userId = (req as any).user?.id;
    const { cidr, label, isActive } = req.body;
    
    const updates: any = {};
    if (cidr !== undefined) updates.cidr = cidr;
    if (label !== undefined) updates.label = label;
    if (isActive !== undefined) updates.isActive = isActive;
    
    const result = await updateIpAllowlistEntry(entryId, updates, userId);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        code: 'UPDATE_FAILED' 
      });
    }
    
    res.json({
      success: true,
      message: 'IP allowlist entry updated'
    });
    
  } catch (error) {
    console.error('Update IP allowlist error:', error);
    res.status(500).json({ 
      error: 'Failed to update IP allowlist entry',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * DELETE /api/ip-allowlist/:id
 * Remove IP from allowlist
 */
router.delete('/:id', async (req, res) => {
  try {
    const entryId = req.params.id;
    const userId = (req as any).user?.id;
    
    const result = await removeIpFromAllowlist(entryId, userId);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        code: 'REMOVE_FAILED' 
      });
    }
    
    res.json({
      success: true,
      message: 'IP removed from allowlist'
    });
    
  } catch (error) {
    console.error('Remove IP from allowlist error:', error);
    res.status(500).json({ 
      error: 'Failed to remove IP from allowlist',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/ip-allowlist/bulk
 * Bulk update IP allowlist
 */
router.post('/bulk', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { entries } = req.body;
    
    if (!Array.isArray(entries)) {
      return res.status(400).json({ 
        error: 'Entries must be an array',
        code: 'INVALID_ENTRIES' 
      });
    }
    
    const result = await bulkUpdateIpAllowlist(userId, entries, userId);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        code: 'BULK_UPDATE_FAILED' 
      });
    }
    
    res.json({
      success: true,
      message: `IP allowlist updated with ${entries.length} entries`
    });
    
  } catch (error) {
    console.error('Bulk update IP allowlist error:', error);
    res.status(500).json({ 
      error: 'Failed to bulk update IP allowlist',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/ip-allowlist/add-current
 * Add current IP to allowlist (convenience endpoint)
 */
router.post('/add-current', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const currentIp = req.ip || 'unknown';
    const { label } = req.body;
    
    if (currentIp === 'unknown') {
      return res.status(400).json({ 
        error: 'Could not determine current IP',
        code: 'IP_UNKNOWN' 
      });
    }
    
    const result = await addIpToAllowlist(
      userId, 
      currentIp, 
      label || `Current IP (${new Date().toLocaleDateString()})`,
      userId
    );
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        code: 'ADD_FAILED' 
      });
    }
    
    res.json({
      success: true,
      id: result.id,
      message: `Added current IP ${currentIp} to allowlist`,
      ip: currentIp
    });
    
  } catch (error) {
    console.error('Add current IP error:', error);
    res.status(500).json({ 
      error: 'Failed to add current IP to allowlist',
      code: 'INTERNAL_ERROR' 
    });
  }
});

// Admin routes for managing other users' IP allowlists
router.use('/admin', requirePermission('users', 'admin'));

/**
 * GET /api/ip-allowlist/admin/user/:userId
 * Get IP allowlist for specific user (admin only)
 */
router.get('/admin/user/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const includeInactive = req.query.includeInactive === 'true';
    
    if (isNaN(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID',
        code: 'INVALID_USER_ID' 
      });
    }
    
    const allowlist = await getUserIpAllowlist(userId, includeInactive);
    
    res.json({
      userId,
      entries: allowlist,
      count: allowlist.length
    });
    
  } catch (error) {
    console.error('Get user IP allowlist error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user IP allowlist',
      code: 'FETCH_FAILED' 
    });
  }
});

/**
 * POST /api/ip-allowlist/admin/user/:userId
 * Add IP to specific user's allowlist (admin only)
 */
router.post('/admin/user/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const actorUserId = (req as any).user?.id;
    const { cidr, label } = req.body;
    
    if (isNaN(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID',
        code: 'INVALID_USER_ID' 
      });
    }
    
    if (!cidr) {
      return res.status(400).json({ 
        error: 'CIDR is required',
        code: 'MISSING_CIDR' 
      });
    }
    
    const result = await addIpToAllowlist(userId, cidr, label, actorUserId);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        code: 'ADD_FAILED' 
      });
    }
    
    res.json({
      success: true,
      id: result.id,
      message: `IP added to user ${userId}'s allowlist`
    });
    
  } catch (error) {
    console.error('Add IP to user allowlist error:', error);
    res.status(500).json({ 
      error: 'Failed to add IP to user allowlist',
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/ip-allowlist/admin/user/:userId/bulk
 * Bulk update specific user's IP allowlist (admin only)
 */
router.post('/admin/user/:userId/bulk', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const actorUserId = (req as any).user?.id;
    const { entries } = req.body;
    
    if (isNaN(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID',
        code: 'INVALID_USER_ID' 
      });
    }
    
    if (!Array.isArray(entries)) {
      return res.status(400).json({ 
        error: 'Entries must be an array',
        code: 'INVALID_ENTRIES' 
      });
    }
    
    const result = await bulkUpdateIpAllowlist(userId, entries, actorUserId);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        code: 'BULK_UPDATE_FAILED' 
      });
    }
    
    res.json({
      success: true,
      message: `User ${userId}'s IP allowlist updated with ${entries.length} entries`
    });
    
  } catch (error) {
    console.error('Bulk update user IP allowlist error:', error);
    res.status(500).json({ 
      error: 'Failed to bulk update user IP allowlist',
      code: 'INTERNAL_ERROR' 
    });
  }
});

export { router as ipAllowlistRouter };