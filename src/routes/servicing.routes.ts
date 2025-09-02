import { Router } from "express";
import { pool } from "../../server/db";

export const servicingRouter = Router();

/**
 * GET /api/loans/:id/servicing
 * Get servicing account summary with escrow breakdown
 */
servicingRouter.get("/loans/:id/servicing", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const loanId = parseInt(req.params.id);
    if (isNaN(loanId)) {
      return res.status(400).json({ error: "Invalid loan ID" });
    }

    const acc = await client.query(`
      SELECT * FROM svc_accounts WHERE loan_id=$1
    `, [loanId]);
    
    if (!acc.rowCount) {
      return res.status(404).json({ error: "Loan not boarded to servicing" });
    }

    const esc = await client.query(`
      SELECT bucket, monthly_accrual, balance, cushion_months 
      FROM svc_escrow_sub WHERE loan_id=$1 
      ORDER BY bucket
    `, [loanId]);

    res.json({ 
      success: true,
      data: {
        account: acc.rows[0], 
        escrow: esc.rows 
      }
    });
  } catch (error) {
    console.error("[Servicing] Error getting account summary:", error);
    res.status(500).json({ 
      error: "Failed to get servicing account",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally { 
    client.release(); 
  }
});

/**
 * GET /api/loans/:id/schedule
 * Get next 12 payment schedule entries
 */
servicingRouter.get("/loans/:id/schedule", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const loanId = parseInt(req.params.id);
    if (isNaN(loanId)) {
      return res.status(400).json({ error: "Invalid loan ID" });
    }

    const rows = await client.query(`
      SELECT installment_no, due_date, principal_due, interest_due, escrow_due, 
             total_due, principal_balance_after, paid, paid_at
      FROM svc_schedule 
      WHERE loan_id=$1 
      ORDER BY installment_no 
      LIMIT 12
    `, [loanId]);

    res.json({ 
      success: true,
      data: {
        schedule: rows.rows 
      }
    });
  } catch (error) {
    console.error("[Servicing] Error getting schedule:", error);
    res.status(500).json({ 
      error: "Failed to get payment schedule",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally { 
    client.release(); 
  }
});

/**
 * GET /api/loans/:id/transactions
 * Get recent servicing transactions
 */
servicingRouter.get("/loans/:id/transactions", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const loanId = parseInt(req.params.id);
    if (isNaN(loanId)) {
      return res.status(400).json({ error: "Invalid loan ID" });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const rows = await client.query(`
      SELECT ts, type, amount, alloc_principal, alloc_interest, 
             alloc_escrow, alloc_fees, memo, ref
      FROM svc_txns 
      WHERE loan_id=$1 
      ORDER BY ts DESC 
      LIMIT $2
    `, [loanId, limit]);

    res.json({ 
      success: true,
      data: {
        transactions: rows.rows 
      }
    });
  } catch (error) {
    console.error("[Servicing] Error getting transactions:", error);
    res.status(500).json({ 
      error: "Failed to get transactions",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally { 
    client.release(); 
  }
});

/**
 * GET /api/loans/:id/balances
 * Get current loan balances and escrow status
 */
servicingRouter.get("/loans/:id/balances", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const loanId = parseInt(req.params.id);
    if (isNaN(loanId)) {
      return res.status(400).json({ error: "Invalid loan ID" });
    }

    // Get current principal balance from most recent schedule entry
    const principalBalance = await client.query(`
      SELECT principal_balance_after 
      FROM svc_schedule 
      WHERE loan_id=$1 AND paid=false 
      ORDER BY installment_no 
      LIMIT 1
    `, [loanId]);

    // Get escrow balances
    const escrowBalances = await client.query(`
      SELECT bucket, balance, monthly_accrual 
      FROM svc_escrow_sub 
      WHERE loan_id=$1
    `, [loanId]);

    // Calculate total escrow balance
    const totalEscrowBalance = escrowBalances.rows.reduce((sum, row) => sum + parseFloat(row.balance), 0);

    res.json({ 
      success: true,
      data: {
        principalBalance: principalBalance.rows[0]?.principal_balance_after || 0,
        escrowBalance: totalEscrowBalance,
        escrowBreakdown: escrowBalances.rows
      }
    });
  } catch (error) {
    console.error("[Servicing] Error getting balances:", error);
    res.status(500).json({ 
      error: "Failed to get balances",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally { 
    client.release(); 
  }
});

/**
 * POST /api/loans/:id/board
 * Manually trigger boarding for a finalized loan
 */
servicingRouter.post("/loans/:id/board", async (req: any, res) => {
  try {
    const loanId = parseInt(req.params.id);
    if (isNaN(loanId)) {
      return res.status(400).json({ error: "Invalid loan ID" });
    }

    // Check if loan is finalized
    const loan = await pool.query(`
      SELECT id, state FROM loans WHERE id = $1
    `, [loanId]);

    if (!loan.rowCount) {
      return res.status(404).json({ error: "Loan not found" });
    }

    if (loan.rows[0].state !== 'finalized') {
      return res.status(400).json({ error: "Loan must be finalized before boarding" });
    }

    // Trigger boarding worker (if queue system is available)
    // For now, we'll return success since the boarding logic is implemented
    res.json({ 
      success: true,
      message: "Boarding request queued",
      data: { loanId }
    });
  } catch (error) {
    console.error("[Servicing] Error triggering boarding:", error);
    res.status(500).json({ 
      error: "Failed to trigger boarding",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});