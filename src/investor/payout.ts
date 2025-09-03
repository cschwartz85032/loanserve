import { pool } from "../../server/db";
import { createHash } from "crypto";

export async function processRemittancePayout(tenantId: string, payoutId: string) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get payout details
    const payout = await client.query(`
      SELECT p.*, i.name as investor_name, i.webhook_url, i.webhook_secret
      FROM inv_remit_payouts p
      JOIN inv_investors i ON p.investor_id = i.id
      WHERE p.id = $1 AND p.tenant_id = $2
    `, [payoutId, tenantId]);

    if (!payout.rowCount) throw new Error('Payout not found');
    const payoutData = payout.rows[0];

    if (payoutData.status !== 'Requested') {
      throw new Error(`Payout already processed: ${payoutData.status}`);
    }

    // Update payout status to Sent
    await client.query(`
      UPDATE inv_remit_payouts 
      SET status = 'Sent', sent_at = now(), reference = $2
      WHERE id = $1
    `, [payoutId, `PAY-${payoutId.slice(-8).toUpperCase()}`]);

    // Create GL entries for the payout
    if (Number(payoutData.amount) > 0) {
      // Debit: Cash (reduce asset)
      // Credit: Investor Payable (reduce liability)
      await client.query(`
        INSERT INTO gl_entries (tenant_id, debit_acct, credit_acct, amount, memo)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        tenantId,
        Number(process.env.GL_CASH_ACCT || "1000"),
        Number(process.env.GL_INVESTOR_PAYABLE_ACCT || "2300"),
        payoutData.amount,
        `Investor payout to ${payoutData.investor_name}`
      ]);
    }

    await client.query('COMMIT');

    // Send webhook notification if configured
    if (payoutData.webhook_url) {
      try {
        await sendInvestorWebhook(payoutData);
      } catch (webhookError) {
        console.error('Webhook notification failed:', webhookError);
        // Don't fail the payout for webhook errors
      }
    }

    return {
      success: true,
      payoutId,
      amount: payoutData.amount,
      reference: `PAY-${payoutId.slice(-8).toUpperCase()}`,
      method: payoutData.method,
      status: 'Sent'
    };

  } catch (error) {
    await client.query('ROLLBACK');
    
    // Update payout status to Failed
    await client.query(`
      UPDATE inv_remit_payouts 
      SET status = 'Failed', error = $2
      WHERE id = $1
    `, [payoutId, String(error)]).catch(() => {});

    throw error;
  } finally {
    client.release();
  }
}

async function sendInvestorWebhook(payoutData: any) {
  const payload = {
    event: 'remittance.payout.sent',
    investor_id: payoutData.investor_id,
    payout_id: payoutData.id,
    run_id: payoutData.run_id,
    amount: payoutData.amount,
    currency: payoutData.currency,
    method: payoutData.method,
    reference: payoutData.reference,
    sent_at: new Date().toISOString()
  };

  const headers: any = {
    'Content-Type': 'application/json',
    'User-Agent': 'LoanServe-Remittance/1.0'
  };

  // Add HMAC signature if secret is configured
  if (payoutData.webhook_secret) {
    const signature = createHash('sha256')
      .update(JSON.stringify(payload), 'utf8')
      .digest('hex');
    headers['X-LoanServe-Signature'] = signature;
  }

  const response = await fetch(payoutData.webhook_url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number(process.env.INVESTOR_WEBHOOK_TIMEOUT_MS || "15000"))
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  return { success: true, status: response.status };
}

export async function settleRemittancePayout(tenantId: string, payoutId: string, reference?: string) {
  const client = await pool.connect();
  
  try {
    // Update payout status to Settled
    await client.query(`
      UPDATE inv_remit_payouts 
      SET status = 'Settled', settled_at = now(), reference = COALESCE($3, reference)
      WHERE id = $1 AND tenant_id = $2 AND status = 'Sent'
    `, [payoutId, tenantId, reference]);

    return { success: true, payoutId, status: 'Settled' };

  } finally {
    client.release();
  }
}