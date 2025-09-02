// QC System: Worker for Event Processing
// Simplified implementation for immediate integration

import { runQcForLoan } from "../qc/engine";
import { stageStart, stageComplete } from "../monitoring/stage";
import { qcDefectsOpen } from "../monitoring/metrics";

/**
 * QC Worker for processing loan quality control
 * Simplified implementation for immediate integration
 */
export class QcWorker {
  private isRunning: boolean = false;

  /**
   * Initialize and start the QC worker
   */
  async start() {
    console.log("[QcWorker] Starting QC worker...");
    this.isRunning = true;
    console.log("[QcWorker] QC worker started successfully");
  }

  /**
   * Stop the QC worker
   */
  async stop() {
    console.log("[QcWorker] Stopping QC worker...");
    this.isRunning = false;
    console.log("[QcWorker] QC worker stopped");
  }

  /**
   * Run QC for a specific loan
   */
  async processLoan(tenantId: string, loanId: string) {
    if (!this.isRunning) {
      throw new Error("QC worker is not running");
    }

    try {
      console.log(`[QcWorker] Processing QC for loan ${loanId} (tenant: ${tenantId})`);
      
      // Track QC stage start
      stageStart(loanId, "qc");
      
      const results = await runQcForLoan(tenantId, loanId);
      
      // Update QC defects metrics
      if (results.defects && Array.isArray(results.defects)) {
        for (const defect of results.defects) {
          qcDefectsOpen.labels(defect.rule_code || "UNKNOWN", defect.severity || "Medium").inc();
        }
      }
      
      // Track QC stage completion
      stageComplete(loanId, "qc");
      
      console.log(`[QcWorker] QC completed for loan ${loanId}:`, {
        total_rules: results.total_rules,
        defects: results.defects,
        program: results.program
      });
      
      return results;
    } catch (error: any) {
      console.error(`[QcWorker] Failed to process QC for loan ${loanId}:`, error);
      throw error;
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const qcWorker = new QcWorker();

/**
 * Start the QC worker (for backward compatibility)
 */
export async function startQcWorker() {
  return await qcWorker.start();
}