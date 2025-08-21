/**
 * Centralized configuration constants for the application
 */

// Session configuration
export const SESSION_CONFIG = {
  SECRET: process.env.SESSION_SECRET || 'your-secret-key-here-change-in-production',
  MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  COOKIE_NAME: 'loanserve.sid',
  RESAVE: false,
  SAVE_UNINITIALIZED: false,
  ROLLING: true, // Reset expiry on activity
  COOKIE: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 24 * 60 * 60 * 1000
  }
} as const;

// Authentication configuration
export const AUTH_CONFIG = {
  LOGIN_ATTEMPTS: {
    MAX_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
    WINDOW_MS: 15 * 60 * 1000 // Track attempts within 15 minutes
  },
  PASSWORD_RESET: {
    TOKEN_EXPIRY_MS: 24 * 60 * 60 * 1000, // 24 hours
    TOKEN_LENGTH: 32
  },
  INVITATION: {
    TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
    TOKEN_LENGTH: 32
  },
  PASSWORD_POLICY: {
    MIN_LENGTH: 8,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBER: true,
    REQUIRE_SPECIAL: true
  }
} as const;

// Rate limiting configuration
export const RATE_LIMIT_CONFIG = {
  API: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100, // per window
    DELAY_AFTER: 50, // Start slowing down after 50 requests
    DELAY_MS: 1000 // 1 second delay
  },
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5, // per window for auth endpoints
    DELAY_MS: 2000 // 2 second delay
  },
  EMAIL: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 20, // per window
    DELAY_MS: 5000 // 5 second delay
  }
} as const;

// Resource names for permissions
export const RESOURCE_NAMES = {
  USERS: 'users',
  LOANS: 'loans',
  PAYMENTS: 'payments',
  ESCROW: 'escrow',
  INVESTOR_POSITIONS: 'investor_positions',
  REPORTS: 'reports',
  SETTINGS: 'settings',
  AUDIT_LOGS: 'audit_logs',
  DOCUMENTS: 'documents',
  CRM: 'crm',
  DAILY_SERVICING: 'daily_servicing'
} as const;

// Permission levels
export const PERMISSION_LEVELS = {
  NONE: 'none',
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin'
} as const;

// File upload configuration
export const FILE_UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  UPLOAD_DIR: './uploads'
} as const;

// Database configuration
export const DB_CONFIG = {
  CONNECTION_POOL: {
    MIN: 2,
    MAX: 10,
    IDLE_TIMEOUT_MS: 30000 // 30 seconds
  },
  QUERY_TIMEOUT_MS: 30000, // 30 seconds
  TRANSACTION_TIMEOUT_MS: 60000 // 60 seconds
} as const;

// Pagination defaults
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE: 1
} as const;

// Date formats
export const DATE_FORMATS = {
  DISPLAY: 'MM/DD/YYYY',
  DISPLAY_WITH_TIME: 'MM/DD/YYYY HH:mm:ss',
  ISO: 'YYYY-MM-DD',
  ISO_WITH_TIME: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  FILE_TIMESTAMP: 'YYYYMMDD_HHmmss'
} as const;

// Email configuration
export const EMAIL_CONFIG = {
  FROM_ADDRESS: process.env.SENDGRID_FROM_EMAIL || 'noreply@loanserve.com',
  REPLY_TO: process.env.REPLY_TO_EMAIL || 'support@loanserve.com',
  TEMPLATES: {
    PASSWORD_RESET: 'password-reset',
    USER_INVITATION: 'user-invitation',
    PAYMENT_REMINDER: 'payment-reminder',
    PAYMENT_RECEIVED: 'payment-received',
    LOAN_STATUS_CHANGE: 'loan-status-change'
  }
} as const;

// System roles (predefined)
export const SYSTEM_ROLES = {
  ADMIN: 'admin',
  LENDER: 'lender',
  BORROWER: 'borrower',
  INVESTOR: 'investor',
  ESCROW_OFFICER: 'escrow_officer',
  LEGAL: 'legal',
  SERVICER: 'servicer'
} as const;

// Audit event types
export const AUDIT_EVENT_TYPES = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  LOGIN_FAILED: 'login_failed',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  USER_ACTIVATED: 'user_activated',
  USER_DEACTIVATED: 'user_deactivated',
  ROLE_ASSIGNED: 'role_assigned',
  ROLE_REMOVED: 'role_removed',
  PERMISSION_CHANGED: 'permission_changed',
  LOAN_CREATED: 'loan_created',
  LOAN_UPDATED: 'loan_updated',
  LOAN_DELETED: 'loan_deleted',
  PAYMENT_PROCESSED: 'payment_processed',
  DOCUMENT_UPLOADED: 'document_uploaded',
  DOCUMENT_DELETED: 'document_deleted'
} as const;

// Export type helpers
export type ResourceName = typeof RESOURCE_NAMES[keyof typeof RESOURCE_NAMES];
export type PermissionLevel = typeof PERMISSION_LEVELS[keyof typeof PERMISSION_LEVELS];
export type SystemRole = typeof SYSTEM_ROLES[keyof typeof SYSTEM_ROLES];
export type AuditEventType = typeof AUDIT_EVENT_TYPES[keyof typeof AUDIT_EVENT_TYPES];