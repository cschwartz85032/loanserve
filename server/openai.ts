import fs from "fs/promises";
import axios, { AxiosError } from "axios";
import { setTimeout } from "timers/promises";
import { v4 as uuidv4 } from "uuid";

// Use dynamic imports for pdf2pic and pdfjs-dist
let fromPath: any;
let getDocument: any;

try {
  ({ fromPath } = await import("pdf2pic"));
  console.log("[INFO] Successfully loaded pdf2pic module");
} catch (error) {
  console.error("[FATAL] Failed to load pdf2pic module", { error: error.message });
  throw new Error("pdf2pic module is not installed. Run `npm install pdf2pic`");
}

try {
  ({ getDocument } = await import("pdfjs-dist/build/pdf.js"));
  console.log("[INFO] Successfully loaded pdfjs-dist module");
} catch (error) {
  console.error("[FATAL] Failed to load pdfjs-dist module", { error: error.message });
  throw new Error("pdfjs-dist module is not installed. Run `npm install pdfjs-dist@4`");
}

export interface DocumentAnalysisResult {
  documentType: string;
  extractedData: {
    propertyStreetAddress?: string;
    propertyCity?: string;
    propertyState?: string;
    propertyZipCode?: string;
    propertyType?: string;
    propertyValue?: number;
    borrowerName?: string;
    borrowerSSN?: string;
    borrowerIncome?: number;
    borrowerStreetAddress?: string;
    borrowerCity?: string;
    borrowerState?: string;
    borrowerZipCode?: string;
    loanAmount?: number;
    interestRate?: number;
    loanTerm?: number;
    loanType?: string;
    monthlyPayment?: number;
    escrowAmount?: number;
    hoaFees?: number;
    downPayment?: number;
    closingCosts?: number;
    pmi?: number;
    taxes?: number;
    insurance?: number;
    closingDate?: string;
    firstPaymentDate?: string;
    prepaymentExpirationDate?: string;
    trusteeName?: string;
    trusteeStreetAddress?: string;
    trusteeCity?: string;
    trusteeState?: string;
    trusteeZipCode?: string;
    beneficiaryName?: string;
    beneficiaryStreetAddress?: string;
    beneficiaryCity?: string;
    beneficiaryState?: string;
    beneficiaryZipCode?: string;
    loanDocuments?: string[];
    defaultConditions?: string[];
    insuranceRequirements?: string[];
    crossDefaultParties?: string[];
  };
  confidence: number;
}

interface ApiConfig {
  baseURL: string;
  timeout: number;
  maxRetries: number;
  initialRetryDelay: number;
  maxFileSize: number;
  maxPagesToConvert: number;
  maxJsonContentSize: number;
}

export class DocumentAnalysisService {
  private readonly config: ApiConfig;
  private readonly apiKey: string;
  private readonly logger: {
    info: (message: string, meta?: Record<string, any>) => void;
    warn: (message: string, meta?: Record<string, any>) => void;
    error: (message: string, meta?: Record<string, any>) => void;
  };

  constructor() {
    const apiKey = process.env.XAI_API_KEY_NEW || process.env.XAI_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("XAI_API_KEY or XAI_API_KEY_NEW is missing or invalid");
    }
    this.apiKey = apiKey;
    this.config = {
      baseURL: "https://api.x.ai/v1",
      timeout: 180000,
      maxRetries: 3,
      initialRetryDelay: 500,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxPagesToConvert: 5,
      maxJsonContentSize: 1000000, // 1MB
    };
    this.logger = {
      info: (message, meta = {}) => console.log(`[INFO] ${message}`, meta),
      warn: (message, meta = {}) => console.warn(`[WARN] ${message}`, meta),
      error: (message, meta = {}) => console.error(`[ERROR] ${message}`, meta),
    };
    this.logger.info("DocumentAnalysisService initialized", {
      apiKeyLength: apiKey.length,
      config: this.config,
    });
  }

  private validateFile(fileName: string, fileBuffer: Buffer): void {
    if (!fileName) {
      throw new Error("File name is required");
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error("File buffer is empty or invalid");
    }
    if (fileBuffer.length > this.config.maxFileSize) {
      throw new Error(
        `File size exceeds maximum limit of ${this.config.maxFileSize / (1024 * 1024)}MB`,
      );
    }
    if (!/\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
      throw new Error(
        "Unsupported file type. Supported types: PDF, JPG, JPEG, PNG, GIF, WEBP",
      );
    }
  }

  private buildDocumentAnalysisPrompt(
    fileName: string,
    fileBuffer: Buffer,
    documentText?: string,
  ): string {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    const isPDF = /\.pdf$/i.test(fileName);
    return `Analyze this ${isImage ? "image" : "PDF document"} named "${fileName}" completely and extract all relevant mortgage loan information.
=== DOCUMENT ANALYSIS ===
Document: ${fileName}
Size: ${Math.round(fileBuffer.length / 1024)}KB
Type: ${isImage ? "Image" : "PDF"}