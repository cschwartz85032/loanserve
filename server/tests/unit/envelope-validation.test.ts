/**
 * Unit Tests: Envelope Validation
 * Tests message envelope structure, schema validation, and required fields
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { messageFactory } from '../../messaging/message-factory';
import { envelopeSchema, paymentDataSchema } from '../../messaging/schemas';

describe('Envelope Validation', () => {
  describe('Message Factory', () => {
    it('should create valid envelope with all required fields', () => {
      const payload = {
        payment_id: 'TEST-123',
        loan_id: '17',
        source: 'ach',
        amount_cents: 10000,
        currency: 'USD',
        external_ref: 'REF-123'
      };

      const envelope = messageFactory.createMessage(
        'payment.ach.received',
        payload
      );

      // Validate envelope structure
      expect(envelope.id).toBeTruthy();
      expect(envelope.type).toBe('payment.ach.received');
      expect(envelope.occurred_at).toBeTruthy();
      expect(envelope.idempotency_key).toBeTruthy();
      expect(envelope.payload).toEqual(payload);
      expect(envelope.metadata).toBeDefined();
      expect(envelope.metadata.version).toBe('1.0.0');
      expect(envelope.metadata.source).toBe('api');
      expect(envelope.metadata.correlation_id).toBeTruthy();
    });

    it('should generate unique idempotency keys for different payloads', () => {
      const payload1 = { payment_id: 'PAY-1', amount: 100 };
      const payload2 = { payment_id: 'PAY-2', amount: 200 };

      const env1 = messageFactory.createMessage('test', payload1);
      const env2 = messageFactory.createMessage('test', payload2);

      expect(env1.idempotency_key).not.toBe(env2.idempotency_key);
    });

    it('should generate same idempotency key for identical payloads', () => {
      const payload = { 
        payment_id: 'PAY-1', 
        amount: 100,
        date: '2025-08-25'
      };

      const env1 = messageFactory.createMessage('test', payload);
      const env2 = messageFactory.createMessage('test', payload);

      // Same payload should generate same idempotency key
      expect(env1.idempotency_key).toBe(env2.idempotency_key);
    });

    it('should reject invalid envelope missing required fields', () => {
      const invalidEnvelope = {
        type: 'payment.received',
        payload: { amount: 100 }
        // Missing: id, occurred_at, idempotency_key, metadata
      };

      const result = envelopeSchema.safeParse(invalidEnvelope);
      expect(result.success).toBe(false);
      if (!result.success) {
        const missingFields = result.error.issues.map(i => i.path[0]);
        expect(missingFields).toContain('id');
        expect(missingFields).toContain('occurred_at');
        expect(missingFields).toContain('idempotency_key');
      }
    });

    it('should handle nested validation for payment data', () => {
      const invalidPayment = {
        loan_id: '17',
        // Missing required fields: payment_id, source, amount_cents
      };

      const result = paymentDataSchema.safeParse(invalidPayment);
      expect(result.success).toBe(false);
    });
  });

  describe('Schema Validation', () => {
    it('should validate ACH payment specific fields', () => {
      const achSchema = z.object({
        payment_id: z.string(),
        loan_id: z.string(),
        source: z.literal('ach'),
        amount_cents: z.number().positive(),
        routing_number: z.string().regex(/^\d{9}$/),
        account_number: z.string().min(4).max(17),
        account_type: z.enum(['checking', 'savings']),
        sec_code: z.enum(['PPD', 'CCD', 'WEB', 'TEL'])
      });

      const validACH = {
        payment_id: 'ACH-123',
        loan_id: '17',
        source: 'ach' as const,
        amount_cents: 10000,
        routing_number: '123456789',
        account_number: '1234567890',
        account_type: 'checking' as const,
        sec_code: 'PPD' as const
      };

      expect(achSchema.safeParse(validACH).success).toBe(true);

      const invalidRouting = { ...validACH, routing_number: '12345' };
      expect(achSchema.safeParse(invalidRouting).success).toBe(false);
    });

    it('should validate wire payment specific fields', () => {
      const wireSchema = z.object({
        payment_id: z.string(),
        loan_id: z.string(),
        source: z.literal('wire'),
        amount_cents: z.number().positive(),
        wire_ref: z.string().min(1),
        sender_ref: z.string().optional()
      });

      const validWire = {
        payment_id: 'WIRE-123',
        loan_id: '17',
        source: 'wire' as const,
        amount_cents: 50000,
        wire_ref: 'FED123456789'
      };

      expect(wireSchema.safeParse(validWire).success).toBe(true);

      const missingRef = { ...validWire, wire_ref: '' };
      expect(wireSchema.safeParse(missingRef).success).toBe(false);
    });

    it('should validate check payment specific fields', () => {
      const checkSchema = z.object({
        payment_id: z.string(),
        loan_id: z.string(),
        source: z.literal('check'),
        amount_cents: z.number().positive(),
        check_number: z.string().min(1),
        payer_account: z.string().optional(),
        payer_bank: z.string().optional(),
        issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/)
      });

      const validCheck = {
        payment_id: 'CHECK-123',
        loan_id: '17',
        source: 'check' as const,
        amount_cents: 20000,
        check_number: '1234',
        issue_date: '2025-08-25'
      };

      expect(checkSchema.safeParse(validCheck).success).toBe(true);

      const invalidDate = { ...validCheck, issue_date: '08/25/2025' };
      expect(checkSchema.safeParse(invalidDate).success).toBe(false);
    });
  });

  describe('Envelope Metadata', () => {
    it('should include trace context for observability', () => {
      const envelope = messageFactory.createMessage(
        'payment.received',
        { amount: 100 },
        { trace_id: 'trace-123', span_id: 'span-456' }
      );

      expect(envelope.metadata.trace_id).toBe('trace-123');
      expect(envelope.metadata.span_id).toBe('span-456');
    });

    it('should maintain correlation across message chain', () => {
      const correlationId = 'corr-abc-123';
      const envelope = messageFactory.createMessage(
        'payment.received',
        { amount: 100 },
        { correlation_id: correlationId }
      );

      expect(envelope.metadata.correlation_id).toBe(correlationId);
    });

    it('should handle retry metadata', () => {
      const envelope = messageFactory.createMessage(
        'payment.received',
        { amount: 100 },
        { 
          retry_count: 2,
          max_retries: 5,
          retry_delay_ms: 5000
        }
      );

      expect(envelope.metadata.retry_count).toBe(2);
      expect(envelope.metadata.max_retries).toBe(5);
      expect(envelope.metadata.retry_delay_ms).toBe(5000);
    });
  });
});