/**
 * AI Pipeline Integration Module
 * Brings together storage, messaging, database, and worker components
 */

import { AIPipelineService } from './database/ai-pipeline-service';
import { AIPipelineStorageManager } from './utils/storage';
import { IdempotencyKeyManager } from './utils/idempotency';
import { rabbitMQInit } from './messaging/rabbitmq-init';
import { DocumentIntakeWorker } from './workers/document-intake-worker';

export interface AIPipelineConfig {
  tenantId: string;
  userId?: string;
  enableIdempotency?: boolean;
  storageConfig?: {
    bucketName?: string;
    prefix?: string;
  };
  messagingConfig?: {
    connectionUrl?: string;
  };
}

/**
 * Complete AI Pipeline Integration Service
 * Orchestrates all components for document processing
 */
export class AIPipelineIntegration {
  private dbService: AIPipelineService;
  private storageManager: AIPipelineStorageManager;
  private idempotencyManager: IdempotencyKeyManager;
  private documentWorker: DocumentIntakeWorker;
  private config: AIPipelineConfig;

  constructor(config: AIPipelineConfig) {
    this.config = config;
    this.dbService = new AIPipelineService();
    this.storageManager = new AIPipelineStorageManager();
    this.idempotencyManager = new IdempotencyKeyManager();
    this.documentWorker = new DocumentIntakeWorker();
  }

  /**
   * Initialize the AI pipeline
   */
  async initialize(): Promise<void> {
    console.log('[AIPipeline] Initializing AI Pipeline Integration...');

    try {
      // Set tenant context for database operations
      await this.dbService.setTenantContext(this.config.tenantId);
      
      if (this.config.userId) {
        await this.dbService.setUserContext(this.config.userId);
      }

      // Initialize RabbitMQ topology
      await rabbitMQInit.initialize();

      // Verify RabbitMQ health
      const isHealthy = await rabbitMQInit.healthCheck();
      if (!isHealthy) {
        console.warn('[AIPipeline] RabbitMQ health check failed, some features may not work');
      }

      console.log('[AIPipeline] AI Pipeline Integration initialized successfully');

    } catch (error) {
      console.error('[AIPipeline] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Process document upload with complete AI pipeline
   */
  async processDocumentUpload(
    file: Express.Multer.File | Buffer,
    loanId: string,
    documentType: string,
    originalFilename?: string,
    investorDirectives?: any[],
    escrowInstructions?: any[]
  ): Promise<{
    documentId: string;
    processingId: string;
    storageUri: string;
    status: string;
  }> {
    console.log(`[AIPipeline] Processing document upload for loan ${loanId}`);

    try {
      // 1. Create loan candidate if it doesn't exist
      let loanCandidate;
      try {
        loanCandidate = await this.dbService.createLoanCandidate({
          tenantId: this.config.tenantId,
          loanUrn: loanId
        });
      } catch (error) {
        // Loan might already exist, try to get it
        loanCandidate = await this.dbService.getLoanCandidate(loanId);
        if (!loanCandidate) {
          throw error;
        }
      }

      // 2. Save file to storage
      const fileMetadata = await this.storageManager.saveUpload(
        file,
        this.config.tenantId,
        loanCandidate.id,
        originalFilename
      );

      // 3. Create document record in database
      const documentRecord = await this.dbService.createDocument({
        loanId: loanCandidate.id,
        storageUri: fileMetadata.uri,
        sha256: fileMetadata.sha256,
        docType: documentType
      });

      // 4. Create import record
      const importRecord = await this.dbService.createImport({
        tenantId: this.config.tenantId,
        type: this.getFileType(fileMetadata.filename),
        filename: fileMetadata.filename,
        sizeBytes: fileMetadata.size,
        sha256: fileMetadata.sha256,
        correlationId: this.generateCorrelationId(),
        investorDirectives: investorDirectives || [],
        escrowInstructions: escrowInstructions || [],
        createdBy: this.config.userId || 'system'
      });

      // 5. Generate idempotency key for processing
      const processingKey = this.idempotencyManager.generateKey({
        workerType: 'document_intake',
        components: [documentRecord.id, fileMetadata.sha256]
      });

      // 6. Start document processing workflow
      const processingResult = await this.startDocumentProcessing({
        documentId: documentRecord.id,
        loanId: loanCandidate.id,
        importId: importRecord.id,
        filePath: fileMetadata.uri,
        fileType: this.getFileType(fileMetadata.filename),
        tenantId: this.config.tenantId,
        correlationId: importRecord.correlationId || '',
        investorDirectives: investorDirectives || [],
        escrowInstructions: escrowInstructions || []
      }, processingKey);

      return {
        documentId: documentRecord.id,
        processingId: processingKey,
        storageUri: fileMetadata.uri,
        status: 'processing'
      };

    } catch (error) {
      console.error('[AIPipeline] Document processing failed:', error);
      throw error;
    }
  }

  /**
   * Start document processing workflow
   */
  private async startDocumentProcessing(
    payload: any,
    idempotencyKey: string
  ): Promise<any> {
    if (this.config.enableIdempotency !== false) {
      // Use idempotent execution
      return await this.idempotencyManager.executeIdempotent(
        idempotencyKey,
        'document_intake',
        async () => {
          return await this.documentWorker.processMessage(payload);
        }
      );
    } else {
      // Direct execution without idempotency
      return await this.documentWorker.processMessage(payload);
    }
  }

  /**
   * Get processing status for document
   */
  async getProcessingStatus(documentId: string): Promise<{
    status: string;
    progress: any;
    results?: any;
    errors?: any[];
  }> {
    try {
      // Get document record
      const candidate = await this.dbService.getLoanCandidate(documentId);
      if (!candidate) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Get all datapoints for the loan
      const datapoints = await this.dbService.getLoanDatapoints(candidate.id);

      // Get processing statistics
      const stats = await this.dbService.getProcessingStats(this.config.tenantId);

      return {
        status: candidate.status,
        progress: {
          datapointsExtracted: datapoints.length,
          totalDocuments: stats.totalDocuments,
          averageConfidence: stats.averageConfidence
        },
        results: datapoints,
        errors: [] // TODO: Get actual errors from QC defects
      };

    } catch (error) {
      console.error(`[AIPipeline] Error getting status for ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Get loan processing summary
   */
  async getLoanSummary(loanId: string): Promise<{
    loanId: string;
    status: string;
    documentsCount: number;
    datapointsCount: number;
    conflictsCount: number;
    qcIssuesCount: number;
    lastUpdated: Date;
  }> {
    try {
      const candidate = await this.dbService.getLoanCandidate(loanId);
      if (!candidate) {
        throw new Error(`Loan not found: ${loanId}`);
      }

      const datapoints = await this.dbService.getLoanDatapoints(candidate.id);

      // TODO: Get actual counts from database
      return {
        loanId: candidate.id,
        status: candidate.status,
        documentsCount: 0, // TODO: Count from loan_documents
        datapointsCount: datapoints.length,
        conflictsCount: 0, // TODO: Count from loan_conflicts
        qcIssuesCount: 0, // TODO: Count from qc_defects
        lastUpdated: candidate.updatedAt || candidate.createdAt
      };

    } catch (error) {
      console.error(`[AIPipeline] Error getting loan summary for ${loanId}:`, error);
      throw error;
    }
  }

  /**
   * Export loan data for investor delivery
   */
  async exportLoanData(
    loanId: string,
    format: 'json' | 'xml' | 'csv' = 'json'
  ): Promise<string> {
    try {
      const candidate = await this.dbService.getLoanCandidate(loanId);
      if (!candidate) {
        throw new Error(`Loan not found: ${loanId}`);
      }

      const datapoints = await this.dbService.getLoanDatapoints(candidate.id);

      // Convert datapoints to export format
      const exportData = this.formatExportData(datapoints, format);

      // Generate export file
      const exportId = this.generateCorrelationId();
      const filename = `loan_${loanId}_${exportId}.${format}`;

      const exportUri = await this.storageManager.saveExport(
        this.config.tenantId,
        candidate.id,
        exportId,
        filename,
        Buffer.from(exportData),
        this.getMimeType(format)
      );

      console.log(`[AIPipeline] Exported loan data to ${exportUri}`);
      return exportUri;

    } catch (error) {
      console.error(`[AIPipeline] Export failed for loan ${loanId}:`, error);
      throw error;
    }
  }

  /**
   * Get pipeline health status
   */
  async getHealthStatus(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    database: boolean;
    messaging: boolean;
    storage: boolean;
    workers: any;
  }> {
    try {
      // Check database connectivity
      const dbHealthy = await this.checkDatabaseHealth();
      
      // Check messaging
      const messagingHealthy = await rabbitMQInit.healthCheck();
      
      // Check storage
      const storageHealthy = await this.checkStorageHealth();
      
      // Check worker health
      const workersHealth = await this.checkWorkersHealth();

      const overall = dbHealthy && messagingHealthy && storageHealthy 
        ? 'healthy' 
        : 'degraded';

      return {
        overall,
        database: dbHealthy,
        messaging: messagingHealthy,
        storage: storageHealthy,
        workers: workersHealth
      };

    } catch (error) {
      console.error('[AIPipeline] Health check failed:', error);
      return {
        overall: 'unhealthy',
        database: false,
        messaging: false,
        storage: false,
        workers: {}
      };
    }
  }

  // Helper methods

  private getFileType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf': return 'pdf';
      case 'csv': return 'csv';
      case 'json': return 'json';
      case 'xml': return 'mismo';
      default: return 'pdf';
    }
  }

  private generateCorrelationId(): string {
    return `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private formatExportData(datapoints: any[], format: string): string {
    const data = datapoints.reduce((acc, dp) => {
      acc[dp.key] = dp.value;
      return acc;
    }, {});

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        const headers = Object.keys(data);
        const values = Object.values(data);
        return [headers.join(','), values.join(',')].join('\n');
      case 'xml':
        const xmlContent = Object.entries(data)
          .map(([key, value]) => `  <${key}>${value}</${key}>`)
          .join('\n');
        return `<loan>\n${xmlContent}\n</loan>`;
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  private getMimeType(format: string): string {
    switch (format) {
      case 'json': return 'application/json';
      case 'csv': return 'text/csv';
      case 'xml': return 'application/xml';
      default: return 'application/octet-stream';
    }
  }

  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      // Simple database connectivity check
      await this.dbService.getProcessingStats();
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkStorageHealth(): Promise<boolean> {
    try {
      // Simple storage connectivity check
      // Could ping storage service or check permissions
      return true; // Placeholder
    } catch (error) {
      return false;
    }
  }

  private async checkWorkersHealth(): Promise<any> {
    try {
      // Get worker status from database
      // TODO: Implement actual worker health check
      return {
        documentIntake: 'healthy',
        split: 'healthy',
        ocr: 'healthy',
        extract: 'healthy',
        qc: 'healthy'
      };
    } catch (error) {
      return {};
    }
  }
}

// Export convenience function for quick setup
export async function createAIPipeline(config: AIPipelineConfig): Promise<AIPipelineIntegration> {
  const pipeline = new AIPipelineIntegration(config);
  await pipeline.initialize();
  return pipeline;
}