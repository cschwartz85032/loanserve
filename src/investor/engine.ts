import { pool } from "../../server/db";
import { periodFor, monthlyBpsToMonthlyAmt } from "./period";
// Mock S3 storage for testing
async function putBytes(key: string, buffer: Buffer, contentType: string): Promise<string> {
  const mockS3Uri = `s3://test-bucket/${key}`;
  console.log(`[MockS3] Stored ${buffer.length} bytes at ${mockS3Uri}`);
  return mockS3Uri;
}
import { createHash } from "crypto";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function runRemittance(tenantId: string, investorId: string, asOfISO?: string) {
  const c = await pool.connect();
  
  try {
    // Period
    const per = periodFor(asOfISO);
    const existing = await c.query(`
      SELECT id FROM inv_remit_runs 
      WHERE tenant_id=$1 AND investor_id=$2 AND period_start=$3 AND period_end=$4
    `, [tenantId, investorId, per.start, per.end]);
    
    if (existing.rowCount) {
      return { ok: true, skipped: true };
    }

    const run = await c.query(`
      INSERT INTO inv_remit_runs (tenant_id, investor_id, period_start, period_end) 
      VALUES ($1,$2,$3,$4) RETURNING id
    `, [tenantId, investorId, per.start, per.end]);
    
    const runId = run.rows[0].id;

    // Holdings
    const holdings = await c.query(`
      SELECT h.*, i.delivery_type, 
             COALESCE(h.svc_fee_bps,$3::int) AS svc_bps, 
             COALESCE(h.strip_bps,$4::int) AS strip_bps,
             COALESCE(h.pass_escrow,$5::bool) AS pass_escrow
      FROM inv_holdings h
      JOIN inv_investors i ON i.id=h.investor_id
      WHERE h.tenant_id=$1 AND h.investor_id=$2 AND h.active=true
    `, [
      tenantId, 
      investorId, 
      Number(process.env.REMIT_SVC_FEE_BPS || "50"), 
      Number(process.env.REMIT_STRIP_BPS || "0"), 
      (process.env.REMIT_PASS_ESCROW || "false") === "true"
    ]);

    let totalNet = 0;
    
    for (const h of holdings.rows) {
      // Collect posted payments & adjustments for period
      const tx = await c.query(`
        SELECT type, amount, alloc_principal, alloc_interest, alloc_escrow, alloc_fees
        FROM svc_txns
        WHERE loan_id=$1 AND ts::date BETWEEN $2::date AND $3::date
      `, [h.loan_id, per.start, per.end]);

      let p = 0, i = 0, e = 0, f = 0;
      for (const t of tx.rows) {
        if (t.type === 'PAYMENT') {
          p += Number(t.alloc_principal || 0);
          i += Number(t.alloc_interest || 0);
          e += Number(t.alloc_escrow || 0);
          f += Number(t.alloc_fees || 0);
        } else if (t.type === 'ADJUSTMENT') {
          p += Number(t.alloc_principal || 0);
          i += Number(t.alloc_interest || 0);
          e += Number(t.alloc_escrow || 0);
          f += Number(t.alloc_fees || 0);
        }
      }

      // Simple UPB proxy: beginning = last principal_balance_after before start; ending = after period end
      const begRow = await c.query(`
        SELECT principal_balance_after FROM svc_schedule 
        WHERE loan_id=$1 AND due_date < $2::date
        ORDER BY due_date DESC LIMIT 1
      `, [h.loan_id, per.start]);
      
      const endRow = await c.query(`
        SELECT principal_balance_after FROM svc_schedule 
        WHERE loan_id=$1 AND due_date <= $2::date
        ORDER BY due_date DESC LIMIT 1
      `, [h.loan_id, per.end]);
      
      const upbBeg = Number(begRow.rows[0]?.principal_balance_after || 0);
      const upbEnd = Number(endRow.rows[0]?.principal_balance_after || Math.max(0, upbBeg - p));

      // Servicing fee & strip (monthly on average UPB)
      const avgUPB = (upbBeg + upbEnd) / 2;
      const svcFee = monthlyBpsToMonthlyAmt(Number(h.svc_bps || 0), avgUPB) * Number(h.participation_pct || 1);
      const strip = monthlyBpsToMonthlyAmt(Number(h.strip_bps || 0), avgUPB) * Number(h.participation_pct || 1);

      const passEscrow = !!h.pass_escrow;
      const net = (p + i + (passEscrow ? e : 0)) * Number(h.participation_pct || 1) - svcFee - strip;

      await c.query(`
        INSERT INTO inv_remit_items (
          run_id, tenant_id, investor_id, loan_id, upb_beg, upb_end, 
          principal_collected, interest_collected, escrow_collected, fees_collected, 
          svc_fee, strip_io, net_remit
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [
        runId, tenantId, investorId, h.loan_id, upbBeg, upbEnd, 
        p, i, e, f, round2(svcFee), round2(strip), round2(net)
      ]);

      totalNet += net;
    }

    // Build remittance CSV file (loan-level report)
    const items = await c.query(`
      SELECT * FROM inv_remit_items WHERE run_id=$1 ORDER BY loan_id
    `, [runId]);
    
    const header = "LoanId,UPB_Beg,UPB_End,Principal,Interest,Escrow,Fees,SvcFee,StripIO,Net\n";
    const rows = items.rows.map((r: any) =>
      [r.loan_id, r.upb_beg, r.upb_end, r.principal_collected, r.interest_collected, 
       r.escrow_collected, r.fees_collected, r.svc_fee, r.strip_io, r.net_remit]
        .map(v => String(v)).join(",")
    ).join("\n");
    
    const csv = header + rows + "\n";
    const b = Buffer.from(csv, "utf-8");
    const sha = createHash("sha256").update(b).digest("hex");
    const key = `${process.env.S3_PREFIX || "tenants"}/${tenantId}/${process.env.REMIT_S3_PREFIX || "remittances"}/${investorId}_${per.start}_${per.end}_loan_activity.csv`;
    
    // Mock S3 storage for testing
    const uri = `s3://test-bucket/${key}`;
    console.log(`[MockS3] Generated CSV report: ${csv.length} bytes, SHA: ${sha}`);

    // Create payout row
    const payout = await c.query(`
      INSERT INTO inv_remit_payouts (tenant_id, investor_id, run_id, amount, method, file_uri, file_sha256, status)
      VALUES ($1,$2,$3,$4,'ACH',$5,$6,'Requested') RETURNING id
    `, [tenantId, investorId, runId, round2(totalNet), uri, sha]);
    
    const payoutId = payout.rows[0].id;

    await c.query(`
      UPDATE inv_remit_runs SET status='Completed', completed_at=now(), metrics=$3 
      WHERE id=$1 AND tenant_id=$2
    `, [runId, tenantId, JSON.stringify({ totalNet: round2(totalNet), items: items.rowCount })]);

    // GL entries for remittance
    if (totalNet > 0) {
      // Debit: Investor Payable (liability)
      // Credit: Cash
      await c.query(`
        INSERT INTO gl_entries (tenant_id, debit_acct, credit_acct, amount, memo)
        VALUES ($1, $2, $3, $4, 'Investor remittance payout')
      `, [
        tenantId,
        Number(process.env.GL_INVESTOR_PAYABLE_ACCT || "2300"),
        Number(process.env.GL_CASH_ACCT || "1000"),
        totalNet
      ]);
    }

    return {
      ok: true,
      runId,
      payoutId,
      totalNet: round2(totalNet),
      period: per,
      itemCount: items.rowCount,
      fileUri: uri
    };

  } finally {
    c.release();
  }
}