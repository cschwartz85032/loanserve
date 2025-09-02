import { pool } from "../../server/db";
import { estimateEscrowMonthly, buildSchedule } from "./amort";

export async function boardLoan(tenantId: string, loanId: number) {
  const client = await pool.connect();
  try {
    // Load loan data from loans table
    const loanData = await client.query(`
      SELECT original_amount, interest_rate, loan_term, first_payment_date, maturity_date, monthly_escrow, escrow_required
      FROM loans WHERE id = $1
    `, [loanId]);
    
    if (loanData.rows.length === 0) {
      throw new Error(`Loan ${loanId} not found`);
    }
    
    const loan = loanData.rows[0];
    const noteAmount = Number(loan.original_amount);
    const interestRate = Number(loan.interest_rate);
    const termMonths = Number(loan.loan_term);
    const firstPaymentDate = loan.first_payment_date?.toISOString().split('T')[0] || '2025-02-01';
    const maturityDate = loan.maturity_date?.toISOString().split('T')[0] || '2055-02-01';
    const escrowRequired = Boolean(loan.escrow_required);

    if (!noteAmount || !interestRate || !termMonths || !firstPaymentDate || !maturityDate) {
      throw new Error("Missing required canonical fields for boarding");
    }

    // Escrow estimates from loan data or defaults
    const taxAnnual = Number(loan.property_tax) * 12 || 8000; // Default to $8K annually
    const hoiAnnual = Number(loan.home_insurance) * 12 || 1200; // Default to $1.2K annually
    const floodAnnual = undefined; // No default for flood
    const hoaAnnual = Number(loan.hoa_fees) * 12 || undefined;

    const esc = estimateEscrowMonthly({
      taxAnnual,
      hoiAnnual,
      floodAnnual,
      hoaAnnual,
      cushionMonths: Number(process.env.ESCROW_CUSHION_MONTHS || "2"),
      inflationPct: Number(process.env.ESCROW_ANALYSIS_INFLATION_PCT || "0.03")
    });

    // Schedule build
    const escrowMonthly = escrowRequired ? esc.monthly : 0;
    const sched = buildSchedule({
      noteAmount,
      annualRatePct: interestRate,
      termMonths,
      firstPaymentDate,
      escrowMonthly
    });

    // Create servicing account
    const graceDays = Number(process.env.BOARDING_GRACE_DAYS_DEFAULT || "15");
    await client.query(`
      INSERT INTO svc_accounts (tenant_id, loan_id, state, open_date, first_payment_date, maturity_date, note_amount, interest_rate,
                                amort_term_months, payment_frequency, pmt_principal_interest, grace_days, escrow_required, activated_at)
      VALUES ($1,$2,'Active', CURRENT_DATE, $3, $4, $5, $6, $7, 'Monthly', $8, $9, $10, now())
      ON CONFLICT (loan_id) DO UPDATE SET 
        state = 'Active',
        activated_at = now(),
        pmt_principal_interest = EXCLUDED.pmt_principal_interest,
        escrow_required = EXCLUDED.escrow_required
    `, [tenantId, loanId, firstPaymentDate, maturityDate, noteAmount, interestRate, termMonths, sched.pi, graceDays, escrowRequired]);

    // Escrow sub-accounts
    const buckets = esc.buckets;
    for (const [k, v] of Object.entries(buckets)) {
      await client.query(`
        INSERT INTO svc_escrow_sub (tenant_id, loan_id, bucket, monthly_accrual, cushion_months, balance)
        VALUES ($1,$2,$3,$4,$5,0)
        ON CONFLICT (loan_id, bucket) DO UPDATE SET 
          monthly_accrual=EXCLUDED.monthly_accrual, 
          cushion_months=EXCLUDED.cushion_months
      `, [tenantId, loanId, k, v, Number(process.env.ESCROW_CUSHION_MONTHS || "2")]);
    }

    // Vendors (try to pull from canonical; fallback to defaults)
    const upsertVendor = async (type: string, name: string | null, address?: string | null, phone?: string | null, email?: string | null) => {
      await client.query(`
        INSERT INTO svc_vendors (tenant_id, loan_id, type, name, address, phone, email)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (loan_id, type) DO UPDATE SET name = EXCLUDED.name
      `, [tenantId, loanId, type, name || `${type} Vendor`, address || null, phone || null, email || null]);
    };

    await upsertVendor('TAX', process.env.VENDOR_TAX_DEFAULT_NAME || "Tax Authority");
    await upsertVendor('HOI', process.env.VENDOR_HOI_DEFAULT_NAME || "HOI Carrier");
    await upsertVendor('FLOOD', process.env.VENDOR_FLOOD_DEFAULT_NAME || "NFIP");
    await upsertVendor('HOA', process.env.VENDOR_HOA_DEFAULT_NAME || "HOA");

    // Insert schedule
    for (const r of sched.rows) {
      await client.query(`
        INSERT INTO svc_schedule (tenant_id, loan_id, installment_no, due_date, principal_due, interest_due, escrow_due, total_due, principal_balance_after)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (loan_id, installment_no) DO NOTHING
      `, [tenantId, loanId, r.installment_no, r.due_date, r.principal_due, r.interest_due, r.escrow_due, r.total_due, r.principal_balance_after]);
    }

    // Opening GL (Boarding)
    await client.query(`
      INSERT INTO svc_txns (tenant_id, loan_id, ts, type, amount, currency, alloc_principal, memo, ref)
      VALUES ($1,$2, now(), 'BOARDING', $3, 'USD', $3, 'Boarding entry', '{}')
    `, [tenantId, loanId, noteAmount]);

    // GL double entry: Debit Loan Principal (asset), Credit Retained Earnings (or funding source)
    await client.query(`
      INSERT INTO gl_entries (tenant_id, loan_id, ts, debit_acct, credit_acct, amount, memo)
      VALUES ($1,$2, now(), $3, $4, $5, 'Boarding opening principal')
    `, [tenantId, loanId, Number(process.env.GL_LOAN_PRINCIPAL_ACCT || "1100"), Number(process.env.GL_RETAINED_EARNINGS_ACCT || "3000"), noteAmount]);

    // Activate (already set) + return P&I + Escrow monthly
    return { p_i: sched.pi, escrow_monthly: escrowMonthly, first_due_date: firstPaymentDate };
  } finally {
    client.release();
  }
}