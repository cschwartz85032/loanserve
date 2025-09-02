// QC System: API Routes for Defect Management
// RESTful endpoints for QC status, manual runs, and waivers

import { Router } from "express";
import { qcWorker } from "../workers/QcWorker";

export const qcRouter = Router();

/**
 * GET /api/qc/status - Get QC worker status
 */
qcRouter.get("/status", async (req, res) => {
  try {
    const status = qcWorker.getStatus();
    res.json(status);
  } catch (error: any) {
    console.error("[QcRoutes] Error getting QC status:", error);
    res.status(500).json({ error: "Failed to get QC status" });
  }
});

/**
 * GET /api/loans/:id/qc - Get current QC defects for a loan
 */
qcRouter.get("/loans/:id/qc", async (req, res) => {
  try {
    // For now, return mock defects structure
    // In full implementation, this would query the qc_defects table
    const mockDefects = [
      {
        id: "defect-001",
        rule_code: "QC001",
        rule_name: "Note Amount Match",
        severity: "high",
        status: "open",
        message: "NoteAmount $350000 != CD TotalLoanAmount $350000",
        created_at: new Date().toISOString(),
        resolved_at: null,
        evidence_doc_id: "doc-123",
        evidence_page: 1
      }
    ];

    res.json({ 
      loan_id: req.params.id, 
      defects: mockDefects,
      summary: {
        total: mockDefects.length,
        open: mockDefects.filter(d => d.status === 'open').length,
        resolved: mockDefects.filter(d => d.status === 'resolved').length,
        waived: mockDefects.filter(d => d.status === 'waived').length
      }
    });
  } catch (error: any) {
    console.error("[QcRoutes] Error getting loan QC defects:", error);
    res.status(500).json({ error: "Failed to get loan QC defects" });
  }
});

/**
 * POST /api/loans/:id/qc/run - Manually trigger QC for a loan
 */
qcRouter.post("/loans/:id/qc/run", async (req, res) => {
  try {
    const loanId = req.params.id;
    const tenantId = req.headers['x-tenant-id'] as string || "default-tenant";

    console.log(`[QcRoutes] Manual QC trigger requested for loan ${loanId}`);

    // Process QC immediately
    const results = await qcWorker.processLoan(tenantId, loanId);
    
    res.json({
      status: "completed",
      loan_id: loanId,
      results: {
        total_rules: results.total_rules,
        defects: results.defects,
        program: results.program,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error("[QcRoutes] Error running manual QC:", error);
    res.status(500).json({ 
      status: "error",
      error: error.message || "Failed to run QC" 
    });
  }
});

/**
 * POST /api/loans/:id/qc/waive - Waive a specific defect
 */
qcRouter.post("/loans/:id/qc/waive", async (req, res) => {
  try {
    const { defect_id, rationale } = req.body;
    
    if (!defect_id) {
      return res.status(400).json({ error: "defect_id is required" });
    }

    if (!rationale || rationale.trim().length === 0) {
      return res.status(400).json({ error: "rationale is required for waiving defects" });
    }

    // For now, just log the waiver action
    // In full implementation, this would update the qc_defects table
    console.log(`[QcRoutes] Defect ${defect_id} waived for loan ${req.params.id}:`, rationale);

    res.json({ 
      ok: true,
      defect_id,
      status: "waived",
      rationale,
      waived_at: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[QcRoutes] Error waiving defect:", error);
    res.status(500).json({ error: "Failed to waive defect" });
  }
});

/**
 * GET /api/qc/rules - Get available QC rules
 */
qcRouter.get("/rules", async (req, res) => {
  try {
    // Mock QC rules structure
    // In full implementation, this would query the qc_rules table
    const mockRules = [
      {
        id: "rule-001",
        code: "QC001",
        name: "Note Amount Match",
        description: "Note amount must equal CD loan amount within $0.01",
        severity: "high",
        enabled: true,
        params: {}
      },
      {
        id: "rule-002",
        code: "QC002",
        name: "Interest Rate Tolerance",
        description: "Interest rate difference must be within tolerance",
        severity: "medium",
        enabled: true,
        params: { tolerance: 0.125 }
      },
      {
        id: "rule-003",
        code: "QC003",
        name: "Payment Date Alignment",
        description: "First payment date must align with note date",
        severity: "medium",
        enabled: true,
        params: { maxDays: 62 }
      },
      {
        id: "rule-013",
        code: "QC013",
        name: "HOI Required",
        description: "Homeowner's insurance required by program",
        severity: "high",
        enabled: true,
        params: { required: true }
      }
    ];

    res.json({
      rules: mockRules,
      total: mockRules.length,
      enabled: mockRules.filter(r => r.enabled).length
    });
  } catch (error: any) {
    console.error("[QcRoutes] Error getting QC rules:", error);
    res.status(500).json({ error: "Failed to get QC rules" });
  }
});

/**
 * GET /api/qc/programs - Get program requirements
 */
qcRouter.get("/programs", async (req, res) => {
  try {
    // Mock program requirements
    // In full implementation, this would query the program_requirements table
    const mockPrograms = [
      {
        program_code: "FNMA",
        name: "Fannie Mae",
        requirements: [
          { key: "HomeownersInsCarrier", required: true },
          { key: "HOIPolicyNumber", required: true },
          { key: "FloodZone", required: true },
          { key: "AppraisedValue", required: true }
        ]
      },
      {
        program_code: "FRE",
        name: "Freddie Mac",
        requirements: [
          { key: "HomeownersInsCarrier", required: true },
          { key: "HOIPolicyNumber", required: true },
          { key: "FloodZone", required: true }
        ]
      },
      {
        program_code: "PORTFOLIO",
        name: "Portfolio Loan",
        requirements: [
          { key: "HomeownersInsCarrier", required: false },
          { key: "FloodZone", required: false }
        ]
      }
    ];

    res.json({
      programs: mockPrograms,
      total: mockPrograms.length
    });
  } catch (error: any) {
    console.error("[QcRoutes] Error getting program requirements:", error);
    res.status(500).json({ error: "Failed to get program requirements" });
  }
});