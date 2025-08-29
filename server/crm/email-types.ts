/**
 * CRM Email Event Contracts
 * Fire-and-queue architecture with explicit event types
 */

// Event contracts for CRM email system
export interface CRMEmailRequestedEvent {
  loan_id: number;
  user_id: number;
  template_id?: string;
  subject: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  variables: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    type: string;
  }>;
  correlation_id: string;
  request_metadata?: {
    ip_addr?: string;
    user_agent?: string;
    timestamp: string;
  };
}

export interface CRMEmailSentEvent {
  loan_id: number;
  user_id: number;
  provider_message_id: string;
  artifact_id: string;
  correlation_id: string;
  duration_ms: number;
  recipient_count: number;
  template_id?: string;
}

export interface CRMEmailFailedEvent {
  loan_id: number;
  user_id: number;
  error_code: string;
  error_message: string;
  correlation_id: string;
  attempt_count: number;
  template_id?: string;
  will_retry: boolean;
}

// Validation schemas
export interface EmailValidationRules {
  max_recipients: number;
  max_attachment_size_bytes: number;
  max_total_attachment_size_bytes: number;
  max_attachments_count: number;
  allowed_mime_types: string[];
  subject_max_length: number;
}

export const DEFAULT_EMAIL_VALIDATION_RULES: EmailValidationRules = {
  max_recipients: 50,
  max_attachment_size_bytes: 10 * 1024 * 1024, // 10MB per file
  max_total_attachment_size_bytes: 25 * 1024 * 1024, // 25MB total
  max_attachments_count: 10,
  allowed_mime_types: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  subject_max_length: 255
};

// Template variable resolution
export interface EmailVariableContext {
  loan_id: number;
  contact_id?: number;
  user_id: number;
  custom_variables?: Record<string, any>;
}

export interface ResolvedEmailVariables {
  // Borrower information
  borrower_first_name: string;
  borrower_last_name: string;
  borrower_full_name: string;
  borrower_email: string;
  borrower_phone: string;
  
  // Loan information
  loan_number: string;
  loan_amount: string;
  interest_rate: string;
  monthly_payment: string;
  next_due_date: string;
  current_balance: string;
  
  // Property information
  property_address: string;
  property_city: string;
  property_state: string;
  property_zip: string;
  
  // System information
  servicer_name: string;
  servicer_phone: string;
  servicer_email: string;
  current_date: string;
  
  // Custom variables (from template)
  [key: string]: any;
}

// Do-not-contact enforcement
export interface ContactRestrictions {
  email_blocked: boolean;
  sms_blocked: boolean;
  phone_blocked: boolean;
  mail_blocked: boolean;
  reason?: string;
  effective_until?: Date;
}