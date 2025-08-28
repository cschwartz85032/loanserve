import { db } from '../db';
import { 
  consentRecord, 
  communicationPreference,
  dataSubjectRequest 
} from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';
import { hashChainService } from './hashChain';
import { v4 as uuidv4 } from 'uuid';

export class ConsentManagementService {
  /**
   * Record user consent
   */
  async recordConsent(data: {
    subjectId: string;
    purpose: string;
    scope: string;
    channel: 'web' | 'email' | 'sms' | 'paper' | 'ivr';
    version: string;
    evidenceUri?: string;
    locale?: string;
  }): Promise<void> {
    const correlationId = uuidv4();
    
    // Check if there's an existing consent for this purpose
    const existing = await db
      .select()
      .from(consentRecord)
      .where(
        and(
          eq(consentRecord.subjectId, data.subjectId),
          eq(consentRecord.purpose, data.purpose)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing consent
      await db
        .update(consentRecord)
        .set({
          status: 'granted',
          scope: data.scope,
          channel: data.channel,
          version: data.version,
          evidenceUri: data.evidenceUri,
          locale: data.locale || 'en-US',
          tsGrantedUtc: new Date(),
          updatedAt: new Date()
        })
        .where(eq(consentRecord.id, existing[0].id));
    } else {
      // Create new consent record
      await db.insert(consentRecord).values({
        subjectId: data.subjectId,
        purpose: data.purpose,
        scope: data.scope,
        status: 'granted',
        channel: data.channel,
        version: data.version,
        evidenceUri: data.evidenceUri,
        locale: data.locale || 'en-US',
        tsGrantedUtc: new Date()
      });
    }
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'user',
      actorId: data.subjectId,
      eventType: 'CONSENT.GRANTED',
      resourceType: 'consent',
      resourceId: data.subjectId,
      payloadJson: {
        purpose: data.purpose,
        scope: data.scope,
        version: data.version
      }
    });
  }

  /**
   * Revoke user consent
   */
  async revokeConsent(subjectId: string, purpose: string): Promise<void> {
    const correlationId = uuidv4();
    
    await db
      .update(consentRecord)
      .set({
        status: 'revoked',
        tsRevokedUtc: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(consentRecord.subjectId, subjectId),
          eq(consentRecord.purpose, purpose)
        )
      );
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'user',
      actorId: subjectId,
      eventType: 'CONSENT.REVOKED',
      resourceType: 'consent',
      resourceId: subjectId,
      payloadJson: {
        purpose,
        revokedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Check if user has given consent for a purpose
   */
  async hasConsent(subjectId: string, purpose: string): Promise<boolean> {
    const consent = await db
      .select()
      .from(consentRecord)
      .where(
        and(
          eq(consentRecord.subjectId, subjectId),
          eq(consentRecord.purpose, purpose),
          eq(consentRecord.status, 'granted')
        )
      )
      .limit(1);
    
    return consent.length > 0;
  }

  /**
   * Get all consents for a subject
   */
  async getSubjectConsents(subjectId: string): Promise<any[]> {
    return await db
      .select()
      .from(consentRecord)
      .where(eq(consentRecord.subjectId, subjectId));
  }

  /**
   * Update communication preferences
   */
  async updateCommunicationPreference(data: {
    subjectId: string;
    channel: 'email' | 'sms' | 'phone' | 'push' | 'mail';
    topic: string;
    allowed: boolean;
    frequency?: 'immediate' | 'daily' | 'weekly' | 'monthly';
    updatedBy: string;
  }): Promise<void> {
    const correlationId = uuidv4();
    
    // Check if preference exists
    const existing = await db
      .select()
      .from(communicationPreference)
      .where(
        and(
          eq(communicationPreference.subjectId, data.subjectId),
          eq(communicationPreference.channel, data.channel),
          eq(communicationPreference.topic, data.topic)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing preference
      await db
        .update(communicationPreference)
        .set({
          allowed: data.allowed,
          frequency: data.frequency,
          lastUpdatedBy: data.updatedBy,
          updatedAt: new Date()
        })
        .where(eq(communicationPreference.id, existing[0].id));
    } else {
      // Create new preference
      await db.insert(communicationPreference).values({
        subjectId: data.subjectId,
        channel: data.channel,
        topic: data.topic,
        allowed: data.allowed,
        frequency: data.frequency,
        lastUpdatedBy: data.updatedBy
      });
    }
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'user',
      actorId: data.updatedBy,
      eventType: 'PREFERENCE.UPDATED',
      resourceType: 'communication_preference',
      resourceId: data.subjectId,
      payloadJson: data
    });
  }

  /**
   * Check if communication is allowed
   */
  async isCommunicationAllowed(
    subjectId: string,
    channel: string,
    topic: string
  ): Promise<boolean> {
    const preference = await db
      .select()
      .from(communicationPreference)
      .where(
        and(
          eq(communicationPreference.subjectId, subjectId),
          eq(communicationPreference.channel, channel),
          eq(communicationPreference.topic, topic)
        )
      )
      .limit(1);
    
    // Default to allowed if no preference set
    return preference.length === 0 || preference[0].allowed;
  }

  /**
   * Create a DSAR (Data Subject Access Request)
   */
  async createDSAR(data: {
    subjectId: string;
    type: 'access' | 'deletion' | 'correction';
    submittedVia: 'portal' | 'email' | 'mail';
    detailsJson?: any;
  }): Promise<string> {
    const correlationId = uuidv4();
    const caseRef = `DSAR-${Date.now()}`;
    
    // Calculate due date (30 days for GDPR compliance)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    
    const result = await db.insert(dataSubjectRequest).values({
      subjectId: data.subjectId,
      type: data.type,
      status: 'received',
      submittedVia: data.submittedVia,
      dueAt: dueDate,
      detailsJson: data.detailsJson,
      caseRef
    }).returning();
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'user',
      actorId: data.subjectId,
      eventType: 'DSAR.CREATED',
      resourceType: 'dsar',
      resourceId: result[0].id,
      payloadJson: {
        type: data.type,
        caseRef,
        dueDate: dueDate.toISOString()
      }
    });
    
    return result[0].id;
  }

  /**
   * Update DSAR status
   */
  async updateDSARStatus(
    dsarId: string,
    status: 'in_progress' | 'completed' | 'rejected',
    updatedBy: string
  ): Promise<void> {
    const correlationId = uuidv4();
    
    const updateData: any = { status };
    if (status === 'completed' || status === 'rejected') {
      updateData.closedAt = new Date();
    }
    
    await db
      .update(dataSubjectRequest)
      .set(updateData)
      .where(eq(dataSubjectRequest.id, dsarId));
    
    // Log to compliance audit
    await hashChainService.createAuditEntry({
      correlationId,
      actorType: 'user',
      actorId: updatedBy,
      eventType: 'DSAR.STATUS_UPDATED',
      resourceType: 'dsar',
      resourceId: dsarId,
      payloadJson: {
        status,
        updatedBy,
        updatedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Get pending DSARs
   */
  async getPendingDSARs(): Promise<any[]> {
    return await db
      .select()
      .from(dataSubjectRequest)
      .where(
        or(
          eq(dataSubjectRequest.status, 'received'),
          eq(dataSubjectRequest.status, 'in_progress')
        )
      );
  }
}

export const consentManagementService = new ConsentManagementService();