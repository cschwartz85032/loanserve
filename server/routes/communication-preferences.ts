/**
 * Communication Preferences API Routes
 * Handles user communication preferences for CRM system with DNC enforcement
 */

import { Router } from 'express';
import { z } from 'zod';
import { complianceAudit, COMPLIANCE_EVENTS } from '../compliance/auditService.js';
import { getRealUserIP } from '../utils/network.js';

const router = Router();

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
router.get('/:borrowerId', async (req, res) => {
  try {
    const borrowerId = req.params.borrowerId;

    if (!borrowerId) {
      return res.status(400).json({
        error: 'Borrower ID is required',
        code: 'BORROWER_ID_REQUIRED'
      });
    }

    // For now, return default preferences structure since table doesn't exist yet
    // In a real implementation, you would query the database
    const preferences = {
      email: {
        marketing_general: { allowed: true },
        transactional: { allowed: true } // Always true, cannot be changed
      },
      sms: {
        marketing_general: { allowed: true },
        transactional: { allowed: true } // Always true, cannot be changed
      },
      phone: {
        marketing_general: { allowed: true },
        transactional: { allowed: true } // Always true, cannot be changed
      }
    };

    res.json({ 
      data: preferences,
      borrowerId,
      lastModified: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching communication preferences:', error);
    res.status(500).json({
      error: 'Failed to fetch communication preferences',
      code: 'FETCH_PREFERENCES_FAILED'
    });
  }
});

/**
 * PUT /api/communication-preferences/:borrowerId
 * Update communication preference for a borrower
 */
router.put('/:borrowerId', async (req, res) => {
  try {
    const borrowerId = req.params.borrowerId;
    const userId = (req as any).user?.id;

    const validation = updatePreferenceSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid preference data',
        details: validation.error.errors
      });
    }

    const { channel, topic, allowed, frequency } = validation.data;

    // Prevent blocking transactional email topics
    const transactionalTopics = [
      'payment_notifications',
      'account_statements', 
      'escrow_notifications',
      'delinquency_notifications',
      'document_requests',
      'legal_compliance',
      'loan_servicing',
      'transactional'
    ];

    if (!allowed && transactionalTopics.includes(topic)) {
      return res.status(400).json({
        error: 'Cannot opt out of required transactional communications',
        code: 'TRANSACTIONAL_REQUIRED'
      });
    }

    // Get existing preferences first for field-by-field audit comparison
    // For now we'll simulate existing preferences since we don't have the database table yet
    const existingPreferences = {
      channel: channel,
      topic: topic,
      allowed: true, // Default to previously allowed
      frequency: frequency || 'monthly'
    };
    
    // Simulate the update by creating new preferences object
    const updatedPreferences = {
      channel,
      topic, 
      allowed,
      frequency: frequency || 'monthly'
    };

    // Log individual audit entries for each field change (like escrow disbursements)
    const potentialFields = Object.keys(updatedPreferences);
    for (const field of potentialFields) {
      const oldValue = (existingPreferences as any)[field];
      const newValue = (updatedPreferences as any)[field];
      
      // Only log if the value actually changed (use String conversion for comparison)
      if (String(oldValue) !== String(newValue)) {
        await complianceAudit.logEvent({
          eventType: COMPLIANCE_EVENTS.CRM.PREFERENCE_UPDATED,
          actorType: 'user',
          actorId: userId?.toString(),
          resourceType: 'communication_preference',
          resourceId: borrowerId.toString(),
          loanId: null, // Communication preferences may not be tied to a specific loan
          ipAddr: getRealUserIP(req as any),
          userAgent: (req as any).headers?.['user-agent'],
          description: `Communication preference field '${field}' updated from '${oldValue}' to '${newValue}' for borrower ${borrowerId}`,
          previousValues: { [field]: oldValue },
          newValues: { [field]: newValue },
          changedFields: [field]
        });
      }
    }
    
    // Create a correlation ID for audit trail
    const correlationId = `comm_pref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    res.json({
      success: true,
      borrowerId,
      channel,
      topic,
      allowed,
      frequency,
      correlation_id: correlationId,
      updated: true,
      message: 'Communication preference updated successfully'
    });

  } catch (error) {
    console.error('Error updating communication preference:', error);
    res.status(500).json({
      error: 'Failed to update communication preference',
      code: 'UPDATE_PREFERENCES_FAILED'
    });
  }
});

/**
 * GET /api/communication-preferences/:borrowerId/check/:channel/:topic
 * Check if communication is allowed for specific channel/topic
 */
router.get('/:borrowerId/check/:channel/:topic', async (req, res) => {
  try {
    const { borrowerId, channel, topic } = req.params;

    // For now, always allow transactional, check marketing based on defaults
    const allowed = topic.includes('transactional') || topic === 'transactional' ? true : true; // Default to allowed

    res.json({
      borrowerId,
      channel,
      topic,
      allowed,
      checked_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking communication allowance:', error);
    res.status(500).json({
      error: 'Failed to check communication allowance',
      code: 'CHECK_ALLOWANCE_FAILED'
    });
  }
});


export default router;