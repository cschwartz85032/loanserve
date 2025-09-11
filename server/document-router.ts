/**
 * Document Router
 * Routes documents to appropriate parsers based on file type
 */

import fs from "fs/promises";
import { DocumentAnalysisService, DocumentAnalysisResult } from "./openai";
import { parseFNMFile, type FNMParseResult } from "../src/parsers/fnm-parser";
import { MISMOParser } from "../src/parsers/mismo-parser";

export interface DocumentRouterResult extends DocumentAnalysisResult {
  parserUsed: 'grok' | 'fnm' | 'mismo' | 'unknown';
}

export class DocumentRouter {
  private grokService: DocumentAnalysisService;
  private mismoParser: MISMOParser;

  constructor() {
    this.grokService = new DocumentAnalysisService();
    this.mismoParser = new MISMOParser();
  }

  /**
   * Analyze a document by routing it to the appropriate parser
   */
  async analyzeDocument(
    filePath: string,
    fileName: string
  ): Promise<DocumentRouterResult> {
    console.log(`[Document Router] Analyzing file: ${fileName}`);
    
    try {
      // Read the file
      const fileBuffer = await fs.readFile(filePath);
      
      // Detect file type based on extension and content
      const fileType = this.detectFileType(fileName, fileBuffer);
      console.log(`[Document Router] Detected file type: ${fileType}`);
      
      // Route to appropriate parser
      switch (fileType) {
        case 'fnm':
          return await this.parseFNMFile(fileBuffer, fileName);
          
        case 'mismo':
          return await this.parseMISMOFile(fileBuffer, fileName);
          
        case 'pdf':
        case 'image':
          return await this.analyzeWithGrok(fileBuffer, fileName);
          
        default:
          console.error(`[Document Router] Unsupported file type: ${fileName}`);
          return {
            documentType: 'unknown',
            extractedData: {},
            confidence: 0,
            parserUsed: 'unknown'
          };
      }
    } catch (error) {
      console.error('[Document Router] Error analyzing document:', error);
      return {
        documentType: 'unknown',
        extractedData: {},
        confidence: 0,
        parserUsed: 'unknown'
      };
    }
  }

  /**
   * Detect file type from extension and content
   */
  private detectFileType(fileName: string, fileBuffer: Buffer): string {
    const lowerFileName = fileName.toLowerCase();
    
    // Check FNM extensions
    if (lowerFileName.endsWith('.fnm') || lowerFileName.endsWith('.fnma')) {
      return 'fnm';
    }
    
    // Check XML (MISMO)
    if (lowerFileName.endsWith('.xml')) {
      return 'mismo';
    }
    
    // Check if content starts with XML declaration (for MISMO without .xml extension)
    const fileStart = fileBuffer.toString('utf8', 0, Math.min(100, fileBuffer.length));
    if (fileStart.trim().startsWith('<?xml')) {
      return 'mismo';
    }
    
    // Check PDF
    if (lowerFileName.endsWith('.pdf')) {
      return 'pdf';
    }
    
    // Check images
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
    if (imageExtensions.some(ext => lowerFileName.endsWith(ext))) {
      return 'image';
    }
    
    return 'unknown';
  }

  /**
   * Parse FNM file
   */
  private async parseFNMFile(
    fileBuffer: Buffer, 
    fileName: string
  ): Promise<DocumentRouterResult> {
    console.log(`[Document Router] Parsing FNM file: ${fileName}`);
    
    try {
      const fnmContent = fileBuffer.toString('utf8');
      const parseResult = parseFNMFile(fnmContent);
      
      // Convert FNM parse result to DocumentAnalysisResult format
      const result: DocumentRouterResult = {
        documentType: 'fnm_loan_file',
        extractedData: {
          // Map loan data
          loanAmount: parseResult.loan?.originalBalance,
          interestRate: parseResult.loan?.originalInterestRate,
          loanTerm: parseResult.loan?.originalTerm,
          loanType: parseResult.loan?.loanType,
          closingDate: parseResult.loan?.loanDate,
          firstPaymentDate: parseResult.loan?.firstPaymentDate,
          
          // Map primary borrower data
          borrowerName: parseResult.borrowers?.[0] ? 
            `${parseResult.borrowers[0].firstName} ${parseResult.borrowers[0].lastName}`.trim() : undefined,
          borrowerSSN: parseResult.borrowers?.[0]?.ssn,
          borrowerStreetAddress: parseResult.borrowers?.[0]?.streetAddress,
          borrowerCity: parseResult.borrowers?.[0]?.city,
          borrowerState: parseResult.borrowers?.[0]?.state,
          borrowerZipCode: parseResult.borrowers?.[0]?.zip,
          
          // Map property data
          propertyStreetAddress: parseResult.property?.streetAddress,
          propertyCity: parseResult.property?.city,
          propertyState: parseResult.property?.state,
          propertyZipCode: parseResult.property?.zip,
          propertyType: parseResult.property?.propertyType,
          propertyValue: parseResult.property?.appraisedValue || parseResult.property?.purchasePrice,
          
          // Map employment data
          borrowerIncome: parseResult.employment?.[0]?.monthlyIncome ? 
            parseResult.employment[0].monthlyIncome * 12 : undefined,
        },
        confidence: 1.0, // FNM parser is deterministic
        parserUsed: 'fnm'
      };
      
      console.log(`[Document Router] Successfully parsed FNM file: ${fileName}`);
      return result;
      
    } catch (error) {
      console.error(`[Document Router] Failed to parse FNM file:`, error);
      return {
        documentType: 'unknown',
        extractedData: {},
        confidence: 0,
        parserUsed: 'fnm'
      };
    }
  }

  /**
   * Parse MISMO XML file
   */
  private async parseMISMOFile(
    fileBuffer: Buffer,
    fileName: string
  ): Promise<DocumentRouterResult> {
    console.log(`[Document Router] Parsing MISMO XML file: ${fileName}`);
    
    try {
      const xmlContent = fileBuffer.toString('utf8');
      const parseResult = this.mismoParser.parse(xmlContent);
      
      // Convert MISMO parse result to DocumentAnalysisResult format
      const result: DocumentRouterResult = {
        documentType: 'mismo_loan_file',
        extractedData: {
          // Map loan data
          loanAmount: parseResult.loan?.amount,
          interestRate: parseResult.loan?.interestRate,
          loanTerm: parseResult.loan?.termMonths,
          loanType: parseResult.loan?.type,
          
          // Map borrower data
          borrowerName: parseResult.borrower?.fullName,
          borrowerSSN: parseResult.borrower?.ssn,
          borrowerStreetAddress: parseResult.borrower?.address?.street,
          borrowerCity: parseResult.borrower?.address?.city,
          borrowerState: parseResult.borrower?.address?.state,
          borrowerZipCode: parseResult.borrower?.address?.zip,
          borrowerIncome: parseResult.borrower?.monthlyIncome ? 
            parseResult.borrower.monthlyIncome * 12 : undefined,
          
          // Map property data
          propertyStreetAddress: parseResult.property?.address?.street,
          propertyCity: parseResult.property?.address?.city,
          propertyState: parseResult.property?.address?.state,
          propertyZipCode: parseResult.property?.address?.zip,
          propertyType: parseResult.property?.type,
          propertyValue: parseResult.property?.value,
        },
        confidence: 1.0, // MISMO parser is deterministic
        parserUsed: 'mismo'
      };
      
      console.log(`[Document Router] Successfully parsed MISMO file: ${fileName}`);
      return result;
      
    } catch (error) {
      console.error(`[Document Router] Failed to parse MISMO file:`, error);
      return {
        documentType: 'unknown',
        extractedData: {},
        confidence: 0,
        parserUsed: 'mismo'
      };
    }
  }

  /**
   * Analyze PDF or image with Grok AI
   */
  private async analyzeWithGrok(
    fileBuffer: Buffer,
    fileName: string
  ): Promise<DocumentRouterResult> {
    console.log(`[Document Router] Analyzing with Grok AI: ${fileName}`);
    
    try {
      const result = await this.grokService.analyzeDocumentWithGrok(fileName, fileBuffer);
      
      return {
        ...result,
        parserUsed: 'grok'
      };
    } catch (error) {
      console.error(`[Document Router] Grok AI analysis failed:`, error);
      return {
        documentType: 'unknown',
        extractedData: {},
        confidence: 0,
        parserUsed: 'grok'
      };
    }
  }
}

// Export a singleton instance for convenience
export const documentRouter = new DocumentRouter();

// Export the main analyze function for backward compatibility
export async function analyzeDocument(
  filePath: string,
  fileName: string
): Promise<DocumentAnalysisResult> {
  const result = await documentRouter.analyzeDocument(filePath, fileName);
  // Remove the parserUsed field for backward compatibility
  const { parserUsed, ...documentResult } = result;
  return documentResult;
}