// src/utils/extractors.ts
import {
  findNoteAmount, findInterestRate, findAmortTermMonths, findFirstPaymentDate, findMaturityDate,
  findLateChargePct, findLateChargeGraceDays, findBorrowerFullName,
  findCD_TotalLoanAmount, findCD_PandI, findCD_EscrowRequired, findCD_TaxEscrowMonthly, findCD_InsEscrowMonthly,
  findHOI_Carrier, findHOI_Policy, findHOI_Effective, findHOI_Expiration,
  findFloodZone, findFloodInsRequired, findUCDP_SSR, findMersMIN,
  findAppraisedValue, findAppraisalDate, findAppraisalFormType,
  findPropertyAddress, findLoanOriginatorName, findPropertyType, findOccupancyType,
  DetHit
} from "./deterministic-regex";
import { getText } from "./storage";

/** Load reflowed OCR text saved at text/{docId}.txt in your S3 layout */
async function getOcrText(docId: string): Promise<string> {
  // NOTE: Your storage layer should save reflowed text at: s3://bucket/.../text/{docId}.txt
  // If your key structure differs, adjust here in one place.
  try {
    return await getText(docId);
  } catch (error) {
    console.warn(`[DeterministicExtractor] Failed to load text for ${docId}:`, error);
    return ""; // fail-safe: no text -> no hits
  }
}

// Map doc types to deterministic functions (ordered by specificity)
const DET_RULES: Record<string, Array<(t: string) => DetHit | null>> = {
  "NOTE": [
    findNoteAmount, findInterestRate, findAmortTermMonths, findFirstPaymentDate, findMaturityDate,
    findLateChargePct, findLateChargeGraceDays, findBorrowerFullName, findMersMIN
  ],
  "CD": [
    findCD_TotalLoanAmount, findCD_PandI, findCD_EscrowRequired, findCD_TaxEscrowMonthly, findCD_InsEscrowMonthly,
    findPropertyAddress
  ],
  "HOI": [
    findHOI_Carrier, findHOI_Policy, findHOI_Effective, findHOI_Expiration
  ],
  "FLOOD": [
    findFloodZone, findFloodInsRequired
  ],
  "APPRAISAL": [
    findAppraisedValue, findAppraisalDate, findAppraisalFormType, findUCDP_SSR,
    findPropertyAddress, findPropertyType
  ],
  "DEED": [
    findMersMIN, findPropertyAddress
  ],
  "LE": [
    findLoanOriginatorName, findPropertyAddress, findPropertyType, findOccupancyType
  ]
};

export interface DeterministicExtractionResult {
  docId: string;
  docType: string;
  extractedFields: DetHit[];
  totalHits: number;
  processingTime: number;
  textLength: number;
}

/**
 * Deterministic extraction from a given docId + docType.
 * Returns unique highest-confidence deterministic values per key.
 */
export async function deterministicExtract(
  docId: string, 
  docType: string
): Promise<DeterministicExtractionResult> {
  const startTime = Date.now();
  
  console.log(`[DeterministicExtractor] Processing ${docType} document: ${docId}`);
  
  const text = await getOcrText(docId);
  const textLength = text.length;
  
  if (!text) {
    console.warn(`[DeterministicExtractor] No text found for ${docId}`);
    return {
      docId,
      docType,
      extractedFields: [],
      totalHits: 0,
      processingTime: Date.now() - startTime,
      textLength: 0
    };
  }

  const rules = DET_RULES[docType.toUpperCase()] || [];
  console.log(`[DeterministicExtractor] Applying ${rules.length} rules for ${docType}`);

  const allHits: DetHit[] = [];
  
  // Apply all rules for this document type
  for (const rule of rules) {
    try {
      const hit = rule(text);
      if (hit && hit.value !== null && hit.value !== undefined) {
        allHits.push(hit);
        console.log(`[DeterministicExtractor] Extracted ${hit.key}: ${hit.value}`);
      }
    } catch (error) {
      console.error(`[DeterministicExtractor] Rule execution failed for ${docType}:`, error);
    }
  }

  // Deduplicate by key (keep first hit per key)
  const uniqueHits = deduplicateByKey(allHits);
  
  const processingTime = Date.now() - startTime;
  
  console.log(`[DeterministicExtractor] Completed ${docType} extraction: ${uniqueHits.length} fields in ${processingTime}ms`);

  return {
    docId,
    docType,
    extractedFields: uniqueHits,
    totalHits: uniqueHits.length,
    processingTime,
    textLength
  };
}

/**
 * Remove duplicate hits by key, keeping the first occurrence
 */
function deduplicateByKey(hits: DetHit[]): DetHit[] {
  const seen = new Set<string>();
  return hits.filter(hit => {
    if (seen.has(hit.key)) {
      return false;
    }
    seen.add(hit.key);
    return true;
  });
}

/**
 * Extract from multiple document types with fallback rules
 */
export async function extractWithFallbacks(
  docId: string, 
  primaryDocType: string,
  fallbackDocTypes: string[] = []
): Promise<DeterministicExtractionResult> {
  // Try primary document type first
  const primaryResult = await deterministicExtract(docId, primaryDocType);
  
  if (primaryResult.totalHits > 0 || fallbackDocTypes.length === 0) {
    return primaryResult;
  }

  // Try fallback document types if primary yielded no results
  console.log(`[DeterministicExtractor] Primary extraction yielded no results, trying fallbacks: ${fallbackDocTypes.join(', ')}`);
  
  for (const fallbackType of fallbackDocTypes) {
    const fallbackResult = await deterministicExtract(docId, fallbackType);
    if (fallbackResult.totalHits > 0) {
      console.log(`[DeterministicExtractor] Fallback ${fallbackType} succeeded with ${fallbackResult.totalHits} hits`);
      return {
        ...fallbackResult,
        docType: `${primaryDocType}_fallback_${fallbackType}`
      };
    }
  }

  // Return primary result even if empty
  return primaryResult;
}

/**
 * Get available extraction rules for a document type
 */
export function getAvailableRules(docType: string): string[] {
  const rules = DET_RULES[docType.toUpperCase()] || [];
  return rules.map(rule => rule.name || 'anonymous');
}

/**
 * Get all supported document types
 */
export function getSupportedDocTypes(): string[] {
  return Object.keys(DET_RULES);
}

/**
 * Validate extraction results against expected schema
 */
export function validateExtractionResult(result: DeterministicExtractionResult): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!result.docId) {
    errors.push('Missing docId');
  }

  if (!result.docType) {
    errors.push('Missing docType');
  }

  if (!Array.isArray(result.extractedFields)) {
    errors.push('extractedFields must be an array');
  }

  if (typeof result.totalHits !== 'number') {
    errors.push('totalHits must be a number');
  }

  if (typeof result.processingTime !== 'number') {
    errors.push('processingTime must be a number');
  }

  // Validate individual hits
  for (let i = 0; i < result.extractedFields.length; i++) {
    const hit = result.extractedFields[i];
    if (!hit.key) {
      errors.push(`Hit ${i} missing key`);
    }
    if (hit.value === undefined) {
      errors.push(`Hit ${i} missing value`);
    }
    if (!hit.evidenceText) {
      errors.push(`Hit ${i} missing evidenceText`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Transform deterministic hits to match the authority matrix data format
 */
export function transformToAuthorityFormat(
  result: DeterministicExtractionResult,
  documentMetadata: {
    docId: string;
    pageNumber: number;
    timestamp: Date;
  }
): Array<{
  key: string;
  value: any;
  source: string;
  docType: string;
  docId: string;
  page: number;
  confidence: number;
  evidence: {
    textHash: string;
    snippet: string;
  };
  extractorVersion: string;
  timestamp: Date;
}> {
  return result.extractedFields.map(hit => ({
    key: hit.key,
    value: hit.value,
    source: 'deterministic',
    docType: result.docType,
    docId: documentMetadata.docId,
    page: documentMetadata.pageNumber,
    confidence: 1.0, // Deterministic extractions have full confidence
    evidence: {
      textHash: '', // Will be filled by caller with actual text hash
      snippet: hit.evidenceText
    },
    extractorVersion: 'deterministic-v1.0',
    timestamp: documentMetadata.timestamp
  }));
}