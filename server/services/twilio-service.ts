/**
 * Twilio SMS Service
 * Handles SMS notifications for the loan servicing platform
 */

import twilio from 'twilio';
import { db } from '../db';
import { crmActivity } from '@shared/schema';

// Load environment variables
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local if it exists
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

export class TwilioService {
  private client: any;
  private isConfigured: boolean = false;
  private fromNumber: string | undefined;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;

    console.log('[Twilio] Checking configuration...');
    console.log('[Twilio] Account SID:', accountSid ? 'Present' : 'Missing');
    console.log('[Twilio] Auth Token:', authToken ? 'Present' : 'Missing');  
    console.log('[Twilio] Phone Number:', this.fromNumber || 'Missing');

    if (accountSid && authToken && this.fromNumber) {
      try {
        this.client = twilio(accountSid, authToken);
        this.isConfigured = true;
        console.log('[Twilio] ✓ Service configured successfully with phone:', this.fromNumber);
      } catch (error) {
        console.error('[Twilio] Failed to initialize:', error);
        this.isConfigured = false;
      }
    } else {
      console.log('[Twilio] ✗ Service not configured - missing credentials');
    }
  }

  /**
   * Check if Twilio is properly configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Send SMS message
   */
  async sendSMS(to: string, body: string, loanId?: number): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Twilio service not configured'
      };
    }

    try {
      // Format phone number if needed
      const formattedTo = this.formatPhoneNumber(to);
      
      // Send SMS
      const message = await this.client.messages.create({
        body,
        from: this.fromNumber,
        to: formattedTo
      });

      // Log to CRM activity if loan ID provided
      if (loanId) {
        await this.logSMSActivity(loanId, formattedTo, body, message.sid);
      }

      console.log(`[Twilio] SMS sent successfully: ${message.sid}`);
      
      return {
        success: true,
        messageId: message.sid
      };
    } catch (error: any) {
      console.error('[Twilio] SMS send error:', error);
      
      return {
        success: false,
        error: error.message || 'Failed to send SMS'
      };
    }
  }

  /**
   * Send payment reminder SMS
   */
  async sendPaymentReminder(
    to: string,
    loanId: number,
    loanNumber: string,
    amount: string,
    dueDate: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const body = `Payment Reminder: Your loan ${loanNumber} payment of $${amount} is due on ${dueDate}. ` +
                 `Reply STOP to unsubscribe.`;
    
    const result = await this.sendSMS(to, body, loanId);
    
    if (result.success) {
      // Log specific payment reminder activity
      await db.insert(crmActivity).values({
        loanId,
        userId: 1, // System user
        activityType: 'sms_reminder',
        activityData: {
          description: `Payment reminder SMS sent to ${to}`,
          messageId: result.messageId,
          amount,
          dueDate,
          type: 'payment_reminder'
        },
        isSystem: true,
        createdAt: new Date()
      });
    }
    
    return result;
  }

  /**
   * Send late payment notice SMS
   */
  async sendLateNotice(
    to: string,
    loanId: number,
    loanNumber: string,
    amount: string,
    daysLate: number
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const body = `Late Notice: Your loan ${loanNumber} payment of $${amount} is ${daysLate} days overdue. ` +
                 `Please make payment immediately to avoid additional fees. Reply STOP to unsubscribe.`;
    
    const result = await this.sendSMS(to, body, loanId);
    
    if (result.success) {
      // Log late notice activity
      await db.insert(crmActivity).values({
        loanId,
        userId: 1, // System user
        activityType: 'sms_notice',
        activityData: {
          description: `Late payment SMS notice sent to ${to}`,
          messageId: result.messageId,
          amount,
          daysLate,
          type: 'late_notice'
        },
        isSystem: true,
        createdAt: new Date()
      });
    }
    
    return result;
  }

  /**
   * Send escrow disbursement notification
   */
  async sendEscrowNotification(
    to: string,
    loanId: number,
    loanNumber: string,
    payee: string,
    amount: string,
    purpose: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const body = `Escrow Notice: A payment of $${amount} has been made from your loan ${loanNumber} escrow ` +
                 `to ${payee} for ${purpose}. Reply STOP to unsubscribe.`;
    
    const result = await this.sendSMS(to, body, loanId);
    
    if (result.success) {
      // Log escrow notification
      await db.insert(crmActivity).values({
        loanId,
        userId: 1, // System user
        activityType: 'sms_notice',
        activityData: {
          description: `Escrow disbursement SMS sent to ${to}`,
          messageId: result.messageId,
          payee,
          amount,
          purpose,
          type: 'escrow_disbursement'
        },
        isSystem: true,
        createdAt: new Date()
      });
    }
    
    return result;
  }

  /**
   * Format phone number to E.164 format
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing (assuming US)
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    } else if (cleaned.startsWith('+')) {
      return phone;
    }
    
    return phone; // Return as-is if format unclear
  }

  /**
   * Log SMS activity to CRM
   */
  private async logSMSActivity(
    loanId: number,
    to: string,
    message: string,
    messageId: string
  ): Promise<void> {
    try {
      await db.insert(crmActivity).values({
        loanId,
        userId: 1, // System user
        activityType: 'sms',
        activityData: {
          description: `SMS sent to ${to}`,
          to,
          message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
          messageId,
          source: 'twilio'
        },
        isSystem: true,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('[Twilio] Failed to log SMS activity:', error);
    }
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageId: string): Promise<{ status: string; error?: string }> {
    if (!this.isConfigured) {
      return {
        status: 'unknown',
        error: 'Twilio service not configured'
      };
    }

    try {
      const message = await this.client.messages(messageId).fetch();
      return {
        status: message.status
      };
    } catch (error: any) {
      console.error('[Twilio] Failed to get message status:', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// Export singleton instance
console.log('[Twilio] Creating service instance...');
export const twilioService = new TwilioService();