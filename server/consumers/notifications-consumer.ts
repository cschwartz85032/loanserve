/**
 * Notifications Consumer Service
 * Subscribes to payment events and creates notifications for relevant parties
 */

import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { db } from '../db';
import { notifications, loans, payments, users } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';
import { randomUUID } from 'crypto';

// Initialize SendGrid if configured
const isEmailConfigured = !!process.env.SENDGRID_API_KEY;
if (isEmailConfigured) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

interface PaymentEventMessage {
  eventType: string;
  paymentId: string;
  loanId: number;
  amount: number;
  effectiveDate: string;
  channel: string;
  borrowerName?: string;
  lenderName?: string;
  investorIds?: number[];
  reversalReason?: string;
  partialAmount?: number;
  remainingBalance?: number;
  metadata?: any;
}

interface NotificationRecipient {
  userId: number;
  email?: string;
  name?: string;
  role: string;
}

export class NotificationsConsumer {
  private rabbitmq: any;
  private retryAttempts = new Map<string, number>();
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s

  constructor() {
    this.rabbitmq = getEnhancedRabbitMQService();
  }

  /**
   * Start consuming payment events for notifications
   */
  async start(): Promise<void> {
    console.log('[NotificationsConsumer] Starting consumer');

    // Define the notifications queue
    await this.rabbitmq.assertQueue('q.notifications', {
      durable: true,
      deadLetterExchange: 'dlx.main',
      deadLetterRoutingKey: 'dlq.notifications'
    });

    // Bind to payment events
    await this.rabbitmq.bindQueue('q.notifications', 'payments.topic', 'payment.posted');
    await this.rabbitmq.bindQueue('q.notifications', 'payments.topic', 'payment.reversed');
    await this.rabbitmq.bindQueue('q.notifications', 'payments.topic', 'payment.partial');

    // Start consuming messages
    await this.rabbitmq.consume(
      'q.notifications',
      this.handlePaymentEvent.bind(this),
      {
        prefetch: 10
      }
    );

    console.log('[NotificationsConsumer] Consumer started successfully');
  }

  /**
   * Handle incoming payment event
   */
  private async handlePaymentEvent(message: any): Promise<void> {
    const eventType = message.fields?.routingKey;
    const payload = message.content as PaymentEventMessage;
    
    console.log(`[NotificationsConsumer] Processing ${eventType} for payment ${payload.paymentId}`);

    try {
      // Get payment and loan details
      const paymentDetails = await this.getPaymentDetails(payload.paymentId);
      if (!paymentDetails) {
        throw new Error(`Payment ${payload.paymentId} not found`);
      }

      // Get recipients based on event type and loan
      const recipients = await this.getRecipients(paymentDetails.loanId, eventType);

      // Create notifications for each recipient
      const notificationPromises = recipients.map(recipient =>
        this.createNotification(recipient, eventType, paymentDetails, payload)
      );

      const createdNotifications = await Promise.all(notificationPromises);

      // Send emails for each notification
      await this.sendEmailNotifications(createdNotifications, eventType, paymentDetails);

      console.log(`[NotificationsConsumer] Created ${createdNotifications.length} notifications for ${eventType}`);
    } catch (error) {
      console.error('[NotificationsConsumer] Error processing payment event:', error);
      throw error; // Let RabbitMQ handle retry/DLQ
    }
  }

  /**
   * Get payment and loan details
   */
  private async getPaymentDetails(paymentId: string): Promise<any> {
    const [payment] = await db
      .select({
        id: payments.id,
        loanId: payments.loanId,
        amount: payments.totalReceived,
        effectiveDate: payments.effectiveDate,
        status: payments.status,
        sourceChannel: payments.sourceChannel,
        borrowerName: loans.borrowerName,
        propertyAddress: loans.propertyAddress,
        loanNumber: loans.loanNumber
      })
      .from(payments)
      .leftJoin(loans, eq(payments.loanId, loans.id))
      .where(eq(payments.id, paymentId))
      .limit(1);

    return payment;
  }

  /**
   * Get notification recipients based on loan and event type
   */
  private async getRecipients(
    loanId: number,
    eventType: string
  ): Promise<NotificationRecipient[]> {
    const recipients: NotificationRecipient[] = [];

    // Get loan details with related parties
    const [loan] = await db
      .select()
      .from(loans)
      .where(eq(loans.id, loanId))
      .limit(1);

    if (!loan) return recipients;

    // Get borrower user if exists
    if (loan.borrowerEmail) {
      const [borrowerUser] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name
        })
        .from(users)
        .where(eq(users.email, loan.borrowerEmail))
        .limit(1);

      if (borrowerUser) {
        recipients.push({
          userId: borrowerUser.id,
          email: borrowerUser.email,
          name: borrowerUser.name || loan.borrowerName || 'Borrower',
          role: 'borrower'
        });
      }
    }

    // Get lender users
    const lenderUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name
      })
      .from(users)
      .where(inArray(users.role, ['lender', 'admin']));

    lenderUsers.forEach(user => {
      recipients.push({
        userId: user.id,
        email: user.email,
        name: user.name || 'Lender',
        role: 'lender'
      });
    });

    // Get investor users if applicable
    if (eventType === 'payment.posted') {
      const investorUsers = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name
        })
        .from(users)
        .where(eq(users.role, 'investor'));

      investorUsers.forEach(user => {
        recipients.push({
          userId: user.id,
          email: user.email,
          name: user.name || 'Investor',
          role: 'investor'
        });
      });
    }

    // Add internal team notifications for reversals
    if (eventType === 'payment.reversed') {
      const internalUsers = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name
        })
        .from(users)
        .where(inArray(users.role, ['admin', 'servicer']));

      internalUsers.forEach(user => {
        recipients.push({
          userId: user.id,
          email: user.email,
          name: user.name || 'Team',
          role: 'internal'
        });
      });
    }

    return recipients;
  }

  /**
   * Create notification record
   */
  private async createNotification(
    recipient: NotificationRecipient,
    eventType: string,
    paymentDetails: any,
    payload: PaymentEventMessage
  ): Promise<any> {
    const { title, message, priority } = this.generateNotificationContent(
      eventType,
      paymentDetails,
      payload,
      recipient.role
    );

    const [notification] = await db
      .insert(notifications)
      .values({
        userId: recipient.userId,
        type: this.mapEventToNotificationType(eventType),
        priority,
        title,
        message,
        relatedEntityType: 'payment',
        relatedEntityId: parseInt(paymentDetails.id), // Convert payment UUID to int for legacy schema
        actionUrl: `/loans/${paymentDetails.loanId}/payments`,
        metadata: {
          paymentId: paymentDetails.id,
          loanId: paymentDetails.loanId,
          eventType,
          amount: paymentDetails.amount,
          recipientRole: recipient.role
        }
      })
      .returning();

    return {
      ...notification,
      recipientEmail: recipient.email,
      recipientName: recipient.name
    };
  }

  /**
   * Generate notification content based on event type and role
   */
  private generateNotificationContent(
    eventType: string,
    paymentDetails: any,
    payload: PaymentEventMessage,
    role: string
  ): { title: string; message: string; priority: 'low' | 'medium' | 'high' | 'urgent' } {
    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(parseFloat(paymentDetails.amount));

    const loanInfo = `Loan #${paymentDetails.loanNumber} - ${paymentDetails.propertyAddress}`;

    switch (eventType) {
      case 'payment.posted':
        return {
          title: 'Payment Posted Successfully',
          message: role === 'borrower' 
            ? `Your payment of ${amount} has been posted to ${loanInfo}. Thank you for your payment.`
            : `Payment of ${amount} posted for ${loanInfo} from ${paymentDetails.borrowerName}.`,
          priority: 'medium'
        };

      case 'payment.reversed':
        return {
          title: 'Payment Reversed',
          message: role === 'borrower'
            ? `Your payment of ${amount} for ${loanInfo} has been reversed. ${payload.reversalReason ? `Reason: ${payload.reversalReason}` : 'Please contact us for details.'}`
            : `ALERT: Payment of ${amount} reversed for ${loanInfo}. Reason: ${payload.reversalReason || 'See system for details'}`,
          priority: role === 'internal' ? 'urgent' : 'high'
        };

      case 'payment.partial':
        const partial = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(payload.partialAmount || 0);
        
        const remaining = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(payload.remainingBalance || 0);

        return {
          title: 'Partial Payment Received',
          message: role === 'borrower'
            ? `Partial payment of ${partial} received for ${loanInfo}. Remaining balance: ${remaining}.`
            : `Partial payment of ${partial} received for ${loanInfo} from ${paymentDetails.borrowerName}. Remaining: ${remaining}.`,
          priority: 'medium'
        };

      default:
        return {
          title: 'Payment Update',
          message: `Payment activity for ${loanInfo}`,
          priority: 'low'
        };
    }
  }

  /**
   * Map event type to notification type
   */
  private mapEventToNotificationType(eventType: string): string {
    const typeMap: Record<string, string> = {
      'payment.posted': 'payment_received',
      'payment.reversed': 'payment_reversed',
      'payment.partial': 'payment_partial'
    };
    return typeMap[eventType] || 'payment_update';
  }

  /**
   * Send email notifications with retry logic
   */
  private async sendEmailNotifications(
    notifications: any[],
    eventType: string,
    paymentDetails: any
  ): Promise<void> {
    if (!isEmailConfigured) {
      console.log('[NotificationsConsumer] Email not configured, skipping email sending');
      return;
    }

    for (const notification of notifications) {
      if (!notification.recipientEmail) continue;

      const retryKey = `${notification.id}-email`;
      await this.sendEmailWithRetry(
        notification,
        retryKey,
        eventType,
        paymentDetails
      );
    }
  }

  /**
   * Send email with exponential backoff retry
   */
  private async sendEmailWithRetry(
    notification: any,
    retryKey: string,
    eventType: string,
    paymentDetails: any,
    attemptNumber: number = 0
  ): Promise<void> {
    try {
      const msg = {
        to: notification.recipientEmail,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@loanservepro.com',
        subject: notification.title,
        text: notification.message,
        html: this.generateEmailHtml(notification, eventType, paymentDetails)
      };

      await sgMail.send(msg);

      // Update notification to mark email as sent
      await db
        .update(notifications)
        .set({
          emailSent: true,
          sentAt: new Date()
        })
        .where(eq(notifications.id, notification.id));

      console.log(`[NotificationsConsumer] Email sent successfully for notification ${notification.id}`);
      
      // Clear retry attempts on success
      this.retryAttempts.delete(retryKey);

    } catch (error: any) {
      console.error(`[NotificationsConsumer] Email send failed for notification ${notification.id}:`, error);

      // Check if we should retry
      if (attemptNumber < this.MAX_RETRY_ATTEMPTS) {
        const delay = this.RETRY_DELAYS[attemptNumber] || 30000;
        console.log(`[NotificationsConsumer] Retrying email send in ${delay}ms (attempt ${attemptNumber + 1}/${this.MAX_RETRY_ATTEMPTS})`);

        setTimeout(() => {
          this.sendEmailWithRetry(
            notification,
            retryKey,
            eventType,
            paymentDetails,
            attemptNumber + 1
          );
        }, delay);
      } else {
        console.error(`[NotificationsConsumer] Max retry attempts reached for notification ${notification.id}, email will not be sent`);
        // Notification remains in system as unread even if email fails
      }
    }
  }

  /**
   * Generate HTML email content
   */
  private generateEmailHtml(
    notification: any,
    eventType: string,
    paymentDetails: any
  ): string {
    const baseStyle = `
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
    `;

    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(parseFloat(paymentDetails.amount));

    const statusColor = eventType === 'payment.reversed' ? '#ef4444' : '#10b981';
    const statusIcon = eventType === 'payment.reversed' ? '⚠️' : '✅';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { ${baseStyle} }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
          .status-badge { 
            display: inline-block; 
            padding: 8px 16px; 
            background: ${statusColor}; 
            color: white; 
            border-radius: 6px; 
            font-weight: bold;
            margin: 10px 0;
          }
          .details { 
            background: white; 
            padding: 15px; 
            border-radius: 6px; 
            margin: 20px 0;
            border: 1px solid #e5e7eb;
          }
          .details-row { 
            display: flex; 
            justify-content: space-between; 
            padding: 8px 0; 
            border-bottom: 1px solid #f3f4f6;
          }
          .details-row:last-child { border-bottom: none; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #2563eb; 
            color: white; 
            text-decoration: none; 
            border-radius: 6px; 
            margin: 20px 0; 
          }
          .footer { 
            margin-top: 30px; 
            padding-top: 20px; 
            border-top: 1px solid #e5e7eb; 
            font-size: 0.875rem; 
            color: #6b7280; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${statusIcon} ${notification.title}</h1>
          </div>
          <div class="content">
            <p>${notification.message}</p>
            
            <div class="details">
              <h3 style="margin-top: 0;">Payment Details</h3>
              <div class="details-row">
                <span>Amount:</span>
                <strong>${amount}</strong>
              </div>
              <div class="details-row">
                <span>Loan Number:</span>
                <strong>${paymentDetails.loanNumber}</strong>
              </div>
              <div class="details-row">
                <span>Property:</span>
                <strong>${paymentDetails.propertyAddress}</strong>
              </div>
              <div class="details-row">
                <span>Effective Date:</span>
                <strong>${new Date(paymentDetails.effectiveDate).toLocaleDateString()}</strong>
              </div>
              <div class="details-row">
                <span>Payment Method:</span>
                <strong>${paymentDetails.sourceChannel?.toUpperCase() || 'N/A'}</strong>
              </div>
            </div>

            <div style="text-align: center;">
              <a href="${process.env.APP_URL || 'https://app.loanservepro.com'}${notification.actionUrl}" class="button">
                View Payment Details
              </a>
            </div>

            <div class="footer">
              <p>This is an automated notification from LoanServe Pro.</p>
              <p>If you have any questions, please contact our support team.</p>
              <p style="font-size: 0.75rem; color: #9ca3af;">
                Notification ID: ${notification.id}<br>
                Sent: ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Stop the consumer
   */
  async stop(): Promise<void> {
    console.log('[NotificationsConsumer] Stopping consumer');
    // Consumer will be stopped by RabbitMQ service
  }
}

// Export singleton instance
export const notificationsConsumer = new NotificationsConsumer();