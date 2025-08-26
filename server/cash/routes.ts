/**
 * Cash Management and Reconciliation Routes
 */

import { Router } from 'express';
import { Pool } from 'pg';
import { CashRepo } from './repo';
import { AchService } from './ach-service';
import { ReconciliationService } from './reconciliation-service';
import { z } from 'zod';

// Request schemas
const CreateBankAccountSchema = z.object({
  name: z.string(),
  bank_id: z.string(),
  account_number_mask: z.string(),
  currency: z.string().default('USD'),
  type: z.enum(['operating', 'custodial_p_i', 'escrow', 'fees']),
  gl_cash_account: z.string().default('cash')
});

const CreateAchBatchSchema = z.object({
  bank_acct_id: z.string().uuid(),
  service_class: z.enum(['200', '220', '225']),
  effective_date: z.string(),
  created_by: z.string()
});

const AddAchEntrySchema = z.object({
  batch_id: z.string().uuid(),
  txn_code: z.enum(['22', '27', '32', '37']),
  routing: z.string().regex(/^\d{9}$/),
  account_number: z.string(),
  amount: z.number().positive(),
  loan_id: z.number().optional(),
  addenda: z.string().optional()
});

const IngestStatementSchema = z.object({
  bank_acct_id: z.string().uuid(),
  format: z.enum(['bai2', 'camt.053']),
  as_of_date: z.string(),
  file_base64: z.string()
});

const ManualMatchSchema = z.object({
  bank_txn_id: z.string().uuid(),
  event_id: z.string().uuid()
});

const WriteOffSchema = z.object({
  recon_id: z.string().uuid(),
  reason: z.string()
});

export function registerCashRoutes(router: Router, pool: Pool) {
  const repo = new CashRepo(pool);
  const achService = new AchService(pool);
  const reconService = new ReconciliationService(pool);

  // Bank Account Management
  router.post('/api/cash/bank-accounts', async (req, res) => {
    try {
      const data = CreateBankAccountSchema.parse(req.body);
      
      const bankAcctId = await repo.withTx(async (client) => {
        return await repo.createBankAccount(client, {
          ...data,
          active: true
        });
      });

      res.json({ bank_acct_id: bankAcctId });
    } catch (error) {
      console.error('[Cash] Error creating bank account:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Invalid request' 
      });
    }
  });

  router.get('/api/cash/bank-accounts/:id', async (req, res) => {
    try {
      const account = await repo.getBankAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: 'Bank account not found' });
      }
      res.json(account);
    } catch (error) {
      console.error('[Cash] Error fetching bank account:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ACH Operations
  router.post('/api/cash/ach/batches', async (req, res) => {
    try {
      const data = CreateAchBatchSchema.parse(req.body);
      
      const batchId = await achService.createBatch(
        data.bank_acct_id,
        data.service_class,
        data.effective_date,
        data.created_by
      );

      res.json({ ach_batch_id: batchId });
    } catch (error) {
      console.error('[Cash] Error creating ACH batch:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Invalid request' 
      });
    }
  });

  router.post('/api/cash/ach/entries', async (req, res) => {
    try {
      const data = AddAchEntrySchema.parse(req.body);
      
      const entryId = await achService.addEntry(
        data.batch_id,
        data.txn_code,
        data.routing,
        data.account_number,
        data.amount,
        data.loan_id,
        data.addenda
      );

      res.json({ ach_entry_id: entryId });
    } catch (error) {
      console.error('[Cash] Error adding ACH entry:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Invalid request' 
      });
    }
  });

  router.post('/api/cash/ach/batches/:id/seal', async (req, res) => {
    try {
      const fileBuffer = await achService.generateNachaFile({
        achBatchId: req.params.id
      });

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="ach_batch_${req.params.id}.txt"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error('[Cash] Error sealing ACH batch:', error);
      res.status(500).json({ error: 'Failed to generate NACHA file' });
    }
  });

  router.post('/api/cash/ach/returns', async (req, res) => {
    try {
      const { traceNumber, returnCode, returnDate, amount } = req.body;
      
      await achService.processReturn({
        traceNumber,
        returnCode,
        returnDate,
        amountMinor: BigInt(Math.round(amount * 100)),
        addenda: req.body.addenda
      });

      res.json({ success: true });
    } catch (error) {
      console.error('[Cash] Error processing ACH return:', error);
      res.status(500).json({ error: 'Failed to process return' });
    }
  });

  // Bank Statement Ingestion
  router.post('/api/cash/statements', async (req, res) => {
    try {
      const data = IngestStatementSchema.parse(req.body);
      const rawBytes = Buffer.from(data.file_base64, 'base64');

      await reconService.ingestStatement(
        data.bank_acct_id,
        data.format,
        data.as_of_date,
        rawBytes
      );

      res.json({ success: true });
    } catch (error) {
      console.error('[Cash] Error ingesting statement:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Invalid statement' 
      });
    }
  });

  // Reconciliation
  router.get('/api/cash/reconciliation/unmatched', async (req, res) => {
    try {
      const transactions = await repo.getUnmatchedTransactions(
        req.query.bank_acct_id as string,
        req.query.start_date as string,
        req.query.end_date as string
      );

      res.json(transactions);
    } catch (error) {
      console.error('[Cash] Error fetching unmatched transactions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/cash/reconciliation/exceptions', async (req, res) => {
    try {
      const exceptions = await repo.getOpenExceptions();
      res.json(exceptions);
    } catch (error) {
      console.error('[Cash] Error fetching exceptions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/api/cash/reconciliation/match', async (req, res) => {
    try {
      const data = ManualMatchSchema.parse(req.body);
      
      await reconService.manualMatch(data.bank_txn_id, data.event_id);
      
      res.json({ success: true });
    } catch (error) {
      console.error('[Cash] Error matching transaction:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Match failed' 
      });
    }
  });

  router.post('/api/cash/reconciliation/writeoff', async (req, res) => {
    try {
      const data = WriteOffSchema.parse(req.body);
      
      await reconService.writeOff(data.recon_id, data.reason);
      
      res.json({ success: true });
    } catch (error) {
      console.error('[Cash] Error writing off exception:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Write-off failed' 
      });
    }
  });

  router.post('/api/cash/reconciliation/auto-match', async (req, res) => {
    try {
      const bankAcctId = req.body.bank_acct_id;
      const matchedCount = await reconService.autoMatchTransactions(bankAcctId);
      
      res.json({ 
        matched_count: matchedCount,
        success: true 
      });
    } catch (error) {
      console.error('[Cash] Error auto-matching:', error);
      res.status(500).json({ error: 'Auto-match failed' });
    }
  });

  console.log('[Routes] Registered cash management routes');
}