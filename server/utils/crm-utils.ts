import { db } from '../db';
import { crmActivity } from '@shared/schema';

// Constants for magic values
export const CRM_CONSTANTS = {
  SESSION_EXPIRY_MS: 86400000, // 24 hours
  RATE_LIMIT_DELAYS: {
    SHORT: 1000,  // 1 second
    LONG: 2000    // 2 seconds
  },
  ACTIVITY_TYPES: {
    NOTE: 'note',
    EMAIL: 'email',
    TEXT: 'text',
    SMS: 'sms',
    CALL: 'call',
    APPOINTMENT: 'appointment',
    CONTACT_UPDATE: 'contact_update',
    PROFILE_PHOTO: 'profile_photo',
    LOAN_UPDATE: 'loan_update',
    LOAN_CREATED: 'loan_created',
    LOAN_STATUS_CHANGE: 'loan_status_change'
  } as const,
  CALL_STATUS: {
    SCHEDULED: 'scheduled',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    NO_ANSWER: 'no_answer'
  } as const,
  CALL_DIRECTION: {
    INBOUND: 'inbound',
    OUTBOUND: 'outbound'
  } as const,
  DEFAULT_LABELS: {
    PHONE_PRIMARY: 'Primary',
    PHONE_MOBILE: 'Mobile',
    PHONE_WORK: 'Work',
    PHONE_TOLL_FREE: 'Toll Free',
    EMAIL_PRIMARY: 'Primary',
    EMAIL_WORK: 'Work',
    EMAIL_PERSONAL: 'Personal'
  } as const
} as const;

// Type for activity types
export type ActivityType = typeof CRM_CONSTANTS.ACTIVITY_TYPES[keyof typeof CRM_CONSTANTS.ACTIVITY_TYPES];

// Contact info parsing utilities
export interface PhoneInfo {
  number: string;
  label: string;
  isBad: boolean;
}

export interface EmailInfo {
  email: string;
  label: string;
}

/**
 * Parse phone data from database (handles array, object, and plain string formats)
 */
export function parsePhoneData(phoneData: string | null): PhoneInfo[] {
  if (!phoneData) return [];
  
  try {
    // Try to parse as JSON first
    if (phoneData.startsWith('[')) {
      // New array format - multiple phones
      const parsed = JSON.parse(phoneData);
      return parsed.map((p: any) => ({
        number: p.number || p,
        label: p.label || CRM_CONSTANTS.DEFAULT_LABELS.PHONE_PRIMARY,
        isBad: p.isBad || false
      }));
    } else if (phoneData.startsWith('{')) {
      // Old single object format
      const parsed = JSON.parse(phoneData);
      return [{
        number: parsed.number || '',
        label: parsed.label || CRM_CONSTANTS.DEFAULT_LABELS.PHONE_PRIMARY,
        isBad: parsed.isBad || false
      }];
    }
    // Fallback to plain string (old format)
    return [{
      number: phoneData,
      label: CRM_CONSTANTS.DEFAULT_LABELS.PHONE_PRIMARY,
      isBad: false
    }];
  } catch {
    // If parsing fails, treat as plain string
    return [{
      number: phoneData,
      label: CRM_CONSTANTS.DEFAULT_LABELS.PHONE_PRIMARY,
      isBad: false
    }];
  }
}

/**
 * Parse email data from database (handles both JSON array and plain string formats)
 */
export function parseEmailData(emailData: string | null): EmailInfo[] {
  if (!emailData) return [];
  
  try {
    // Try to parse as JSON first
    if (emailData.startsWith('[') || emailData.startsWith('{')) {
      const parsed = JSON.parse(emailData);
      
      // Handle array format
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          email: item.email || item,
          label: item.label || CRM_CONSTANTS.DEFAULT_LABELS.EMAIL_PRIMARY
        })).filter(item => item.email);
      }
      
      // Handle single object format
      if (typeof parsed === 'object' && parsed.email) {
        return [{
          email: parsed.email,
          label: parsed.label || CRM_CONSTANTS.DEFAULT_LABELS.EMAIL_PRIMARY
        }];
      }
    }
    
    // Fallback to plain string
    return [{
      email: emailData,
      label: CRM_CONSTANTS.DEFAULT_LABELS.EMAIL_PRIMARY
    }];
  } catch {
    // If parsing fails, treat as plain string
    return [{
      email: emailData,
      label: CRM_CONSTANTS.DEFAULT_LABELS.EMAIL_PRIMARY
    }];
  }
}

/**
 * Format phone data for storage in database
 */
export function formatPhoneForStorage(phone: PhoneInfo): string {
  return JSON.stringify({
    number: phone.number,
    label: phone.label || CRM_CONSTANTS.DEFAULT_LABELS.PHONE_PRIMARY,
    isBad: phone.isBad || false
  });
}

/**
 * Format email data for storage in database
 */
export function formatEmailsForStorage(emails: EmailInfo[]): string {
  const validEmails = emails.filter(e => e.email && e.email.trim() !== '');
  return JSON.stringify(validEmails.map(e => ({
    email: e.email,
    label: e.label || CRM_CONSTANTS.DEFAULT_LABELS.EMAIL_PRIMARY
  })));
}

/**
 * Get activity type description for display
 */
export function getActivityDescription(type: ActivityType, data: any): string {
  switch (type) {
    case CRM_CONSTANTS.ACTIVITY_TYPES.NOTE:
      return data.content || 'Added a note';
    case CRM_CONSTANTS.ACTIVITY_TYPES.EMAIL:
      return `Email: ${data.subject || 'No subject'}`;
    case CRM_CONSTANTS.ACTIVITY_TYPES.TEXT:
      return `Text: ${data.message?.substring(0, 50) || 'Sent text message'}`;
    case CRM_CONSTANTS.ACTIVITY_TYPES.SMS:
      return data.description || `SMS sent to ${data.to || 'recipient'}`;
    case CRM_CONSTANTS.ACTIVITY_TYPES.CALL:
      return data.description || 'Phone call';
    case CRM_CONSTANTS.ACTIVITY_TYPES.APPOINTMENT:
      return `Appointment: ${data.title || 'Scheduled'}`;
    case CRM_CONSTANTS.ACTIVITY_TYPES.CONTACT_UPDATE:
      return 'Updated contact information';
    case CRM_CONSTANTS.ACTIVITY_TYPES.PROFILE_PHOTO:
      return 'Profile photo updated';
    case CRM_CONSTANTS.ACTIVITY_TYPES.LOAN_UPDATE:
      return data.description || 'Loan updated';
    case CRM_CONSTANTS.ACTIVITY_TYPES.LOAN_CREATED:
      return 'Loan created';
    case CRM_CONSTANTS.ACTIVITY_TYPES.LOAN_STATUS_CHANGE:
      return `Status changed to ${data.newStatus}`;
    default:
      return data.description || 'Activity logged';
  }
}

/**
 * Log an activity to the CRM activity timeline
 */
export async function logActivity(
  loanId: number,
  userId: number,
  activityType: ActivityType,
  activityData: any,
  relatedId?: number
): Promise<void> {
  try {
    await db.insert(crmActivity).values({
      loanId,
      userId,
      activityType,
      activityData: activityData || {},
      relatedId,
      isSystem: false
    });
  } catch (error) {
    console.error('Error logging CRM activity:', error);
    // Don't throw - logging failures shouldn't break the main operation
  }
}

/**
 * Log a system activity (automated actions)
 */
export async function logSystemActivity(
  loanId: number,
  activityType: ActivityType,
  activityData: any,
  relatedId?: number
): Promise<void> {
  try {
    await db.insert(crmActivity).values({
      loanId,
      userId: 1, // System user
      activityType,
      activityData: activityData || {},
      relatedId,
      isSystem: true
    });
  } catch (error) {
    console.error('Error logging system activity:', error);
    // Don't throw - logging failures shouldn't break the main operation
  }
}