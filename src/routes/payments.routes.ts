import { Router } from "express";
import { pool } from "../../server/db";
import { ingestPayment, ingestLockboxCsv, processAchWebhook, processNsfChargeback } from "../payments/ingest";
import { validateAndPostPayment } from "../payments/post";
import { getReconciliationReport, importBankStatement, manualMatch } from "../payments/reconciliation";
import multer from "multer";
import crypto from "crypto";

export const paymentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Manual payment entry
paymentsRouter.post("/payments/manual", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { loanNumber, loanId, amount, reference, memo } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount required" });
    }

    if (!loanNumber && !loanId) {
      return res.status(400).json({ error: "Loan number or loan ID required" });
    }

    const result = await ingestPayment({
      tenantId,
      loanNumber,
      loanId: loanId ? parseInt(loanId) : undefined,
      amount: parseFloat(amount),
      channel: 'MANUAL',
      reference,
      memo
    });

    res.status(201).json({
      success: true,
      paymentId: result.paymentId,
      status: result.status,
      message: "Payment processed successfully"
    });

  } catch (error) {
    console.error("Manual payment error:", error);
    res.status(500).json({
      error: "Failed to process payment",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Lockbox CSV upload
paymentsRouter.post("/payments/lockbox", upload.single('csvFile'), async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    
    if (!req.file) {
      return res.status(400).json({ error: "CSV file required" });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const fileName = req.file.originalname;

    const result = await ingestLockboxCsv(tenantId, csvContent, fileName);

    res.status(201).json({
      success: true,
      batchId: result.batchId,
      totalCount: result.totalCount,
      successCount: result.successCount,
      results: result.results,
      message: `Processed ${result.successCount} of ${result.totalCount} payments`
    });

  } catch (error) {
    console.error("Lockbox upload error:", error);
    res.status(500).json({
      error: "Failed to process lockbox file",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// ACH webhook endpoint
paymentsRouter.post("/payments/ach-webhook", async (req: any, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-webhook-signature'];
    const secret = process.env.ACH_WEBHOOK_SECRET;
    
    if (secret) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }

    const tenantId = req.body.tenant_id || "00000000-0000-0000-0000-000000000001";
    const result = await processAchWebhook(tenantId, req.body);

    res.status(200).json({
      success: true,
      result,
      message: "Webhook processed successfully"
    });

  } catch (error) {
    console.error("ACH webhook error:", error);
    res.status(500).json({
      error: "Failed to process ACH webhook",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get payment details
paymentsRouter.get("/payments/:id", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    
    const payment = await client.query(`
      SELECT p.*, l.loan_number, b.first_name, b.last_name,
             r.file_uri as receipt_uri
      FROM pay_payments p
      LEFT JOIN loans l ON p.loan_id = l.id
      LEFT JOIN borrowers b ON l.id = b.loan_id AND b.is_primary = true
      LEFT JOIN pay_receipts r ON p.receipt_id = r.id
      WHERE p.id = $1 AND p.tenant_id = $2
    `, [req.params.id, tenantId]);

    if (!payment.rowCount) {
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json({
      payment: payment.rows[0]
    });

  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ error: "Failed to fetch payment" });
  } finally {
    client.release();
  }
});

// List payments for a loan
paymentsRouter.get("/loans/:loanId/payments", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    
    const payments = await client.query(`
      SELECT p.*, r.file_uri as receipt_uri
      FROM pay_payments p
      LEFT JOIN pay_receipts r ON p.receipt_id = r.id
      WHERE p.loan_id = $1 AND p.tenant_id = $2
      ORDER BY p.ts DESC
    `, [req.params.loanId, tenantId]);

    res.json({
      loanId: req.params.loanId,
      payments: payments.rows
    });

  } catch (error) {
    console.error("Error fetching loan payments:", error);
    res.status(500).json({ error: "Failed to fetch payments" });
  } finally {
    client.release();
  }
});

// Get suspense balance for a loan
paymentsRouter.get("/loans/:loanId/suspense", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    
    const suspense = await client.query(`
      SELECT * FROM pay_suspense 
      WHERE loan_id = $1 AND tenant_id = $2
    `, [req.params.loanId, tenantId]);

    res.json({
      loanId: req.params.loanId,
      suspenseBalance: suspense.rows[0]?.balance || 0,
      lastUpdated: suspense.rows[0]?.updated_at || null
    });

  } catch (error) {
    console.error("Error fetching suspense:", error);
    res.status(500).json({ error: "Failed to fetch suspense balance" });
  } finally {
    client.release();
  }
});

// Manual payment posting from suspense
paymentsRouter.post("/payments/:id/post", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const paymentId = req.params.id;

    const result = await validateAndPostPayment({ tenantId, paymentId });

    res.status(200).json({
      success: true,
      result,
      message: "Payment posted successfully"
    });

  } catch (error) {
    console.error("Payment posting error:", error);
    res.status(500).json({
      error: "Failed to post payment",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Bank reconciliation upload
paymentsRouter.post("/reconciliation/bank-statement", upload.single('statementFile'), async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { stmtDate, openingBalance, closingBalance } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: "Bank statement file required" });
    }

    // For this example, we'll assume transactions are in the request body
    // In production, you'd parse the bank statement file
    const transactions = JSON.parse(req.body.transactions || '[]');

    const result = await importBankStatement({
      tenantId,
      stmtDate,
      openingBalance: parseFloat(openingBalance),
      closingBalance: parseFloat(closingBalance),
      transactions,
      fileName: req.file.originalname,
      fileContent: req.file.buffer
    });

    res.status(201).json({
      success: true,
      ...result,
      message: "Bank statement imported successfully"
    });

  } catch (error) {
    console.error("Bank reconciliation error:", error);
    res.status(500).json({
      error: "Failed to import bank statement",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get reconciliation report
paymentsRouter.get("/reconciliation/:stmtDate", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { stmtDate } = req.params;

    const report = await getReconciliationReport(tenantId, stmtDate);

    res.json(report);

  } catch (error) {
    console.error("Reconciliation report error:", error);
    res.status(500).json({
      error: "Failed to generate reconciliation report",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Manual match transaction
paymentsRouter.post("/reconciliation/match", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { bankMatchId, paymentId } = req.body;

    if (!bankMatchId || !paymentId) {
      return res.status(400).json({ error: "Bank match ID and payment ID required" });
    }

    const result = await manualMatch(tenantId, bankMatchId, paymentId);

    res.status(200).json({
      success: true,
      ...result,
      message: "Transaction matched successfully"
    });

  } catch (error) {
    console.error("Manual match error:", error);
    res.status(500).json({
      error: "Failed to match transaction",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});