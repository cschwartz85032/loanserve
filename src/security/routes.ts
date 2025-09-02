/**
 * Security Routes
 * Integrates all security components with Express routing
 */

import { Router } from 'express';
import { requireAuth } from './jwt';
import { requirePerm } from './rbac';
import { setTenantAndUserContext, requireLoanAccess } from './abac';
import { configureSecurityHeaders, configureRateLimiting } from './headers';
import { WireTransferService } from './wire-fraud-protection';
import { RetentionService } from './retention-policies';
import { getAuditChain } from './audit-chain';
import { PIIRepository } from './pii-protection';

const router = Router();

// Apply security headers to all routes
router.use(configureSecurityHeaders());

// Configure rate limiting
const { apiLimiter, authLimiter, wireTransferLimiter } = configureRateLimiting();
router.use('/api/', apiLimiter);
router.use('/auth/', authLimiter);

/**
 * Wire Transfer Endpoints
 */
router.post('/api/wire-transfers', 
  wireTransferLimiter,
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('wire:request'),
  async (req, res) => {
    try {
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const wireService = new WireTransferService(client, req.dbContext);
        const wireId = await wireService.submitRequest({
          loanId: req.body.loanId,
          amount: req.body.amount,
          recipientName: req.body.recipientName,
          recipientBank: req.body.recipientBank,
          recipientAccount: req.body.recipientAccount,
          recipientRouting: req.body.recipientRouting,
          purpose: req.body.purpose,
          requestedBy: req.user.sub,
          status: 'pending',
          approvals: []
        });

        res.status(201).json({
          success: true,
          wireId,
          message: 'Wire transfer request submitted for approval'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] Wire transfer request error:', error);
      res.status(500).json({ error: 'Failed to submit wire transfer request' });
    }
  }
);

router.post('/api/wire-transfers/:wireId/approve',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('wire:approve'),
  async (req, res) => {
    try {
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const wireService = new WireTransferService(client, req.dbContext);
        const approved = await wireService.approveTransfer(
          req.params.wireId,
          req.user.sub,
          req.user.roles?.[0] || 'unknown',
          req.body.reason,
          req.ip,
          req.headers['user-agent'] || ''
        );

        res.json({
          success: true,
          approved,
          message: approved ? 'Wire transfer approved and ready for execution' : 'Approval recorded, waiting for additional approvals'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] Wire transfer approval error:', error);
      res.status(500).json({ error: 'Failed to approve wire transfer' });
    }
  }
);

router.post('/api/wire-transfers/:wireId/reject',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('wire:approve'),
  async (req, res) => {
    try {
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const wireService = new WireTransferService(client, req.dbContext);
        await wireService.rejectTransfer(
          req.params.wireId,
          req.user.sub,
          req.body.reason || 'No reason provided',
          req.ip,
          req.headers['user-agent'] || ''
        );

        res.json({
          success: true,
          message: 'Wire transfer rejected'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] Wire transfer rejection error:', error);
      res.status(500).json({ error: 'Failed to reject wire transfer' });
    }
  }
);

router.get('/api/wire-transfers/:wireId',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('wire:request'),
  async (req, res) => {
    try {
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const wireService = new WireTransferService(client, req.dbContext);
        const wire = await wireService.getWireTransfer(
          req.params.wireId,
          req.query.includePII === 'true'
        );

        if (!wire) {
          return res.status(404).json({ error: 'Wire transfer not found' });
        }

        res.json(wire);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] Wire transfer retrieval error:', error);
      res.status(500).json({ error: 'Failed to retrieve wire transfer' });
    }
  }
);

/**
 * PII Management Endpoints
 */
router.post('/api/loans/:loanId/pii',
  requireAuth(),
  setTenantAndUserContext(),
  requireLoanAccess('write'),
  requirePerm('loan:write'),
  async (req, res) => {
    try {
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const piiRepo = new PIIRepository(client, req.dbContext);
        await piiRepo.upsertBorrowerPII(req.params.loanId, req.body);

        res.json({
          success: true,
          message: 'PII data encrypted and stored successfully'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] PII storage error:', error);
      res.status(500).json({ error: 'Failed to store PII data' });
    }
  }
);

router.get('/api/loans/:loanId/pii',
  requireAuth(),
  setTenantAndUserContext(),
  requireLoanAccess('read'),
  requirePerm('loan:read'),
  async (req, res) => {
    try {
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const piiRepo = new PIIRepository(client, req.dbContext);
        const piiData = await piiRepo.getBorrowerPII(req.params.loanId);

        res.json({
          success: true,
          data: piiData
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] PII retrieval error:', error);
      res.status(500).json({ error: 'Failed to retrieve PII data' });
    }
  }
);

/**
 * Data Retention Endpoints
 */
router.get('/api/retention/policies',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('retention:manage'),
  async (req, res) => {
    try {
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const retentionService = new RetentionService(client, req.dbContext);
        const stats = await retentionService.getRetentionStats();

        res.json({
          success: true,
          data: stats
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] Retention stats error:', error);
      res.status(500).json({ error: 'Failed to retrieve retention statistics' });
    }
  }
);

router.post('/api/retention/legal-hold',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('retention:manage'),
  async (req, res) => {
    try {
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const retentionService = new RetentionService(client, req.dbContext);
        await retentionService.applyLegalHold(
          req.body.tableName,
          req.body.reason,
          new Date(req.body.holdUntil),
          req.user.sub
        );

        res.json({
          success: true,
          message: `Legal hold applied to ${req.body.tableName}`
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] Legal hold error:', error);
      res.status(500).json({ error: 'Failed to apply legal hold' });
    }
  }
);

router.delete('/api/retention/legal-hold/:tableName',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('retention:manage'),
  async (req, res) => {
    try {
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const retentionService = new RetentionService(client, req.dbContext);
        await retentionService.releaseLegalHold(req.params.tableName, req.user.sub);

        res.json({
          success: true,
          message: `Legal hold released for ${req.params.tableName}`
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] Legal hold release error:', error);
      res.status(500).json({ error: 'Failed to release legal hold' });
    }
  }
);

/**
 * Audit Chain Endpoints
 */
router.get('/api/audit/chain/verify',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('audit:read'),
  async (req, res) => {
    try {
      const auditChain = await getAuditChain();
      const verification = await auditChain.verifyChainIntegrity(req.dbContext.tenantId);

      res.json({
        success: true,
        chainIntegrity: verification
      });
    } catch (error) {
      console.error('[Security] Chain verification error:', error);
      res.status(500).json({ error: 'Failed to verify audit chain' });
    }
  }
);

router.get('/api/audit/chain/metadata',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('audit:read'),
  async (req, res) => {
    try {
      const auditChain = await getAuditChain();
      const metadata = await auditChain.getChainMetadata(req.dbContext.tenantId);

      res.json({
        success: true,
        metadata
      });
    } catch (error) {
      console.error('[Security] Chain metadata error:', error);
      res.status(500).json({ error: 'Failed to retrieve audit chain metadata' });
    }
  }
);

router.get('/api/audit/chain/export',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('audit:read'),
  async (req, res) => {
    try {
      const auditChain = await getAuditChain();
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const events = await auditChain.exportChain(req.dbContext.tenantId, startDate, endDate);

      res.json({
        success: true,
        events,
        totalCount: events.length
      });
    } catch (error) {
      console.error('[Security] Chain export error:', error);
      res.status(500).json({ error: 'Failed to export audit chain' });
    }
  }
);

/**
 * Security Health Check
 */
router.get('/api/security/health',
  requireAuth(),
  setTenantAndUserContext(),
  requirePerm('security:manage'),
  async (req, res) => {
    try {
      const auditChain = await getAuditChain();
      const chainMetadata = await auditChain.getChainMetadata(req.dbContext.tenantId);
      
      const { pool } = await import('../server/db');
      const client = await pool.connect();
      
      try {
        const retentionService = new RetentionService(client, req.dbContext);
        const retentionStats = await retentionService.getRetentionStats();

        res.json({
          success: true,
          security_status: {
            audit_chain_intact: chainMetadata.chainIntact,
            total_audit_events: chainMetadata.eventCount,
            retention_policies: retentionStats.totalPolicies,
            legal_holds_active: retentionStats.legalHolds,
            upcoming_retentions: retentionStats.upcomingRetentions.length,
            last_verified: chainMetadata.lastVerified
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Security] Health check error:', error);
      res.status(500).json({ error: 'Failed to perform security health check' });
    }
  }
);

export { router as securityRoutes };