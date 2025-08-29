/**
 * Email Artifact Storage Service
 * Stores immutable copies of sent emails for compliance and auditing
 */

import { db } from '../db';
import { emailArtifacts } from '@shared/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { createHash } from 'crypto';
import { ulid } from 'ulid';

export interface EmailArtifactData {
  correlation_id: string;
  loan_id: number;
  user_id: number;
  template_id?: string;
  
  // Email metadata
  subject: string;
  from_address: string;
  to_addresses: string[];
  cc_addresses?: string[];
  bcc_addresses?: string[];
  
  // Content (immutable snapshot)
  html_content?: string;
  text_content?: string;
  variables_used: Record<string, any>;
  
  // Attachments
  attachments?: Array<{
    filename: string;
    content_type: string;
    size_bytes: number;
    content_hash: string; // SHA-256 of attachment content
  }>;
  
  // Sending details
  sent_at: Date;
  provider_message_id?: string;
  delivery_status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';
  delivery_details?: Record<string, any>;
  
  // Classification
  email_category: 'transactional' | 'marketing';
  topic: string;
  
  // Compliance
  dnc_check_passed: boolean;
  dnc_check_details?: Record<string, any>;
}

export class EmailArtifactStorageService {
  
  /**
   * Generate SHA-256 hash of content
   */
  private generateContentHash(content: string): string {
    const hash = createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }

  /**
   * Store email artifact for compliance
   */
  async storeEmailArtifact(data: EmailArtifactData): Promise<string> {
    try {
      // Generate unique artifact ID
      const artifactId = ulid();
      
      // Generate content hashes for integrity verification
      const htmlHash = data.html_content ? this.generateContentHash(data.html_content) : null;
      const textHash = data.text_content ? this.generateContentHash(data.text_content) : null;
      
      // Store in database
      await db.insert(emailArtifacts).values({
        id: artifactId,
        correlationId: data.correlation_id,
        loanId: data.loan_id,
        userId: data.user_id,
        templateId: data.template_id,
        
        // Email metadata
        subject: data.subject,
        fromAddress: data.from_address,
        toAddresses: data.to_addresses,
        ccAddresses: data.cc_addresses || [],
        bccAddresses: data.bcc_addresses || [],
        
        // Content with integrity hashes
        htmlContent: data.html_content,
        textContent: data.text_content,
        htmlContentHash: htmlHash,
        textContentHash: textHash,
        variablesUsed: data.variables_used,
        
        // Attachments
        attachments: data.attachments || [],
        
        // Sending details
        sentAt: data.sent_at,
        providerMessageId: data.provider_message_id,
        deliveryStatus: data.delivery_status,
        deliveryDetails: data.delivery_details || {},
        
        // Classification
        emailCategory: data.email_category,
        topic: data.topic,
        
        // Compliance
        dncCheckPassed: data.dnc_check_passed,
        dncCheckDetails: data.dnc_check_details || {},
        
        // Audit metadata
        createdAt: new Date(),
        retentionExpiresAt: this.calculateRetentionExpiry(data.email_category)
      });

      console.log(`[EmailArtifactStorage] Stored artifact ${artifactId} for correlation ${data.correlation_id}`);
      return artifactId;

    } catch (error) {
      console.error('[EmailArtifactStorage] Failed to store email artifact:', error);
      throw new Error('Failed to store email artifact');
    }
  }

  /**
   * Retrieve email artifact by ID
   */
  async getEmailArtifact(artifactId: string): Promise<any | null> {
    try {
      const [artifact] = await db
        .select()
        .from(emailArtifacts)
        .where(eq(emailArtifacts.id, artifactId))
        .limit(1);

      return artifact || null;

    } catch (error) {
      console.error('[EmailArtifactStorage] Failed to retrieve email artifact:', error);
      throw new Error('Failed to retrieve email artifact');
    }
  }

  /**
   * Retrieve email artifacts by correlation ID
   */
  async getEmailArtifactsByCorrelation(correlationId: string): Promise<any[]> {
    try {
      return await db
        .select()
        .from(emailArtifacts)
        .where(eq(emailArtifacts.correlationId, correlationId));

    } catch (error) {
      console.error('[EmailArtifactStorage] Failed to retrieve email artifacts by correlation:', error);
      throw new Error('Failed to retrieve email artifacts');
    }
  }

  /**
   * Retrieve email artifacts for a loan
   */
  async getEmailArtifactsForLoan(loanId: number, limit: number = 50): Promise<any[]> {
    try {
      return await db
        .select()
        .from(emailArtifacts)
        .where(eq(emailArtifacts.loanId, loanId))
        .orderBy(desc(emailArtifacts.sentAt))
        .limit(limit);

    } catch (error) {
      console.error('[EmailArtifactStorage] Failed to retrieve email artifacts for loan:', error);
      throw new Error('Failed to retrieve email artifacts for loan');
    }
  }

  /**
   * Update delivery status when provider reports back
   */
  async updateDeliveryStatus(
    correlationId: string, 
    status: 'sent' | 'delivered' | 'failed' | 'bounced',
    details?: Record<string, any>,
    providerMessageId?: string
  ): Promise<void> {
    try {
      await db
        .update(emailArtifacts)
        .set({
          deliveryStatus: status,
          deliveryDetails: details || {},
          providerMessageId: providerMessageId,
          updatedAt: new Date()
        })
        .where(eq(emailArtifacts.correlationId, correlationId));

      console.log(`[EmailArtifactStorage] Updated delivery status for ${correlationId}: ${status}`);

    } catch (error) {
      console.error('[EmailArtifactStorage] Failed to update delivery status:', error);
      throw new Error('Failed to update delivery status');
    }
  }

  /**
   * Verify content integrity using stored hashes
   */
  async verifyContentIntegrity(artifactId: string): Promise<boolean> {
    try {
      const artifact = await this.getEmailArtifact(artifactId);
      if (!artifact) {
        return false;
      }

      // Verify HTML content hash if present
      if (artifact.htmlContent && artifact.htmlContentHash) {
        const currentHtmlHash = this.generateContentHash(artifact.htmlContent);
        if (currentHtmlHash !== artifact.htmlContentHash) {
          console.error(`[EmailArtifactStorage] HTML content integrity check failed for ${artifactId}`);
          return false;
        }
      }

      // Verify text content hash if present
      if (artifact.textContent && artifact.textContentHash) {
        const currentTextHash = this.generateContentHash(artifact.textContent);
        if (currentTextHash !== artifact.textContentHash) {
          console.error(`[EmailArtifactStorage] Text content integrity check failed for ${artifactId}`);
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('[EmailArtifactStorage] Failed to verify content integrity:', error);
      return false;
    }
  }

  /**
   * Calculate retention expiry based on email category
   * Transactional emails: 7 years (regulatory requirement)
   * Marketing emails: 3 years
   */
  private calculateRetentionExpiry(category: 'transactional' | 'marketing'): Date {
    const now = new Date();
    const years = category === 'transactional' ? 7 : 3;
    return new Date(now.getFullYear() + years, now.getMonth(), now.getDate());
  }

  /**
   * Search email artifacts with filters
   */
  async searchEmailArtifacts(filters: {
    loanId?: number;
    userId?: number;
    category?: 'transactional' | 'marketing';
    topic?: string;
    startDate?: Date;
    endDate?: Date;
    deliveryStatus?: string;
    limit?: number;
  }): Promise<any[]> {
    try {
      let query = db.select().from(emailArtifacts);

      // Apply filters
      const conditions = [];
      if (filters.loanId) {
        conditions.push(eq(emailArtifacts.loanId, filters.loanId));
      }
      if (filters.userId) {
        conditions.push(eq(emailArtifacts.userId, filters.userId));
      }
      if (filters.category) {
        conditions.push(eq(emailArtifacts.emailCategory, filters.category));
      }
      if (filters.topic) {
        conditions.push(eq(emailArtifacts.topic, filters.topic));
      }
      if (filters.deliveryStatus) {
        conditions.push(eq(emailArtifacts.deliveryStatus, filters.deliveryStatus));
      }
      if (filters.startDate) {
        conditions.push(gte(emailArtifacts.sentAt, filters.startDate));
      }
      if (filters.endDate) {
        conditions.push(lte(emailArtifacts.sentAt, filters.endDate));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      return query
        .orderBy(desc(emailArtifacts.sentAt))
        .limit(filters.limit || 100);

    } catch (error) {
      console.error('[EmailArtifactStorage] Failed to search email artifacts:', error);
      throw new Error('Failed to search email artifacts');
    }
  }
}

// Export singleton instance
export const emailArtifactStorage = new EmailArtifactStorageService();