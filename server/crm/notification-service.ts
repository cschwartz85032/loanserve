/**
 * CRM Notification Service - Integration with Phase 4 Document/Notice System
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { DocsRepo } from '../docs/repo';
import { RenderService } from '../docs/render-service';
import sgMail from '@sendgrid/mail';
import { ulid } from 'ulid';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export interface CRMNotificationRequest {
  type: 'task_assignment' | 'appointment_reminder' | 'email_notification' | 'deal_update' | 'task_overdue';
  loanId: number;
  recipientEmail: string;
  recipientName?: string;
  data: Record<string, any>;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
  }>;
  scheduleFor?: Date;
}

export class CRMNotificationService {
  private repo: DocsRepo;
  private renderer: RenderService;

  constructor() {
    this.repo = new DocsRepo();
    this.renderer = new RenderService();
  }

  /**
   * Send or schedule a CRM notification
   */
  async sendNotification(request: CRMNotificationRequest): Promise<{
    success: boolean;
    docId?: string;
    noticeId?: string;
    error?: string;
  }> {
    try {
      // Get or create template for this notification type
      const template = await this.getOrCreateTemplate(request.type);
      
      if (!template) {
        throw new Error(`No template found for notification type: ${request.type}`);
      }

      // Prepare payload with CRM data
      const payload = this.buildPayload(request);

      // If scheduled for future, create notice schedule entry
      if (request.scheduleFor && request.scheduleFor > new Date()) {
        const noticeId = await this.scheduleNotice(request, template.template_id);
        return { success: true, noticeId };
      }

      // Otherwise, send immediately
      const rendered = await this.renderer.renderDocument(
        {
          type: `crm_${request.type}`,
          template_id: template.template_id,
          payload
        },
        template as any
      );

      // Save as document artifact
      const docId = await this.repo.insertArtifact({
        type: `crm_${request.type}`,
        loan_id: request.loanId,
        template_id: template.template_id,
        payload_json: payload,
        inputs_hash: rendered.inputs_hash,
        pdf_hash: rendered.pdf_hash,
        pdf_bytes: rendered.pdf_bytes,
        size_bytes: rendered.size_bytes,
        event_id: ulid()
      });

      // Send email via SendGrid
      await this.sendEmail(request, rendered.html, request.attachments);

      return { success: true, docId };
    } catch (error) {
      console.error('[CRM Notification] Error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Build notification payload
   */
  private buildPayload(request: CRMNotificationRequest): Record<string, any> {
    const basePayload = {
      loan_id: request.loanId,
      recipient: {
        email: request.recipientEmail,
        name: request.recipientName || request.recipientEmail
      },
      timestamp: new Date().toISOString(),
      ...request.data
    };

    // Add type-specific data
    switch (request.type) {
      case 'task_assignment':
        return {
          ...basePayload,
          task: request.data.task,
          assignedBy: request.data.assignedBy,
          dueDate: request.data.dueDate,
          priority: request.data.priority
        };
      
      case 'appointment_reminder':
        return {
          ...basePayload,
          appointment: request.data.appointment,
          location: request.data.location,
          startTime: request.data.startTime,
          endTime: request.data.endTime
        };
      
      case 'task_overdue':
        return {
          ...basePayload,
          task: request.data.task,
          daysOverdue: request.data.daysOverdue,
          originalDueDate: request.data.originalDueDate
        };
      
      default:
        return basePayload;
    }
  }

  /**
   * Schedule a future notice
   */
  private async scheduleNotice(
    request: CRMNotificationRequest, 
    templateId: string
  ): Promise<string> {
    // Create notice template entry if not exists
    const noticeTemplateResult = await db.execute(sql`
      INSERT INTO notice_template_v2 (
        name,
        trigger_code,
        html_template,
        subject_template,
        priority,
        delivery_channels
      )
      VALUES (
        ${`CRM ${request.type.replace('_', ' ')}`},
        ${`crm.${request.type}`},
        ${this.getDefaultHtmlTemplate(request.type)},
        ${this.getDefaultSubject(request.type)},
        ${request.type === 'task_overdue' ? 'high' : 'normal'},
        ${JSON.stringify(['email'])}
      )
      ON CONFLICT (trigger_code) 
      DO UPDATE SET updated_at = NOW()
      RETURNING notice_template_id
    `);

    const noticeTemplateId = noticeTemplateResult.rows[0].notice_template_id as string;

    // Schedule the notice
    const noticeId = await this.repo.scheduleNotice({
      loan_id: request.loanId,
      notice_template_id: noticeTemplateId,
      trigger_code: `crm.${request.type}`,
      params: request.data,
      scheduled_for: request.scheduleFor!
    });

    return noticeId;
  }

  /**
   * Send email via SendGrid
   */
  private async sendEmail(
    request: CRMNotificationRequest,
    htmlContent: string,
    attachments?: Array<{ content: string; filename: string; type: string }>
  ): Promise<void> {
    const msg: any = {
      to: request.recipientEmail,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@loanserve.pro',
      subject: this.getDefaultSubject(request.type),
      html: htmlContent,
      attachments: attachments || []
    };

    await sgMail.send(msg);
  }

  /**
   * Get or create template for notification type
   */
  private async getOrCreateTemplate(type: string): Promise<any> {
    let template = await this.repo.getLatestTemplate(`crm_${type}`);
    
    if (!template) {
      // Create default template using consistent naming
      await db.execute(sql`
        INSERT INTO document_template (template_id, type, jurisdiction, version, engine, html_source, css_source)
        VALUES (
          ${`tmpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`},
          ${`crm_${type}`},
          NULL,
          1,
          'handlebars-html',
          ${this.getDefaultHtmlTemplate(type)},
          ${this.getDefaultCSS()}
        )
        ON CONFLICT DO NOTHING
      `);
      
      template = await this.repo.getLatestTemplate(`crm_${type}`);
    }
    
    return template;
  }

  /**
   * Get default HTML template for notification type
   */
  private getDefaultHtmlTemplate(type: string): string {
    const templates: Record<string, string> = {
      task_assignment: `<!DOCTYPE html>
<html>
<head><title>Task Assignment</title></head>
<body>
  <div class="container">
    <h1>New Task Assigned</h1>
    <p>Hello {{recipient.name}},</p>
    <p>A new task has been assigned to you:</p>
    <div class="task-details">
      <h2>{{task.title}}</h2>
      <p>{{task.description}}</p>
      <p><strong>Due Date:</strong> {{dueDate}}</p>
      <p><strong>Priority:</strong> {{priority}}</p>
      <p><strong>Assigned By:</strong> {{assignedBy}}</p>
    </div>
    <p>Loan ID: {{loan_id}}</p>
  </div>
</body>
</html>`,
      
      appointment_reminder: `<!DOCTYPE html>
<html>
<head><title>Appointment Reminder</title></head>
<body>
  <div class="container">
    <h1>Appointment Reminder</h1>
    <p>Hello {{recipient.name}},</p>
    <p>This is a reminder about your upcoming appointment:</p>
    <div class="appointment-details">
      <h2>{{appointment.title}}</h2>
      <p>{{appointment.description}}</p>
      <p><strong>Date:</strong> {{startTime}}</p>
      <p><strong>Location:</strong> {{location}}</p>
    </div>
    <p>Loan ID: {{loan_id}}</p>
  </div>
</body>
</html>`,

      task_overdue: `<!DOCTYPE html>
<html>
<head><title>Task Overdue</title></head>
<body>
  <div class="container">
    <h1>⚠️ Task Overdue</h1>
    <p>Hello {{recipient.name}},</p>
    <p>The following task is now <strong>{{daysOverdue}} days overdue</strong>:</p>
    <div class="task-details">
      <h2>{{task.title}}</h2>
      <p>{{task.description}}</p>
      <p><strong>Original Due Date:</strong> {{originalDueDate}}</p>
    </div>
    <p>Please complete this task as soon as possible.</p>
    <p>Loan ID: {{loan_id}}</p>
  </div>
</body>
</html>`,

      email_notification: `<!DOCTYPE html>
<html>
<head><title>{{subject}}</title></head>
<body>
  <div class="container">
    {{{content}}}
    <hr>
    <p class="footer">Loan ID: {{loan_id}}</p>
  </div>
</body>
</html>`,

      deal_update: `<!DOCTYPE html>
<html>
<head><title>Deal Update</title></head>
<body>
  <div class="container">
    <h1>Deal Status Update</h1>
    <p>Hello {{recipient.name}},</p>
    <p>There has been an update to your deal:</p>
    <div class="deal-details">
      <h2>{{deal.title}}</h2>
      <p><strong>Stage:</strong> {{deal.stage}}</p>
      <p><strong>Value:</strong> {{deal.value}}</p>
      <p><strong>Update:</strong> {{updateMessage}}</p>
    </div>
    <p>Loan ID: {{loan_id}}</p>
  </div>
</body>
</html>`
    };

    return templates[type] || templates.email_notification;
  }

  /**
   * Get default subject for notification type
   */
  private getDefaultSubject(type: string): string {
    const subjects: Record<string, string> = {
      task_assignment: 'New Task Assigned',
      appointment_reminder: 'Appointment Reminder',
      task_overdue: '⚠️ Task Overdue',
      email_notification: 'Notification',
      deal_update: 'Deal Status Update'
    };

    return subjects[type] || 'CRM Notification';
  }

  /**
   * Get default CSS for CRM notifications
   */
  private getDefaultCSS(): string {
    return `
body { 
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
  line-height: 1.6; 
  color: #333; 
  margin: 0; 
  padding: 0;
}
.container { 
  max-width: 600px; 
  margin: 0 auto; 
  padding: 20px;
}
h1 { 
  color: #2c3e50; 
  border-bottom: 2px solid #3498db; 
  padding-bottom: 10px;
}
h2 { 
  color: #34495e; 
  margin-top: 20px;
}
.task-details, .appointment-details, .deal-details {
  background: #f8f9fa;
  border-left: 4px solid #3498db;
  padding: 15px;
  margin: 20px 0;
}
.footer {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #ddd;
  color: #666;
  font-size: 0.9em;
}
strong { 
  color: #2c3e50; 
}`;
  }
}