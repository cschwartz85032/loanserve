// Do-Not-Ping enforcement system
// Prevents notifications when required data is already available from documents/vendors

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface GuardResult {
  satisfied: boolean;
  evidence?: Record<string, any>;
  missingKeys?: string[];
}

/**
 * Check if required data can be satisfied from existing documents/vendors
 * Implements the Do-Not-Ping policy by checking datapoint sources and confidence
 */
export async function canSatisfyFromDocsOrVendors(
  tenantId: string, 
  loanId: string, 
  keys: string[], 
  minConfidence = Number(process.env.AI_ACCEPT_CONFIDENCE || "0.80")
): Promise<GuardResult> {
  const client = await pool.connect();
  try {
    // Note: tenant isolation handled by application logic
    // await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    
    const result = await client.query(
      `SELECT key, value, confidence, autofilled_from 
       FROM loan_datapoints 
       WHERE loan_id = $1 AND key = ANY($2)`,
      [loanId, keys]
    );

    const dataMap: Record<string, any> = {};
    result.rows.forEach(row => {
      dataMap[row.key] = row;
    });

    const missingKeys: string[] = [];
    const satisfied = keys.every(key => {
      const datapoint = dataMap[key];
      
      if (!datapoint || !datapoint.value) {
        missingKeys.push(key);
        return false;
      }

      // Check if source is acceptable (not AI-only)
      const acceptableSources = ['payload', 'document', 'vendor'];
      const sourceOk = acceptableSources.includes(datapoint.autofilled_from);
      
      // Check confidence threshold
      const confidence = datapoint.confidence ?? 1.0;
      const confidenceOk = confidence >= minConfidence;

      if (!sourceOk || !confidenceOk) {
        missingKeys.push(key);
        return false;
      }

      return true;
    });

    if (satisfied) {
      console.log(`[DoNotPingGuard] All required keys satisfied for loan ${loanId}: ${keys.join(', ')}`);
      return { 
        satisfied: true, 
        evidence: dataMap 
      };
    }

    console.log(`[DoNotPingGuard] Missing required data for loan ${loanId}: ${missingKeys.join(', ')}`);
    
    // TODO: Vendor fallback hook could go here
    // If we can pull data from external services, persist and return satisfied
    
    return { 
      satisfied: false, 
      missingKeys 
    };
  } catch (error: any) {
    console.error(`[DoNotPingGuard] Error checking datapoint availability:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get required keys for specific notification templates
 * Maps template codes to their required datapoints
 */
export function getRequiredKeysForTemplate(templateCode: string): string[] {
  const requiredKeysByTemplate: Record<string, string[]> = {
    // Borrower HOI request - check if we already have insurance info
    'BORR_HOI_REQUEST': [
      'HomeownersInsCarrier',
      'HOIPolicyNumber', 
      'HOIEffectiveDate',
      'HOIExpirationDate'
    ],
    
    // Escrow flood determination - check if we have flood info
    'ESC_ADDENDUM_MISSING_FLOOD': [
      'FloodZone',
      'FloodInsRequired',
      'DeterminationIdentifier'
    ],
    
    // Property value verification - check if we have appraisal
    'BORR_APPRAISAL_REQUEST': [
      'AppraisalDate',
      'AppraisedValue',
      'AppraisalFormType'
    ],
    
    // Income verification - check if we have income docs
    'BORR_INCOME_REQUEST': [
      'BorrowerIncome',
      'IncomeSource',
      'EmploymentStatus'
    ]
  };

  return requiredKeysByTemplate[templateCode] || [];
}

/**
 * Check if notification should be suppressed due to Do-Not-Ping policy
 */
export async function shouldSuppressNotification(
  tenantId: string,
  loanId: string,
  templateCode: string
): Promise<{ suppress: boolean; reason?: string }> {
  const requiredKeys = getRequiredKeysForTemplate(templateCode);
  
  // If template doesn't require data validation, allow notification
  if (requiredKeys.length === 0) {
    return { suppress: false };
  }

  try {
    const result = await canSatisfyFromDocsOrVendors(tenantId, loanId, requiredKeys);
    
    if (result.satisfied) {
      return { 
        suppress: true, 
        reason: `Do-Not-Ping: Required data already available: ${requiredKeys.join(', ')}` 
      };
    }
    
    return { suppress: false };
  } catch (error: any) {
    console.error(`[DoNotPingGuard] Error checking suppression for ${templateCode}:`, error);
    // On error, allow notification to proceed to avoid blocking legitimate communications
    return { suppress: false };
  }
}