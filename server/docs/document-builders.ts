/**
 * Phase 4: Document Data Builders
 * Assemble data for each document type
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import type { 
  BillingStatementPayload, 
  EscrowAnalysisDocPayload, 
  YearEnd1098Payload,
  Minor 
} from './types';

export class DocumentBuilders {
  /**
   * Build billing statement data
   */
  async buildBillingStatement(
    loanId: number,
    periodStart: string,
    periodEnd: string,
    dueDate: string
  ): Promise<BillingStatementPayload> {
    // Get loan and borrower info
    const loanResult = await db.execute(sql`
      SELECT 
        l.id,
        l.loan_number,
        l.borrower_name,
        l.co_borrower_name,
        l.mailing_address_1,
        l.mailing_address_2,
        l.mailing_city,
        l.mailing_state,
        l.mailing_zip
      FROM loans l
      WHERE l.id = ${loanId}
    `);
    
    if (!loanResult.rows.length) {
      throw new Error(`Loan ${loanId} not found`);
    }
    
    const loan = loanResult.rows[0];
    
    // Format borrower address
    const borrowerAddress = [
      loan.mailing_address_1,
      loan.mailing_address_2,
      `${loan.mailing_city}, ${loan.mailing_state} ${loan.mailing_zip}`
    ].filter(Boolean).join('\n');
    
    // Get previous balance (simplified - sum receivables)
    const balanceResult = await db.execute(sql`
      SELECT 
        COALESCE(SUM(CASE 
          WHEN le.account LIKE '%_receivable' AND le.debit > 0 THEN le.debit 
          WHEN le.account = 'suspense' AND le.credit > 0 THEN -le.credit
          ELSE 0 
        END), 0) as previous_balance
      FROM ledger_entry le
      JOIN ledger_event ev ON le.event_id = ev.event_id
      WHERE ev.loan_id = ${loanId}
        AND ev.created_at < ${periodStart}::timestamptz
    `);
    
    const previousBalance = BigInt(balanceResult.rows[0]?.previous_balance || 0);
    
    // Get transactions in period
    const transactionsResult = await db.execute(sql`
      SELECT 
        ev.created_at as posted_at,
        ev.description,
        le.account,
        le.debit,
        le.credit
      FROM ledger_entry le
      JOIN ledger_event ev ON le.event_id = ev.event_id
      WHERE ev.loan_id = ${loanId}
        AND ev.created_at >= ${periodStart}::timestamptz
        AND ev.created_at < ${periodEnd}::timestamptz
        AND le.account NOT LIKE '%_contra%'
      ORDER BY ev.created_at ASC, ev.description ASC
    `);
    
    // Transform transactions for display
    const transactions = transactionsResult.rows.map(row => {
      const isPayment = row.account === 'cash' && row.debit > 0;
      const isFee = row.account === 'fee_income' && row.credit > 0;
      
      return {
        posted_at: new Date(row.posted_at as string).toISOString().split('T')[0],
        description: row.description as string,
        debit_minor: isFee ? BigInt(row.credit) : undefined,
        credit_minor: isPayment ? BigInt(row.debit) : undefined
      };
    }).filter(t => t.debit_minor || t.credit_minor);
    
    // Get current escrow target
    const escrowResult = await db.execute(sql`
      SELECT escrow_payment
      FROM payment_schedules
      WHERE loan_id = ${loanId}
        AND due_date >= ${dueDate}::date
      ORDER BY due_date ASC
      LIMIT 1
    `);
    
    const escrowTarget = BigInt(escrowResult.rows[0]?.escrow_payment || 0) * 100n; // Convert to cents
    
    // Get scheduled payment amount
    const scheduledResult = await db.execute(sql`
      SELECT 
        principal_payment + interest_payment + escrow_payment + COALESCE(fee_payment, 0) as total_payment
      FROM payment_schedules
      WHERE loan_id = ${loanId}
        AND due_date = ${dueDate}::date
    `);
    
    const scheduledPayment = BigInt(scheduledResult.rows[0]?.total_payment || 0) * 100n;
    
    // Calculate totals
    const paymentsInPeriod = transactions
      .filter(t => t.credit_minor)
      .reduce((sum, t) => sum + (t.credit_minor || 0n), 0n);
    
    const totalDue = previousBalance + scheduledPayment - paymentsInPeriod;
    const pastDue = previousBalance > 0n ? previousBalance : 0n;
    
    // Get late fee policy
    const policyResult = await db.execute(sql`
      SELECT 
        grace_period_days,
        late_fee_flat,
        late_fee_percentage
      FROM fee_policies
      WHERE loan_id = ${loanId}
        AND effective_date <= ${dueDate}::date
      ORDER BY effective_date DESC
      LIMIT 1
    `);
    
    const policy = policyResult.rows[0] || {
      grace_period_days: 10,
      late_fee_flat: null,
      late_fee_percentage: null
    };
    
    return {
      loan_id: loanId,
      borrower: {
        name: `${loan.borrower_name}${loan.co_borrower_name ? ' & ' + loan.co_borrower_name : ''}`,
        mailing_address: borrowerAddress
      },
      statement_period: {
        start: periodStart,
        end: periodEnd,
        due_date: dueDate
      },
      previous_balance_minor: previousBalance,
      transactions,
      escrow_monthly_target_minor: escrowTarget,
      total_due_minor: totalDue,
      past_due_minor: pastDue,
      late_fee_policy: {
        grace_days: policy.grace_period_days as number,
        amount_minor: policy.late_fee_flat ? BigInt(policy.late_fee_flat * 100) : undefined,
        percent_bps: policy.late_fee_percentage ? Math.round(policy.late_fee_percentage * 100) : undefined
      },
      messages: pastDue > 0n ? ['Payment is past due. Please remit immediately to avoid additional fees.'] : []
    };
  }

  /**
   * Build escrow analysis document data
   */
  async buildEscrowAnalysis(analysisId: string): Promise<EscrowAnalysisDocPayload> {
    // Get analysis data
    const analysisResult = await db.execute(sql`
      SELECT * FROM escrow_analysis
      WHERE analysis_id = ${analysisId}
    `);
    
    if (!analysisResult.rows.length) {
      throw new Error(`Escrow analysis ${analysisId} not found`);
    }
    
    const analysis = analysisResult.rows[0];
    
    // Get analysis items
    const itemsResult = await db.execute(sql`
      SELECT * FROM escrow_analysis_item
      WHERE analysis_id = ${analysisId}
      ORDER BY due_date ASC, type, payee
    `);
    
    const items = itemsResult.rows.map(row => ({
      due_date: new Date(row.due_date as string).toISOString().split('T')[0],
      type: row.type as string,
      payee: row.payee as string,
      amount_minor: BigInt(row.amount_minor)
    }));
    
    return {
      loan_id: analysis.loan_id as number,
      analysis_id: analysisId,
      period_start: new Date(analysis.period_start as string).toISOString().split('T')[0],
      period_end: new Date(analysis.period_end as string).toISOString().split('T')[0],
      annual_expected_minor: BigInt(analysis.annual_expected_minor),
      cushion_target_minor: BigInt(analysis.cushion_target_minor),
      current_balance_minor: BigInt(analysis.current_balance_minor),
      shortage_minor: BigInt(analysis.shortage_minor || 0),
      deficiency_minor: BigInt(analysis.deficiency_minor || 0),
      surplus_minor: BigInt(analysis.surplus_minor || 0),
      new_monthly_target_minor: BigInt(analysis.new_monthly_target_minor),
      deficiency_recovery_monthly_minor: BigInt(analysis.deficiency_recovery_monthly_minor || 0),
      items
    };
  }

  /**
   * Build 1098 tax document data (cash basis)
   */
  async buildYear1098(loanId: number, taxYear: number): Promise<YearEnd1098Payload> {
    // Get loan and borrower info
    const loanResult = await db.execute(sql`
      SELECT 
        l.id,
        l.loan_number,
        l.borrower_name,
        l.co_borrower_name,
        l.borrower_tin,
        l.mailing_address_1,
        l.mailing_address_2,
        l.mailing_city,
        l.mailing_state,
        l.mailing_zip,
        l.property_address_1,
        l.property_city,
        l.property_state,
        l.property_zip
      FROM loans l
      WHERE l.id = ${loanId}
    `);
    
    if (!loanResult.rows.length) {
      throw new Error(`Loan ${loanId} not found`);
    }
    
    const loan = loanResult.rows[0];
    
    // Format addresses
    const borrowerAddress = [
      loan.mailing_address_1,
      loan.mailing_address_2,
      `${loan.mailing_city}, ${loan.mailing_state} ${loan.mailing_zip}`
    ].filter(Boolean).join('\n');
    
    const propertyAddress = [
      loan.property_address_1,
      `${loan.property_city}, ${loan.property_state} ${loan.property_zip}`
    ].join('\n');
    
    // Get lender info
    const lenderResult = await db.execute(sql`
      SELECT * FROM lender_entity LIMIT 1
    `);
    
    if (!lenderResult.rows.length) {
      throw new Error('Lender entity not configured');
    }
    
    const lender = lenderResult.rows[0];
    const lenderAddr = lender.mailing_address as any;
    const lenderAddress = `${lenderAddr.street}\n${lenderAddr.city}, ${lenderAddr.state} ${lenderAddr.zip}`;
    
    // Calculate interest received (cash basis)
    const yearStart = `${taxYear}-01-01`;
    const yearEnd = `${taxYear}-12-31`;
    
    const interestResult = await db.execute(sql`
      SELECT 
        COALESCE(SUM(applied_to_interest), 0) as interest_received
      FROM payment_postings
      WHERE loan_id = ${loanId}
        AND effective_date >= ${yearStart}::date
        AND effective_date <= ${yearEnd}::date
        AND status = 'posted'
    `);
    
    const interestReceived = BigInt(interestResult.rows[0]?.interest_received || 0) * 100n;
    
    // Get mortgage insurance premiums (if tracked)
    const miResult = await db.execute(sql`
      SELECT 
        COALESCE(SUM(le.credit), 0) as mi_premiums
      FROM ledger_entry le
      JOIN ledger_event ev ON le.event_id = ev.event_id
      WHERE ev.loan_id = ${loanId}
        AND le.account = 'mortgage_insurance_expense'
        AND ev.created_at >= ${yearStart}::timestamptz
        AND ev.created_at <= ${yearEnd}::timestamptz
    `);
    
    const miPremiums = BigInt(miResult.rows[0]?.mi_premiums || 0);
    
    // Extract TIN last 4 digits
    const borrowerTinLast4 = loan.borrower_tin ? 
      (loan.borrower_tin as string).slice(-4) : undefined;
    
    const lenderTinLast4 = lender.tin ? 
      (lender.tin as string).slice(-4) : undefined;
    
    return {
      loan_id: loanId,
      tax_year: taxYear,
      borrower: {
        name: `${loan.borrower_name}${loan.co_borrower_name ? ' & ' + loan.co_borrower_name : ''}`,
        mailing_address: borrowerAddress,
        tin_last4: borrowerTinLast4
      },
      lender: {
        name: lender.legal_name as string,
        address: lenderAddress,
        tin_last4: lenderTinLast4
      },
      interest_received_minor: interestReceived,
      mortgage_insurance_premiums_minor: miPremiums > 0n ? miPremiums : undefined,
      property_address: propertyAddress,
      account_number: loan.loan_number as string
    };
  }
}