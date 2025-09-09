/**
 * Async Payment Routes - Phase 2: Queue-Based Payment Processing
 * Publishes payment processing jobs to RabbitMQ instead of synchronous processing
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../auth/middleware';
import { hasPermission } from '../auth/policy-engine';
import { ulid } from 'ulid';
import { sendSuccess, sendError, ErrorResponses } from '../utils/response-utils';
import { maskSensitive } from '../middleware/safe-logger';
import { generateTraceNumber, maskAccountNumber, maskRoutingNumber } from '../payments/types';
import { createEnvelope } from '../../src/messaging/envelope-helpers';
import { Exchanges } from '../../src/queues/topology';

const router = Router();

// Enhanced ACH Submission Schema with PII masking support
export const AsyncPaymentSubmissionSchema = z.object({
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

// Global reference to the publish function
let globalPublishFunction: Function | null = null;

export function setPublishFunction(publishFn: Function) {
  globalPublishFunction = publishFn;
}

/**
 * Submit a payment for async processing
 * POST /api/v2/payments/async
 */
router.post('/payments/async', requireAuth, async (req, res) => {
  try {
    // Log payment submission with masked sensitive data
    console.log('[API] Async payment submission received', { 
      body: maskSensitive(req.body),
      user: req.user.id,
      ip: req.ip 
    });
    
    if (!globalPublishFunction) {
      console.error('[Payment Route] Queue publisher not initialized');
      return res.status(503).json({ 
        error: 'Payment processing service unavailable',
        message: 'Queue system not initialized' 
      });
    }
    
    // Check user permissions for payment operations
    if (!await hasPermission(req.user.id, 'payments', 'write', { userId: req.user.id })) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const data = AsyncPaymentSubmissionSchema.parse(req.body);
    const paymentId = ulid();
    const correlationId = ulid();
    const amountCents = Math.round(data.amount * 100);

    // Create payment processing message based on source
    let paymentMessage: any = {
      payment_id: paymentId,
      loan_id: data.loan_id,
      source: data.source,
      amount_cents: amountCents,
      currency: 'USD',
      external_ref: data.external_ref,
      processor_ref: data.processor_ref,
      submitted_by: req.user.id,
      submitted_at: new Date().toISOString()
    };

    // Add source-specific fields with security enhancements
    switch (data.source) {
      case 'ach':
        if (!data.routing_number || !data.account_number) {
          return res.status(400).json({ error: 'ACH payments require routing and account numbers' });
        }
        
        paymentMessage = {
          ...paymentMessage,
          account_number_masked: maskAccountNumber(data.account_number),
          routing_number_masked: maskRoutingNumber(data.routing_number),
          account_type: data.account_type || 'checking',
          sec_code: data.sec_code || 'PPD',
          trace_number: generateTraceNumber()
        };
        break;

      case 'wire':
        if (!data.wire_ref) {
          return res.status(400).json({ error: 'Wire payments require a wire reference' });
        }
        paymentMessage = {
          ...paymentMessage,
          wire_ref: data.wire_ref,
          sender_ref: data.sender_ref
        };
        break;

      case 'check':
        paymentMessage = {
          ...paymentMessage,
          check_number: data.check_number,
          payer_account: data.payer_account,
          payer_bank: data.payer_bank,
          issue_date: data.issue_date
        };
        break;

      case 'card':
        paymentMessage = {
          ...paymentMessage,
          card_last_four: data.card_last_four,
          card_type: data.card_type,
          auth_code: data.auth_code
        };
        break;

      case 'cash':
        // Cash payments have minimal additional fields
        break;
    }

    // Create envelope with tenant isolation and correlation tracking
    const envelope = createEnvelope({
      tenantId: 'default',
      correlationId: correlationId,
      actor: { userId: req.user.id.toString() },
      payload: paymentMessage
    });

    // Publish to payment processing queue
    const routingKey = 'tenant.default.payment.process';
    await globalPublishFunction(Exchanges.Commands, routingKey, envelope);

    console.log(`[Payment Route] Payment queued for async processing:`, {
      paymentId,
      correlationId,
      loanId: data.loan_id,
      amount: data.amount,
      source: data.source
    });

    // Return immediate response with tracking information
    return sendSuccess(res, {
      payment_id: paymentId,
      correlation_id: correlationId,
      status: 'queued',
      message: 'Payment queued for processing',
      estimated_processing_time: '2-5 minutes',
      loan_id: data.loan_id,
      amount: data.amount,
      source: data.source,
      submitted_at: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Payment Route] Error submitting async payment:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    return sendError(res, ErrorResponses.INTERNAL_ERROR, {
      message: 'Failed to submit payment for processing',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get payment processing status
 * GET /api/v2/payments/:id/status
 */
router.get('/payments/:id/status', requireAuth, async (req, res) => {
  try {
    const paymentId = req.params.id;
    
    // TODO: Implement status lookup from database
    // For now, return placeholder response
    res.json({
      payment_id: paymentId,
      status: 'processing',
      message: 'Payment processing status lookup not yet implemented',
      last_updated: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[Payment Route] Error getting payment status:', error);
    return sendError(res, ErrorResponses.INTERNAL_ERROR);
  }
});

export default router;