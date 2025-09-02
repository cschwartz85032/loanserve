/**
 * Authority Matrix - Deterministic conflict resolution for loan data
 * Implements investor-first, escrow-led principles with explainable decisions
 */

import { createHash } from 'crypto';
import { phase10AuditService } from '../../server/services/phase10-audit-service';

export interface DataSource {
  type: 'ai_extraction' | 'ocr' | 'manual_entry' | 'vendor_api' | 'document_parse' | 'investor_directive' | 'escrow_instruction';
  confidence: number;
  timestamp: Date;
  documentId?: string;
  operatorId?: string;
  vendorName?: string;
  priority: number; // Higher number = higher priority
}

export interface ConflictResolution {
  winner: string;
  reason: string;
  conflictingSources: string[];
  authorityRule: string;
  confidence: number;
}

export interface FieldValue {
  value: any;
  source: DataSource;
  fieldName: string;
  lineage: {
    documentId?: string;
    pageNumber?: number;
    textHash: string;
    timestamp: Date;
  };
}

export class AuthorityMatrix {
  
  /**
   * Authority Hierarchy (highest to lowest priority):
   * 1. Investor Directive (1000) - Investor requirements override everything
   * 2. Escrow Instructions (900) - Escrow-led intake principle
   * 3. Manual Entry by Authorized User (800) - Human oversight
   * 4. Vendor API (700) - Third-party authoritative sources
   * 5. Document Parse (600) - Direct document text
   * 6. AI Extraction (500) - AI interpretation
   * 7. OCR (400) - Raw text extraction
   */
  private static readonly AUTHORITY_HIERARCHY: Record<string, number> = {
    'investor_directive': 1000,
    'escrow_instruction': 900,
    'manual_entry': 800,
    'vendor_api': 700,
    'document_parse': 600,
    'ai_extraction': 500,
    'ocr': 400
  };

  /**
   * Field-specific authority rules
   * Some fields have special handling based on business rules
   */
  private static readonly FIELD_AUTHORITY_RULES: Record<string, Partial<Record<string, number>>> = {
    'loan_amount': {
      'investor_directive': 1000,
      'escrow_instruction': 950, // Escrow controls disbursement amounts
      'manual_entry': 800
    },
    'interest_rate': {
      'investor_directive': 1000,
      'escrow_instruction': 900,
      'manual_entry': 800
    },
    'borrower_name': {
      'manual_entry': 1000, // Names often require human verification
      'document_parse': 800,
      'ai_extraction': 600
    },
    'property_address': {
      'vendor_api': 1000, // Address verification services are authoritative
      'manual_entry': 800,
      'document_parse': 700
    },
    'payment_date': {
      'escrow_instruction': 1000, // Escrow controls payment timing
      'investor_directive': 950,
      'manual_entry': 800
    }
  };

  /**
   * Resolve conflicts between multiple field values using deterministic rules
   */
  static resolveConflict(
    fieldName: string,
    values: FieldValue[],
    tenantId?: string
  ): ConflictResolution {
    if (values.length === 0) {
      throw new Error('Cannot resolve conflict with no values');
    }

    if (values.length === 1) {
      return {
        winner: this.getSourceKey(values[0].source),
        reason: 'Single source, no conflict',
        conflictingSources: [],
        authorityRule: 'no_conflict',
        confidence: values[0].source.confidence
      };
    }

    // Get field-specific rules or fall back to general hierarchy
    const authorityRules = this.FIELD_AUTHORITY_RULES[fieldName] || this.AUTHORITY_HIERARCHY;

    // Sort values by authority priority and confidence
    const sortedValues = values
      .map(value => ({
        ...value,
        effectivePriority: this.calculateEffectivePriority(value, authorityRules, fieldName)
      }))
      .sort((a, b) => {
        // Primary sort: authority priority
        if (a.effectivePriority !== b.effectivePriority) {
          return b.effectivePriority - a.effectivePriority;
        }
        // Secondary sort: confidence
        if (a.source.confidence !== b.source.confidence) {
          return b.source.confidence - a.source.confidence;
        }
        // Tertiary sort: timestamp (newer wins)
        return b.source.timestamp.getTime() - a.source.timestamp.getTime();
      });

    const winner = sortedValues[0];
    const conflictingSources = values
      .filter(v => v !== winner)
      .map(v => this.getSourceKey(v.source));

    const authorityRule = this.getAuthorityRule(fieldName, winner.source.type);

    // Log authority decision for audit trail
    this.logAuthorityDecision(fieldName, winner, values, tenantId);

    return {
      winner: this.getSourceKey(winner.source),
      reason: `Authority hierarchy: ${winner.source.type} (priority: ${winner.effectivePriority}) with confidence ${winner.source.confidence}`,
      conflictingSources,
      authorityRule,
      confidence: winner.source.confidence
    };
  }

  /**
   * Calculate effective priority considering field-specific rules and confidence
   */
  private static calculateEffectivePriority(
    value: FieldValue,
    authorityRules: Record<string, number>,
    fieldName: string
  ): number {
    const basePriority = authorityRules[value.source.type] || 0;
    
    // Apply confidence boost (max 10% increase)
    const confidenceBoost = value.source.confidence * 0.1 * basePriority;
    
    // Apply time decay for older data (max 5% decrease for data older than 30 days)
    const ageInDays = (Date.now() - value.source.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    const timeDecay = Math.min(ageInDays / 30 * 0.05, 0.05) * basePriority;
    
    return basePriority + confidenceBoost - timeDecay;
  }

  /**
   * Get authority rule description for audit
   */
  private static getAuthorityRule(fieldName: string, sourceType: string): string {
    if (this.FIELD_AUTHORITY_RULES[fieldName]) {
      return `field_specific_${fieldName}`;
    }
    return `general_hierarchy_${sourceType}`;
  }

  /**
   * Get standardized source key
   */
  private static getSourceKey(source: DataSource): string {
    const baseKey = `${source.type}_${source.timestamp.getTime()}`;
    if (source.documentId) {
      return `${baseKey}_doc_${source.documentId}`;
    }
    if (source.operatorId) {
      return `${baseKey}_op_${source.operatorId}`;
    }
    if (source.vendorName) {
      return `${baseKey}_vendor_${source.vendorName}`;
    }
    return baseKey;
  }

  /**
   * Log authority decision for audit trail
   */
  private static async logAuthorityDecision(
    fieldName: string,
    winner: FieldValue,
    allValues: FieldValue[],
    tenantId?: string
  ): Promise<void> {
    try {
      await phase10AuditService.logEvent({
        tenantId: tenantId || '00000000-0000-0000-0000-000000000001',
        eventType: 'AI_PIPELINE.AUTHORITY_DECISION',
        actorType: 'system',
        resourceUrn: `urn:field:${fieldName}`,
        payload: {
          fieldName,
          winnerSource: this.getSourceKey(winner.source),
          winnerValue: winner.value,
          winnerConfidence: winner.source.confidence,
          totalSources: allValues.length,
          conflictingSources: allValues
            .filter(v => v !== winner)
            .map(v => ({
              source: this.getSourceKey(v.source),
              value: v.value,
              confidence: v.source.confidence
            })),
          authorityRule: this.getAuthorityRule(fieldName, winner.source.type),
          effectivePriority: this.calculateEffectivePriority(
            winner, 
            this.FIELD_AUTHORITY_RULES[fieldName] || this.AUTHORITY_HIERARCHY,
            fieldName
          )
        }
      });
    } catch (error) {
      console.error('[AuthorityMatrix] Failed to log authority decision:', error);
    }
  }

  /**
   * Validate field value against business rules
   */
  static validateFieldValue(fieldName: string, value: any): {
    isValid: boolean;
    reason?: string;
    suggestedCorrection?: any;
  } {
    // Implement field-specific validation rules
    switch (fieldName) {
      case 'loan_amount':
        if (typeof value !== 'number' || value <= 0) {
          return { isValid: false, reason: 'Loan amount must be a positive number' };
        }
        if (value > 10000000) { // $10M limit
          return { isValid: false, reason: 'Loan amount exceeds maximum limit' };
        }
        break;

      case 'interest_rate':
        if (typeof value !== 'number' || value < 0 || value > 50) {
          return { isValid: false, reason: 'Interest rate must be between 0% and 50%' };
        }
        break;

      case 'borrower_name':
        if (typeof value !== 'string' || value.length < 2) {
          return { isValid: false, reason: 'Borrower name must be at least 2 characters' };
        }
        break;

      case 'property_address':
        if (typeof value !== 'string' || value.length < 10) {
          return { isValid: false, reason: 'Property address must be complete' };
        }
        break;
    }

    return { isValid: true };
  }

  /**
   * Get field authority hierarchy for a specific field
   */
  static getFieldAuthority(fieldName: string): Record<string, number> {
    return this.FIELD_AUTHORITY_RULES[fieldName] || this.AUTHORITY_HIERARCHY;
  }

  /**
   * Calculate trust score for a value based on source and lineage
   */
  static calculateTrustScore(value: FieldValue): number {
    const basePriority = this.AUTHORITY_HIERARCHY[value.source.type] || 0;
    const normalizedPriority = basePriority / 1000; // Normalize to 0-1
    
    // Combine source authority with confidence
    const trustScore = (normalizedPriority * 0.7) + (value.source.confidence * 0.3);
    
    // Apply lineage bonus (complete lineage adds trust)
    let lineageBonus = 0;
    if (value.lineage.documentId && value.lineage.textHash) {
      lineageBonus += 0.05;
    }
    if (value.lineage.pageNumber) {
      lineageBonus += 0.02;
    }
    
    return Math.min(trustScore + lineageBonus, 1.0);
  }
}