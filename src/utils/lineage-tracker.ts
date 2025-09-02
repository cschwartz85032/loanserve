/**
 * Lineage Tracker - Explainable value lineage with document provenance
 * Implements "explainable by construction" principle
 */

import { createHash } from 'crypto';
import { phase10AuditService } from '../../server/services/phase10-audit-service';

export interface DocumentReference {
  documentId: string;
  pageNumber?: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  sourceText: string;
  textHash: string;
}

export interface LineageRecord {
  fieldName: string;
  value: any;
  source: 'ai_extraction' | 'ocr' | 'manual_entry' | 'vendor_api' | 'document_parse';
  confidence: number;
  timestamp: Date;
  promptVersion?: string;
  extractorVersion?: string;
  operatorId?: string;
  vendorName?: string;
  documentReference?: DocumentReference;
  derivedFrom?: string[]; // Array of parent lineage IDs
  transformations?: LineageTransformation[];
}

export interface LineageTransformation {
  type: 'normalization' | 'validation' | 'format_conversion' | 'calculation' | 'merge';
  description: string;
  inputValue: any;
  outputValue: any;
  rule: string;
  timestamp: Date;
}

export class LineageTracker {
  private lineageRecords = new Map<string, LineageRecord>();

  /**
   * Create lineage record for extracted value
   */
  async createLineage(record: Omit<LineageRecord, 'timestamp'>): Promise<string> {
    const lineageId = this.generateLineageId(record);
    
    const completeRecord: LineageRecord = {
      ...record,
      timestamp: new Date()
    };

    // Generate text hash if document reference provided
    if (completeRecord.documentReference) {
      completeRecord.documentReference.textHash = this.generateTextHash(
        completeRecord.documentReference.sourceText
      );
    }

    this.lineageRecords.set(lineageId, completeRecord);

    // Log lineage creation for audit
    await this.logLineageEvent('LINEAGE_CREATED', lineageId, completeRecord);

    return lineageId;
  }

  /**
   * Add transformation to existing lineage
   */
  async addTransformation(
    lineageId: string,
    transformation: Omit<LineageTransformation, 'timestamp'>
  ): Promise<void> {
    const record = this.lineageRecords.get(lineageId);
    if (!record) {
      throw new Error(`Lineage record not found: ${lineageId}`);
    }

    const completeTransformation: LineageTransformation = {
      ...transformation,
      timestamp: new Date()
    };

    if (!record.transformations) {
      record.transformations = [];
    }
    record.transformations.push(completeTransformation);

    // Update the record
    this.lineageRecords.set(lineageId, record);

    // Log transformation
    await this.logLineageEvent('LINEAGE_TRANSFORMED', lineageId, {
      transformation: completeTransformation,
      fieldName: record.fieldName
    });
  }

  /**
   * Create derived lineage from parent lineages
   */
  async createDerivedLineage(
    record: Omit<LineageRecord, 'timestamp' | 'derivedFrom'>,
    parentLineageIds: string[]
  ): Promise<string> {
    // Validate parent lineages exist
    for (const parentId of parentLineageIds) {
      if (!this.lineageRecords.has(parentId)) {
        throw new Error(`Parent lineage not found: ${parentId}`);
      }
    }

    const derivedRecord: LineageRecord = {
      ...record,
      timestamp: new Date(),
      derivedFrom: parentLineageIds
    };

    const lineageId = this.generateLineageId(derivedRecord);
    this.lineageRecords.set(lineageId, derivedRecord);

    // Log derived lineage creation
    await this.logLineageEvent('LINEAGE_DERIVED', lineageId, {
      ...derivedRecord,
      parentLineageIds
    });

    return lineageId;
  }

  /**
   * Get complete lineage chain for a value
   */
  getLineageChain(lineageId: string): LineageRecord[] {
    const chain: LineageRecord[] = [];
    const visited = new Set<string>();

    const buildChain = (id: string): void => {
      if (visited.has(id)) {
        return; // Avoid circular references
      }
      visited.add(id);

      const record = this.lineageRecords.get(id);
      if (!record) {
        return;
      }

      chain.push(record);

      // Recursively add parent lineages
      if (record.derivedFrom) {
        for (const parentId of record.derivedFrom) {
          buildChain(parentId);
        }
      }
    };

    buildChain(lineageId);
    return chain;
  }

  /**
   * Verify lineage integrity using text hashes
   */
  verifyLineageIntegrity(lineageId: string): {
    isValid: boolean;
    issues: string[];
    verifiedHashes: number;
    totalHashes: number;
  } {
    const issues: string[] = [];
    let verifiedHashes = 0;
    let totalHashes = 0;

    const record = this.lineageRecords.get(lineageId);
    if (!record) {
      return {
        isValid: false,
        issues: ['Lineage record not found'],
        verifiedHashes: 0,
        totalHashes: 0
      };
    }

    // Verify document reference hash
    if (record.documentReference) {
      totalHashes++;
      const expectedHash = this.generateTextHash(record.documentReference.sourceText);
      if (expectedHash === record.documentReference.textHash) {
        verifiedHashes++;
      } else {
        issues.push(`Document text hash mismatch for ${record.fieldName}`);
      }
    }

    // Verify parent lineages recursively
    if (record.derivedFrom) {
      for (const parentId of record.derivedFrom) {
        const parentVerification = this.verifyLineageIntegrity(parentId);
        totalHashes += parentVerification.totalHashes;
        verifiedHashes += parentVerification.verifiedHashes;
        issues.push(...parentVerification.issues);
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      verifiedHashes,
      totalHashes
    };
  }

  /**
   * Get lineage summary for field
   */
  getLineageSummary(lineageId: string): {
    fieldName: string;
    finalValue: any;
    confidence: number;
    sourceChain: string[];
    documentSources: string[];
    transformationCount: number;
    ageInHours: number;
  } {
    const record = this.lineageRecords.get(lineageId);
    if (!record) {
      throw new Error(`Lineage record not found: ${lineageId}`);
    }

    const chain = this.getLineageChain(lineageId);
    const sourceChain = chain.map(r => r.source);
    const documentSources = chain
      .filter(r => r.documentReference)
      .map(r => r.documentReference!.documentId);

    const totalTransformations = chain.reduce(
      (sum, r) => sum + (r.transformations?.length || 0),
      0
    );

    const ageInHours = (Date.now() - record.timestamp.getTime()) / (1000 * 60 * 60);

    return {
      fieldName: record.fieldName,
      finalValue: record.value,
      confidence: record.confidence,
      sourceChain: [...new Set(sourceChain)], // Deduplicate
      documentSources: [...new Set(documentSources)], // Deduplicate
      transformationCount: totalTransformations,
      ageInHours: Math.round(ageInHours * 100) / 100
    };
  }

  /**
   * Generate lineage explanation for human consumption
   */
  generateExplanation(lineageId: string): string {
    const summary = this.getLineageSummary(lineageId);
    const record = this.lineageRecords.get(lineageId);
    
    if (!record) {
      return 'Lineage record not found';
    }

    let explanation = `Field "${summary.fieldName}" has value "${summary.finalValue}" `;
    explanation += `with ${Math.round(summary.confidence * 100)}% confidence.\n\n`;

    explanation += `Source: ${record.source}`;
    if (record.extractorVersion) {
      explanation += ` (${record.extractorVersion})`;
    }
    if (record.promptVersion) {
      explanation += ` using prompt ${record.promptVersion}`;
    }
    explanation += '\n';

    if (record.documentReference) {
      explanation += `Extracted from document ${record.documentReference.documentId}`;
      if (record.documentReference.pageNumber) {
        explanation += `, page ${record.documentReference.pageNumber}`;
      }
      explanation += '\n';
      explanation += `Source text: "${record.documentReference.sourceText}"\n`;
    }

    if (summary.transformationCount > 0) {
      explanation += `\nApplied ${summary.transformationCount} transformation(s):\n`;
      record.transformations?.forEach((t, index) => {
        explanation += `${index + 1}. ${t.type}: ${t.description} (${t.inputValue} → ${t.outputValue})\n`;
      });
    }

    if (record.derivedFrom && record.derivedFrom.length > 0) {
      explanation += `\nDerived from ${record.derivedFrom.length} parent source(s)\n`;
    }

    explanation += `\nData age: ${summary.ageInHours} hours`;
    
    return explanation;
  }

  /**
   * Generate deterministic lineage ID
   */
  private generateLineageId(record: Omit<LineageRecord, 'timestamp'>): string {
    const keyData = {
      fieldName: record.fieldName,
      value: record.value,
      source: record.source,
      documentId: record.documentReference?.documentId,
      extractorVersion: record.extractorVersion,
      promptVersion: record.promptVersion
    };

    const hash = createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex');

    return `lineage_${hash.substring(0, 16)}_${Date.now()}`;
  }

  /**
   * Generate text hash for tamper detection
   */
  private generateTextHash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Log lineage events for audit
   */
  private async logLineageEvent(
    eventType: string,
    lineageId: string,
    payload: any
  ): Promise<void> {
    try {
      await phase10AuditService.logEvent({
        tenantId: '00000000-0000-0000-0000-000000000001',
        eventType: `AI_PIPELINE.LINEAGE.${eventType}`,
        actorType: 'system',
        resourceUrn: `urn:lineage:${lineageId}`,
        payload: {
          lineageId,
          ...payload
        }
      });
    } catch (error) {
      console.error('[LineageTracker] Failed to log lineage event:', error);
    }
  }

  /**
   * Export lineage data for compliance
   */
  exportLineageData(lineageIds?: string[]): Record<string, LineageRecord> {
    const exportData: Record<string, LineageRecord> = {};
    
    const idsToExport = lineageIds || Array.from(this.lineageRecords.keys());
    
    for (const id of idsToExport) {
      const record = this.lineageRecords.get(id);
      if (record) {
        exportData[id] = record;
      }
    }

    return exportData;
  }

  /**
   * Get lineage statistics
   */
  getStatistics(): {
    totalRecords: number;
    recordsBySource: Record<string, number>;
    averageConfidence: number;
    recordsWithDocuments: number;
    recordsWithTransformations: number;
  } {
    const records = Array.from(this.lineageRecords.values());
    
    const recordsBySource: Record<string, number> = {};
    let totalConfidence = 0;
    let recordsWithDocuments = 0;
    let recordsWithTransformations = 0;

    for (const record of records) {
      recordsBySource[record.source] = (recordsBySource[record.source] || 0) + 1;
      totalConfidence += record.confidence;
      
      if (record.documentReference) {
        recordsWithDocuments++;
      }
      
      if (record.transformations && record.transformations.length > 0) {
        recordsWithTransformations++;
      }
    }

    return {
      totalRecords: records.length,
      recordsBySource,
      averageConfidence: records.length > 0 ? totalConfidence / records.length : 0,
      recordsWithDocuments,
      recordsWithTransformations
    };
  }
}