/**
 * Phase 10 DocuSign Connect Integration
 * First-party evidence custody with webhook processing
 */

import { Request, Response } from 'express';
import { createHash, createHmac } from 'crypto';
import { phase10DocumentService } from '../services/phase10-document-service';
import { phase10AuditService } from '../services/phase10-audit-service';
import { phase10ConsentService } from '../services/phase10-consent-service';

export interface DocuSignEnvelopeEvent {
  envelopeId: string;
  status: string;
  emailSubject: string;
  createdDateTime: string;
  completedDateTime?: string;
  voidedDateTime?: string;
  declinedDateTime?: string;
  recipients: DocuSignRecipient[];
  documents: DocuSignDocument[];
  customFields?: DocuSignCustomField[];
}

export interface DocuSignRecipient {
  recipientId: string;
  recipientType: string;
  email: string;
  name: string;
  status: string;
  signedDateTime?: string;
  deliveredDateTime?: string;
  declinedDateTime?: string;
  declineReason?: string;
  ipAddress?: string;
  userAgent?: string;
  tabs?: DocuSignTab[];
}

export interface DocuSignDocument {
  documentId: string;
  name: string;
  documentBase64?: string;
  documentFields?: DocuSignDocumentField[];
}

export interface DocuSignTab {
  tabType: string;
  tabLabel: string;
  value: string;
  originalValue?: string;
  tabId: string;
}

export interface DocuSignCustomField {
  fieldId: string;
  name: string;
  value: string;
  required?: boolean;
}

export interface DocuSignDocumentField {
  name: string;
  value: string;
  fieldType: string;
}

export class DocuSignConnectService {
  private webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.DOCUSIGN_WEBHOOK_SECRET || '';
  }

  /**
   * Verify DocuSign webhook signature
   */
  private verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string
  ): boolean {
    if (!this.webhookSecret) {
      console.warn('[DocuSignConnect] Webhook secret not configured - skipping signature verification');
      return true; // Allow for development without secret
    }

    try {
      const expectedSignature = createHmac('sha256', this.webhookSecret)
        .update(timestamp + payload)
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      console.error('[DocuSignConnect] Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Process DocuSign Connect webhook
   */
  async processWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-docusign-signature-1'] as string;
      const timestamp = req.headers['x-docusign-timestamp'] as string;
      const payload = JSON.stringify(req.body);

      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature, timestamp)) {
        console.error('[DocuSignConnect] Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const event = this.parseWebhookEvent(req.body);
      
      // Process the event
      await this.processEnvelopeEvent(event, req.security?.tenantId);

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[DocuSignConnect] Webhook processing failed:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Parse DocuSign webhook event
   */
  private parseWebhookEvent(webhookData: any): DocuSignEnvelopeEvent {
    const envelope = webhookData.data?.envelopeId ? webhookData.data : webhookData;
    
    return {
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      emailSubject: envelope.emailSubject,
      createdDateTime: envelope.createdDateTime,
      completedDateTime: envelope.completedDateTime,
      voidedDateTime: envelope.voidedDateTime,
      declinedDateTime: envelope.declinedDateTime,
      recipients: this.parseRecipients(envelope.recipients || []),
      documents: this.parseDocuments(envelope.documents || []),
      customFields: envelope.customFields || []
    };
  }

  /**
   * Parse recipient data
   */
  private parseRecipients(recipients: any[]): DocuSignRecipient[] {
    const allRecipients: DocuSignRecipient[] = [];

    // DocuSign groups recipients by type
    ['signers', 'agents', 'witnesses', 'notaries', 'inPersonSigners'].forEach(type => {
      if (recipients[type]) {
        recipients[type].forEach((recipient: any) => {
          allRecipients.push({
            recipientId: recipient.recipientId,
            recipientType: type,
            email: recipient.email,
            name: recipient.name,
            status: recipient.status,
            signedDateTime: recipient.signedDateTime,
            deliveredDateTime: recipient.deliveredDateTime,
            declinedDateTime: recipient.declinedDateTime,
            declineReason: recipient.declineReason,
            ipAddress: recipient.clientUserId || recipient.ipAddress,
            userAgent: recipient.userAgent,
            tabs: recipient.tabs ? this.parseTabs(recipient.tabs) : []
          });
        });
      }
    });

    return allRecipients;
  }

  /**
   * Parse document data
   */
  private parseDocuments(documents: any[]): DocuSignDocument[] {
    return documents.map(doc => ({
      documentId: doc.documentId,
      name: doc.name,
      documentBase64: doc.documentBase64,
      documentFields: doc.documentFields ? doc.documentFields.map((field: any) => ({
        name: field.name,
        value: field.value,
        fieldType: field.fieldType || 'text'
      })) : []
    }));
  }

  /**
   * Parse tab data
   */
  private parseTabs(tabs: any): DocuSignTab[] {
    const allTabs: DocuSignTab[] = [];

    // Parse different tab types
    Object.keys(tabs).forEach(tabType => {
      if (Array.isArray(tabs[tabType])) {
        tabs[tabType].forEach((tab: any) => {
          allTabs.push({
            tabType,
            tabLabel: tab.tabLabel,
            value: tab.value || '',
            originalValue: tab.originalValue,
            tabId: tab.tabId
          });
        });
      }
    });

    return allTabs;
  }

  /**
   * Process envelope event and store evidence
   */
  private async processEnvelopeEvent(
    event: DocuSignEnvelopeEvent,
    tenantId?: string
  ): Promise<void> {
    try {
      // Extract loan URN from custom fields or email subject
      const loanUrn = this.extractLoanUrn(event);
      if (!loanUrn) {
        console.error('[DocuSignConnect] Cannot determine loan URN for envelope:', event.envelopeId);
        return;
      }

      // Determine document type from subject or custom fields
      const docType = this.extractDocumentType(event);

      switch (event.status) {
        case 'sent':
          await this.handleEnvelopeSent(event, loanUrn, docType, tenantId);
          break;

        case 'delivered':
          await this.handleEnvelopeDelivered(event, loanUrn, tenantId);
          break;

        case 'completed':
          await this.handleEnvelopeCompleted(event, loanUrn, docType, tenantId);
          break;

        case 'declined':
        case 'voided':
          await this.handleEnvelopeDeclinedOrVoided(event, loanUrn, tenantId);
          break;

        default:
          console.log(`[DocuSignConnect] Unhandled envelope status: ${event.status}`);
      }

      // Log the event to immutable audit
      await phase10AuditService.logEvent({
        tenantId: tenantId || '00000000-0000-0000-0000-000000000001',
        eventType: `DOCUSIGN.ENVELOPE_${event.status.toUpperCase()}`,
        actorType: 'system',
        resourceUrn: loanUrn,
        payload: {
          envelopeId: event.envelopeId,
          status: event.status,
          emailSubject: event.emailSubject,
          recipientCount: event.recipients.length,
          documentCount: event.documents.length,
          completedDateTime: event.completedDateTime,
          customFields: event.customFields
        }
      });
    } catch (error) {
      console.error('[DocuSignConnect] Failed to process envelope event:', error);
      throw error;
    }
  }

  /**
   * Handle envelope sent event
   */
  private async handleEnvelopeSent(
    event: DocuSignEnvelopeEvent,
    loanUrn: string,
    docType: string,
    tenantId?: string
  ): Promise<void> {
    // Store document metadata (before completion)
    const docId = await phase10DocumentService.storeDocument({
      tenantId,
      loanUrn,
      docType,
      provider: 'docusign',
      providerRef: event.envelopeId,
      externalStatus: 'sent',
      documentTitle: event.emailSubject,
      signerCount: event.recipients.length,
      signingCompleted: false,
      metadata: {
        envelopeId: event.envelopeId,
        emailSubject: event.emailSubject,
        createdDateTime: event.createdDateTime,
        recipients: event.recipients.map(r => ({
          recipientId: r.recipientId,
          email: r.email,
          name: r.name,
          recipientType: r.recipientType
        }))
      }
    }, 'system');

    // Add signers
    for (const recipient of event.recipients) {
      await phase10DocumentService.addSigner(docId, {
        role: recipient.recipientType,
        status: 'sent',
        signingOrder: parseInt(recipient.recipientId),
        authenticationMethod: 'email'
      }, tenantId, 'system');
    }

    console.log(`[DocuSignConnect] Stored pending document for envelope ${event.envelopeId}`);
  }

  /**
   * Handle envelope delivered event
   */
  private async handleEnvelopeDelivered(
    event: DocuSignEnvelopeEvent,
    loanUrn: string,
    tenantId?: string
  ): Promise<void> {
    // Find existing document by provider reference
    const documents = await phase10DocumentService.getDocumentsByLoan(loanUrn, tenantId);
    const existingDoc = documents.find(d => d.providerRef === event.envelopeId);

    if (existingDoc) {
      // Update signer statuses based on recipient delivery
      for (const recipient of event.recipients) {
        if (recipient.deliveredDateTime) {
          await phase10DocumentService.updateSignerStatus(
            recipient.recipientId,
            'delivered',
            {
              deliveredAt: new Date(recipient.deliveredDateTime)
            },
            tenantId,
            'system'
          );
        }
      }
    }
  }

  /**
   * Handle envelope completed event - store final documents and certificates
   */
  private async handleEnvelopeCompleted(
    event: DocuSignEnvelopeEvent,
    loanUrn: string,
    docType: string,
    tenantId?: string
  ): Promise<void> {
    // Find existing document by provider reference
    const documents = await phase10DocumentService.getDocumentsByLoan(loanUrn, tenantId);
    const existingDoc = documents.find(d => d.providerRef === event.envelopeId);

    if (existingDoc) {
      // Update document status to completed
      // In production, would fetch completed documents and certificate from DocuSign API
      // and upload to object storage
      
      // Update signer statuses
      for (const recipient of event.recipients) {
        if (recipient.signedDateTime) {
          await phase10DocumentService.updateSignerStatus(
            recipient.recipientId,
            'signed',
            {
              signedAt: new Date(recipient.signedDateTime),
              ipAddress: recipient.ipAddress,
              userAgent: recipient.userAgent
            },
            tenantId,
            'system'
          );
        }
      }

      // Process consent if this is a consent-related document
      if (this.isConsentDocument(docType, event)) {
        await this.processConsentFromCompletedEnvelope(event, loanUrn, tenantId);
      }

      console.log(`[DocuSignConnect] Processed completed envelope ${event.envelopeId} for loan ${loanUrn}`);
    } else {
      // Create new document record for completed envelope
      await this.handleEnvelopeSent(event, loanUrn, docType, tenantId);
    }
  }

  /**
   * Handle envelope declined or voided
   */
  private async handleEnvelopeDeclinedOrVoided(
    event: DocuSignEnvelopeEvent,
    loanUrn: string,
    tenantId?: string
  ): Promise<void> {
    // Find existing document
    const documents = await phase10DocumentService.getDocumentsByLoan(loanUrn, tenantId);
    const existingDoc = documents.find(d => d.providerRef === event.envelopeId);

    if (existingDoc) {
      // Update signer statuses
      for (const recipient of event.recipients) {
        if (recipient.declinedDateTime) {
          await phase10DocumentService.updateSignerStatus(
            recipient.recipientId,
            'declined',
            {
              declinedAt: new Date(recipient.declinedDateTime),
              declineReason: recipient.declineReason
            },
            tenantId,
            'system'
          );
        }
      }
    }
  }

  /**
   * Extract loan URN from envelope
   */
  private extractLoanUrn(event: DocuSignEnvelopeEvent): string | null {
    // Look for loan ID in custom fields
    const loanField = event.customFields?.find(
      field => field.name.toLowerCase().includes('loan') || field.name.toLowerCase().includes('id')
    );
    
    if (loanField?.value) {
      return `urn:loan:${loanField.value}`;
    }

    // Try to extract from email subject
    const subjectMatch = event.emailSubject.match(/loan\s*[#:]?\s*(\w+)/i);
    if (subjectMatch?.[1]) {
      return `urn:loan:${subjectMatch[1]}`;
    }

    return null;
  }

  /**
   * Extract document type from envelope
   */
  private extractDocumentType(event: DocuSignEnvelopeEvent): string {
    const subject = event.emailSubject.toLowerCase();
    
    if (subject.includes('disclosure')) return 'disclosure';
    if (subject.includes('agreement')) return 'executed_agreement';
    if (subject.includes('consent')) return 'consent';
    if (subject.includes('modification')) return 'modification';
    if (subject.includes('notice')) return 'notice';
    
    return 'executed_agreement'; // Default
  }

  /**
   * Check if document is consent-related
   */
  private isConsentDocument(docType: string, event: DocuSignEnvelopeEvent): boolean {
    return docType === 'consent' || 
           event.emailSubject.toLowerCase().includes('consent') ||
           event.emailSubject.toLowerCase().includes('privacy') ||
           event.emailSubject.toLowerCase().includes('communication');
  }

  /**
   * Process consent from completed envelope
   */
  private async processConsentFromCompletedEnvelope(
    event: DocuSignEnvelopeEvent,
    loanUrn: string,
    tenantId?: string
  ): Promise<void> {
    try {
      // Extract subject URN (borrower) from recipients
      const primarySigner = event.recipients.find(r => 
        r.recipientType === 'signers' && r.status === 'completed'
      );

      if (!primarySigner) {
        console.warn('[DocuSignConnect] No completed signer found for consent processing');
        return;
      }

      const subjectUrn = `urn:borrower:${primarySigner.email}`;

      // Determine consent details from tabs and custom fields
      const consentType = this.extractConsentType(event);
      const purposes = this.extractConsentPurposes(event);
      const channels = this.extractConsentChannels(event);

      // Grant consent
      await phase10ConsentService.grantConsent({
        subjectUrn,
        consentType,
        consentVersion: '1.0',
        purpose: purposes,
        channel: channels,
        source: 'docusign',
        externalReference: event.envelopeId,
        evidenceLocator: `docusign:envelope:${event.envelopeId}`,
        ipAddress: primarySigner.ipAddress,
        userAgent: primarySigner.userAgent
      }, tenantId, 'system');

      console.log(`[DocuSignConnect] Processed consent from envelope ${event.envelopeId}`);
    } catch (error) {
      console.error('[DocuSignConnect] Failed to process consent from envelope:', error);
    }
  }

  /**
   * Extract consent type from envelope
   */
  private extractConsentType(event: DocuSignEnvelopeEvent): string {
    const subject = event.emailSubject.toLowerCase();
    
    if (subject.includes('privacy')) return 'privacy_notice';
    if (subject.includes('marketing')) return 'marketing';
    if (subject.includes('communication')) return 'communication';
    if (subject.includes('e-sign') || subject.includes('esign')) return 'e-sign';
    
    return 'general_consent';
  }

  /**
   * Extract consent purposes from envelope
   */
  private extractConsentPurposes(event: DocuSignEnvelopeEvent): string[] {
    const purposes: string[] = ['servicing']; // Default
    const subject = event.emailSubject.toLowerCase();
    
    if (subject.includes('marketing')) purposes.push('marketing');
    if (subject.includes('analytics')) purposes.push('analytics');
    
    return purposes;
  }

  /**
   * Extract consent channels from envelope
   */
  private extractConsentChannels(event: DocuSignEnvelopeEvent): string[] {
    // Default to email since DocuSign requires email
    const channels: string[] = ['email'];
    
    // Could extract additional channels from tabs or custom fields
    return channels;
  }
}

export const docuSignConnectService = new DocuSignConnectService();