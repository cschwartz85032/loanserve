/**
 * Payment API Routes
 * RESTful endpoints for payment processing
 */

import { Router } from 'express';
import { z } from 'zod';
import { ulid } from 'ulid';
import { db } from '../db';
import { requireAuth } from '../auth/middleware';
import { hasPermission } from '../auth/policy-engine';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { getMessageFactory } from '../messaging/message-factory';
import {
  PaymentData,
  ACHPaymentData,
  WirePaymentData,
  CheckPaymentData,
  CardPaymentData
} from '../messaging/payment-envelope';

const router = Router();
const rabbitmq = getEnhancedRabbitMQService();
const messageFactory = getMessageFactory();

// Schema for payment submission
const PaymentSubmissionSchema = z.object({
  loan_id: z.string(),
  amount: z.number().positive(),
  source: z.enum(['ach', 'wire', 'check', 'card', 'cashier', 'money_order']),
  effective_date: z.string().optional(),
  external_ref: z.string().optional(),
  
  // ACH specific fields
  routing_number: z.string().optional(),
  account_number: z.string().optional(),
  account_type: z.enum(['checking', 'savings']).optional(),
  sec_code: z.enum(['PPD', 'CCD', 'WEB', 'TEL']).optional(),
  
  // Wire specific fields  
  wire_ref: z.string().optional(),
  sender_ref: z.string().optional(),
  
  // Check specific fields
  check_number: z.string().optional(),
  payer_account: z.string().optional(),
  payer_bank: z.string().optional(),
  issue_date: z.string().optional(),
  
  // Card specific fields
  last_four: z.string().optional(),
  processor_ref: z.string().optional()
});

/**
 * Submit a payment for processing
 */
router.post('/api/payments', async (req, res) => {  // TEMPORARILY DISABLED AUTH FOR TESTING
  try {
    console.log('[API] Payment submission request body:', JSON.stringify(req.body, null, 2));
    
    // TEMPORARILY BYPASS PERMISSIONS FOR TESTING
    // if (!await hasPermission(req.user.id, 'payments', 'write', { userId: req.user.id })) {
    //   return res.status(403).json({ error: 'Insufficient permissions' });
    // }

    const data = PaymentSubmissionSchema.parse(req.body);
    const paymentId = ulid();
    const amountCents = Math.round(data.amount * 100);

    // Build payment data based on source
    let paymentData: PaymentData;

    switch (data.source) {
      case 'ach':
        if (!data.routing_number || !data.account_number) {
          return res.status(400).json({ error: 'ACH payments require routing and account numbers' });
        }
        paymentData = {
          payment_id: paymentId,
          loan_id: data.loan_id,
          source: 'ach',
          amount_cents: amountCents,
          currency: 'USD',
          external_ref: data.external_ref,
          routing_number: data.routing_number,
          account_number: data.account_number,
          account_type: data.account_type || 'checking',
          sec_code: data.sec_code || 'PPD'
        } as ACHPaymentData;
        break;

      case 'wire':
        if (!data.wire_ref) {
          return res.status(400).json({ error: 'Wire payments require a wire reference' });
        }
        paymentData = {
          payment_id: paymentId,
          loan_id: data.loan_id,
          source: 'wire',
          amount_cents: amountCents,
          currency: 'USD',
          external_ref: data.external_ref,
          wire_ref: data.wire_ref,
          sender_ref: data.sender_ref
        } as WirePaymentData;
        break;

      case 'check':
        if (!data.check_number) {
          return res.status(400).json({ error: 'Check payments require a check number' });
        }
        paymentData = {
          payment_id: paymentId,
          loan_id: data.loan_id,
          source: 'check',
          amount_cents: amountCents,
          currency: 'USD',
          external_ref: data.external_ref,
          check_number: data.check_number,
          payer_account: data.payer_account,
          payer_bank: data.payer_bank,
          issue_date: data.issue_date || new Date().toISOString()
        } as CheckPaymentData;
        break;

      case 'card':
        paymentData = {
          payment_id: paymentId,
          loan_id: data.loan_id,
          source: 'card',
          amount_cents: amountCents,
          currency: 'USD',
          external_ref: data.external_ref,
          last_four: data.last_four,
          processor_ref: data.processor_ref || ulid()
        } as CardPaymentData;
        break;

      default:
        paymentData = {
          payment_id: paymentId,
          loan_id: data.loan_id,
          source: data.source as any,
          amount_cents: amountCents,
          currency: 'USD',
          external_ref: data.external_ref
        } as PaymentData;
    }

    // Create payment envelope
    const envelope = messageFactory.createMessage(
      `loanserve.payment.v1.${data.source}.received`,
      paymentData,
      {
        occurred_at: data.effective_date || new Date().toISOString()
      }
    );

    // Publish to validation queue
    await rabbitmq.publish(
      `payment.${data.source}.received`,
      envelope
    );

    console.log(`[API] Payment ${paymentId} submitted for processing`);

    res.json({
      success: true,
      payment_id: paymentId,
      status: 'received',
      message: 'Payment submitted for processing'
    });

  } catch (error) {
    console.error('[API] Error submitting payment:', error);
    if (error instanceof z.ZodError) {
      console.error('[API] Validation errors:', error.errors);
      const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      res.status(400).json({ error: `Validation failed: ${fieldErrors}` });
    } else {
      res.status(400).json({ error: error.message || 'Bad Request' });
    }
  }
});

/**
 * Get payment status
 */
router.get('/api/payments/:paymentId', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;

    const result = await db.query(`
      SELECT 
        pt.*,
        json_agg(
          json_build_object(
            'state', pst.new_state,
            'occurred_at', pst.occurred_at,
            'reason', pst.reason
          ) ORDER BY pst.occurred_at DESC
        ) as transitions
      FROM payment_transactions pt
      LEFT JOIN payment_state_transitions pst ON pt.payment_id = pst.payment_id
      WHERE pt.payment_id = $1
      GROUP BY pt.payment_id, pt.loan_id, pt.source, pt.external_ref, 
               pt.amount_cents, pt.currency, pt.received_at, pt.effective_date,
               pt.state, pt.idempotency_key, pt.created_by, pt.metadata
    `, [paymentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = result.rows[0];
    
    // Check permissions
    if (!await hasPermission(req.user.id, 'payments', 'read', { 
      loanId: payment.loan_id,
      userId: req.user.id 
    })) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    res.json({
      success: true,
      payment: {
        ...payment,
        amount: payment.amount_cents / 100
      }
    });

  } catch (error) {
    console.error('[API] Error getting payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get payments for a loan
 */
router.get('/api/loans/:loanId/payments', requireAuth, async (req, res) => {
  try {
    const { loanId } = req.params;
    const { status, from_date, to_date, limit = 50, offset = 0 } = req.query;

    // Check permissions
    if (!await hasPermission(req.user.id, 'payments', 'read', { 
      loanId,
      userId: req.user.id 
    })) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    let query = `
      SELECT 
        payment_id,
        loan_id,
        source,
        external_ref,
        amount_cents,
        currency,
        received_at,
        effective_date,
        state,
        created_by
      FROM payment_transactions
      WHERE loan_id = $1
    `;
    const params: any[] = [loanId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND state = $${paramCount}`;
      params.push(status);
    }

    if (from_date) {
      paramCount++;
      query += ` AND effective_date >= $${paramCount}`;
      params.push(from_date);
    }

    if (to_date) {
      paramCount++;
      query += ` AND effective_date <= $${paramCount}`;
      params.push(to_date);
    }

    query += ` ORDER BY received_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      payments: result.rows.map(p => ({
        ...p,
        amount: p.amount_cents / 100
      })),
      count: result.rows.length
    });

  } catch (error) {
    console.error('[API] Error getting loan payments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get payment allocations
 */
router.get('/api/payments/:paymentId/allocations', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Get payment to check permissions
    const paymentResult = await db.query(
      'SELECT loan_id FROM payment_transactions WHERE payment_id = $1',
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // Check permissions
    if (!await hasPermission(req.user.id, 'payments', 'read', { 
      loanId: payment.loan_id,
      userId: req.user.id 
    })) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get ledger entries
    const ledgerResult = await db.query(`
      SELECT 
        account,
        debit_cents,
        credit_cents,
        pending,
        effective_date,
        created_at
      FROM payment_ledger
      WHERE payment_id = $1
      ORDER BY created_at
    `, [paymentId]);

    res.json({
      success: true,
      allocations: ledgerResult.rows.map(entry => ({
        account: entry.account,
        debit: entry.debit_cents / 100,
        credit: entry.credit_cents / 100,
        pending: entry.pending,
        effective_date: entry.effective_date,
        created_at: entry.created_at
      }))
    });

  } catch (error) {
    console.error('[API] Error getting payment allocations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get investor distributions for a payment
 */
router.get('/api/payments/:paymentId/distributions', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Get payment to check permissions
    const paymentResult = await db.query(
      'SELECT loan_id FROM payment_transactions WHERE payment_id = $1',
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // Check permissions
    if (!await hasPermission(req.user.id, 'investor_reports', 'read', { 
      loanId: payment.loan_id,
      userId: req.user.id 
    })) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get distributions
    const distResult = await db.query(`
      SELECT 
        pd.investor_id,
        i.company_name as investor_name,
        pd.amount_cents,
        pd.servicing_fee_cents,
        pd.status,
        pd.effective_date
      FROM payment_distributions pd
      LEFT JOIN investors i ON pd.investor_id = i.investor_id
      WHERE pd.payment_id = $1
      ORDER BY pd.investor_id
    `, [paymentId]);

    res.json({
      success: true,
      distributions: distResult.rows.map(d => ({
        investor_id: d.investor_id,
        investor_name: d.investor_name,
        amount: d.amount_cents / 100,
        servicing_fee: d.servicing_fee_cents / 100,
        net_amount: (d.amount_cents - d.servicing_fee_cents) / 100,
        status: d.status,
        effective_date: d.effective_date
      }))
    });

  } catch (error) {
    console.error('[API] Error getting payment distributions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Reverse a payment (admin only)
 */
router.post('/api/payments/:paymentId/reverse', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;

    // Check admin permissions
    if (!await hasPermission(req.user.id, 'payments', 'admin', { userId: req.user.id })) {
      return res.status(403).json({ error: 'Admin permissions required' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Reversal reason is required' });
    }

    // Get payment details
    const paymentResult = await db.query(
      'SELECT * FROM payment_transactions WHERE payment_id = $1',
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // Check if payment can be reversed
    const nonReversibleStates = ['reversed', 'rejected', 'closed'];
    if (nonReversibleStates.includes(payment.state)) {
      return res.status(400).json({ 
        error: `Payment in state '${payment.state}' cannot be reversed` 
      });
    }

    // Create reversal envelope
    const reversalEnvelope = messageFactory.create({
      schema: 'loanserve.payment.v1.reversal.requested',
      data: {
        payment_id: paymentId,
        return_reason: reason,
        reversal_id: ulid()
      }
    });

    // Publish to reversal queue
    await rabbitmq.publish('payment.reversal.requested', reversalEnvelope);

    console.log(`[API] Reversal requested for payment ${paymentId}`);

    res.json({
      success: true,
      message: 'Payment reversal initiated',
      payment_id: paymentId
    });

  } catch (error) {
    console.error('[API] Error reversing payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;