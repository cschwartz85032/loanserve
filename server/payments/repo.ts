/**
 * Payment repository - Phase 2
 */

import { Pool, PoolClient } from "pg";
import { PaymentReceived, PaymentPosted, UUID, Minor } from "./types";

export class PaymentsRepo {
  constructor(private pool: Pool) {}

  async withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally { 
      c.release(); 
    }
  }

  async insertIntake(c: PoolClient, p: PaymentReceived & { raw_payload: any }): Promise<void> {
    await c.query(`
      INSERT INTO payment_intake(
        payment_id, loan_id, method, amount_minor, currency, 
        received_at, gateway_txn_id, source_provider, idempotency_key, 
        effective_date, raw_payload
      )
      VALUES ($1,$2,$3::payment_method,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      p.payment_id, 
      p.loan_id, 
      p.method, 
      p.amount_minor.toString(), 
      p.currency, 
      p.received_at, 
      p.gateway_txn_id, 
      p.source, 
      p.idempotency_key, 
      p.effective_date, 
      p.raw_payload
    ]);
  }

  async upsertValidation(
    c: PoolClient, 
    args: { 
      payment_id: string; 
      is_valid: boolean; 
      reason?: string; 
      effective_date: string; 
      allocation_hints: any 
    }
  ): Promise<void> {
    await c.query(`
      INSERT INTO payment_validation(payment_id, is_valid, reason, allocation_hints, effective_date)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (payment_id) DO UPDATE 
      SET is_valid=$2, reason=$3, allocation_hints=$4, effective_date=$5, validated_at=now()
    `, [args.payment_id, args.is_valid, args.reason, args.allocation_hints, args.effective_date]);
  }

  async insertPosting(
    c: PoolClient, 
    p: PaymentPosted
  ): Promise<void> {
    await c.query(`
      INSERT INTO payment_posting(payment_id, event_id, applied, new_balances)
      VALUES ($1,$2,$3,$4)
    `, [
      p.payment_id, 
      p.event_id, 
      JSON.stringify(p.applied.map(a => ({ 
        bucket: a.bucket, 
        amount_minor: a.amount_minor.toString() 
      }))), 
      JSON.stringify({
        principal_minor: p.new_balances.principal_minor.toString(),
        interest_receivable_minor: p.new_balances.interest_receivable_minor.toString(),
        escrow_liability_minor: p.new_balances.escrow_liability_minor.toString(),
        fees_receivable_minor: p.new_balances.fees_receivable_minor.toString(),
        cash_minor: p.new_balances.cash_minor.toString()
      })
    ]);
  }

  async addToOutbox(
    c: PoolClient, 
    topic: string, 
    payload: any
  ): Promise<string> {
    const result = await c.query(`
      INSERT INTO outbox(topic, payload_json) 
      VALUES ($1,$2) 
      RETURNING event_id
    `, [topic, payload]);
    return result.rows[0].event_id;
  }

  async markOutboxPublished(event_id: string): Promise<void> {
    await this.pool.query(
      `UPDATE outbox SET published_at=now() WHERE event_id=$1`,
      [event_id]
    );
  }

  async getUnpublishedOutbox(limit = 100): Promise<Array<{
    event_id: string;
    topic: string;
    payload_json: any;
  }>> {
    const result = await this.pool.query(`
      SELECT event_id, topic, payload_json 
      FROM outbox 
      WHERE published_at IS NULL 
      ORDER BY created_at, event_id 
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  async getIntakeByIdempotencyKey(key: string): Promise<PaymentReceived | null> {
    const result = await this.pool.query(
      `SELECT * FROM payment_intake WHERE idempotency_key = $1`,
      [key]
    );
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      payment_id: row.payment_id,
      loan_id: row.loan_id,
      method: row.method,
      amount_minor: BigInt(row.amount_minor),
      currency: row.currency,
      received_at: row.received_at.toISOString(),
      gateway_txn_id: row.gateway_txn_id,
      source: row.source_provider,
      idempotency_key: row.idempotency_key,
      effective_date: row.effective_date.toISOString().split('T')[0]
    };
  }

  async getIntakeById(payment_id: string): Promise<PaymentReceived | null> {
    const result = await this.pool.query(
      `SELECT * FROM payment_intake WHERE payment_id = $1`,
      [payment_id]
    );
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      payment_id: row.payment_id,
      loan_id: row.loan_id,
      method: row.method,
      amount_minor: BigInt(row.amount_minor),
      currency: row.currency,
      received_at: row.received_at.toISOString(),
      gateway_txn_id: row.gateway_txn_id,
      source: row.source_provider,
      idempotency_key: row.idempotency_key,
      effective_date: row.effective_date.toISOString().split('T')[0]
    };
  }

  async getValidation(payment_id: string): Promise<{
    is_valid: boolean;
    reason?: string;
    allocation_hints: any;
    effective_date: string;
  } | null> {
    const result = await this.pool.query(
      `SELECT * FROM payment_validation WHERE payment_id = $1`,
      [payment_id]
    );
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      is_valid: row.is_valid,
      reason: row.reason,
      allocation_hints: row.allocation_hints,
      effective_date: row.effective_date.toISOString().split('T')[0]
    };
  }

  async getPosting(payment_id: string): Promise<PaymentPosted | null> {
    const result = await this.pool.query(`
      SELECT pp.*, pi.loan_id 
      FROM payment_posting pp
      JOIN payment_intake pi ON pi.payment_id = pp.payment_id
      WHERE pp.payment_id = $1
    `, [payment_id]);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      payment_id: row.payment_id,
      loan_id: row.loan_id,
      event_id: row.event_id,
      effective_date: '', // Will be set from intake
      applied: row.applied.map((a: any) => ({
        bucket: a.bucket,
        amount_minor: BigInt(a.amount_minor)
      })),
      new_balances: {
        principal_minor: BigInt(row.new_balances.principal_minor),
        interest_receivable_minor: BigInt(row.new_balances.interest_receivable_minor),
        escrow_liability_minor: BigInt(row.new_balances.escrow_liability_minor),
        fees_receivable_minor: BigInt(row.new_balances.fees_receivable_minor),
        cash_minor: BigInt(row.new_balances.cash_minor)
      }
    };
  }
}