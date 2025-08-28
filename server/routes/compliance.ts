import { Router } from 'express';
import { db } from '../db';
import { 
  hashChainService,
  retentionPolicyService,
  consentManagementService
} from '../compliance';
import {
  complianceAuditLog,
  consentRecord,
  communicationPreference,
  retentionPolicy,
  legalHold,
  processTimer,
  noticeDeliveryLog,
  dataSubjectRequest
} from '@shared/schema';
import { eq, desc, and, gte, lte, or } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// ===================
// Audit Log Endpoints
// ===================

// Get audit log entries
router.get('/api/compliance/audit-log', async (req, res) => {
  try {
    const { startDate, endDate, eventType, resourceType, entityId, entityType, limit = 100 } = req.query;
    
    // Apply filters
    const conditions = [];
    
    // Filter by loan ID if entityId is provided (for loan audit tab)
    if (entityId) {
      // For loans, filter by loan_id column
      if (entityType === 'loan') {
        conditions.push(eq(complianceAuditLog.loanId, Number(entityId)));
      } else {
        // For other entities, filter by resourceId
        conditions.push(eq(complianceAuditLog.resourceId, String(entityId)));
      }
    }
    
    if (startDate) {
      conditions.push(gte(complianceAuditLog.eventTsUtc, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(complianceAuditLog.eventTsUtc, new Date(endDate as string)));
    }
    if (eventType) {
      conditions.push(eq(complianceAuditLog.eventType, eventType as string));
    }
    if (resourceType) {
      conditions.push(eq(complianceAuditLog.resourceType, resourceType as string));
    }
    
    const entries = conditions.length > 0
      ? await db
          .select()
          .from(complianceAuditLog)
          .where(and(...conditions))
          .orderBy(desc(complianceAuditLog.eventTsUtc))
          .limit(Number(limit))
      : await db
          .select()
          .from(complianceAuditLog)
          .orderBy(desc(complianceAuditLog.eventTsUtc))
          .limit(Number(limit));
    
    res.json(entries);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Verify audit chain integrity
router.get('/api/compliance/audit-log/verify', async (req, res) => {
  try {
    const result = await hashChainService.verifyChainIntegrity();
    res.json(result);
  } catch (error) {
    console.error('Error verifying audit chain:', error);
    res.status(500).json({ error: 'Failed to verify audit chain' });
  }
});

// Generate audit pack
router.post('/api/compliance/audit-log/generate-pack', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    const pack = await hashChainService.generateAuditPack(
      new Date(startDate),
      new Date(endDate)
    );
    
    res.json(pack);
  } catch (error) {
    console.error('Error generating audit pack:', error);
    res.status(500).json({ error: 'Failed to generate audit pack' });
  }
});

// ===================
// Consent Endpoints
// ===================

// Record consent
router.post('/api/compliance/consent', async (req, res) => {
  try {
    const consentSchema = z.object({
      subjectId: z.string(),
      purpose: z.string(),
      scope: z.string(),
      channel: z.enum(['web', 'email', 'sms', 'paper', 'ivr']),
      version: z.string(),
      evidenceUri: z.string().optional(),
      locale: z.string().optional()
    });
    
    const data = consentSchema.parse(req.body);
    await consentManagementService.recordConsent(data);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error recording consent:', error);
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

// Revoke consent
router.delete('/api/compliance/consent/:subjectId/:purpose', async (req, res) => {
  try {
    const { subjectId, purpose } = req.params;
    await consentManagementService.revokeConsent(subjectId, purpose);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error revoking consent:', error);
    res.status(500).json({ error: 'Failed to revoke consent' });
  }
});

// Get subject consents
router.get('/api/compliance/consent/:subjectId', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const consents = await consentManagementService.getSubjectConsents(subjectId);
    
    res.json(consents);
  } catch (error) {
    console.error('Error fetching consents:', error);
    res.status(500).json({ error: 'Failed to fetch consents' });
  }
});

// ===================
// Communication Preferences
// ===================

// Update communication preference
router.put('/api/compliance/communication-preferences', async (req, res) => {
  try {
    const prefSchema = z.object({
      subjectId: z.string(),
      channel: z.enum(['email', 'sms', 'phone', 'push', 'mail']),
      topic: z.string(),
      allowed: z.boolean(),
      frequency: z.enum(['immediate', 'daily', 'weekly', 'monthly']).optional(),
      updatedBy: z.string()
    });
    
    const data = prefSchema.parse(req.body);
    await consentManagementService.updateCommunicationPreference(data);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Get communication preferences
router.get('/api/compliance/communication-preferences/:subjectId', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const preferences = await db
      .select()
      .from(communicationPreference)
      .where(eq(communicationPreference.subjectId, subjectId));
    
    res.json(preferences);
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ===================
// Retention Policy Endpoints
// ===================

// Get retention policies
router.get('/api/compliance/retention-policies', async (req, res) => {
  try {
    const policies = await db.select().from(retentionPolicy);
    res.json(policies);
  } catch (error) {
    console.error('Error fetching retention policies:', error);
    res.status(500).json({ error: 'Failed to fetch retention policies' });
  }
});

// Create retention policy
router.post('/api/compliance/retention-policies', async (req, res) => {
  try {
    const policySchema = z.object({
      dataClass: z.string(),
      jurisdiction: z.string(),
      minRetentionDays: z.number(),
      maxRetentionDays: z.number().optional(),
      legalHoldAllowed: z.boolean().default(true),
      policyVersion: z.string(),
      notes: z.string().optional()
    });
    
    const data = policySchema.parse(req.body);
    const result = await db.insert(retentionPolicy).values(data).returning();
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating retention policy:', error);
    res.status(500).json({ error: 'Failed to create retention policy' });
  }
});

// ===================
// Legal Hold Endpoints
// ===================

// Create legal hold
router.post('/api/compliance/legal-holds', async (req, res) => {
  try {
    const holdSchema = z.object({
      scopeType: z.enum(['artifact', 'account', 'subject']),
      scopeId: z.string(),
      reason: z.string(),
      imposedBy: z.string()
    });
    
    const data = holdSchema.parse(req.body);
    await retentionPolicyService.createLegalHold(data);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error creating legal hold:', error);
    res.status(500).json({ error: 'Failed to create legal hold' });
  }
});

// Release legal hold
router.delete('/api/compliance/legal-holds/:holdId', async (req, res) => {
  try {
    const { holdId } = req.params;
    const { releasedBy } = req.body;
    
    if (!releasedBy) {
      return res.status(400).json({ error: 'releasedBy is required' });
    }
    
    await retentionPolicyService.releaseLegalHold(holdId, releasedBy);
    res.json({ success: true });
  } catch (error) {
    console.error('Error releasing legal hold:', error);
    res.status(500).json({ error: 'Failed to release legal hold' });
  }
});

// Get active legal holds
router.get('/api/compliance/legal-holds', async (req, res) => {
  try {
    const holds = await db
      .select()
      .from(legalHold)
      .where(eq(legalHold.active, true));
    
    res.json(holds);
  } catch (error) {
    console.error('Error fetching legal holds:', error);
    res.status(500).json({ error: 'Failed to fetch legal holds' });
  }
});

// ===================
// DSAR Endpoints
// ===================

// Create DSAR request
router.post('/api/compliance/dsar', async (req, res) => {
  try {
    const dsarSchema = z.object({
      subjectId: z.string(),
      type: z.enum(['access', 'deletion', 'correction']),
      submittedVia: z.enum(['portal', 'email', 'mail']),
      detailsJson: z.any().optional()
    });
    
    const data = dsarSchema.parse(req.body);
    const dsarId = await consentManagementService.createDSAR(data);
    
    res.json({ id: dsarId });
  } catch (error) {
    console.error('Error creating DSAR:', error);
    res.status(500).json({ error: 'Failed to create DSAR' });
  }
});

// Update DSAR status
router.put('/api/compliance/dsar/:dsarId/status', async (req, res) => {
  try {
    const { dsarId } = req.params;
    const { status, updatedBy } = req.body;
    
    if (!status || !updatedBy) {
      return res.status(400).json({ error: 'Status and updatedBy are required' });
    }
    
    await consentManagementService.updateDSARStatus(dsarId, status, updatedBy);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating DSAR status:', error);
    res.status(500).json({ error: 'Failed to update DSAR status' });
  }
});

// Get pending DSARs
router.get('/api/compliance/dsar/pending', async (req, res) => {
  try {
    const pending = await consentManagementService.getPendingDSARs();
    res.json(pending);
  } catch (error) {
    console.error('Error fetching pending DSARs:', error);
    res.status(500).json({ error: 'Failed to fetch pending DSARs' });
  }
});

// ===================
// Process Timers
// ===================

// Get process timers
router.get('/api/compliance/process-timers', async (req, res) => {
  try {
    const timers = await db.select().from(processTimer);
    res.json(timers);
  } catch (error) {
    console.error('Error fetching process timers:', error);
    res.status(500).json({ error: 'Failed to fetch process timers' });
  }
});

// Create process timer
router.post('/api/compliance/process-timers', async (req, res) => {
  try {
    const timerSchema = z.object({
      timerCode: z.string(),
      jurisdiction: z.string(),
      windowHoursMin: z.number(),
      windowHoursMax: z.number(),
      graceHours: z.number().default(0),
      version: z.string()
    });
    
    const data = timerSchema.parse(req.body);
    const result = await db.insert(processTimer).values(data).returning();
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating process timer:', error);
    res.status(500).json({ error: 'Failed to create process timer' });
  }
});

// ===================
// Notice Delivery Log
// ===================

// Get notice delivery logs
router.get('/api/compliance/notice-delivery', async (req, res) => {
  try {
    const { accountId, noticeCode, status } = req.query;
    
    const conditions = [];
    if (accountId) {
      conditions.push(eq(noticeDeliveryLog.accountId, accountId as string));
    }
    if (noticeCode) {
      conditions.push(eq(noticeDeliveryLog.noticeCode, noticeCode as string));
    }
    if (status) {
      conditions.push(eq(noticeDeliveryLog.deliveryStatus, status as string));
    }
    
    const logs = conditions.length > 0
      ? await db
          .select()
          .from(noticeDeliveryLog)
          .where(and(...conditions))
          .orderBy(desc(noticeDeliveryLog.scheduledFor))
      : await db
          .select()
          .from(noticeDeliveryLog)
          .orderBy(desc(noticeDeliveryLog.scheduledFor));
    res.json(logs);
  } catch (error) {
    console.error('Error fetching notice delivery logs:', error);
    res.status(500).json({ error: 'Failed to fetch notice delivery logs' });
  }
});

export default router;