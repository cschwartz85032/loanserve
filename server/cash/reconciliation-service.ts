/**
 * Bank Reconciliation and Matching Service
 * Handles automatic matching and exception management
 */

import { Pool, PoolClient } from 'pg';
import { CashRepo } from './repo';
import { StatementParser } from './statement-parser';
import {
  BankStatementFile,
  BankTxn,
  BankStmtFormat,
  CashMatchCandidate,
  ReconException,
  Minor
} from './types';
import { MessagePublisher } from '../services/message-publisher';
import { PgLedgerRepository } from '../db/ledger-repository';
import { postEvent } from '../domain/posting';

export class ReconciliationService {
  private repo: CashRepo;
  private parser: StatementParser;
  private publisher: MessagePublisher;
  private ledgerRepo: PgLedgerRepository;
  private matchThreshold = 85;
  private dateWindowDays = 3;

  constructor(private pool: Pool) {
    this.repo = new CashRepo(pool);
    this.parser = new StatementParser();
    this.publisher = new MessagePublisher(pool);
    this.ledgerRepo = new PgLedgerRepository(pool);
  }

  /**
   * Ingest bank statement file
   */
  async ingestStatement(
    bankAcctId: string,
    format: BankStmtFormat,
    asOfDate: string,
    rawBytes: Buffer
  ): Promise<void> {
    await this.repo.withTx(async (client) => {
      // Store the raw file
      const stmtFileId = await this.repo.ingestBankStatement(client, {
        bank_acct_id: bankAcctId,
        format,
        as_of_date: asOfDate,
        raw_bytes: rawBytes,
        file_hash: '' // Hash is calculated in repo
      });

      if (!stmtFileId) {
        console.log(`[Reconciliation] Statement already ingested for ${asOfDate}`);
        return;
      }

      // Parse transactions
      const transactions = await this.parser.parseStatement(rawBytes, format, bankAcctId);

      // Store transactions
      for (const txn of transactions) {
        const bankTxnId = await this.repo.addBankTransaction(client, {
          stmt_file_id: stmtFileId,
          bank_acct_id: bankAcctId,
          posted_date: txn.postedDate,
          value_date: txn.valueDate,
          amount_minor: txn.amountMinor,
          type: txn.type,
          bank_ref: txn.bankRef,
          description: txn.description,
          matched: false,
          matched_event_id: undefined
        });

        // Generate match candidates
        await this.generateMatchCandidates(client, bankTxnId, txn);
      }

      // Publish event
      await this.publisher.publish({
        exchange: 'cash.events',
        routingKey: 'cash.stmt.ingested.v1',
        message: {
          stmt_file_id: stmtFileId,
          bank_acct_id: bankAcctId,
          format,
          transaction_count: transactions.length
        },
        correlationId: `stmt:ingest:${stmtFileId}`
      });

      console.log(`[Reconciliation] Ingested ${transactions.length} transactions from statement`);
    });

    // Run auto-matching
    await this.autoMatchTransactions(bankAcctId);
  }

  /**
   * Generate match candidates for a bank transaction
   */
  private async generateMatchCandidates(
    client: PoolClient,
    bankTxnId: string,
    txn: BankTxn | any
  ): Promise<void> {
    // Get bank account GL mapping
    const bankAccount = await this.repo.getBankAccount(txn.bank_acct_id || txn.bankAcctId);
    if (!bankAccount) return;

    const glAccount = bankAccount.gl_cash_account;

    // Search ledger events within date window
    const startDate = new Date(txn.postedDate);
    const endDate = new Date(txn.postedDate);
    startDate.setDate(startDate.getDate() - this.dateWindowDays);
    endDate.setDate(endDate.getDate() + this.dateWindowDays);

    const eventsResult = await client.query(`
      SELECT DISTINCT
        le.event_id,
        le.correlation_id,
        le.event_date,
        le.memo,
        SUM(CASE 
          WHEN len.account = $1 AND len.debit_minor > 0 THEN len.debit_minor
          WHEN len.account = $1 AND len.credit_minor > 0 THEN -len.credit_minor
          ELSE 0
        END) as net_amount
      FROM ledger_event le
      JOIN ledger_entry len ON len.event_id = le.event_id
      WHERE le.event_date BETWEEN $2 AND $3
        AND len.account = $1
      GROUP BY le.event_id, le.correlation_id, le.event_date, le.memo
      HAVING SUM(CASE 
        WHEN len.account = $1 AND len.debit_minor > 0 THEN len.debit_minor
        WHEN len.account = $1 AND len.credit_minor > 0 THEN -len.credit_minor
        ELSE 0
      END) != 0
      ORDER BY le.event_date DESC
      LIMIT 20
    `, [glAccount, startDate.toISOString(), endDate.toISOString()]);

    const candidates: Array<{ eventId: string; score: number; reason: string }> = [];

    for (const event of eventsResult.rows) {
      let score = 0;
      const reasons: string[] = [];

      // Amount matching
      const eventAmount = BigInt(event.net_amount);
      const txnAmount = BigInt(txn.amount_minor || txn.amountMinor);

      // For bank transactions:
      // - Credits (deposits) should match ledger debits to cash
      // - Debits (withdrawals) should match ledger credits from cash
      const expectedAmount = txn.type === 'credit' ? txnAmount : -txnAmount;

      if (eventAmount === expectedAmount) {
        score += 60;
        reasons.push('Amount exact match');
      } else {
        const diff = Math.abs(Number(eventAmount - expectedAmount));
        const pct = diff / Number(txnAmount);
        if (pct < 0.01) {
          score += 50;
          reasons.push('Amount within 1%');
        } else if (pct < 0.05) {
          score += 30;
          reasons.push('Amount within 5%');
        }
      }

      // Date matching
      const daysDiff = Math.abs(
        (new Date(event.event_date).getTime() - new Date(txn.postedDate).getTime()) / 
        (1000 * 60 * 60 * 24)
      );

      if (daysDiff === 0) {
        score += 30;
        reasons.push('Same day');
      } else if (daysDiff <= 1) {
        score += 25;
        reasons.push('Within 1 day');
      } else if (daysDiff <= 3) {
        score += 10;
        reasons.push('Within 3 days');
      }

      // Reference matching
      if (txn.bank_ref || txn.bankRef) {
        const ref = (txn.bank_ref || txn.bankRef).toLowerCase();
        if (event.correlation_id && event.correlation_id.toLowerCase().includes(ref)) {
          score += 15;
          reasons.push('Reference match in correlation ID');
        }
        if (event.memo && event.memo.toLowerCase().includes(ref)) {
          score += 10;
          reasons.push('Reference match in memo');
        }
      }

      // Check for correlation ID in description
      if (txn.description && event.correlation_id) {
        if (txn.description.toLowerCase().includes(event.correlation_id.toLowerCase())) {
          score += 100; // Direct match
          reasons.push('Correlation ID found in description');
        }
      }

      if (score > 0) {
        candidates.push({
          eventId: event.event_id,
          score,
          reason: reasons.join(', ')
        });
      }
    }

    // Sort by score and store top 3
    candidates.sort((a, b) => b.score - a.score);
    for (const candidate of candidates.slice(0, 3)) {
      await this.repo.addMatchCandidate(client, {
        bank_txn_id: bankTxnId,
        event_id: candidate.eventId,
        score: candidate.score,
        reason: candidate.reason
      });
    }
  }

  /**
   * Auto-match transactions
   */
  async autoMatchTransactions(bankAcctId?: string): Promise<number> {
    const unmatchedTxns = await this.repo.getUnmatchedTransactions(bankAcctId);
    let matchedCount = 0;

    for (const txn of unmatchedTxns) {
      const topCandidate = await this.repo.getTopMatchCandidate(txn.bank_txn_id);

      if (topCandidate && topCandidate.score >= this.matchThreshold) {
        // Auto-match
        await this.repo.withTx(async (client) => {
          await this.repo.markTransactionMatched(
            client,
            txn.bank_txn_id,
            topCandidate.event_id!
          );

          await this.publisher.publish({
            exchange: 'cash.events',
            routingKey: 'cash.reconciled.v1',
            message: {
              bank_txn_id: txn.bank_txn_id,
              event_id: topCandidate.event_id,
              score: topCandidate.score,
              auto_matched: true
            },
            correlationId: `recon:auto:${txn.bank_txn_id}`
          });
        });

        matchedCount++;
        console.log(`[Reconciliation] Auto-matched transaction ${txn.bank_txn_id} with score ${topCandidate.score}`);
      } else {
        // Create exception
        const variance = topCandidate?.event_id
          ? await this.calculateVariance(txn.bank_txn_id, topCandidate.event_id)
          : txn.amount_minor;

        await this.repo.withTx(async (client) => {
          await this.repo.createReconException(client, {
            bank_txn_id: txn.bank_txn_id,
            variance_minor: variance,
            status: 'new',
            note: topCandidate 
              ? `Best match score: ${topCandidate.score}`
              : 'No matching candidates found'
          });
        });

        console.log(`[Reconciliation] Created exception for transaction ${txn.bank_txn_id}`);
      }
    }

    console.log(`[Reconciliation] Auto-matched ${matchedCount} of ${unmatchedTxns.length} transactions`);
    return matchedCount;
  }

  /**
   * Manual match
   */
  async manualMatch(bankTxnId: string, eventId: string): Promise<void> {
    await this.repo.withTx(async (client) => {
      await this.repo.markTransactionMatched(client, bankTxnId, eventId);

      await this.publisher.publish({
        exchange: 'cash.events',
        routingKey: 'cash.reconciled.v1',
        message: {
          bank_txn_id: bankTxnId,
          event_id: eventId,
          auto_matched: false
        },
        correlationId: `recon:manual:${bankTxnId}`
      });
    });

    console.log(`[Reconciliation] Manually matched transaction ${bankTxnId} to event ${eventId}`);
  }

  /**
   * Write off exception
   */
  async writeOff(reconId: string, reason: string): Promise<void> {
    await this.repo.withTx(async (client) => {
      // Get exception and bank transaction details
      const exceptionResult = await client.query(`
        SELECT re.*, bt.amount_minor, bt.type, bt.bank_acct_id
        FROM recon_exception re
        JOIN bank_txn bt ON bt.bank_txn_id = re.bank_txn_id
        WHERE re.recon_id = $1
      `, [reconId]);

      if (exceptionResult.rows.length === 0) {
        throw new Error(`Exception ${reconId} not found`);
      }

      const exception = exceptionResult.rows[0];
      const bankAccount = await this.repo.getBankAccount(exception.bank_acct_id);
      
      if (!bankAccount) {
        throw new Error(`Bank account ${exception.bank_acct_id} not found`);
      }

      // Post adjusting entry
      const correlationId = `writeoff:${exception.bank_txn_id}`;
      const amount = BigInt(exception.amount_minor);

      if (exception.type === 'fee') {
        // Bank fee write-off
        await postEvent(this.ledgerRepo, {
          loanId: 0, // System transaction
          effectiveDate: new Date().toISOString().split('T')[0],
          correlationId,
          schema: 'posting.bank_fee.v1',
          currency: 'USD',
          lines: [
            {
              account: 'fee_expense' as const,
              debitMinor: amount,
              memo: `Bank fee: ${reason}`
            },
            {
              account: bankAccount.gl_cash_account as any,
              creditMinor: amount,
              memo: `Bank fee writeoff`
            }
          ]
        });
      }

      // Mark as written off
      await this.repo.updateExceptionStatus(client, reconId, 'written_off', reason);

      // Mark transaction as matched
      await this.repo.markTransactionMatched(client, exception.bank_txn_id, correlationId);
    });

    console.log(`[Reconciliation] Written off exception ${reconId}: ${reason}`);
  }

  private async calculateVariance(bankTxnId: string, eventId: string): Promise<Minor> {
    const txnResult = await this.pool.query(`
      SELECT amount_minor FROM bank_txn WHERE bank_txn_id = $1
    `, [bankTxnId]);

    const eventResult = await this.pool.query(`
      SELECT SUM(debit_minor - credit_minor) as net_amount
      FROM ledger_entry WHERE event_id = $1
    `, [eventId]);

    const bankAmount = BigInt(txnResult.rows[0]?.amount_minor || 0);
    const eventAmount = BigInt(eventResult.rows[0]?.net_amount || 0);

    return bankAmount - eventAmount;
  }
}