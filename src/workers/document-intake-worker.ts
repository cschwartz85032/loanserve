/**
 * Document Intake Worker - Escrow-led intake supporting MISMO/CSV/JSON/PDF
 * Implements investor-first, escrow-led principles with document processing
 */

import { SelfHealingWorker, WorkItem, WorkResult } from './self-healing-worker';
import { LineageTracker } from '../utils/lineage-tracker';
import { AuthorityMatrix, DataSource, FieldValue } from '../authority/authority-matrix';
import { AIPipelineService } from '../database/ai-pipeline-service';
import { DatabaseIntegratedWorkerMixin } from './database-integrated-worker';
import { createHash } from 'crypto';
import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export interface DocumentIntakePayload {
  documentId: string;
  filePath: string;
  fileType: 'mismo' | 'csv' | 'json' | 'pdf';
  loanUrn: string;
  escrowInstructions?: EscrowInstruction[];
  investorDirectives?: InvestorDirective[];
  tenantId?: string;
  correlationId?: string;
}

export interface EscrowInstruction {
  type: 'payment_schedule' | 'disbursement_rule' | 'reserve_requirement' | 'approval_threshold';
  priority: number;
  rule: string;
  value: any;
  effectiveDate: Date;
  expirationDate?: Date;
}

export interface InvestorDirective {
  investorId: string;
  type: 'rate_adjustment' | 'fee_structure' | 'reporting_requirement' | 'servicing_standard';
  priority: number;
  requirement: string;
  value: any;
  compliance: 'mandatory' | 'preferred' | 'optional';
}

export interface ExtractedLoanData {
  [fieldName: string]: FieldValue;
}

export interface DocumentIntakeResult {
  documentId: string;
  extractedData: ExtractedLoanData;
  documentClassification: {
    type: string;
    confidence: number;
  };
  processingStats: {
    fieldsExtracted: number;
    fieldsWithConflicts: number;
    averageConfidence: number;
    processingTimeMs: number;
  };
  lineageIds: string[];
  validationResults: ValidationResult[];
}

export interface ValidationResult {
  fieldName: string;
  isValid: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestedCorrection?: any;
}

export class DocumentIntakeWorker extends SelfHealingWorker<DocumentIntakePayload, DocumentIntakeResult> {
  private lineageTracker: LineageTracker;
  private dbService: AIPipelineService;
  private dbMixin: DatabaseIntegratedWorkerMixin;
  private textractClient: TextractClient;
  private ajv: Ajv;

  constructor() {
    super({
      name: 'document-intake-worker',
      maxRetries: 3,
      retryDelayMs: 2000,
      retryBackoffMultiplier: 2,
      maxRetryDelayMs: 30000,
      timeoutMs: 180000, // 3 minutes for complex documents
      dlqEnabled: true,
      idempotencyEnabled: true
    });

    this.lineageTracker = new LineageTracker();
    this.dbService = new AIPipelineService();
    this.dbMixin = new DatabaseIntegratedWorkerMixin();
    
    this.textractClient = new TextractClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    this.ajv = new Ajv();
    addFormats(this.ajv);
  }

  async executeWork(
    payload: DocumentIntakePayload,
    workItem: WorkItem<DocumentIntakePayload>,
    executionId: string
  ): Promise<WorkResult<DocumentIntakeResult>> {
    const startTime = Date.now();

    try {
      // Set tenant context for RLS
      if (payload.tenantId) {
        await this.dbService.setTenantContext(payload.tenantId);
      }

      // 1. Create or get loan candidate
      let loanCandidate;
      try {
        loanCandidate = await this.dbService.createLoanCandidate({
          tenantId: payload.tenantId || '00000000-0000-0000-0000-000000000001',
          loanUrn: payload.loanUrn
        });
      } catch (error) {
        // Loan candidate might already exist, try to get it
        const existingCandidate = await this.dbService.getLoanCandidate(payload.documentId);
        if (existingCandidate) {
          loanCandidate = existingCandidate;
        } else {
          throw error;
        }
      }

      // 2. Create document record
      const documentRecord = await this.dbService.createDocument({
        loanId: loanCandidate.id,
        storageUri: payload.filePath,
        sha256: createHash('sha256').update(readFileSync(payload.filePath)).digest('hex'),
        docType: payload.fileType
      });

      // 3. Classify and validate document
      const documentType = await this.classifyDocument(payload);
      
      // 4. Extract data based on document type
      let rawExtractedData: Record<string, any>;
      switch (payload.fileType) {
        case 'pdf':
          rawExtractedData = await this.extractFromPDF(payload);
          break;
        case 'csv':
          rawExtractedData = await this.extractFromCSV(payload);
          break;
        case 'json':
          rawExtractedData = await this.extractFromJSON(payload);
          break;
        case 'mismo':
          rawExtractedData = await this.extractFromMISMO(payload);
          break;
        default:
          throw new Error(`Unsupported file type: ${payload.fileType}`);
      }

      // 5. Apply escrow-led and investor-first processing
      const processedData = await this.applyEscrowInvestorRules(
        rawExtractedData,
        payload.escrowInstructions || [],
        payload.investorDirectives || []
      );

      // 6. Store datapoints in database
      await this.dbMixin.storeDatapoints(
        loanCandidate.id,
        processedData,
        documentRecord.id
      );

      // 7. Create lineage records for all extracted values
      const lineageIds = await this.createLineageRecords(
        processedData,
        payload,
        documentType
      );

      // 8. Resolve conflicts using Authority Matrix
      const finalData = await this.resolveDataConflicts(processedData, payload.tenantId);

      // 9. Validate extracted data
      const validationResults = await this.validateExtractedData(finalData);

      // 10. Update loan candidate status
      await this.dbService.updateLoanCandidateStatus(
        loanCandidate.id,
        validationResults.some(v => !v.isValid && v.severity === 'error') ? 'conflicts' : 'validated'
      );

      // 11. Calculate processing statistics
      const processingStats = this.calculateProcessingStats(
        finalData,
        validationResults,
        startTime
      );

      const result: DocumentIntakeResult = {
        documentId: payload.documentId,
        extractedData: finalData,
        documentClassification: documentType,
        processingStats,
        lineageIds,
        validationResults
      };

      return {
        success: true,
        result,
        shouldRetry: false
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        shouldRetry: this.isRetryableError(error)
      };
    }
  }

  /**
   * Classify document type and confidence
   */
  private async classifyDocument(payload: DocumentIntakePayload): Promise<{
    type: string;
    confidence: number;
  }> {
    // Implementation depends on file type
    switch (payload.fileType) {
      case 'csv':
        return { type: 'loan_data_export', confidence: 0.9 };
      case 'json':
        return { type: 'api_data_dump', confidence: 0.95 };
      case 'mismo':
        return { type: 'mismo_standard', confidence: 1.0 };
      case 'pdf':
        // For PDF, we'd use AI to classify
        return await this.classifyPDFDocument(payload);
      default:
        return { type: 'unknown', confidence: 0.0 };
    }
  }

  /**
   * Extract data from PDF using Textract and AI
   */
  private async extractFromPDF(payload: DocumentIntakePayload): Promise<Record<string, any>> {
    const fileBuffer = readFileSync(payload.filePath);
    
    // Use AWS Textract for OCR
    const textractCommand = new AnalyzeDocumentCommand({
      Document: { Bytes: fileBuffer },
      FeatureTypes: ['FORMS', 'TABLES']
    });

    const textractResponse = await this.textractClient.send(textractCommand);
    
    // Extract key-value pairs from Textract response
    const extractedData: Record<string, any> = {};
    
    if (textractResponse.Blocks) {
      for (const block of textractResponse.Blocks) {
        if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
          // Find the corresponding value block
          const keyText = this.extractTextFromBlock(block, textractResponse.Blocks);
          const valueBlock = this.findValueBlock(block, textractResponse.Blocks);
          
          if (keyText && valueBlock) {
            const valueText = this.extractTextFromBlock(valueBlock, textractResponse.Blocks);
            const fieldName = this.normalizeFieldName(keyText);
            extractedData[fieldName] = valueText;
          }
        }
      }
    }

    return extractedData;
  }

  /**
   * Extract data from CSV file
   */
  private async extractFromCSV(payload: DocumentIntakePayload): Promise<Record<string, any>> {
    const fileContent = readFileSync(payload.filePath, 'utf-8');
    const workbook = XLSX.read(fileContent, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // For CSV, we expect one row of data or we take the first row
    const firstRow = jsonData[0] as Record<string, any>;
    
    // Normalize field names
    const normalizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(firstRow)) {
      const fieldName = this.normalizeFieldName(key);
      normalizedData[fieldName] = value;
    }

    return normalizedData;
  }

  /**
   * Extract data from JSON file
   */
  private async extractFromJSON(payload: DocumentIntakePayload): Promise<Record<string, any>> {
    const fileContent = readFileSync(payload.filePath, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    
    // Handle various JSON structures
    let extractedData: Record<string, any>;
    
    if (Array.isArray(jsonData)) {
      // Take first object if it's an array
      extractedData = jsonData[0] || {};
    } else if (typeof jsonData === 'object') {
      extractedData = jsonData;
    } else {
      throw new Error('Invalid JSON structure for loan data');
    }

    // Normalize field names
    const normalizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(extractedData)) {
      const fieldName = this.normalizeFieldName(key);
      normalizedData[fieldName] = value;
    }

    return normalizedData;
  }

  /**
   * Extract data from MISMO file
   */
  private async extractFromMISMO(payload: DocumentIntakePayload): Promise<Record<string, any>> {
    const fileContent = readFileSync(payload.filePath, 'utf-8');
    
    // MISMO is XML-based, parse accordingly
    // This is a simplified implementation - real MISMO parsing is more complex
    const extractedData: Record<string, any> = {};
    
    // Parse XML and extract loan fields according to MISMO 3.4 standard
    // This would require a proper XML parser like xml2js in a real implementation
    
    // For now, return basic structure
    extractedData['loan_amount'] = this.extractMISMOField(fileContent, 'BaseLoanAmount');
    extractedData['interest_rate'] = this.extractMISMOField(fileContent, 'NoteRatePercent');
    extractedData['borrower_name'] = this.extractMISMOField(fileContent, 'IndividualFullName');
    extractedData['property_address'] = this.extractMISMOField(fileContent, 'AddressLineText');

    return extractedData;
  }

  /**
   * Apply escrow instructions and investor directives (investor-first principle)
   */
  private async applyEscrowInvestorRules(
    rawData: Record<string, any>,
    escrowInstructions: EscrowInstruction[],
    investorDirectives: InvestorDirective[]
  ): Promise<ExtractedLoanData> {
    const processedData: ExtractedLoanData = {};

    // Convert raw data to FieldValue format
    for (const [fieldName, value] of Object.entries(rawData)) {
      const dataSource: DataSource = {
        type: 'document_parse',
        confidence: 0.8, // Default confidence for parsed data
        timestamp: new Date(),
        priority: 600
      };

      processedData[fieldName] = {
        value,
        source: dataSource,
        fieldName,
        lineage: {
          textHash: createHash('sha256').update(String(value)).digest('hex'),
          timestamp: new Date()
        }
      };
    }

    // Apply investor directives (highest priority)
    for (const directive of investorDirectives.sort((a, b) => b.priority - a.priority)) {
      if (directive.compliance === 'mandatory') {
        const fieldName = this.extractFieldNameFromDirective(directive);
        if (fieldName) {
          const investorSource: DataSource = {
            type: 'investor_directive',
            confidence: 1.0,
            timestamp: new Date(),
            priority: 1000
          };

          processedData[fieldName] = {
            value: directive.value,
            source: investorSource,
            fieldName,
            lineage: {
              textHash: createHash('sha256').update(String(directive.value)).digest('hex'),
              timestamp: new Date()
            }
          };
        }
      }
    }

    // Apply escrow instructions (second highest priority)
    for (const instruction of escrowInstructions.sort((a, b) => b.priority - a.priority)) {
      const fieldName = this.extractFieldNameFromInstruction(instruction);
      if (fieldName) {
        const escrowSource: DataSource = {
          type: 'escrow_instruction',
          confidence: 0.95,
          timestamp: new Date(),
          priority: 900
        };

        // Only override if not already set by investor directive
        if (!processedData[fieldName] || processedData[fieldName].source.type !== 'investor_directive') {
          processedData[fieldName] = {
            value: instruction.value,
            source: escrowSource,
            fieldName,
            lineage: {
              textHash: createHash('sha256').update(String(instruction.value)).digest('hex'),
              timestamp: new Date()
            }
          };
        }
      }
    }

    return processedData;
  }

  /**
   * Create lineage records for all extracted values
   */
  private async createLineageRecords(
    data: ExtractedLoanData,
    payload: DocumentIntakePayload,
    documentType: { type: string; confidence: number }
  ): Promise<string[]> {
    const lineageIds: string[] = [];

    for (const [fieldName, fieldValue] of Object.entries(data)) {
      const lineageId = await this.lineageTracker.createLineage({
        fieldName,
        value: fieldValue.value,
        source: fieldValue.source.type as 'ai_extraction',
        confidence: fieldValue.source.confidence,
        extractorVersion: process.env.EXTRACTOR_VERSION || 'v2025.09.01',
        documentReference: {
          documentId: payload.documentId,
          sourceText: String(fieldValue.value),
          textHash: fieldValue.lineage.textHash
        }
      });

      lineageIds.push(lineageId);
    }

    return lineageIds;
  }

  /**
   * Resolve data conflicts using Authority Matrix
   */
  private async resolveDataConflicts(
    data: ExtractedLoanData,
    tenantId?: string
  ): Promise<ExtractedLoanData> {
    const resolvedData: ExtractedLoanData = {};

    // Group values by field name to find conflicts
    const fieldGroups: Record<string, FieldValue[]> = {};
    for (const fieldValue of Object.values(data)) {
      if (!fieldGroups[fieldValue.fieldName]) {
        fieldGroups[fieldValue.fieldName] = [];
      }
      fieldGroups[fieldValue.fieldName].push(fieldValue);
    }

    // Resolve conflicts for each field
    for (const [fieldName, values] of Object.entries(fieldGroups)) {
      const resolution = AuthorityMatrix.resolveConflict(fieldName, values, tenantId);
      
      // Find winning value based on highest priority
      const winnerValue = values.reduce((highest, current) => 
        current.source.priority > highest.source.priority ? current : highest
      );

      if (winnerValue) {
        resolvedData[fieldName] = winnerValue;
      }
    }

    return resolvedData;
  }

  /**
   * Validate extracted data using business rules
   */
  private async validateExtractedData(data: ExtractedLoanData): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const [fieldName, fieldValue] of Object.entries(data)) {
      const validation = AuthorityMatrix.validateFieldValue(fieldName, fieldValue.value);
      
      if (!validation.isValid) {
        results.push({
          fieldName,
          isValid: false,
          severity: 'error',
          message: validation.reason || 'Validation failed',
          suggestedCorrection: validation.suggestedCorrection
        });
      }

      // Check confidence thresholds
      const acceptThreshold = parseFloat(process.env.CONF_ACCEPT || '0.80');
      const hitlThreshold = parseFloat(process.env.CONF_HITL || '0.60');

      if (fieldValue.source.confidence < hitlThreshold) {
        results.push({
          fieldName,
          isValid: false,
          severity: 'error',
          message: `Confidence ${fieldValue.source.confidence} below HITL threshold ${hitlThreshold}`
        });
      } else if (fieldValue.source.confidence < acceptThreshold) {
        results.push({
          fieldName,
          isValid: true,
          severity: 'warning',
          message: `Confidence ${fieldValue.source.confidence} below auto-accept threshold ${acceptThreshold}`
        });
      }
    }

    return results;
  }

  /**
   * Helper methods for document processing
   */
  private normalizeFieldName(rawName: string): string {
    return rawName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  }

  private extractMISMOField(content: string, fieldName: string): string | null {
    const regex = new RegExp(`<${fieldName}[^>]*>([^<]*)</${fieldName}>`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  private extractFieldNameFromDirective(directive: InvestorDirective): string | null {
    // Map directive types to field names
    const typeMap: Record<string, string> = {
      'rate_adjustment': 'interest_rate',
      'fee_structure': 'servicing_fee',
      'reporting_requirement': 'reporting_frequency',
      'servicing_standard': 'service_level'
    };

    return typeMap[directive.type] || null;
  }

  private extractFieldNameFromInstruction(instruction: EscrowInstruction): string | null {
    // Map instruction types to field names
    const typeMap: Record<string, string> = {
      'payment_schedule': 'payment_frequency',
      'disbursement_rule': 'escrow_disbursement',
      'reserve_requirement': 'escrow_reserve',
      'approval_threshold': 'approval_limit'
    };

    return typeMap[instruction.type] || null;
  }

  private async classifyPDFDocument(payload: DocumentIntakePayload): Promise<{
    type: string;
    confidence: number;
  }> {
    // In a real implementation, this would use AI to classify the document
    // For now, return a default classification
    return {
      type: 'loan_application',
      confidence: 0.75
    };
  }

  private extractTextFromBlock(block: any, allBlocks: any[]): string | null {
    // Extract text from Textract block
    if (block.Text) {
      return block.Text;
    }
    return null;
  }

  private findValueBlock(keyBlock: any, allBlocks: any[]): any | null {
    // Find the value block corresponding to a key block in Textract response
    if (keyBlock.Relationships) {
      for (const relationship of keyBlock.Relationships) {
        if (relationship.Type === 'VALUE') {
          const valueId = relationship.Ids?.[0];
          return allBlocks.find(block => block.Id === valueId);
        }
      }
    }
    return null;
  }

  private calculateProcessingStats(
    data: ExtractedLoanData,
    validationResults: ValidationResult[],
    startTime: number
  ): any {
    const fieldsExtracted = Object.keys(data).length;
    const fieldsWithConflicts = Object.values(data).filter(
      field => field.authorityDecision?.conflictingSources.length > 0
    ).length;
    
    const confidences = Object.values(data).map(field => field.source.confidence);
    const averageConfidence = confidences.length > 0 
      ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length 
      : 0;

    return {
      fieldsExtracted,
      fieldsWithConflicts,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      processingTimeMs: Date.now() - startTime
    };
  }
}