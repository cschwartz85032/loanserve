import { SelfHealingWorker, WorkItem, WorkResult } from './self-healing-worker';
import { deterministicExtract } from "../utils/extractors";
import { getDocTextSlices } from "../utils/ocr-slices";
import { runPromptPackOnSlices } from "../ai/promptRunner";
import { DOC_KEYSETS } from "../ai/keysets";
import { resolveDataKey } from "../authority/authority-matrix";
import type { DataCandidate } from "../authority/authority-matrix";
import { LineageTracker } from "../utils/lineage-tracker";
import { AIPipelineService } from "../database/ai-pipeline-service";
import { createHash } from 'crypto';

export interface ExtractWorkPayload {
  loanId: string;
  docId: string;
  docType: string;
  tenantId?: string;
  correlationId?: string;
}

export interface ExtractWorkResult {
  loanId: string;
  docId: string;
  docType: string;
  extractedFields: Record<string, any>;
  extractionSummary: {
    deterministicHits: number;
    aiHits: number;
    totalFields: number;
    averageConfidence: number;
    processingTimeMs: number;
  };
  authorityDecisions: Record<string, any>;
  lineageIds: string[];
}

/**
 * Extract Worker - Combines deterministic regex + AI extraction
 * Implements dual extraction strategy with authority matrix conflict resolution
 */
export class ExtractWorker extends SelfHealingWorker<ExtractWorkPayload, ExtractWorkResult> {
  private lineageTracker: LineageTracker;
  private dbService: AIPipelineService;

  constructor() {
    super({
      name: 'extract-worker',
      maxRetries: 3,
      retryDelayMs: 1000,
      retryBackoffMultiplier: 2,
      maxRetryDelayMs: 10000,
      timeoutMs: 120000, // 2 minutes for extraction
      dlqEnabled: true,
      idempotencyEnabled: true
    });

    this.lineageTracker = new LineageTracker();
    this.dbService = new AIPipelineService();
  }

  async executeWork(
    payload: ExtractWorkPayload,
    workItem: WorkItem<ExtractWorkPayload>,
    executionId: string
  ): Promise<WorkResult<ExtractWorkResult>> {
    const startTime = Date.now();
    console.log(`[ExtractWorker] Processing ${payload.docType} document: ${payload.docId}`);

    try {
      // Set tenant context for RLS
      if (payload.tenantId) {
        await this.dbService.setTenantContext(payload.tenantId);
      }

      // Step 1: Run deterministic extraction first
      const deterministicResult = await deterministicExtract(payload.docId, payload.docType);
      console.log(`[ExtractWorker] Deterministic extraction yielded ${deterministicResult.totalHits} fields`);

      // Step 2: Identify missing keys that AI should attempt
      const requiredKeys = DOC_KEYSETS[payload.docType.toUpperCase()] || [];
      const deterministicKeys = deterministicResult.extractedFields.map(hit => hit.key);
      const missingKeys = requiredKeys.filter(key => !deterministicKeys.includes(key));
      
      console.log(`[ExtractWorker] Missing keys for AI extraction: ${missingKeys.join(', ')}`);

      // Step 3: Run AI extraction only if we have missing keys
      let aiItems: any[] = [];
      if (missingKeys.length > 0) {
        const textSlices = await getDocTextSlices(payload.docId);
        
        if (textSlices.length > 0) {
          console.log(`[ExtractWorker] Running AI extraction on ${textSlices.length} text slices`);
          const aiResult = await runPromptPackOnSlices(payload.docType, textSlices);
          
          if (aiResult) {
            // Filter AI results to only missing keys
            aiItems = aiResult.filter(item => missingKeys.includes(item.key));
            console.log(`[ExtractWorker] AI extraction yielded ${aiItems.length} additional fields`);
          }
        } else {
          console.warn(`[ExtractWorker] No text slices available for AI extraction`);
        }
      }

      // Step 4: Convert to authority matrix format
      const allCandidates = await this.convertToAuthorityCandidates(
        deterministicResult,
        aiItems,
        payload
      );

      // Step 5: Group candidates by key and resolve conflicts
      const candidatesByKey: Record<string, DataCandidate[]> = {};
      for (const candidate of allCandidates) {
        if (!candidatesByKey[candidate.key]) {
          candidatesByKey[candidate.key] = [];
        }
        candidatesByKey[candidate.key].push(candidate);
      }

      // Step 6: Authority matrix resolution
      const authorityDecisions: Record<string, any> = {};
      const finalExtractedFields: Record<string, any> = {};

      for (const [key, candidates] of Object.entries(candidatesByKey)) {
        try {
          const decision = resolveDataKey(key, candidates);
          authorityDecisions[key] = decision;
          finalExtractedFields[key] = decision.winningValue;
          
          console.log(`[ExtractWorker] ${key}: ${decision.winningCandidate.source} wins with confidence ${decision.confidence}`);
        } catch (error) {
          console.error(`[ExtractWorker] Failed to resolve key ${key}:`, error);
        }
      }

      // Step 7: Create lineage records for all final values
      const lineageIds = await this.createLineageRecords(
        finalExtractedFields,
        authorityDecisions,
        payload
      );

      // Step 8: Store extraction results in database
      await this.storeExtractionResults(
        payload,
        finalExtractedFields,
        authorityDecisions,
        lineageIds
      );

      // Step 9: Calculate processing statistics
      const extractionSummary = {
        deterministicHits: deterministicResult.totalHits,
        aiHits: aiItems.length,
        totalFields: Object.keys(finalExtractedFields).length,
        averageConfidence: this.calculateAverageConfidence(Object.values(authorityDecisions)),
        processingTimeMs: Date.now() - startTime
      };

      const result: ExtractWorkResult = {
        loanId: payload.loanId,
        docId: payload.docId,
        docType: payload.docType,
        extractedFields: finalExtractedFields,
        extractionSummary,
        authorityDecisions,
        lineageIds
      };

      console.log(`[ExtractWorker] Extraction completed: ${extractionSummary.totalFields} fields in ${extractionSummary.processingTimeMs}ms`);

      return {
        success: true,
        result,
        shouldRetry: false
      };

    } catch (error) {
      console.error(`[ExtractWorker] Extraction failed for ${payload.docId}:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        shouldRetry: this.isRetryableError(error)
      };
    }
  }

  /**
   * Convert deterministic and AI results to authority matrix candidate format
   */
  private async convertToAuthorityCandidates(
    deterministicResult: any,
    aiItems: any[],
    payload: ExtractWorkPayload
  ): Promise<DataCandidate[]> {
    const candidates: DataCandidate[] = [];
    const now = new Date();

    // Convert deterministic results
    for (const hit of deterministicResult.extractedFields) {
      const textHash = createHash('sha256').update(hit.evidenceText).digest('hex');
      
      candidates.push({
        key: hit.key,
        value: hit.value,
        source: 'deterministic',
        docType: payload.docType,
        docId: payload.docId,
        page: 1, // Deterministic doesn't track specific pages
        confidence: 1.0, // Deterministic extractions have full confidence
        evidence: {
          textHash,
          snippet: hit.evidenceText
        },
        extractorVersion: 'deterministic-v1.0',
        timestamp: now
      });
    }

    // Convert AI results
    const rawPromptOutput = (aiItems as any).__rawPromptOutput;
    for (const aiItem of aiItems) {
      // Try to get evidence from the raw prompt output
      const evidence = rawPromptOutput?.evidence?.[aiItem.key];
      const textHash = evidence?.textHash || createHash('sha256').update(String(aiItem.value)).digest('hex');
      
      candidates.push({
        key: aiItem.key,
        value: aiItem.value,
        source: 'ai_doc',
        docType: payload.docType,
        docId: payload.docId,
        page: evidence?.page || 1,
        confidence: aiItem.confidence,
        evidence: {
          textHash,
          snippet: evidence?.snippet || String(aiItem.value)
        },
        extractorVersion: aiItem.prompt_version || 'ai-v1.0',
        timestamp: now
      });
    }

    return candidates;
  }

  /**
   * Create lineage records for all extracted values
   */
  private async createLineageRecords(
    extractedFields: Record<string, any>,
    authorityDecisions: Record<string, any>,
    payload: ExtractWorkPayload
  ): Promise<string[]> {
    const lineageIds: string[] = [];

    for (const [fieldName, value] of Object.entries(extractedFields)) {
      const decision = authorityDecisions[fieldName];
      if (!decision) continue;

      const winningCandidate = decision.winningCandidate;
      
      try {
        const lineageId = await this.lineageTracker.createLineage({
          fieldName,
          value,
          source: winningCandidate.source as any,
          confidence: decision.confidence,
          extractorVersion: winningCandidate.extractorVersion,
          documentReference: {
            documentId: payload.docId,
            sourceText: winningCandidate.evidence.snippet,
            textHash: winningCandidate.evidence.textHash
          }
        });

        lineageIds.push(lineageId);
      } catch (error) {
        console.error(`[ExtractWorker] Failed to create lineage for ${fieldName}:`, error);
      }
    }

    return lineageIds;
  }

  /**
   * Store extraction results in database
   */
  private async storeExtractionResults(
    payload: ExtractWorkPayload,
    extractedFields: Record<string, any>,
    authorityDecisions: Record<string, any>,
    lineageIds: string[]
  ): Promise<void> {
    try {
      // Store in ai_extractions table
      for (const [fieldName, value] of Object.entries(extractedFields)) {
        const decision = authorityDecisions[fieldName];
        
        await this.dbService.storeExtraction({
          loanId: payload.loanId,
          docId: payload.docId,
          fieldName,
          value,
          source: decision.winningCandidate.source,
          confidence: decision.confidence,
          extractorVersion: decision.winningCandidate.extractorVersion,
          evidenceHash: decision.winningCandidate.evidence.textHash,
          authorityDecision: decision.decision
        });
      }

      console.log(`[ExtractWorker] Stored ${Object.keys(extractedFields).length} extractions to database`);
    } catch (error) {
      console.error(`[ExtractWorker] Failed to store extraction results:`, error);
      throw error;
    }
  }

  /**
   * Calculate average confidence from authority decisions
   */
  private calculateAverageConfidence(decisions: any[]): number {
    if (decisions.length === 0) return 0;
    
    const totalConfidence = decisions.reduce((sum, decision) => sum + decision.confidence, 0);
    return Math.round((totalConfidence / decisions.length) * 100) / 100;
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Retryable errors
      if (message.includes('timeout')) return true;
      if (message.includes('network')) return true;
      if (message.includes('connection')) return true;
      if (message.includes('rate limit')) return true;
      if (message.includes('service unavailable')) return true;
      
      // Non-retryable errors
      if (message.includes('validation')) return false;
      if (message.includes('schema')) return false;
      if (message.includes('not found')) return false;
      if (message.includes('permission')) return false;
    }
    
    // Default to retryable for unknown errors
    return true;
  }
}