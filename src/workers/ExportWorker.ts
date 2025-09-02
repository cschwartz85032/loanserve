// Export Worker: Process export requests and generate files
// Simplified implementation for immediate integration

import { generateExport, saveExport } from "../exports/engine";
import { 
  createExport, 
  markExportRunning, 
  markExportResult, 
  loadCanonicalWithEvidence 
} from "../repo/exports";
import { createHash } from "crypto";

/**
 * Export Worker for processing loan export requests
 * Simplified implementation for immediate integration
 */
export class ExportWorker {
  private isRunning: boolean = false;

  /**
   * Initialize and start the export worker
   */
  async start() {
    console.log("[ExportWorker] Starting export worker...");
    this.isRunning = true;
    console.log("[ExportWorker] Export worker started successfully");
  }

  /**
   * Stop the export worker
   */
  async stop() {
    console.log("[ExportWorker] Stopping export worker...");
    this.isRunning = false;
    console.log("[ExportWorker] Export worker stopped");
  }

  /**
   * Process an export request
   */
  async processExportRequest(opts: {
    tenantId: string;
    loanId: string;
    template: 'fannie' | 'freddie' | 'custom';
    requestedBy?: string;
  }) {
    if (!this.isRunning) {
      throw new Error("Export worker is not running");
    }

    const { tenantId, loanId, template, requestedBy } = opts;
    
    try {
      console.log(`[ExportWorker] Processing export request for loan ${loanId}, template ${template}`);
      
      // Create export record
      const exportRecord = await createExport(tenantId, loanId, template, requestedBy);
      const exportId = exportRecord.id;
      
      // Mark as running
      await markExportRunning(exportId, tenantId);
      
      // Load canonical data and evidence
      const { canonical, evidence } = await loadCanonicalWithEvidence(tenantId, loanId);
      
      // Generate export file
      const mapperVersion = process.env.EXPORTS_VERSION || "v2025.09.03";
      const exportResult = await generateExport({
        tenantId,
        loanId,
        template,
        canonical,
        evidence,
        mapperVersion
      });
      
      // Save to storage
      const fileUri = await saveExport(tenantId, loanId, exportResult.filename, exportResult.bytes);
      
      // Mark as succeeded
      await markExportResult(exportId, tenantId, 'succeeded', fileUri, exportResult.sha256, []);
      
      // Emit webhook (simplified for now)
      await this.emitWebhook(tenantId, exportId, fileUri, exportResult.sha256, template);
      
      console.log(`[ExportWorker] Export completed for loan ${loanId}:`, {
        exportId,
        template,
        fileUri,
        sha256: exportResult.sha256
      });
      
      return {
        exportId,
        status: 'succeeded',
        fileUri,
        sha256: exportResult.sha256,
        filename: exportResult.filename
      };
      
    } catch (error: any) {
      console.error(`[ExportWorker] Export failed for loan ${loanId}:`, error);
      
      // Mark as failed
      const exportId = `export-${Date.now()}`;
      await markExportResult(exportId, tenantId, 'failed', undefined, undefined, [{ message: error.message }]);
      
      throw error;
    }
  }

  /**
   * Emit webhook notifications (simplified)
   */
  private async emitWebhook(tenantId: string, exportId: string, uri: string, sha256: string, template: string) {
    try {
      console.log(`[ExportWorker] Would emit webhook for export ${exportId}, template ${template}`);
      // In production, this would:
      // 1. Query export_webhooks table for active webhooks for this template
      // 2. POST to each webhook URL with signed payload
      // 3. Handle retries and failures
      
      const webhookPayload = {
        export_id: exportId,
        template,
        file_uri: uri,
        sha256,
        timestamp: new Date().toISOString()
      };
      
      console.log("[ExportWorker] Webhook payload:", webhookPayload);
    } catch (error) {
      console.error("[ExportWorker] Webhook emission failed:", error);
      // In production, this would be logged but not block the export
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
export const exportWorker = new ExportWorker();

/**
 * Start the export worker (for backward compatibility)
 */
export async function startExportWorker() {
  return await exportWorker.start();
}