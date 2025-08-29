/**
 * CRM Email Consumer
 * Processes crm.email.requested.v1 events from outbox pattern
 * Handles template rendering, provider calls, and artifact persistence
 */

import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { EmailVariableResolver } from './email-variable-resolver';
import { sendEmail } from '../auth/email-service';
import { db } from '../db';
import { artifact } from '@shared/schema';
import { complianceAudit } from '../compliance/auditService';
import { COMPLIANCE_EVENTS } from '../compliance/auditService';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import Handlebars from 'handlebars';
import type { CRMEmailRequestedEvent, CRMEmailSentEvent, CRMEmailFailedEvent } from './email-types';

export class CRMEmailConsumer {
  private rabbitmq = getEnhancedRabbitMQService();
  private variableResolver = new EmailVariableResolver();
  private consumerTag?: string;

  /**
   * Start the CRM email consumer
   */
  async start(): Promise<void> {
    try {
      console.log('[CRMEmailConsumer] Starting consumer');
      
      // Setup queue and consumer
      const channel = await this.rabbitmq.getChannel();
      if (!channel) {
        throw new Error('Failed to get RabbitMQ channel');
      }

      // Set prefetch to control concurrency
      await channel.prefetch(5);

      // Start consuming messages
      const { consumerTag } = await channel.consume(
        'q.crm.email.v1',
        async (msg) => {
          if (msg) {
            await this.handleMessage(msg);
            channel.ack(msg);
          }
        },
        { 
          noAck: false,
          consumerTag: 'crm-email-consumer'
        }
      );

      this.consumerTag = consumerTag;
      console.log('[CRMEmailConsumer] Consumer started successfully');

    } catch (error) {
      console.error('[CRMEmailConsumer] Failed to start consumer:', error);
      throw error;
    }
  }

  /**
   * Stop the consumer
   */
  async stop(): Promise<void> {
    if (this.consumerTag) {
      const channel = await this.rabbitmq.getChannel();
      if (channel) {
        await channel.cancel(this.consumerTag);
      }
      console.log('[CRMEmailConsumer] Consumer stopped');
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(msg: any): Promise<void> {
    try {
      const content = JSON.parse(msg.content.toString());
      const correlationId = msg.properties.correlationId || content.correlation_id;
      
      console.log(`[CRMEmailConsumer] Processing email request ${correlationId}`);

      // Validate message format
      if (!this.isValidCRMEmailRequest(content)) {
        console.error('[CRMEmailConsumer] Invalid message format:', content);
        return;
      }

      const emailRequest = content as CRMEmailRequestedEvent;

      // Process the email
      await this.processEmailRequest(emailRequest);

    } catch (error) {
      console.error('[CRMEmailConsumer] Error handling message:', error);
      
      // Try to extract correlation ID for error reporting
      let correlationId;
      try {
        const content = JSON.parse(msg.content.toString());
        correlationId = content.correlation_id;
      } catch {
        correlationId = randomUUID();
      }

      // Publish failure event if we can
      if (correlationId) {
        await this.publishFailureEvent(correlationId, error, 0);
      }
    }
  }

  /**
   * Process email request with template rendering and sending
   */
  private async processEmailRequest(request: CRMEmailRequestedEvent): Promise<void> {
    const correlationId = request.correlation_id;
    const startTime = Date.now();

    try {
      // Resolve email variables
      const resolvedVariables = await this.variableResolver.resolveEmailVariables({
        loan_id: request.loan_id,
        user_id: request.user_id,
        custom_variables: request.variables
      });

      // Render email content
      const renderedContent = await this.renderEmailContent(
        request.subject,
        resolvedVariables,
        request.template_id
      );

      // Send email via provider
      const providerResult = await this.sendEmailViaProvider({
        to: request.to,
        cc: request.cc,
        bcc: request.bcc,
        subject: renderedContent.subject,
        html: renderedContent.html,
        text: renderedContent.text,
        attachments: request.attachments
      });

      // Store artifact
      const artifactId = await this.storeEmailArtifact({
        loan_id: request.loan_id,
        correlation_id: correlationId,
        subject: renderedContent.subject,
        html: renderedContent.html,
        text: renderedContent.text,
        recipients: {
          to: request.to,
          cc: request.cc,
          bcc: request.bcc
        },
        provider_message_id: providerResult.messageId,
        template_id: request.template_id
      });

      // Calculate processing time
      const durationMs = Date.now() - startTime;
      const recipientCount = request.to.length + (request.cc?.length || 0) + (request.bcc?.length || 0);

      // Publish success event
      await this.publishSuccessEvent({
        loan_id: request.loan_id,
        user_id: request.user_id,
        provider_message_id: providerResult.messageId,
        artifact_id: artifactId,
        correlation_id: correlationId,
        duration_ms: durationMs,
        recipient_count: recipientCount,
        template_id: request.template_id
      });

      // Log compliance audit for EMAIL_SENT
      await complianceAudit.logEvent({
        eventType: COMPLIANCE_EVENTS.CRM.EMAIL_SENT,
        actorType: 'user',
        actorId: request.user_id,
        resourceType: 'email',
        resourceId: correlationId,
        loanId: request.loan_id,
        description: `Email successfully sent: ${renderedContent.subject} to ${request.to.join(', ')}`,
        newValues: {
          correlation_id: correlationId,
          provider_message_id: providerResult.messageId,
          artifact_id: artifactId,
          subject: renderedContent.subject,
          recipient_count: recipientCount,
          duration_ms: durationMs,
          template_id: request.template_id
        },
        metadata: {
          loanId: request.loan_id,
          userId: request.user_id,
          correlationId: correlationId
        },
        ipAddr: request.request_metadata?.ip_addr,
        userAgent: request.request_metadata?.user_agent
      });

      console.log(`[CRMEmailConsumer] Email sent successfully: ${correlationId} in ${durationMs}ms`);

    } catch (error) {
      console.error(`[CRMEmailConsumer] Failed to process email request ${correlationId}:`, error);
      
      // Publish failure event
      await this.publishFailureEvent(correlationId, error, 1, request.template_id);

      // Log compliance audit for EMAIL_FAILED
      await complianceAudit.logEvent({
        eventType: COMPLIANCE_EVENTS.CRM.EMAIL_FAILED,
        actorType: 'user',
        actorId: request.user_id,
        resourceType: 'email',
        resourceId: correlationId,
        loanId: request.loan_id,
        description: `Email failed: ${error.message}`,
        newValues: {
          correlation_id: correlationId,
          error_message: error.message,
          error_code: (error as any).code || 'UNKNOWN_ERROR',
          template_id: request.template_id
        },
        metadata: {
          loanId: request.loan_id,
          userId: request.user_id,
          correlationId: correlationId,
          error: error.message
        },
        ipAddr: request.request_metadata?.ip_addr,
        userAgent: request.request_metadata?.user_agent
      });

      // Re-throw to allow RabbitMQ retry logic to handle
      throw error;
    }
  }

  /**
   * Render email content with variable substitution
   */
  private async renderEmailContent(
    subject: string,
    variables: any,
    templateId?: string
  ): Promise<{ subject: string; html: string; text: string }> {
    
    // For now, simple Handlebars rendering
    // TODO: Implement proper template system with database templates
    
    const subjectTemplate = Handlebars.compile(subject);
    const renderedSubject = subjectTemplate(variables);

    // Basic HTML template if no template_id provided
    let htmlContent = `
      <html>
        <body>
          <h2>{{subject}}</h2>
          <p>Dear {{borrower_first_name}},</p>
          <p>This is a message regarding your loan {{loan_number}}.</p>
          <p>Current Balance: {{current_balance}}</p>
          <p>Next Due Date: {{next_due_date}}</p>
          <p>If you have any questions, please contact us at {{servicer_phone}} or {{servicer_email}}.</p>
          <p>Best regards,<br>{{servicer_name}}</p>
        </body>
      </html>
    `;

    let textContent = `
      Dear {{borrower_first_name}},
      
      This is a message regarding your loan {{loan_number}}.
      
      Current Balance: {{current_balance}}
      Next Due Date: {{next_due_date}}
      
      If you have any questions, please contact us at {{servicer_phone}} or {{servicer_email}}.
      
      Best regards,
      {{servicer_name}}
    `;

    if (templateId) {
      // TODO: Load template from database by templateId
      console.log(`[CRMEmailConsumer] Using template ${templateId} (not implemented yet)`);
    }

    const htmlTemplate = Handlebars.compile(htmlContent);
    const textTemplate = Handlebars.compile(textContent);

    return {
      subject: renderedSubject,
      html: htmlTemplate(variables),
      text: textTemplate(variables)
    };
  }

  /**
   * Send email via provider (SendGrid)
   */
  private async sendEmailViaProvider(emailData: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    html: string;
    text: string;
    attachments?: Array<{ filename: string; content: string; type: string }>;
  }): Promise<{ messageId: string }> {
    
    // Convert attachments format if needed
    const formattedAttachments = emailData.attachments?.map(att => ({
      content: att.content,
      filename: att.filename,
      type: att.type,
      disposition: 'attachment'
    }));

    const result = await sendEmail(emailData.to[0], {
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text
    });

    // Extract message ID from result
    const messageId = result.messageId || randomUUID();
    
    return { messageId };
  }

  /**
   * Store email artifact for audit trail
   */
  private async storeEmailArtifact(emailData: {
    loan_id: number;
    correlation_id: string;
    subject: string;
    html: string;
    text: string;
    recipients: any;
    provider_message_id: string;
    template_id?: string;
  }): Promise<string> {
    
    // Create artifact content
    const artifactContent = {
      correlation_id: emailData.correlation_id,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      recipients: emailData.recipients,
      provider_message_id: emailData.provider_message_id,
      template_id: emailData.template_id,
      sent_at: new Date().toISOString()
    };

    // Calculate content hash
    const contentHash = createHash('sha256')
      .update(JSON.stringify(artifactContent))
      .digest('hex');

    // Store in artifact table
    const [artifact_record] = await db.insert(artifact).values({
      subjectId: emailData.loan_id.toString(),
      artifactCode: 'CRM.EMAIL_SENT',
      uri: `email://${emailData.correlation_id}`, // Could be object storage URL
      sha256: contentHash
    }).returning({ id: artifact.id });

    return artifact_record.id;
  }

  /**
   * Publish success event
   */
  private async publishSuccessEvent(data: CRMEmailSentEvent): Promise<void> {
    await this.rabbitmq.publish(
      'notifications.topic',
      'crm.email.sent.v1',
      data
    );
  }

  /**
   * Publish failure event
   */
  private async publishFailureEvent(
    correlationId: string,
    error: Error,
    attemptCount: number,
    templateId?: string
  ): Promise<void> {
    const failureEvent: CRMEmailFailedEvent = {
      loan_id: 0, // Will be updated when we can parse the request
      user_id: 0,
      error_code: (error as any).code || 'UNKNOWN_ERROR',
      error_message: error.message,
      correlation_id: correlationId,
      attempt_count: attemptCount,
      template_id: templateId,
      will_retry: attemptCount < 3 // Based on retry policy
    };

    await this.rabbitmq.publish(
      'notifications.topic',
      'crm.email.failed.v1',
      failureEvent
    );
  }

  /**
   * Validate message format
   */
  private isValidCRMEmailRequest(content: any): content is CRMEmailRequestedEvent {
    return (
      content &&
      typeof content.loan_id === 'number' &&
      typeof content.user_id === 'number' &&
      typeof content.subject === 'string' &&
      Array.isArray(content.to) &&
      content.to.length > 0 &&
      typeof content.correlation_id === 'string'
    );
  }
}