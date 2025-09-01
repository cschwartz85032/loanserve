import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { parse as parseCSV } from "csv-parse/sync";
import { parseStringPromise } from "xml2js";
import { z } from "zod";
import { db } from "../../db";
import { 
  imports, 
  importErrors, 
  importMappings,
  type ImportErrors,
  type ImportMappings 
} from "../../../shared/schema";
import { eq } from "drizzle-orm";
import { PDFValidationService } from "./pdf-validation-service";

export interface ValidationResult {
  success: boolean;
  errors: Array<{
    code: string;
    severity: "fatal" | "error" | "warning" | "info";
    pointer?: string;
    message: string;
    rawFragment?: any;
  }>;
  mappings?: Array<{
    canonicalKey: string;
    sourcePointer: string;
    rawValue: any;
    normalizedValue: string;
    confidence: number;
    evidenceHash: string;
    autofilledFrom: "document" | "vendor" | "user" | "payload";
  }>;
}

// CSV Schema Definition
const csvLoanSchema = z.object({
  LoanNumber: z.string().min(1, "Loan number is required"),
  InvestorLoanId: z.string().optional(),
  LenderLoanId: z.string().optional(),
  BorrowerFirstName: z.string().min(1, "Borrower first name is required"),
  BorrowerLastName: z.string().min(1, "Borrower last name is required"),
  PropertyStreet: z.string().min(1, "Property street is required"),
  PropertyCity: z.string().min(1, "Property city is required"),
  PropertyState: z.string().regex(/^[A-Z]{2}$/, "State must be 2-letter code"),
  PropertyZip: z.string().regex(/^\d{5}(-\d{4})?$/, "ZIP must be 5 digits or ZIP+4"),
  OriginalLoanAmount: z.coerce.number().positive("Original loan amount must be positive"),
  InterestRate: z.coerce.number().min(0).max(50, "Interest rate must be between 0 and 50"),
  RateType: z.enum(["Fixed", "ARM", "Variable"]),
  PaymentType: z.string().optional(),
  AmortTermMonths: z.coerce.number().int().positive("Amortization term must be positive"),
  FirstPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  MaturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  PnIAmount: z.coerce.number().optional(),
  EscrowRequired: z.union([z.boolean(), z.string()]).transform(val => {
    if (typeof val === 'boolean') return val;
    return ['true', '1', 'yes'].includes(val.toLowerCase());
  }).optional(),
  TaxEscrowMonthly: z.coerce.number().optional(),
  InsuranceEscrowMonthly: z.coerce.number().optional(),
  HOICarrier: z.string().optional(),
  HOIPolicyNumber: z.string().optional(),
  HOIPhone: z.string().optional(),
  HOIEmail: z.string().email().optional(),
  HOIEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  HOIExpirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  FloodZone: z.string().optional(),
  FloodInsRequired: z.union([z.boolean(), z.string()]).transform(val => {
    if (typeof val === 'boolean') return val;
    return ['true', '1', 'yes'].includes(val.toLowerCase());
  }).optional(),
  TitleCompanyName: z.string().optional(),
  TitleFileNumber: z.string().optional(),
  AppraisedValue: z.coerce.number().positive().optional(),
  AppraisalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  OccupancyType: z.enum(["Primary", "Secondary", "Investment"]).optional(),
  LoanPurpose: z.enum(["Purchase", "Refinance", "CashOut"]).optional(),
  LTV: z.coerce.number().min(0).max(200).optional(),
  CLTV: z.coerce.number().min(0).max(200).optional()
});

export class ValidationService {
  private pdfValidationService: PDFValidationService;

  constructor() {
    this.pdfValidationService = new PDFValidationService();
  }
  
  /**
   * Validate a CSV file
   */
  async validateCSV(filePath: string): Promise<ValidationResult> {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const records = parseCSV(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      if (records.length === 0) {
        return {
          success: false,
          errors: [{
            code: "CSV_EMPTY",
            severity: "fatal",
            message: "CSV file is empty or has no data rows"
          }]
        };
      }

      const errors: ValidationResult['errors'] = [];
      const mappings: ValidationResult['mappings'] = [];

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const rowNumber = i + 2; // Account for header row

        try {
          const validatedRecord = csvLoanSchema.parse(record);
          
          // Generate mappings for valid record
          for (const [key, value] of Object.entries(validatedRecord)) {
            if (value !== undefined && value !== null && value !== '') {
              const mapping = {
                canonicalKey: this.mapToCanonical(key),
                sourcePointer: `row[${rowNumber}].${key}`,
                rawValue: record[key],
                normalizedValue: String(value),
                confidence: 1.0,
                evidenceHash: crypto.createHash('sha256')
                  .update(`${key}:${record[key]}:${rowNumber}`)
                  .digest('hex'),
                autofilledFrom: "payload" as const
              };
              mappings.push(mapping);
            }
          }

        } catch (error) {
          if (error instanceof z.ZodError) {
            for (const issue of error.issues) {
              errors.push({
                code: `CSV_VALIDATION_${issue.code.toUpperCase()}`,
                severity: "error",
                pointer: `row[${rowNumber}].${issue.path.join('.')}`,
                message: issue.message,
                rawFragment: record[issue.path[0] as string]
              });
            }
          }
        }
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
          code: "CSV_PARSE_ERROR",
          severity: "fatal",
          message: `Failed to parse CSV: ${error.message}`
        }]
      };
    }
  }

  /**
   * Validate a JSON file
   */
  async validateJSON(filePath: string): Promise<ValidationResult> {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      const errors: ValidationResult['errors'] = [];
      const mappings: ValidationResult['mappings'] = [];

      // Handle both single loan object and array of loans
      const loans = Array.isArray(data) ? data : [data];

      if (loans.length === 0) {
        return {
          success: false,
          errors: [{
            code: "JSON_EMPTY",
            severity: "fatal",
            message: "JSON file contains no loan data"
          }]
        };
      }

      for (let i = 0; i < loans.length; i++) {
        const loan = loans[i];
        
        // Validate required fields
        if (!loan.loanNumber) {
          errors.push({
            code: "JSON_MISSING_LOAN_NUMBER",
            severity: "fatal",
            pointer: `loans[${i}].loanNumber`,
            message: "Loan number is required"
          });
        }

        // Map JSON structure to canonical format
        this.mapJSONToCanonical(loan, `loans[${i}]`, mappings);
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
          code: "JSON_PARSE_ERROR",
          severity: "fatal",
          message: `Failed to parse JSON: ${error.message}`
        }]
      };
    }
  }

  /**
   * Validate a PDF file
   */
  async validatePDF(filePath: string): Promise<ValidationResult> {
    return await this.pdfValidationService.validatePDF(filePath);
  }

  /**
   * Validate a MISMO 3.4 XML file
   */
  async validateMISMO(filePath: string): Promise<ValidationResult> {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const xmlDoc = await parseStringPromise(fileContent);

      const errors: ValidationResult['errors'] = [];
      const mappings: ValidationResult['mappings'] = [];

      // Validate MISMO structure
      if (!xmlDoc.DOCUMENT || !xmlDoc.DOCUMENT.DEAL_SETS) {
        errors.push({
          code: "MISMO_INVALID_STRUCTURE",
          severity: "fatal",
          message: "Invalid MISMO XML structure: missing DOCUMENT or DEAL_SETS"
        });
        return { success: false, errors };
      }

      // Extract loans from MISMO structure
      const dealSets = Array.isArray(xmlDoc.DOCUMENT.DEAL_SETS) 
        ? xmlDoc.DOCUMENT.DEAL_SETS 
        : [xmlDoc.DOCUMENT.DEAL_SETS];

      for (const dealSet of dealSets) {
        if (dealSet.DEAL_SET && dealSet.DEAL_SET.DEALS) {
          const deals = Array.isArray(dealSet.DEAL_SET.DEALS) 
            ? dealSet.DEAL_SET.DEALS 
            : [dealSet.DEAL_SET.DEALS];

          for (let i = 0; i < deals.length; i++) {
            const deal = deals[i];
            this.mapMISMOToCanonical(deal, `deals[${i}]`, mappings, errors);
          }
        }
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
          code: "MISMO_PARSE_ERROR",
          severity: "fatal",
          message: `Failed to parse MISMO XML: ${error.message}`
        }]
      };
    }
  }

  /**
   * Process validation result and save to database
   */
  async processValidationResult(
    importId: string, 
    result: ValidationResult
  ): Promise<void> {
    try {
      // Save errors to database
      if (result.errors.length > 0) {
        const errorRecords = result.errors.map(error => ({
          importId,
          code: error.code,
          severity: error.severity,
          pointer: error.pointer,
          message: error.message,
          rawFragment: error.rawFragment ? JSON.stringify(error.rawFragment) : null
        }));

        await db.insert(importErrors).values(errorRecords);
      }

      // Save mappings to database
      if (result.mappings && result.mappings.length > 0) {
        const mappingRecords = result.mappings.map(mapping => ({
          importId,
          canonicalKey: mapping.canonicalKey,
          sourcePointer: mapping.sourcePointer,
          rawValue: mapping.rawValue ? String(mapping.rawValue) : null,
          normalizedValue: mapping.normalizedValue,
          confidence: String(mapping.confidence),
          evidenceHash: mapping.evidenceHash,
          autofilledFrom: mapping.autofilledFrom
        }));

        await db.insert(importMappings).values(mappingRecords);
      }

      // Update import status
      const status = result.success ? "accepted" : "errors";
      await db
        .update(imports)
        .set({ 
          status,
          errorCount: result.errors.length
        })
        .where(eq(imports.id, importId));

    } catch (error) {
      console.error('Failed to process validation result:', error);
      throw error;
    }
  }

  /**
   * Map CSV field names to canonical format
   */
  private mapToCanonical(csvField: string): string {
    const mapping: Record<string, string> = {
      'LoanNumber': 'loanNumber',
      'InvestorLoanId': 'investorLoanId',
      'LenderLoanId': 'lenderLoanId',
      'BorrowerFirstName': 'borrower.firstName',
      'BorrowerLastName': 'borrower.lastName',
      'PropertyStreet': 'collateral.address.street',
      'PropertyCity': 'collateral.address.city',
      'PropertyState': 'collateral.address.state',
      'PropertyZip': 'collateral.address.zip',
      'OriginalLoanAmount': 'loanTerms.originalAmount',
      'InterestRate': 'loanTerms.interestRate',
      'RateType': 'loanTerms.rateType',
      'AmortTermMonths': 'loanTerms.amortTermMonths',
      'FirstPaymentDate': 'loanTerms.firstPaymentDate',
      'MaturityDate': 'loanTerms.maturityDate',
      'PnIAmount': 'loanTerms.pnIAmount',
      'EscrowRequired': 'escrow.required',
      'TaxEscrowMonthly': 'escrow.tax.monthlyAmount',
      'InsuranceEscrowMonthly': 'escrow.insurance.monthlyAmount',
      'AppraisedValue': 'collateral.appraisedValue',
      'AppraisalDate': 'collateral.appraisalDate',
      'LTV': 'loanTerms.ltv',
      'CLTV': 'loanTerms.cltv'
    };
    
    return mapping[csvField] || csvField;
  }

  /**
   * Map JSON structure to canonical mappings
   */
  private mapJSONToCanonical(
    loan: any, 
    pointer: string, 
    mappings: ValidationResult['mappings']
  ): void {
    const addMapping = (key: string, value: any, path: string) => {
      if (value !== undefined && value !== null && value !== '') {
        mappings.push({
          canonicalKey: key,
          sourcePointer: `${pointer}.${path}`,
          rawValue: value,
          normalizedValue: String(value),
          confidence: 1.0,
          evidenceHash: crypto.createHash('sha256')
            .update(`${key}:${value}:${path}`)
            .digest('hex'),
          autofilledFrom: "payload"
        });
      }
    };

    // Map basic loan fields
    addMapping('loanNumber', loan.loanNumber, 'loanNumber');
    addMapping('investorLoanId', loan.investorLoanId, 'investorLoanId');

    // Map borrower information
    if (loan.borrowers && loan.borrowers[0]) {
      const borrower = loan.borrowers[0];
      addMapping('borrower.firstName', borrower.firstName, 'borrowers[0].firstName');
      addMapping('borrower.lastName', borrower.lastName, 'borrowers[0].lastName');
      addMapping('borrower.email', borrower.email, 'borrowers[0].email');
    }

    // Map collateral information
    if (loan.collateral) {
      if (loan.collateral.address) {
        addMapping('collateral.address.street', loan.collateral.address.street, 'collateral.address.street');
        addMapping('collateral.address.city', loan.collateral.address.city, 'collateral.address.city');
        addMapping('collateral.address.state', loan.collateral.address.state, 'collateral.address.state');
        addMapping('collateral.address.zip', loan.collateral.address.zip, 'collateral.address.zip');
      }
      addMapping('collateral.appraisedValue', loan.collateral.appraisedValue, 'collateral.appraisedValue');
    }

    // Map loan terms
    if (loan.loanTerms) {
      addMapping('loanTerms.originalAmount', loan.loanTerms.originalAmount, 'loanTerms.originalAmount');
      addMapping('loanTerms.interestRate', loan.loanTerms.interestRate, 'loanTerms.interestRate');
      addMapping('loanTerms.rateType', loan.loanTerms.rateType, 'loanTerms.rateType');
      addMapping('loanTerms.amortTermMonths', loan.loanTerms.amortTermMonths, 'loanTerms.amortTermMonths');
      addMapping('loanTerms.firstPaymentDate', loan.loanTerms.firstPaymentDate, 'loanTerms.firstPaymentDate');
      addMapping('loanTerms.maturityDate', loan.loanTerms.maturityDate, 'loanTerms.maturityDate');
    }
  }

  /**
   * Map MISMO XML structure to canonical mappings
   */
  private mapMISMOToCanonical(
    deal: any,
    pointer: string,
    mappings: ValidationResult['mappings'],
    errors: ValidationResult['errors']
  ): void {
    try {
      // Extract loan information from MISMO structure
      if (deal.LOANS && deal.LOANS.LOAN) {
        const loans = Array.isArray(deal.LOANS.LOAN) ? deal.LOANS.LOAN : [deal.LOANS.LOAN];
        
        for (let i = 0; i < loans.length; i++) {
          const loan = loans[i];
          const loanPointer = `${pointer}.LOANS.LOAN[${i}]`;

          // Map loan identifiers
          if (loan.$ && loan.$.LoanIdentifier) {
            mappings.push({
              canonicalKey: 'loanNumber',
              sourcePointer: `${loanPointer}@LoanIdentifier`,
              rawValue: loan.$.LoanIdentifier,
              normalizedValue: loan.$.LoanIdentifier,
              confidence: 1.0,
              evidenceHash: crypto.createHash('sha256')
                .update(`loanNumber:${loan.$.LoanIdentifier}`)
                .digest('hex'),
              autofilledFrom: "document"
            });
          }

          // Map loan terms
          if (loan.LOAN_DETAIL) {
            const detail = loan.LOAN_DETAIL;
            
            if (detail.NoteRatePercent) {
              mappings.push({
                canonicalKey: 'loanTerms.interestRate',
                sourcePointer: `${loanPointer}.LOAN_DETAIL.NoteRatePercent`,
                rawValue: detail.NoteRatePercent,
                normalizedValue: String(detail.NoteRatePercent),
                confidence: 1.0,
                evidenceHash: crypto.createHash('sha256')
                  .update(`interestRate:${detail.NoteRatePercent}`)
                  .digest('hex'),
                autofilledFrom: "document"
              });
            }

            if (detail.LoanAmountRequested) {
              mappings.push({
                canonicalKey: 'loanTerms.originalAmount',
                sourcePointer: `${loanPointer}.LOAN_DETAIL.LoanAmountRequested`,
                rawValue: detail.LoanAmountRequested,
                normalizedValue: String(detail.LoanAmountRequested),
                confidence: 1.0,
                evidenceHash: crypto.createHash('sha256')
                  .update(`originalAmount:${detail.LoanAmountRequested}`)
                  .digest('hex'),
                autofilledFrom: "document"
              });
            }
          }
        }
      }

      // Extract parties (borrowers)
      if (deal.PARTIES && deal.PARTIES.PARTY) {
        const parties = Array.isArray(deal.PARTIES.PARTY) ? deal.PARTIES.PARTY : [deal.PARTIES.PARTY];
        
        for (let i = 0; i < parties.length; i++) {
          const party = parties[i];
          
          if (party.INDIVIDUAL && party.ROLES && party.ROLES.ROLE) {
            const roles = Array.isArray(party.ROLES.ROLE) ? party.ROLES.ROLE : [party.ROLES.ROLE];
            const isBorrower = roles.some(role => role.$.RoleType === 'Borrower');
            
            if (isBorrower && party.INDIVIDUAL.NAME) {
              const name = party.INDIVIDUAL.NAME;
              const partyPointer = `${pointer}.PARTIES.PARTY[${i}]`;
              
              if (name.FirstName) {
                mappings.push({
                  canonicalKey: 'borrower.firstName',
                  sourcePointer: `${partyPointer}.INDIVIDUAL.NAME.FirstName`,
                  rawValue: name.FirstName,
                  normalizedValue: String(name.FirstName),
                  confidence: 1.0,
                  evidenceHash: crypto.createHash('sha256')
                    .update(`firstName:${name.FirstName}`)
                    .digest('hex'),
                  autofilledFrom: "document"
                });
              }

              if (name.LastName) {
                mappings.push({
                  canonicalKey: 'borrower.lastName',
                  sourcePointer: `${partyPointer}.INDIVIDUAL.NAME.LastName`,
                  rawValue: name.LastName,
                  normalizedValue: String(name.LastName),
                  confidence: 1.0,
                  evidenceHash: crypto.createHash('sha256')
                    .update(`lastName:${name.LastName}`)
                    .digest('hex'),
                  autofilledFrom: "document"
                });
              }
            }
          }
        }
      }

    } catch (error) {
      errors.push({
        code: "MISMO_MAPPING_ERROR",
        severity: "warning",
        pointer,
        message: `Failed to map MISMO data: ${error.message}`
      });
    }
  }
}