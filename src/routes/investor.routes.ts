import { Router } from "express";
import { pool } from "../../server/db";
import { runRemittance } from "../investor/engine";
import { generateRemittanceStatement } from "../investor/statement";
import { processRemittancePayout, settleRemittancePayout } from "../investor/payout";
import { periodFor } from "../investor/period";

export const investorRouter = Router();

// Create investor
investorRouter.post("/investors", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { name, deliveryType, webhookUrl, webhookSecret, currency } = req.body;

    if (!name || !deliveryType) {
      return res.status(400).json({ error: "Name and delivery type required" });
    }

    const client = await pool.connect();
    try {
      const investor = await client.query(`
        INSERT INTO inv_investors (tenant_id, name, delivery_type, webhook_url, webhook_secret, currency)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [tenantId, name, deliveryType, webhookUrl || null, webhookSecret || null, currency || 'USD']);

      res.status(201).json({
        success: true,
        investor: investor.rows[0]
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error("Error creating investor:", error);
    res.status(500).json({
      error: "Failed to create investor",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// List investors
investorRouter.get("/investors", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    
    const investors = await client.query(`
      SELECT i.*, 
             COUNT(h.id) as holding_count,
             COALESCE(SUM(h.participation_pct), 0) as total_participation
      FROM inv_investors i
      LEFT JOIN inv_holdings h ON i.id = h.investor_id AND h.active = true
      WHERE i.tenant_id = $1 AND i.active = true
      GROUP BY i.id
      ORDER BY i.name
    `, [tenantId]);

    res.json({
      investors: investors.rows
    });

  } catch (error) {
    console.error("Error fetching investors:", error);
    res.status(500).json({ error: "Failed to fetch investors" });
  } finally {
    client.release();
  }
});

// Add investor holding
investorRouter.post("/investors/:investorId/holdings", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { investorId } = req.params;
    const { loanId, participationPct, svcFeeBps, stripBps, passEscrow, accrualBasis } = req.body;

    if (!loanId || participationPct === undefined) {
      return res.status(400).json({ error: "Loan ID and participation percentage required" });
    }

    const client = await pool.connect();
    try {
      const holding = await client.query(`
        INSERT INTO inv_holdings (
          tenant_id, investor_id, loan_id, participation_pct, 
          svc_fee_bps, strip_bps, pass_escrow, accrual_basis
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id, investor_id, loan_id) 
        DO UPDATE SET 
          participation_pct = EXCLUDED.participation_pct,
          svc_fee_bps = EXCLUDED.svc_fee_bps,
          strip_bps = EXCLUDED.strip_bps,
          pass_escrow = EXCLUDED.pass_escrow,
          accrual_basis = EXCLUDED.accrual_basis,
          active = true
        RETURNING *
      `, [
        tenantId, investorId, loanId, participationPct,
        svcFeeBps || null, stripBps || null, passEscrow || null, accrualBasis || '30/360'
      ]);

      res.status(201).json({
        success: true,
        holding: holding.rows[0]
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error("Error creating holding:", error);
    res.status(500).json({
      error: "Failed to create holding",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get investor holdings
investorRouter.get("/investors/:investorId/holdings", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { investorId } = req.params;
    
    const holdings = await client.query(`
      SELECT h.*, l.loan_number, l.original_amount
      FROM inv_holdings h
      LEFT JOIN loans l ON h.loan_id = l.id
      WHERE h.tenant_id = $1 AND h.investor_id = $2 AND h.active = true
      ORDER BY l.loan_number
    `, [tenantId, investorId]);

    res.json({
      investorId,
      holdings: holdings.rows
    });

  } catch (error) {
    console.error("Error fetching holdings:", error);
    res.status(500).json({ error: "Failed to fetch holdings" });
  } finally {
    client.release();
  }
});

// Run remittance for investor
investorRouter.post("/investors/:investorId/remittances", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { investorId } = req.params;
    const { asOf } = req.body;

    const result = await runRemittance(tenantId, investorId, asOf);

    if (result.skipped) {
      return res.status(200).json({
        success: true,
        message: "Remittance already exists for this period",
        skipped: true
      });
    }

    res.status(201).json({
      success: true,
      message: "Remittance processed successfully",
      ...result
    });

  } catch (error) {
    console.error("Remittance processing failed:", error);
    res.status(500).json({
      error: "Failed to process remittance",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get investor remittances
investorRouter.get("/investors/:investorId/remittances", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { investorId } = req.params;
    
    const remittances = await client.query(`
      SELECT r.*, p.amount as payout_amount, p.status as payout_status, p.method as payout_method
      FROM inv_remit_runs r
      LEFT JOIN inv_remit_payouts p ON r.id = p.run_id
      WHERE r.tenant_id = $1 AND r.investor_id = $2
      ORDER BY r.period_end DESC
    `, [tenantId, investorId]);

    res.json({
      investorId,
      remittances: remittances.rows
    });

  } catch (error) {
    console.error("Error fetching remittances:", error);
    res.status(500).json({ error: "Failed to fetch remittances" });
  } finally {
    client.release();
  }
});

// Generate remittance statement
investorRouter.post("/remittances/:runId/statement", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { runId } = req.params;

    const result = await generateRemittanceStatement(tenantId, runId);

    res.status(200).json({
      success: true,
      statementUri: result.statementUri,
      hash: result.hash
    });

  } catch (error) {
    console.error("Statement generation failed:", error);
    res.status(500).json({
      error: "Failed to generate statement",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Process payout
investorRouter.post("/payouts/:payoutId/process", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { payoutId } = req.params;

    const result = await processRemittancePayout(tenantId, payoutId);

    res.status(200).json({
      success: true,
      message: "Payout processed successfully",
      ...result
    });

  } catch (error) {
    console.error("Payout processing failed:", error);
    res.status(500).json({
      error: "Failed to process payout",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Settle payout
investorRouter.post("/payouts/:payoutId/settle", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const { payoutId } = req.params;
    const { reference } = req.body;

    const result = await settleRemittancePayout(tenantId, payoutId, reference);

    res.status(200).json({
      success: true,
      message: "Payout settled successfully",
      ...result
    });

  } catch (error) {
    console.error("Payout settlement failed:", error);
    res.status(500).json({
      error: "Failed to settle payout",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get period information
investorRouter.get("/periods/current", async (req: any, res) => {
  try {
    const { asOf } = req.query;
    const period = periodFor(asOf as string);

    res.json({
      success: true,
      period,
      cadence: process.env.REMIT_CADENCE || "MONTHLY",
      graceDays: Number(process.env.REMIT_GRACE_DAYS_BUSINESS || "2")
    });

  } catch (error) {
    console.error("Error getting period:", error);
    res.status(500).json({ error: "Failed to get period information" });
  }
});