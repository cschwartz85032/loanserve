/**
 * Payment Allocation Engine
 * Implements configurable allocation rules with exact rounding
 */

import { PoolClient } from 'pg';

export interface AllocationRule {
  priority: number;
  target: AllocationTarget;
  enabled: boolean;
}

export type AllocationTarget = 
  | 'late_fees'
  | 'accrued_interest' 
  | 'scheduled_principal'
  | 'escrow_shortage'
  | 'current_escrow'
  | 'unapplied_funds';

export interface AllocationResult {
  allocations: Array<{
    target: AllocationTarget;
    account: string;
    amount_cents: number;
  }>;
  total_allocated: number;
  unapplied: number;
}

export interface LoanBalances {
  loan_id: string;
  late_fees: number;
  accrued_interest: number;
  scheduled_principal: number;
  escrow_shortage: number;
  escrow_current: {
    tax: number;
    hazard: number;
    flood: number;
    mi: number;
  };
}

export class PaymentAllocationEngine {
  /**
   * Load allocation rules for loan (falls back to DEFAULT)
   */
  private async loadRules(
    client: PoolClient,
    loanId: string
  ): Promise<AllocationRule[]> {
    const result = await client.query(`
      SELECT priority, target, enabled
      FROM allocation_rules
      WHERE loan_id = $1 OR loan_id = 'DEFAULT'
      ORDER BY 
        CASE WHEN loan_id = $1 THEN 0 ELSE 1 END,
        priority
    `, [loanId]);

    // Use loan-specific rules if exist, otherwise DEFAULT
    const useLoanId = result.rows.some(r => r.loan_id === loanId) ? loanId : 'DEFAULT';
    
    return result.rows
      .filter(r => r.loan_id === useLoanId && r.enabled)
      .map(r => ({
        priority: r.priority,
        target: r.target as AllocationTarget,
        enabled: r.enabled
      }));
  }

  /**
   * Get current balances for allocation targets
   */
  private async getBalances(
    client: PoolClient,
    loanId: string
  ): Promise<LoanBalances> {
    // Get loan balances
    const loanResult = await client.query(`
      SELECT 
        COALESCE(late_fee_balance, 0) as late_fees,
        COALESCE(accrued_interest, 0) as accrued_interest,
        COALESCE(principal_balance, 0) as scheduled_principal
      FROM loans
      WHERE id = $1
    `, [loanId]);

    // Get escrow balances
    const escrowResult = await client.query(`
      SELECT 
        category,
        COALESCE(shortage_cents, 0) as shortage,
        COALESCE(target_balance_cents - balance_cents, 0) as current_due
      FROM escrow_accounts
      WHERE loan_id = $1
    `, [loanId]);

    const escrowMap = new Map(escrowResult.rows.map(r => [r.category, r]));

    return {
      loan_id: loanId,
      late_fees: loanResult.rows[0]?.late_fees || 0,
      accrued_interest: loanResult.rows[0]?.accrued_interest || 0,
      scheduled_principal: loanResult.rows[0]?.scheduled_principal || 0,
      escrow_shortage: escrowResult.rows.reduce((sum, r) => sum + r.shortage, 0),
      escrow_current: {
        tax: escrowMap.get('tax')?.current_due || 0,
        hazard: escrowMap.get('hazard')?.current_due || 0,
        flood: escrowMap.get('flood')?.current_due || 0,
        mi: escrowMap.get('MI')?.current_due || 0
      }
    };
  }

  /**
   * Map allocation target to GL account
   */
  private getAccount(target: AllocationTarget): string {
    const accountMap: Record<AllocationTarget, string> = {
      'late_fees': 'late_fee_income',
      'accrued_interest': 'interest_income',
      'scheduled_principal': 'principal_receivable',
      'escrow_shortage': 'escrow_tax', // Simplified - would be per category
      'current_escrow': 'escrow_tax',  // Simplified - would be per category
      'unapplied_funds': 'unapplied_funds'
    };
    return accountMap[target];
  }

  /**
   * Get target amount for allocation
   */
  private getTargetAmount(balances: LoanBalances, target: AllocationTarget): number {
    switch (target) {
      case 'late_fees':
        return balances.late_fees;
      
      case 'accrued_interest':
        return balances.accrued_interest;
      
      case 'scheduled_principal':
        return balances.scheduled_principal;
      
      case 'escrow_shortage':
        return balances.escrow_shortage;
      
      case 'current_escrow':
        return Object.values(balances.escrow_current).reduce((sum, v) => sum + v, 0);
      
      case 'unapplied_funds':
        return Number.MAX_SAFE_INTEGER; // Always accepts remainder
      
      default:
        return 0;
    }
  }

  /**
   * Allocate payment according to rules
   */
  async allocate(
    client: PoolClient,
    loanId: string,
    amountCents: number,
    effectiveDate: Date,
    isEscrowOnly: boolean = false
  ): Promise<AllocationResult> {
    // Acquire loan lock for serialization
    await client.query('SELECT acquire_loan_lock($1)', [loanId]);

    try {
      const rules = await this.loadRules(client, loanId);
      const balances = await this.getBalances(client, loanId);

      const allocations: Array<{
        target: AllocationTarget;
        account: string;
        amount_cents: number;
      }> = [];

      let remainingAmount = amountCents;

      if (isEscrowOnly) {
        // Bypass P&I, apply only to escrow
        const escrowTargets: AllocationTarget[] = ['escrow_shortage', 'current_escrow'];
        
        for (const target of escrowTargets) {
          if (remainingAmount <= 0) break;
          
          const targetAmount = this.getTargetAmount(balances, target);
          const allocated = Math.min(remainingAmount, targetAmount);
          
          if (allocated > 0) {
            allocations.push({
              target,
              account: this.getAccount(target),
              amount_cents: allocated
            });
            remainingAmount -= allocated;
          }
        }
      } else {
        // Normal allocation per rules
        for (const rule of rules) {
          if (remainingAmount <= 0) break;
          
          const targetAmount = this.getTargetAmount(balances, rule.target);
          const allocated = Math.min(remainingAmount, targetAmount);
          
          if (allocated > 0) {
            allocations.push({
              target: rule.target,
              account: this.getAccount(rule.target),
              amount_cents: allocated
            });
            remainingAmount -= allocated;
          }
        }
      }

      // Any remainder goes to unapplied funds
      if (remainingAmount > 0) {
        allocations.push({
          target: 'unapplied_funds',
          account: 'unapplied_funds',
          amount_cents: remainingAmount
        });
      }

      return {
        allocations,
        total_allocated: amountCents,
        unapplied: remainingAmount
      };

    } finally {
      // Release loan lock
      await client.query('SELECT release_loan_lock($1)', [loanId]);
    }
  }

  /**
   * Apply largest remainder rounding to ensure exact total
   */
  applyLargestRemainderRounding(
    distributions: Array<{ amount: number; percentage: number }>,
    totalAmount: number
  ): Array<{ amount: number }> {
    // Calculate initial integer amounts
    const results = distributions.map(d => {
      const exact = (totalAmount * d.percentage) / 100;
      return {
        amount: Math.floor(exact),
        remainder: exact - Math.floor(exact),
        originalIndex: distributions.indexOf(d)
      };
    });

    // Calculate how much we need to distribute
    const distributed = results.reduce((sum, r) => sum + r.amount, 0);
    let remainder = totalAmount - distributed;

    // Sort by remainder (largest first)
    results.sort((a, b) => b.remainder - a.remainder);

    // Distribute remainder cents to highest remainder items
    for (let i = 0; i < remainder && i < results.length; i++) {
      results[i].amount += 1;
    }

    // Sort back to original order
    results.sort((a, b) => a.originalIndex - b.originalIndex);

    return results.map(r => ({ amount: r.amount }));
  }
}