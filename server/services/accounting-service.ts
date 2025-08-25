/**
 * Main accounting service that integrates double-entry bookkeeping with loan servicing
 */

import { Pool } from 'pg';
import { PgLedgerRepository } from '../db/ledger-repository';
import { postEvent, postPaymentReceived, postInterestAccrual, postFeeAssessment, postLoanOrigination } from '../domain/posting';
import { allocatePayment, allocationsToPostings } from '../domain/waterfall';
import { generateLevelSchedule } from '../domain/schedule';
import { perDiem, calculateLateFee } from '../domain/money';
import type { 
  ProductPolicy, 
  LoanTerms, 
  Outstanding, 
  BucketName,
  GLAccount,
  DayCount
} from '../../shared/accounting-types';

export class AccountingService {
  private pool: Pool;
  private ledgerRepo: PgLedgerRepository;
  
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.ledgerRepo = new PgLedgerRepository(this.pool);
  }
  
  /**
   * Process a payment with waterfall allocation
   */
  async processPayment(
    loanId: number,
    paymentAmount: number,
    effectiveDate: string,
    gatewayTxnId: string
  ): Promise<{ 
    eventId: string; 
    allocations: Array<{ bucket: BucketName; amountCents: number }> 
  }> {
    // Get loan configuration
    const productPolicy = await this.getProductPolicy(loanId);
    const outstanding = await this.calculateOutstanding(loanId, effectiveDate);
    
    // Convert payment to minor units
    const paymentMinor = BigInt(Math.round(paymentAmount * 100));
    
    // Apply waterfall allocation
    const allocations = allocatePayment(
      paymentMinor,
      productPolicy.paymentWaterfall,
      outstanding
    );
    
    // Convert allocations to GL postings
    const postings = allocationsToPostings(allocations);
    
    // Post payment to ledger
    const correlationId = `payment:loan:${loanId}:gw:${gatewayTxnId}`;
    const { eventId } = await postPaymentReceived(
      this.ledgerRepo,
      loanId,
      paymentMinor,
      effectiveDate,
      correlationId,
      postings
    );
    
    return {
      eventId,
      allocations: allocations.map(a => ({
        bucket: a.bucket,
        amountCents: Number(a.appliedMinor)
      }))
    };
  }
  
  /**
   * Accrue daily interest
   */
  async accrueInterest(
    loanId: number,
    effectiveDate: string
  ): Promise<{ eventId: string; interestCents: number }> {
    // Get current balance and terms
    const balances = await this.ledgerRepo.latestBalances(loanId);
    const terms = await this.getActiveTerms(loanId, effectiveDate);
    
    // Calculate per-diem interest
    const baseDays = this.getDaysInYear(terms.dayCount);
    const interestMinor = perDiem(
      balances.principalMinor,
      terms.nominalRateBps,
      baseDays
    );
    
    if (interestMinor === 0n) {
      throw new Error('No interest to accrue');
    }
    
    // Post accrual
    const correlationId = `accrual:loan:${loanId}:date:${effectiveDate}`;
    const { eventId } = await postInterestAccrual(
      this.ledgerRepo,
      loanId,
      interestMinor,
      effectiveDate,
      correlationId
    );
    
    return {
      eventId,
      interestCents: Number(interestMinor)
    };
  }
  
  /**
   * Assess a late fee
   */
  async assessLateFee(
    loanId: number,
    effectiveDate: string,
    scheduledPaymentAmount: number
  ): Promise<{ eventId: string; feeCents: number }> {
    // Get fee policy
    const policy = await this.getFeePolicy(loanId, effectiveDate);
    
    // Calculate fee amount
    const paymentMinor = BigInt(Math.round(scheduledPaymentAmount * 100));
    const feeMinor = calculateLateFee(
      paymentMinor,
      policy.lateFeeType,
      policy.lateFeeAmountMinor,
      policy.lateFeePercentBps
    );
    
    if (feeMinor === 0n) {
      throw new Error('No fee to assess');
    }
    
    // Post fee
    const correlationId = `fee:late:loan:${loanId}:date:${effectiveDate}`;
    const { eventId } = await postFeeAssessment(
      this.ledgerRepo,
      loanId,
      feeMinor,
      'late',
      effectiveDate,
      correlationId
    );
    
    return {
      eventId,
      feeCents: Number(feeMinor)
    };
  }
  
  /**
   * Generate amortization schedule
   */
  async generateSchedule(
    loanId: number,
    principalAmount: number,
    annualRate: number,
    termMonths: number,
    firstPaymentDate: string,
    interestOnlyMonths: number = 0
  ): Promise<{ 
    planId: string; 
    schedule: Array<{
      periodNo: number;
      dueDate: string;
      principal: number;
      interest: number;
      totalPayment: number;
      balance: number;
    }> 
  }> {
    // Get loan configuration
    const productPolicy = await this.getProductPolicy(loanId);
    
    // Generate schedule
    const scheduleRows = generateLevelSchedule({
      principalMinor: BigInt(Math.round(principalAmount * 100)),
      annualRateBps: Math.round(annualRate * 100),
      termMonths,
      startDate: firstPaymentDate,
      dayCount: productPolicy.defaultDayCount,
      rounding: productPolicy.rounding,
      interestOnlyMonths
    });
    
    // Save schedule to database
    const planId = await this.saveSchedule(loanId, scheduleRows);
    
    return {
      planId,
      schedule: scheduleRows.map(row => ({
        periodNo: row.periodNo,
        dueDate: row.dueDate,
        principal: Number(row.principalMinor) / 100,
        interest: Number(row.interestMinor) / 100,
        totalPayment: Number(row.totalPaymentMinor) / 100,
        balance: Number(row.balanceMinor) / 100
      }))
    };
  }
  
  /**
   * Get current loan balances
   */
  async getLoanBalances(loanId: number): Promise<{
    principal: number;
    interestReceivable: number;
    escrowLiability: number;
    feesReceivable: number;
    totalOutstanding: number;
  }> {
    const balances = await this.ledgerRepo.latestBalances(loanId);
    
    const principal = Number(balances.principalMinor) / 100;
    const interestReceivable = Number(balances.interestReceivableMinor) / 100;
    const escrowLiability = Number(balances.escrowLiabilityMinor) / 100;
    const feesReceivable = Number(balances.feesReceivableMinor) / 100;
    
    return {
      principal,
      interestReceivable,
      escrowLiability,
      feesReceivable,
      totalOutstanding: principal + interestReceivable + feesReceivable
    };
  }
  
  /**
   * Originate a new loan
   */
  async originateLoan(
    loanId: number,
    principalAmount: number,
    originationDate: string,
    productCode: string,
    jurisdiction: string
  ): Promise<{ eventId: string }> {
    // Save loan accounting configuration
    await this.pool.query(
      `INSERT INTO loan_accounting_config (loan_id, product_code, jurisdiction)
       VALUES ($1, $2, $3::jurisdiction_code)
       ON CONFLICT (loan_id) DO UPDATE
       SET product_code = $2, jurisdiction = $3::jurisdiction_code, updated_at = now()`,
      [loanId, productCode, jurisdiction]
    );
    
    // Post origination to ledger
    const principalMinor = BigInt(Math.round(principalAmount * 100));
    const correlationId = `origination:loan:${loanId}:date:${originationDate}`;
    
    const { eventId } = await postLoanOrigination(
      this.ledgerRepo,
      loanId,
      principalMinor,
      originationDate,
      correlationId
    );
    
    return { eventId };
  }
  
  /**
   * Get trial balance
   */
  async getTrialBalance(): Promise<Array<{
    account: string;
    debitTotal: number;
    creditTotal: number;
    balance: number;
  }>> {
    const balances = await this.ledgerRepo.getTrialBalance();
    
    return balances.map(b => ({
      account: b.account,
      debitTotal: Number(b.debitTotal) / 100,
      creditTotal: Number(b.creditTotal) / 100,
      balance: Number(b.balance) / 100
    }));
  }
  
  // Private helper methods
  
  private async getProductPolicy(loanId: number): Promise<ProductPolicy> {
    const result = await this.pool.query(
      `SELECT pp.* 
       FROM product_policy pp
       JOIN loan_accounting_config lac ON lac.product_code = pp.product_code
       WHERE lac.loan_id = $1`,
      [loanId]
    );
    
    if (result.rows.length === 0) {
      // Default policy if not configured
      return {
        productCode: 'FIXED_30',
        currency: 'USD',
        rounding: 'half_away_from_zero',
        defaultDayCount: 'ACT_365F',
        defaultCompounding: 'simple',
        minPaymentMinor: 10000n,
        paymentWaterfall: ['fees_due', 'interest_past_due', 'interest_current', 'principal', 'escrow', 'future']
      };
    }
    
    const row = result.rows[0];
    return {
      productCode: row.product_code,
      currency: row.currency,
      rounding: row.rounding,
      defaultDayCount: row.default_day_count,
      defaultCompounding: row.default_compounding,
      minPaymentMinor: BigInt(row.min_payment_minor),
      paymentWaterfall: row.payment_waterfall
    };
  }
  
  private async getActiveTerms(loanId: number, asOf: string): Promise<LoanTerms> {
    const result = await this.pool.query(
      `SELECT * FROM loan_terms
       WHERE loan_id = $1
         AND effective_from <= $2::date
         AND (effective_to IS NULL OR effective_to > $2::date)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [loanId, asOf]
    );
    
    if (result.rows.length === 0) {
      // Create default terms from loan data
      const loanResult = await this.pool.query(
        `SELECT * FROM loans WHERE id = $1`,
        [loanId]
      );
      
      if (loanResult.rows.length === 0) {
        throw new Error(`Loan ${loanId} not found`);
      }
      
      const loan = loanResult.rows[0];
      return {
        termsId: '',
        loanId,
        effectiveFrom: loan.first_payment_date || asOf,
        effectiveTo: undefined,
        interestType: 'fixed',
        nominalRateBps: Math.round(parseFloat(loan.interest_rate) * 100),
        compounding: 'simple',
        dayCount: 'ACT_365F',
        firstPaymentDate: loan.first_payment_date || asOf,
        termMonths: loan.loan_term || 360,
        interestOnlyMonths: 0
      };
    }
    
    const row = result.rows[0];
    return {
      termsId: row.terms_id,
      loanId: row.loan_id,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      interestType: row.interest_type,
      nominalRateBps: row.nominal_rate_bps,
      indexName: row.index_name,
      indexMarginBps: row.index_margin_bps,
      rateCapUpBps: row.rate_cap_up_bps,
      rateCapDownBps: row.rate_cap_down_bps,
      compounding: row.compounding,
      dayCount: row.day_count,
      firstPaymentDate: row.first_payment_date,
      termMonths: row.term_months,
      scheduledPaymentMinor: row.scheduled_payment_minor ? BigInt(row.scheduled_payment_minor) : undefined,
      interestOnlyMonths: row.interest_only_months
    };
  }
  
  private async getFeePolicy(loanId: number, asOf: string): Promise<{
    lateFeeType: 'amount' | 'percent';
    lateFeeAmountMinor: bigint;
    lateFeePercentBps: number;
    lateFeeGraceDays: number;
  }> {
    const result = await this.pool.query(
      `SELECT fp.* 
       FROM fee_policy fp
       JOIN loan_accounting_config lac ON lac.product_code = fp.product_code
         AND lac.jurisdiction = fp.jurisdiction
       WHERE lac.loan_id = $1
         AND fp.effective_from <= $2::date
         AND (fp.effective_to IS NULL OR fp.effective_to > $2::date)
       ORDER BY fp.effective_from DESC
       LIMIT 1`,
      [loanId, asOf]
    );
    
    if (result.rows.length === 0) {
      // Default fee policy
      return {
        lateFeeType: 'amount',
        lateFeeAmountMinor: 3500n, // $35 default late fee
        lateFeePercentBps: 500, // 5% alternative
        lateFeeGraceDays: 10
      };
    }
    
    const row = result.rows[0];
    return {
      lateFeeType: row.late_fee_type,
      lateFeeAmountMinor: BigInt(row.late_fee_amount_minor),
      lateFeePercentBps: row.late_fee_percent_bps,
      lateFeeGraceDays: row.late_fee_grace_days
    };
  }
  
  private async calculateOutstanding(loanId: number, asOf: string): Promise<Outstanding> {
    const balances = await this.ledgerRepo.latestBalances(loanId);
    
    // Get current period interest from schedule
    const scheduleResult = await this.pool.query(
      `SELECT sr.scheduled_interest_minor
       FROM schedule_row sr
       JOIN schedule_plan sp ON sp.plan_id = sr.plan_id
       WHERE sp.loan_id = $1 AND sp.active = true
         AND sr.due_date = (
           SELECT MIN(due_date) FROM schedule_row
           WHERE plan_id = sp.plan_id AND due_date >= $2::date
         )`,
      [loanId, asOf]
    );
    
    const currentInterest = scheduleResult.rows[0]?.scheduled_interest_minor
      ? BigInt(scheduleResult.rows[0].scheduled_interest_minor)
      : 0n;
    
    // Calculate past due interest (total receivable minus current)
    const pastDueInterest = balances.interestReceivableMinor > currentInterest
      ? balances.interestReceivableMinor - currentInterest
      : 0n;
    
    return {
      feesDueMinor: balances.feesReceivableMinor,
      interestPastDueMinor: pastDueInterest,
      interestCurrentMinor: currentInterest,
      principalMinor: balances.principalMinor,
      escrowMinor: balances.escrowLiabilityMinor
    };
  }
  
  private getDaysInYear(convention: DayCount): number {
    switch (convention) {
      case 'ACT_360':
      case 'US_30_360':
      case 'EURO_30_360':
        return 360;
      case 'ACT_365F':
        return 365;
      case 'ACT_ACT':
        return 365; // Simplified for now
      default:
        return 365;
    }
  }
  
  private async saveSchedule(loanId: number, scheduleRows: any[]): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current version
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM schedule_plan WHERE loan_id = $1',
        [loanId]
      );
      const version = versionResult.rows[0].next_version;
      
      // Get active terms
      const terms = await this.getActiveTerms(loanId, new Date().toISOString().slice(0, 10));
      
      // Create plan
      const planResult = await client.query(
        `INSERT INTO schedule_plan (loan_id, terms_id, version, active)
         VALUES ($1, $2, $3, true)
         RETURNING plan_id`,
        [loanId, terms.termsId || '00000000-0000-0000-0000-000000000000', version]
      );
      const planId = planResult.rows[0].plan_id;
      
      // Deactivate other plans
      await client.query(
        'UPDATE schedule_plan SET active = false WHERE loan_id = $1 AND plan_id != $2',
        [loanId, planId]
      );
      
      // Insert schedule rows
      for (const row of scheduleRows) {
        await client.query(
          `INSERT INTO schedule_row 
           (plan_id, period_no, due_date, scheduled_principal_minor, scheduled_interest_minor)
           VALUES ($1, $2, $3, $4, $5)`,
          [planId, row.periodNo, row.dueDate, row.principalMinor.toString(), row.interestMinor.toString()]
        );
      }
      
      await client.query('COMMIT');
      return planId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async close(): Promise<void> {
    await this.pool.end();
  }
}