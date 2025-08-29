/**
 * CRM Email Consumer - Phase 5 Outbox Pattern
 * Consumes crm.email.requested.v1 events and processes email sending
 */

import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { CRMNotificationService } from '../crm/notification-service';
import { complianceAudit, COMPLIANCE_EVENTS } from '../compliance/auditService';
import { logActivity, CRM_CONSTANTS } from '../utils/crm-utils';

interface CRMEmailRequestedEvent {
  loanId: number;
  userId: number;
  resourceId: string;
  templateId: string;
  variables: {
    subject: string;
    content: string;
    cc?: string | null;
    bcc?: string | null;
    from: string;
  };
  recipient: {
    email: string;
    name: string;
  };
  attachments: Array<{
    content: string;
    filename: string;
    type: string;
  }>;
  correlationId: string;
  requestMetadata: {
    ipAddr?: string;
    userAgent?: string;
    recipientCount: number;
    hasAttachments: boolean;
  };
}

export class CRMEmailConsumer {
  private rabbitmq = getEnhancedRabbitMQService();
  private notificationService = new CRMNotificationService();

  /**
   * Start the CRM email consumer
   */
  async start(): Promise<void> {
    console.log('[CRMEmailConsumer] Starting consumer');

    // Create consumer channel with prefetch
    const consumerChannel = await this.rabbitmq.createConsumerChannel('crm-email-consumer', 5);

    // Start consuming messages using the channel directly
    await this.rabbitmq.startConsumer(
      consumerChannel,
      'q.crm.email.v1',
      this.handleEmailRequest.bind(this),
      'crm-email-consumer'
    );

    console.log('[CRMEmailConsumer] Consumer started successfully');
  }

  /**
   * Handle CRM email request event
   */
  private async handleEmailRequest(message: any): Promise<void> {
    const payload = message.content as CRMEmailRequestedEvent;
    
    console.log(`[CRMEmailConsumer] Processing email request for loan ${payload.loanId}, resource ${payload.resourceId}`);

    try {
      // Process email through notification service
      const notificationResult = await this.notificationService.sendNotification({
        type: 'email_notification',
        loanId: payload.loanId,
        recipientEmail: payload.recipient.email,
        recipientName: payload.recipient.name,
        data: payload.variables,
        attachments: payload.attachments
      });

      if (notificationResult.success) {
        // Update CRM activity status (queued → sent)
        await logActivity(payload.loanId, payload.userId, CRM_CONSTANTS.ACTIVITY_TYPES.EMAIL, {
          description: `Email sent to ${payload.recipient.email}`,
          subject: payload.variables.subject,
          to: payload.recipient.email,
          cc: payload.variables.cc,
          bcc: payload.variables.bcc,
          attachmentCount: payload.attachments.length,
          documentId: notificationResult.docId,
          status: 'sent'
        });

        // Update Phase 9 compliance audit (queued → sent)
        await complianceAudit.logEvent({
          eventType: COMPLIANCE_EVENTS.CRM.EMAIL_SENT,
          actorType: 'system',
          actorId: payload.userId,
          resourceType: 'email',
          resourceId: payload.resourceId,
          loanId: payload.loanId,
          description: `Email successfully sent to ${payload.recipient.email}: ${payload.variables.subject}`,
          newValues: {
            ...payload.variables,
            status: 'sent',
            documentId: notificationResult.docId,
            attachmentCount: payload.attachments.length
          },
          metadata: {
            ...payload.requestMetadata,
            correlationId: payload.correlationId,
            loanId: payload.loanId,
            userId: payload.userId,
            documentId: notificationResult.docId
          },
          ipAddr: payload.requestMetadata.ipAddr,
          userAgent: payload.requestMetadata.userAgent
        });

        // Publish success event
        await this.rabbitmq.publish('notifications.topic', 'crm.email.sent.v1', {
          loanId: payload.loanId,
          userId: payload.userId,
          resourceId: payload.resourceId,
          documentId: notificationResult.docId,
          recipient: payload.recipient,
          subject: payload.variables.subject,
          status: 'sent',
          correlationId: payload.correlationId,
          timestamp: new Date().toISOString()
        });

        console.log(`[CRMEmailConsumer] Email sent successfully for resource ${payload.resourceId}`);

      } else {
        throw new Error(notificationResult.error || 'Failed to send email');
      }

    } catch (error: any) {
      console.error(`[CRMEmailConsumer] Error processing email request:`, error);

      // Update CRM activity status (queued → failed)
      await logActivity(payload.loanId, payload.userId, CRM_CONSTANTS.ACTIVITY_TYPES.EMAIL, {
        description: `Email failed to send to ${payload.recipient.email}`,
        subject: payload.variables.subject,
        to: payload.recipient.email,
        cc: payload.variables.cc,
        bcc: payload.variables.bcc,
        attachmentCount: payload.attachments.length,
        status: 'failed',
        error: error.message
      });

      // Log failure to Phase 9 compliance audit
      await complianceAudit.logEvent({
        eventType: COMPLIANCE_EVENTS.CRM.EMAIL_SENT,
        actorType: 'system',
        actorId: payload.userId,
        resourceType: 'email',
        resourceId: payload.resourceId,
        loanId: payload.loanId,
        description: `Email failed to send to ${payload.recipient.email}: ${error.message}`,
        newValues: {
          ...payload.variables,
          status: 'failed',
          error: error.message,
          attachmentCount: payload.attachments.length
        },
        metadata: {
          ...payload.requestMetadata,
          correlationId: payload.correlationId,
          loanId: payload.loanId,
          userId: payload.userId,
          error: error.message
        },
        ipAddr: payload.requestMetadata.ipAddr,
        userAgent: payload.requestMetadata.userAgent
      });

      // Publish failure event
      await this.rabbitmq.publish('notifications.topic', 'crm.email.failed.v1', {
        loanId: payload.loanId,
        userId: payload.userId,
        resourceId: payload.resourceId,
        recipient: payload.recipient,
        subject: payload.variables.subject,
        status: 'failed',
        error: error.message,
        correlationId: payload.correlationId,
        timestamp: new Date().toISOString()
      });

      throw error; // Let RabbitMQ handle retry/DLQ
    }
  }
}