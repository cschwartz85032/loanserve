/**
 * Communication Preferences API Routes
 * Handles user communication preferences for CRM system with DNC enforcement
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { communicationPreference, borrowerEntities } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { ConsentManagementService } from '../compliance/consentManagement';
import { requireAuth } from '../auth/middleware';
import { sendSuccess, sendError } from '../utils/api-helpers';
import { complianceAudit, COMPLIANCE_EVENTS } from '../compliance/auditService';

const router = Router();
const consentService = new ConsentManagementService();

// Validation schemas
const updatePreferenceSchema = z.object({
  channel: z.enum(['email', 'sms', 'phone', 'push', 'mail']),
  topic: z.string().min(1),
  allowed: z.boolean(),
  frequency: z.enum(['immediate', 'daily', 'weekly', 'monthly']).optional()
});

const bulkUpdateSchema = z.object({
  preferences: z.array(updatePreferenceSchema).min(1).max(50)
});

const dncRequestSchema = z.object({
  channel: z.enum(['email', 'sms', 'phone', 'mail']),
  reason: z.string().min(1).max(500).optional(),
  effective_date: z.string().optional() // ISO date string
});

/**
 * GET /api/communication-preferences/:borrowerId
 * Get all communication preferences for a borrower
 */
router.get('/:borrowerId', requireAuth, async (req, res) => {
  try {
    const borrowerId = req.params.borrowerId;
    const userId = (req as any).user?.id;

    if (!borrowerId) {
      return sendError(res, 'Borrower ID is required', 400);
    }

    // Verify borrower exists
    const borrower = await db
      .select()
      .from(borrowerEntities)
      .where(eq(borrowerEntities.id, parseInt(borrowerId)))
      .limit(1);

    if (borrower.length === 0) {
      return sendError(res, 'Borrower not found', 404);
    }

    // Get all preferences for the borrower
    const preferences = await db
      .select()
      .from(communicationPreference)
      .where(eq(communicationPreference.subjectId, borrowerId));

    // Group by channel for easier consumption
    const preferencesByChannel = preferences.reduce((acc: any, pref) => {
      if (!acc[pref.channel]) {
        acc[pref.channel] = {};
      }
      acc[pref.channel][pref.topic] = {
        allowed: pref.allowed,
        frequency: pref.frequency,
        lastUpdated: pref.updatedAt,
        lastUpdatedBy: pref.lastUpdatedBy
      };
      return acc;
    }, {});

    // Log compliance event for preference access
    await complianceAudit.logEvent({
      eventType: COMPLIANCE_EVENTS.COMMS.PREFERENCES_ACCESSED,
      actorType: 'user',
      actorId: userId,
      resourceType: 'communication_preference',
      resourceId: borrowerId,
      description: 'Communication preferences accessed',
      metadata: {
        borrowerId,
        userId,
        channelCount: Object.keys(preferencesByChannel).length
      },
      ipAddr: (req as any).ip,
      userAgent: req.headers['user-agent']
    });

    return sendSuccess(res, {
      borrowerId,
      preferences: preferencesByChannel,
      lastModified: preferences.length > 0 ? 
        Math.max(...preferences.map(p => new Date(p.updatedAt || p.createdAt).getTime())) : 
        null
    });

  } catch (error) {
    console.error('Error fetching communication preferences:', error);
    return sendError(res, 'Failed to fetch communication preferences', 500);
  }
});

/**
 * PUT /api/communication-preferences/:borrowerId
 * Update communication preference for a borrower
 */
router.put('/:borrowerId', requireAuth, async (req, res) => {
  try {
    const borrowerId = req.params.borrowerId;
    const userId = (req as any).user?.id;

    const validation = updatePreferenceSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Invalid preference data', 400, validation.error.errors);
    }

    const { channel, topic, allowed, frequency } = validation.data;

    // Update preference via consent service (includes audit logging)
    await consentService.updateCommunicationPreference({
      subjectId: borrowerId,
      channel,
      topic,
      allowed,
      frequency,
      updatedBy: userId.toString()
    });

    // Log specific compliance event for DNC changes
    if (!allowed) {
      await complianceAudit.logEvent({
        eventType: COMPLIANCE_EVENTS.COMMS.DNC_ADDED,
        actorType: 'user',
        actorId: userId,
        resourceType: 'communication_preference',
        resourceId: borrowerId,
        description: `DNC preference set for ${channel}/${topic}`,
        newValues: { channel, topic, allowed, frequency },
        metadata: {
          borrowerId,
          userId,
          dncType: 'user_requested'
        },
        ipAddr: (req as any).ip,
        userAgent: req.headers['user-agent']
      });
    }

    return sendSuccess(res, {
      borrowerId,
      channel,
      topic,
      allowed,
      frequency,
      updated: true
    }, 'Communication preference updated successfully');

  } catch (error) {
    console.error('Error updating communication preference:', error);
    return sendError(res, 'Failed to update communication preference', 500);
  }
});

/**
 * POST /api/communication-preferences/:borrowerId/bulk
 * Bulk update multiple communication preferences
 */
router.post('/:borrowerId/bulk', requireAuth, async (req, res) => {
  try {
    const borrowerId = req.params.borrowerId;
    const userId = (req as any).user?.id;

    const validation = bulkUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Invalid bulk update data', 400, validation.error.errors);
    }

    const { preferences } = validation.data;
    const results = [];

    // Process each preference update
    for (const pref of preferences) {
      try {
        await consentService.updateCommunicationPreference({
          subjectId: borrowerId,
          channel: pref.channel,
          topic: pref.topic,
          allowed: pref.allowed,
          frequency: pref.frequency,
          updatedBy: userId.toString()
        });

        results.push({
          channel: pref.channel,
          topic: pref.topic,
          status: 'success'
        });

      } catch (error) {
        console.error(`Error updating preference ${pref.channel}/${pref.topic}:`, error);
        results.push({
          channel: pref.channel,
          topic: pref.topic,
          status: 'error',
          error: 'Update failed'
        });
      }
    }

    // Log bulk update event
    await complianceAudit.logEvent({
      eventType: COMPLIANCE_EVENTS.COMMS.BULK_PREFERENCES_UPDATED,
      actorType: 'user',
      actorId: userId,
      resourceType: 'communication_preference',
      resourceId: borrowerId,
      description: `Bulk updated ${preferences.length} communication preferences`,
      newValues: { preferences, results },
      metadata: {
        borrowerId,
        userId,
        updateCount: preferences.length,
        successCount: results.filter(r => r.status === 'success').length
      },
      ipAddr: (req as any).ip,
      userAgent: req.headers['user-agent']
    });

    return sendSuccess(res, {
      borrowerId,
      results,
      summary: {
        total: preferences.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length
      }
    }, 'Bulk preference update completed');

  } catch (error) {
    console.error('Error processing bulk preference update:', error);
    return sendError(res, 'Failed to process bulk update', 500);
  }
});

/**
 * POST /api/communication-preferences/:borrowerId/dnc
 * Add comprehensive Do Not Contact restriction
 */
router.post('/:borrowerId/dnc', requireAuth, async (req, res) => {
  try {
    const borrowerId = req.params.borrowerId;
    const userId = (req as any).user?.id;

    const validation = dncRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Invalid DNC request data', 400, validation.error.errors);
    }

    const { channel, reason, effective_date } = validation.data;

    // Set DNC for all marketing topics on the specified channel
    const marketingTopics = [
      'promotional_offers',
      'marketing_campaigns', 
      'newsletters',
      'product_updates',
      'surveys'
    ];

    const results = [];
    for (const topic of marketingTopics) {
      try {
        await consentService.updateCommunicationPreference({
          subjectId: borrowerId,
          channel,
          topic,
          allowed: false,
          updatedBy: userId.toString()
        });
        results.push({ topic, status: 'success' });
      } catch (error) {
        results.push({ topic, status: 'error' });
      }
    }

    // Log comprehensive DNC event
    await complianceAudit.logEvent({
      eventType: COMPLIANCE_EVENTS.COMMS.COMPREHENSIVE_DNC_ADDED,
      actorType: 'user',
      actorId: userId,
      resourceType: 'communication_preference',
      resourceId: borrowerId,
      description: `Comprehensive DNC added for ${channel} channel`,
      newValues: {
        channel,
        reason,
        effective_date,
        topics_affected: marketingTopics,
        results
      },
      metadata: {
        borrowerId,
        userId,
        dncType: 'comprehensive',
        channel,
        topicCount: marketingTopics.length
      },
      ipAddr: (req as any).ip,
      userAgent: req.headers['user-agent']
    });

    return sendSuccess(res, {
      borrowerId,
      channel,
      dncAdded: true,
      topicsAffected: marketingTopics,
      effectiveDate: effective_date || new Date().toISOString(),
      reason
    }, `Comprehensive DNC added for ${channel} channel`);

  } catch (error) {
    console.error('Error adding DNC restriction:', error);
    return sendError(res, 'Failed to add DNC restriction', 500);
  }
});

/**
 * GET /api/communication-preferences/:borrowerId/check/:channel/:topic
 * Check if communication is allowed for specific channel/topic
 */
router.get('/:borrowerId/check/:channel/:topic', requireAuth, async (req, res) => {
  try {
    const { borrowerId, channel, topic } = req.params;

    const allowed = await consentService.isCommunicationAllowed(
      borrowerId,
      channel,
      topic
    );

    return sendSuccess(res, {
      borrowerId,
      channel,
      topic,
      allowed,
      checked_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking communication allowance:', error);
    return sendError(res, 'Failed to check communication allowance', 500);
  }
});

export default router;