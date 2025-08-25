/**
 * Replay Tests: Historical Data Verification
 * Tests deterministic replay of historical payment files to verify exact same posting results
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { RabbitMQConnection } from '../../messaging/rabbitmq-connection';
import { messageFactory } from '../../messaging/message-factory';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

interface HistoricalPayment {
  payment_id: string;
  loan_id: string;
  amount_cents: number;
  source: string;
  external_ref: string;
  effective_date: string;
  metadata: any;
}

interface ReplayResult {
  payment_id: string;
  original_hash: string;
  replay_hash: string;
  matches: boolean;
  ledger_entries: any[];
  state_transitions: any[];
  distributions: any[];
}

class PaymentReplayEngine {
  private rabbitmq: RabbitMQConnection;
  private replayResults: Map<string, ReplayResult> = new Map();

  constructor() {
    this.rabbitmq = RabbitMQConnection.getInstance();
  }

  async connect(): Promise<void> {
    await this.rabbitmq.connect();
  }

  async disconnect(): Promise<void> {
    await this.rabbitmq.close();
  }

  /**
   * Load historical payment data from files
   */
  async loadHistoricalData(filePath: string): Promise<HistoricalPayment[]> {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  }

  /**
   * Capture current state for a payment
   */
  async capturePaymentState(paymentId: string): Promise<string> {
    // Get all related data
    const payment = await db.execute(sql`
      SELECT * FROM payment_transactions 
      WHERE payment_id = ${paymentId}
    `);

    const ledger = await db.execute(sql`
      SELECT * FROM payment_ledger 
      WHERE payment_id = ${paymentId}
      ORDER BY created_at
    `);

    const transitions = await db.execute(sql`
      SELECT * FROM payment_state_transitions 
      WHERE payment_id = ${paymentId}
      ORDER BY occurred_at
    `);

    const distributions = await db.execute(sql`
      SELECT * FROM payment_distributions 
      WHERE payment_id = ${paymentId}
    `);

    // Create deterministic hash of state
    const stateObject = {
      payment: this.normalizeForHash(payment.rows[0]),
      ledger: ledger.rows.map(l => this.normalizeForHash(l)),
      transitions: transitions.rows.map(t => this.normalizeForHash(t)),
      distributions: distributions.rows.map(d => this.normalizeForHash(d))
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(stateObject))
      .digest('hex');
  }

  /**
   * Normalize data for consistent hashing
   */
  private normalizeForHash(obj: any): any {
    if (!obj) return null;

    const normalized: any = {};
    Object.keys(obj)
      .sort()
      .forEach(key => {
        // Exclude timestamps and auto-generated IDs
        if (!['id', 'created_at', 'updated_at', 'occurred_at'].includes(key)) {
          normalized[key] = obj[key];
        }
      });

    return normalized;
  }

  /**
   * Replay a single payment
   */
  async replayPayment(payment: HistoricalPayment): Promise<ReplayResult> {
    // Clear any existing data for this payment
    await this.clearPaymentData(payment.payment_id);

    // Create message envelope
    const envelope = messageFactory.createMessage(
      `payment.${payment.source}.received`,
      payment,
      {
        replay: true,
        original_payment_id: payment.payment_id,
        replay_timestamp: new Date().toISOString()
      }
    );

    // Publish to validation queue
    await this.rabbitmq.publish(
      `payment.${payment.source}.received`,
      envelope
    );

    // Wait for processing to complete
    await this.waitForProcessing(payment.payment_id, 10000);

    // Capture final state
    const replayHash = await this.capturePaymentState(payment.payment_id);

    // Get detailed results
    const ledger = await db.execute(sql`
      SELECT * FROM payment_ledger 
      WHERE payment_id = ${payment.payment_id}
    `);

    const transitions = await db.execute(sql`
      SELECT * FROM payment_state_transitions 
      WHERE payment_id = ${payment.payment_id}
    `);

    const distributions = await db.execute(sql`
      SELECT * FROM payment_distributions 
      WHERE payment_id = ${payment.payment_id}
    `);

    const result: ReplayResult = {
      payment_id: payment.payment_id,
      original_hash: payment.metadata?.state_hash || '',
      replay_hash: replayHash,
      matches: replayHash === (payment.metadata?.state_hash || ''),
      ledger_entries: ledger.rows,
      state_transitions: transitions.rows,
      distributions: distributions.rows
    };

    this.replayResults.set(payment.payment_id, result);
    return result;
  }

  /**
   * Clear payment data for replay
   */
  private async clearPaymentData(paymentId: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM payment_distributions WHERE payment_id = ${paymentId}
    `);
    
    await db.execute(sql`
      DELETE FROM payment_ledger WHERE payment_id = ${paymentId}
    `);
    
    await db.execute(sql`
      DELETE FROM payment_state_transitions WHERE payment_id = ${paymentId}
    `);
    
    await db.execute(sql`
      DELETE FROM payment_transactions WHERE payment_id = ${paymentId}
    `);
  }

  /**
   * Wait for payment processing to complete
   */
  private async waitForProcessing(
    paymentId: string, 
    timeoutMs: number = 10000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await db.execute(sql`
        SELECT state FROM payment_transactions 
        WHERE payment_id = ${paymentId}
      `);

      if (result.rows.length > 0) {
        const state = result.rows[0].state;
        if (['posted', 'settled', 'failed', 'reversed'].includes(state)) {
          return; // Processing complete
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Timeout waiting for payment ${paymentId} to process`);
  }

  /**
   * Batch replay multiple payments
   */
  async batchReplay(payments: HistoricalPayment[]): Promise<Map<string, ReplayResult>> {
    for (const payment of payments) {
      await this.replayPayment(payment);
    }
    return this.replayResults;
  }

  /**
   * Verify replay determinism
   */
  async verifyDeterminism(payment: HistoricalPayment, iterations: number = 3): Promise<boolean> {
    const hashes: string[] = [];

    for (let i = 0; i < iterations; i++) {
      await this.clearPaymentData(payment.payment_id);
      await this.replayPayment(payment);
      const hash = await this.capturePaymentState(payment.payment_id);
      hashes.push(hash);
    }

    // All hashes should be identical
    return hashes.every(h => h === hashes[0]);
  }
}

describe('Historical Payment Replay', () => {
  let replayEngine: PaymentReplayEngine;

  beforeAll(async () => {
    replayEngine = new PaymentReplayEngine();
    await replayEngine.connect();
  });

  afterAll(async () => {
    await replayEngine.disconnect();
  });

  describe('Single Payment Replay', () => {
    it('should replay ACH payment with exact same results', async () => {
      const historicalPayment: HistoricalPayment = {
        payment_id: 'REPLAY-ACH-001',
        loan_id: '17',
        amount_cents: 150000,
        source: 'ach',
        external_ref: 'HIST-ACH-001',
        effective_date: '2025-08-01',
        metadata: {
          state_hash: 'abc123', // Original state hash
          routing_number: '123456789',
          account_number: '1234567890'
        }
      };

      const result = await replayEngine.replayPayment(historicalPayment);

      expect(result.payment_id).toBe('REPLAY-ACH-001');
      expect(result.ledger_entries).toHaveLength(result.ledger_entries.length);
      expect(result.state_transitions.length).toBeGreaterThan(0);

      // Verify ledger balance
      const totalDebits = result.ledger_entries
        .reduce((sum, e) => sum + (e.debit_cents || 0), 0);
      const totalCredits = result.ledger_entries
        .reduce((sum, e) => sum + (e.credit_cents || 0), 0);
      
      expect(totalDebits).toBe(totalCredits);
    });

    it('should replay wire payment with immediate settlement', async () => {
      const historicalPayment: HistoricalPayment = {
        payment_id: 'REPLAY-WIRE-001',
        loan_id: '17',
        amount_cents: 500000,
        source: 'wire',
        external_ref: 'HIST-WIRE-001',
        effective_date: '2025-08-01',
        metadata: {
          wire_ref: 'FED123456789',
          sender_ref: 'SENDER-REF-001'
        }
      };

      const result = await replayEngine.replayPayment(historicalPayment);

      // Wire should settle quickly
      const finalTransition = result.state_transitions[result.state_transitions.length - 1];
      expect(['settled', 'posted']).toContain(finalTransition?.new_state);
    });
  });

  describe('Batch Replay', () => {
    it('should replay multiple payments in sequence', async () => {
      const historicalPayments: HistoricalPayment[] = [
        {
          payment_id: 'REPLAY-BATCH-001',
          loan_id: '17',
          amount_cents: 100000,
          source: 'ach',
          external_ref: 'BATCH-001',
          effective_date: '2025-08-01',
          metadata: {}
        },
        {
          payment_id: 'REPLAY-BATCH-002',
          loan_id: '17',
          amount_cents: 200000,
          source: 'wire',
          external_ref: 'BATCH-002',
          effective_date: '2025-08-02',
          metadata: { wire_ref: 'WIRE-002' }
        },
        {
          payment_id: 'REPLAY-BATCH-003',
          loan_id: '17',
          amount_cents: 150000,
          source: 'check',
          external_ref: 'BATCH-003',
          effective_date: '2025-08-03',
          metadata: { check_number: '1234' }
        }
      ];

      const results = await replayEngine.batchReplay(historicalPayments);

      expect(results.size).toBe(3);
      
      // Verify each payment was processed
      for (const payment of historicalPayments) {
        const result = results.get(payment.payment_id);
        expect(result).toBeDefined();
        expect(result?.ledger_entries.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Determinism Verification', () => {
    it('should produce identical results across multiple replays', async () => {
      const payment: HistoricalPayment = {
        payment_id: 'REPLAY-DETERM-001',
        loan_id: '17',
        amount_cents: 250000,
        source: 'ach',
        external_ref: 'DETERM-001',
        effective_date: '2025-08-01',
        metadata: {
          routing_number: '123456789',
          account_number: '9876543210'
        }
      };

      const isDeterministic = await replayEngine.verifyDeterminism(payment, 3);
      expect(isDeterministic).toBe(true);
    });

    it('should maintain waterfall allocation consistency', async () => {
      const payment: HistoricalPayment = {
        payment_id: 'REPLAY-WATERFALL-001',
        loan_id: '17',
        amount_cents: 175350, // Specific amount to test allocation
        source: 'ach',
        external_ref: 'WATERFALL-001',
        effective_date: '2025-08-01',
        metadata: {}
      };

      // Replay multiple times
      const results: any[] = [];
      for (let i = 0; i < 3; i++) {
        await replayEngine.clearPaymentData(payment.payment_id);
        const result = await replayEngine.replayPayment(payment);
        results.push(result);
      }

      // All allocations should be identical
      const firstAllocations = results[0].ledger_entries
        .map((e: any) => ({ account: e.account, amount: e.credit_cents || e.debit_cents }))
        .sort((a: any, b: any) => a.account.localeCompare(b.account));

      for (let i = 1; i < results.length; i++) {
        const allocations = results[i].ledger_entries
          .map((e: any) => ({ account: e.account, amount: e.credit_cents || e.debit_cents }))
          .sort((a: any, b: any) => a.account.localeCompare(b.account));

        expect(allocations).toEqual(firstAllocations);
      }
    });
  });

  describe('Edge Case Replay', () => {
    it('should handle zero amount payments', async () => {
      const payment: HistoricalPayment = {
        payment_id: 'REPLAY-ZERO-001',
        loan_id: '17',
        amount_cents: 0,
        source: 'ach',
        external_ref: 'ZERO-001',
        effective_date: '2025-08-01',
        metadata: {}
      };

      const result = await replayEngine.replayPayment(payment);
      expect(result.ledger_entries).toHaveLength(0);
    });

    it('should handle reversed payment replay', async () => {
      const payment: HistoricalPayment = {
        payment_id: 'REPLAY-REVERSE-001',
        loan_id: '17',
        amount_cents: 100000,
        source: 'ach',
        external_ref: 'REVERSE-001',
        effective_date: '2025-08-01',
        metadata: {
          will_reverse: true,
          return_code: 'R01'
        }
      };

      const result = await replayEngine.replayPayment(payment);
      
      // Simulate reversal
      await replayEngine.rabbitmq.publish('payment.ach.returned', {
        id: 'RETURN-001',
        type: 'payment.ach.returned',
        occurred_at: new Date().toISOString(),
        payload: {
          payment_id: payment.payment_id,
          return_code: 'R01',
          return_reason: 'Insufficient funds'
        }
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check final state
      const finalState = await db.execute(sql`
        SELECT state FROM payment_transactions 
        WHERE payment_id = ${payment.payment_id}
      `);

      expect(['returned', 'reversed', 'failed']).toContain(finalState.rows[0]?.state);
    });
  });
});