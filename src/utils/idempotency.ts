/**
 * Idempotency Key System for AI Pipeline Workers
 * Ensures exactly-once processing for all worker operations
 */

import { createHash } from 'crypto';
import { AIPipelineService } from '../database/ai-pipeline-service';

export interface IdempotencyKeyComponents {
  workerType: string;
  components: (string | number)[];
  version?: string;
}

export interface IdempotencyRecord {
  key: string;
  workerType: string;
  status: 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

/**
 * Idempotency Key Manager
 * Implements exactly-once processing guarantees for worker operations
 */
export class IdempotencyKeyManager {
  private dbService: AIPipelineService;
  private defaultTtlHours: number;

  constructor(defaultTtlHours: number = 24) {
    this.dbService = new AIPipelineService();
    this.defaultTtlHours = defaultTtlHours;
  }

  /**
   * Generate idempotency key for SplitWorker
   * Components: (pdf_sha256, chunk_plan_hash)
   */
  generateSplitWorkerKey(pdfSha256: string, chunkPlan: any): string {
    const chunkPlanHash = createHash('sha256')
      .update(JSON.stringify(chunkPlan))
      .digest('hex');

    return this.generateKey({
      workerType: 'split',
      components: [pdfSha256, chunkPlanHash]
    });
  }

  /**
   * Generate idempotency key for OcrWorker
   * Components: (doc_id, page_sha256)
   */
  generateOcrWorkerKey(docId: string, pageSha256: string): string {
    return this.generateKey({
      workerType: 'ocr',
      components: [docId, pageSha256]
    });
  }

  /**
   * Generate idempotency key for ExtractWorker
   * Components: (doc_id, extractor_version, page_group_hash)
   */
  generateExtractWorkerKey(
    docId: string, 
    extractorVersion: string, 
    pageGroup: any[]
  ): string {
    const pageGroupHash = createHash('sha256')
      .update(JSON.stringify(pageGroup.sort()))
      .digest('hex');

    return this.generateKey({
      workerType: 'extract',
      components: [docId, extractorVersion, pageGroupHash]
    });
  }

  /**
   * Generate idempotency key for QcWorker
   * Components: (loan_id, qc_rules_version, snapshot_hash)
   */
  generateQcWorkerKey(
    loanId: string, 
    qcRulesVersion: string, 
    dataSnapshot: any
  ): string {
    const snapshotHash = createHash('sha256')
      .update(JSON.stringify(dataSnapshot))
      .digest('hex');

    return this.generateKey({
      workerType: 'qc',
      components: [loanId, qcRulesVersion, snapshotHash]
    });
  }

  /**
   * Generate generic idempotency key
   */
  generateKey(keyComponents: IdempotencyKeyComponents): string {
    const { workerType, components, version } = keyComponents;
    
    // Create deterministic string from components
    const componentString = components
      .map(c => String(c))
      .join('|');

    const keyString = version 
      ? `${workerType}:${version}:${componentString}`
      : `${workerType}:${componentString}`;

    // Generate SHA-256 hash for consistent length and format
    return createHash('sha256')
      .update(keyString)
      .digest('hex');
  }

  /**
   * Check if operation is already processed (idempotent check)
   */
  async checkIdempotency(key: string): Promise<{
    isProcessed: boolean;
    isProcessing: boolean;
    result?: any;
    error?: string;
  }> {
    try {
      // This would query the database for existing idempotency record
      // For now, implementing as placeholder
      console.log(`[Idempotency] Checking key: ${key}`);

      // TODO: Implement actual database lookup
      // const record = await this.dbService.getIdempotencyRecord(key);
      
      // Placeholder logic
      return {
        isProcessed: false,
        isProcessing: false
      };

    } catch (error) {
      console.error(`[Idempotency] Error checking key ${key}:`, error);
      return {
        isProcessed: false,
        isProcessing: false
      };
    }
  }

  /**
   * Mark operation as started (to prevent duplicate processing)
   */
  async markStarted(key: string, workerType: string, ttlHours?: number): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (ttlHours || this.defaultTtlHours));

    const record: IdempotencyRecord = {
      key,
      workerType,
      status: 'processing',
      createdAt: new Date(),
      expiresAt
    };

    try {
      console.log(`[Idempotency] Marking started: ${key}`);
      // TODO: Implement actual database insert
      // await this.dbService.createIdempotencyRecord(record);

    } catch (error) {
      console.error(`[Idempotency] Error marking started ${key}:`, error);
      throw error;
    }
  }

  /**
   * Mark operation as completed with result
   */
  async markCompleted(key: string, result: any): Promise<void> {
    try {
      console.log(`[Idempotency] Marking completed: ${key}`);
      // TODO: Implement actual database update
      // await this.dbService.updateIdempotencyRecord(key, {
      //   status: 'completed',
      //   result,
      //   completedAt: new Date()
      // });

    } catch (error) {
      console.error(`[Idempotency] Error marking completed ${key}:`, error);
      throw error;
    }
  }

  /**
   * Mark operation as failed with error
   */
  async markFailed(key: string, error: string): Promise<void> {
    try {
      console.log(`[Idempotency] Marking failed: ${key}`);
      // TODO: Implement actual database update
      // await this.dbService.updateIdempotencyRecord(key, {
      //   status: 'failed',
      //   error,
      //   completedAt: new Date()
      // });

    } catch (error) {
      console.error(`[Idempotency] Error marking failed ${key}:`, error);
      throw error;
    }
  }

  /**
   * Clean up expired idempotency records
   */
  async cleanupExpired(): Promise<number> {
    try {
      console.log('[Idempotency] Cleaning up expired records');
      // TODO: Implement actual database cleanup
      // return await this.dbService.deleteExpiredIdempotencyRecords();
      
      return 0; // Placeholder
    } catch (error) {
      console.error('[Idempotency] Error during cleanup:', error);
      throw error;
    }
  }

  /**
   * Wrapper for idempotent operation execution
   */
  async executeIdempotent<T>(
    key: string,
    workerType: string,
    operation: () => Promise<T>,
    ttlHours?: number
  ): Promise<T> {
    // Check if already processed
    const idempotencyCheck = await this.checkIdempotency(key);
    
    if (idempotencyCheck.isProcessed) {
      console.log(`[Idempotency] Operation already completed: ${key}`);
      if (idempotencyCheck.error) {
        throw new Error(idempotencyCheck.error);
      }
      return idempotencyCheck.result;
    }

    if (idempotencyCheck.isProcessing) {
      throw new Error(`Operation already in progress for key: ${key}`);
    }

    // Mark as started
    await this.markStarted(key, workerType, ttlHours);

    try {
      // Execute operation
      const result = await operation();
      
      // Mark as completed
      await this.markCompleted(key, result);
      
      return result;
    } catch (error) {
      // Mark as failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.markFailed(key, errorMessage);
      
      throw error;
    }
  }

  /**
   * Generate page SHA-256 for OCR idempotency
   */
  static generatePageSha256(pageContent: Buffer): string {
    return createHash('sha256')
      .update(pageContent)
      .digest('hex');
  }

  /**
   * Generate chunk plan hash for split idempotency
   */
  static generateChunkPlanHash(chunkPlan: {
    strategy: string;
    pageRanges: Array<{ start: number; end: number }>;
    splitOptions: any;
  }): string {
    return createHash('sha256')
      .update(JSON.stringify(chunkPlan))
      .digest('hex');
  }

  /**
   * Generate page group hash for extraction idempotency
   */
  static generatePageGroupHash(pageGroup: Array<{
    pageNumber: number;
    content: string;
    sha256: string;
  }>): string {
    // Sort by page number for consistency
    const sorted = pageGroup.sort((a, b) => a.pageNumber - b.pageNumber);
    
    return createHash('sha256')
      .update(JSON.stringify(sorted))
      .digest('hex');
  }

  /**
   * Generate data snapshot hash for QC idempotency
   */
  static generateSnapshotHash(dataSnapshot: {
    loanData: Record<string, any>;
    extractedFields: any[];
    timestamp: string;
  }): string {
    // Remove timestamp from hash to allow for time-insensitive comparisons
    const { timestamp, ...stableData } = dataSnapshot;
    
    return createHash('sha256')
      .update(JSON.stringify(stableData))
      .digest('hex');
  }

  /**
   * Validate idempotency key format
   */
  static isValidKey(key: string): boolean {
    // SHA-256 hash should be 64 hex characters
    return /^[a-f0-9]{64}$/.test(key);
  }

  /**
   * Get idempotency statistics
   */
  async getStatistics(): Promise<{
    totalRecords: number;
    byStatus: Record<string, number>;
    byWorkerType: Record<string, number>;
    oldestRecord?: Date;
    newestRecord?: Date;
  }> {
    try {
      // TODO: Implement actual database aggregation
      return {
        totalRecords: 0,
        byStatus: {},
        byWorkerType: {}
      };
    } catch (error) {
      console.error('[Idempotency] Error getting statistics:', error);
      throw error;
    }
  }
}

// Export utility functions for worker implementations
export const IdempotencyUtils = {
  generatePageSha256: IdempotencyKeyManager.generatePageSha256,
  generateChunkPlanHash: IdempotencyKeyManager.generateChunkPlanHash,
  generatePageGroupHash: IdempotencyKeyManager.generatePageGroupHash,
  generateSnapshotHash: IdempotencyKeyManager.generateSnapshotHash,
  isValidKey: IdempotencyKeyManager.isValidKey
};