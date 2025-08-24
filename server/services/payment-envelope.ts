/**
 * Common Payment Envelope Module
 * 
 * Normalizes all payment channels (ACH, Wire, Check, Column Webhook)
 * into a unified schema for consistent processing across the pipeline
 * 
 * Per 25-Step Implementation Specification
 */

import { z } from 'zod';
import crypto from 'crypto';
import { ColumnTransfer, ColumnACHTransfer } from '../column-bank';

// ========================================
// UNIFIED PAYMENT ENVELOPE SCHEMA
// ========================================

export const PaymentEnvelopeSchema = z.object({
  // Core Identifiers
  idempotencyKey: z.string(),
  channel: z.enum(['ach', 'wire', 'check', 'rtp', 'column_webhook', 'manual']),
  channelReferenceId: z.string().optional(), // Column transfer ID, check number, etc.
  
  // Financial Data
  amountCents: z.number().int().positive(),
  currency: z.string().default('USD'),
  valueDate: z.string(), // ISO date when funds are available
  
  // Loan Association
  loanId: z.number().int().optional(),
  loanNumber: z.string().optional(),
  
  // Counterparty Information
  counterparty: z.object({
    name: z.string(),
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional(),
    bankName: z.string().optional(),
    type: z.enum(['individual', 'business']).optional(),
    taxId: z.string().optional(),
  }),
  
  // Payment Method Details
  paymentMethod: z.object({
    type: z.enum(['ach', 'wire', 'check', 'rtp', 'cash', 'manual']),
    achDetails: z.object({
      secCode: z.enum(['PPD', 'CCD', 'WEB', 'TEL']).optional(),
      direction: z.enum(['debit', 'credit']).optional(),
      returnCode: z.string().optional(),
    }).optional(),
    wireDetails: z.object({
      swiftCode: z.string().optional(),
      intermediaryBank: z.string().optional(),
      reference: z.string().optional(),
    }).optional(),
    checkDetails: z.object({
      checkNumber: z.string().optional(),
      checkDate: z.string().optional(),
      imageUrl: z.string().optional(),
    }).optional(),
  }),
  
  // Processing Metadata
  metadata: z.object({
    receivedAt: z.string(),
    source: z.string(), // 'api', 'webhook', 'manual_entry', 'batch_import'
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    rawPayload: z.any().optional(), // Original unprocessed data
  }),
  
  // Validation & Risk
  riskScore: z.number().min(0).max(100).optional(),
  validationFlags: z.array(z.string()).optional(), // ['duplicate_suspected', 'amount_mismatch', etc.]
  requiresReview: z.boolean().default(false),
});

export type PaymentEnvelope = z.infer<typeof PaymentEnvelopeSchema>;

// ========================================
// CHANNEL NORMALIZERS
// ========================================

export class PaymentEnvelopeNormalizer {
  /**
   * Generate idempotency key for a payment
   * Format: sha256(method|reference|value_date|amount_cents|loan_id)
   */
  static generateIdempotencyKey(params: {
    method: string;
    reference: string;
    valueDate: string;
    amountCents: number;
    loanId?: number;
  }): string {
    const components = [
      params.method,
      params.reference,
      params.valueDate,
      params.amountCents.toString(),
      params.loanId?.toString() || 'none'
    ];
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Normalize Column Bank ACH transfer to common envelope
   */
  static fromColumnACH(transfer: ColumnACHTransfer, loanId?: number): PaymentEnvelope {
    const idempotencyKey = this.generateIdempotencyKey({
      method: 'ach',
      reference: transfer.id,
      valueDate: transfer.effective_date,
      amountCents: Math.round(transfer.amount * 100),
      loanId
    });

    return {
      idempotencyKey,
      channel: 'ach',
      channelReferenceId: transfer.id,
      amountCents: Math.round(transfer.amount * 100),
      currency: 'USD',
      valueDate: transfer.effective_date,
      loanId,
      counterparty: {
        name: transfer.counterparty.name,
        accountNumber: transfer.counterparty.account_number,
        routingNumber: transfer.counterparty.routing_number,
        type: 'individual', // Default, could be enhanced with more data
      },
      paymentMethod: {
        type: 'ach',
        achDetails: {
          secCode: transfer.sec_code,
          direction: transfer.direction,
          returnCode: transfer.return_code,
        }
      },
      metadata: {
        receivedAt: transfer.created_at,
        source: 'column_api',
        rawPayload: transfer,
      },
      requiresReview: !!transfer.return_code,
    };
  }

  /**
   * Normalize Column Bank Wire transfer to common envelope
   */
  static fromColumnWire(transfer: ColumnTransfer, loanId?: number): PaymentEnvelope {
    const idempotencyKey = this.generateIdempotencyKey({
      method: 'wire',
      reference: transfer.id,
      valueDate: transfer.created_at.split('T')[0], // Extract date
      amountCents: Math.round(transfer.amount * 100),
      loanId
    });

    return {
      idempotencyKey,
      channel: 'wire',
      channelReferenceId: transfer.id,
      amountCents: Math.round(transfer.amount * 100),
      currency: transfer.currency,
      valueDate: transfer.created_at.split('T')[0],
      loanId,
      counterparty: {
        name: `Counterparty ${transfer.counterparty_id || 'Unknown'}`,
        type: 'individual',
      },
      paymentMethod: {
        type: 'wire',
        wireDetails: {
          reference: transfer.reference_id,
        }
      },
      metadata: {
        receivedAt: transfer.created_at,
        source: 'column_api',
        rawPayload: transfer,
      },
      requiresReview: transfer.status === 'failed',
    };
  }

  /**
   * Normalize check payment to common envelope
   */
  static fromCheck(checkData: {
    checkNumber: string;
    amount: number;
    payerName: string;
    bankName?: string;
    routingNumber?: string;
    accountNumber?: string;
    checkDate: string;
    imageUrl?: string;
    loanId?: number;
  }): PaymentEnvelope {
    const idempotencyKey = this.generateIdempotencyKey({
      method: 'check',
      reference: checkData.checkNumber,
      valueDate: checkData.checkDate,
      amountCents: Math.round(checkData.amount * 100),
      loanId: checkData.loanId
    });

    return {
      idempotencyKey,
      channel: 'check',
      channelReferenceId: checkData.checkNumber,
      amountCents: Math.round(checkData.amount * 100),
      currency: 'USD',
      valueDate: checkData.checkDate,
      loanId: checkData.loanId,
      counterparty: {
        name: checkData.payerName,
        accountNumber: checkData.accountNumber,
        routingNumber: checkData.routingNumber,
        bankName: checkData.bankName,
        type: 'individual',
      },
      paymentMethod: {
        type: 'check',
        checkDetails: {
          checkNumber: checkData.checkNumber,
          checkDate: checkData.checkDate,
          imageUrl: checkData.imageUrl,
        }
      },
      metadata: {
        receivedAt: new Date().toISOString(),
        source: 'manual_entry',
      },
      requiresReview: false,
    };
  }

  /**
   * Normalize Column webhook payload to common envelope
   */
  static fromColumnWebhook(webhook: {
    id: string;
    type: string;
    data: any;
    created_at: string;
  }): PaymentEnvelope | null {
    // Parse webhook based on type
    switch (webhook.type) {
      case 'transfer.completed':
      case 'ach_transfer.completed':
        const transfer = webhook.data;
        const amountCents = Math.round((transfer.amount || 0) * 100);
        
        const idempotencyKey = this.generateIdempotencyKey({
          method: 'column_webhook',
          reference: webhook.id,
          valueDate: webhook.created_at.split('T')[0],
          amountCents,
        });

        return {
          idempotencyKey,
          channel: 'column_webhook',
          channelReferenceId: transfer.id,
          amountCents,
          currency: transfer.currency || 'USD',
          valueDate: webhook.created_at.split('T')[0],
          counterparty: {
            name: transfer.counterparty_name || 'Unknown',
            type: 'individual',
          },
          paymentMethod: {
            type: transfer.type === 'ach' ? 'ach' : 'wire',
          },
          metadata: {
            receivedAt: webhook.created_at,
            source: 'webhook',
            rawPayload: webhook,
          },
          requiresReview: false,
        };
      
      default:
        // Non-payment webhooks return null
        return null;
    }
  }

  /**
   * Validate and normalize any payment data into common envelope
   */
  static normalize(data: any, channel: PaymentEnvelope['channel']): PaymentEnvelope {
    // Attempt to parse based on channel
    switch (channel) {
      case 'ach':
        if (data.sec_code && data.counterparty) {
          return this.fromColumnACH(data as ColumnACHTransfer);
        }
        break;
      case 'wire':
        if (data.type === 'wire') {
          return this.fromColumnWire(data as ColumnTransfer);
        }
        break;
      case 'check':
        return this.fromCheck(data);
      case 'column_webhook':
        const envelope = this.fromColumnWebhook(data);
        if (envelope) return envelope;
        break;
    }

    // Fallback to generic envelope
    const idempotencyKey = this.generateIdempotencyKey({
      method: channel,
      reference: data.id || crypto.randomUUID(),
      valueDate: new Date().toISOString().split('T')[0],
      amountCents: Math.round((data.amount || 0) * 100),
    });

    return {
      idempotencyKey,
      channel,
      channelReferenceId: data.id,
      amountCents: Math.round((data.amount || 0) * 100),
      currency: data.currency || 'USD',
      valueDate: new Date().toISOString().split('T')[0],
      counterparty: {
        name: data.counterparty?.name || 'Unknown',
        type: 'individual',
      },
      paymentMethod: {
        type: channel === 'column_webhook' ? 'manual' : channel,
      },
      metadata: {
        receivedAt: new Date().toISOString(),
        source: 'api',
        rawPayload: data,
      },
      requiresReview: true, // Flag for review since it's fallback
    };
  }

  /**
   * Calculate risk score for payment envelope
   */
  static calculateRiskScore(envelope: PaymentEnvelope): number {
    let score = 0;
    
    // Amount-based risk
    if (envelope.amountCents > 1000000) score += 20; // Over $10,000
    if (envelope.amountCents > 10000000) score += 30; // Over $100,000
    
    // Channel risk
    if (envelope.channel === 'manual') score += 15;
    if (envelope.channel === 'check') score += 10;
    
    // Missing data risk
    if (!envelope.loanId) score += 20;
    if (!envelope.counterparty.accountNumber) score += 10;
    if (!envelope.counterparty.routingNumber) score += 10;
    
    // ACH return risk
    if (envelope.paymentMethod.achDetails?.returnCode) score += 40;
    
    // Validation flags
    if (envelope.validationFlags?.includes('duplicate_suspected')) score += 30;
    if (envelope.validationFlags?.includes('amount_mismatch')) score += 25;
    
    return Math.min(score, 100); // Cap at 100
  }
}

// ========================================
// ENVELOPE VALIDATOR
// ========================================

export class PaymentEnvelopeValidator {
  /**
   * Validate envelope against business rules
   */
  static validate(envelope: PaymentEnvelope): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!envelope.idempotencyKey) {
      errors.push('Missing idempotency key');
    }
    
    if (envelope.amountCents <= 0) {
      errors.push('Amount must be positive');
    }
    
    if (!envelope.counterparty.name) {
      errors.push('Counterparty name is required');
    }

    // Business rule validation
    if (envelope.amountCents > 100000000) { // Over $1,000,000
      warnings.push('Large payment requires additional approval');
    }
    
    if (!envelope.loanId && !envelope.loanNumber) {
      warnings.push('Payment not associated with a loan');
    }
    
    // Channel-specific validation
    if (envelope.channel === 'ach') {
      if (!envelope.paymentMethod.achDetails?.secCode) {
        warnings.push('ACH payment missing SEC code');
      }
    }
    
    if (envelope.channel === 'check') {
      if (!envelope.paymentMethod.checkDetails?.checkNumber) {
        errors.push('Check payment missing check number');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}