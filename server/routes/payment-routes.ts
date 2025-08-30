/**
 * Payment API Routes
 * RESTful endpoints for payment processing
 */

import { Router } from 'express';
import { z } from 'zod';
import { ulid } from 'ulid';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware';
import { hasPermission } from '../auth/policy-engine';
import { logActivity, CRM_CONSTANTS } from '../utils/crm-utils';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { getMessageFactory } from '../messaging/message-factory';
import { maskSensitive } from '../middleware/safe-logger';
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
router.post('/payments', requireAuth, async (req, res) => {
  try {
    // Log payment submission with masked sensitive data
    console.log('[API] Payment submission received', { 
      body: maskSensitive(req.body),
      user: req.user.id,
      ip: req.ip 
    });
    
    // Check user permissions for payment operations
    if (!await hasPermission(req.user.id, 'payments', 'write', { userId: req.user.id })) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

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

    // Payment will be saved by the validation consumer after processing
    // We just log the submission here for tracking
    console.log(`[API] Payment ${paymentId} prepared for validation`);

    // Create CRM activity for the payment
    await logActivity(
      parseInt(data.loan_id),
      1, // Default user ID for now
      'payment' as any,
      {
        description: `Payment received: $${data.amount} via ${data.source}`,
        amount: data.amount,
        source: data.source,
        paymentId: paymentId,
        referenceNumber: data.external_ref
      },
      null
    );

    // Ledger entry will be created after payment is validated and processed

    // Create payment envelope
    const envelope = messageFactory.createMessage(
      `loanserve.payment.v1.${data.source}.received`,
      paymentData,
      {
        occurred_at: data.effective_date || new Date().toISOString()
      }
    );

    // Publish to validation queue
    await rabbitmq.publish(envelope, {
      exchange: 'payments.inbound',
      routingKey: data.source
    });

    console.log(`[API] Payment ${paymentId} submitted for processing`);

    res.json({
      success: true,
      payment_id: paymentId,
      status: 'received',
      message: 'Payment submitted for processing',
      loan_id: data.loan_id // Return loan_id for frontend cache invalidation
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
 * Get all payments
 */
router.get('/payments/all', requireAuth, async (req, res) => {
  try {
    // Permission check is handled by requireAuth middleware
    // The middleware sets req.userPolicy if the user is authenticated

    const result = await db.execute(sql`
      SELECT 
        pt.payment_id as id,
        pt.loan_id as "loanId",
        l.loan_number as "loanNumber",
        pt.amount_cents / 100.0 as amount,
        pt.source,
        pt.state as status,
        pt.effective_date as "effectiveDate",
        pt.received_at as "createdAt",
        pt.external_ref as "referenceNumber",
        pt.metadata->>'channel_ref' as "channelReferenceId",
        pt.metadata->>'error_message' as "errorMessage"
      FROM payment_transactions pt
      LEFT JOIN loans l ON pt.loan_id = l.id::text
      ORDER BY pt.received_at DESC
      LIMIT 100
    `);

    return res.json(result.rows);

  } catch (error) {
    console.error('[API] Error fetching all payments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get payment metrics
 */
router.get('/payments/metrics', requireAuth, async (req, res) => {
  try {
    // Permission check is handled by requireAuth middleware
    // The middleware sets req.userPolicy if the user is authenticated

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const metricsResult = await db.execute(sql`
      SELECT 
        COUNT(CASE WHEN received_at >= ${todayStart.toISOString()} THEN 1 END) as today_count,
        COALESCE(SUM(CASE WHEN received_at >= ${todayStart.toISOString()} THEN amount_cents END), 0) / 100.0 as today_amount,
        COUNT(CASE WHEN state = 'pending' OR state = 'processing' THEN 1 END) as pending_count,
        COUNT(CASE WHEN state = 'failed' OR state = 'returned' THEN 1 END) as exception_count,
        COALESCE(SUM(CASE WHEN received_at >= ${monthStart.toISOString()} THEN amount_cents END), 0) / 100.0 as month_amount
      FROM payment_transactions
    `);

    const metrics = metricsResult.rows[0] || {
      today_count: 0,
      today_amount: 0,
      pending_count: 0,
      exception_count: 0,
      month_amount: 0
    };

    return res.json({
      todayCount: metrics.today_count || 0,
      todayAmount: metrics.today_amount || 0,
      pendingCount: metrics.pending_count || 0,
      exceptionCount: metrics.exception_count || 0,
      monthAmount: metrics.month_amount || 0
    });

  } catch (error) {
    console.error('[API] Error fetching payment metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get payment status
 */
router.get('/payments/:paymentId', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;

    const result = await db.execute(sql`
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
      WHERE pt.payment_id = ${paymentId}
      GROUP BY pt.payment_id, pt.loan_id, pt.source, pt.external_ref, 
               pt.amount_cents, pt.currency, pt.received_at, pt.effective_date,
               pt.state, pt.idempotency_key, pt.created_by, pt.metadata
    `);

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
router.get('/loans/:loanId/payments', requireAuth, async (req, res) => {
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

    const result = await db.execute(sql.raw(query, params));

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
router.get('/payments/:paymentId/allocations', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Get payment to check permissions
    const paymentResult = await db.execute(
      sql`SELECT loan_id FROM payment_transactions WHERE payment_id = ${paymentId}`
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
    const ledgerResult = await db.execute(sql`
      SELECT 
        account,
        debit_cents,
        credit_cents,
        pending,
        effective_date,
        created_at
      FROM payment_ledger
      WHERE payment_id = ${paymentId}
      ORDER BY created_at
    `);

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
router.get('/payments/:paymentId/distributions', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Get payment to check permissions
    const paymentResult = await db.execute(
      sql`SELECT loan_id FROM payment_transactions WHERE payment_id = ${paymentId}`
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
    const distResult = await db.execute(sql`
      SELECT 
        pd.investor_id,
        i.company_name as investor_name,
        pd.amount_cents,
        pd.servicing_fee_cents,
        pd.status,
        pd.effective_date
      FROM payment_distributions pd
      LEFT JOIN investors i ON pd.investor_id = i.investor_id
      WHERE pd.payment_id = ${paymentId}
      ORDER BY pd.investor_id
    `);

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
router.post('/payments/:paymentId/reverse', requireAuth, async (req, res) => {
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
    const paymentResult = await db.execute(
      sql`SELECT * FROM payment_transactions WHERE payment_id = ${paymentId}`
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
    await rabbitmq.publish(reversalEnvelope, {
      exchange: 'payments.reversal',
      routingKey: 'requested'
    });

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