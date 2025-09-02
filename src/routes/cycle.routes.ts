import { Router } from "express";
import { pool } from "../../server/db";
import { triggerDailyCycle } from "../workers/ServicingCycleWorker";
import { processDueDisbursements } from "../workers/DisbursementBridgeWorker";
import { testSimpleCycle } from '../servicing/cycle.simple';

export const cycleRouter = Router();

// Manual trigger for daily cycle (admin endpoint)
cycleRouter.post("/servicing/cycle/tick", async (req: any, res) => {
  try {
    // For now, manually trigger the cycle
    // In production, this would publish to the message queue
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const asOf = req.body?.asOf;
    
    const result = await triggerDailyCycle(tenantId, asOf);
    
    res.status(202).json({ 
      status: "completed", 
      message: "Daily cycle triggered successfully",
      result 
    });
  } catch (error) {
    console.error("Cycle trigger failed:", error);
    res.status(500).json({ 
      error: "Failed to trigger cycle", 
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get statements for a loan
cycleRouter.get("/loans/:id/statements", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    
    const result = await client.query(`
      SELECT statement_date, cycle_label, file_uri, file_sha256, summary
      FROM svc_statements 
      WHERE loan_id = $1 
      ORDER BY statement_date DESC
    `, [req.params.id]);
    
    res.json({ 
      loan_id: req.params.id, 
      statements: result.rows 
    });
  } catch (error) {
    console.error("Error fetching statements:", error);
    res.status(500).json({ error: "Failed to fetch statements" });
  } finally {
    client.release();
  }
});

// Get vendor bills for a loan
cycleRouter.get("/loans/:id/vendor-bills", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    
    const result = await client.query(`
      SELECT vb.*, v.name as vendor_name, v.type as vendor_type
      FROM svc_vendor_bills vb
      LEFT JOIN svc_vendors v ON vb.vendor_id = v.id
      WHERE vb.loan_id = $1 
      ORDER BY vb.due_date
    `, [req.params.id]);
    
    res.json({ 
      loan_id: req.params.id, 
      bills: result.rows 
    });
  } catch (error) {
    console.error("Error fetching vendor bills:", error);
    res.status(500).json({ error: "Failed to fetch vendor bills" });
  } finally {
    client.release();
  }
});

// Get disbursements for a loan
cycleRouter.get("/loans/:id/disbursements", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    
    const result = await client.query(`
      SELECT d.*, v.name as vendor_name, vb.bucket
      FROM svc_disbursements d
      LEFT JOIN svc_vendors v ON d.vendor_id = v.id
      LEFT JOIN svc_vendor_bills vb ON d.bill_id = vb.id
      WHERE d.loan_id = $1 
      ORDER BY d.scheduled_date DESC
    `, [req.params.id]);
    
    res.json({ 
      loan_id: req.params.id, 
      disbursements: result.rows 
    });
  } catch (error) {
    console.error("Error fetching disbursements:", error);
    res.status(500).json({ error: "Failed to fetch disbursements" });
  } finally {
    client.release();
  }
});

// Get cycle runs for debugging
cycleRouter.get("/servicing/cycle/runs", async (req: any, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    
    const result = await client.query(`
      SELECT * FROM svc_cycle_runs 
      WHERE tenant_id = $1 
      ORDER BY as_of_date DESC 
      LIMIT 20
    `, [tenantId]);
    
    res.json({ 
      tenant_id: tenantId,
      cycle_runs: result.rows 
    });
  } catch (error) {
    console.error("Error fetching cycle runs:", error);
    res.status(500).json({ error: "Failed to fetch cycle runs" });
  } finally {
    client.release();
  }
});

// Simple test endpoint for debugging
cycleRouter.post("/servicing/cycle/test", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const asOf = req.body?.asOf;
    
    const result = await testSimpleCycle(tenantId, asOf);
    
    res.status(200).json({ 
      status: "completed", 
      message: "Simple cycle test passed",
      result 
    });
  } catch (error) {
    console.error("Simple cycle test failed:", error);
    res.status(500).json({ 
      error: "Failed to run simple cycle test", 
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Manual trigger for disbursement processing
cycleRouter.post("/servicing/disbursements/process", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || "00000000-0000-0000-0000-000000000001";
    const asOf = req.body?.asOf || new Date().toISOString().split('T')[0];
    
    const result = await processDueDisbursements(tenantId, asOf);
    
    res.status(202).json({ 
      status: "completed", 
      message: "Disbursements processed successfully",
      disbursements: result 
    });
  } catch (error) {
    console.error("Disbursement processing failed:", error);
    res.status(500).json({ 
      error: "Failed to process disbursements", 
      message: error instanceof Error ? error.message : String(error)
    });
  }
});