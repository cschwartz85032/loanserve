import { Router, Request, Response } from 'express';
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
router.post('/manual',
  requireAuth,
  requirePermission('payments', PermissionLevel.Write),
  asyncHandler(async (req: Request, res: Response) => {
    const paymentData = req.body;
    console.log('[Manual Payment] Received submission:', JSON.stringify(paymentData, null, 2));
    
    // Validate required fields
    if (!paymentData.loanId || !paymentData.amount || !paymentData.source) {
      console.error('[Manual Payment] Validation failed - missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      // Get loan details for validation
      const loan = await db.query.loans.findFirst({
        where: eq(loans.id, parseInt(paymentData.loanId))
      });

      if (!loan) {
        console.error('[Manual Payment] Loan not found:', paymentData.loanId);
        return res.status(404).json({ error: 'Loan not found' });
      }

      // Generate payment ID and reference
      const paymentId = uuidv4();
      const externalRef = paymentData.reference || `MANUAL-${Date.now()}`;
      const amountCents = Math.round(parseFloat(paymentData.amount) * 100);
      
      console.log('[Manual Payment] Generated payment ID:', paymentId);
      console.log('[Manual Payment] Amount cents:', amountCents);
      
      // First, record the payment in the database for tracking
      try {
        await db.execute(sql`
          INSERT INTO payment_transactions (
            payment_id, loan_id, source, external_ref, amount_cents, 
            currency, received_at, effective_date, state, idempotency_key, created_by
          ) VALUES (
            ${paymentId},
            ${paymentData.loanId},
            ${paymentData.source},
            ${externalRef},
            ${amountCents},
            'USD',
            NOW(),
            ${paymentData.effectiveDate || new Date().toISOString().split('T')[0]},
            'received',
            ${paymentId},
            ${req.user?.username || 'manual-entry'}
          )
        `);
        console.log('[Manual Payment] Payment recorded in database');
      } catch (dbErr) {
        console.error('[Manual Payment] Database insert failed:', dbErr);
        // Continue anyway - we'll try to submit to queue
      }
      
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
      
      // Log audit event for payment submission
      try {
        await db.execute(sql`
          INSERT INTO auth_events (
            id, occurred_at, actor_user_id, event_type, ip, user_agent, details
          ) VALUES (
            ${uuidv4()},
            NOW(),
            ${req.user?.id || null},
            'payment.manual.submitted',
            ${req.ip || ''}::inet,
            ${req.get('user-agent') || ''},
            ${JSON.stringify({
              payment_id: paymentId,
              loan_id: paymentData.loanId,
              amount_cents: amountCents,
              source: paymentData.source,
              external_ref: externalRef
            })}::jsonb
          )
        `);
        console.log('[Manual Payment] Audit event logged');
      } catch (auditErr) {
        console.error('[Manual Payment] Audit logging failed:', auditErr);
      }
      
      // Submit to RabbitMQ
      let queueSubmitted = false;
      try {
        console.log('[Manual Payment] Connecting to RabbitMQ...');
        const connection = await amqp.connect(CLOUDAMQP_URL);
        const channel = await connection.createChannel();
        
        // Ensure exchange exists
        await channel.assertExchange('payments.topic', 'topic', { durable: true });
        
        // Publish to validation queue
        const routingKey = `payment.${paymentData.source}.received`;
        console.log('[Manual Payment] Publishing to exchange with routing key:', routingKey);
        
        await channel.publish(
          'payments.topic',
          routingKey,
          Buffer.from(JSON.stringify(envelope)),
          { persistent: true }
        );
        
        await connection.close();
        queueSubmitted = true;
        console.log('[Manual Payment] Successfully published to RabbitMQ');
        
        // Update state to show it's in validation
        await db.execute(sql`
          UPDATE payment_transactions 
          SET state = 'validated'
          WHERE payment_id = ${paymentId}
        `);
        
      } catch (queueErr: any) {
        console.error('[Manual Payment] RabbitMQ submission failed:', queueErr);
        // Mark as failed in database
        await db.execute(sql`
          UPDATE payment_transactions 
          SET state = 'rejected',
              metadata = ${JSON.stringify({ error: queueErr?.message || 'Unknown error' })}::jsonb
          WHERE payment_id = ${paymentId}
        `);
      }
      
      // Log manual payment submission
      console.log(`[Manual Payment] Payment ${paymentId} for loan ${paymentData.loanId}`);
      console.log(`[Manual Payment] Amount: $${paymentData.amount}, Source: ${paymentData.source}`);
      console.log(`[Manual Payment] Queue submitted: ${queueSubmitted}`);
      
      res.json({
        success: true,
        payment_id: paymentId,
        message: queueSubmitted ? 'Payment submitted for processing' : 'Payment recorded but queue submission failed',
        queue_submitted: queueSubmitted,
        details: {
          payment_id: paymentId,
          loan_id: paymentData.loanId,
          loan_number: loan.loanNumber,
          amount: paymentData.amount,
          source: paymentData.source,
          reference: externalRef,
          status: queueSubmitted ? 'validated' : 'rejected'
        }
      });
      
    } catch (error: any) {
      console.error('[Manual Payment] Unexpected error:', error);
      // Log the error to audit trail
      await db.execute(sql`
        INSERT INTO auth_events (
          id, occurred_at, actor_user_id, event_type, ip, user_agent, details
        ) VALUES (
          ${uuidv4()},
          NOW(),
          ${req.user?.id || null},
          'payment.manual.error',
          ${req.ip || ''}::inet,
          ${req.get('user-agent') || ''},
          ${JSON.stringify({
            error: error?.message || 'Unknown error',
            loan_id: paymentData.loanId,
            amount: paymentData.amount,
            source: paymentData.source
          })}::jsonb
        )
      `);
      
      res.status(500).json({ 
        error: 'Failed to submit payment',
        details: error?.message || 'Unknown error' 
      });
    }
  })
);

// Get payment transactions
router.get('/transactions',
  requireAuth,
  requirePermission('payments', PermissionLevel.Read),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // First check if table exists and is accessible
      const tableCheck = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'payment_transactions'
        ) as exists
      `);
      
      if (!tableCheck.rows[0]?.exists) {
        // Table doesn't exist, return empty array
        return res.json([]);
      }
      
      // Query payment transactions - simplified query to avoid join issues
      const result = await db.execute(sql`
        SELECT 
          pt.payment_id,
          pt.loan_id,
          pt.source,
          pt.state,
          pt.amount_cents,
          pt.currency,
          pt.external_ref,
          pt.received_at,
          pt.effective_date,
          pt.metadata
        FROM payment_transactions pt
        ORDER BY pt.received_at DESC
        LIMIT 100
      `);
      
      // If we have results, enrich them with loan data
      const enrichedResults = [];
      for (const row of result.rows || []) {
        try {
          // Try to get loan details
          const loanResult = await db.execute(sql`
            SELECT 
              l.loan_number,
              COALESCE(
                CASE 
                  WHEN be.entity_type = 'individual' THEN CONCAT(be.first_name, ' ', be.last_name)
                  ELSE be.entity_name
                END, 
                'Unknown'
              ) as borrower_name
            FROM loans l
            LEFT JOIN loan_borrowers lb ON lb.loan_id = l.id AND lb.borrower_type = 'primary'
            LEFT JOIN borrower_entities be ON be.id = lb.borrower_id
            WHERE l.id = ${parseInt(String(row.loan_id))}
            LIMIT 1
          `);
          
          enrichedResults.push({
            ...row,
            loan_number: loanResult.rows[0]?.loan_number || null,
            borrower_name: loanResult.rows[0]?.borrower_name || 'Unknown'
          });
        } catch (err) {
          // If loan lookup fails, just use the base data
          enrichedResults.push({
            ...row,
            loan_number: null,
            borrower_name: 'Unknown'
          });
        }
      }
      
      res.json(enrichedResults);
      
    } catch (error) {
      console.error('[Payment Transactions] Error fetching transactions:', error);
      // Return empty array on error instead of throwing
      res.json([]);
    }
  })
);

// Get payment stats
router.get('/stats',
  requireAuth,
  requirePermission('payments', PermissionLevel.Read),
  asyncHandler(async (req: Request, res: Response) => {
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

// Get payment details
router.get('/:paymentId',
  requireAuth,
  requirePermission('payments', PermissionLevel.Read),
  asyncHandler(async (req: Request, res: Response) => {
    const { paymentId } = req.params;
    
    try {
      // Get payment details with state transitions
      const paymentResult = await db.execute(sql`
        SELECT 
          pt.*,
          l.loan_number,
          CASE 
            WHEN be.entity_type = 'individual' THEN CONCAT(be.first_name, ' ', be.last_name)
            ELSE be.entity_name
          END as borrower_name
        FROM payment_transactions pt
        LEFT JOIN loans l ON l.id::text = pt.loan_id
        LEFT JOIN loan_borrowers lb ON lb.loan_id = l.id AND lb.borrower_type = 'primary'
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

export default router;