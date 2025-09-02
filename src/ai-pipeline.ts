/**
 * AI Servicing Pipeline - Main Integration Module
 * Orchestrates investor-first, escrow-led document processing with explainable AI
 */

import { DocumentIntakeWorker } from './workers/document-intake-worker';
import { ExtractWorker } from './workers/ExtractWorker';
import { SelfHealingWorker } from './workers/self-healing-worker';
import { LineageTracker } from './utils/lineage-tracker';
import { AuthorityMatrix } from './authority/authority-matrix';
import { FieldValidators } from './utils/validation/field-validators';
import { PipelineMonitor } from './monitoring/pipeline-monitor';
import { phase10AuditService } from '../server/services/phase10-audit-service';
import pino from 'pino';

const logger = pino({ name: 'ai-pipeline' });

export interface PipelineConfig {
  tenantId?: string;
  program?: string; // FNMA, FHLMC, etc.
  investorProfile?: string;
  enableMonitoring?: boolean;
}

export interface ProcessingResult {
  success: boolean;
  documentId: string;
  extractedData?: Record<string, any>;
  validationResults?: any[];
  lineageIds?: string[];
  processingStats?: {
    fieldsExtracted: number;
    fieldsWithConflicts: number;
    averageConfidence: number;
    processingTimeMs: number;
  };
  error?: string;
}

/**
 * Main AI Pipeline Orchestrator
 * Implements all non-negotiables:
 * - Investor-first, escrow-led processing
 * - Do-Not-Ping enforcement
 * - Explainable by construction
 * - Deterministic conflict resolution
 * - Self-healing operations
 * - Enterprise security compliance
 */
export class AIPipeline {
  private documentWorker: DocumentIntakeWorker;
  private extractWorker: ExtractWorker;
  private lineageTracker: LineageTracker;
  private fieldValidators: FieldValidators;
  private monitor: PipelineMonitor;
  private config: PipelineConfig;

  constructor(config: PipelineConfig = {}) {
    this.config = {
      tenantId: '00000000-0000-0000-0000-000000000001',
      program: 'FNMA',
      investorProfile: 'DEFAULT',
      enableMonitoring: true,
      ...config
    };

    this.initializeComponents();
  }

  /**
   * Initialize all pipeline components
   */
  private initializeComponents(): void {
    this.documentWorker = new DocumentIntakeWorker();
    this.extractWorker = new ExtractWorker();
    this.lineageTracker = new LineageTracker();
    this.fieldValidators = new FieldValidators();
    
    if (this.config.enableMonitoring) {
      this.monitor = new PipelineMonitor();
    }

    logger.info({
      config: this.config,
      components: {
        documentWorker: true,
        lineageTracker: true,
        fieldValidators: true,
        monitor: !!this.monitor
      }
    }, 'AI Pipeline initialized');
  }

  /**
   * Process document with full pipeline
   * Main entry point for document processing
   */
  async processDocument(
    documentId: string,
    filePath: string,
    fileType: 'mismo' | 'csv' | 'json' | 'pdf',
    options: {
      loanUrn: string;
      escrowInstructions?: any[];
      investorDirectives?: any[];
      correlationId?: string;
    }
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const correlationId = options.correlationId || `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Log processing start
      await this.logPipelineEvent('PROCESSING_STARTED', {
        documentId,
        fileType,
        loanUrn: options.loanUrn,
        correlationId
      });

      // Create work item for document intake
      const workItem = {
        id: documentId,
        type: 'document_intake',
        payload: {
          documentId,
          filePath,
          fileType,
          loanUrn: options.loanUrn,
          escrowInstructions: options.escrowInstructions || [],
          investorDirectives: options.investorDirectives || [],
          tenantId: this.config.tenantId,
          correlationId
        },
        attempt: 1,
        maxAttempts: 3,
        createdAt: new Date(),
        errors: [],
        metadata: {
          program: this.config.program,
          investorProfile: this.config.investorProfile
        }
      };

      // Process document through intake worker
      const workResult = await this.documentWorker.processWorkItem(workItem);

      if (!workResult.success) {
        // Record failure metrics
        if (this.monitor) {
          this.monitor.recordDocumentProcessed(
            fileType,
            'failed',
            Date.now() - startTime,
            this.config.tenantId!
          );
        }

        return {
          success: false,
          documentId,
          error: workResult.error
        };
      }

      const result = workResult.result!;

      // Record success metrics
      if (this.monitor) {
        this.monitor.recordDocumentProcessed(
          fileType,
          'success',
          Date.now() - startTime,
          this.config.tenantId!
        );

        // Record extraction accuracy metrics
        for (const [fieldName, fieldValue] of Object.entries(result.extractedData)) {
          this.monitor.recordExtractionAccuracy(
            fieldName,
            fieldValue.source.confidence,
            process.env.EXTRACTOR_VERSION || 'v2025.09.01',
            fieldValue.source.type
          );
        }

        // Record validation metrics
        for (const validationResult of result.validationResults) {
          if (!validationResult.isValid) {
            this.monitor.recordValidationError(
              'validation_error',
              validationResult.severity,
              validationResult.fieldName
            );
          }
        }
      }

      // Log processing completion
      await this.logPipelineEvent('PROCESSING_COMPLETED', {
        documentId,
        correlationId,
        fieldsExtracted: result.processingStats.fieldsExtracted,
        averageConfidence: result.processingStats.averageConfidence,
        processingTimeMs: result.processingStats.processingTimeMs
      });

      return {
        success: true,
        documentId,
        extractedData: result.extractedData,
        validationResults: result.validationResults,
        lineageIds: result.lineageIds,
        processingStats: result.processingStats
      };

    } catch (error) {
      // Record error metrics
      if (this.monitor) {
        this.monitor.recordDocumentProcessed(
          fileType,
          'failed',
          Date.now() - startTime,
          this.config.tenantId!
        );
      }

      // Log error
      await this.logPipelineEvent('PROCESSING_ERROR', {
        documentId,
        correlationId,
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: Date.now() - startTime
      });

      return {
        success: false,
        documentId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate extracted data against business rules
   */
  async validateExtractedData(
    data: Record<string, any>,
    program = this.config.program
  ): Promise<any[]> {
    return this.fieldValidators.validateLoanData(data, program);
  }

  /**
   * Get lineage explanation for field
   */
  async getFieldLineage(lineageId: string): Promise<string> {
    return this.lineageTracker.generateExplanation(lineageId);
  }

  /**
   * Resolve data conflicts using Authority Matrix
   */
  async resolveFieldConflicts(
    fieldName: string,
    values: any[],
    tenantId = this.config.tenantId
  ): Promise<any> {
    return AuthorityMatrix.resolveConflict(fieldName, values, tenantId);
  }

  /**
   * Get pipeline health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, boolean>;
    metrics?: any;
  } {
    const components = {
      documentWorker: true, // Could implement health checks
      lineageTracker: true,
      fieldValidators: true,
      monitor: !!this.monitor,
      authorityMatrix: true
    };

    const allHealthy = Object.values(components).every(status => status);
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      components,
      metrics: this.monitor?.getHealthSummary()
    };
  }

  /**
   * Get pipeline statistics
   */
  async getStatistics(): Promise<{
    lineageStats: any;
    processingStats: any;
    validationStats: any;
  }> {
    return {
      lineageStats: this.lineageTracker.getStatistics(),
      processingStats: {
        // Would be calculated from metrics
        totalDocuments: 0,
        successRate: 0,
        averageProcessingTime: 0
      },
      validationStats: {
        // Would be calculated from validation results
        totalValidations: 0,
        errorRate: 0,
        autoCorrections: 0
      }
    };
  }

  /**
   * Export compliance data
   */
  async exportComplianceData(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    auditEvents: any[];
    lineageData: any;
    authorityDecisions: any[];
  }> {
    // Export audit events
    const auditEvents = []; // Would query from audit service

    // Export lineage data
    const lineageData = this.lineageTracker.exportLineageData();

    // Export authority decisions
    const authorityDecisions = []; // Would query from audit service

    return {
      auditEvents,
      lineageData,
      authorityDecisions
    };
  }

  /**
   * Log pipeline events for audit
   */
  private async logPipelineEvent(
    eventType: string,
    payload: any
  ): Promise<void> {
    try {
      await phase10AuditService.logEvent({
        tenantId: this.config.tenantId!,
        eventType: `AI_PIPELINE.${eventType}`,
        actorType: 'system',
        resourceUrn: `urn:pipeline:${this.config.program}`,
        payload: {
          program: this.config.program,
          investorProfile: this.config.investorProfile,
          ...payload
        }
      });
    } catch (error) {
      logger.error({ error, eventType, payload }, 'Failed to log pipeline event');
    }
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down AI Pipeline');
    
    // Cleanup monitors, close connections, etc.
    if (this.monitor) {
      this.monitor.resetMetrics();
    }
  }
}

// Export main pipeline class and key interfaces
export {
  DocumentIntakeWorker,
  SelfHealingWorker,
  LineageTracker,
  AuthorityMatrix,
  FieldValidators,
  PipelineMonitor
};

// Default export for easy importing
export default AIPipeline;