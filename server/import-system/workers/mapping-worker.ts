import { ConsumeMessage } from "amqplib";
import { rabbitmqClient } from "../../services/rabbitmq-unified";
import { publishImportMessage, IMPORT_TOPOLOGY } from "../rabbitmq-topology";
import { ValidationResult } from "../validation/validation-service";
import { db } from "../../db";
import { loanCandidates, loanDatapoints, imports } from "../../../shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface MappingMessage {
  importId: string;
  tenantId: string;
  correlationId: string;
  validationResult: ValidationResult;
}

export interface EnrichmentMessage {
  importId: string;
  tenantId: string;
  correlationId: string;
  loanCandidateId: string;
}

export class MappingWorker {
  private consumerTags: string[] = [];

  /**
   * Start all mapping workers
   */
  async start(): Promise<void> {
    console.log('[MappingWorker] Starting mapping workers...');

    try {
      // Start canonical mapping worker
      await this.startCanonicalMappingWorker();
      
      // Start data enrichment worker
      await this.startDataEnrichmentWorker();

      console.log('[MappingWorker] All mapping workers started successfully');
    } catch (error) {
      console.error('[MappingWorker] Failed to start workers:', error);
      throw error;
    }
  }

  /**
   * Stop all mapping workers
   */
  async stop(): Promise<void> {
    console.log('[MappingWorker] Stopping mapping workers...');
    
    for (const tag of this.consumerTags) {
      try {
        await rabbitmqClient.cancelConsumer(tag);
      } catch (error) {
        console.error(`[MappingWorker] Error stopping consumer ${tag}:`, error);
      }
    }
    
    this.consumerTags = [];
    console.log('[MappingWorker] All mapping workers stopped');
  }

  /**
   * Start canonical mapping worker
   */
  private async startCanonicalMappingWorker(): Promise<void> {
    const consumerTag = await rabbitmqClient.consume<MappingMessage>(
      IMPORT_TOPOLOGY.queues.mapCanonical,
      this.handleCanonicalMapping.bind(this),
      {
        prefetch: 5,
        consumerTag: 'canonical-mapping-worker'
      }
    );
    
    this.consumerTags.push(consumerTag);
    console.log('[MappingWorker] Canonical mapping worker started');
  }

  /**
   * Start data enrichment worker
   */
  private async startDataEnrichmentWorker(): Promise<void> {
    const consumerTag = await rabbitmqClient.consume<EnrichmentMessage>(
      IMPORT_TOPOLOGY.queues.enrichData,
      this.handleDataEnrichment.bind(this),
      {
        prefetch: 3,
        consumerTag: 'data-enrichment-worker'
      }
    );
    
    this.consumerTags.push(consumerTag);
    console.log('[MappingWorker] Data enrichment worker started');
  }

  /**
   * Handle canonical mapping processing
   */
  private async handleCanonicalMapping(
    message: MappingMessage,
    raw: ConsumeMessage
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`[MappingWorker] Processing canonical mapping for import ${message.importId}`);

      // Extract mappings from validation result
      const mappings = message.validationResult.mappings || [];
      
      if (mappings.length === 0) {
        console.log(`[MappingWorker] No mappings found for import ${message.importId}, skipping to QC`);
        await this.moveToQC(message);
        return;
      }

      // Group mappings by loan (in case of multiple loans in one file)
      const loanGroups = this.groupMappingsByLoan(mappings);
      
      for (const [loanIndex, loanMappings] of loanGroups.entries()) {
        // Create loan candidate
        const candidateData = this.buildCandidateData(loanMappings);
        
        const loanCandidate = await db.insert(loanCandidates).values({
          tenantId: message.tenantId,
          sourceImportId: message.importId,
          loanNumber: candidateData.loanNumber || `IMPORT-${message.importId}-${loanIndex}`,
          status: "application",
          candidateData
        }).returning();

        // Create individual datapoints with lineage
        const datapoints = loanMappings.map(mapping => ({
          loanCandidateId: loanCandidate[0].id,
          canonicalKey: mapping.canonicalKey,
          value: candidateData[mapping.canonicalKey] || null,
          normalizedValue: mapping.normalizedValue,
          evidenceHash: mapping.evidenceHash,
          confidence: mapping.confidence,
          ingestSource: "payload" as const,
          autofilledFrom: mapping.autofilledFrom,
          sourcePointer: mapping.sourcePointer
        }));

        if (datapoints.length > 0) {
          await db.insert(loanDatapoints).values(datapoints);
        }

        console.log(`[MappingWorker] Created loan candidate ${loanCandidate[0].id} with ${datapoints.length} datapoints`);

        // Send for data enrichment
        await publishImportMessage(
          'enrich.data',
          {
            importId: message.importId,
            tenantId: message.tenantId,
            correlationId: message.correlationId,
            loanCandidateId: loanCandidate[0].id
          },
          'mapping'
        );
      }

      // Update import status
      await db
        .update(imports)
        .set({ status: "mapped" })
        .where(eq(imports.id, message.importId));

      const duration = Date.now() - startTime;
      console.log(`[MappingWorker] Canonical mapping completed in ${duration}ms`);

    } catch (error) {
      console.error(`[MappingWorker] Canonical mapping failed:`, error);
      
      // Send to error queue
      await publishImportMessage(
        'mapping.failed',
        {
          importId: message.importId,
          error: error.message,
          originalMessage: message
        },
        'dlq'
      );
      
      throw error; // This will trigger message nack
    }
  }

  /**
   * Handle data enrichment processing
   */
  private async handleDataEnrichment(
    message: EnrichmentMessage,
    raw: ConsumeMessage
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`[MappingWorker] Processing data enrichment for loan candidate ${message.loanCandidateId}`);

      // Get loan candidate
      const loanCandidate = await db
        .select()
        .from(loanCandidates)
        .where(eq(loanCandidates.id, message.loanCandidateId))
        .limit(1);

      if (!loanCandidate.length) {
        throw new Error(`Loan candidate not found: ${message.loanCandidateId}`);
      }

      const candidate = loanCandidate[0];
      
      // Perform data enrichment
      const enrichedData = await this.enrichLoanData(candidate.candidateData);
      
      // Update candidate with enriched data
      await db
        .update(loanCandidates)
        .set({ 
          candidateData: enrichedData,
          status: "enriched"
        })
        .where(eq(loanCandidates.id, message.loanCandidateId));

      // Create additional datapoints for enriched data
      const enrichmentDatapoints = this.createEnrichmentDatapoints(
        message.loanCandidateId,
        candidate.candidateData,
        enrichedData
      );

      if (enrichmentDatapoints.length > 0) {
        await db.insert(loanDatapoints).values(enrichmentDatapoints);
      }

      console.log(`[MappingWorker] Data enrichment completed for loan candidate ${message.loanCandidateId}`);

      // Move to quality control
      await publishImportMessage(
        'qc.start',
        {
          importId: message.importId,
          tenantId: message.tenantId,
          correlationId: message.correlationId,
          loanCandidateId: message.loanCandidateId
        },
        'qc'
      );

      const duration = Date.now() - startTime;
      console.log(`[MappingWorker] Data enrichment completed in ${duration}ms`);

    } catch (error) {
      console.error(`[MappingWorker] Data enrichment failed:`, error);
      
      // Send to error queue
      await publishImportMessage(
        'enrichment.failed',
        {
          importId: message.importId,
          loanCandidateId: message.loanCandidateId,
          error: error.message,
          originalMessage: message
        },
        'dlq'
      );
      
      throw error; // This will trigger message nack
    }
  }

  /**
   * Group mappings by loan (handles multi-loan files)
   */
  private groupMappingsByLoan(mappings: any[]): Map<number, any[]> {
    const groups = new Map<number, any[]>();
    
    // For now, assume single loan per file (most common case)
    // TODO: Implement proper loan grouping logic for MISMO files with multiple loans
    groups.set(0, mappings);
    
    return groups;
  }

  /**
   * Build candidate data object from mappings
   */
  private buildCandidateData(mappings: any[]): any {
    const candidateData: any = {};
    
    for (const mapping of mappings) {
      // Use dot notation to build nested object structure
      this.setNestedValue(candidateData, mapping.canonicalKey, mapping.normalizedValue);
    }
    
    return candidateData;
  }

  /**
   * Set nested object value using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Enrich loan data with calculated fields and business rules
   */
  private async enrichLoanData(candidateData: any): Promise<any> {
    const enriched = { ...candidateData };
    
    try {
      // Calculate derived fields
      if (enriched.loanTerms?.originalAmount && enriched.collateral?.appraisedValue) {
        const originalAmount = parseFloat(enriched.loanTerms.originalAmount);
        const appraisedValue = parseFloat(enriched.collateral.appraisedValue);
        
        if (!enriched.loanTerms.ltv && originalAmount > 0 && appraisedValue > 0) {
          enriched.loanTerms.ltv = ((originalAmount / appraisedValue) * 100).toFixed(2);
        }
      }

      // Calculate monthly P&I if not provided
      if (enriched.loanTerms?.originalAmount && 
          enriched.loanTerms?.interestRate && 
          enriched.loanTerms?.amortTermMonths &&
          !enriched.loanTerms?.pnIAmount) {
        
        const principal = parseFloat(enriched.loanTerms.originalAmount);
        const rate = parseFloat(enriched.loanTerms.interestRate) / 100 / 12;
        const terms = parseInt(enriched.loanTerms.amortTermMonths);
        
        if (rate > 0 && terms > 0) {
          const payment = principal * (rate * Math.pow(1 + rate, terms)) / (Math.pow(1 + rate, terms) - 1);
          enriched.loanTerms.pnIAmount = payment.toFixed(2);
        }
      }

      // Standardize state codes
      if (enriched.collateral?.address?.state) {
        enriched.collateral.address.state = enriched.collateral.address.state.toUpperCase();
      }

      // Add enrichment metadata
      enriched._enrichment = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        fields: ['ltv', 'pnIAmount', 'stateCode']
      };

    } catch (error) {
      console.error('Error during data enrichment:', error);
      // Continue with original data if enrichment fails
    }
    
    return enriched;
  }

  /**
   * Create datapoints for enriched data
   */
  private createEnrichmentDatapoints(
    loanCandidateId: string,
    originalData: any,
    enrichedData: any
  ): any[] {
    const datapoints = [];
    
    // Find fields that were added or modified during enrichment
    const enrichmentFields = enrichedData._enrichment?.fields || [];
    
    for (const field of enrichmentFields) {
      const value = this.getNestedValue(enrichedData, field);
      const originalValue = this.getNestedValue(originalData, field);
      
      // Only create datapoint if value was enriched (added or changed)
      if (value && value !== originalValue) {
        datapoints.push({
          loanCandidateId,
          canonicalKey: field,
          value: String(value),
          normalizedValue: String(value),
          evidenceHash: crypto.createHash('sha256')
            .update(`enriched:${field}:${value}`)
            .digest('hex'),
          confidence: "0.9", // High confidence for calculated fields
          ingestSource: "enrichment" as const,
          autofilledFrom: "system" as const,
          sourcePointer: `enrichment.${field}`
        });
      }
    }
    
    return datapoints;
  }

  /**
   * Get nested object value using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Move import to quality control stage
   */
  private async moveToQC(message: MappingMessage): Promise<void> {
    await publishImportMessage(
      'qc.start',
      {
        importId: message.importId,
        tenantId: message.tenantId,
        correlationId: message.correlationId
      },
      'qc'
    );
  }
}