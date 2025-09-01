import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { pdf2pic } from "pdf2pic";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import { ValidationResult } from "./validation-service";

// Document classification types
export enum DocumentType {
  LOAN_APPLICATION = "loan_application",
  INCOME_VERIFICATION = "income_verification", 
  ASSET_VERIFICATION = "asset_verification",
  CREDIT_REPORT = "credit_report",
  APPRAISAL = "appraisal",
  TITLE_REPORT = "title_report",
  INSURANCE_POLICY = "insurance_policy",
  BANK_STATEMENT = "bank_statement",
  TAX_RETURN = "tax_return",
  EMPLOYMENT_VERIFICATION = "employment_verification",
  CLOSING_DISCLOSURE = "closing_disclosure",
  NOTE = "note",
  DEED_OF_TRUST = "deed_of_trust",
  OTHER = "other"
}

export interface PDFExtractionResult {
  text: string;
  metadata: {
    pageCount: number;
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
  documentType: DocumentType;
  confidence: number;
  extractedData: {
    [key: string]: string | number | Date;
  };
}

export class PDFValidationService {
  
  /**
   * Validate and process a PDF file
   */
  async validatePDF(filePath: string): Promise<ValidationResult> {
    try {
      // Check if file exists and is readable
      await fs.access(filePath, fs.constants.R_OK);
      
      // Extract text and metadata from PDF
      const extractionResult = await this.extractPDFContent(filePath);
      
      // Classify document type
      const documentType = await this.classifyDocument(extractionResult.text, extractionResult.metadata);
      
      // Extract structured data based on document type
      const structuredData = await this.extractStructuredData(extractionResult.text, documentType);
      
      // Generate mappings from extracted data
      const mappings = this.generateMappings(structuredData, documentType, filePath);
      
      const errors: ValidationResult['errors'] = [];
      
      // Validate document completeness
      if (extractionResult.text.length < 100) {
        errors.push({
          code: "PDF_INSUFFICIENT_CONTENT",
          severity: "warning",
          message: "PDF contains very little text content - may be image-only or corrupted"
        });
      }
      
      // Check for password protection or encryption
      if (extractionResult.metadata.pageCount === 0) {
        errors.push({
          code: "PDF_UNREADABLE",
          severity: "fatal",
          message: "PDF file cannot be read - may be password protected or corrupted"
        });
      }
      
      return {
        success: errors.filter(e => e.severity === 'fatal').length === 0,
        errors,
        mappings
      };
      
    } catch (error) {
      return {
        success: false,
        errors: [{
          code: "PDF_PROCESSING_ERROR",
          severity: "fatal",
          message: `Failed to process PDF: ${error.message}`
        }]
      };
    }
  }
  
  /**
   * Extract text content and metadata from PDF
   */
  private async extractPDFContent(filePath: string): Promise<PDFExtractionResult> {
    const fileBuffer = await fs.readFile(filePath);
    
    // Load PDF with PDF.js
    const pdfDoc = await pdfjsLib.getDocument({
      data: fileBuffer,
      disableFontFace: true,
      useSystemFonts: false
    }).promise;
    
    const metadata = await pdfDoc.getMetadata();
    const pageCount = pdfDoc.numPages;
    
    // Extract text from all pages
    let fullText = "";
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }
    
    return {
      text: fullText,
      metadata: {
        pageCount,
        title: metadata.info?.Title,
        author: metadata.info?.Author,
        subject: metadata.info?.Subject,
        keywords: metadata.info?.Keywords,
        creator: metadata.info?.Creator,
        producer: metadata.info?.Producer,
        creationDate: metadata.info?.CreationDate ? new Date(metadata.info.CreationDate) : undefined,
        modificationDate: metadata.info?.ModDate ? new Date(metadata.info.ModDate) : undefined,
      },
      documentType: DocumentType.OTHER,
      confidence: 0,
      extractedData: {}
    };
  }
  
  /**
   * Classify document type based on content analysis
   */
  private async classifyDocument(text: string, metadata: any): Promise<DocumentType> {
    const lowerText = text.toLowerCase();
    
    // Document type classification rules
    const classificationRules = [
      {
        type: DocumentType.LOAN_APPLICATION,
        keywords: ['uniform residential loan application', 'urla', 'form 1003', 'borrower information', 'loan application'],
        threshold: 2
      },
      {
        type: DocumentType.INCOME_VERIFICATION,
        keywords: ['verification of employment', 'voe', 'pay stub', 'w-2', 'income verification', 'salary verification'],
        threshold: 2
      },
      {
        type: DocumentType.ASSET_VERIFICATION,
        keywords: ['bank statement', 'verification of deposit', 'vod', 'account balance', 'asset verification'],
        threshold: 2
      },
      {
        type: DocumentType.CREDIT_REPORT,
        keywords: ['credit report', 'fico score', 'experian', 'equifax', 'transunion', 'credit history'],
        threshold: 2
      },
      {
        type: DocumentType.APPRAISAL,
        keywords: ['appraisal report', 'market value', 'appraiser', 'property valuation', 'uniform residential appraisal'],
        threshold: 2
      },
      {
        type: DocumentType.TITLE_REPORT,
        keywords: ['title report', 'title commitment', 'title insurance', 'property title', 'chain of title'],
        threshold: 2
      },
      {
        type: DocumentType.INSURANCE_POLICY,
        keywords: ['insurance policy', 'homeowners insurance', 'hazard insurance', 'property insurance', 'coverage'],
        threshold: 2
      },
      {
        type: DocumentType.TAX_RETURN,
        keywords: ['tax return', 'form 1040', 'internal revenue service', 'irs', 'adjusted gross income'],
        threshold: 2
      },
      {
        type: DocumentType.CLOSING_DISCLOSURE,
        keywords: ['closing disclosure', 'cd form', 'loan terms', 'closing costs', 'cash to close'],
        threshold: 2
      },
      {
        type: DocumentType.NOTE,
        keywords: ['promissory note', 'note rate', 'principal amount', 'maturity date', 'borrower promises to pay'],
        threshold: 2
      },
      {
        type: DocumentType.DEED_OF_TRUST,
        keywords: ['deed of trust', 'trustee', 'beneficiary', 'trustor', 'security instrument'],
        threshold: 2
      }
    ];
    
    // Find best matching document type
    let bestMatch = DocumentType.OTHER;
    let highestScore = 0;
    
    for (const rule of classificationRules) {
      const matchCount = rule.keywords.filter(keyword => lowerText.includes(keyword)).length;
      if (matchCount >= rule.threshold && matchCount > highestScore) {
        bestMatch = rule.type;
        highestScore = matchCount;
      }
    }
    
    return bestMatch;
  }
  
  /**
   * Extract structured data based on document type
   */
  private async extractStructuredData(text: string, documentType: DocumentType): Promise<Record<string, any>> {
    const extractedData: Record<string, any> = {};
    
    switch (documentType) {
      case DocumentType.LOAN_APPLICATION:
        return this.extractLoanApplicationData(text);
      
      case DocumentType.INCOME_VERIFICATION:
        return this.extractIncomeData(text);
      
      case DocumentType.APPRAISAL:
        return this.extractAppraisalData(text);
      
      case DocumentType.CREDIT_REPORT:
        return this.extractCreditData(text);
      
      default:
        // Generic extraction for unknown document types
        return this.extractGenericData(text);
    }
  }
  
  /**
   * Extract loan application data
   */
  private extractLoanApplicationData(text: string): Record<string, any> {
    const data: Record<string, any> = {};
    
    // Loan amount extraction
    const loanAmountMatch = text.match(/loan\s*amount[:\s]*\$?([\d,]+)/i);
    if (loanAmountMatch) {
      data.requestedLoanAmount = parseFloat(loanAmountMatch[1].replace(/,/g, ''));
    }
    
    // Property address extraction
    const addressMatch = text.match(/property\s*address[:\s]*([^\n]+)/i);
    if (addressMatch) {
      data.propertyAddress = addressMatch[1].trim();
    }
    
    // Borrower name extraction
    const borrowerMatch = text.match(/borrower\s*name[:\s]*([^\n]+)/i);
    if (borrowerMatch) {
      data.borrowerName = borrowerMatch[1].trim();
    }
    
    // Purchase price extraction
    const priceMatch = text.match(/purchase\s*price[:\s]*\$?([\d,]+)/i);
    if (priceMatch) {
      data.purchasePrice = parseFloat(priceMatch[1].replace(/,/g, ''));
    }
    
    return data;
  }
  
  /**
   * Extract income verification data
   */
  private extractIncomeData(text: string): Record<string, any> {
    const data: Record<string, any> = {};
    
    // Annual salary extraction
    const salaryMatch = text.match(/annual\s*salary[:\s]*\$?([\d,]+)/i);
    if (salaryMatch) {
      data.annualSalary = parseFloat(salaryMatch[1].replace(/,/g, ''));
    }
    
    // Employer name extraction
    const employerMatch = text.match(/employer[:\s]*([^\n]+)/i);
    if (employerMatch) {
      data.employerName = employerMatch[1].trim();
    }
    
    return data;
  }
  
  /**
   * Extract appraisal data
   */
  private extractAppraisalData(text: string): Record<string, any> {
    const data: Record<string, any> = {};
    
    // Market value extraction
    const valueMatch = text.match(/market\s*value[:\s]*\$?([\d,]+)/i);
    if (valueMatch) {
      data.appraisedValue = parseFloat(valueMatch[1].replace(/,/g, ''));
    }
    
    // Appraisal date extraction
    const dateMatch = text.match(/appraisal\s*date[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (dateMatch) {
      data.appraisalDate = dateMatch[1];
    }
    
    return data;
  }
  
  /**
   * Extract credit report data
   */
  private extractCreditData(text: string): Record<string, any> {
    const data: Record<string, any> = {};
    
    // FICO score extraction
    const ficoMatch = text.match(/fico\s*score[:\s]*(\d{3})/i);
    if (ficoMatch) {
      data.ficoScore = parseInt(ficoMatch[1]);
    }
    
    return data;
  }
  
  /**
   * Generic data extraction for unknown document types
   */
  private extractGenericData(text: string): Record<string, any> {
    const data: Record<string, any> = {};
    
    // Extract any dollar amounts
    const dollarMatches = text.match(/\$[\d,]+/g);
    if (dollarMatches) {
      data.dollarAmounts = dollarMatches.map(match => 
        parseFloat(match.replace(/[$,]/g, ''))
      );
    }
    
    // Extract dates
    const dateMatches = text.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
    if (dateMatches) {
      data.dates = dateMatches;
    }
    
    return data;
  }
  
  /**
   * Generate canonical mappings from extracted data
   */
  private generateMappings(
    structuredData: Record<string, any>,
    documentType: DocumentType,
    filePath: string
  ): Array<{
    canonicalKey: string;
    sourcePointer: string;
    rawValue: any;
    normalizedValue: string;
    confidence: number;
    evidenceHash: string;
    autofilledFrom: "document" | "vendor" | "user" | "payload";
  }> {
    const mappings = [];
    const documentTypeName = path.basename(filePath, '.pdf');
    
    // Map extracted data to canonical format
    for (const [key, value] of Object.entries(structuredData)) {
      if (value !== undefined && value !== null) {
        const canonicalKey = this.mapToCanonicalKey(key, documentType);
        if (canonicalKey) {
          mappings.push({
            canonicalKey,
            sourcePointer: `pdf:${documentTypeName}.${key}`,
            rawValue: value,
            normalizedValue: String(value),
            confidence: this.getConfidenceScore(key, documentType),
            evidenceHash: crypto.createHash('sha256')
              .update(`${key}:${value}:${filePath}`)
              .digest('hex'),
            autofilledFrom: "document" as const
          });
        }
      }
    }
    
    return mappings;
  }
  
  /**
   * Map extracted field to canonical key
   */
  private mapToCanonicalKey(field: string, documentType: DocumentType): string | null {
    const mappings: Record<string, Record<string, string>> = {
      [DocumentType.LOAN_APPLICATION]: {
        'requestedLoanAmount': 'loanTerms.originalAmount',
        'propertyAddress': 'collateral.address.street',
        'borrowerName': 'borrower.fullName',
        'purchasePrice': 'collateral.purchasePrice'
      },
      [DocumentType.APPRAISAL]: {
        'appraisedValue': 'collateral.appraisedValue',
        'appraisalDate': 'collateral.appraisalDate'
      },
      [DocumentType.INCOME_VERIFICATION]: {
        'annualSalary': 'borrower.income.annualSalary',
        'employerName': 'borrower.employment.employerName'
      },
      [DocumentType.CREDIT_REPORT]: {
        'ficoScore': 'borrower.creditScore'
      }
    };
    
    return mappings[documentType]?.[field] || null;
  }
  
  /**
   * Get confidence score for extracted field
   */
  private getConfidenceScore(field: string, documentType: DocumentType): number {
    // Higher confidence for document-specific extractions
    const baseConfidence = 0.7;
    
    // Boost confidence for document type specific fields
    if (documentType !== DocumentType.OTHER) {
      return baseConfidence + 0.2;
    }
    
    return baseConfidence;
  }
}