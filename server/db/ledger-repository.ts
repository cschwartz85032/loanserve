/**
 * Ledger repository implementation for PostgreSQL
 */

import { Pool, PoolClient } from 'pg';
import type { GLAccount, LedgerEntry } from '../../shared/accounting-types';

export interface LedgerRepository {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  
  createEvent(args: { 
    eventId: string; 
    loanId: number; 
    effectiveDate: string; 
    schema: string; 
    correlationId: string 
  }): Promise<void>;
  
  addEntry(args: { 
    eventId: string; 
    loanId: number; 
    account: GLAccount; 
    debitMinor?: bigint; 
    creditMinor?: bigint; 
    currency: 'USD' | 'EUR' | 'GBP'; 
    memo?: string 
  }): Promise<void>;
  
  finalizeEvent(eventId: string): Promise<void>;
  
  latestBalances(loanId: number): Promise<{
    principalMinor: bigint;
    interestReceivableMinor: bigint;
    escrowLiabilityMinor: bigint;
    feesReceivableMinor: bigint;
    cashMinor: bigint;
  }>;
  
  getEventEntries(eventId: string): Promise<LedgerEntry[]>;
}

export class PgLedgerRepository implements LedgerRepository {
  private pool: Pool;
  private client?: PoolClient;
  
  constructor(pool: Pool) {
    this.pool = pool;
  }
  
  async begin(): Promise<void> {
    this.client = await this.pool.connect();
    await this.client.query('BEGIN');
  }
  
  async commit(): Promise<void> {
    if (!this.client) throw new Error('No transaction in progress');
    await this.client.query('COMMIT');
    this.client.release();
    this.client = undefined;
  }
  
  async rollback(): Promise<void> {
    if (this.client) {
      await this.client.query('ROLLBACK');
      this.client.release();
      this.client = undefined;
    }
  }
  
  async createEvent(args: {
    eventId: string;
    loanId: number;
    effectiveDate: string;
    schema: string;
    correlationId: string;
  }): Promise<void> {
    const client = this.client || this.pool;
    
    await client.query(
      `INSERT INTO ledger_event (event_id, loan_id, effective_date, schema, correlation_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [args.eventId, args.loanId, args.effectiveDate, args.schema, args.correlationId]
    );
  }
  
  async addEntry(args: {
    eventId: string;
    loanId: number;
    account: GLAccount;
    debitMinor?: bigint;
    creditMinor?: bigint;
    currency: 'USD' | 'EUR' | 'GBP';
    memo?: string;
  }): Promise<void> {
    const client = this.client || this.pool;
    
    await client.query(
      `INSERT INTO ledger_entry (event_id, loan_id, account, debit_minor, credit_minor, currency, memo)
       VALUES ($1, $2, $3::gl_account, $4, $5, $6, $7)`,
      [
        args.eventId,
        args.loanId,
        args.account,
        args.debitMinor?.toString() || '0',
        args.creditMinor?.toString() || '0',
        args.currency,
        args.memo
      ]
    );
  }
  
  async finalizeEvent(eventId: string): Promise<void> {
    const client = this.client || this.pool;
    
    // Call the stored procedure to finalize and verify balance
    await client.query('SELECT sp_finalize_ledger_event($1)', [eventId]);
  }
  
  async latestBalances(loanId: number): Promise<{
    principalMinor: bigint;
    interestReceivableMinor: bigint;
    escrowLiabilityMinor: bigint;
    feesReceivableMinor: bigint;
    cashMinor: bigint;
  }> {
    const client = this.client || this.pool;
    
    const result = await client.query(
      'SELECT * FROM get_loan_balances($1)',
      [loanId]
    );
    
    if (result.rows.length === 0) {
      return {
        principalMinor: 0n,
        interestReceivableMinor: 0n,
        escrowLiabilityMinor: 0n,
        feesReceivableMinor: 0n,
        cashMinor: 0n
      };
    }
    
    const row = result.rows[0];
    return {
      principalMinor: BigInt(row.principal_minor || 0),
      interestReceivableMinor: BigInt(row.interest_receivable_minor || 0),
      escrowLiabilityMinor: BigInt(row.escrow_liability_minor || 0),
      feesReceivableMinor: BigInt(row.fees_receivable_minor || 0),
      cashMinor: BigInt(row.cash_minor || 0)
    };
  }
  
  async getEventEntries(eventId: string): Promise<LedgerEntry[]> {
    const client = this.client || this.pool;
    
    const result = await client.query(
      `SELECT entry_id, event_id, loan_id, account::text as account, 
              debit_minor, credit_minor, currency, memo, created_at
       FROM ledger_entry
       WHERE event_id = $1
       ORDER BY created_at`,
      [eventId]
    );
    
    return result.rows.map(row => ({
      entryId: row.entry_id,
      eventId: row.event_id,
      loanId: row.loan_id,
      account: row.account as GLAccount,
      debitMinor: BigInt(row.debit_minor || 0),
      creditMinor: BigInt(row.credit_minor || 0),
      currency: row.currency,
      memo: row.memo,
      createdAt: row.created_at
    }));
  }
  
  /**
   * Get account balance for a specific account and loan
   */
  async getAccountBalance(loanId: number, account: GLAccount): Promise<bigint> {
    const client = this.client || this.pool;
    
    const result = await client.query(
      `SELECT COALESCE(SUM(debit_minor - credit_minor), 0) as balance
       FROM ledger_entry
       WHERE loan_id = $1 AND account = $2::gl_account
         AND event_id IN (SELECT event_id FROM ledger_event WHERE finalized_at IS NOT NULL)`,
      [loanId, account]
    );
    
    return BigInt(result.rows[0]?.balance || 0);
  }
  
  /**
   * Get all events for a loan
   */
  async getLoanEvents(loanId: number, limit: number = 100): Promise<Array<{
    eventId: string;
    effectiveDate: string;
    schema: string;
    correlationId: string;
    finalizedAt?: string;
  }>> {
    const client = this.client || this.pool;
    
    const result = await client.query(
      `SELECT event_id, effective_date, schema, correlation_id, finalized_at
       FROM ledger_event
       WHERE loan_id = $1
       ORDER BY effective_date DESC, created_at DESC
       LIMIT $2`,
      [loanId, limit]
    );
    
    return result.rows.map(row => ({
      eventId: row.event_id,
      effectiveDate: row.effective_date,
      schema: row.schema,
      correlationId: row.correlation_id,
      finalizedAt: row.finalized_at
    }));
  }
  
  /**
   * Check if correlation ID exists (for idempotency)
   */
  async correlationIdExists(correlationId: string): Promise<boolean> {
    const client = this.client || this.pool;
    
    const result = await client.query(
      'SELECT 1 FROM ledger_event WHERE correlation_id = $1 LIMIT 1',
      [correlationId]
    );
    
    return result.rows.length > 0;
  }
  
  /**
   * Get trial balance for all loans
   */
  async getTrialBalance(): Promise<Array<{
    account: GLAccount;
    debitTotal: bigint;
    creditTotal: bigint;
    balance: bigint;
  }>> {
    const client = this.client || this.pool;
    
    const result = await client.query(`
      SELECT 
        account::text as account,
        COALESCE(SUM(debit_minor), 0) as debit_total,
        COALESCE(SUM(credit_minor), 0) as credit_total,
        COALESCE(SUM(debit_minor - credit_minor), 0) as balance
      FROM ledger_entry
      WHERE event_id IN (SELECT event_id FROM ledger_event WHERE finalized_at IS NOT NULL)
      GROUP BY account
      ORDER BY account
    `);
    
    return result.rows.map(row => ({
      account: row.account as GLAccount,
      debitTotal: BigInt(row.debit_total),
      creditTotal: BigInt(row.credit_total),
      balance: BigInt(row.balance)
    }));
  }
}