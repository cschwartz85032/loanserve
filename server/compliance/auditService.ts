import { db } from '../db';
import { complianceAuditLog } from '@shared/schema';
import { createHash } from 'crypto';
import { ulid } from 'ulid';

// Comprehensive Event Taxonomy
export const COMPLIANCE_EVENTS = {
  // Loan Lifecycle Events
  LOAN: {
    CREATED: 'LOAN.CREATED',
    UPDATED: 'LOAN.UPDATED',
    DELETED: 'LOAN.DELETED',
    STATUS_CHANGED: 'LOAN.STATUS_CHANGED',
    TERMS_MODIFIED: 'LOAN.TERMS_MODIFIED',
    BENEFICIARY_UPDATED: 'LOAN.BENEFICIARY_UPDATED',
    ESCROW_UPDATED: 'LOAN.ESCROW_UPDATED',
    INSURANCE_UPDATED: 'LOAN.INSURANCE_UPDATED',
  },

  // Payment Operations
  PAYMENT: {
    RECEIVED: 'PAYMENT.RECEIVED',
    CREATED: 'PAYMENT.CREATED',
    UPDATED: 'PAYMENT.UPDATED',
    POSTED: 'PAYMENT.POSTED',
    REVERSED: 'PAYMENT.REVERSED',
    ALLOCATED: 'PAYMENT.ALLOCATED',
    REJECTED: 'PAYMENT.REJECTED',
    SCHEDULED: 'PAYMENT.SCHEDULED',
    VIEWED: 'PAYMENT.VIEWED',
  },

  // Fee Management
  FEE: {
    TEMPLATE_CREATED: 'FEE.TEMPLATE_CREATED',
    TEMPLATE_UPDATED: 'FEE.TEMPLATE_UPDATED',
    TEMPLATE_DELETED: 'FEE.TEMPLATE_DELETED',
    APPLIED_TO_LOAN: 'FEE.APPLIED_TO_LOAN',
    SCHEDULE_MODIFIED: 'FEE.SCHEDULE_MODIFIED',
    ASSESSED: 'FEE.ASSESSED',
    WAIVED: 'FEE.WAIVED',
  },

  // Borrower Operations
  BORROWER: {
    CREATED: 'BORROWER.CREATED',
    UPDATED: 'BORROWER.UPDATED',
    DELETED: 'BORROWER.DELETED',
    LINKED_TO_LOAN: 'BORROWER.LINKED_TO_LOAN',
    UNLINKED_FROM_LOAN: 'BORROWER.UNLINKED_FROM_LOAN',
  },

  // Property Operations
  PROPERTY: {
    CREATED: 'PROPERTY.CREATED',
    UPDATED: 'PROPERTY.UPDATED',
    DELETED: 'PROPERTY.DELETED',
    VALUATION_UPDATED: 'PROPERTY.VALUATION_UPDATED',
  },

  // Investor Operations
  INVESTOR: {
    CREATED: 'INVESTOR.CREATED',
    UPDATED: 'INVESTOR.UPDATED',
    DELETED: 'INVESTOR.DELETED',
    OWNERSHIP_CHANGED: 'INVESTOR.OWNERSHIP_CHANGED',
    DISTRIBUTION_PROCESSED: 'INVESTOR.DISTRIBUTION_PROCESSED',
  },

  // Escrow Operations
  ESCROW: {
    ACCOUNT_CREATED: 'ESCROW.ACCOUNT_CREATED',
    ACCOUNT_UPDATED: 'ESCROW.ACCOUNT_UPDATED',
    DISBURSEMENT_CREATED: 'ESCROW.DISBURSEMENT_CREATED',
    DISBURSEMENT_UPDATED: 'ESCROW.DISBURSEMENT_UPDATED',
    DISBURSEMENT_DELETED: 'ESCROW.DISBURSEMENT_DELETED',
    DISBURSEMENT_SCHEDULED: 'ESCROW.DISBURSEMENT_SCHEDULED',
    DISBURSEMENT_COMPLETED: 'ESCROW.DISBURSEMENT_COMPLETED',
    DISBURSEMENT_CANCELLED: 'ESCROW.DISBURSEMENT_CANCELLED',
    DISBURSEMENT_HELD: 'ESCROW.DISBURSEMENT_HELD',
    DISBURSEMENT_RELEASED: 'ESCROW.DISBURSEMENT_RELEASED',
    PAYMENT_PROCESSED: 'ESCROW.PAYMENT_PROCESSED',
    PAYMENT_FAILED: 'ESCROW.PAYMENT_FAILED',
    ANALYSIS_PERFORMED: 'ESCROW.ANALYSIS_PERFORMED',
    SHORTAGE_DETECTED: 'ESCROW.SHORTAGE_DETECTED',
    SURPLUS_DETECTED: 'ESCROW.SURPLUS_DETECTED',
    VIEWED: 'ESCROW.VIEWED',
  },

  // Document Management
  DOCUMENT: {
    UPLOADED: 'DOCUMENT.UPLOADED',
    ANALYZED: 'DOCUMENT.ANALYZED',
    DELETED: 'DOCUMENT.DELETED',
    ACCESSED: 'DOCUMENT.ACCESSED',
    MOVED: 'DOCUMENT.MOVED',
    RENAMED: 'DOCUMENT.RENAMED',
    FOLDER_CREATED: 'DOCUMENT.FOLDER_CREATED',
    FOLDER_DELETED: 'DOCUMENT.FOLDER_DELETED',
  },

  // CRM Activities
  CRM: {
    NOTE_ADDED: 'CRM.NOTE_ADDED',
    NOTE_UPDATED: 'CRM.NOTE_UPDATED',
    NOTE_DELETED: 'CRM.NOTE_DELETED',
    TASK_CREATED: 'CRM.TASK_CREATED',
    TASK_UPDATED: 'CRM.TASK_UPDATED',
    TASK_COMPLETED: 'CRM.TASK_COMPLETED',
    CONTACT_UPDATED: 'CRM.CONTACT_UPDATED',
    COMMUNICATION_SENT: 'CRM.COMMUNICATION_SENT',
    APPOINTMENT_SCHEDULED: 'CRM.APPOINTMENT_SCHEDULED',
    CALL_LOGGED: 'CRM.CALL_LOGGED',
    EMAIL_REQUESTED: 'CRM.EMAIL_REQUESTED',
    EMAIL_SENT: 'CRM.EMAIL_SENT',
    EMAIL_FAILED: 'CRM.EMAIL_FAILED',
    SMS_SENT: 'CRM.SMS_SENT',
    TEXT_SENT: 'CRM.TEXT_SENT',
    COLLABORATOR_ADDED: 'CRM.COLLABORATOR_ADDED',
    DEAL_CREATED: 'CRM.DEAL_CREATED',
  },

  // User & Authentication
  AUTH: {
    LOGIN: 'AUTH.LOGIN',
    LOGOUT: 'AUTH.LOGOUT',
    PASSWORD_CHANGED: 'AUTH.PASSWORD_CHANGED',
    ROLE_ASSIGNED: 'AUTH.ROLE_ASSIGNED',
    PERMISSION_GRANTED: 'AUTH.PERMISSION_GRANTED',
    ACCOUNT_LOCKED: 'AUTH.ACCOUNT_LOCKED',
    ACCOUNT_UNLOCKED: 'AUTH.ACCOUNT_UNLOCKED',
    SESSION_REVOKED: 'AUTH.SESSION_REVOKED',
  },

  // System Operations
  SYSTEM: {
    BATCH_IMPORT: 'SYSTEM.BATCH_IMPORT',
    BATCH_UPDATE: 'SYSTEM.BATCH_UPDATE',
    REPORT_GENERATED: 'SYSTEM.REPORT_GENERATED',
    DATA_EXPORT: 'SYSTEM.DATA_EXPORT',
    CONFIGURATION_CHANGED: 'SYSTEM.CONFIGURATION_CHANGED',
    SCHEDULED_JOB_RUN: 'SYSTEM.SCHEDULED_JOB_RUN',
    INTEGRATION_SYNC: 'SYSTEM.INTEGRATION_SYNC',
  },

  // Compliance Operations
  COMPLIANCE: {
    AUDIT_ACCESSED: 'COMPLIANCE.AUDIT_ACCESSED',
    RETENTION_APPLIED: 'COMPLIANCE.RETENTION_APPLIED',
    LEGAL_HOLD_CREATED: 'COMPLIANCE.LEGAL_HOLD_CREATED',
    LEGAL_HOLD_RELEASED: 'COMPLIANCE.LEGAL_HOLD_RELEASED',
    DATA_ANONYMIZED: 'COMPLIANCE.DATA_ANONYMIZED',
    DATA_DELETED: 'COMPLIANCE.DATA_DELETED',
    CONSENT_RECORDED: 'COMPLIANCE.CONSENT_RECORDED',
    CONSENT_WITHDRAWN: 'COMPLIANCE.CONSENT_WITHDRAWN',
  }
} as const;

export interface AuditEventData {
  correlationId?: string;
  actorType: 'user' | 'system' | 'integration';
  actorId?: string | number;
  eventType: string;
  resourceType: string;
  resourceId?: string | number;
  loanId?: number;
  previousValues?: any;
  newValues?: any;
  changedFields?: string[];
  description?: string;
  metadata?: Record<string, any>;
  ipAddr?: string;
  userAgent?: string;
  sessionId?: string;
}

class ComplianceAuditService {
  /**
   * Generate SHA-256 hash
   */
  private generateHash(data: any): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  /**
   * Get the previous hash for chain continuity
   */
  private async getPreviousHash(): Promise<string | null> {
    const lastEntry = await db
      .select({ recordHash: complianceAuditLog.recordHash })
      .from(complianceAuditLog)
      .orderBy(complianceAuditLog.createdAt)
      .limit(1);
    
    return lastEntry.length > 0 ? lastEntry[0].recordHash : null;
  }

  /**
   * Generate correlation ID if not provided
   */
  private generateCorrelationId(): string {
    return ulid();
  }

  /**
   * Extract changed fields between two objects
   */
  private getChangedFields(previousValues: any, newValues: any): string[] {
    if (!previousValues || !newValues) return [];
    
    const changedFields: string[] = [];
    const allKeys = new Set([
      ...Object.keys(previousValues || {}),
      ...Object.keys(newValues || {})
    ]);

    for (const key of allKeys) {
      if (JSON.stringify(previousValues[key]) !== JSON.stringify(newValues[key])) {
        changedFields.push(key);
      }
    }

    return changedFields;
  }

  /**
   * Log an audit event with Phase 9 compliance features
   */
  async logEvent(data: AuditEventData): Promise<void> {
    try {
      // Generate correlation ID if not provided
      const correlationId = data.correlationId || this.generateCorrelationId();

      // Auto-detect changed fields if not provided
      const changedFields = data.changedFields || 
        this.getChangedFields(data.previousValues, data.newValues);

      // Build payload
      const payloadJson = {
        previousValues: data.previousValues,
        newValues: data.newValues,
        changedFields,
        description: data.description,
        metadata: data.metadata || {},
        timestamp: new Date().toISOString()
      };

      // Generate payload hash
      const payloadHash = this.generateHash(payloadJson);

      // Get previous hash for chain
      const prevHash = await this.getPreviousHash();

      // Build record data for hashing
      const recordData = {
        correlationId,
        actorType: data.actorType,
        actorId: String(data.actorId || ''),
        eventType: data.eventType,
        resourceType: data.resourceType,
        resourceId: String(data.resourceId || ''),
        payloadHash,
        prevHash,
        timestamp: new Date().toISOString()
      };

      // Generate record hash
      const recordHash = this.generateHash(recordData);

      // Insert audit log entry
      await db.insert(complianceAuditLog).values({
        correlationId,
        accountId: data.sessionId || null,
        actorType: data.actorType,
        actorId: String(data.actorId || ''),
        eventType: data.eventType,
        eventTsUtc: new Date(),
        resourceType: data.resourceType,
        resourceId: String(data.resourceId || ''),
        loanId: data.loanId || null,  // Include loan ID for loan-related events
        payloadHash,
        payloadJson,
        prevHash,
        recordHash,
        ipAddr: data.ipAddr,
        userAgent: data.userAgent,
        geo: null
      });

    } catch (error) {
      console.error('[ComplianceAudit] Failed to log event:', error);
      // Don't throw - audit failures shouldn't break operations
      // In production, this would alert monitoring systems
    }
  }

  /**
   * Simplified method for common audit scenarios
   */
  async logChange(
    eventType: string,
    resourceType: string,
    resourceId: string | number,
    previousValues: any,
    newValues: any,
    userId?: string | number,
    req?: any
  ): Promise<void> {
    await this.logEvent({
      actorType: userId ? 'user' : 'system',
      actorId: userId,
      eventType,
      resourceType,
      resourceId,
      previousValues,
      newValues,
      ipAddr: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      sessionId: req?.sessionID
    });
  }

  /**
   * Log a simple action without value changes
   */
  async logAction(
    eventType: string,
    resourceType: string,
    resourceId: string | number,
    description: string,
    userId?: string | number,
    req?: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      actorType: userId ? 'user' : 'system',
      actorId: userId,
      eventType,
      resourceType,
      resourceId,
      description,
      metadata,
      ipAddr: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      sessionId: req?.sessionID
    });
  }

  /**
   * Log system events
   */
  async logSystemEvent(
    eventType: string,
    description: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      actorType: 'system',
      eventType,
      resourceType: 'system',
      description,
      metadata
    });
  }
}

// Export singleton instance
export const complianceAudit = new ComplianceAuditService();