/**
 * Phase 10 Document Custody Service
 * First-party custody of executed agreements with tamper detection
 */

import { pool } from '../db';
import { phase10AuditService } from './phase10-audit-service';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

export interface DocumentMetadata {
  docId: string;
  tenantId: string;
  loanUrn: string;
  docType: string;
  docCategory?: string;
  provider: string;
  providerRef?: string;
  externalStatus?: string;
  version: number;
  contentHash: string;
  contentLocator: string;
  contentSizeBytes?: number;
  certificateHash?: string;
  certificateLocator?: string;
  evidenceBundleLocator?: string;
  mimeType: string;
  originalFilename?: string;
  documentTitle?: string;
  createdAt: Date;
  executedAt?: Date;
  receivedAt?: Date;
  signerCount: number;
  signingCompleted: boolean;
  metadata: Record<string, any>;
}

export interface DocumentSigner {
  signerId: string;
  docId: string;
  signerNameEncrypted?: Buffer;
  signerEmailEncrypted?: Buffer;
  signerPhoneEncrypted?: Buffer;
  role: string;
  signingOrder?: number;
  status: string;
  sentAt?: Date;
  viewedAt?: Date;
  signedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  authenticationMethod?: string;
  signatureImageLocator?: string;
}

export interface DocumentShare {
  shareId: string;
  docId: string;
  sharedBy: string;
  sharedWith: string;
  shareType: string;
  expiresAt?: Date;
  passwordProtected: boolean;
  downloadLimit?: number;
  currentDownloads: number;
  isActive: boolean;
}

export class Phase10DocumentService {
  private defaultTenantId = '00000000-0000-0000-0000-000000000001';

  /**
   * Store a document with first-party custody
   */
  async storeDocument(
    document: Partial<DocumentMetadata> & {
      contentBuffer?: Buffer;
      certificateBuffer?: Buffer;
    },
    actorId: string
  ): Promise<string> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const tenantId = document.tenantId || this.defaultTenantId;
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);

      const docId = randomUUID();
      const contentHash = document.contentBuffer ? 
        createHash('sha256').update(document.contentBuffer).digest() : null;
      const certificateHash = document.certificateBuffer ? 
        createHash('sha256').update(document.certificateBuffer).digest() : null;

      // In production, would upload to object storage and get URLs
      const contentLocator = `gs://loan-documents/${tenantId}/${docId}/content.pdf`;
      const certificateLocator = document.certificateBuffer ? 
        `gs://loan-documents/${tenantId}/${docId}/certificate.pdf` : null;

      // Insert document record
      await client.query(`
        INSERT INTO phase10_loan_document (
          doc_id, tenant_id, loan_urn, doc_type, doc_category, provider,
          provider_ref, external_status, version, content_hash, content_locator,
          content_size_bytes, certificate_hash, certificate_locator,
          mime_type, original_filename, document_title, executed_at,
          received_at, signer_count, signing_completed, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
      `, [
        docId,
        tenantId,
        document.loanUrn,
        document.docType,
        document.docCategory || null,
        document.provider || 'internal',
        document.providerRef || null,
        document.externalStatus || null,
        document.version || 1,
        contentHash,
        contentLocator,
        document.contentSizeBytes || null,
        certificateHash,
        certificateLocator,
        document.mimeType || 'application/pdf',
        document.originalFilename || null,
        document.documentTitle || null,
        document.executedAt || null,
        document.receivedAt || new Date(),
        document.signerCount || 0,
        document.signingCompleted || false,
        JSON.stringify(document.metadata || {})
      ]);

      // Log document storage event
      await phase10AuditService.logEvent({
        tenantId,
        eventType: 'DOCUMENT.STORED',
        actorId,
        actorType: 'user',
        resourceUrn: `urn:document:${docId}`,
        payload: {
          docId,
          loanUrn: document.loanUrn,
          docType: document.docType,
          provider: document.provider || 'internal',
          providerRef: document.providerRef,
          contentSize: document.contentSizeBytes,
          hasCertificate: !!certificateHash
        }
      });

      await client.query('COMMIT');
      return docId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Phase10Document] Failed to store document:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get document metadata
   */
  async getDocument(docId: string, tenantId?: string): Promise<DocumentMetadata | null> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      const result = await client.query(`
        SELECT 
          doc_id, tenant_id, loan_urn, doc_type, doc_category, provider,
          provider_ref, external_status, version, 
          encode(content_hash, 'hex') as content_hash,
          content_locator, content_size_bytes,
          encode(certificate_hash, 'hex') as certificate_hash,
          certificate_locator, evidence_bundle_locator,
          mime_type, original_filename, document_title,
          created_at, executed_at, received_at, archived_at,
          signer_count, signing_completed, metadata,
          retention_policy, destruction_date
        FROM phase10_loan_document 
        WHERE doc_id = $1::uuid
          AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
      `, [docId, tenantId || null]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        docId: row.doc_id,
        tenantId: row.tenant_id,
        loanUrn: row.loan_urn,
        docType: row.doc_type,
        docCategory: row.doc_category,
        provider: row.provider,
        providerRef: row.provider_ref,
        externalStatus: row.external_status,
        version: row.version,
        contentHash: row.content_hash,
        contentLocator: row.content_locator,
        contentSizeBytes: row.content_size_bytes,
        certificateHash: row.certificate_hash,
        certificateLocator: row.certificate_locator,
        evidenceBundleLocator: row.evidence_bundle_locator,
        mimeType: row.mime_type,
        originalFilename: row.original_filename,
        documentTitle: row.document_title,
        createdAt: row.created_at,
        executedAt: row.executed_at,
        receivedAt: row.received_at,
        signerCount: row.signer_count,
        signingCompleted: row.signing_completed,
        metadata: row.metadata || {}
      };
    } catch (error) {
      console.error('[Phase10Document] Failed to get document:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * List documents for a loan
   */
  async getDocumentsByLoan(
    loanUrn: string, 
    tenantId?: string,
    docType?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<DocumentMetadata[]> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      let whereClause = 'WHERE loan_urn = $1';
      const params: any[] = [loanUrn];
      let paramIndex = 2;

      if (tenantId) {
        whereClause += ` AND tenant_id = $${paramIndex}::uuid`;
        params.push(tenantId);
        paramIndex++;
      }

      if (docType) {
        whereClause += ` AND doc_type = $${paramIndex}`;
        params.push(docType);
        paramIndex++;
      }

      params.push(limit, offset);

      const result = await client.query(`
        SELECT 
          doc_id, tenant_id, loan_urn, doc_type, doc_category, provider,
          provider_ref, external_status, version,
          encode(content_hash, 'hex') as content_hash,
          content_locator, content_size_bytes,
          encode(certificate_hash, 'hex') as certificate_hash,
          certificate_locator, evidence_bundle_locator,
          mime_type, original_filename, document_title,
          created_at, executed_at, received_at,
          signer_count, signing_completed, metadata
        FROM phase10_loan_document 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, params);

      return result.rows.map(row => ({
        docId: row.doc_id,
        tenantId: row.tenant_id,
        loanUrn: row.loan_urn,
        docType: row.doc_type,
        docCategory: row.doc_category,
        provider: row.provider,
        providerRef: row.provider_ref,
        externalStatus: row.external_status,
        version: row.version,
        contentHash: row.content_hash,
        contentLocator: row.content_locator,
        contentSizeBytes: row.content_size_bytes,
        certificateHash: row.certificate_hash,
        certificateLocator: row.certificate_locator,
        evidenceBundleLocator: row.evidence_bundle_locator,
        mimeType: row.mime_type,
        originalFilename: row.original_filename,
        documentTitle: row.document_title,
        createdAt: row.created_at,
        executedAt: row.executed_at,
        receivedAt: row.received_at,
        signerCount: row.signer_count,
        signingCompleted: row.signing_completed,
        metadata: row.metadata || {}
      }));
    } catch (error) {
      console.error('[Phase10Document] Failed to get documents by loan:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add signer to document
   */
  async addSigner(
    docId: string,
    signer: Partial<DocumentSigner>,
    tenantId?: string,
    actorId?: string
  ): Promise<string> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      const signerId = randomUUID();

      await client.query(`
        INSERT INTO phase10_document_signers (
          signer_id, doc_id, tenant_id, signer_name_encrypted,
          signer_email_encrypted, signer_phone_encrypted, role,
          signing_order, status, authentication_method
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
      `, [
        signerId,
        docId,
        tenantId || this.defaultTenantId,
        signer.signerNameEncrypted || null,
        signer.signerEmailEncrypted || null,
        signer.signerPhoneEncrypted || null,
        signer.role || 'signer',
        signer.signingOrder || 1,
        signer.status || 'pending',
        signer.authenticationMethod || 'email'
      ]);

      // Log signer addition
      if (actorId) {
        await phase10AuditService.logEvent({
          tenantId: tenantId || this.defaultTenantId,
          eventType: 'DOCUMENT.SIGNER_ADDED',
          actorId,
          actorType: 'user',
          resourceUrn: `urn:document:${docId}`,
          payload: {
            signerId,
            role: signer.role,
            signingOrder: signer.signingOrder,
            status: signer.status
          }
        });
      }

      return signerId;
    } catch (error) {
      console.error('[Phase10Document] Failed to add signer:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update signer status (e.g., when signed)
   */
  async updateSignerStatus(
    signerId: string,
    status: string,
    metadata: Record<string, any> = {},
    tenantId?: string,
    actorId?: string
  ): Promise<void> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      const updates: string[] = ['status = $2', 'updated_at = now()'];
      const params: any[] = [signerId, status];
      let paramIndex = 3;

      if (status === 'signed') {
        updates.push(`signed_at = $${paramIndex}`);
        params.push(new Date());
        paramIndex++;
      } else if (status === 'viewed') {
        updates.push(`viewed_at = $${paramIndex}`);
        params.push(new Date());
        paramIndex++;
      }

      if (metadata.ipAddress) {
        updates.push(`ip_address = $${paramIndex}::inet`);
        params.push(metadata.ipAddress);
        paramIndex++;
      }

      if (metadata.userAgent) {
        updates.push(`user_agent = $${paramIndex}`);
        params.push(metadata.userAgent);
        paramIndex++;
      }

      await client.query(`
        UPDATE phase10_document_signers 
        SET ${updates.join(', ')}
        WHERE signer_id = $1::uuid
          AND ($${paramIndex}::uuid IS NULL OR tenant_id = $${paramIndex}::uuid)
      `, [...params, tenantId || null]);

      // Log status change
      if (actorId) {
        await phase10AuditService.logEvent({
          tenantId: tenantId || this.defaultTenantId,
          eventType: 'DOCUMENT.SIGNER_STATUS_UPDATED',
          actorId,
          actorType: 'user',
          resourceUrn: `urn:document_signer:${signerId}`,
          payload: {
            signerId,
            newStatus: status,
            metadata
          }
        });
      }
    } catch (error) {
      console.error('[Phase10Document] Failed to update signer status:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify document integrity
   */
  async verifyDocumentIntegrity(docId: string): Promise<{
    valid: boolean;
    contentHashMatch: boolean;
    certificateHashMatch?: boolean;
    message: string;
  }> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM verify_document_integrity($1::uuid)
      `, [docId]);

      if (result.rows.length === 0) {
        return {
          valid: false,
          contentHashMatch: false,
          message: 'Document not found'
        };
      }

      const row = result.rows[0];
      return {
        valid: row.is_valid,
        contentHashMatch: row.content_hash_match,
        certificateHashMatch: row.certificate_hash_match,
        message: row.message
      };
    } catch (error) {
      console.error('[Phase10Document] Failed to verify document integrity:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log document access
   */
  async logDocumentAccess(
    docId: string,
    accessedBy: string,
    accessType: string,
    success: boolean,
    metadata: Record<string, any> = {},
    tenantId?: string
  ): Promise<void> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      await client.query(`
        INSERT INTO phase10_document_access_log (
          doc_id, tenant_id, accessed_by, access_type, access_method,
          ip_address, user_agent, session_id, success, failure_reason
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
      `, [
        docId,
        tenantId || this.defaultTenantId,
        accessedBy,
        accessType,
        metadata.accessMethod || 'api',
        metadata.ipAddress || null,
        metadata.userAgent || null,
        metadata.sessionId || null,
        success,
        metadata.failureReason || null
      ]);

      // Also log to immutable audit
      await phase10AuditService.logEvent({
        tenantId: tenantId || this.defaultTenantId,
        eventType: `DOCUMENT.${accessType.toUpperCase()}`,
        actorId: accessedBy,
        actorType: 'user',
        resourceUrn: `urn:document:${docId}`,
        payload: {
          success,
          accessType,
          ...metadata
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        sessionId: metadata.sessionId
      });
    } catch (error) {
      console.error('[Phase10Document] Failed to log document access:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const phase10DocumentService = new Phase10DocumentService();