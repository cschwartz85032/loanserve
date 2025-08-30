/**
 * Payment Processing Routes with Enhanced Security
 * Handles secure payment submission with PII masking
 */

import { Router } from 'express';
import { db } from '../db';
import { payments, loans } from '@shared/schema';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../auth/middleware';
import { hasPermission } from '../auth/policy-engine';
import { ulid } from 'ulid';
import { sql, eq, and, desc, asc } from 'drizzle-orm';
import { sendSuccess, sendError, ErrorResponses } from '../utils/response-utils';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { maskSensitive } from '../middleware/safe-logger';
import { PaymentData, ACHPaymentData, WirePaymentData, CheckPaymentData, CardPaymentData } from '../services/payment-processor';
import { SecureACHPaymentData, generateTraceNumber, maskAccountNumber, maskRoutingNumber } from '../payments/types';

const router = Router();

// Enhanced ACH Submission Schema with PII masking support
export const ACHSubmissionSchema = z.object({
  loan_id: z.number(),
  amount: z.number().positive(),
  source: z.literal('ach'),
  account_number_masked: z.string().regex(/^\*{4,8}\d{4}$/).optional(),
  routing_number_masked: z.string().regex(/^\*{5}\d{4}$/).optional(),
  // Legacy fields for backward compatibility (will be masked)
  account_number: z.string().optional(),
  routing_number: z.string().optional(),
  account_type: z.enum(['checking', 'savings']).default('checking'),
  sec_code: z.enum(['PPD', 'CCD', 'WEB', 'TEL']).default('PPD'),
  trace_number: z.string().optional(),
  external_ref: z.string().optional(),
  processor_ref: z.string().optional()
});

// Original payment submission schema for backward compatibility
export const PaymentSubmissionSchema = z.object({
  loan_id: z.number(),
  amount: z.number().positive(),
  source: z.enum(['ach', 'wire', 'check', 'card', 'cash']),
  
  // ACH fields
  routing_number: z.string().optional(),
  account_number: z.string().optional(),
  account_type: z.enum(['checking', 'savings']).optional(),
  sec_code: z.enum(['PPD', 'CCD', 'WEB', 'TEL']).optional(),

  // Wire fields
  wire_ref: z.string().optional(),
  sender_ref: z.string().optional(),

  // Check fields
  check_number: z.string().optional(),
  payer_account: z.string().optional(),
  payer_bank: z.string().optional(),
  issue_date: z.string().optional(),

  // Card fields
  card_last_four: z.string().optional(),
  card_type: z.string().optional(),
  auth_code: z.string().optional(),

  // Common fields
  external_ref: z.string().optional(),
  processor_ref: z.string().optional()
});

/**
 * Submit a payment for processing with enhanced security
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

    // Build payment data based on source with security enhancements
    let paymentData: PaymentData;

    switch (data.source) {
      case 'ach':
        if (!data.routing_number || !data.account_number) {
          return res.status(400).json({ error: 'ACH payments require routing and account numbers' });
        }
        
        // Create secure ACH payload with PII masking
        paymentData = {
          payment_id: paymentId,
          loan_id: data.loan_id,
          source: 'ach',
          amount_cents: amountCents,
          currency: 'USD',
          external_ref: data.external_ref,
          account_number_masked: maskAccountNumber(data.account_number),
          routing_number_masked: maskRoutingNumber(data.routing_number),
          account_type: data.account_type || 'checking',
          sec_code: data.sec_code || 'PPD',
          trace_number: generateTraceNumber()
        } as SecureACHPaymentData;
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
        if (!data.card_last_four) {
          return res.status(400).json({ error: 'Card payments require card details' });
        }
        paymentData = {
          payment_id: paymentId,
          loan_id: data.loan_id,
          source: 'card',
          amount_cents: amountCents,
          currency: 'USD',
          external_ref: data.external_ref,
          card_last_four: data.card_last_four,
          card_type: data.card_type,
          auth_code: data.auth_code,
          processor_ref: data.processor_ref
        } as CardPaymentData;
        break;

      case 'cash':
        paymentData = {
          payment_id: paymentId,
          loan_id: data.loan_id,
          source: 'cash',
          amount_cents: amountCents,
          currency: 'USD',
          external_ref: data.external_ref || `CASH-${Date.now()}`
        };
        break;

      default:
        return res.status(400).json({ error: 'Invalid payment source' });
    }

    // Verify loan exists
    const loan = await db.query.loans.findFirst({
      where: eq(loans.id, data.loan_id)
    });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    // Create payment record with secure data
    await db.insert(payments).values({
      id: paymentId,
      loanId: data.loan_id,
      amount: data.amount.toFixed(2),
      amountCents: amountCents,
      currency: 'USD',
      sourceChannel: data.source,
      status: 'submitted',
      submittedAt: new Date(),
      externalRef: data.external_ref,
      processorRef: data.processor_ref,
      // Store only masked PII data
      metadata: paymentData.source === 'ach' ? {
        account_masked: (paymentData as SecureACHPaymentData).account_number_masked,
        routing_masked: (paymentData as SecureACHPaymentData).routing_number_masked,
        trace_number: (paymentData as SecureACHPaymentData).trace_number,
        sec_code: (paymentData as SecureACHPaymentData).sec_code
      } : undefined
    });

    // Publish to message queue using enhanced envelope
    const rabbitmq = getEnhancedRabbitMQService();
    
    await rabbitmq.publish({
      schema: 'payments.v1.payment_received',
      message_id: paymentId,
      correlation_id: req.correlationId || paymentId,
      trace_id: req.correlationId || paymentId,
      priority: 5,
      data: paymentData
    }, {
      exchange: 'payments.topic',
      routingKey: 'payment.received',
      persistent: true,
      headers: { 
        'x-source': data.source,
        'x-loan-id': data.loan_id.toString()
      }
    });

    console.log(`[Payments] Payment ${paymentId} submitted for loan ${data.loan_id}`);

    return sendSuccess(res, {
      payment_id: paymentId,
      status: 'submitted'
    }, 'Payment submitted successfully');

  } catch (error: any) {
    console.error('[Payments] Payment submission error:', error);
    
    if (error.name === 'ZodError') {
      return ErrorResponses.badRequest(res, 'Invalid payment data', error.errors);
    }
    
    return ErrorResponses.internalError(res, 'Payment submission failed');
  }
});

// ... rest of existing payment routes remain the same ...

export default router;