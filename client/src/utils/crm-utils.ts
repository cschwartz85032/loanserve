/**
 * Frontend CRM utilities for consistent data parsing and formatting
 */

// CRM Constants (mirrored from backend for type safety)
export const CRM_CONSTANTS = {
  ACTIVITY_TYPES: {
    NOTE: 'note',
    EMAIL: 'email',
    TEXT: 'text',
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

// Types
export interface PhoneInfo {
  number: string;
  label: string;
  isBad: boolean;
}

export interface EmailInfo {
  email: string;
  label: string;
}

export type ActivityType = typeof CRM_CONSTANTS.ACTIVITY_TYPES[keyof typeof CRM_CONSTANTS.ACTIVITY_TYPES];

/**
 * Parse phone data from loan record (handles both JSON and plain string formats)
 */
export function parsePhoneData(phoneData: string | null): PhoneInfo | null {
  if (!phoneData) return null;
  
  try {
    // Try to parse as JSON first (new format)
    if (typeof phoneData === 'string' && phoneData.startsWith('{')) {
      const parsed = JSON.parse(phoneData);
      return {
        number: parsed.number || '',
        label: parsed.label || CRM_CONSTANTS.DEFAULT_LABELS.PHONE_PRIMARY,
        isBad: parsed.isBad || false
      };
    }
    // Fallback to plain string (old format)
    return {
      number: phoneData,
      label: CRM_CONSTANTS.DEFAULT_LABELS.PHONE_PRIMARY,
      isBad: false
    };
  } catch {
    // If parsing fails, treat as plain string
    return {
      number: phoneData,
      label: CRM_CONSTANTS.DEFAULT_LABELS.PHONE_PRIMARY,
      isBad: false
    };
  }
}

/**
 * Parse email data from loan record (handles both JSON array and plain string formats)
 */
export function parseEmailData(emailData: string | null): EmailInfo[] {
  if (!emailData) return [];
  
  try {
    // Try to parse as JSON first
    if (typeof emailData === 'string' && (emailData.startsWith('[') || emailData.startsWith('{'))) {
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
 * Get all phone numbers from loan data
 */
export function getPhonesFromLoan(loanData: any): PhoneInfo[] {
  const phones: PhoneInfo[] = [];
  
  const primaryPhone = parsePhoneData(loanData?.borrowerPhone);
  if (primaryPhone) phones.push(primaryPhone);
  
  const mobilePhone = parsePhoneData(loanData?.borrowerMobile);
  if (mobilePhone) phones.push(mobilePhone);
  
  // If no phones found, return empty phone template
  if (phones.length === 0) {
    phones.push({ number: '', label: '', isBad: false });
  }
  
  return phones;
}

/**
 * Get all emails from loan data
 */
export function getEmailsFromLoan(loanData: any): EmailInfo[] {
  const emails = parseEmailData(loanData?.borrowerEmail);
  
  // If no emails found, return empty email template
  if (emails.length === 0) {
    return [{ email: '', label: '' }];
  }
  
  return emails;
}

/**
 * Format phone number for display
 */
export function formatPhoneDisplay(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Format based on length
  if (cleaned.length === 10) {
    // Format as (XXX) XXX-XXXX
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    // Format as 1 (XXX) XXX-XXXX
    return `1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  // Return original if not a standard format
  return phone;
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
 * Get activity icon based on type
 */
export function getActivityIcon(type: ActivityType): string {
  switch (type) {
    case CRM_CONSTANTS.ACTIVITY_TYPES.NOTE:
      return 'FileText';
    case CRM_CONSTANTS.ACTIVITY_TYPES.EMAIL:
      return 'Mail';
    case CRM_CONSTANTS.ACTIVITY_TYPES.TEXT:
      return 'MessageSquare';
    case CRM_CONSTANTS.ACTIVITY_TYPES.CALL:
      return 'Phone';
    case CRM_CONSTANTS.ACTIVITY_TYPES.APPOINTMENT:
      return 'Calendar';
    case CRM_CONSTANTS.ACTIVITY_TYPES.CONTACT_UPDATE:
      return 'User';
    case CRM_CONSTANTS.ACTIVITY_TYPES.PROFILE_PHOTO:
      return 'Camera';
    case CRM_CONSTANTS.ACTIVITY_TYPES.LOAN_UPDATE:
      return 'Edit';
    case CRM_CONSTANTS.ACTIVITY_TYPES.LOAN_CREATED:
      return 'Plus';
    case CRM_CONSTANTS.ACTIVITY_TYPES.LOAN_STATUS_CHANGE:
      return 'Activity';
    default:
      return 'Activity';
  }
}