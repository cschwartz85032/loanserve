import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { ValidationResult } from './validation-service';
import { DocumentAnalysisService } from '../../openai';

export class PDFValidationService {
  private documentAnalysisService: DocumentAnalysisService;

  constructor() {
    this.documentAnalysisService = new DocumentAnalysisService();
  }

  /**
   * Validate and process a PDF file using the existing DocumentAnalysisService with OCR
   */
  async validatePDF(filePath: string): Promise<ValidationResult> {
    try {
      // Check if file exists and is readable
      await fs.access(filePath, fs.constants.R_OK);
      
      // Read the PDF file
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      
      // Use existing DocumentAnalysisService for comprehensive PDF processing with OCR
      const analysisResult = await this.documentAnalysisService.analyzeDocumentWithGrok(
        fileName,
        fileBuffer
      );
      
      const errors: ValidationResult['errors'] = [];
      
      // Validate analysis results
      if (!analysisResult.extractedData || Object.keys(analysisResult.extractedData).length === 0) {
        errors.push({
          code: "PDF_NO_DATA_EXTRACTED",
          severity: "warning",
          message: "No structured data could be extracted from PDF - may require manual review"
        });
      }
      
      if (analysisResult.confidence < 0.3) {
        errors.push({
          code: "PDF_LOW_CONFIDENCE",
          severity: "warning", 
          message: `Document analysis confidence is low (${(analysisResult.confidence * 100).toFixed(1)}%) - extracted data may be inaccurate`
        });
      }
      
      // Generate canonical mappings from the analysis results
      const mappings = this.generateMappingsFromAnalysis(analysisResult, filePath);
      
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
   * Generate canonical mappings from DocumentAnalysisService results
   */
  private generateMappingsFromAnalysis(
    analysisResult: any,
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
    for (const [key, value] of Object.entries(analysisResult.extractedData || {})) {
      if (value !== undefined && value !== null && value !== '') {
        const canonicalKey = this.mapToCanonicalKey(key, analysisResult.documentType);
        if (canonicalKey) {
          mappings.push({
            canonicalKey,
            sourcePointer: `pdf:${documentTypeName}.${key}`,
            rawValue: value,
            normalizedValue: String(value),
            confidence: Math.max(0.5, analysisResult.confidence || 0.5),
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
   * Map extracted field to canonical key based on document type
   */
  private mapToCanonicalKey(field: string, documentType: string): string | null {
    const fieldLower = field.toLowerCase();
    
    // Standard loan data mappings
    const standardMappings: Record<string, string> = {
      'loan_amount': 'loanTerms.originalAmount',
      'loanamount': 'loanTerms.originalAmount',
      'principal_amount': 'loanTerms.originalAmount',
      'note_amount': 'loanTerms.originalAmount',
      'original_loan_amount': 'loanTerms.originalAmount',
      
      'interest_rate': 'loanTerms.interestRate',
      'note_rate': 'loanTerms.interestRate',
      'annual_percentage_rate': 'loanTerms.apr',
      
      'loan_term': 'loanTerms.termMonths',
      'term_in_months': 'loanTerms.termMonths',
      'maturity_months': 'loanTerms.termMonths',
      
      'property_address': 'collateral.address.street',
      'subject_property_address': 'collateral.address.street',
      'property_street': 'collateral.address.street',
      'property_city': 'collateral.address.city',
      'property_state': 'collateral.address.state',
      'property_zip': 'collateral.address.zip',
      
      'borrower_name': 'borrower.fullName',
      'borrower_first_name': 'borrower.firstName',
      'borrower_last_name': 'borrower.lastName',
      'co_borrower_name': 'coBorrower.fullName',
      
      'purchase_price': 'collateral.purchasePrice',
      'sales_price': 'collateral.purchasePrice',
      'appraised_value': 'collateral.appraisedValue',
      'market_value': 'collateral.appraisedValue',
      
      'down_payment': 'loanTerms.downPayment',
      'cash_down': 'loanTerms.downPayment',
      
      'monthly_payment': 'loanTerms.monthlyPayment',
      'principal_and_interest': 'loanTerms.monthlyPayment',
      
      'fico_score': 'borrower.creditScore',
      'credit_score': 'borrower.creditScore',
      'beacon_score': 'borrower.creditScore',
      
      'annual_income': 'borrower.income.annual',
      'gross_annual_income': 'borrower.income.annual',
      'monthly_income': 'borrower.income.monthly',
      
      'employer_name': 'borrower.employment.employer',
      'occupation': 'borrower.employment.occupation',
      'years_employed': 'borrower.employment.yearsEmployed',
      
      'loan_type': 'loanTerms.type',
      'program_type': 'loanTerms.program',
      'product_type': 'loanTerms.product'
    };
    
    return standardMappings[fieldLower] || null;
  }
}