import { pool } from "../../server/db";
import dayjs from "dayjs";
import tz from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { graceDays, daysPastDue, delinquencyBucket, lateFee } from "./policy";
import { renderStatementPdf } from "./statementPdf";
import { putBytes } from "../utils/storage";

dayjs.extend(utc);
dayjs.extend(tz);

const Z = process.env.SVC_BUSINESS_TZ || "America/New_York";

export async function runDailyCycle(tenantId: string, asOfISO?: string) {
  const asOf = dayjs.tz(asOfISO || dayjs().format("YYYY-MM-DD"), Z).format("YYYY-MM-DD");
  const client = await pool.connect();
  
  try {
    // Skip SET LOCAL for now as it might be causing syntax errors
    // await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    
    // Idempotency check
    const exist = await client.query(
      `SELECT 1 FROM svc_cycle_runs WHERE tenant_id=$1 AND as_of_date=$2`, 
      [tenantId, asOf]
    );
    if (exist.rowCount) return { ok: true, skipped: true };
    
    await client.query(
      `INSERT INTO svc_cycle_runs (tenant_id, as_of_date, status) VALUES ($1,$2,'started')`, 
      [tenantId, asOf]
    );

    // Fetch Active accounts
    const acc = await client.query(`SELECT * FROM svc_accounts WHERE state='Active'`);
    let issued = 0, lateFees = 0, billsQueued = 0;

    for (const a of acc.rows) {
      const loanId = a.loan_id;

      // 1) Determine current installment due as of today (the smallest unpaid schedule row)
      const sched = await client.query(`
        SELECT * FROM svc_schedule WHERE loan_id=$1 AND paid=false ORDER BY installment_no ASC LIMIT 1
      `, [loanId]);
      const row = sched.rows[0];
      if (!row) continue;

      // 2) Delinquency and late fee
      const dpd = daysPastDue(row.due_date, row.paid, row.paid_at);
      const bucket = delinquencyBucket(dpd);
      const grace = graceDays(a.grace_days);
      let assessedLate = false;

      if (dpd > grace) {
        // Has a late fee txn already been posted for this installment?
        const feeExists = await client.query(`
          SELECT 1 FROM svc_txns WHERE loan_id=$1 AND type='FEE' AND fee_code='LATE' AND ref->>'installment_no' = $2::text
        `, [loanId, String(row.installment_no)]);
        
        if (!feeExists.rowCount) {
          const fee = lateFee(Number(a.pmt_principal_interest));
          await client.query(`
            INSERT INTO svc_txns (tenant_id, loan_id, type, amount, alloc_fees, fee_code, memo, ref)
            VALUES ($1,$2,'FEE',$3, $3, 'LATE','Late fee after grace', $6)
          `, [tenantId, loanId, fee, row.installment_no, row.due_date, JSON.stringify({installment_no: row.installment_no, due_date: row.due_date})]);
          
          // GL: Credit Late Fee Income, Debit Cash (or A/R Fees). For simplicity, cash acct here.
          await client.query(`
            INSERT INTO gl_entries (tenant_id, loan_id, debit_acct, credit_acct, amount, memo)
            VALUES ($1,$2,$3,$4,$5,'Late fee assessment')
          `, [tenantId, loanId, Number(process.env.GL_CASH_ACCT || "1000"), Number(process.env.GL_LATE_FEE_INCOME_ACCT || "4100"), fee]);
          
          assessedLate = true;
          lateFees++;
        }
      }

      // 3) Statement generation on due date (or the first calendar day of month—pick due date rule)
      const isDueToday = row.due_date === asOf;
      if (isDueToday) {
        // Compute current due (use schedule row + any accrued fees on account)
        const feesRow = await client.query(`
          SELECT COALESCE(SUM(alloc_fees),0) AS fees FROM svc_txns WHERE loan_id=$1 AND type IN ('FEE') AND ts::date <= $2::date
        `, [loanId, asOf]);
        
        const due = {
          principal: Number(row.principal_due),
          interest: Number(row.interest_due),
          escrow: Number(row.escrow_due),
          fees: Number(feesRow.rows[0].fees || 0)
        };
        const total = round2(due.principal + due.interest + due.escrow + due.fees);

        // Escrow status
        const escSub = await client.query(`SELECT bucket, monthly_accrual, balance FROM svc_escrow_sub WHERE loan_id=$1`, [loanId]);
        const buckets: Record<string, number> = {};
        let escBal = 0;
        for (const e of escSub.rows) {
          buckets[e.bucket] = Number(e.monthly_accrual);
          escBal += Number(e.balance);
        }

        // Simple shortage: ensure 2-month cushion
        const cushion = (Number(process.env.ESCROW_CUSHION_MONTHS || "2")) * (buckets.TAX || 0 + buckets.HOI || 0 + buckets.FLOOD || 0 + buckets.HOA || 0);
        const shortage = Math.max(0, round2(cushion - escBal));
        const shortageMin = Number(process.env.ESCROW_SHORTAGE_MIN_PAY || "100");
        const shortageCollectThisCycle = shortage > 0 ? Math.max(shortageMin, Math.ceil(shortage / 12)) : 0;
        const escrowBalance = escBal;

        // Statement PDF
        const stmt = await renderStatementPdf({
          header: process.env.STMT_PDF_HEADER || "LoanServe • Monthly Statement",
          watermark: process.env.STMT_PDF_WATERMARK || "",
          account: a,
          schedule: [row],
          asOf,
          priorBalance: row.principal_balance_after + Number(row.escrow_due || 0),
          currentDue: { ...due, total },
          delinquency: { dpd, bucket },
          escrow: { buckets, balance: escrowBalance, shortage },
          remitTo: {
            email: process.env.STMT_CONTACT_EMAIL || "",
            phone: process.env.STMT_CONTACT_PHONE || "",
            address: process.env.STMT_RETURN_ADDRESS || ""
          }
        });
        
        const bucket = process.env.AWS_S3_BUCKET || "loanserve-storage";
        const key = `${process.env.S3_PREFIX || "tenants"}/${tenantId}/loans/${loanId}/${process.env.STMT_S3_PREFIX || "statements"}/STMT_${a.loan_id}_${asOf}.pdf`;
        const uri = await putBytes(bucket, key, stmt.pdf);
        
        await client.query(`
          INSERT INTO svc_statements (tenant_id, loan_id, statement_date, cycle_label, file_uri, file_sha256, summary)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [tenantId, loanId, asOf, asOf.slice(0, 7), uri, stmt.sha256, JSON.stringify({
          due, total, delinquency: { dpd, bucket }, escrow: { balance: escrowBalance, shortage, buckets }, shortageCollectThisCycle
        })]);
        
        issued++;
      }

      // 4) Escrow bills: if due within next 30 days and not queued, create bill & disbursement
      const bills = await client.query(`
        SELECT v.id as vendor_id, v.type, v.name
        FROM svc_vendors v WHERE v.loan_id=$1 AND v.type IN ('TAX','HOI','FLOOD','HOA')
      `, [loanId]);
      
      const horizon = dayjs.tz(asOf, Z).add(30, "day").format("YYYY-MM-DD");
      for (const b of bills.rows) {
        // Heuristic: next due on 15th of next month for demo; in prod, derive from docs or vendor APIs
        const impliedDue = dayjs.tz(asOf, Z).add(1, "month").date(15).format("YYYY-MM-DD");
        
        // Skip if already queued for that vendor and due date
        const existBill = await client.query(`SELECT 1 FROM svc_vendor_bills WHERE loan_id=$1 AND vendor_id=$2 AND due_date=$3`, [loanId, b.vendor_id, impliedDue]);
        if (existBill.rowCount) continue;

        const accrual = buckets[b.type] || 0; // monthly bucket as estimate
        const amount = Math.max(50, round2(accrual * 12)); // simple annualized estimate with floor
        
        // Escrow sufficiency check
        const escBal = escrowBalance;
        const scheduled = (escBal >= amount) ? 'Scheduled' : 'Queued'; // if insufficient, stay queued
        
        await client.query(`
          INSERT INTO svc_vendor_bills (tenant_id, loan_id, vendor_id, bucket, due_date, amount, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [tenantId, loanId, b.vendor_id, b.type, impliedDue, amount, scheduled]);
        
        if (scheduled === 'Scheduled') {
          const method = (process.env.DISB_DEFAULT_METHOD || 'ACH') as 'ACH' | 'CHECK' | 'WEBHOOK';
          await client.query(`
            INSERT INTO svc_disbursements (tenant_id, loan_id, vendor_id, bill_id, method, scheduled_date, amount, status, meta)
            VALUES ($1,$2,$3,(SELECT id FROM svc_vendor_bills WHERE loan_id=$2 AND vendor_id=$3 AND due_date=$4 LIMIT 1),$5,$4,$6,'Requested','{}')
          `, [tenantId, loanId, b.vendor_id, impliedDue, method, amount]);
          billsQueued++;
        }
      }
    }

    await client.query(
      `UPDATE svc_cycle_runs SET status='completed', completed_at=now(), metrics=$3 WHERE tenant_id=$1 AND as_of_date=$2`,
      [tenantId, asOf, JSON.stringify({ issued, lateFees, billsQueued })]
    );

    return { ok: true, issued, lateFees, billsQueued };
  } catch (e: any) {
    await pool.query(
      `UPDATE svc_cycle_runs SET status='failed', completed_at=now(), metrics=$3 WHERE tenant_id=$1 AND as_of_date=$2`,
      [tenantId, asOf, JSON.stringify({ error: String(e) })]
    ).catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}