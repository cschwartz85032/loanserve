/**
 * Cash Management Repository
 * Handles database operations for bank accounts, ACH, and reconciliation
 */

import { Pool, PoolClient } from 'pg';
import {
  BankAccount,
  AchBatch,
  AchEntry,
  AchReturn,
  BankStatementFile,
  BankTxn,
  CashMatchCandidate,
  ReconException,
  UUID,
  Minor,
  AchBatchStatus,
  ReconStatus
} from './types';
import { createHash } from 'crypto';

export class CashRepo {
  constructor(private pool: Pool) {}

  async withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Bank Account operations
  async createBankAccount(
    client: PoolClient,
    account: Omit<BankAccount, 'bank_acct_id' | 'created_at'>
  ): Promise<string> {
    const result = await client.query(`
      INSERT INTO bank_account (
        name, bank_id, account_number_mask, currency,
        type, gl_cash_account, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING bank_acct_id
    `, [
      account.name,
      account.bank_id,
      account.account_number_mask,
      account.currency,
      account.type,
      account.gl_cash_account,
      account.active
    ]);

    return result.rows[0].bank_acct_id;
  }

  async getBankAccount(bankAcctId: string): Promise<BankAccount | null> {
    const result = await this.pool.query(`
      SELECT * FROM bank_account WHERE bank_acct_id = $1
    `, [bankAcctId]);

    return result.rows[0] || null;
  }

  // ACH Batch operations
  async createAchBatch(
    client: PoolClient,
    batch: Omit<AchBatch, 'ach_batch_id' | 'created_at'>
  ): Promise<string> {
    const result = await client.query(`
      INSERT INTO ach_batch (
        bank_acct_id, service_class, company_id, company_name,
        effective_entry_date, created_by, total_entries, 
        total_amount_minor, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ach_batch_id
    `, [
      batch.bank_acct_id,
      batch.service_class,
      batch.company_id,
      batch.company_name,
      batch.effective_entry_date,
      batch.created_by,
      batch.total_entries,
      batch.total_amount_minor.toString(),
      batch.status
    ]);

    return result.rows[0].ach_batch_id;
  }

  async addAchEntry(
    client: PoolClient,
    entry: Omit<AchEntry, 'ach_entry_id' | 'created_at'>
  ): Promise<string> {
    const result = await client.query(`
      INSERT INTO ach_entry (
        ach_batch_id, loan_id, txn_code, rdfi_routing,
        dda_account_mask, amount_minor, trace_number,
        addenda, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ach_entry_id
    `, [
      entry.ach_batch_id,
      entry.loan_id || null,
      entry.txn_code,
      entry.rdfi_routing,
      entry.dda_account_mask,
      entry.amount_minor.toString(),
      entry.trace_number || null,
      entry.addenda || null,
      entry.idempotency_key
    ]);

    return result.rows[0].ach_entry_id;
  }

  async sealAchBatch(
    client: PoolClient,
    achBatchId: string
  ): Promise<void> {
    // Calculate totals
    const entriesResult = await client.query(`
      SELECT COUNT(*) as count, SUM(amount_minor) as total
      FROM ach_entry WHERE ach_batch_id = $1
    `, [achBatchId]);

    const { count, total } = entriesResult.rows[0];

    // Assign trace numbers
    const odfiRouting = '123456789'; // Should come from config
    const entries = await client.query(`
      SELECT ach_entry_id FROM ach_entry
      WHERE ach_batch_id = $1 AND trace_number IS NULL
      ORDER BY created_at
    `, [achBatchId]);

    for (let i = 0; i < entries.rows.length; i++) {
      const traceNumber = odfiRouting + String(i + 1).padStart(7, '0');
      await client.query(`
        UPDATE ach_entry SET trace_number = $1
        WHERE ach_entry_id = $2
      `, [traceNumber, entries.rows[i].ach_entry_id]);
    }

    // Update batch status
    await client.query(`
      UPDATE ach_batch 
      SET status = 'sealed',
          total_entries = $1,
          total_amount_minor = $2
      WHERE ach_batch_id = $3
    `, [count, total || '0', achBatchId]);
  }

  async updateBatchStatus(
    client: PoolClient,
    achBatchId: string,
    status: AchBatchStatus
  ): Promise<void> {
    await client.query(`
      UPDATE ach_batch SET status = $1
      WHERE ach_batch_id = $2
    `, [status, achBatchId]);
  }

  // ACH Returns
  async recordAchReturn(
    client: PoolClient,
    achReturn: Omit<AchReturn, 'ach_return_id' | 'created_at'>
  ): Promise<string> {
    const result = await client.query(`
      INSERT INTO ach_return (
        ach_entry_id, return_code, return_date,
        amount_minor, addenda, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (ach_entry_id) DO NOTHING
      RETURNING ach_return_id
    `, [
      achReturn.ach_entry_id,
      achReturn.return_code,
      achReturn.return_date,
      achReturn.amount_minor.toString(),
      achReturn.addenda || null,
      achReturn.processed_at || null
    ]);

    return result.rows[0]?.ach_return_id || null;
  }

  async findAchEntryByTrace(traceNumber: string): Promise<AchEntry | null> {
    const result = await this.pool.query(`
      SELECT * FROM ach_entry WHERE trace_number = $1
    `, [traceNumber]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      amount_minor: BigInt(row.amount_minor)
    };
  }

  // Bank Statement operations
  async ingestBankStatement(
    client: PoolClient,
    file: Omit<BankStatementFile, 'stmt_file_id' | 'created_at'>
  ): Promise<string> {
    const fileHash = createHash('sha256').update(file.raw_bytes).digest('hex');

    const result = await client.query(`
      INSERT INTO bank_statement_file (
        bank_acct_id, format, as_of_date,
        raw_bytes, file_hash
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (bank_acct_id, as_of_date, file_hash) DO NOTHING
      RETURNING stmt_file_id
    `, [
      file.bank_acct_id,
      file.format,
      file.as_of_date,
      file.raw_bytes,
      fileHash
    ]);

    return result.rows[0]?.stmt_file_id || null;
  }

  async addBankTransaction(
    client: PoolClient,
    txn: Omit<BankTxn, 'bank_txn_id' | 'created_at'>
  ): Promise<string> {
    const result = await client.query(`
      INSERT INTO bank_txn (
        stmt_file_id, bank_acct_id, posted_date, value_date,
        amount_minor, type, bank_ref, description,
        matched, matched_event_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING bank_txn_id
    `, [
      txn.stmt_file_id,
      txn.bank_acct_id,
      txn.posted_date,
      txn.value_date || null,
      txn.amount_minor.toString(),
      txn.type,
      txn.bank_ref || null,
      txn.description || null,
      txn.matched,
      txn.matched_event_id || null
    ]);

    return result.rows[0].bank_txn_id;
  }

  async getUnmatchedTransactions(
    bankAcctId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<BankTxn[]> {
    let query = `
      SELECT * FROM bank_txn 
      WHERE matched = false
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (bankAcctId) {
      query += ` AND bank_acct_id = $${paramIndex++}`;
      params.push(bankAcctId);
    }

    if (startDate) {
      query += ` AND posted_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND posted_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` ORDER BY posted_date DESC`;

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      ...row,
      amount_minor: BigInt(row.amount_minor)
    }));
  }

  // Reconciliation operations
  async addMatchCandidate(
    client: PoolClient,
    candidate: Omit<CashMatchCandidate, 'candidate_id' | 'created_at'>
  ): Promise<void> {
    await client.query(`
      INSERT INTO cash_match_candidate (
        bank_txn_id, event_id, score, reason
      ) VALUES ($1, $2, $3, $4)
    `, [
      candidate.bank_txn_id,
      candidate.event_id || null,
      candidate.score,
      candidate.reason
    ]);
  }

  async getTopMatchCandidate(bankTxnId: string): Promise<CashMatchCandidate | null> {
    const result = await this.pool.query(`
      SELECT * FROM cash_match_candidate
      WHERE bank_txn_id = $1
      ORDER BY score DESC
      LIMIT 1
    `, [bankTxnId]);

    return result.rows[0] || null;
  }

  async markTransactionMatched(
    client: PoolClient,
    bankTxnId: string,
    eventId: string
  ): Promise<void> {
    await client.query(`
      UPDATE bank_txn 
      SET matched = true, matched_event_id = $1
      WHERE bank_txn_id = $2
    `, [eventId, bankTxnId]);

    // Remove exception if exists
    await client.query(`
      UPDATE recon_exception
      SET status = 'resolved'
      WHERE bank_txn_id = $1 AND status != 'resolved'
    `, [bankTxnId]);
  }

  async createReconException(
    client: PoolClient,
    exception: Omit<ReconException, 'recon_id' | 'created_at'>
  ): Promise<string> {
    const result = await client.query(`
      INSERT INTO recon_exception (
        bank_txn_id, variance_minor, status,
        assigned_to, note
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (bank_txn_id) 
      DO UPDATE SET
        variance_minor = EXCLUDED.variance_minor,
        status = CASE 
          WHEN recon_exception.status = 'resolved' THEN recon_exception.status
          ELSE EXCLUDED.status
        END,
        note = COALESCE(EXCLUDED.note, recon_exception.note)
      RETURNING recon_id
    `, [
      exception.bank_txn_id,
      exception.variance_minor.toString(),
      exception.status,
      exception.assigned_to || null,
      exception.note || null
    ]);

    return result.rows[0].recon_id;
  }

  async updateExceptionStatus(
    client: PoolClient,
    reconId: string,
    status: ReconStatus,
    note?: string
  ): Promise<void> {
    await client.query(`
      UPDATE recon_exception 
      SET status = $1, note = COALESCE($2, note)
      WHERE recon_id = $3
    `, [status, note || null, reconId]);
  }

  async getOpenExceptions(): Promise<ReconException[]> {
    const result = await this.pool.query(`
      SELECT re.*, bt.posted_date, bt.amount_minor as txn_amount,
             bt.type, bt.description
      FROM recon_exception re
      JOIN bank_txn bt ON bt.bank_txn_id = re.bank_txn_id
      WHERE re.status IN ('new', 'investigating')
      ORDER BY re.created_at DESC
    `);

    return result.rows.map(row => ({
      ...row,
      variance_minor: BigInt(row.variance_minor)
    }));
  }
}