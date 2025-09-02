import { pool } from "../../server/db";

export async function queueDueDisbursements(tenantId: string, asOfISO: string) {
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    const rows = await client.query(`
      SELECT d.id, d.loan_id, d.vendor_id, d.bill_id, d.amount, d.method
      FROM svc_disbursements d
      WHERE d.scheduled_date <= $1::date AND d.status='Requested'
    `, [asOfISO]);
    return rows.rows;
  } finally {
    client.release();
  }
}

export async function updateDisbursementStatus(
  disbursementId: string, 
  status: 'Sent' | 'Settled' | 'Failed' | 'Cancelled',
  reference?: string
) {
  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE svc_disbursements 
      SET status = $2, 
          reference = $3, 
          sent_at = CASE WHEN $2='Sent' THEN now() ELSE sent_at END, 
          settled_at = CASE WHEN $2='Settled' THEN now() ELSE settled_at END 
      WHERE id = $1
    `, [disbursementId, status, reference || null]);

    // Escrow GL on settlement
    if (status === 'Settled') {
      const row = await client.query(`SELECT loan_id, amount, tenant_id FROM svc_disbursements WHERE id=$1`, [disbursementId]);
      if (row.rows.length > 0) {
        const { loan_id: loanId, amount, tenant_id: tenantId } = row.rows[0];
        await client.query(`
          INSERT INTO gl_entries (tenant_id, loan_id, debit_acct, credit_acct, amount, memo)
          VALUES ($1, $2, $3, $4, $5, 'Escrow disbursement settlement')
        `, [tenantId, loanId, Number(process.env.GL_ESCROW_LIABILITY_ACCT || "2100"), Number(process.env.GL_CASH_ACCT || "1000"), amount]);
      }
    }
  } finally {
    client.release();
  }
}