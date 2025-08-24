import { Router } from 'express';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';
import * as amqp from 'amqplib';
import { requireAuth, requirePermission } from '../auth/middleware';
import { PermissionLevel } from '../auth/policy-engine';
import { asyncHandler } from '../utils/error-handler';
import { loans } from '@shared/schema';
import { eq, desc, and, or, like, sql } from 'drizzle-orm';

const router = Router();
const CLOUDAMQP_URL = process.env.CLOUDAMQP_URL || '';

// Submit manual payment
router.post('/api/payments/manual',
  requireAuth,
  requirePermission('Payments', PermissionLevel.Write),
  asyncHandler(async (req, res) => {
    const paymentData = req.body;
    
    // Validate required fields
    if (!paymentData.loanId || !paymentData.amount || !paymentData.source) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      // Get loan details for validation
      const loan = await db.query.loans.findFirst({
        where: eq(loans.id, parseInt(paymentData.loanId))
      });

      if (!loan) {
        return res.status(404).json({ error: 'Loan not found' });
      }

      // Generate payment ID and reference
      const paymentId = uuidv4();
      const externalRef = paymentData.reference || `MANUAL-${Date.now()}`;
      const amountCents = Math.round(parseFloat(paymentData.amount) * 100);
      
      // Build payment envelope based on source
      let sourceData: any = {
        payment_id: paymentId,
        loan_id: paymentData.loanId,
        source: paymentData.source,
        external_ref: externalRef,
        amount_cents: amountCents,
        currency: 'USD'
      };
      
      // Add source-specific data
      switch (paymentData.source) {
        case 'ach':
          sourceData = {
            ...sourceData,
            routing_number: paymentData.routingNumber,
            account_number: paymentData.accountNumber,
            account_type: paymentData.accountType || 'checking',
            sec_code: paymentData.secCode || 'WEB'
          };
          break;
          
        case 'wire':
          sourceData = {
            ...sourceData,
            wire_ref: paymentData.wireRef,
            sender_bank: paymentData.senderBank,
            sender_account: paymentData.senderAccount
          };
          break;
          
        case 'check':
          sourceData = {
            ...sourceData,
            check_number: paymentData.checkNumber,
            issue_date: paymentData.checkDate || paymentData.effectiveDate,
            drawer_bank: paymentData.drawerBank,
            payer_account: paymentData.accountNumber || 'unknown',
            micr_line: paymentData.micrLine
          };
          break;
          
        case 'card':
          sourceData = {
            ...sourceData,
            last4: paymentData.last4,
            auth_code: paymentData.authCode
          };
          break;
          
        case 'cash':
          // Cash payments have minimal additional data
          sourceData = {
            ...sourceData,
            notes: paymentData.notes || 'Cash payment'
          };
          break;
      }
      
      // Create message envelope
      const envelope = {
        envelope_id: uuidv4(),
        schema: `loanserve.payment.v1.${paymentData.source}`,
        producer: `manual-entry-${req.user?.username || 'unknown'}`,
        correlation_id: uuidv4(),
        created_at: new Date().toISOString(),
        effective_date: paymentData.effectiveDate || new Date().toISOString().split('T')[0],
        data: sourceData
      };
      
      // Submit to RabbitMQ
      const connection = await amqp.connect(CLOUDAMQP_URL);
      const channel = await connection.createChannel();
      
      // Ensure exchange exists
      await channel.assertExchange('payments.topic', 'topic', { durable: true });
      
      // Publish to validation queue
      await channel.publish(
        'payments.topic',
        `payment.${paymentData.source}.received`,
        Buffer.from(JSON.stringify(envelope)),
        { persistent: true }
      );
      
      await connection.close();
      
      // Log manual payment submission
      console.log(`[Manual Payment] Submitted payment ${paymentId} for loan ${paymentData.loanId}`);
      console.log(`[Manual Payment] Amount: $${paymentData.amount}, Source: ${paymentData.source}`);
      
      res.json({
        success: true,
        payment_id: paymentId,
        message: 'Payment submitted for processing',
        details: {
          loan_id: paymentData.loanId,
          loan_number: loan.loanNumber,
          amount: paymentData.amount,
          source: paymentData.source,
          reference: externalRef
        }
      });
      
    } catch (error) {
      console.error('[Manual Payment] Error submitting payment:', error);
      res.status(500).json({ error: 'Failed to submit payment' });
    }
  })
);

// Get payment transactions
router.get('/api/payments/transactions',
  requireAuth,
  requirePermission('Payments', PermissionLevel.Read),
  asyncHandler(async (req, res) => {
    try {
      // Query payment transactions
      const result = await db.execute(sql`
        SELECT 
          pt.payment_id,
          pt.loan_id,
          l.loan_number,
          COALESCE(be.full_name, 'Unknown') as borrower_name,
          pt.source,
          pt.state,
          pt.amount_cents,
          pt.currency,
          pt.external_ref,
          pt.received_at,
          pt.effective_date,
          pt.metadata
        FROM payment_transactions pt
        LEFT JOIN loans l ON l.id::text = pt.loan_id
        LEFT JOIN loan_borrowers lb ON lb.loan_id = l.id AND lb.is_primary = true
        LEFT JOIN borrower_entities be ON be.id = lb.borrower_id
        ORDER BY pt.received_at DESC
        LIMIT 100
      `);
      
      res.json(result.rows || []);
      
    } catch (error) {
      console.error('[Payment Transactions] Error fetching transactions:', error);
      res.status(500).json({ error: 'Failed to fetch payment transactions' });
    }
  })
);

// Get payment details
router.get('/api/payments/:paymentId',
  requireAuth,
  requirePermission('Payments', PermissionLevel.Read),
  asyncHandler(async (req, res) => {
    const { paymentId } = req.params;
    
    try {
      // Get payment details with state transitions
      const paymentResult = await db.execute(sql`
        SELECT 
          pt.*,
          l.loan_number,
          be.full_name as borrower_name
        FROM payment_transactions pt
        LEFT JOIN loans l ON l.id::text = pt.loan_id
        LEFT JOIN loan_borrowers lb ON lb.loan_id = l.id AND lb.is_primary = true
        LEFT JOIN borrower_entities be ON be.id = lb.borrower_id
        WHERE pt.payment_id = ${paymentId}
      `);
      
      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      
      // Get state transitions
      const transitionsResult = await db.execute(sql`
        SELECT * FROM payment_state_transitions
        WHERE payment_id = ${paymentId}
        ORDER BY occurred_at ASC
      `);
      
      // Get allocations if processed
      const allocationsResult = await db.execute(sql`
        SELECT * FROM payment_ledger
        WHERE payment_id = ${paymentId}
        ORDER BY created_at ASC
      `);
      
      res.json({
        payment: paymentResult.rows[0],
        transitions: transitionsResult.rows,
        allocations: allocationsResult.rows
      });
      
    } catch (error) {
      console.error('[Payment Details] Error fetching payment:', error);
      res.status(500).json({ error: 'Failed to fetch payment details' });
    }
  })
);

// Get payment stats
router.get('/api/payments/stats',
  requireAuth,
  requirePermission('Payments', PermissionLevel.Read),
  asyncHandler(async (req, res) => {
    try {
      const statsResult = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE DATE(received_at) = CURRENT_DATE) as today_count,
          COALESCE(SUM(amount_cents) FILTER (WHERE DATE(received_at) = CURRENT_DATE), 0) as today_amount,
          COUNT(*) FILTER (WHERE state = 'posted_pending_settlement') as pending_count,
          COUNT(*) FILTER (WHERE state = 'settled' AND DATE(received_at) = CURRENT_DATE) as settled_today,
          COUNT(*) FILTER (WHERE state IN ('rejected', 'reversed')) as failed_count
        FROM payment_transactions
      `);
      
      res.json(statsResult.rows[0] || {
        today_count: 0,
        today_amount: 0,
        pending_count: 0,
        settled_today: 0,
        failed_count: 0
      });
      
    } catch (error) {
      console.error('[Payment Stats] Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch payment stats' });
    }
  })
);

export default router;