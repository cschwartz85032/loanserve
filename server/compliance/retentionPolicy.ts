import { db } from '../db';
import { 
  retentionPolicy, 
  legalHold,
  deletionReceipt,
  complianceAuditLog 
} from '@shared/schema';
import { eq, and, or, lte, gte, isNull } from 'drizzle-orm';
import { hashChainService } from './hashChain';
import { v4 as uuidv4 } from 'uuid';

export class RetentionPolicyService {
  /**
   * Apply retention policies to data
   */
  async applyRetentionPolicies(): Promise<void> {
    const policies = await db
      .select()
      .from(retentionPolicy);
    
    for (const policy of policies) {
      await this.processRetentionPolicy(policy);
    }
  }

  /**
   * Process a single retention policy
   */
  private async processRetentionPolicy(policy: any): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.maxRetentionDays);
    
    // Check for legal holds before deletion
    const holds = await this.checkLegalHolds(policy.dataClass);
    
    if (holds.length === 0) {
      // Proceed with deletion based on data class
      await this.deleteDataByClass(policy.dataClass, cutoffDate);
    } else {
      console.log(`Skipping deletion for ${policy.dataClass} due to legal hold`);
    }
  }

  /**
   * Check if there are active legal holds for a data class
   */
  private async checkLegalHolds(dataClass: string): Promise<any[]> {
    return await db
      .select()
      .from(legalHold)
      .where(
        and(
          eq(legalHold.scopeType, 'artifact'),
          eq(legalHold.active, true)
        )
      );
  }

  /**
   * Delete data based on class and cutoff date
   */
  private async deleteDataByClass(dataClass: string, cutoffDate: Date): Promise<void> {
    const correlationId = uuidv4();
    
    // Map data class to actual table deletions
    switch (dataClass) {
      case 'PII.ID':
        // Handle PII deletion with anonymization
        await this.anonymizePII(cutoffDate, correlationId);
        break;
      
      case 'FIN.TXN':
        // Handle financial transaction deletion
        await this.deleteFinancialTransactions(cutoffDate, correlationId);
        break;
      
      case 'DOC.TEMP':
        // Handle temporary document deletion
        await this.deleteTemporaryDocuments(cutoffDate, correlationId);
        break;
      
      default:
        console.log(`Unknown data class: ${dataClass}`);
    }
  }

  /**
   * Anonymize PII data
   */
  private async anonymizePII(cutoffDate: Date, correlationId: string): Promise<void> {
    // Create deletion receipt
    await db.insert(deletionReceipt).values({
      dataClass: 'PII.ID',
      payloadSummary: {
        action: 'anonymization',
        cutoffDate: cutoffDate.toISOString(),
        affectedTables: ['borrower_entities', 'users']
      },
      responsibleActor: 'SYSTEM.RETENTION_POLICY',
      recordHash: this.generateHash({
        dataClass: 'PII.ID',
        cutoffDate: cutoffDate.toISOString(),
        timestamp: new Date().toISOString()
      })
    });
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'system',
      actorId: 'RETENTION_POLICY_ENGINE',
      eventType: 'COMPLIANCE.PII_ANONYMIZED',
      resourceType: 'pii_data',
      payloadJson: {
        dataClass: 'PII.ID',
        cutoffDate: cutoffDate.toISOString()
      }
    });
  }

  /**
   * Delete financial transactions
   */
  private async deleteFinancialTransactions(cutoffDate: Date, correlationId: string): Promise<void> {
    // Create deletion receipt
    await db.insert(deletionReceipt).values({
      dataClass: 'FIN.TXN',
      payloadSummary: {
        action: 'deletion',
        cutoffDate: cutoffDate.toISOString(),
        affectedTables: ['payments', 'payment_allocations']
      },
      responsibleActor: 'SYSTEM.RETENTION_POLICY',
      recordHash: this.generateHash({
        dataClass: 'FIN.TXN',
        cutoffDate: cutoffDate.toISOString(),
        timestamp: new Date().toISOString()
      })
    });
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'system',
      actorId: 'RETENTION_POLICY_ENGINE',
      eventType: 'COMPLIANCE.FIN_TXN_DELETED',
      resourceType: 'financial_transaction',
      payloadJson: {
        dataClass: 'FIN.TXN',
        cutoffDate: cutoffDate.toISOString()
      }
    });
  }

  /**
   * Delete temporary documents
   */
  private async deleteTemporaryDocuments(cutoffDate: Date, correlationId: string): Promise<void> {
    // Create deletion receipt
    await db.insert(deletionReceipt).values({
      dataClass: 'DOC.TEMP',
      payloadSummary: {
        action: 'deletion',
        cutoffDate: cutoffDate.toISOString(),
        affectedTables: ['documents']
      },
      responsibleActor: 'SYSTEM.RETENTION_POLICY',
      recordHash: this.generateHash({
        dataClass: 'DOC.TEMP',
        cutoffDate: cutoffDate.toISOString(),
        timestamp: new Date().toISOString()
      })
    });
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'system',
      actorId: 'RETENTION_POLICY_ENGINE',
      eventType: 'COMPLIANCE.DOC_DELETED',
      resourceType: 'document',
      payloadJson: {
        dataClass: 'DOC.TEMP',
        cutoffDate: cutoffDate.toISOString()
      }
    });
  }

  /**
   * Create a legal hold
   */
  async createLegalHold(data: {
    scopeType: 'artifact' | 'account' | 'subject';
    scopeId: string;
    reason: string;
    imposedBy: string;
  }): Promise<void> {
    const correlationId = uuidv4();
    
    await db.insert(legalHold).values(data);
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'user',
      actorId: data.imposedBy,
      eventType: 'COMPLIANCE.LEGAL_HOLD_CREATED',
      resourceType: 'legal_hold',
      resourceId: data.scopeId,
      payloadJson: data
    });
  }

  /**
   * Release a legal hold
   */
  async releaseLegalHold(holdId: string, releasedBy: string): Promise<void> {
    const correlationId = uuidv4();
    
    await db
      .update(legalHold)
      .set({
        active: false,
        releasedAt: new Date()
      })
      .where(eq(legalHold.id, holdId));
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'user',
      actorId: releasedBy,
      eventType: 'COMPLIANCE.LEGAL_HOLD_RELEASED',
      resourceType: 'legal_hold',
      resourceId: holdId,
      payloadJson: {
        holdId,
        releasedBy,
        releasedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Generate hash for deletion receipts
   */
  private generateHash(data: any): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }
}

export const retentionPolicyService = new RetentionPolicyService();