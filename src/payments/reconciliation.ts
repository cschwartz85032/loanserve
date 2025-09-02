import { pool } from "../../server/db";
import { putBytes } from "../utils/storage";
import dayjs from "dayjs";
import crypto from "crypto";

type BankStatementInput = {
  tenantId: string;
  stmtDate: string;
  openingBalance: number;
  closingBalance: number;
  transactions: Array<{
    amount: number;
    reference: string;
    description: string;
  }>;
  fileName: string;
  fileContent: Buffer;
};

export async function importBankStatement(input: BankStatementInput) {
  const client = await pool.connect();
  
  try {
    // Store statement file
    const hash = crypto.createHash('sha256').update(input.fileContent).digest('hex');
    const s3Key = `${process.env.RECON_S3_PREFIX || 'recon'}/${input.tenantId}/${input.stmtDate}-${input.fileName}`;
    const s3Uri = await putBytes(s3Key, input.fileContent, 'application/pdf');

    // Create bank statement record
    const stmt = await client.query(`
      INSERT INTO recon_bank (tenant_id, stmt_date, opening_balance, closing_balance, file_uri, file_sha256)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [input.tenantId, input.stmtDate, input.openingBalance, input.closingBalance, s3Uri, hash]);

    const bankId = stmt.rows[0].id;

    // Auto-match transactions
    const matches = [];
    for (const txn of input.transactions) {
      const matchResult = await autoMatchTransaction(client, input.tenantId, bankId, txn);
      matches.push(matchResult);
    }

    // Update reconciliation status
    const totalMatched = matches.filter(m => m.matched).length;
    const reconciliationComplete = totalMatched === input.transactions.length;

    return {
      bankId,
      fileUri: s3Uri,
      totalTransactions: input.transactions.length,
      matchedTransactions: totalMatched,
      reconciliationComplete,
      matches
    };

  } finally {
    client.release();
  }
}

async function autoMatchTransaction(client: any, tenantId: string, bankId: string, txn: any) {
  // Try to match by amount and date range (±2 days)
  const matchQuery = await client.query(`
    SELECT p.id, p.amount, p.reference, p.ts
    FROM pay_payments p
    WHERE p.tenant_id = $1 
    AND p.status = 'Posted'
    AND ABS(p.amount - $2) < 0.01
    AND p.ts >= (CURRENT_DATE - INTERVAL '2 days')
    AND p.ts <= (CURRENT_DATE + INTERVAL '2 days')
    ORDER BY ABS(p.amount - $2), ABS(EXTRACT(EPOCH FROM (p.ts - CURRENT_TIMESTAMP)))
    LIMIT 1
  `, [tenantId, txn.amount]);

  if (matchQuery.rowCount > 0) {
    const payment = matchQuery.rows[0];
    
    // Create match record
    await client.query(`
      INSERT INTO recon_matches (tenant_id, bank_id, payment_id, amount, status)
      VALUES ($1, $2, $3, $4, 'Auto')
    `, [tenantId, bankId, payment.id, txn.amount]);

    return {
      matched: true,
      paymentId: payment.id,
      matchType: 'Auto',
      bankAmount: txn.amount,
      paymentAmount: payment.amount,
      reference: txn.reference
    };
  }

  // No match found - create unmatched record
  await client.query(`
    INSERT INTO recon_matches (tenant_id, bank_id, payment_id, amount, status)
    VALUES ($1, $2, NULL, $3, 'Manual')
  `, [tenantId, bankId, txn.amount]);

  return {
    matched: false,
    matchType: 'Manual',
    bankAmount: txn.amount,
    reference: txn.reference,
    requiresManualReview: true
  };
}

export async function getReconciliationReport(tenantId: string, stmtDate: string) {
  const client = await pool.connect();
  
  try {
    // Get bank statement
    const stmt = await client.query(`
      SELECT * FROM recon_bank WHERE tenant_id = $1 AND stmt_date = $2
    `, [tenantId, stmtDate]);

    if (!stmt.rowCount) {
      throw new Error('Bank statement not found');
    }

    const statement = stmt.rows[0];

    // Get matches
    const matches = await client.query(`
      SELECT m.*, p.reference as payment_reference, p.ts as payment_date
      FROM recon_matches m
      LEFT JOIN pay_payments p ON m.payment_id = p.id
      WHERE m.tenant_id = $1 AND m.bank_id = $2
      ORDER BY m.amount DESC
    `, [tenantId, statement.id]);

    // Calculate reconciliation summary
    const totalBankTxns = matches.rowCount;
    const matchedTxns = matches.rows.filter(m => m.payment_id).length;
    const unmatchedTxns = totalBankTxns - matchedTxns;
    const totalBankAmount = matches.rows.reduce((sum, m) => sum + Number(m.amount), 0);
    const matchedAmount = matches.rows
      .filter(m => m.payment_id)
      .reduce((sum, m) => sum + Number(m.amount), 0);

    return {
      statement: {
        date: statement.stmt_date,
        openingBalance: statement.opening_balance,
        closingBalance: statement.closing_balance,
        fileUri: statement.file_uri
      },
      reconciliation: {
        totalTransactions: totalBankTxns,
        matchedTransactions: matchedTxns,
        unmatchedTransactions: unmatchedTxns,
        totalAmount: totalBankAmount,
        matchedAmount: matchedAmount,
        unmatchedAmount: totalBankAmount - matchedAmount,
        reconciliationComplete: unmatchedTxns === 0
      },
      matches: matches.rows
    };

  } finally {
    client.release();
  }
}

export async function manualMatch(tenantId: string, bankMatchId: string, paymentId: string) {
  const client = await pool.connect();
  
  try {
    // Update match record
    await client.query(`
      UPDATE recon_matches 
      SET payment_id = $1, status = 'Manual'
      WHERE id = $2 AND tenant_id = $3
    `, [paymentId, bankMatchId, tenantId]);

    return { success: true, matchId: bankMatchId, paymentId };

  } finally {
    client.release();
  }
}