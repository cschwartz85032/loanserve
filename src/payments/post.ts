import { pool } from "../../server/db";
import dayjs from "dayjs";
import { allocatePayment } from "./allocate";

type PostInput = {
  tenantId: string; 
  paymentId: string;
};

function nearEq(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

async function currentFees(client: any, loanId: number): Promise<number> {
  const fees = await client.query(`
    SELECT COALESCE(SUM(alloc_fees), 0) as total_fees 
    FROM svc_txns 
    WHERE loan_id = $1 AND type = 'FEE'
  `, [loanId]);
  return Number(fees.rows[0]?.total_fees || 0);
}

export async function validateAndPostPayment({ tenantId, paymentId }: PostInput) {
  const c = await pool.connect();
  
  try {
    await c.query(`BEGIN`);
    
    const p = await c.query(`SELECT * FROM pay_payments WHERE id=$1`, [paymentId]);
    if (!p.rowCount) throw new Error("payment not found");
    const pay = p.rows[0];

    // Helper function to reject payment
    const reject = async (reason: string) => {
      await c.query(`UPDATE pay_payments SET status='Rejected', error=$2 WHERE id=$1`, [paymentId, reason]);
      return { status: "Rejected", error: reason };
    };

    // 1) Resolve loan_id if only loan_number provided
    let loanId = pay.loan_id;
    if (!loanId && pay.loan_number) {
      const l = await c.query(`
        SELECT id FROM loans WHERE loan_number = $1 LIMIT 1
      `, [pay.loan_number]);
      loanId = l.rows[0]?.id || null;
    }
    if (!loanId) return await reject("Unroutable — no loan match");

    // 2) Load servicing account & current due row
    const acc = await c.query(`SELECT * FROM svc_accounts WHERE loan_id=$1 AND state='Active'`, [loanId]);
    if (!acc.rowCount) return await reject("Loan not active in servicing");
    const a = acc.rows[0];

    const sched = await c.query(`
      SELECT * FROM svc_schedule WHERE loan_id=$1 AND paid=false 
      ORDER BY installment_no ASC LIMIT 1
    `, [loanId]);
    const row = sched.rows[0];
    if (!row) return await reject("No unpaid schedule rows");

    // 3) Decide suspense vs posting threshold
    const amt = Number(pay.amount);
    const threshold = Number(process.env.PAYMENT_MIN_TO_POST || "25");
    const totalCurrentDue = Number(row.principal_due) + Number(row.interest_due) + Number(row.escrow_due);

    let useSuspense = false;
    if (amt < Math.min(threshold, totalCurrentDue)) useSuspense = true;

    // 4) Allocation using waterfall
    const fees_due = await currentFees(c, loanId);
    const alloc = await allocatePayment({
      pmt_amount: amt,
      pmt_date: dayjs(pay.ts).format("YYYY-MM-DD"),
      installment_no: row.installment_no,
      principal_due: Number(row.principal_due),
      interest_due: Number(row.interest_due),
      escrow_due: Number(row.escrow_due),
      fees_due
    });

    // 5) Suspense path
    if (useSuspense || alloc.leftover > 0) {
      await c.query(`UPDATE pay_payments SET status='Suspense', alloc=$2 WHERE id=$1`, [paymentId, JSON.stringify(alloc)]);
      await c.query(`
        INSERT INTO pay_suspense (tenant_id, loan_id, balance, updated_at)
        VALUES ($1,$2,$3,now())
        ON CONFLICT (tenant_id, loan_id) DO UPDATE SET 
        balance = pay_suspense.balance + EXCLUDED.balance, updated_at=now()
      `, [tenantId, loanId, amt]);
      
      // GL: Debit Cash, Credit Suspense
      await c.query(`
        INSERT INTO gl_entries (tenant_id, loan_id, debit_acct, credit_acct, amount, memo)
        VALUES ($1,$2,$3,$4,$5,'Payment to suspense')
      `, [tenantId, loanId, Number(process.env.GL_CASH_ACCT||"1000"), Number(process.env.GL_SUSPENSE_ACCT||"2200"), amt]);
      
      await c.query(`COMMIT`);
      return { status: "Suspense", alloc };
    }

    // 6) Post to account: svc_txns + schedule update + GL
    // Mark paid if principal+interest+escrow fully covered
    const fullyPaid = nearEq(alloc.alloc_principal, row.principal_due) &&
                      nearEq(alloc.alloc_interest, row.interest_due) &&
                      nearEq(alloc.alloc_escrow, row.escrow_due) &&
                      alloc.alloc_fees >= 0;

    const tx = await c.query(`
      INSERT INTO svc_txns (tenant_id, loan_id, type, amount, alloc_principal, alloc_interest, alloc_escrow, alloc_fees, memo, ref)
      VALUES ($1,$2,'PAYMENT',$3,$4,$5,$6,$7,'Payment posted', $8)
      RETURNING id
    `, [
      tenantId, loanId, amt, alloc.alloc_principal, alloc.alloc_interest, 
      alloc.alloc_escrow, alloc.alloc_fees,
      JSON.stringify({payment_id: paymentId, channel: pay.channel, reference: pay.reference || null})
    ]);
    const txnId = tx.rows[0].id;

    // Schedule row updates
    if (fullyPaid) {
      await c.query(`
        UPDATE svc_schedule SET paid=true, paid_at=now() 
        WHERE loan_id=$1 AND installment_no=$2
      `, [loanId, row.installment_no]);
    }

    // Escrow balance update if any
    if (alloc.alloc_escrow > 0) {
      await c.query(`
        INSERT INTO svc_escrow_sub (tenant_id, loan_id, bucket, balance, monthly_accrual, updated_at)
        VALUES ($1,$2,'TAX',$3,0,now())
        ON CONFLICT (tenant_id, loan_id, bucket) DO UPDATE SET 
        balance = svc_escrow_sub.balance + EXCLUDED.balance, updated_at=now()
      `, [tenantId, loanId, alloc.alloc_escrow]);
    }

    // GL entries: Split credits appropriately
    if (alloc.alloc_interest > 0) {
      await c.query(`
        INSERT INTO gl_entries (tenant_id, loan_id, debit_acct, credit_acct, amount, memo)
        VALUES ($1,$2,$3,$4,$5,'Payment interest')
      `, [tenantId, loanId, Number(process.env.GL_CASH_ACCT||"1000"), Number(process.env.GL_INTEREST_INCOME_ACCT||"4000"), alloc.alloc_interest]);
    }
    
    if (alloc.alloc_fees > 0) {
      await c.query(`
        INSERT INTO gl_entries (tenant_id, loan_id, debit_acct, credit_acct, amount, memo)
        VALUES ($1,$2,$3,$4,$5,'Payment fees')
      `, [tenantId, loanId, Number(process.env.GL_CASH_ACCT||"1000"), Number(process.env.GL_FEE_INCOME_ACCT||"4100"), alloc.alloc_fees]);
    }
    
    if (alloc.alloc_escrow > 0) {
      await c.query(`
        INSERT INTO gl_entries (tenant_id, loan_id, debit_acct, credit_acct, amount, memo)
        VALUES ($1,$2,$3,$4,$5,'Payment escrow')
      `, [tenantId, loanId, Number(process.env.GL_CASH_ACCT||"1000"), Number(process.env.GL_ESCROW_LIABILITY_ACCT||"2100"), alloc.alloc_escrow]);
    }
    
    if (alloc.alloc_principal > 0) {
      await c.query(`
        INSERT INTO gl_entries (tenant_id, loan_id, debit_acct, credit_acct, amount, memo)
        VALUES ($1,$2,$3,$4,$5,'Payment principal')
      `, [tenantId, loanId, Number(process.env.GL_CASH_ACCT||"1000"), Number(process.env.GL_LOAN_PRINCIPAL_ACCT||"1100"), alloc.alloc_principal]);
    }

    // Update payment row
    await c.query(`UPDATE pay_payments SET status='Posted', alloc=$2, posted_txn_id=$3 WHERE id=$1`, [paymentId, JSON.stringify(alloc), txnId]);

    await c.query(`COMMIT`);
    return { status: "Posted", alloc, txnId };
    
  } catch (e) {
    await c.query(`ROLLBACK`);
    await c.query(`UPDATE pay_payments SET status='Rejected', error=$2 WHERE id=$1`, [paymentId, String(e)]).catch(()=>{});
    throw e;
  } finally { 
    c.release(); 
  }
}