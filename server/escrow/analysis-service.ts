/**
 * Escrow Analysis Service
 * 
 * Performs annual escrow analysis to calculate shortages, surpluses, and deficiencies
 */

import { pool } from '../db';
import { randomUUID } from 'crypto';
import type { 
  EscrowAnalysis,
  EscrowAnalysisRequest,
  EscrowAnalysisResponse,
  EscrowPolicy,
  determineEscrowResult
} from './types';

export class EscrowAnalysisService {
  constructor(private db = pool) {}
  
  /**
   * Perform annual escrow analysis
   */
  async performAnalysis(request: EscrowAnalysisRequest): Promise<EscrowAnalysisResponse> {
    const { loan_id, as_of_date, generate_statement, correlation_id } = request;
    
    console.log(`[EscrowAnalysis] Starting analysis for loan ${loan_id} as of ${as_of_date}`);
    
    try {
      await this.db.query('BEGIN');
      
      // Get loan and escrow account info
      const loanResult = await this.db.query(`
        SELECT 
          l.id,
          l.loan_number,
          l.state as loan_state,
          ea.balance as escrow_balance,
          ea.monthly_payment as current_monthly
        FROM loans l
        LEFT JOIN escrow_accounts ea ON ea.loan_id = l.id
        WHERE l.id = $1
      `, [loan_id]);
      
      if (loanResult.rows.length === 0) {
        throw new Error(`Loan ${loan_id} not found`);
      }
      
      const loan = loanResult.rows[0];
      const currentBalance = Math.round(parseFloat(loan.escrow_balance || '0') * 100);
      
      // Get escrow policy
      const policy = await this.getEscrowPolicy(loan_id, loan.loan_state);
      
      // Calculate analysis period (12 months forward)
      const periodStart = new Date(as_of_date);
      const periodEnd = new Date(periodStart);
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      
      // Get forecasts for the analysis period (using unified escrow_disbursements table)
      const forecastResult = await this.db.query(`
        SELECT 
          ef.escrow_id,
          ef.due_date,
          ef.amount_minor,
          ed.disbursement_type as escrow_type,
          ed.payee_name
        FROM escrow_forecast ef
        JOIN escrow_disbursements ed ON ed.id = ef.escrow_id
        WHERE ef.loan_id = $1
          AND ef.due_date >= $2
          AND ef.due_date < $3
        ORDER BY ef.due_date, ef.escrow_id
      `, [loan_id, periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0]]);
      
      // Calculate total annual expected and monthly projections
      let annualExpected = BigInt(0);
      const monthlyProjections = new Map<string, bigint>(); // month -> total amount
      
      for (const forecast of forecastResult.rows) {
        const amountMinor = BigInt(forecast.amount_minor);
        annualExpected += amountMinor;
        
        const month = forecast.due_date.toISOString().substring(0, 7); // YYYY-MM
        const current = monthlyProjections.get(month) || BigInt(0);
        monthlyProjections.set(month, current + amountMinor);
      }
      
      // Calculate monthly target and cushion
      const monthlyAverage = annualExpected / BigInt(12);
      const cushionTarget = monthlyAverage * BigInt(policy?.cushion_months || 2);
      
      // Project balance over 12 months to find low point
      let runningBalance = BigInt(currentBalance);
      let lowestBalance = runningBalance;
      let lowestMonth = periodStart.toISOString().substring(0, 7);
      
      const sortedMonths = Array.from(monthlyProjections.keys()).sort();
      for (const month of sortedMonths) {
        const disbursements = monthlyProjections.get(month) || BigInt(0);
        // Add monthly payment
        runningBalance += monthlyAverage;
        // Subtract disbursements
        runningBalance -= disbursements;
        
        if (runningBalance < lowestBalance) {
          lowestBalance = runningBalance;
          lowestMonth = month;
        }
      }
      
      console.log(`[EscrowAnalysis] Lowest projected balance: $${(Number(lowestBalance) / 100).toFixed(2)} in ${lowestMonth}`);
      
      // Determine shortage, deficiency, or surplus
      let shortage = BigInt(0);
      let deficiency = BigInt(0);
      let surplus = BigInt(0);
      
      if (lowestBalance < BigInt(0)) {
        // Deficiency: projected balance goes negative
        deficiency = -lowestBalance;
        shortage = cushionTarget - BigInt(currentBalance) + deficiency;
      } else if (lowestBalance < cushionTarget) {
        // Shortage: projected balance below cushion
        shortage = cushionTarget - lowestBalance;
      } else {
        // Check for surplus
        const surplusAmount = lowestBalance - cushionTarget;
        if (surplusAmount > (policy?.surplus_refund_threshold_minor || BigInt(5000))) {
          surplus = surplusAmount;
        }
      }
      
      // Calculate new monthly payment
      let newMonthlyTarget = monthlyAverage + (cushionTarget / BigInt(12));
      if (shortage > BigInt(0)) {
        // Amortize shortage over configured period
        const shortageMonths = policy?.shortage_amortization_months || 12;
        const shortageRecovery = shortage / BigInt(shortageMonths);
        newMonthlyTarget += shortageRecovery;
      }
      
      // Calculate deficiency recovery if applicable
      let deficiencyRecoveryMonthly = BigInt(0);
      if (deficiency > BigInt(0)) {
        const deficiencyMonths = policy?.deficiency_amortization_months || 12;
        deficiencyRecoveryMonthly = deficiency / BigInt(deficiencyMonths);
      }
      
      // Get next version number
      const versionResult = await this.db.query(`
        SELECT COALESCE(MAX(version), 0) + 1 as next_version
        FROM escrow_analysis
        WHERE loan_id = $1
      `, [loan_id]);
      
      const version = versionResult.rows[0].next_version;
      
      // Create analysis record
      const analysis_id = randomUUID();
      
      await this.db.query(`
        INSERT INTO escrow_analysis (
          analysis_id,
          loan_id,
          as_of_date,
          period_start,
          period_end,
          annual_expected_minor,
          cushion_target_minor,
          current_balance_minor,
          shortage_minor,
          deficiency_minor,
          surplus_minor,
          new_monthly_target_minor,
          deficiency_recovery_monthly_minor,
          version,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      `, [
        analysis_id,
        loan_id,
        as_of_date,
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0],
        annualExpected.toString(),
        cushionTarget.toString(),
        currentBalance.toString(),
        shortage.toString(),
        deficiency.toString(),
        surplus.toString(),
        newMonthlyTarget.toString(),
        deficiencyRecoveryMonthly.toString(),
        version
      ]);
      
      // Insert analysis items (forecasts)
      for (const forecast of forecastResult.rows) {
        await this.db.query(`
          INSERT INTO escrow_analysis_item (
            analysis_id,
            escrow_id,
            forecast_due_date,
            forecast_amount_minor
          ) VALUES ($1, $2, $3, $4)
        `, [
          analysis_id,
          forecast.escrow_id,
          forecast.due_date,
          forecast.amount_minor
        ]);
      }
      
      // Generate statement if requested
      let statementGenerated = false;
      if (generate_statement) {
        // Statement generation would be handled by a separate service
        // For now, just create a placeholder record
        const documentHash = `stmt_${analysis_id}_${Date.now()}`;
        
        await this.db.query(`
          INSERT INTO escrow_statement (
            analysis_id,
            document_hash,
            generated_at
          ) VALUES ($1, $2, NOW())
        `, [analysis_id, documentHash]);
        
        statementGenerated = true;
        console.log(`[EscrowAnalysis] Statement generated with hash ${documentHash}`);
      }
      
      await this.db.query('COMMIT');
      
      console.log(`[EscrowAnalysis] Analysis complete for loan ${loan_id}:`);
      console.log(`  - Annual Expected: $${(Number(annualExpected) / 100).toFixed(2)}`);
      console.log(`  - Cushion Target: $${(Number(cushionTarget) / 100).toFixed(2)}`);
      console.log(`  - Current Balance: $${(Number(currentBalance) / 100).toFixed(2)}`);
      if (shortage > BigInt(0)) {
        console.log(`  - SHORTAGE: $${(Number(shortage) / 100).toFixed(2)}`);
      }
      if (deficiency > BigInt(0)) {
        console.log(`  - DEFICIENCY: $${(Number(deficiency) / 100).toFixed(2)}`);
      }
      if (surplus > BigInt(0)) {
        console.log(`  - SURPLUS: $${(Number(surplus) / 100).toFixed(2)}`);
      }
      console.log(`  - New Monthly Payment: $${(Number(newMonthlyTarget) / 100).toFixed(2)}`);
      
      return {
        analysis_id,
        loan_id,
        shortage_minor: shortage.toString(),
        deficiency_minor: deficiency.toString(),
        surplus_minor: surplus.toString(),
        new_monthly_target_minor: newMonthlyTarget.toString(),
        deficiency_recovery_monthly_minor: deficiencyRecoveryMonthly.toString(),
        statement_generated: statementGenerated,
        correlation_id
      };
      
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[EscrowAnalysis] Error performing analysis:', error);
      throw error;
    }
  }
  
  /**
   * Get escrow policy for loan
   */
  private async getEscrowPolicy(loan_id: number, state: string): Promise<EscrowPolicy | null> {
    // Determine jurisdiction from state
    const jurisdiction = state ? `US_${state.toUpperCase()}` : 'US_FEDERAL';
    
    // Get policy (would normally look up by product code)
    const policyResult = await this.db.query(`
      SELECT 
        policy_id,
        product_code,
        jurisdiction,
        cushion_months,
        shortage_amortization_months,
        deficiency_amortization_months,
        surplus_refund_threshold_minor,
        collect_surplus_as_reduction,
        pay_when_insufficient,
        rounding,
        created_at
      FROM escrow_policy
      WHERE jurisdiction = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [jurisdiction]);
    
    if (policyResult.rows.length === 0) {
      // Try federal default
      const federalResult = await this.db.query(`
        SELECT * FROM escrow_policy
        WHERE jurisdiction = 'US_FEDERAL'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      
      if (federalResult.rows.length > 0) {
        return this.mapPolicyRow(federalResult.rows[0]);
      }
      
      return null;
    }
    
    return this.mapPolicyRow(policyResult.rows[0]);
  }
  
  private mapPolicyRow(row: any): EscrowPolicy {
    return {
      policy_id: row.policy_id,
      product_code: row.product_code,
      jurisdiction: row.jurisdiction,
      cushion_months: row.cushion_months,
      shortage_amortization_months: row.shortage_amortization_months,
      deficiency_amortization_months: row.deficiency_amortization_months,
      surplus_refund_threshold_minor: BigInt(row.surplus_refund_threshold_minor),
      collect_surplus_as_reduction: row.collect_surplus_as_reduction,
      pay_when_insufficient: row.pay_when_insufficient,
      rounding: row.rounding,
      created_at: row.created_at
    };
  }
  
  /**
   * Get latest analysis for a loan
   */
  async getLatestAnalysis(loan_id: number): Promise<EscrowAnalysis | null> {
    const result = await this.db.query(`
      SELECT 
        analysis_id,
        loan_id,
        as_of_date,
        period_start,
        period_end,
        annual_expected_minor,
        cushion_target_minor,
        current_balance_minor,
        shortage_minor,
        deficiency_minor,
        surplus_minor,
        new_monthly_target_minor,
        deficiency_recovery_monthly_minor,
        version,
        created_at
      FROM escrow_analysis
      WHERE loan_id = $1
      ORDER BY version DESC
      LIMIT 1
    `, [loan_id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      analysis_id: row.analysis_id,
      loan_id: row.loan_id,
      as_of_date: row.as_of_date.toISOString().split('T')[0],
      period_start: row.period_start.toISOString().split('T')[0],
      period_end: row.period_end.toISOString().split('T')[0],
      annual_expected_minor: BigInt(row.annual_expected_minor),
      cushion_target_minor: BigInt(row.cushion_target_minor),
      current_balance_minor: BigInt(row.current_balance_minor),
      shortage_minor: BigInt(row.shortage_minor),
      deficiency_minor: BigInt(row.deficiency_minor),
      surplus_minor: BigInt(row.surplus_minor),
      new_monthly_target_minor: BigInt(row.new_monthly_target_minor),
      deficiency_recovery_monthly_minor: BigInt(row.deficiency_recovery_monthly_minor),
      version: row.version,
      created_at: row.created_at
    };
  }
}