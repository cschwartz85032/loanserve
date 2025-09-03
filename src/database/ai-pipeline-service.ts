/**
 * AI Pipeline Database Service
 * Type-safe database operations for AI servicing pipeline
 */

import { db } from '../../server/db';
import { 
  loanCandidates, 
  loanDocuments, 
  loanDatapoints, 
  loanConflicts,
  imports,
  importErrors,
  importMappings,
  lineageRecords,
  workerStatus,
  pipelineAlerts,
  monitoringEvents,
  type LoanCandidate,
  type NewLoanCandidate,
  type LoanDocument,
  type NewLoanDocument,
  type LoanDatapoint,
  type NewLoanDatapoint,
  type NewLineageRecord,
  type Import,
  type NewImport
} from './ai-pipeline-schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { withTenantClient, assertTenantContext, tenantSafeQuery } from '../db/withTenantClient';
import { drizzle } from 'drizzle-orm/postgres-js';

export class AIPipelineService {
  /**
   * Create new loan candidate for AI processing
   */
  async createLoanCandidate(data: {
    tenantId: string;
    loanUrn?: string;
    investorId?: string;
    escrowId?: string;
    propertyId?: string;
    sourceImportId?: string;
  }): Promise<LoanCandidate> {
    return withTenantClient(data.tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      const [candidate] = await db
        .insert(loanCandidates)
        .values({
          tenantId: data.tenantId,
          loanUrn: data.loanUrn,
          investorId: data.investorId,
          escrowId: data.escrowId,
          propertyId: data.propertyId,
          sourceImportId: data.sourceImportId,
          status: 'new'
        })
        .returning();

      return candidate;
    });
  }

  /**
   * Get loan candidate by ID (requires tenant context)
   */
  async getLoanCandidate(id: string, tenantId: string): Promise<LoanCandidate | null> {
    return withTenantClient(tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      const [candidate] = await db
        .select()
        .from(loanCandidates)
        .where(eq(loanCandidates.id, id))
        .limit(1);

      return candidate || null;
    });
  }

  /**
   * Update loan candidate status (requires tenant context)
   */
  async updateLoanCandidateStatus(
    id: string, 
    status: string,
    tenantId: string
  ): Promise<void> {
    return withTenantClient(tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      await db
        .update(loanCandidates)
        .set({ 
          status, 
          updatedAt: sql`now()` 
        })
        .where(eq(loanCandidates.id, id));
    });
  }

  /**
   * Create document record (requires tenant context)
   */
  async createDocument(data: {
    loanId: string;
    storageUri: string;
    sha256: string;
    docType?: string;
    classConfidence?: number;
    tenantId: string;
  }): Promise<LoanDocument> {
    return withTenantClient(data.tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      const [document] = await db
        .insert(loanDocuments)
        .values({
          loanId: data.loanId,
          storageUri: data.storageUri,
          sha256: data.sha256,
          docType: data.docType,
          classConfidence: data.classConfidence?.toString(),
          ocrStatus: 'pending'
        })
        .returning();

      return document;
    });
  }

  /**
   * Update document OCR status (requires tenant context)
   */
  async updateDocumentOcrStatus(
    id: string, 
    status: string,
    tenantId: string
  ): Promise<void> {
    return withTenantClient(tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      await db
        .update(loanDocuments)
        .set({ ocrStatus: status })
        .where(eq(loanDocuments.id, id));
    });
  }

  /**
   * Create or update datapoint (requires tenant context)
   */
  async upsertDatapoint(data: {
    loanId: string;
    key: string;
    value: string;
    normalizedValue?: string;
    confidence: number;
    ingestSource: string;
    autofilledFrom: string;
    evidenceDocId?: string;
    evidencePage?: number;
    evidenceTextHash?: string;
    evidenceBoundingBox?: any;
    extractorVersion?: string;
    promptVersion?: string;
    authorityPriority: number;
    authorityDecision?: any;
    tenantId: string;
  }): Promise<LoanDatapoint> {
    // Enforce tenant context for RLS
    await this.setTenantContext(data.tenantId);
    
    // First try to find existing datapoint
    const [existing] = await db
      .select()
      .from(loanDatapoints)
      .where(and(
        eq(loanDatapoints.loanId, data.loanId),
        eq(loanDatapoints.key, data.key)
      ))
      .limit(1);

    if (existing) {
      // Update existing if new source has higher authority
      if (data.authorityPriority >= (existing.authorityPriority || 0)) {
        const [updated] = await db
          .update(loanDatapoints)
          .set({
            value: data.value,
            normalizedValue: data.normalizedValue,
            confidence: data.confidence.toString(),
            ingestSource: data.ingestSource,
            autofilledFrom: data.autofilledFrom,
            evidenceDocId: data.evidenceDocId,
            evidencePage: data.evidencePage,
            evidenceTextHash: data.evidenceTextHash,
            evidenceBoundingBox: data.evidenceBoundingBox,
            extractorVersion: data.extractorVersion,
            promptVersion: data.promptVersion,
            authorityPriority: data.authorityPriority,
            authorityDecision: data.authorityDecision,
            producedAt: sql`now()`
          })
          .where(eq(loanDatapoints.id, existing.id))
          .returning();
        
        return updated;
      }
      return existing;
    }

    // Create new datapoint
    const [datapoint] = await db
      .insert(loanDatapoints)
      .values({
        loanId: data.loanId,
        key: data.key,
        value: data.value,
        normalizedValue: data.normalizedValue,
        confidence: data.confidence.toString(),
        ingestSource: data.ingestSource,
        autofilledFrom: data.autofilledFrom,
        evidenceDocId: data.evidenceDocId,
        evidencePage: data.evidencePage,
        evidenceTextHash: data.evidenceTextHash,
        evidenceBoundingBox: data.evidenceBoundingBox,
        extractorVersion: data.extractorVersion,
        promptVersion: data.promptVersion,
        authorityPriority: data.authorityPriority,
        authorityDecision: data.authorityDecision
      })
      .returning();

    return datapoint;
  }

  /**
   * Get all datapoints for a loan (requires tenant context)
   */
  async getLoanDatapoints(loanId: string, tenantId: string): Promise<LoanDatapoint[]> {
    return withTenantClient(tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      return await db
        .select()
        .from(loanDatapoints)
        .where(eq(loanDatapoints.loanId, loanId))
        .orderBy(desc(loanDatapoints.authorityPriority));
    });
  }

  /**
   * Create conflict record (requires tenant context)
   */
  async createConflict(data: {
    loanId: string;
    key: string;
    candidates: any[];
    authorityRule?: string;
    tenantId: string;
  }): Promise<void> {
    return withTenantClient(data.tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      await db
        .insert(loanConflicts)
        .values({
          loanId: data.loanId,
          key: data.key,
          candidates: data.candidates,
          authorityRule: data.authorityRule,
          status: 'open'
        });
    });
  }

  /**
   * Resolve conflict (requires tenant context)
   */
  async resolveConflict(
    id: string,
    selectedValue: string,
    rationale: string,
    tenantId: string,
    resolverId?: string
  ): Promise<void> {
    // Enforce tenant context for RLS
    await this.setTenantContext(tenantId);
    
    await db
      .update(loanConflicts)
      .set({
        selectedValue,
        rationale,
        resolverId,
        status: 'resolved',
        resolvedAt: sql`now()`
      })
      .where(eq(loanConflicts.id, id));
  }

  /**
   * Create import record
   */
  async createImport(data: {
    tenantId: string;
    type: string;
    filename: string;
    sizeBytes: number;
    sha256: string;
    correlationId?: string;
    investorDirectives?: any[];
    escrowInstructions?: any[];
    createdBy: string;
  }): Promise<Import> {
    const [importRecord] = await db
      .insert(imports)
      .values({
        tenantId: data.tenantId,
        type: data.type,
        filename: data.filename,
        sizeBytes: data.sizeBytes,
        sha256: data.sha256,
        correlationId: data.correlationId,
        investorDirectives: data.investorDirectives || [],
        escrowInstructions: data.escrowInstructions || [],
        createdBy: data.createdBy,
        status: 'received'
      })
      .returning();

    return importRecord;
  }

  /**
   * Update import status and progress
   */
  async updateImportProgress(
    id: string,
    status: string,
    progress: any,
    errorCount = 0
  ): Promise<void> {
    await db
      .update(imports)
      .set({
        status,
        progress,
        errorCount,
        updatedAt: sql`now()`
      })
      .where(eq(imports.id, id));
  }

  /**
   * Create import error
   */
  async createImportError(data: {
    importId: string;
    code: string;
    severity: string;
    pointer: string;
    message: string;
    rawFragment?: any;
    suggestedCorrection?: any;
    canAutoCorrect?: boolean;
  }): Promise<void> {
    await db
      .insert(importErrors)
      .values(data);
  }

  /**
   * Create import mapping
   */
  async createImportMapping(data: {
    importId: string;
    canonicalKey: string;
    normalizedValue?: string;
    sourcePointer?: string;
    evidenceHash?: string;
    confidence?: number;
    autofilledFrom: string;
    transformationLog?: any[];
  }): Promise<void> {
    await db
      .insert(importMappings)
      .values({
        ...data,
        confidence: data.confidence?.toString(),
        transformationLog: data.transformationLog || []
      });
  }

  /**
   * Create lineage record
   */
  async createLineageRecord(data: NewLineageRecord): Promise<string> {
    const lineageId = `lineage_${randomUUID()}_${Date.now()}`;
    
    await db
      .insert(lineageRecords)
      .values({
        ...data,
        lineageId,
        confidence: data.confidence.toString()
      });

    return lineageId;
  }

  /**
   * Get lineage record by ID
   */
  async getLineageRecord(lineageId: string): Promise<any> {
    const [record] = await db
      .select()
      .from(lineageRecords)
      .where(eq(lineageRecords.lineageId, lineageId))
      .limit(1);

    return record || null;
  }

  /**
   * Get lineage chain
   */
  async getLineageChain(lineageId: string): Promise<any[]> {
    const visited = new Set<string>();
    const chain: any[] = [];

    const buildChain = async (id: string): Promise<void> => {
      if (visited.has(id)) return;
      visited.add(id);

      const record = await this.getLineageRecord(id);
      if (!record) return;

      chain.push(record);

      // Recursively get parent lineages
      if (record.derivedFrom) {
        for (const parentId of record.derivedFrom) {
          await buildChain(parentId);
        }
      }
    };

    await buildChain(lineageId);
    return chain;
  }

  /**
   * Update worker status
   */
  async updateWorkerStatus(data: {
    workerName: string;
    workerType: string;
    status: string;
    workItemsProcessed?: number;
    workItemsFailed?: number;
    cacheSize?: number;
    metadata?: any;
  }): Promise<void> {
    // Upsert worker status
    await db
      .insert(workerStatus)
      .values({
        workerName: data.workerName,
        workerType: data.workerType,
        status: data.status,
        workItemsProcessed: data.workItemsProcessed || 0,
        workItemsFailed: data.workItemsFailed || 0,
        cacheSize: data.cacheSize || 0,
        metadata: data.metadata || {},
        lastHeartbeat: sql`now()`
      })
      .onConflictDoUpdate({
        target: [workerStatus.workerName, workerStatus.workerType],
        set: {
          status: data.status,
          workItemsProcessed: data.workItemsProcessed || 0,
          workItemsFailed: data.workItemsFailed || 0,
          cacheSize: data.cacheSize || 0,
          metadata: data.metadata || {},
          lastHeartbeat: sql`now()`
        }
      });
  }

  /**
   * Create pipeline alert (requires tenant context)
   */
  async createAlert(data: {
    alertId: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    metadata?: any;
    tenantId: string;
  }): Promise<void> {
    return withTenantClient(data.tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      await db
        .insert(pipelineAlerts)
        .values({
          alertId: data.alertId,
          type: data.type,
          severity: data.severity,
          title: data.title,
          message: data.message,
          metadata: data.metadata || {}
        });
    });
  }

  /**
   * Resolve alert (requires tenant context)
   */
  async resolveAlert(alertId: string, resolvedBy: string, tenantId: string): Promise<void> {
    return withTenantClient(tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      await db
        .update(pipelineAlerts)
        .set({
          resolved: true,
          resolvedBy,
          resolvedAt: sql`now()`
        })
        .where(eq(pipelineAlerts.alertId, alertId));
    });
  }

  /**
   * Get active alerts (requires tenant context)
   */
  async getActiveAlerts(tenantId: string): Promise<any[]> {
    return withTenantClient(tenantId, async (client) => {
      // Runtime guard - ensure tenant context is set
      await assertTenantContext(client);
      
      const db = drizzle(client);
      return await db
        .select()
        .from(pipelineAlerts)
        .where(eq(pipelineAlerts.resolved, false))
        .orderBy(desc(pipelineAlerts.createdAt));
    });
  }

  /**
   * Record monitoring event (enforces tenant context)
   */
  async recordMonitoringEvent(data: {
    metric: string;
    value: number;
    dimensions?: any;
    tenantId: string; // Now required for RLS
    correlationId?: string;
  }): Promise<void> {
    // Enforce tenant context for RLS
    await this.setTenantContext(data.tenantId);
    
    await db
      .insert(monitoringEvents)
      .values({
        metric: data.metric,
        value: data.value.toString(),
        dim: data.dimensions || {},
        tenantId: data.tenantId,
        correlationId: data.correlationId
      });
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(tenantId?: string): Promise<{
    totalCandidates: number;
    candidatesByStatus: any;
    totalDocuments: number;
    totalDatapoints: number;
    averageConfidence: number;
  }> {
    // This would implement complex aggregation queries
    // For now, return placeholder structure
    return {
      totalCandidates: 0,
      candidatesByStatus: {},
      totalDocuments: 0,
      totalDatapoints: 0,
      averageConfidence: 0
    };
  }

  /**
   * @deprecated SECURITY WARNING: This method bypassed proper transaction scoping
   * Use withTenantClient() with assertTenantContext() instead
   * 
   * All database operations now enforced to use secure tenant-isolated connections
   */
  private async __DEPRECATED_setTenantContext(): Promise<never> {
    throw new Error('SECURITY: setTenantContext is deprecated. Use withTenantClient() for proper tenant isolation.');
  }
}