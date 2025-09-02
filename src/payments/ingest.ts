import { pool } from "../../server/db";
import { validateAndPostPayment } from "./post";
import { createReceiptPdf } from "./receipt";
import dayjs from "dayjs";
import crypto from "crypto";

type PaymentInput = {
  tenantId: string;
  loanNumber?: string;
  loanId?: number;
  amount: number;
  channel: 'ACH' | 'CARD' | 'LOCKBOX' | 'MANUAL';
  reference?: string;
  memo?: string;
  batchId?: string;
};

export async function ingestPayment(input: PaymentInput) {
  const client = await pool.connect();
  
  try {
    const payment = await client.query(`
      INSERT INTO pay_payments (
        tenant_id, batch_id, loan_id, loan_number, amount, channel, reference, memo, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Received')
      RETURNING id
    `, [
      input.tenantId,
      input.batchId || null,
      input.loanId || null,
      input.loanNumber || null,
      input.amount,
      input.channel,
      input.reference || null,
      input.memo || null
    ]);

    const paymentId = payment.rows[0].id;

    // Auto-validate and post if above minimum threshold
    const minAmount = Number(process.env.PAYMENT_MIN_TO_POST || "25");
    if (input.amount >= minAmount) {
      try {
        const result = await validateAndPostPayment({
          tenantId: input.tenantId,
          paymentId
        });

        // Generate receipt PDF if successfully posted
        if (result.status === 'Posted' && input.loanId && 'alloc' in result) {
          await createReceiptPdf({
            tenantId: input.tenantId,
            paymentId,
            loanId: input.loanId,
            allocation: result.alloc
          });
        }

        return { paymentId, ...result };
      } catch (error) {
        console.error('Payment posting failed:', error);
        return { paymentId, status: 'Rejected', error: String(error) };
      }
    }

    return { paymentId, status: 'Received' };

  } finally {
    client.release();
  }
}

export async function ingestLockboxCsv(tenantId: string, csvContent: string, fileName: string) {
  const client = await pool.connect();
  
  try {
    // Create batch
    const batch = await client.query(`
      INSERT INTO pay_batches (tenant_id, channel, batch_date, file_uri, file_sha256)
      VALUES ($1, 'LOCKBOX', $2, $3, $4)
      RETURNING id
    `, [
      tenantId,
      dayjs().format('YYYY-MM-DD'),
      fileName,
      crypto.createHash('sha256').update(csvContent).digest('hex')
    ]);

    const batchId = batch.rows[0].id;
    const lines = csvContent.trim().split('\n');
    const header = lines[0];
    const expectedHeader = process.env.LOCKBOX_CSV_HEADER || 'PaymentDate,LoanNumber,Amount,Reference,Channel';
    
    if (header !== expectedHeader) {
      throw new Error(`Invalid CSV header. Expected: ${expectedHeader}`);
    }

    const results: Array<{line: number, success: boolean, paymentId?: string, error?: string}> = [];
    for (let i = 1; i < lines.length; i++) {
      const [paymentDate, loanNumber, amount, reference, channel] = lines[i].split(',');
      
      try {
        const result = await ingestPayment({
          tenantId,
          loanNumber: loanNumber.trim(),
          amount: parseFloat(amount),
          channel: (channel?.trim() as any) || 'LOCKBOX',
          reference: reference?.trim(),
          batchId
        });
        
        results.push({ line: i + 1, success: true, paymentId: result.paymentId });
      } catch (error) {
        results.push({ line: i + 1, success: false, error: String(error) });
      }
    }

    // Update batch status
    const successCount = results.filter(r => r.success).length;
    const status = successCount === results.length - 1 ? 'Posted' : 'Failed';
    
    await client.query(`
      UPDATE pay_batches SET status = $1, posted_at = now() WHERE id = $2
    `, [status, batchId]);

    return { batchId, results, successCount, totalCount: results.length };

  } finally {
    client.release();
  }
}

export async function processAchWebhook(tenantId: string, webhookData: any) {
  // ACH webhook processing
  const { amount, loan_number, reference, status, transaction_id } = webhookData;
  
  if (status === 'completed') {
    return await ingestPayment({
      tenantId,
      loanNumber: loan_number,
      amount: parseFloat(amount),
      channel: 'ACH',
      reference: transaction_id || reference
    });
  } else if (status === 'failed' || status === 'returned') {
    // Handle NSF/chargeback
    return await processNsfChargeback(tenantId, loan_number, parseFloat(amount), reference);
  }
  
  return { status: 'ignored', reason: `Unhandled ACH status: ${status}` };
}

export async function processNsfChargeback(tenantId: string, loanNumber: string, amount: number, reference: string) {
  const client = await pool.connect();
  
  try {
    // Find original payment
    const payment = await client.query(`
      SELECT * FROM pay_payments 
      WHERE tenant_id = $1 AND loan_number = $2 AND amount = $3 AND reference = $4
      ORDER BY ts DESC LIMIT 1
    `, [tenantId, loanNumber, amount, reference]);

    if (!payment.rowCount) {
      throw new Error('Original payment not found for NSF/chargeback');
    }

    const originalPayment = payment.rows[0];
    
    // Create reversal payment
    const reversal = await ingestPayment({
      tenantId,
      loanNumber,
      amount: -amount, // Negative amount for reversal
      channel: 'ACH',
      reference: `NSF-REV-${reference}`,
      memo: 'NSF/Chargeback reversal'
    });

    // Add NSF fee if configured
    const nsfFee = Number(process.env.NSF_FEE || "35");
    if (nsfFee > 0) {
      await ingestPayment({
        tenantId,
        loanNumber,
        amount: nsfFee,
        channel: 'MANUAL',
        reference: `NSF-FEE-${reference}`,
        memo: 'NSF fee assessment'
      });
    }

    // Update original payment status
    await client.query(`
      UPDATE pay_payments SET status = 'Reversed' WHERE id = $1
    `, [originalPayment.id]);

    return { reversalId: reversal.paymentId, nsfFee };

  } finally {
    client.release();
  }
}