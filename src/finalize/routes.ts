import { Router } from "express";
import { finalizeLoan, canFinalizeLoan, getFinalizationStatus } from "./engine";
import { Request, Response } from "express";

export const finalizeRouter = Router();

/**
 * POST /api/finalize/:loanId
 * Finalize a loan (generate certificate, discrepancy report, lock state)
 */
finalizeRouter.post("/api/finalize/:loanId", async (req: Request, res: Response) => {
  try {
    const { loanId } = req.params;
    const userId = req.user?.id || 1; // Default to user ID 1 if not authenticated

    const loanIdNum = parseInt(loanId);
    if (isNaN(loanIdNum)) {
      return res.status(400).json({ error: "Invalid loan ID" });
    }

    // Check if loan can be finalized
    const eligibility = await canFinalizeLoan(loanIdNum);
    if (!eligibility.canFinalize) {
      return res.status(400).json({
        error: "Cannot finalize loan",
        reasons: eligibility.reasons
      });
    }

    // Perform finalization
    const result = await finalizeLoan(loanIdNum, userId);

    res.json({
      success: true,
      message: "Loan finalized successfully",
      data: result
    });

  } catch (error) {
    console.error("[Finalize] Error finalizing loan:", error);
    res.status(500).json({
      error: "Failed to finalize loan",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * GET /api/finalize/:loanId/status
 * Get finalization status for a loan
 */
finalizeRouter.get("/api/finalize/:loanId/status", async (req: Request, res: Response) => {
  try {
    const { loanId } = req.params;
    
    const loanIdNum = parseInt(loanId);
    if (isNaN(loanIdNum)) {
      return res.status(400).json({ error: "Invalid loan ID" });
    }

    const status = await getFinalizationStatus(loanIdNum);

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error("[Finalize] Error getting finalization status:", error);
    res.status(500).json({
      error: "Failed to get finalization status",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * GET /api/finalize/:loanId/eligibility
 * Check if a loan can be finalized
 */
finalizeRouter.get("/api/finalize/:loanId/eligibility", async (req: Request, res: Response) => {
  try {
    const { loanId } = req.params;
    
    const loanIdNum = parseInt(loanId);
    if (isNaN(loanIdNum)) {
      return res.status(400).json({ error: "Invalid loan ID" });
    }

    const eligibility = await canFinalizeLoan(loanIdNum);

    res.json({
      success: true,
      data: eligibility
    });

  } catch (error) {
    console.error("[Finalize] Error checking eligibility:", error);
    res.status(500).json({
      error: "Failed to check finalization eligibility",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * POST /api/finalize/batch
 * Finalize multiple loans in batch
 */
finalizeRouter.post("/api/finalize/batch", async (req: Request, res: Response) => {
  try {
    const { loanIds } = req.body;
    const userId = req.user?.id || 1; // Default to user ID 1 if not authenticated

    if (!Array.isArray(loanIds) || loanIds.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "loanIds must be a non-empty array"
      });
    }

    const results = [];
    
    for (const loanId of loanIds) {
      try {
        const loanIdNum = parseInt(loanId);
        if (isNaN(loanIdNum)) {
          results.push({
            loanId,
            status: "error",
            error: "Invalid loan ID"
          });
          continue;
        }

        const eligibility = await canFinalizeLoan(loanIdNum);
        if (eligibility.canFinalize) {
          const result = await finalizeLoan(loanIdNum, userId);
          results.push({
            loanId,
            status: "success",
            data: result
          });
        } else {
          results.push({
            loanId,
            status: "skipped",
            reasons: eligibility.reasons
          });
        }
      } catch (error) {
        results.push({
          loanId,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;
    const skippedCount = results.filter(r => r.status === "skipped").length;

    res.json({
      success: true,
      message: `Batch finalization complete: ${successCount} success, ${errorCount} errors, ${skippedCount} skipped`,
      summary: { successCount, errorCount, skippedCount },
      results
    });

  } catch (error) {
    console.error("[Finalize] Error in batch finalization:", error);
    res.status(500).json({
      error: "Failed to process batch finalization",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});