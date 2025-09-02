/**
 * Database Integrated Worker Extensions
 * Additional methods for document intake worker to integrate with database
 */

import { AIPipelineService } from '../database/ai-pipeline-service';
import { FieldValidators } from '../utils/validation/field-validators';
import { createHash } from 'crypto';

/**
 * Mixin methods for database integration
 */
export class DatabaseIntegratedWorkerMixin {
  protected dbService: AIPipelineService;
  protected fieldValidators: FieldValidators;

  constructor() {
    this.dbService = new AIPipelineService();
    this.fieldValidators = new FieldValidators();
  }

  /**
   * Store datapoints in database with authority priority
   */
  async storeDatapoints(
    loanId: string,
    processedData: any,
    documentId: string
  ): Promise<void> {
    for (const [fieldName, fieldValue] of Object.entries(processedData)) {
      const value = fieldValue as any;
      
      await this.dbService.upsertDatapoint({
        loanId,
        key: fieldName,
        value: String(value.value),
        normalizedValue: value.normalizedValue || String(value.value),
        confidence: value.source.confidence,
        ingestSource: value.source.type,
        autofilledFrom: this.mapSourceToAutofilled(value.source.type),
        evidenceDocId: documentId,
        evidencePage: value.documentReference?.pageNumber,
        evidenceTextHash: value.lineage.textHash,
        evidenceBoundingBox: value.documentReference?.boundingBox,
        extractorVersion: process.env.EXTRACTOR_VERSION || 'v2025.09.01',
        promptVersion: value.promptVersion,
        authorityPriority: value.source.priority,
        authorityDecision: value.authorityDecision
      });
    }
  }

  /**
   * Store validation results as QC defects
   */
  async storeValidationResults(
    loanId: string,
    validationResults: any[]
  ): Promise<void> {
    for (const result of validationResults) {
      if (!result.isValid) {
        // Find matching QC rule or create generic one
        const ruleCode = `validation_${result.rule}`;
        
        // Create QC defect record
        // Note: In production, you'd first ensure the QC rule exists
        await this.dbService.createImportError({
          importId: loanId, // This would need to be mapped properly
          code: ruleCode,
          severity: result.severity,
          pointer: result.fieldName,
          message: result.message,
          suggestedCorrection: result.suggestedCorrection ? {
            value: result.suggestedCorrection
          } : undefined,
          canAutoCorrect: result.canAutoCorrect
        });
      }
    }
  }

  /**
   * Create comprehensive lineage records in database
   */
  async createDatabaseLineageRecords(
    processedData: any,
    documentId: string,
    payload: any
  ): Promise<string[]> {
    const lineageIds: string[] = [];

    for (const [fieldName, fieldValue] of Object.entries(processedData)) {
      const value = fieldValue as any;
      
      const lineageId = await this.dbService.createLineageRecord({
        lineageId: `lineage_${fieldName}_${Date.now()}`, // This will be overridden
        fieldName,
        value: String(value.value),
        source: value.source.type,
        confidence: value.source.confidence,
        documentId,
        pageNumber: value.documentReference?.pageNumber,
        textHash: value.lineage.textHash,
        boundingBox: value.documentReference?.boundingBox,
        extractorVersion: process.env.EXTRACTOR_VERSION || 'v2025.09.01',
        promptVersion: value.promptVersion,
        operatorId: payload.operatorId,
        vendorName: value.vendorName,
        derivedFrom: value.derivedFrom || [],
        transformations: value.transformations || []
      });

      lineageIds.push(lineageId);
    }

    return lineageIds;
  }

  /**
   * Store conflicts in database for resolution
   */
  async storeConflicts(
    loanId: string,
    conflicts: any[]
  ): Promise<void> {
    for (const conflict of conflicts) {
      await this.dbService.createConflict({
        loanId,
        key: conflict.fieldName,
        candidates: conflict.candidates,
        authorityRule: conflict.authorityRule
      });
    }
  }

  /**
   * Update worker health status in database
   */
  async updateWorkerHealthStatus(
    workerName: string,
    workerType: string,
    isHealthy: boolean,
    metadata: any = {}
  ): Promise<void> {
    await this.dbService.updateWorkerStatus({
      workerName,
      workerType,
      status: isHealthy ? 'healthy' : 'unhealthy',
      metadata: {
        ...metadata,
        lastUpdate: new Date().toISOString()
      }
    });
  }

  /**
   * Record processing metrics in database
   */
  async recordProcessingMetrics(
    metric: string,
    value: number,
    dimensions: any = {},
    tenantId?: string,
    correlationId?: string
  ): Promise<void> {
    await this.dbService.recordMonitoringEvent({
      metric,
      value,
      dimensions,
      tenantId,
      correlationId
    });
  }

  /**
   * Create alert in database
   */
  async createDatabaseAlert(
    alertId: string,
    type: string,
    severity: string,
    title: string,
    message: string,
    metadata: any = {}
  ): Promise<void> {
    await this.dbService.createAlert({
      alertId,
      type,
      severity,
      title,
      message,
      metadata
    });
  }

  /**
   * Map source types to autofilled_from enum
   */
  private mapSourceToAutofilled(sourceType: string): string {
    const mapping: Record<string, string> = {
      'investor_directive': 'investor_directive',
      'escrow_instruction': 'escrow_instruction',
      'document_parse': 'document',
      'ai_extraction': 'document',
      'ocr': 'document',
      'vendor_api': 'vendor',
      'manual_entry': 'user'
    };

    return mapping[sourceType] || 'payload';
  }

  /**
   * Get loan processing status from database
   */
  async getLoanProcessingStatus(loanId: string): Promise<{
    status: string;
    datapointsCount: number;
    conflictsCount: number;
    validationErrors: number;
  }> {
    // This would implement database queries to get comprehensive status
    // For now, return placeholder
    return {
      status: 'processing',
      datapointsCount: 0,
      conflictsCount: 0,
      validationErrors: 0
    };
  }

  /**
   * Verify data integrity using database constraints
   */
  async verifyDataIntegrity(loanId: string): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check for duplicate datapoints
    const datapoints = await this.dbService.getLoanDatapoints(loanId);
    const keysSeen = new Set<string>();
    
    for (const dp of datapoints) {
      if (keysSeen.has(dp.key)) {
        issues.push(`Duplicate datapoint key: ${dp.key}`);
      }
      keysSeen.add(dp.key);
    }

    // Verify lineage integrity
    for (const dp of datapoints) {
      if (dp.evidenceTextHash) {
        // In production, you'd verify the hash against the actual document text
        const isHashValid = await this.verifyTextHash(dp.evidenceTextHash, dp.value || '');
        if (!isHashValid) {
          issues.push(`Invalid text hash for datapoint: ${dp.key}`);
        }
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Verify text hash for tamper detection
   */
  private async verifyTextHash(expectedHash: string, text: string): Promise<boolean> {
    const calculatedHash = createHash('sha256').update(text).digest('hex');
    return calculatedHash === expectedHash;
  }
}