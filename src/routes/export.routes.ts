// Export Routes: API endpoints for export management

import { Router } from "express";
import { exportWorker } from "../workers/ExportWorker";
import { getExport } from "../repo/exports";

export const exportRouter = Router();

/**
 * POST /api/loans/:id/export - Request export for a loan
 */
exportRouter.post("/loans/:id/export", async (req, res) => {
  try {
    const { template } = req.body || {};
    const loanId = req.params.id;
    
    if (!['fannie','freddie','custom'].includes(template)) {
      return res.status(400).json({ error: "Invalid template. Must be 'fannie', 'freddie', or 'custom'" });
    }
    
    const tenantId = req.headers['x-tenant-id'] as string || "default-tenant";
    const requestedBy = (req as any).user?.id || null;
    
    console.log(`[ExportRoutes] Export request for loan ${loanId}, template ${template}`);
    
    // Process export immediately (in production this would be queued)
    const result = await exportWorker.processExportRequest({
      tenantId,
      loanId,
      template,
      requestedBy
    });
    
    res.status(202).json({ 
      status: "completed", // For demo, return completed immediately
      export_id: result.exportId,
      file_uri: result.fileUri,
      sha256: result.sha256
    });
    
  } catch (error: any) {
    console.error("[ExportRoutes] Export request failed:", error);
    res.status(500).json({ 
      error: "Export failed",
      message: error.message 
    });
  }
});

/**
 * GET /api/exports/:exportId - Get export status
 */
exportRouter.get("/exports/:exportId", async (req, res) => {
  try {
    const exportId = req.params.exportId;
    const tenantId = req.headers['x-tenant-id'] as string || "default-tenant";
    
    const exportRecord = await getExport(exportId, tenantId);
    if (!exportRecord) {
      return res.status(404).json({ error: "Export not found" });
    }
    
    res.json(exportRecord);
  } catch (error: any) {
    console.error("[ExportRoutes] Error getting export status:", error);
    res.status(500).json({ error: "Failed to get export status" });
  }
});

/**
 * GET /api/exports/:exportId/file - Get export file info
 */
exportRouter.get("/exports/:exportId/file", async (req, res) => {
  try {
    const exportId = req.params.exportId;
    const tenantId = req.headers['x-tenant-id'] as string || "default-tenant";
    
    const exportRecord = await getExport(exportId, tenantId);
    if (!exportRecord || exportRecord.status !== 'succeeded') {
      return res.status(404).json({ error: "Export file not available" });
    }
    
    res.json({ 
      file_uri: exportRecord.file_uri, 
      sha256: exportRecord.file_sha256,
      download_url: `${exportRecord.file_uri}?download=true`
    });
  } catch (error: any) {
    console.error("[ExportRoutes] Error getting export file:", error);
    res.status(500).json({ error: "Failed to get export file" });
  }
});

/**
 * GET /api/export/templates - Get available export templates
 */
exportRouter.get("/templates", async (req, res) => {
  try {
    const templates = [
      {
        id: 'fannie',
        name: 'Fannie Mae ULDD XML',
        format: 'xml',
        description: 'Fannie Mae Uniform Loan Delivery Dataset in XML format'
      },
      {
        id: 'freddie',
        name: 'Freddie Mac ULDD XML',
        format: 'xml',
        description: 'Freddie Mac Uniform Loan Delivery Dataset in XML format'
      },
      {
        id: 'custom',
        name: 'Custom CSV Export',
        format: 'csv',
        description: 'Custom loan data export in CSV format'
      }
    ];
    
    res.json({ templates });
  } catch (error: any) {
    console.error("[ExportRoutes] Error getting templates:", error);
    res.status(500).json({ error: "Failed to get export templates" });
  }
});

/**
 * GET /api/export/status - Get export worker status
 */
exportRouter.get("/status", async (req, res) => {
  try {
    const status = exportWorker.getStatus();
    res.json(status);
  } catch (error: any) {
    console.error("[ExportRoutes] Error getting worker status:", error);
    res.status(500).json({ error: "Failed to get worker status" });
  }
});