/**
 * Phase 10 API Routes
 * Zero-Trust Security, Document Custody, Consent Management
 */

import express from 'express';
import { phase10AuditService } from '../services/phase10-audit-service';
import { phase10DocumentService } from '../services/phase10-document-service';
import { phase10ConsentService } from '../services/phase10-consent-service';
import { docuSignConnectService } from '../integrations/docusign-connect';
import {
  establishSecurityContext,
  requireAuth,
  requirePermission,
  enforceTenantIsolation,
  rateLimiter
} from '../middleware/phase10-security';

const router = express.Router();

// Apply security middleware to all routes
router.use(establishSecurityContext);
router.use(enforceTenantIsolation);

// Rate limiting
router.use('/api/phase10', rateLimiter(15 * 60 * 1000, 200)); // 200 requests per 15 minutes

// === IMMUTABLE AUDIT ROUTES ===

/**
 * GET /api/phase10/audit/events
 * Search audit events with filters
 */
router.get('/audit/events', requireAuth, requirePermission('audit', 'read'), async (req, res) => {
  try {
    const {
      eventType,
      actorId,
      resourceType,
      fromDate,
      toDate,
      limit = 100,
      offset = 0
    } = req.query;

    const events = await phase10AuditService.searchAuditEvents({
      tenantId: req.security!.tenantId,
      eventType: eventType as string,
      actorId: actorId as string,
      resourceType: resourceType as string,
      fromDate: fromDate ? new Date(fromDate as string) : undefined,
      toDate: toDate ? new Date(toDate as string) : undefined
    }, parseInt(limit as string), parseInt(offset as string));

    res.json({
      success: true,
      data: events,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total: events.length
      }
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to get audit events:', error);
    res.status(500).json({ error: 'Failed to retrieve audit events' });
  }
});

/**
 * GET /api/phase10/audit/events/:resourceUrn
 * Get audit events for a specific resource
 */
router.get('/audit/events/:resourceUrn(*)', requireAuth, requirePermission('audit', 'read'), async (req, res) => {
  try {
    const { resourceUrn } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const events = await phase10AuditService.getAuditEvents(
      resourceUrn,
      req.security!.tenantId,
      parseInt(limit as string),
      parseInt(offset as string)
    );

    res.json({
      success: true,
      data: events,
      resourceUrn
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to get resource audit events:', error);
    res.status(500).json({ error: 'Failed to retrieve resource audit events' });
  }
});

/**
 * POST /api/phase10/audit/verify/:resourceUrn
 * Verify audit chain integrity for a resource
 */
router.post('/audit/verify/:resourceUrn(*)', requireAuth, requirePermission('audit', 'verify'), async (req, res) => {
  try {
    const { resourceUrn } = req.params;

    const verification = await phase10AuditService.verifyAuditChain(
      resourceUrn,
      req.security!.tenantId
    );

    res.json({
      success: true,
      verification
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to verify audit chain:', error);
    res.status(500).json({ error: 'Failed to verify audit chain' });
  }
});

/**
 * GET /api/phase10/audit/statistics
 * Get audit statistics for tenant
 */
router.get('/audit/statistics', requireAuth, requirePermission('audit', 'read'), async (req, res) => {
  try {
    const statistics = await phase10AuditService.getAuditStatistics(req.security!.tenantId);
    
    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to get audit statistics:', error);
    res.status(500).json({ error: 'Failed to retrieve audit statistics' });
  }
});

// === DOCUMENT CUSTODY ROUTES ===

/**
 * POST /api/phase10/documents
 * Store a document with first-party custody
 */
router.post('/documents', requireAuth, requirePermission('document', 'write'), async (req, res) => {
  try {
    const {
      loanUrn,
      docType,
      docCategory,
      provider = 'internal',
      documentTitle,
      metadata = {}
    } = req.body;

    const docId = await phase10DocumentService.storeDocument({
      tenantId: req.security!.tenantId,
      loanUrn,
      docType,
      docCategory,
      provider,
      documentTitle,
      metadata
    }, req.security!.userId);

    res.status(201).json({
      success: true,
      data: { docId },
      message: 'Document stored successfully'
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to store document:', error);
    res.status(500).json({ error: 'Failed to store document' });
  }
});

/**
 * GET /api/phase10/documents/:docId
 * Get document metadata
 */
router.get('/documents/:docId', requireAuth, requirePermission('document', 'read'), async (req, res) => {
  try {
    const { docId } = req.params;

    const document = await phase10DocumentService.getDocument(docId, req.security!.tenantId);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Log document access
    await phase10DocumentService.logDocumentAccess(
      docId,
      req.security!.userId,
      'view',
      true,
      {
        ipAddress: req.security!.ipAddress,
        userAgent: req.security!.userAgent,
        sessionId: req.security!.sessionId
      },
      req.security!.tenantId
    );

    res.json({
      success: true,
      data: document
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to get document:', error);
    res.status(500).json({ error: 'Failed to retrieve document' });
  }
});

/**
 * GET /api/phase10/documents/loan/:loanUrn
 * Get documents for a loan
 */
router.get('/documents/loan/:loanUrn(*)', requireAuth, requirePermission('document', 'read'), async (req, res) => {
  try {
    const { loanUrn } = req.params;
    const { docType, limit = 100, offset = 0 } = req.query;

    const documents = await phase10DocumentService.getDocumentsByLoan(
      loanUrn,
      req.security!.tenantId,
      docType as string,
      parseInt(limit as string),
      parseInt(offset as string)
    );

    res.json({
      success: true,
      data: documents,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to get documents by loan:', error);
    res.status(500).json({ error: 'Failed to retrieve loan documents' });
  }
});

/**
 * POST /api/phase10/documents/:docId/verify
 * Verify document integrity
 */
router.post('/documents/:docId/verify', requireAuth, requirePermission('document', 'verify'), async (req, res) => {
  try {
    const { docId } = req.params;

    const verification = await phase10DocumentService.verifyDocumentIntegrity(docId);

    res.json({
      success: true,
      verification
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to verify document:', error);
    res.status(500).json({ error: 'Failed to verify document integrity' });
  }
});

// === CONSENT MANAGEMENT ROUTES ===

/**
 * POST /api/phase10/consent/grant
 * Grant consent
 */
router.post('/consent/grant', requireAuth, requirePermission('consent', 'write'), async (req, res) => {
  try {
    const consentRequest = req.body;
    
    // Add request context
    consentRequest.ipAddress = req.security!.ipAddress;
    consentRequest.userAgent = req.security!.userAgent;

    const consentId = await phase10ConsentService.grantConsent(
      consentRequest,
      req.security!.tenantId,
      req.security!.userId
    );

    res.status(201).json({
      success: true,
      data: { consentId },
      message: 'Consent granted successfully'
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to grant consent:', error);
    res.status(500).json({ error: 'Failed to grant consent' });
  }
});

/**
 * POST /api/phase10/consent/:consentId/revoke
 * Revoke consent
 */
router.post('/consent/:consentId/revoke', requireAuth, requirePermission('consent', 'write'), async (req, res) => {
  try {
    const { consentId } = req.params;
    const { reason } = req.body;

    const success = await phase10ConsentService.revokeConsent(
      consentId,
      reason,
      req.security!.userId,
      req.security!.ipAddress,
      req.security!.userAgent,
      req.security!.tenantId
    );

    res.json({
      success,
      message: success ? 'Consent revoked successfully' : 'Failed to revoke consent'
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to revoke consent:', error);
    res.status(500).json({ error: 'Failed to revoke consent' });
  }
});

/**
 * GET /api/phase10/consent/status/:subjectUrn
 * Get consent status for subject
 */
router.get('/consent/status/:subjectUrn(*)', requireAuth, requirePermission('consent', 'read'), async (req, res) => {
  try {
    const { subjectUrn } = req.params;
    const { consentType } = req.query;

    const consents = await phase10ConsentService.getConsentStatus(
      subjectUrn,
      consentType as string,
      req.security!.tenantId
    );

    res.json({
      success: true,
      data: consents
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to get consent status:', error);
    res.status(500).json({ error: 'Failed to retrieve consent status' });
  }
});

/**
 * POST /api/phase10/communication/preferences
 * Set communication preferences
 */
router.post('/communication/preferences', requireAuth, requirePermission('communication', 'write'), async (req, res) => {
  try {
    const preference = req.body;

    const prefId = await phase10ConsentService.setCommunicationPreference(
      preference,
      req.security!.tenantId,
      req.security!.userId
    );

    res.status(201).json({
      success: true,
      data: { prefId },
      message: 'Communication preference set successfully'
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to set communication preference:', error);
    res.status(500).json({ error: 'Failed to set communication preference' });
  }
});

/**
 * GET /api/phase10/communication/preferences/:subjectUrn
 * Get communication preferences
 */
router.get('/communication/preferences/:subjectUrn(*)', requireAuth, requirePermission('communication', 'read'), async (req, res) => {
  try {
    const { subjectUrn } = req.params;
    const { channel, purpose } = req.query;

    const preferences = await phase10ConsentService.getCommunicationPreferences(
      subjectUrn,
      channel as string,
      purpose as string,
      req.security!.tenantId
    );

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to get communication preferences:', error);
    res.status(500).json({ error: 'Failed to retrieve communication preferences' });
  }
});

/**
 * POST /api/phase10/communication/check
 * Check if communication is allowed
 */
router.post('/communication/check', requireAuth, requirePermission('communication', 'read'), async (req, res) => {
  try {
    const { subjectUrn, channel, purpose, subPurpose } = req.body;

    const result = await phase10ConsentService.isCommunicationAllowed(
      subjectUrn,
      channel,
      purpose,
      subPurpose,
      req.security!.tenantId
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Phase10Routes] Failed to check communication allowance:', error);
    res.status(500).json({ error: 'Failed to check communication allowance' });
  }
});

// === DOCUSIGN INTEGRATION ROUTES ===

/**
 * POST /api/phase10/webhooks/docusign
 * DocuSign Connect webhook endpoint
 */
router.post('/webhooks/docusign', async (req, res) => {
  await docuSignConnectService.processWebhook(req, res);
});

// === HEALTH CHECK ===

/**
 * GET /api/phase10/health
 * Health check for Phase 10 services
 */
router.get('/health', async (req, res) => {
  try {
    // Check audit service
    const auditStats = await phase10AuditService.getAuditStatistics();
    
    res.json({
      success: true,
      phase: 10,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        audit: { status: 'healthy', totalEvents: auditStats.totalEvents },
        document: { status: 'healthy' },
        consent: { status: 'healthy' },
        security: { status: 'healthy' }
      }
    });
  } catch (error) {
    console.error('[Phase10Routes] Health check failed:', error);
    res.status(500).json({
      success: false,
      phase: 10,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;