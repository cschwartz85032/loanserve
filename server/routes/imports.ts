import express from "express";
import multer from "multer";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { eq, and, desc } from "drizzle-orm";
import { 
  imports, 
  importErrors, 
  importMappings, 
  loanCandidates,
  loanDatapoints,
  insertImportsSchema,
  insertImportErrorsSchema,
  insertImportMappingsSchema,
  insertLoanCandidatesSchema,
  insertLoanDatapointsSchema,
  type Imports,
  type ImportErrors,
  type ImportMappings
} from "../../shared/schema";
import { db } from "../db";
import { requireAuth, requirePermission } from "../auth/middleware";
import { AppError, ErrorCode } from "../utils/error-handler";

const router = express.Router();

// Configure multer for file uploads (max 200MB as per spec)
const uploadStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadDir = 'server/uploads/imports';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating import upload directory:', error);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `import-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: uploadStorage,
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB max file size as per spec
  }
});

// POST /imports - Start an import (MISMO, CSV, JSON)
router.post("/imports", 
  requireAuth,
  requirePermission("imports.write"),
  upload.single("file"), 
  async (req, res) => {
    try {
      const { type, program_hint, investor_template } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: "File is required" });
      }

      if (!["mismo", "csv", "json", "api"].includes(type)) {
        return res.status(400).json({ error: "Invalid import type" });
      }

      // Calculate file hash
      const fileBuffer = await fs.readFile(req.file.path);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Get tenant ID from authenticated user (assuming req.user has tenantId)
      const tenantId = (req as any).user?.tenantId || (req as any).user?.id; // Fallback to user ID for now
      const createdBy = (req as any).user?.id;

      // Create import record
      const newImport = await db.insert(imports).values({
        tenantId,
        type: type as any,
        filename: req.file.originalname,
        size: req.file.size,
        sha256,
        status: "received",
        errorCount: 0,
        createdBy
      }).returning();

      // TODO: Publish to RabbitMQ for async processing
      // await mq.publish("import." + type, "received", { importId: imp.id, tenantId });

      res.status(202)
        .location(`/api/imports/${newImport[0].id}`)
        .json({ 
          id: newImport[0].id,
          status: "received",
          message: "Import accepted for processing"
        });

    } catch (error) {
      console.error("Error creating import:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /imports/:id - Import status & errors
router.get("/imports/:id", 
  requireAuth,
  requirePermission("imports.read"),
  async (req, res) => {
    try {
      const importId = req.params.id;
      
      // Get import record
      const importRecord = await db
        .select()
        .from(imports)
        .where(eq(imports.id, importId))
        .limit(1);

      if (!importRecord.length) {
        return res.status(404).json({ error: "Import not found" });
      }

      const imp = importRecord[0];

      // Get errors for this import
      const errors = await db
        .select()
        .from(importErrors)
        .where(eq(importErrors.importId, importId))
        .orderBy(desc(importErrors.createdAt));

      // Get mapping preview if status is accepted/mapped
      let mappingPreview = null;
      if (imp.status === "accepted" || imp.status === "ingested") {
        const mappings = await db
          .select()
          .from(importMappings)
          .where(eq(importMappings.importId, importId))
          .limit(150); // Top 150 as per spec

        mappingPreview = {
          canonical: mappings.map(m => ({
            key: m.canonicalKey,
            value: m.normalizedValue || '',
            normalized_value: m.normalizedValue || '',
            evidence: {
              source_pointer: m.sourcePointer,
              evidence_hash: m.evidenceHash
            },
            confidence: parseFloat(m.confidence || '0'),
            autofilled_from: m.autofilledFrom
          }))
        };
      }

      res.json({
        id: imp.id,
        status: imp.status,
        error_count: imp.errorCount || 0,
        created_at: imp.createdAt,
        errors: errors.map(e => ({
          code: e.code,
          severity: e.severity,
          pointer: e.pointer,
          message: e.message,
          raw_fragment: e.rawFragment
        })),
        mapping_preview: mappingPreview
      });

    } catch (error) {
      console.error("Error fetching import:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /imports/:id/ingest - Commit the import and create/update a loan candidate
router.post("/imports/:id/ingest", 
  requireAuth,
  requirePermission("loans.write"),
  async (req, res) => {
    try {
      const importId = req.params.id;
      
      // Get import record
      const importRecord = await db
        .select()
        .from(imports)
        .where(eq(imports.id, importId))
        .limit(1);

      if (!importRecord.length) {
        return res.status(404).json({ error: "Import not found" });
      }

      const imp = importRecord[0];

      if (!["accepted", "mapped"].includes(imp.status)) {
        return res.status(409).json({ error: "Import not in acceptable state for ingestion" });
      }

      // Get mappings for this import
      const mappings = await db
        .select()
        .from(importMappings)
        .where(eq(importMappings.importId, importId));

      // Create loan candidate with mapped data
      const candidateData: any = {};
      mappings.forEach(m => {
        candidateData[m.canonicalKey] = m.normalizedValue;
      });

      const loanCandidate = await db.insert(loanCandidates).values({
        tenantId: imp.tenantId,
        sourceImportId: importId,
        loanNumber: candidateData.LoanNumber || `CAND-${Date.now()}`,
        status: "application",
        candidateData
      }).returning();

      // Create loan datapoints with lineage
      const datapoints = mappings.map(m => ({
        loanCandidateId: loanCandidate[0].id,
        canonicalKey: m.canonicalKey,
        value: candidateData[m.canonicalKey],
        normalizedValue: m.normalizedValue,
        evidenceHash: m.evidenceHash,
        confidence: m.confidence,
        ingestSource: "payload" as const,
        autofilledFrom: m.autofilledFrom,
        sourcePointer: m.sourcePointer
      }));

      if (datapoints.length > 0) {
        await db.insert(loanDatapoints).values(datapoints);
      }

      // Update import status
      await db
        .update(imports)
        .set({ status: "ingested" })
        .where(eq(imports.id, importId));

      // Generate snapshot hash for audit trail
      const snapshotHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(candidateData))
        .digest('hex');

      // TODO: Publish to RabbitMQ for downstream QC
      // await mq.publish("loan.qc", "start", { loanId: loanCandidate[0].id, sourceImportId: importId });

      res.status(201).json({
        loan_id: loanCandidate[0].id,
        snapshot_hash: snapshotHash
      });

    } catch (error) {
      console.error("Error ingesting import:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /imports/specs/csv - Download current CSV template & data dictionary
router.get("/imports/specs/csv", 
  requireAuth,
  requirePermission("imports.read"),
  async (req, res) => {
    try {
      // CSV template columns as per spec
      const csvColumns = [
        "LoanNumber", "InvestorLoanId", "LenderLoanId", 
        "BorrowerFirstName", "BorrowerLastName",
        "PropertyStreet", "PropertyCity", "PropertyState", "PropertyZip",
        "OriginalLoanAmount", "InterestRate", "RateType", "PaymentType", 
        "AmortTermMonths", "FirstPaymentDate", "MaturityDate", "PnIAmount",
        "EscrowRequired", "TaxEscrowMonthly", "InsuranceEscrowMonthly",
        "HOICarrier", "HOIPolicyNumber", "HOIPhone", "HOIEmail", 
        "HOIEffectiveDate", "HOIExpirationDate",
        "FloodZone", "FloodInsRequired", "TitleCompanyName", "TitleFileNumber",
        "AppraisedValue", "AppraisalDate", "OccupancyType", "LoanPurpose", 
        "LTV", "CLTV"
      ];

      const csvHeader = csvColumns.join(",");
      const csvTemplate = csvHeader + "\n"; // Empty template

      const dataDictionary = {
        columns: csvColumns.map(col => ({
          name: col,
          type: getColumnType(col),
          required: isRequiredColumn(col),
          description: getColumnDescription(col),
          format: getColumnFormat(col)
        })),
        rules: {
          dates: "YYYY-MM-DD",
          currency: "decimal (2 places)",
          percentages: "decimal (e.g., 7.125)",
          state: "2-letter USPS",
          booleans: "true|false|1|0"
        }
      };

      // Return CSV or JSON based on Accept header
      const acceptHeader = req.headers.accept;
      if (acceptHeader?.includes('text/csv')) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="loan_import_template.csv"');
        res.send(csvTemplate);
      } else {
        res.json(dataDictionary);
      }

    } catch (error) {
      console.error("Error generating CSV spec:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Helper functions for CSV spec generation
function getColumnType(column: string): string {
  const typeMap: Record<string, string> = {
    'LoanNumber': 'string',
    'OriginalLoanAmount': 'number',
    'InterestRate': 'number',
    'AmortTermMonths': 'integer',
    'FirstPaymentDate': 'date',
    'MaturityDate': 'date',
    'PnIAmount': 'number',
    'EscrowRequired': 'boolean',
    'PropertyState': 'string',
    'PropertyZip': 'string',
    'AppraisedValue': 'number',
    'LTV': 'number',
    'CLTV': 'number'
  };
  return typeMap[column] || 'string';
}

function isRequiredColumn(column: string): boolean {
  const required = [
    'LoanNumber', 'BorrowerFirstName', 'BorrowerLastName',
    'PropertyStreet', 'PropertyCity', 'PropertyState', 'PropertyZip',
    'OriginalLoanAmount', 'InterestRate', 'RateType', 'AmortTermMonths',
    'FirstPaymentDate', 'MaturityDate'
  ];
  return required.includes(column);
}

function getColumnDescription(column: string): string {
  const descriptions: Record<string, string> = {
    'LoanNumber': 'Unique loan identifier',
    'InvestorLoanId': 'Investor-assigned loan identifier',
    'BorrowerFirstName': 'Primary borrower first name',
    'BorrowerLastName': 'Primary borrower last name',
    'OriginalLoanAmount': 'Original loan amount in dollars',
    'InterestRate': 'Interest rate as percentage (e.g., 7.125)',
    'RateType': 'Fixed or ARM',
    'AmortTermMonths': 'Amortization term in months',
    'PropertyState': '2-letter state code',
    'PropertyZip': '5-digit ZIP code or ZIP+4',
    'EscrowRequired': 'Whether escrow is required (true/false)',
    'HOICarrier': 'Homeowners insurance carrier name',
    'FloodInsRequired': 'Whether flood insurance is required'
  };
  return descriptions[column] || `${column} field`;
}

function getColumnFormat(column: string): string | undefined {
  const formats: Record<string, string> = {
    'FirstPaymentDate': 'YYYY-MM-DD',
    'MaturityDate': 'YYYY-MM-DD',
    'HOIEffectiveDate': 'YYYY-MM-DD',
    'HOIExpirationDate': 'YYYY-MM-DD',
    'AppraisalDate': 'YYYY-MM-DD',
    'PropertyState': '^[A-Z]{2}$',
    'PropertyZip': '^\\d{5}(-\\d{4})?$',
    'InterestRate': 'decimal with up to 4 decimal places',
    'OriginalLoanAmount': 'decimal with 2 decimal places'
  };
  return formats[column];
}

export default router;