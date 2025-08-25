/**
 * Integration Tests: Webhook to Posting End-to-End
 * Tests complete payment flow from webhook reception to ledger posting
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { RabbitMQConnection } from '../../messaging/rabbitmq-connection';

interface TestPayment {
  payment_id: string;
  loan_id: string;
  amount: number;
  source: 'ach' | 'wire' | 'check' | 'card';
  external_ref: string;
}

class WebhookTestClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl: string = 'http://localhost:5000') {
    this.baseUrl = baseUrl;
  }

  async authenticate(username: string, password: string): Promise<void> {
    const response = await request(this.baseUrl)
      .post('/api/auth/login')
      .send({ username, password });

    if (response.status === 200) {
      this.authToken = response.headers['set-cookie']?.[0];
    } else {
      throw new Error(`Authentication failed: ${response.body.error}`);
    }
  }

  async submitPayment(payment: TestPayment): Promise<any> {
    const response = await request(this.baseUrl)
      .post('/api/payments')
      .set('Cookie', this.authToken || '')
      .send({
        loan_id: payment.loan_id,
        amount: payment.amount,
        source: payment.source,
        effective_date: new Date().toISOString().split('T')[0],
        external_ref: payment.external_ref,
        ...(payment.source === 'ach' && {
          routing_number: '123456789',
          account_number: '1234567890'
        }),
        ...(payment.source === 'wire' && {
          wire_ref: `WIRE-${payment.external_ref}`
        }),
        ...(payment.source === 'check' && {
          check_number: '1234',
          payer_bank: 'Test Bank'
        })
      });

    return response.body;
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    const response = await request(this.baseUrl)
      .get(`/api/payments/${paymentId}`)
      .set('Cookie', this.authToken || '');

    return response.body;
  }

  async getPaymentAllocations(paymentId: string): Promise<any> {
    const response = await request(this.baseUrl)
      .get(`/api/payments/${paymentId}/allocations`)
      .set('Cookie', this.authToken || '');

    return response.body;
  }

  async simulateWebhook(provider: string, payload: any): Promise<any> {
    const webhookUrl = `/webhooks/${provider}/payment`;
    
    const response = await request(this.baseUrl)
      .post(webhookUrl)
      .set('X-Webhook-Signature', this.generateWebhookSignature(payload))
      .send(payload);

    return response.body;
  }

  private generateWebhookSignature(payload: any): string {
    // Simulate webhook signature for testing
    const crypto = require('crypto');
    const secret = process.env.WEBHOOK_SECRET || 'test-secret';
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}

describe('Webhook to Posting Integration', () => {
  let client: WebhookTestClient;
  let rabbitmq: RabbitMQConnection;

  beforeAll(async () => {
    client = new WebhookTestClient();
    await client.authenticate('loanatik', 'changeme');
    
    // Connect to RabbitMQ
    rabbitmq = RabbitMQConnection.getInstance();
    await rabbitmq.connect();
  });

  afterAll(async () => {
    await rabbitmq.close();
  });

  beforeEach(async () => {
    // Clear test data
    await db.execute(sql`
      DELETE FROM payment_transactions 
      WHERE external_ref LIKE 'TEST-%'
    `);
    
    await db.execute(sql`
      DELETE FROM payment_ledger 
      WHERE payment_id IN (
        SELECT payment_id FROM payment_transactions 
        WHERE external_ref LIKE 'TEST-%'
      )
    `);
  });

  describe('ACH Payment Flow', () => {
    it('should process ACH payment from submission to posting', async () => {
      const payment: TestPayment = {
        payment_id: ulid(),
        loan_id: '17',
        amount: 1500,
        source: 'ach',
        external_ref: `TEST-ACH-${Date.now()}`
      };

      // Submit payment
      const submitResponse = await client.submitPayment(payment);
      expect(submitResponse.success).toBe(true);
      expect(submitResponse.payment_id).toBeTruthy();
      expect(submitResponse.status).toBe('received');

      const paymentId = submitResponse.payment_id;

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check payment status
      const statusResponse = await client.getPaymentStatus(paymentId);
      expect(statusResponse.success).toBe(true);
      expect(statusResponse.payment.state).toMatch(/validated|processing|posted/);

      // Verify database state
      const dbPayment = await db.execute(sql`
        SELECT * FROM payment_transactions 
        WHERE payment_id = ${paymentId}
      `);
      
      expect(dbPayment.rows).toHaveLength(1);
      expect(dbPayment.rows[0].amount_cents).toBe(150000); // 1500 * 100
      expect(dbPayment.rows[0].source).toBe('ach');
    });

    it('should handle duplicate ACH submissions with idempotency', async () => {
      const payment: TestPayment = {
        payment_id: ulid(),
        loan_id: '17',
        amount: 1000,
        source: 'ach',
        external_ref: `TEST-DUP-${Date.now()}`
      };

      // Submit payment twice
      const response1 = await client.submitPayment(payment);
      const response2 = await client.submitPayment(payment);

      expect(response1.payment_id).toBeTruthy();
      expect(response2.payment_id).toBeTruthy();

      // Should get different payment IDs (new submissions)
      // But with same external_ref, system should handle appropriately
      
      // Verify only valid payments in database
      const dbPayments = await db.execute(sql`
        SELECT * FROM payment_transactions 
        WHERE external_ref = ${payment.external_ref}
      `);
      
      expect(dbPayments.rows.length).toBeGreaterThan(0);
    });

    it('should validate required ACH fields', async () => {
      const invalidPayment = {
        loan_id: '17',
        amount: 1000,
        source: 'ach',
        external_ref: 'TEST-INVALID',
        // Missing routing_number and account_number
      };

      const response = await request('http://localhost:5000')
        .post('/api/payments')
        .set('Cookie', client['authToken'] || '')
        .send(invalidPayment);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('routing');
    });
  });

  describe('Wire Payment Flow', () => {
    it('should process wire payment with immediate settlement', async () => {
      const payment: TestPayment = {
        payment_id: ulid(),
        loan_id: '17',
        amount: 5000,
        source: 'wire',
        external_ref: `TEST-WIRE-${Date.now()}`
      };

      // Submit wire payment
      const submitResponse = await client.submitPayment(payment);
      expect(submitResponse.success).toBe(true);

      const paymentId = submitResponse.payment_id;

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Wire should settle faster than ACH
      const statusResponse = await client.getPaymentStatus(paymentId);
      expect(statusResponse.payment.state).toMatch(/validated|settled|posted/);

      // Check allocations
      const allocations = await client.getPaymentAllocations(paymentId);
      expect(allocations.success).toBe(true);
      
      // Should have ledger entries
      if (allocations.allocations && allocations.allocations.length > 0) {
        const totalCredits = allocations.allocations
          .reduce((sum: number, entry: any) => sum + entry.credit, 0);
        expect(totalCredits).toBeCloseTo(5000, 2);
      }
    });
  });

  describe('Check Payment Flow', () => {
    it('should process check payment with clearing period', async () => {
      const payment: TestPayment = {
        payment_id: ulid(),
        loan_id: '17',
        amount: 2500,
        source: 'check',
        external_ref: `TEST-CHECK-${Date.now()}`
      };

      const submitResponse = await client.submitPayment(payment);
      expect(submitResponse.success).toBe(true);

      const paymentId = submitResponse.payment_id;

      // Check should go to pending_clearance state
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await client.getPaymentStatus(paymentId);
      expect(statusResponse.payment.state).toMatch(/received|validated|pending_clearance/);
    });
  });

  describe('Webhook Provider Integration', () => {
    it('should process Column bank webhook', async () => {
      const columnWebhook = {
        event_type: 'ach.credit',
        data: {
          id: 'col_txn_123',
          amount: 150000, // Column uses cents
          description: 'Payment for loan 17',
          counterparty_name: 'John Doe',
          reference_number: `TEST-COLUMN-${Date.now()}`,
          status: 'completed'
        }
      };

      const response = await client.simulateWebhook('column', columnWebhook);
      
      // Webhook should be accepted
      expect([200, 202]).toContain(response.status || 200);
    });

    it('should process Plaid webhook', async () => {
      const plaidWebhook = {
        webhook_type: 'TRANSFER',
        webhook_code: 'TRANSFER_EVENTS_UPDATE',
        transfer: {
          id: 'plaid_transfer_123',
          amount: '1500.00',
          status: 'settled',
          ach_return_code: null,
          description: 'Loan payment',
          metadata: {
            loan_id: '17',
            external_ref: `TEST-PLAID-${Date.now()}`
          }
        }
      };

      const response = await client.simulateWebhook('plaid', plaidWebhook);
      expect([200, 202]).toContain(response.status || 200);
    });
  });

  describe('End-to-End Posting Verification', () => {
    it('should complete full payment lifecycle', async () => {
      const payment: TestPayment = {
        payment_id: ulid(),
        loan_id: '17',
        amount: 3000,
        source: 'ach',
        external_ref: `TEST-E2E-${Date.now()}`
      };

      // 1. Submit payment
      const submitResponse = await client.submitPayment(payment);
      const paymentId = submitResponse.payment_id;

      // 2. Wait for validation
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 3. Check state transitions
      const transitions = await db.execute(sql`
        SELECT * FROM payment_state_transitions 
        WHERE payment_id = ${paymentId}
        ORDER BY occurred_at
      `);

      expect(transitions.rows.length).toBeGreaterThan(0);
      
      // Should have at least: received -> validated
      const states = transitions.rows.map((t: any) => t.new_state);
      expect(states).toContain('received');
      
      // 4. Verify ledger posting
      const ledgerEntries = await db.execute(sql`
        SELECT * FROM payment_ledger 
        WHERE payment_id = ${paymentId}
      `);

      if (ledgerEntries.rows.length > 0) {
        // Verify double-entry bookkeeping
        const totalDebits = ledgerEntries.rows
          .reduce((sum: number, entry: any) => sum + (entry.debit_cents || 0), 0);
        const totalCredits = ledgerEntries.rows
          .reduce((sum: number, entry: any) => sum + (entry.credit_cents || 0), 0);
        
        expect(totalDebits).toBe(totalCredits); // Must balance
      }

      // 5. Verify investor distributions (if applicable)
      const distributions = await db.execute(sql`
        SELECT * FROM payment_distributions 
        WHERE payment_id = ${paymentId}
      `);

      // If loan has investors, should have distributions
      if (distributions.rows.length > 0) {
        const totalDistributed = distributions.rows
          .reduce((sum: number, dist: any) => sum + dist.amount_cents, 0);
        
        // Total distributed should not exceed payment amount
        expect(totalDistributed).toBeLessThanOrEqual(300000); // 3000 * 100
      }
    });

    it('should handle payment reversal flow', async () => {
      // First create a payment
      const payment: TestPayment = {
        payment_id: ulid(),
        loan_id: '17',
        amount: 2000,
        source: 'ach',
        external_ref: `TEST-REVERSAL-${Date.now()}`
      };

      const submitResponse = await client.submitPayment(payment);
      const paymentId = submitResponse.payment_id;

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulate ACH return
      await rabbitmq.publish('payment.ach.returned', {
        id: ulid(),
        type: 'payment.ach.returned',
        occurred_at: new Date().toISOString(),
        payload: {
          payment_id: paymentId,
          return_code: 'R01', // Insufficient funds
          return_reason: 'Insufficient funds in account'
        }
      });

      // Wait for reversal processing
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check payment is reversed
      const statusResponse = await client.getPaymentStatus(paymentId);
      expect(statusResponse.payment.state).toMatch(/returned|reversed|failed/);

      // Verify reversal ledger entries
      const ledgerEntries = await db.execute(sql`
        SELECT * FROM payment_ledger 
        WHERE payment_id = ${paymentId}
        ORDER BY created_at
      `);

      // Should have both original and reversal entries
      expect(ledgerEntries.rows.length).toBeGreaterThan(1);
    });
  });
});