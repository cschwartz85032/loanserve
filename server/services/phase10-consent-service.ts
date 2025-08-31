/**
 * Phase 10 Enhanced Consent Management Service
 * Tracks consent with external provider integration and evidence custody
 */

import { pool } from '../db';
import { phase10AuditService } from './phase10-audit-service';
import { randomUUID } from 'crypto';

export interface ConsentRecord {
  consentId: string;
  tenantId: string;
  subjectUrn: string;
  consentType: string;
  consentVersion: string;
  consentScope?: string[];
  granted: boolean;
  purpose: string[];
  channel: string[];
  evidenceLocator?: string;
  obtainedAt: Date;
  revokedAt?: Date;
  source: string;
  externalReference?: string;
  externalStatus?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  geolocation?: Record<string, any>;
  legalBasis?: string;
  regulatoryFramework?: string[];
  retentionPeriodMonths?: number;
}

export interface CommunicationPreference {
  prefId: string;
  tenantId: string;
  subjectUrn: string;
  channel: string;
  purpose: string;
  subPurpose?: string;
  frequency: string;
  customSchedule?: Record<string, any>;
  contactValueHash?: Buffer;
  isVerified: boolean;
  verifiedAt?: Date;
  isActive: boolean;
  pausedUntil?: Date;
  consentId?: string;
  sourceOfPreference: string;
  lastHonoredAt?: Date;
  violationCount: number;
}

export interface ConsentGrantRequest {
  subjectUrn: string;
  consentType: string;
  consentVersion: string;
  purpose: string[];
  channel: string[];
  evidenceLocator?: string;
  source?: string;
  externalReference?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  geolocation?: Record<string, any>;
  legalBasis?: string;
  regulatoryFramework?: string[];
  metadata?: Record<string, any>;
}

export class Phase10ConsentService {
  private defaultTenantId = '00000000-0000-0000-0000-000000000001';

  /**
   * Grant consent with full audit trail
   */
  async grantConsent(
    request: ConsentGrantRequest,
    tenantId?: string,
    actorId?: string
  ): Promise<string> {
    const client = await pool.connect();
    
    try {
      const effectiveTenantId = tenantId || this.defaultTenantId;
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', effectiveTenantId]);

      const consentId = await client.query(`
        SELECT grant_consent(
          $1::uuid, $2, $3, $4, $5::text[], $6::text[], 
          $7, $8::inet, $9
        ) as consent_id
      `, [
        effectiveTenantId,
        request.subjectUrn,
        request.consentType,
        request.consentVersion,
        request.purpose,
        request.channel,
        request.evidenceLocator,
        request.ipAddress,
        request.userAgent
      ]);

      const resultConsentId = consentId.rows[0].consent_id;

      // Log additional metadata if provided
      if (request.source && request.source !== 'internal') {
        await client.query(`
          UPDATE phase10_consent_record 
          SET source = $1, external_reference = $2, external_status = $3,
              device_fingerprint = $4, geolocation = $5,
              legal_basis = $6, regulatory_framework = $7
          WHERE consent_id = $8::uuid
        `, [
          request.source,
          request.externalReference,
          'granted',
          request.deviceFingerprint,
          request.geolocation ? JSON.stringify(request.geolocation) : null,
          request.legalBasis,
          request.regulatoryFramework,
          resultConsentId
        ]);
      }

      // Log to immutable audit
      await phase10AuditService.logEvent({
        tenantId: effectiveTenantId,
        eventType: 'CONSENT.GRANTED',
        actorId: actorId || request.subjectUrn,
        actorType: actorId ? 'user' : 'subject',
        resourceUrn: `urn:consent:${resultConsentId}`,
        payload: {
          subjectUrn: request.subjectUrn,
          consentType: request.consentType,
          consentVersion: request.consentVersion,
          purpose: request.purpose,
          channel: request.channel,
          source: request.source || 'internal',
          externalReference: request.externalReference,
          legalBasis: request.legalBasis,
          regulatoryFramework: request.regulatoryFramework,
          ...request.metadata
        },
        ipAddress: request.ipAddress,
        userAgent: request.userAgent
      });

      return resultConsentId;
    } catch (error) {
      console.error('[Phase10Consent] Failed to grant consent:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Revoke consent with audit trail
   */
  async revokeConsent(
    consentId: string,
    reason?: string,
    revokedBy?: string,
    ipAddress?: string,
    userAgent?: string,
    tenantId?: string
  ): Promise<boolean> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      await client.query(`
        SELECT revoke_consent($1::uuid, $2::uuid, $3, $4::inet, $5)
      `, [
        consentId,
        revokedBy,
        reason,
        ipAddress,
        userAgent
      ]);

      // Get consent details for audit
      const consentDetails = await client.query(`
        SELECT subject_urn, consent_type, consent_version 
        FROM phase10_consent_record 
        WHERE consent_id = $1::uuid
      `, [consentId]);

      if (consentDetails.rows.length > 0) {
        const consent = consentDetails.rows[0];
        
        // Log to immutable audit
        await phase10AuditService.logEvent({
          tenantId: tenantId || this.defaultTenantId,
          eventType: 'CONSENT.REVOKED',
          actorId: revokedBy || consent.subject_urn,
          actorType: revokedBy ? 'user' : 'subject',
          resourceUrn: `urn:consent:${consentId}`,
          payload: {
            subjectUrn: consent.subject_urn,
            consentType: consent.consent_type,
            consentVersion: consent.consent_version,
            reason,
            revokedBy
          },
          ipAddress,
          userAgent
        });
      }

      return true;
    } catch (error) {
      console.error('[Phase10Consent] Failed to revoke consent:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get consent status for a subject
   */
  async getConsentStatus(
    subjectUrn: string,
    consentType?: string,
    tenantId?: string
  ): Promise<ConsentRecord[]> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      let whereClause = 'WHERE subject_urn = $1';
      const params: any[] = [subjectUrn];
      let paramIndex = 2;

      if (tenantId) {
        whereClause += ` AND tenant_id = $${paramIndex}::uuid`;
        params.push(tenantId);
        paramIndex++;
      }

      if (consentType) {
        whereClause += ` AND consent_type = $${paramIndex}`;
        params.push(consentType);
        paramIndex++;
      }

      const result = await client.query(`
        SELECT 
          consent_id, tenant_id, subject_urn, consent_type, consent_version,
          consent_scope, granted, purpose, channel, evidence_locator,
          obtained_at, revoked_at, source, external_reference, external_status,
          ip_address, user_agent, device_fingerprint, geolocation,
          legal_basis, regulatory_framework, retention_period_months,
          created_at, updated_at
        FROM phase10_consent_record 
        ${whereClause}
        ORDER BY created_at DESC
      `, params);

      return result.rows.map(row => ({
        consentId: row.consent_id,
        tenantId: row.tenant_id,
        subjectUrn: row.subject_urn,
        consentType: row.consent_type,
        consentVersion: row.consent_version,
        consentScope: row.consent_scope,
        granted: row.granted,
        purpose: row.purpose,
        channel: row.channel,
        evidenceLocator: row.evidence_locator,
        obtainedAt: row.obtained_at,
        revokedAt: row.revoked_at,
        source: row.source,
        externalReference: row.external_reference,
        externalStatus: row.external_status,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        deviceFingerprint: row.device_fingerprint,
        geolocation: row.geolocation,
        legalBasis: row.legal_basis,
        regulatoryFramework: row.regulatory_framework,
        retentionPeriodMonths: row.retention_period_months
      }));
    } catch (error) {
      console.error('[Phase10Consent] Failed to get consent status:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Set communication preference
   */
  async setCommunicationPreference(
    preference: Partial<CommunicationPreference> & {
      subjectUrn: string;
      channel: string;
      purpose: string;
      frequency: string;
    },
    tenantId?: string,
    actorId?: string
  ): Promise<string> {
    const client = await pool.connect();
    
    try {
      const effectiveTenantId = tenantId || this.defaultTenantId;
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', effectiveTenantId]);

      const prefId = randomUUID();

      await client.query(`
        INSERT INTO phase10_communication_preference (
          pref_id, tenant_id, subject_urn, channel, purpose, sub_purpose,
          frequency, custom_schedule, contact_value_hash, is_verified,
          verified_at, is_active, consent_id, source_of_preference
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (tenant_id, subject_urn, channel, purpose, sub_purpose)
        DO UPDATE SET
          frequency = EXCLUDED.frequency,
          custom_schedule = EXCLUDED.custom_schedule,
          contact_value_hash = EXCLUDED.contact_value_hash,
          is_verified = EXCLUDED.is_verified,
          verified_at = EXCLUDED.verified_at,
          is_active = EXCLUDED.is_active,
          consent_id = EXCLUDED.consent_id,
          source_of_preference = EXCLUDED.source_of_preference,
          updated_at = now()
        RETURNING pref_id
      `, [
        prefId,
        effectiveTenantId,
        preference.subjectUrn,
        preference.channel,
        preference.purpose,
        preference.subPurpose || null,
        preference.frequency,
        preference.customSchedule ? JSON.stringify(preference.customSchedule) : null,
        preference.contactValueHash || null,
        preference.isVerified || false,
        preference.verifiedAt || null,
        preference.isActive !== false,
        preference.consentId || null,
        preference.sourceOfPreference || 'user'
      ]);

      // Log preference change
      await phase10AuditService.logEvent({
        tenantId: effectiveTenantId,
        eventType: 'COMMUNICATION.PREFERENCE_SET',
        actorId: actorId || preference.subjectUrn,
        actorType: actorId ? 'user' : 'subject',
        resourceUrn: `urn:comm_preference:${prefId}`,
        payload: {
          subjectUrn: preference.subjectUrn,
          channel: preference.channel,
          purpose: preference.purpose,
          subPurpose: preference.subPurpose,
          frequency: preference.frequency,
          customSchedule: preference.customSchedule,
          isActive: preference.isActive,
          sourceOfPreference: preference.sourceOfPreference
        }
      });

      return prefId;
    } catch (error) {
      console.error('[Phase10Consent] Failed to set communication preference:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get communication preferences for a subject
   */
  async getCommunicationPreferences(
    subjectUrn: string,
    channel?: string,
    purpose?: string,
    tenantId?: string
  ): Promise<CommunicationPreference[]> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      let whereClause = 'WHERE subject_urn = $1';
      const params: any[] = [subjectUrn];
      let paramIndex = 2;

      if (tenantId) {
        whereClause += ` AND tenant_id = $${paramIndex}::uuid`;
        params.push(tenantId);
        paramIndex++;
      }

      if (channel) {
        whereClause += ` AND channel = $${paramIndex}`;
        params.push(channel);
        paramIndex++;
      }

      if (purpose) {
        whereClause += ` AND purpose = $${paramIndex}`;
        params.push(purpose);
        paramIndex++;
      }

      const result = await client.query(`
        SELECT 
          pref_id, tenant_id, subject_urn, channel, purpose, sub_purpose,
          frequency, custom_schedule, contact_value_hash, is_verified,
          verified_at, is_active, paused_until, consent_id, 
          consent_obtained_at, source_of_preference, last_honored_at,
          violation_count, created_at, updated_at
        FROM phase10_communication_preference 
        ${whereClause}
        ORDER BY channel, purpose
      `, params);

      return result.rows.map(row => ({
        prefId: row.pref_id,
        tenantId: row.tenant_id,
        subjectUrn: row.subject_urn,
        channel: row.channel,
        purpose: row.purpose,
        subPurpose: row.sub_purpose,
        frequency: row.frequency,
        customSchedule: row.custom_schedule,
        contactValueHash: row.contact_value_hash,
        isVerified: row.is_verified,
        verifiedAt: row.verified_at,
        isActive: row.is_active,
        pausedUntil: row.paused_until,
        consentId: row.consent_id,
        sourceOfPreference: row.source_of_preference,
        lastHonoredAt: row.last_honored_at,
        violationCount: row.violation_count
      }));
    } catch (error) {
      console.error('[Phase10Consent] Failed to get communication preferences:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if communication is allowed for a subject
   */
  async isCommunicationAllowed(
    subjectUrn: string,
    channel: string,
    purpose: string,
    subPurpose?: string,
    tenantId?: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    preferenceId?: string;
    consentId?: string;
  }> {
    try {
      const preferences = await this.getCommunicationPreferences(
        subjectUrn,
        channel,
        purpose,
        tenantId
      );

      // Filter by sub-purpose if provided
      const relevantPrefs = preferences.filter(pref => 
        !subPurpose || !pref.subPurpose || pref.subPurpose === subPurpose
      );

      if (relevantPrefs.length === 0) {
        return { allowed: false, reason: 'No preference found' };
      }

      // Check the most specific preference first
      const pref = relevantPrefs.find(p => p.subPurpose === subPurpose) || relevantPrefs[0];

      if (!pref.isActive) {
        return { 
          allowed: false, 
          reason: 'Preference inactive',
          preferenceId: pref.prefId
        };
      }

      if (pref.pausedUntil && pref.pausedUntil > new Date()) {
        return { 
          allowed: false, 
          reason: 'Communication paused',
          preferenceId: pref.prefId
        };
      }

      if (pref.frequency === 'optout') {
        return { 
          allowed: false, 
          reason: 'User opted out',
          preferenceId: pref.prefId
        };
      }

      // Check consent if linked
      if (pref.consentId) {
        const consents = await this.getConsentStatus(subjectUrn, undefined, tenantId);
        const relevantConsent = consents.find(c => c.consentId === pref.consentId);
        
        if (!relevantConsent || !relevantConsent.granted) {
          return { 
            allowed: false, 
            reason: 'Consent not granted',
            preferenceId: pref.prefId,
            consentId: pref.consentId
          };
        }
      }

      return { 
        allowed: true,
        preferenceId: pref.prefId,
        consentId: pref.consentId
      };
    } catch (error) {
      console.error('[Phase10Consent] Failed to check communication allowance:', error);
      return { allowed: false, reason: 'System error' };
    }
  }

  /**
   * Log communication event
   */
  async logCommunication(
    event: {
      subjectUrn: string;
      channel: string;
      purpose: string;
      subPurpose?: string;
      templateId?: string;
      subjectLine?: string;
      messagePreview?: string;
      recipientAddressHash?: Buffer;
      deliveredAt?: Date;
      openedAt?: Date;
      clickedAt?: Date;
      bouncedAt?: Date;
      bounceReason?: string;
      preferenceId?: string;
      consentId?: string;
      complianceStatus?: string;
      suppressionReason?: string;
      provider?: string;
      providerMessageId?: string;
    },
    tenantId?: string
  ): Promise<string> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      const eventId = randomUUID();
      
      await client.query(`
        INSERT INTO phase10_communication_log (
          event_id, tenant_id, subject_urn, channel, purpose, sub_purpose,
          template_id, subject_line, message_preview, recipient_address_hash,
          delivered_at, opened_at, clicked_at, bounced_at, bounce_reason,
          preference_id, consent_id, compliance_status, suppression_reason,
          provider, provider_message_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )
      `, [
        eventId,
        tenantId || this.defaultTenantId,
        event.subjectUrn,
        event.channel,
        event.purpose,
        event.subPurpose,
        event.templateId,
        event.subjectLine,
        event.messagePreview,
        event.recipientAddressHash,
        event.deliveredAt,
        event.openedAt,
        event.clickedAt,
        event.bouncedAt,
        event.bounceReason,
        event.preferenceId,
        event.consentId,
        event.complianceStatus || 'compliant',
        event.suppressionReason,
        event.provider,
        event.providerMessageId
      ]);

      return eventId;
    } catch (error) {
      console.error('[Phase10Consent] Failed to log communication:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const phase10ConsentService = new Phase10ConsentService();