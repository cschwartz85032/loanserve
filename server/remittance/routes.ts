import { Router } from 'express';
import { Pool } from '@neondatabase/serverless';
import { RemittanceService } from './service.js';
import { ReconciliationService } from './reconciliation.js';
import { PgLedgerRepository } from '../db/ledger-repository.js';
import { z } from 'zod';

const createContractSchema = z.object({
  investorId: z.string().uuid(),
  productCode: z.string(),
  method: z.enum(['scheduled_p_i', 'actual_cash', 'scheduled_p_i_with_interest_shortfall']),
  remittanceDay: z.number().min(1).max(31),
  cutoffDay: z.number().min(1).max(31),
  custodialBankAcctId: z.string().uuid(),
  servicerFeeBps: z.number().min(0).max(10000),
  lateFeeSpiltBps: z.number().min(0).max(10000),
  waterfallRules: z.array(z.object({
    rank: z.number(),
    bucket: z.enum(['interest', 'principal', 'late_fees', 'escrow', 'recoveries']),
    capMinor: z.string().optional()
  }))
});

export function createRemittanceRoutes(pool: Pool): Router {
  const router = Router();
  const ledgerRepo = new PgLedgerRepository(pool);
  const service = new RemittanceService(pool, ledgerRepo);
  const reconService = new ReconciliationService(pool);

  // Contract endpoints
  router.post('/contracts', async (req, res) => {
    try {
      const data = createContractSchema.parse(req.body);
      const contract = await service.createContract(data);
      res.json(contract);
    } catch (error) {
      console.error('Error creating contract:', error);
      res.status(400).json({ 
        error: error instanceof z.ZodError ? error.errors : 'Failed to create contract' 
      });
    }
  });

  // Cycle endpoints
  router.post('/cycles/initiate', async (req, res) => {
    try {
      const { contractId } = z.object({
        contractId: z.string().uuid()
      }).parse(req.body);
      
      const cycle = await service.initiateCycle(contractId);
      res.json(cycle);
    } catch (error) {
      console.error('Error initiating cycle:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to initiate cycle' 
      });
    }
  });

  router.post('/cycles/:cycleId/calculate', async (req, res) => {
    try {
      const { cycleId } = req.params;
      const calculation = await service.calculateWaterfall(cycleId);
      res.json(calculation);
    } catch (error) {
      console.error('Error calculating waterfall:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to calculate waterfall' 
      });
    }
  });

  router.post('/cycles/:cycleId/lock', async (req, res) => {
    try {
      const { cycleId } = req.params;
      await service.lockCycle(cycleId);
      res.json({ success: true, message: 'Cycle locked successfully' });
    } catch (error) {
      console.error('Error locking cycle:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to lock cycle' 
      });
    }
  });

  router.post('/cycles/:cycleId/settle', async (req, res) => {
    try {
      const { cycleId } = req.params;
      await service.settleRemittance(cycleId);
      res.json({ success: true, message: 'Remittance settled successfully' });
    } catch (error) {
      console.error('Error settling remittance:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to settle remittance' 
      });
    }
  });

  // Export endpoints
  router.post('/cycles/:cycleId/export', async (req, res) => {
    try {
      const { cycleId } = req.params;
      const { format } = z.object({
        format: z.enum(['csv', 'xml'])
      }).parse(req.body);
      
      const exportId = await service.generateExport(cycleId, format);
      res.json({ exportId, format });
    } catch (error) {
      console.error('Error generating export:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to generate export' 
      });
    }
  });

  router.get('/exports/:exportId/download', async (req, res) => {
    try {
      const { exportId } = req.params;
      const file = await service.getExportFile(exportId);
      
      if (!file) {
        return res.status(404).json({ error: 'Export not found' });
      }

      // Determine content type based on file content
      const isXML = file.toString('utf8').startsWith('<?xml');
      const contentType = isXML ? 'application/xml' : 'text/csv';
      const extension = isXML ? 'xml' : 'csv';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="remittance_${exportId}.${extension}"`);
      res.send(file);
    } catch (error) {
      console.error('Error downloading export:', error);
      res.status(500).json({ error: 'Failed to download export' });
    }
  });

  // Scheduler endpoints
  router.post('/scheduler/run', async (req, res) => {
    try {
      // Create a temporary scheduler instance to run manually
      const { RemittanceScheduler } = await import('./scheduler.js');
      const scheduler = new RemittanceScheduler(pool);
      await scheduler.runNow();
      res.json({ success: true, message: 'Scheduler run completed' });
    } catch (error) {
      console.error('Error running scheduler manually:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to run scheduler' 
      });
    }
  });

  // Report endpoints
  router.get('/cycles/:cycleId/report', async (req, res) => {
    try {
      const { cycleId } = req.params;
      const report = await service.getReport(cycleId);
      res.json(report);
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // Reconciliation endpoints
  router.post('/reconciliation/setup', async (req, res) => {
    try {
      await reconService.ensureTable();
      res.json({ success: true, message: 'Reconciliation table created' });
    } catch (error) {
      console.error('Error setting up reconciliation:', error);
      res.status(500).json({ error: 'Failed to setup reconciliation' });
    }
  });

  router.post('/cycles/:cycleId/reconcile', async (req, res) => {
    try {
      const { cycleId } = req.params;
      const userId = req.body.userId || 'system';
      const snapshot = await reconService.generateReconciliation(cycleId, userId);
      res.json({
        success: true,
        isBalanced: snapshot.is_balanced,
        differences: {
          investor: snapshot.diff_investor_minor,
          servicer: snapshot.diff_servicer_minor,
          total: snapshot.diff_total_minor
        },
        snapshot
      });
    } catch (error) {
      console.error('Error generating reconciliation:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to reconcile' 
      });
    }
  });

  router.get('/cycles/:cycleId/reconciliation', async (req, res) => {
    try {
      const { cycleId } = req.params;
      const latest = await reconService.getLatestReconciliation(cycleId);
      res.json(latest);
    } catch (error) {
      console.error('Error fetching reconciliation:', error);
      res.status(500).json({ error: 'Failed to fetch reconciliation' });
    }
  });

  router.get('/reconciliation/unbalanced', async (req, res) => {
    try {
      const unbalanced = await reconService.getUnbalancedReconciliations();
      res.json(unbalanced);
    } catch (error) {
      console.error('Error fetching unbalanced reconciliations:', error);
      res.status(500).json({ error: 'Failed to fetch unbalanced reconciliations' });
    }
  });

  return router;
}