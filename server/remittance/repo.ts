import { Pool } from '@neondatabase/serverless';
import {
  InvestorContract,
  InvestorWaterfallRule,
  RemittanceCycle,
  RemittanceItem,
  RemittanceExport,
  RemitStatus
} from './types.js';
import { ulid } from 'ulid';
import { PgLedgerRepository } from '../db/ledger-repository.js';
import { createHash } from 'crypto';

export class RemittanceRepository {
  constructor(private pool: Pool, private ledgerRepo: PgLedgerRepository) {}

  // Contract management
  async createContract(contract: Omit<InvestorContract, 'contract_id' | 'created_at'>): Promise<InvestorContract> {
    const contractId = ulid();
    const result = await this.pool.query(
      `INSERT INTO investor_contract 
       (contract_id, investor_id, product_code, method, remittance_day, cutoff_day,
        custodial_bank_acct_id, servicer_fee_bps, late_fee_split_bps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        contractId,
        contract.investor_id,
        contract.product_code,
        contract.method,
        contract.remittance_day,
        contract.cutoff_day,
        contract.custodial_bank_acct_id,
        contract.servicer_fee_bps,
        contract.late_fee_split_bps
      ]
    );
    return result.rows[0];
  }

  async getContract(contractId: string): Promise<InvestorContract | null> {
    const result = await this.pool.query(
      'SELECT * FROM investor_contract WHERE contract_id = $1',
      [contractId]
    );
    return result.rows[0] || null;
  }

  async getContractsByInvestor(investorId: string): Promise<InvestorContract[]> {
    const result = await this.pool.query(
      'SELECT * FROM investor_contract WHERE investor_id = $1',
      [investorId]
    );
    return result.rows;
  }

  // Waterfall rules
  async createWaterfallRule(rule: Omit<InvestorWaterfallRule, 'rule_id' | 'created_at'>): Promise<InvestorWaterfallRule> {
    const ruleId = ulid();
    const result = await this.pool.query(
      `INSERT INTO investor_waterfall_rule 
       (rule_id, contract_id, rank, bucket, cap_minor)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [ruleId, rule.contract_id, rule.rank, rule.bucket, rule.cap_minor || null]
    );
    return result.rows[0];
  }

  async getWaterfallRules(contractId: string): Promise<InvestorWaterfallRule[]> {
    const result = await this.pool.query(
      'SELECT * FROM investor_waterfall_rule WHERE contract_id = $1 ORDER BY rank',
      [contractId]
    );
    return result.rows;
  }

  // Remittance cycles
  async createCycle(cycle: {
    contractId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<RemittanceCycle> {
    const cycleId = ulid();
    const result = await this.pool.query(
      `INSERT INTO remittance_cycle 
       (cycle_id, contract_id, period_start, period_end, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [cycleId, cycle.contractId, cycle.periodStart, cycle.periodEnd, 'open']
    );
    return result.rows[0];
  }

  async getCycle(cycleId: string): Promise<RemittanceCycle | null> {
    const result = await this.pool.query(
      'SELECT * FROM remittance_cycle WHERE cycle_id = $1',
      [cycleId]
    );
    return result.rows[0] || null;
  }

  async getCurrentCycle(contractId: string): Promise<RemittanceCycle | null> {
    const result = await this.pool.query(
      `SELECT * FROM remittance_cycle 
       WHERE contract_id = $1 AND status IN ('open', 'locked')
       ORDER BY period_start DESC
       LIMIT 1`,
      [contractId]
    );
    return result.rows[0] || null;
  }

  async updateCycleStatus(cycleId: string, status: RemitStatus): Promise<void> {
    await this.pool.query(
      'UPDATE remittance_cycle SET status = $1 WHERE cycle_id = $2',
      [status, cycleId]
    );
  }

  async updateCycleTotals(
    cycleId: string,
    totals: {
      principal: string;
      interest: string;
      fees: string;
      servicerFee: string;
      investorDue: string;
    }
  ): Promise<void> {
    await this.pool.query(
      `UPDATE remittance_cycle 
       SET total_principal_minor = $1,
           total_interest_minor = $2,
           total_fees_minor = $3,
           servicer_fee_minor = $4,
           investor_due_minor = $5
       WHERE cycle_id = $6`,
      [
        totals.principal,
        totals.interest,
        totals.fees,
        totals.servicerFee,
        totals.investorDue,
        cycleId
      ]
    );
  }

  // Remittance items
  async createItem(item: Omit<RemittanceItem, 'item_id'>): Promise<RemittanceItem> {
    const itemId = ulid();
    const result = await this.pool.query(
      `INSERT INTO remittance_item 
       (item_id, cycle_id, loan_id, principal_minor, interest_minor, 
        fees_minor, investor_share_minor, servicer_fee_minor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        itemId,
        item.cycle_id,
        item.loan_id || null,
        item.principal_minor,
        item.interest_minor,
        item.fees_minor,
        item.investor_share_minor,
        item.servicer_fee_minor
      ]
    );
    return result.rows[0];
  }

  async getItems(cycleId: string): Promise<RemittanceItem[]> {
    const result = await this.pool.query(
      'SELECT * FROM remittance_item WHERE cycle_id = $1',
      [cycleId]
    );
    return result.rows;
  }

  // Export management
  async createExport(cycleId: string, format: 'csv' | 'xml', data: Buffer): Promise<RemittanceExport> {
    const exportId = ulid();
    const hash = createHash('sha256').update(data).digest('hex');
    
    const result = await this.pool.query(
      `INSERT INTO remittance_export 
       (export_id, cycle_id, format, file_hash, bytes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [exportId, cycleId, format, hash, data]
    );
    return result.rows[0];
  }

  async getExport(exportId: string): Promise<RemittanceExport | null> {
    const result = await this.pool.query(
      'SELECT * FROM remittance_export WHERE export_id = $1',
      [exportId]
    );
    return result.rows[0] || null;
  }

  // Loan collections for period
  async getLoanCollections(contractId: string, periodStart: Date, periodEnd: Date): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
         l.id as loan_id,
         l.loan_number,
         l.current_balance_minor,
         COALESCE(SUM(CASE WHEN le.account_name = 'cash' THEN le.credit_minor - le.debit_minor ELSE 0 END), 0) as collected_minor,
         COALESCE(SUM(CASE WHEN le.account_name = 'interest_receivable' THEN le.debit_minor - le.credit_minor ELSE 0 END), 0) as interest_minor,
         COALESCE(SUM(CASE WHEN le.account_name = 'principal' THEN le.credit_minor - le.debit_minor ELSE 0 END), 0) as principal_minor,
         COALESCE(SUM(CASE WHEN le.account_name = 'late_fee_income' THEN le.credit_minor - le.debit_minor ELSE 0 END), 0) as fees_minor
       FROM loans l
       JOIN investors io ON l.id = io.loan_id
       JOIN investor_contract ic ON io.investor_id = ic.investor_id
       LEFT JOIN ledger_entry le ON l.id = le.loan_id 
         AND le.transaction_date >= $2 
         AND le.transaction_date <= $3
       WHERE ic.contract_id = $1
       GROUP BY l.id, l.loan_number, l.current_balance_minor`,
      [contractId, periodStart, periodEnd]
    );
    return result.rows;
  }

  // Process remittance with ledger entries
  async processRemittance(cycleId: string): Promise<void> {
    const cycle = await this.getCycle(cycleId);
    if (!cycle || cycle.status !== 'locked') {
      throw new Error('Cycle must be locked before processing');
    }

    const contract = await this.getContract(cycle.contract_id);
    if (!contract) {
      throw new Error('Contract not found');
    }

    // Create ledger entries for investor payables
    const entries = [
      {
        account_name: 'cash' as const,
        debit_minor: BigInt(cycle.investor_due_minor),
        credit_minor: 0n,
        description: `Remittance to investor for cycle ${cycleId}`
      },
      {
        account_name: 'investor_payable_principal' as const,
        debit_minor: BigInt(cycle.total_principal_minor),
        credit_minor: 0n,
        description: `Principal remittance for cycle ${cycleId}`
      },
      {
        account_name: 'investor_payable_interest' as const,
        debit_minor: BigInt(cycle.total_interest_minor),
        credit_minor: 0n,
        description: `Interest remittance for cycle ${cycleId}`
      },
      {
        account_name: 'servicer_fee_income' as const,
        debit_minor: 0n,
        credit_minor: BigInt(cycle.servicer_fee_minor),
        description: `Servicer fee for cycle ${cycleId}`
      }
    ];

    await this.ledgerRepo.createEntries({
      reference_type: 'remittance',
      reference_id: cycleId,
      entries
    });

    await this.updateCycleStatus(cycleId, 'sent');
  }
}