/**
 * Remittance Reconciliation Report
 * Ties remittance items to GL movements for zero-variance reconciliation
 */

import { Pool } from '@neondatabase/serverless';
import { ulid } from 'ulid';
import { Decimal } from 'decimal.js';

export interface ReconciliationSnapshot {
  snapshot_id: string;
  cycle_id: string;
  period_start: Date;
  period_end: Date;
  
  // Remittance side totals (from remittance_item)
  remit_investor_share_minor: string;
  remit_servicer_fee_minor: string;
  remit_total_minor: string;
  
  // GL side totals (from ledger_entry)
  gl_investor_payable_minor: string;
  gl_servicer_income_minor: string;
  gl_total_minor: string;
  
  // Signed differences (GL - Remittance)
  diff_investor_minor: string;
  diff_servicer_minor: string;
  diff_total_minor: string;
  
  // Reconciliation status
  is_balanced: boolean;
  variance_threshold_minor: string;
  reconciled_at: Date;
  reconciled_by: string;
  notes?: string;
}

export class ReconciliationService {
  constructor(private pool: Pool) {}

  /**
   * Create reconciliation snapshot table if it doesn't exist
   */
  async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS remittance_recon_snapshot (
        snapshot_id VARCHAR(26) PRIMARY KEY,
        cycle_id VARCHAR(26) NOT NULL,
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        
        -- Remittance side totals
        remit_investor_share_minor BIGINT NOT NULL,
        remit_servicer_fee_minor BIGINT NOT NULL,
        remit_total_minor BIGINT NOT NULL,
        
        -- GL side totals
        gl_investor_payable_minor BIGINT NOT NULL,
        gl_servicer_income_minor BIGINT NOT NULL,
        gl_total_minor BIGINT NOT NULL,
        
        -- Signed differences
        diff_investor_minor BIGINT NOT NULL,
        diff_servicer_minor BIGINT NOT NULL,
        diff_total_minor BIGINT NOT NULL,
        
        -- Status
        is_balanced BOOLEAN NOT NULL,
        variance_threshold_minor BIGINT DEFAULT 0,
        reconciled_at TIMESTAMP DEFAULT NOW(),
        reconciled_by VARCHAR(100),
        notes TEXT,
        
        -- Indexes
        INDEX idx_cycle_id (cycle_id),
        INDEX idx_period (period_start, period_end),
        INDEX idx_balanced (is_balanced)
      )
    `);
  }

  /**
   * Generate reconciliation report for a remittance cycle
   */
  async generateReconciliation(
    cycleId: string,
    userId: string
  ): Promise<ReconciliationSnapshot> {
    // Get cycle details
    const cycleResult = await this.pool.query(
      `SELECT * FROM remittance_cycle WHERE cycle_id = $1`,
      [cycleId]
    );
    
    if (cycleResult.rows.length === 0) {
      throw new Error(`Cycle ${cycleId} not found`);
    }
    
    const cycle = cycleResult.rows[0];
    
    // Calculate remittance side totals from remittance_item
    const remitResult = await this.pool.query(`
      SELECT 
        COALESCE(SUM(investor_share_minor::BIGINT), 0) as investor_total,
        COALESCE(SUM(servicer_fee_minor::BIGINT), 0) as servicer_total
      FROM remittance_item
      WHERE cycle_id = $1
    `, [cycleId]);
    
    const remitTotals = remitResult.rows[0];
    const remitInvestor = new Decimal(remitTotals.investor_total);
    const remitServicer = new Decimal(remitTotals.servicer_total);
    const remitTotal = remitInvestor.plus(remitServicer);
    
    // Calculate GL side totals from ledger_entry
    // Investor payables (credit balance increase in liability account 2110)
    const glPayableResult = await this.pool.query(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN entry_type = 'CREDIT' THEN amount_minor::BIGINT
            WHEN entry_type = 'DEBIT' THEN -amount_minor::BIGINT
            ELSE 0
          END
        ), 0) as payable_movement
      FROM ledger_entry
      WHERE account_code = '2110' -- Investor Payables account
        AND effective_date >= $1
        AND effective_date <= $2
        AND metadata->>'cycle_id' = $3
    `, [cycle.period_start, cycle.period_end, cycleId]);
    
    // Servicer fee income (credit balance increase in revenue account 4020)
    const glIncomeResult = await this.pool.query(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN entry_type = 'CREDIT' THEN amount_minor::BIGINT
            WHEN entry_type = 'DEBIT' THEN -amount_minor::BIGINT
            ELSE 0
          END
        ), 0) as income_movement
      FROM ledger_entry
      WHERE account_code = '4020' -- Servicer Fee Income account
        AND effective_date >= $1
        AND effective_date <= $2
        AND metadata->>'cycle_id' = $3
    `, [cycle.period_start, cycle.period_end, cycleId]);
    
    const glPayable = new Decimal(glPayableResult.rows[0].payable_movement);
    const glIncome = new Decimal(glIncomeResult.rows[0].income_movement);
    const glTotal = glPayable.plus(glIncome);
    
    // Calculate differences (GL - Remittance)
    const diffInvestor = glPayable.minus(remitInvestor);
    const diffServicer = glIncome.minus(remitServicer);
    const diffTotal = glTotal.minus(remitTotal);
    
    // Check if balanced (threshold is zero)
    const threshold = new Decimal(0);
    const isBalanced = 
      diffInvestor.abs().lte(threshold) &&
      diffServicer.abs().lte(threshold) &&
      diffTotal.abs().lte(threshold);
    
    // Store snapshot
    const snapshotId = ulid();
    const snapshot: ReconciliationSnapshot = {
      snapshot_id: snapshotId,
      cycle_id: cycleId,
      period_start: cycle.period_start,
      period_end: cycle.period_end,
      
      remit_investor_share_minor: remitInvestor.toFixed(0),
      remit_servicer_fee_minor: remitServicer.toFixed(0),
      remit_total_minor: remitTotal.toFixed(0),
      
      gl_investor_payable_minor: glPayable.toFixed(0),
      gl_servicer_income_minor: glIncome.toFixed(0),
      gl_total_minor: glTotal.toFixed(0),
      
      diff_investor_minor: diffInvestor.toFixed(0),
      diff_servicer_minor: diffServicer.toFixed(0),
      diff_total_minor: diffTotal.toFixed(0),
      
      is_balanced: isBalanced,
      variance_threshold_minor: threshold.toFixed(0),
      reconciled_at: new Date(),
      reconciled_by: userId,
      notes: isBalanced ? 'Reconciliation passed - zero variance' : 'RECONCILIATION FAILED - variance detected'
    };
    
    // Insert snapshot
    await this.pool.query(`
      INSERT INTO remittance_recon_snapshot (
        snapshot_id, cycle_id, period_start, period_end,
        remit_investor_share_minor, remit_servicer_fee_minor, remit_total_minor,
        gl_investor_payable_minor, gl_servicer_income_minor, gl_total_minor,
        diff_investor_minor, diff_servicer_minor, diff_total_minor,
        is_balanced, variance_threshold_minor, reconciled_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      snapshot.snapshot_id,
      snapshot.cycle_id,
      snapshot.period_start,
      snapshot.period_end,
      snapshot.remit_investor_share_minor,
      snapshot.remit_servicer_fee_minor,
      snapshot.remit_total_minor,
      snapshot.gl_investor_payable_minor,
      snapshot.gl_servicer_income_minor,
      snapshot.gl_total_minor,
      snapshot.diff_investor_minor,
      snapshot.diff_servicer_minor,
      snapshot.diff_total_minor,
      snapshot.is_balanced,
      snapshot.variance_threshold_minor,
      snapshot.reconciled_by,
      snapshot.notes
    ]);
    
    // Log results
    console.log('[Reconciliation] Report generated:', {
      cycleId,
      isBalanced,
      remittance: {
        investor: remitInvestor.toFixed(2),
        servicer: remitServicer.toFixed(2),
        total: remitTotal.toFixed(2)
      },
      gl: {
        payable: glPayable.toFixed(2),
        income: glIncome.toFixed(2),
        total: glTotal.toFixed(2)
      },
      differences: {
        investor: diffInvestor.toFixed(2),
        servicer: diffServicer.toFixed(2),
        total: diffTotal.toFixed(2)
      }
    });
    
    return snapshot;
  }

  /**
   * Get reconciliation history for a cycle
   */
  async getReconciliationHistory(cycleId: string): Promise<ReconciliationSnapshot[]> {
    const result = await this.pool.query(
      `SELECT * FROM remittance_recon_snapshot 
       WHERE cycle_id = $1 
       ORDER BY reconciled_at DESC`,
      [cycleId]
    );
    return result.rows;
  }

  /**
   * Get latest reconciliation for a cycle
   */
  async getLatestReconciliation(cycleId: string): Promise<ReconciliationSnapshot | null> {
    const result = await this.pool.query(
      `SELECT * FROM remittance_recon_snapshot 
       WHERE cycle_id = $1 
       ORDER BY reconciled_at DESC 
       LIMIT 1`,
      [cycleId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all unbalanced reconciliations
   */
  async getUnbalancedReconciliations(): Promise<ReconciliationSnapshot[]> {
    const result = await this.pool.query(
      `SELECT * FROM remittance_recon_snapshot 
       WHERE is_balanced = false 
       ORDER BY reconciled_at DESC`
    );
    return result.rows;
  }
}