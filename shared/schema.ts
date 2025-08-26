import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { pgTable, text, timestamp, integer, serial, boolean, jsonb, json, decimal, uuid, varchar, date, index, pgEnum, uniqueIndex, time, primaryKey, unique, bigint } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ========================================
// ENUMS - Comprehensive status and type enumerations
// ========================================

export const userRoleEnum = pgEnum('user_role', [
  'lender', 
  'borrower', 
  'investor', 
  'escrow_officer', 
  'legal',
  'servicer',
  'admin'
]);

export const loanStatusEnum = pgEnum('loan_status', [
  'application',
  'underwriting',
  'approved',
  'active', 
  'current',
  'delinquent',
  'default',
  'forbearance',
  'modification',
  'foreclosure',
  'reo',
  'closed',
  'paid_off',
  'charged_off'
]);

export const loanTypeEnum = pgEnum('loan_type', [
  'conventional',
  'fha',
  'va',
  'usda',
  'jumbo',
  'portfolio',
  'hard_money',
  'bridge',
  'construction',
  'commercial',
  'reverse_mortgage'
]);

export const propertyTypeEnum = pgEnum('property_type', [
  'single_family',
  'condo',
  'townhouse',
  'multi_family',
  'manufactured',
  'commercial',
  'land',
  'mixed_use'
]);

export const entityTypeEnum = pgEnum('entity_type', [
  'individual',
  'corporation',
  'llc',
  'partnership',
  'trust',
  'estate',
  'government'
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'scheduled',
  'pending', 
  'processing',
  'completed', 
  'failed',
  'reversed',
  'partial',
  'late',
  'nsf',
  'waived'
]);

export const documentCategoryEnum = pgEnum('document_category', [
  'loan_application',
  'loan_agreement', 
  'promissory_note',
  'deed_of_trust',
  'mortgage',
  'security_agreement',
  'ucc_filing',
  'assignment',
  'modification',
  'forbearance_agreement',
  'insurance_policy',
  'tax_document',
  'escrow_statement',
  'title_report',
  'appraisal',
  'inspection',
  'financial_statement',
  'income_verification',
  'closing_disclosure',
  'settlement_statement',
  'reconveyance',
  'release',
  'legal_notice',
  'correspondence',
  'servicing_transfer',
  'compliance',
  'other'
]);

export const transactionTypeEnum = pgEnum('transaction_type', [
  'deposit', 
  'withdrawal', 
  'transfer',
  'payment_principal',
  'payment_interest',
  'payment_escrow',
  'payment_fee',
  'payment_late_fee',
  'insurance_premium',
  'property_tax',
  'hoa_fee',
  'disbursement',
  'adjustment',
  'refund'
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'payment_due',
  'payment_received',
  'payment_failed',
  'payment_late',
  'document_required',
  'document_received',
  'escrow_shortage',
  'escrow_surplus',
  'escrow_analysis',
  'insurance_expiring',
  'tax_due',
  'rate_change',
  'maturity_approaching',
  'system',
  'legal',
  'compliance'
]);

export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent', 'critical']);

export const frequencyEnum = pgEnum('frequency', [
  'once',
  'daily',
  'weekly',
  'bi_weekly',
  'semi_monthly',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual'
]);

export const disbursementTypeEnum = pgEnum('disbursement_type', [
  'taxes',
  'insurance', 
  'hoa',
  'other'
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'check',
  'ach',
  'wire',
  'cash',
  'credit_card',
  'online'
]);

// For outbound disbursements only (check, ACH, wire)
export const disbursementPaymentMethodEnum = pgEnum('disbursement_payment_method', [
  'check',
  'ach',
  'wire'
]);

export const disbursementStatusEnum = pgEnum('disbursement_status', [
  'active',
  'on_hold',
  'suspended',
  'cancelled',
  'completed',
  'terminated' // For historical records that are no longer active (e.g., old insurance policies)
]);

export const collectionStatusEnum = pgEnum('collection_status', [
  'current',
  'contact_made',
  'promise_to_pay',
  'arrangement_made',
  'broken_promise',
  'skip_trace',
  'legal_review',
  'foreclosure_initiated',
  'charge_off_pending'
]);

// ========================================
// RBAC (Role-Based Access Control) TABLES
// ========================================

// Permissions table - Define available permissions in the system
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  permissionName: text("permission_name").unique().notNull(),
  description: text("description"),
  resource: text("resource").notNull(), // e.g., 'loan', 'user', 'payment'
  action: text("action").notNull(), // e.g., 'create', 'read', 'update', 'delete'
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    nameIdx: index("permission_name_idx").on(table.permissionName),
    resourceActionIdx: index("permission_resource_action_idx").on(table.resource, table.action),
  };
});

// Role Permissions - Junction table for roles and permissions
export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  permissionId: integer("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    rolePermissionUnique: uniqueIndex("role_permission_unique_idx").on(table.roleId, table.permissionId),
    roleIdx: index("role_permissions_role_idx").on(table.roleId),
    permissionIdx: index("role_permissions_permission_idx").on(table.permissionId),
  };
});

// Roles table - Defines available system roles
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  roleName: text("role_name").unique().notNull(),
  description: text("description"),
  permissions: jsonb("permissions"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    roleNameIdx: index("role_name_idx").on(table.roleName),
    activeIdx: index("role_active_idx").on(table.isActive),
  };
});

// User Roles junction table - Maps users to roles
export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  assignedBy: integer("assigned_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata"),
}, (table) => {
  return {
    userRoleUnique: uniqueIndex("user_role_unique_idx").on(table.userId, table.roleId),
    userIdx: index("user_roles_user_idx").on(table.userId),
    roleIdx: index("user_roles_role_idx").on(table.roleId),
  };
});

// Login Attempts - Track login attempts for security
export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  username: text("username"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  success: boolean("success").notNull(),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
}, (table) => {
  return {
    userIdx: index("login_attempts_user_idx").on(table.userId),
    attemptedIdx: index("login_attempts_attempted_idx").on(table.attemptedAt),
    successIdx: index("login_attempts_success_idx").on(table.success),
  };
});

// Auth Events - Log authentication events
export const authEvents = pgTable("auth_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  eventType: text("event_type").notNull(), // 'login', 'logout', 'password_change', 'mfa_enabled', etc.
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  sessionId: text("session_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index("auth_events_user_idx").on(table.userId),
    eventTypeIdx: index("auth_events_type_idx").on(table.eventType),
    createdIdx: index("auth_events_created_idx").on(table.createdAt),
  };
});

// Sessions - Track active user sessions
export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
}, (table) => {
  return {
    expireIdx: index("sessions_expire_idx").on(table.expire),
  };
});

// System Settings - Store system configuration
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  settingKey: text("setting_key").unique().notNull(),
  settingValue: jsonb("setting_value").notNull(),
  settingType: text("setting_type").notNull(), // 'security', 'email', 'general', etc.
  description: text("description"),
  isEncrypted: boolean("is_encrypted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
}, (table) => {
  return {
    keyIdx: index("system_settings_key_idx").on(table.settingKey),
    typeIdx: index("system_settings_type_idx").on(table.settingType),
  };
});

// Password Reset Tokens - Track password reset requests
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  token: text("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    tokenIdx: index("password_reset_token_idx").on(table.token),
    userIdx: index("password_reset_user_idx").on(table.userId),
    expiresIdx: index("password_reset_expires_idx").on(table.expiresAt),
  };
});

// User IP Allowlist - Restrict access by IP addresses
export const userIpAllowlist = pgTable("user_ip_allowlist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  ipAddress: text("ip_address").notNull(),
  cidrRange: text("cidr_range"),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
}, (table) => {
  return {
    userIpUnique: uniqueIndex("user_ip_unique_idx").on(table.userId, table.ipAddress),
    userIdx: index("user_ip_allowlist_user_idx").on(table.userId),
    activeIdx: index("user_ip_allowlist_active_idx").on(table.isActive),
  };
});

// Invitations - Track user invitations
export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").unique().notNull(),
  roleId: integer("role_id").references(() => roles.id),
  invitedBy: integer("invited_by").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  acceptedUserId: integer("accepted_user_id").references(() => users.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    tokenIdx: index("invitation_token_idx").on(table.token),
    emailIdx: index("invitation_email_idx").on(table.email),
    expiresIdx: index("invitation_expires_idx").on(table.expiresAt),
  };
});

// MFA Devices - Track MFA devices per user
export const mfaDevices = pgTable("mfa_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  deviceType: text("device_type").notNull(), // 'totp', 'sms', 'email', 'webauthn'
  deviceName: text("device_name"),
  secret: text("secret"), // Encrypted
  phoneNumber: text("phone_number"),
  email: text("email"),
  publicKey: text("public_key"),
  isActive: boolean("is_active").default(true).notNull(),
  isPrimary: boolean("is_primary").default(false),
  lastUsedAt: timestamp("last_used_at"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index("mfa_device_user_idx").on(table.userId),
    typeIdx: index("mfa_device_type_idx").on(table.deviceType),
    activeIdx: index("mfa_device_active_idx").on(table.isActive),
  };
});

// Alias for MFA Devices - Some services use this name
export const userMfaFactors = mfaDevices;

// MFA Backup Codes - Store backup codes for MFA recovery
export const mfaBackupCodes = pgTable("mfa_backup_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  code: text("code").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userCodeUnique: uniqueIndex("mfa_backup_user_code_idx").on(table.userId, table.code),
    userIdx: index("mfa_backup_user_idx").on(table.userId),
  };
});

// MFA Challenges - Track active MFA challenges
export const mfaChallenges = pgTable("mfa_challenges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  challengeType: text("challenge_type").notNull(), // 'totp', 'sms', 'email', 'webauthn'
  challenge: text("challenge"), // The challenge code/data
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  verifiedAt: timestamp("verified_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index("mfa_challenge_user_idx").on(table.userId),
    typeIdx: index("mfa_challenge_type_idx").on(table.challengeType),
    expiresIdx: index("mfa_challenge_expires_idx").on(table.expiresAt),
  };
});

// MFA Audit Log - Track MFA-related events
export const mfaAuditLog = pgTable("mfa_audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  deviceId: integer("device_id").references(() => mfaDevices.id),
  eventType: text("event_type").notNull(), // 'setup', 'verify', 'challenge_success', 'challenge_failed', 'remove'
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index("mfa_audit_user_idx").on(table.userId),
    deviceIdx: index("mfa_audit_device_idx").on(table.deviceId),
    eventTypeIdx: index("mfa_audit_event_idx").on(table.eventType),
    createdIdx: index("mfa_audit_created_idx").on(table.createdAt),
  };
});

// ========================================
// CORE TABLES
// ========================================

// Users table - System users with role-based access
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  middleName: text("middle_name"),
  // role field removed - using RBAC system with user_roles junction table instead
  phone: text("phone"),
  mobilePhone: text("mobile_phone"),
  fax: text("fax"),
  address: text("address"),
  address2: text("address_2"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country"),
  dateOfBirth: date("date_of_birth"),
  ssn: text("ssn"), // Encrypted
  employerName: text("employer_name"),
  employerPhone: text("employer_phone"),
  jobTitle: text("job_title"),
  yearsEmployed: integer("years_employed"),
  monthlyIncome: decimal("monthly_income", { precision: 12, scale: 2 }),
  isActive: boolean("is_active").default(true),
  emailVerified: boolean("email_verified").default(false),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  profileImage: text("profile_image"),
  preferences: jsonb("preferences"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastLogin: timestamp("last_login"),
  failedLoginAttempts: integer("failed_login_attempts"),
  lockedUntil: timestamp("locked_until"),
  status: text("status"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: text("last_login_ip"),
  failedLoginCount: integer("failed_login_count"),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaRequired: boolean("mfa_required").default(false),
  requireMfaForSensitive: boolean("require_mfa_for_sensitive").default(true),
}, (table) => {
  return {
    emailIdx: index("user_email_idx").on(table.email),
    // roleIdx removed - using RBAC system with user_roles junction table instead
    activeIdx: index("user_active_idx").on(table.isActive),
  };
});

// Borrower Entities - Can be individuals or companies
export const borrowerEntities = pgTable("borrower_entities", {
  id: serial("id").primaryKey(),
  entityType: entityTypeEnum("entity_type").notNull(),
  // Individual fields
  firstName: text("first_name"),
  lastName: text("last_name"),
  middleName: text("middle_name"),
  suffix: text("suffix"),
  dateOfBirth: date("date_of_birth"),
  ssn: text("ssn"), // Encrypted
  // Entity fields
  entityName: text("entity_name"),
  ein: text("ein"), // Employer Identification Number
  formationDate: date("formation_date"),
  formationState: text("formation_state"),
  // Common fields
  email: text("email"),
  phone: text("phone"),
  mobilePhone: text("mobile_phone"),
  fax: text("fax"),
  website: text("website"),
  // Address
  mailingAddress: text("mailing_address"),
  mailingAddress2: text("mailing_address_2"),
  mailingCity: text("mailing_city"),
  mailingState: text("mailing_state"),
  mailingZip: text("mailing_zip"),
  mailingCountry: text("mailing_country").default('USA'),
  // Financial information
  creditScore: integer("credit_score"),
  creditScoreEquifax: integer("credit_score_equifax"),
  creditScoreExperian: integer("credit_score_experian"),
  creditScoreTransunion: integer("credit_score_transunion"),
  monthlyIncome: decimal("monthly_income", { precision: 12, scale: 2 }),
  totalAssets: decimal("total_assets", { precision: 15, scale: 2 }),
  totalLiabilities: decimal("total_liabilities", { precision: 15, scale: 2 }),
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  verificationStatus: text("verification_status").default('pending'),
  verificationDate: timestamp("verification_date"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    entityTypeIdx: index("borrower_entity_type_idx").on(table.entityType),
    emailIdx: index("borrower_email_idx").on(table.email),
    ssnIdx: index("borrower_ssn_idx").on(table.ssn),
    einIdx: index("borrower_ein_idx").on(table.ein),
  };
});

// Properties - Real estate collateral
export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  propertyType: propertyTypeEnum("property_type").notNull(),
  // Address
  address: text("address").notNull(),
  address2: text("address_2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  county: text("county"),
  country: text("country").default('USA'),
  // Legal description
  legalDescription: text("legal_description"),
  apn: text("apn"), // Assessor's Parcel Number
  lotNumber: text("lot_number"),
  blockNumber: text("block_number"),
  subdivision: text("subdivision"),
  // Property details
  yearBuilt: integer("year_built"),
  squareFeet: integer("square_feet"),
  lotSize: decimal("lot_size", { precision: 10, scale: 2 }),
  bedrooms: integer("bedrooms"),
  bathrooms: decimal("bathrooms", { precision: 3, scale: 1 }),
  stories: integer("stories"),
  garage: boolean("garage").default(false),
  garageSpaces: integer("garage_spaces"),
  pool: boolean("pool").default(false),
  // Valuation
  purchasePrice: decimal("purchase_price", { precision: 15, scale: 2 }),
  purchaseDate: date("purchase_date"),
  originalAppraisalValue: decimal("original_appraisal_value", { precision: 15, scale: 2 }),
  originalAppraisalDate: date("original_appraisal_date"),
  currentValue: decimal("current_value", { precision: 15, scale: 2 }),
  currentValueDate: date("current_value_date"),
  currentValueSource: text("current_value_source"),
  // Tax and insurance
  annualPropertyTax: decimal("annual_property_tax", { precision: 10, scale: 2 }),
  annualInsurance: decimal("annual_insurance", { precision: 10, scale: 2 }),
  annualHOA: decimal("annual_hoa", { precision: 10, scale: 2 }),
  taxId: text("tax_id"),
  // Status
  occupancyStatus: text("occupancy_status"), // 'owner_occupied', 'rental', 'second_home', 'vacant'
  rentalIncome: decimal("rental_income", { precision: 10, scale: 2 }),
  primaryResidence: boolean("primary_residence").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    apnIdx: index("property_apn_idx").on(table.apn),
    addressIdx: index("property_address_idx").on(table.address, table.city, table.state),
    typeIdx: index("property_type_idx").on(table.propertyType),
  };
});

// Loans - Main loan records
export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  loanNumber: text("loan_number").unique().notNull(),
  loanType: loanTypeEnum("loan_type").notNull(),
  loanPurpose: text("loan_purpose"), // 'purchase', 'refinance', 'cash_out', 'construction'
  // Parties
  lenderId: integer("lender_id").references(() => users.id),
  servicerId: integer("servicer_id").references(() => users.id),
  investorId: integer("investor_id").references(() => users.id),
  // Property
  propertyId: integer("property_id").references(() => properties.id).notNull(),
  // Loan terms
  originalAmount: decimal("original_amount", { precision: 15, scale: 2 }).notNull(),
  principalBalance: decimal("principal_balance", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 6, scale: 4 }).notNull(),
  rateType: text("rate_type").notNull(), // 'fixed', 'variable', 'adjustable'
  indexType: text("index_type"), // 'SOFR', 'prime', 'LIBOR'
  margin: decimal("margin", { precision: 6, scale: 4 }),
  rateAdjustmentFrequency: integer("rate_adjustment_frequency"), // months
  rateCapInitial: decimal("rate_cap_initial", { precision: 6, scale: 4 }),
  rateCapPeriodic: decimal("rate_cap_periodic", { precision: 6, scale: 4 }),
  rateCapLifetime: decimal("rate_cap_lifetime", { precision: 6, scale: 4 }),
  rateFloor: decimal("rate_floor", { precision: 6, scale: 4 }),
  // Terms
  loanTerm: integer("loan_term").notNull(), // months
  amortizationTerm: integer("amortization_term"), // months
  balloonMonths: integer("balloon_months"),
  balloonAmount: decimal("balloon_amount", { precision: 15, scale: 2 }),
  prepaymentPenalty: boolean("prepayment_penalty").default(false),
  prepaymentPenaltyTerm: integer("prepayment_penalty_term"), // months
  prepaymentPenaltyAmount: decimal("prepayment_penalty_amount", { precision: 10, scale: 2 }),
  prepaymentExpirationDate: date("prepayment_expiration_date"),
  // Dates
  originationDate: date("origination_date").notNull(),
  firstPaymentDate: date("first_payment_date").notNull(),
  maturityDate: date("maturity_date").notNull(),
  nextPaymentDate: date("next_payment_date"),
  lastPaymentDate: date("last_payment_date"),
  // Payment details
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }).notNull(),
  paymentFrequency: frequencyEnum("payment_frequency").notNull(),
  escrowPayment: decimal("escrow_payment", { precision: 10, scale: 2 }),
  totalMonthlyPayment: decimal("total_monthly_payment", { precision: 10, scale: 2 }),
  // LTV and ratios
  originalLTV: decimal("original_ltv", { precision: 5, scale: 2 }),
  currentLTV: decimal("current_ltv", { precision: 5, scale: 2 }),
  combinedLTV: decimal("combined_ltv", { precision: 5, scale: 2 }),
  debtToIncomeRatio: decimal("debt_to_income_ratio", { precision: 5, scale: 2 }),
  // Late fees
  lateFeeGraceDays: integer("late_fee_grace_days").default(15),
  lateFeeAmount: decimal("late_fee_amount", { precision: 10, scale: 2 }),
  lateFeePercent: decimal("late_fee_percent", { precision: 5, scale: 2 }),
  // Servicing
  servicingFee: decimal("servicing_fee", { precision: 10, scale: 2 }),
  servicingFeePercent: decimal("servicing_fee_percent", { precision: 5, scale: 4 }),
  investorOwnershipPercent: decimal("investor_ownership_percent", { precision: 5, scale: 4 }).default('100.00'),
  // Status
  loanStatus: loanStatusEnum("loan_status").notNull().default('active'),
  paymentStatus: text("payment_status"), // 'current', '30_days', '60_days', '90_days', '120_plus'
  foreclosureStatus: text("foreclosure_status"),
  bankruptcyStatus: text("bankruptcy_status"),
  // Delinquency
  daysDelinquent: integer("days_delinquent").default(0),
  delinquentAmount: decimal("delinquent_amount", { precision: 10, scale: 2 }).default('0'),
  lastDelinquencyDate: date("last_delinquency_date"),
  timesThirtyDaysLate: integer("times_30_days_late").default(0),
  timesSixtyDaysLate: integer("times_60_days_late").default(0),
  timesNinetyDaysLate: integer("times_90_days_late").default(0),
  // Collections
  inForeclosure: boolean("in_foreclosure").default(false),
  foreclosureStartDate: date("foreclosure_start_date"),
  foreclosureSaleDate: date("foreclosure_sale_date"),
  inBankruptcy: boolean("in_bankruptcy").default(false),
  bankruptcyChapter: text("bankruptcy_chapter"),
  bankruptcyFilingDate: date("bankruptcy_filing_date"),
  // Insurance
  hasPropertyInsurance: boolean("has_property_insurance").default(true),
  propertyInsuranceCarrier: text("property_insurance_carrier"),
  propertyInsurancePolicyNumber: text("property_insurance_policy_number"),
  propertyInsuranceExpiration: date("property_insurance_expiration"),
  propertyInsuranceAmount: decimal("property_insurance_amount", { precision: 10, scale: 2 }),
  hasFloodInsurance: boolean("has_flood_insurance").default(false),
  floodInsuranceCarrier: text("flood_insurance_carrier"),
  floodInsurancePolicyNumber: text("flood_insurance_policy_number"),
  floodInsuranceExpiration: date("flood_insurance_expiration"),
  floodInsuranceAmount: decimal("flood_insurance_amount", { precision: 10, scale: 2 }),
  // MI/PMI
  hasMI: boolean("has_mi").default(false),
  miCompany: text("mi_company"),
  miCertificateNumber: text("mi_certificate_number"),
  miCoveragePercent: decimal("mi_coverage_percent", { precision: 5, scale: 2 }),
  miMonthlyAmount: decimal("mi_monthly_amount", { precision: 10, scale: 2 }),
  miRemovalDate: date("mi_removal_date"),
  // Notes and metadata
  internalNotes: text("internal_notes"),
  servicingNotes: text("servicing_notes"),
  metadata: jsonb("metadata"),
  // Audit fields
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
}, (table) => {
  return {
    loanNumberIdx: index("loan_number_idx").on(table.loanNumber),
    propertyIdx: index("loan_property_idx").on(table.propertyId),
    lenderIdx: index("loan_lender_idx").on(table.lenderId),
    investorIdx: index("loan_investor_idx").on(table.investorId),
    statusIdx: index("loan_status_idx").on(table.loanStatus),
    paymentStatusIdx: index("loan_payment_status_idx").on(table.paymentStatus),
    nextPaymentIdx: index("loan_next_payment_idx").on(table.nextPaymentDate),
  };
});

// Loan Borrowers - Junction table for loan-borrower relationships
export const loanBorrowers = pgTable("loan_borrowers", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id).notNull(),
  borrowerType: text("borrower_type").notNull(), // 'primary', 'co_borrower', 'guarantor', 'trustee'
  borrowerPosition: integer("borrower_position").default(1), // Order of borrowers
  ownershipPercent: decimal("ownership_percent", { precision: 5, scale: 2 }),
  liabilityPercent: decimal("liability_percent", { precision: 5, scale: 2 }).default('100.00'),
  signingCapacity: text("signing_capacity"), // 'individual', 'trustee', 'power_of_attorney', 'corporate_officer'
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanBorrowerIdx: uniqueIndex("loan_borrower_idx").on(table.loanId, table.borrowerEntityId),
    loanIdx: index("loan_borrowers_loan_idx").on(table.loanId),
    borrowerIdx: index("loan_borrowers_borrower_idx").on(table.borrowerEntityId),
  };
});

// Payments - Payment transactions
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  paymentDate: date("payment_date").notNull(),
  effectiveDate: date("effective_date").notNull(),
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }).notNull(),
  // Allocation
  principalAmount: decimal("principal_amount", { precision: 10, scale: 2 }).default('0'),
  interestAmount: decimal("interest_amount", { precision: 10, scale: 2 }).default('0'),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }).default('0'),
  lateFeeAmount: decimal("late_fee_amount", { precision: 10, scale: 2 }).default('0'),
  otherFeeAmount: decimal("other_fee_amount", { precision: 10, scale: 2 }).default('0'),
  // Running balances after payment
  principalBalance: decimal("principal_balance", { precision: 15, scale: 2 }),
  escrowBalance: decimal("escrow_balance", { precision: 10, scale: 2 }),
  // Payment details
  paymentMethod: paymentMethodEnum("payment_method"),
  checkNumber: text("check_number"),
  transactionReference: text("transaction_reference"),
  // Status
  paymentStatus: paymentStatusEnum("payment_status").notNull().default('pending'),
  nsf: boolean("nsf").default(false),
  reversed: boolean("reversed").default(false),
  reversalDate: date("reversal_date"),
  reversalReason: text("reversal_reason"),
  // Processing
  processedDate: timestamp("processed_date"),
  processedBy: integer("processed_by").references(() => users.id),
  // Notes
  memo: text("memo"),
  internalNotes: text("internal_notes"),
  metadata: jsonb("metadata"),
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("payment_loan_idx").on(table.loanId),
    dateIdx: index("payment_date_idx").on(table.paymentDate),
    effectiveDateIdx: index("payment_effective_date_idx").on(table.effectiveDate),
    statusIdx: index("payment_status_idx").on(table.paymentStatus),
  };
});

// Payment Schedule - Pre-calculated payment schedule
export const paymentSchedule = pgTable("payment_schedule", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  paymentNumber: integer("payment_number").notNull(),
  dueDate: date("due_date").notNull(),
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }).notNull(),
  principalAmount: decimal("principal_amount", { precision: 10, scale: 2 }).notNull(),
  interestAmount: decimal("interest_amount", { precision: 10, scale: 2 }).notNull(),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }).default('0'),
  remainingBalance: decimal("remaining_balance", { precision: 15, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").default(false),
  paymentId: integer("payment_id").references(() => payments.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("schedule_loan_idx").on(table.loanId),
    dueDateIdx: index("schedule_due_date_idx").on(table.dueDate),
    paymentNumberIdx: index("schedule_payment_number_idx").on(table.loanId, table.paymentNumber),
  };
});

// Fee Templates - Standard fee configurations
export const feeTemplates = pgTable("fee_templates", {
  id: serial("id").primaryKey(),
  templateName: text("template_name").unique().notNull(),
  description: text("description"),
  feeType: text("fee_type").notNull(), // 'late_fee', 'nsf_fee', 'processing_fee', etc.
  feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }),
  feePercent: decimal("fee_percent", { precision: 5, scale: 4 }),
  feeMinimum: decimal("fee_minimum", { precision: 10, scale: 2 }),
  feeMaximum: decimal("fee_maximum", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    typeIdx: index("fee_template_type_idx").on(table.feeType),
    activeIdx: index("fee_template_active_idx").on(table.isActive),
  };
});

// Loan Fees - Configurable fees per loan
export const loanFees = pgTable("loan_fees", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  feeName: text("fee_name").notNull(),
  feeType: text("fee_type").notNull(), // 'late_fee', 'nsf_fee', 'processing_fee', 'modification_fee', 'payoff_fee'
  feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }),
  feePercent: decimal("fee_percent", { precision: 5, scale: 4 }),
  feeMinimum: decimal("fee_minimum", { precision: 10, scale: 2 }),
  feeMaximum: decimal("fee_maximum", { precision: 10, scale: 2 }),
  feeFrequency: frequencyEnum("fee_frequency"),
  isActive: boolean("is_active").default(true),
  effectiveDate: date("effective_date"),
  expirationDate: date("expiration_date"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("fee_loan_idx").on(table.loanId),
    typeIdx: index("fee_type_idx").on(table.feeType),
    activeIdx: index("fee_active_idx").on(table.isActive),
  };
});

// ========================================
// ESCROW TABLES
// ========================================

// Escrow Accounts - Main escrow account per loan
export const escrowAccounts = pgTable("escrow_accounts", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).unique().notNull(),
  accountNumber: text("account_number").unique().notNull(),
  // Balances
  currentBalance: decimal("current_balance", { precision: 10, scale: 2 }).default('0').notNull(),
  availableBalance: decimal("available_balance", { precision: 10, scale: 2 }).default('0').notNull(),
  cushionAmount: decimal("cushion_amount", { precision: 10, scale: 2 }).default('0'),
  minimumBalance: decimal("minimum_balance", { precision: 10, scale: 2 }).default('0'),
  targetBalance: decimal("target_balance", { precision: 10, scale: 2 }).default('0'),
  // Analysis dates
  lastAnalysisDate: date("last_analysis_date"),
  nextAnalysisDate: date("next_analysis_date"),
  // Escrow components
  monthlyTaxAmount: decimal("monthly_tax_amount", { precision: 10, scale: 2 }).default('0'),
  monthlyInsuranceAmount: decimal("monthly_insurance_amount", { precision: 10, scale: 2 }).default('0'),
  monthlyMIAmount: decimal("monthly_mi_amount", { precision: 10, scale: 2 }).default('0'),
  monthlyHOAAmount: decimal("monthly_hoa_amount", { precision: 10, scale: 2 }).default('0'),
  monthlyOtherAmount: decimal("monthly_other_amount", { precision: 10, scale: 2 }).default('0'),
  totalMonthlyAmount: decimal("total_monthly_amount", { precision: 10, scale: 2 }).default('0'),
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  hasShortage: boolean("has_shortage").default(false),
  shortageAmount: decimal("shortage_amount", { precision: 10, scale: 2 }),
  shortagePaymentAmount: decimal("shortage_payment_amount", { precision: 10, scale: 2 }),
  shortagePaymentMonths: integer("shortage_payment_months"),
  hasSurplus: boolean("has_surplus").default(false),
  surplusAmount: decimal("surplus_amount", { precision: 10, scale: 2 }),
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
}, (table) => {
  return {
    loanIdx: index("escrow_loan_idx").on(table.loanId),
    accountNumberIdx: index("escrow_account_number_idx").on(table.accountNumber),
  };
});

// Escrow Transactions - All transactions in/out of escrow
export const escrowTransactions = pgTable("escrow_transactions", {
  id: serial("id").primaryKey(),
  escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
  transactionDate: date("transaction_date").notNull(),
  transactionType: transactionTypeEnum("transaction_type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull(), // Balance after transaction
  paymentId: integer("payment_id").references(() => payments.id),
  disbursementId: integer("disbursement_id").references(() => escrowDisbursements.id),
  description: text("description"),
  reference: text("reference"),
  reversedBy: integer("reversed_by").references(() => escrowTransactions.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
}, (table) => {
  return {
    accountIdx: index("escrow_trans_account_idx").on(table.escrowAccountId),
    dateIdx: index("escrow_trans_date_idx").on(table.transactionDate),
    typeIdx: index("escrow_trans_type_idx").on(table.transactionType),
  };
});

// Escrow Disbursements - Scheduled payments from escrow
export const escrowDisbursements = pgTable("escrow_disbursements", {
  id: serial("id").primaryKey(),
  escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
  disbursementType: disbursementTypeEnum("disbursement_type").notNull(),
  // Payee information
  payeeName: text("payee_name").notNull(),
  payeeAddress: text("payee_address"),
  payeeCity: text("payee_city"),
  payeeState: text("payee_state"),
  payeeZip: text("payee_zip"),
  payeePhone: text("payee_phone"),
  payeeEmail: text("payee_email"),
  payeeAccountNumber: text("payee_account_number"), // Account number with payee (e.g., tax parcel, policy number)
  // Payment details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  frequency: frequencyEnum("frequency").notNull(),
  firstDueDate: date("first_due_date").notNull(),
  nextDueDate: date("next_due_date"),
  lastDueDate: date("last_due_date"),
  // Status and tracking
  status: disbursementStatusEnum("status").notNull().default('active'),
  lastPaymentDate: date("last_payment_date"),
  lastPaymentAmount: decimal("last_payment_amount", { precision: 10, scale: 2 }),
  nextPaymentAmount: decimal("next_payment_amount", { precision: 10, scale: 2 }),
  yearlyAmount: decimal("yearly_amount", { precision: 10, scale: 2 }),
  // Insurance specific
  isPrimaryInsurance: boolean("is_primary_insurance").default(false),
  insuranceType: text("insurance_type"), // 'hazard', 'flood', 'earthquake', 'wind', 'liability'
  policyNumber: text("policy_number"),
  policyEffectiveDate: date("policy_effective_date"),
  policyExpirationDate: date("policy_expiration_date"),
  coverageAmount: decimal("coverage_amount", { precision: 15, scale: 2 }),
  deductible: decimal("deductible", { precision: 10, scale: 2 }),
  // Tax specific
  taxType: text("tax_type"), // 'property', 'county', 'city', 'school', 'special_assessment'
  taxYear: integer("tax_year"),
  taxParcelNumber: text("tax_parcel_number"),
  assessedValue: decimal("assessed_value", { precision: 15, scale: 2 }),
  millRate: decimal("mill_rate", { precision: 10, scale: 6 }),
  // HOA specific
  hoaName: text("hoa_name"),
  hoaManagementCompany: text("hoa_management_company"),
  // Payment method
  disbursementMethod: disbursementPaymentMethodEnum("disbursement_method").default('check'),
  achRoutingNumber: text("ach_routing_number"),
  achAccountNumber: text("ach_account_number"),
  achAccountType: text("ach_account_type"), // 'checking', 'savings'
  // Additional fields
  priority: integer("priority").default(1), // Order of payment when multiple disbursements
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: integer("approved_by").references(() => users.id),
  approvalDate: timestamp("approval_date"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
}, (table) => {
  return {
    accountIdx: index("disbursement_account_idx").on(table.escrowAccountId),
    typeIdx: index("disbursement_type_idx").on(table.disbursementType),
    statusIdx: index("disbursement_status_idx").on(table.status),
    nextDueIdx: index("disbursement_next_due_idx").on(table.nextDueDate),
  };
});

// Escrow Disbursement Payments - Actual payments made for disbursements
export const escrowDisbursementPayments = pgTable("escrow_disbursement_payments", {
  id: serial("id").primaryKey(),
  disbursementId: integer("disbursement_id").references(() => escrowDisbursements.id).notNull(),
  escrowTransactionId: integer("escrow_transaction_id").references(() => escrowTransactions.id),
  paymentDate: date("payment_date").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  checkNumber: text("check_number"),
  transactionReference: text("transaction_reference"),
  confirmationNumber: text("confirmation_number"),
  paymentMethod: disbursementPaymentMethodEnum("payment_method"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default('completed'),
  clearedDate: date("cleared_date"),
  voidDate: date("void_date"),
  voidReason: text("void_reason"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
}, (table) => {
  return {
    disbursementIdx: index("disb_payment_disbursement_idx").on(table.disbursementId),
    dateIdx: index("disb_payment_date_idx").on(table.paymentDate),
    statusIdx: index("disb_payment_status_idx").on(table.paymentStatus),
  };
});

// ========================================
// DOCUMENT MANAGEMENT TABLES
// ========================================

// Documents - All documents related to loans
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  propertyId: integer("property_id").references(() => properties.id),
  documentCategory: documentCategoryEnum("document_category").notNull(),
  documentType: text("document_type").notNull(), // More specific type within category
  documentName: text("document_name").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"), // bytes
  mimeType: text("mime_type"),
  storageUrl: text("storage_url").notNull(),
  storageKey: text("storage_key"),
  // Document details
  documentDate: date("document_date"),
  effectiveDate: date("effective_date"),
  expirationDate: date("expiration_date"),
  recordedDate: date("recorded_date"),
  instrumentNumber: text("instrument_number"),
  bookPage: text("book_page"),
  // Status
  status: text("status").default('active'), // 'draft', 'pending_review', 'active', 'expired', 'superseded', 'void'
  isPublic: boolean("is_public").default(false),
  requiresSignature: boolean("requires_signature").default(false),
  isSigned: boolean("is_signed").default(false),
  signedDate: date("signed_date"),
  // Version control
  version: integer("version").default(1),
  parentDocumentId: integer("parent_document_id").references(() => documents.id),
  // Metadata
  extractedText: text("extracted_text"), // For search
  ocrProcessed: boolean("ocr_processed").default(false),
  tags: text("tags"),
  metadata: jsonb("metadata"),
  // Audit
  uploadedBy: integer("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  lastAccessedAt: timestamp("last_accessed_at"),
  lastAccessedBy: integer("last_accessed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("document_loan_idx").on(table.loanId),
    borrowerIdx: index("document_borrower_idx").on(table.borrowerEntityId),
    propertyIdx: index("document_property_idx").on(table.propertyId),
    categoryIdx: index("document_category_idx").on(table.documentCategory),
    statusIdx: index("document_status_idx").on(table.status),
    documentDateIdx: index("document_date_idx").on(table.documentDate),
  };
});

// ========================================
// NOTIFICATION SYSTEM TABLES
// ========================================

// Notifications - System and user notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  loanId: integer("loan_id").references(() => loans.id),
  notificationType: notificationTypeEnum("notification_type").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  priority: priorityEnum("priority").default('medium'),
  // Delivery
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  smsSent: boolean("sms_sent").default(false),
  smsSentAt: timestamp("sms_sent_at"),
  pushSent: boolean("push_sent").default(false),
  pushSentAt: timestamp("push_sent_at"),
  // Status
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  isArchived: boolean("is_archived").default(false),
  archivedAt: timestamp("archived_at"),
  // Action required
  requiresAction: boolean("requires_action").default(false),
  actionType: text("action_type"),
  actionUrl: text("action_url"),
  actionDeadline: timestamp("action_deadline"),
  actionCompleted: boolean("action_completed").default(false),
  actionCompletedAt: timestamp("action_completed_at"),
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index("notification_user_idx").on(table.userId),
    loanIdx: index("notification_loan_idx").on(table.loanId),
    typeIdx: index("notification_type_idx").on(table.notificationType),
    readIdx: index("notification_read_idx").on(table.isRead),
    createdIdx: index("notification_created_idx").on(table.createdAt),
  };
});

// ========================================
// CRM TABLES
// ========================================

// CRM Activity - Track all customer relationship activities
export const crmActivity = pgTable("crm_activity", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  activityType: text("activity_type").notNull(), // 'note', 'email', 'text', 'call', 'appointment', etc.
  subject: text("subject"),
  description: text("description"),
  callDuration: integer("call_duration"), // seconds
  callDirection: text("call_direction"), // 'inbound', 'outbound'
  callStatus: text("call_status"), // 'scheduled', 'completed', 'cancelled', 'no_answer'
  appointmentDate: timestamp("appointment_date"),
  appointmentLocation: text("appointment_location"),
  metadata: jsonb("metadata"),
  performedBy: integer("performed_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_activity_loan_idx").on(table.loanId),
    borrowerIdx: index("crm_activity_borrower_idx").on(table.borrowerEntityId),
    typeIdx: index("crm_activity_type_idx").on(table.activityType),
    performedByIdx: index("crm_activity_performed_by_idx").on(table.performedBy),
    createdIdx: index("crm_activity_created_idx").on(table.createdAt),
  };
});

// CRM Notes - Store notes related to contacts or loans
export const crmNotes = pgTable("crm_notes", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  subject: text("subject"),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_notes_loan_idx").on(table.loanId),
    borrowerIdx: index("crm_notes_borrower_idx").on(table.borrowerEntityId),
    createdByIdx: index("crm_notes_created_by_idx").on(table.createdBy),
  };
});

// CRM Tasks - Track tasks and to-dos
export const crmTasks = pgTable("crm_tasks", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  priority: priorityEnum("priority").default('medium'),
  status: text("status").default('pending'), // 'pending', 'in_progress', 'completed', 'cancelled'
  assignedTo: integer("assigned_to").references(() => users.id),
  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by").references(() => users.id),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_tasks_loan_idx").on(table.loanId),
    borrowerIdx: index("crm_tasks_borrower_idx").on(table.borrowerEntityId),
    assignedIdx: index("crm_tasks_assigned_idx").on(table.assignedTo),
    statusIdx: index("crm_tasks_status_idx").on(table.status),
    dueDateIdx: index("crm_tasks_due_date_idx").on(table.dueDate),
  };
});

// CRM Appointments - Schedule and track appointments
export const crmAppointments = pgTable("crm_appointments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  location: text("location"),
  isOnline: boolean("is_online").default(false),
  meetingLink: text("meeting_link"),
  status: text("status").default('scheduled'), // 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
  attendees: jsonb("attendees"), // Array of user IDs or email addresses
  reminder: jsonb("reminder"), // Reminder settings
  createdBy: integer("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_appointments_loan_idx").on(table.loanId),
    borrowerIdx: index("crm_appointments_borrower_idx").on(table.borrowerEntityId),
    startDateIdx: index("crm_appointments_start_idx").on(table.startDate),
    statusIdx: index("crm_appointments_status_idx").on(table.status),
  };
});

// CRM Calls - Track phone calls
export const crmCalls = pgTable("crm_calls", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  phoneNumber: text("phone_number"),
  direction: text("direction").notNull(), // 'inbound', 'outbound'
  status: text("status").notNull(), // 'scheduled', 'completed', 'missed', 'no_answer', 'busy', 'failed'
  duration: integer("duration"), // seconds
  recordingUrl: text("recording_url"),
  transcription: text("transcription"),
  notes: text("notes"),
  callSid: text("call_sid"), // Twilio call SID
  scheduledFor: timestamp("scheduled_for"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_calls_loan_idx").on(table.loanId),
    borrowerIdx: index("crm_calls_borrower_idx").on(table.borrowerEntityId),
    statusIdx: index("crm_calls_status_idx").on(table.status),
    scheduledIdx: index("crm_calls_scheduled_idx").on(table.scheduledFor),
  };
});

// CRM Collaborators - Track who has access to CRM records
export const crmCollaborators = pgTable("crm_collaborators", {
  id: serial("id").primaryKey(),
  recordType: text("record_type").notNull(), // 'loan', 'borrower', 'deal'
  recordId: integer("record_id").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  accessLevel: text("access_level").notNull(), // 'view', 'edit', 'admin'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    recordIdx: index("crm_collaborators_record_idx").on(table.recordType, table.recordId),
    userIdx: index("crm_collaborators_user_idx").on(table.userId),
    uniqueCollaborator: uniqueIndex("crm_collaborator_unique").on(table.recordType, table.recordId, table.userId),
  };
});

// CRM Deals - Track potential deals and opportunities
export const crmDeals = pgTable("crm_deals", {
  id: serial("id").primaryKey(),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  name: text("name").notNull(),
  value: decimal("value", { precision: 15, scale: 2 }),
  stage: text("stage").notNull(), // 'lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'
  probability: integer("probability"), // 0-100
  expectedCloseDate: date("expected_close_date"),
  actualCloseDate: date("actual_close_date"),
  source: text("source"), // 'referral', 'website', 'cold_call', etc.
  lostReason: text("lost_reason"),
  notes: text("notes"),
  ownerId: integer("owner_id").references(() => users.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    borrowerIdx: index("crm_deals_borrower_idx").on(table.borrowerEntityId),
    stageIdx: index("crm_deals_stage_idx").on(table.stage),
    ownerIdx: index("crm_deals_owner_idx").on(table.ownerId),
    expectedCloseIdx: index("crm_deals_expected_close_idx").on(table.expectedCloseDate),
  };
});

// ========================================
// COLLECTION MANAGEMENT TABLES
// ========================================

// Collection Cases - Track collection efforts per loan
export const collectionCases = pgTable("collection_cases", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  caseNumber: text("case_number").unique().notNull(),
  status: collectionStatusEnum("status").notNull().default('current'),
  assignedTo: integer("assigned_to").references(() => users.id),
  // Delinquency info
  daysDelinquent: integer("days_delinquent").notNull(),
  delinquentAmount: decimal("delinquent_amount", { precision: 10, scale: 2 }).notNull(),
  totalOwed: decimal("total_owed", { precision: 10, scale: 2 }).notNull(),
  // Contact tracking
  lastContactDate: date("last_contact_date"),
  lastContactMethod: text("last_contact_method"),
  lastContactResult: text("last_contact_result"),
  nextContactDate: date("next_contact_date"),
  contactAttempts: integer("contact_attempts").default(0),
  // Promise to pay
  promiseDate: date("promise_date"),
  promiseAmount: decimal("promise_amount", { precision: 10, scale: 2 }),
  promiseKept: boolean("promise_kept"),
  // Arrangements
  hasArrangement: boolean("has_arrangement").default(false),
  arrangementType: text("arrangement_type"), // 'repayment_plan', 'forbearance', 'modification'
  arrangementStartDate: date("arrangement_start_date"),
  arrangementEndDate: date("arrangement_end_date"),
  arrangementAmount: decimal("arrangement_amount", { precision: 10, scale: 2 }),
  // Legal
  legalReferralDate: date("legal_referral_date"),
  attorneyAssigned: text("attorney_assigned"),
  foreclosureInitiated: boolean("foreclosure_initiated").default(false),
  foreclosureDate: date("foreclosure_date"),
  // Notes
  notes: text("notes"),
  metadata: jsonb("metadata"),
  // Audit
  openedDate: date("opened_date").notNull(),
  closedDate: date("closed_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("collection_loan_idx").on(table.loanId),
    caseNumberIdx: index("collection_case_number_idx").on(table.caseNumber),
    statusIdx: index("collection_status_idx").on(table.status),
    assignedIdx: index("collection_assigned_idx").on(table.assignedTo),
  };
});

// Collection Activities - Log all collection activities
export const collectionActivities = pgTable("collection_activities", {
  id: serial("id").primaryKey(),
  collectionCaseId: integer("collection_case_id").references(() => collectionCases.id).notNull(),
  activityDate: timestamp("activity_date").notNull(),
  activityType: text("activity_type").notNull(), // 'call', 'letter', 'email', 'sms', 'visit', 'legal_action'
  contactMethod: text("contact_method"),
  contactedPerson: text("contacted_person"),
  phoneNumber: text("phone_number"),
  // Result
  result: text("result"),
  promiseMade: boolean("promise_made").default(false),
  promiseDate: date("promise_date"),
  promiseAmount: decimal("promise_amount", { precision: 10, scale: 2 }),
  // Follow up
  followUpRequired: boolean("follow_up_required").default(false),
  followUpDate: date("follow_up_date"),
  followUpNotes: text("follow_up_notes"),
  // Details
  notes: text("notes"),
  durationMinutes: integer("duration_minutes"),
  recordingUrl: text("recording_url"), // For call recordings
  letterTemplateUsed: text("letter_template_used"),
  metadata: jsonb("metadata"),
  // Audit
  performedBy: integer("performed_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    caseIdx: index("activity_case_idx").on(table.collectionCaseId),
    dateIdx: index("activity_date_idx").on(table.activityDate),
    typeIdx: index("activity_type_idx").on(table.activityType),
    performedByIdx: index("activity_performed_by_idx").on(table.performedBy),
  };
});

// ========================================
// TEMPLATE MANAGEMENT TABLES
// ========================================

// Notice Templates - Word templates for borrower notices
export const noticeTemplates = pgTable("notice_templates", {
  id: serial("id").primaryKey(),
  templateName: text("template_name").unique().notNull(),
  description: text("description"),
  category: text("category").notNull(), // 'late_payment', 'default', 'foreclosure', 'modification', etc.
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  variables: jsonb("variables"), // Available merge variables
  isActive: boolean("is_active").default(true).notNull(),
  version: integer("version").default(1),
  metadata: jsonb("metadata"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    categoryIdx: index("notice_template_category_idx").on(table.category),
    activeIdx: index("notice_template_active_idx").on(table.isActive),
  };
});

// Notice Settings - Configuration for notice generation
export const noticeSettings = pgTable("notice_settings", {
  id: serial("id").primaryKey(),
  settingKey: text("setting_key").unique().notNull(),
  settingValue: jsonb("setting_value").notNull(),
  category: text("category"), // 'defaults', 'formatting', 'delivery'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    keyIdx: index("notice_setting_key_idx").on(table.settingKey),
    categoryIdx: index("notice_setting_category_idx").on(table.category),
  };
});

// Email Templates - HTML email templates
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  templateName: text("template_name").unique().notNull(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull(),
  textContent: text("text_content"),
  category: text("category"), // 'notification', 'reminder', 'alert', 'report'
  variables: jsonb("variables"), // Available merge variables
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    categoryIdx: index("email_template_category_idx").on(table.category),
    activeIdx: index("email_template_active_idx").on(table.isActive),
  };
});

// Email Template Folders - Organize email templates
export const emailTemplateFolders = pgTable("email_template_folders", {
  id: serial("id").primaryKey(),
  folderName: text("folder_name").notNull(),
  parentId: integer("parent_id").references(() => emailTemplateFolders.id),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    parentIdx: index("email_folder_parent_idx").on(table.parentId),
    sortIdx: index("email_folder_sort_idx").on(table.sortOrder),
  };
});

// ========================================
// AUDIT AND COMPLIANCE TABLES
// ========================================

// Audit Logs - Track all system changes
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(), // 'create', 'update', 'delete', 'view', 'export', 'login', 'logout'
  tableName: text("table_name"),
  recordId: integer("record_id"),
  loanId: integer("loan_id").references(() => loans.id),
  // Change details
  previousValues: jsonb("previous_values"),
  newValues: jsonb("new_values"),
  changedFields: text("changed_fields"),
  // Request details
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestUrl: text("request_url"),
  requestMethod: text("request_method"),
  // Additional context
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index("audit_user_idx").on(table.userId),
    actionIdx: index("audit_action_idx").on(table.action),
    tableIdx: index("audit_table_idx").on(table.tableName),
    loanIdx: index("audit_loan_idx").on(table.loanId),
    createdIdx: index("audit_created_idx").on(table.createdAt),
  };
});

// ========================================
// PAYMENT PROCESSING TABLES
// ========================================

// Payment Events - Event sourcing for payment operations
export const paymentEvents = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").references(() => payments.id),
  eventType: text("event_type").notNull(), // 'created', 'processed', 'applied', 'reversed', 'reconciled'
  eventData: jsonb("event_data").notNull(),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    paymentIdx: index("payment_event_payment_idx").on(table.paymentId),
    typeIdx: index("payment_event_type_idx").on(table.eventType),
    createdIdx: index("payment_event_created_idx").on(table.createdAt),
  };
});

// Payment Artifacts - Store payment-related documents
export const paymentArtifacts = pgTable("payment_artifacts", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").references(() => payments.id),
  artifactType: text("artifact_type").notNull(), // 'check_image', 'receipt', 'wire_confirmation', 'ach_confirmation'
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  metadata: jsonb("metadata"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    paymentIdx: index("payment_artifact_payment_idx").on(table.paymentId),
    typeIdx: index("payment_artifact_type_idx").on(table.artifactType),
  };
});

// Payment Ingestions - Track bulk payment imports
export const paymentIngestions = pgTable("payment_ingestions", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id").unique().notNull(),
  source: text("source").notNull(), // 'column_bank', 'bank_file', 'manual_upload'
  fileName: text("file_name"),
  recordCount: integer("record_count"),
  successCount: integer("success_count"),
  failureCount: integer("failure_count"),
  status: text("status").notNull(), // 'pending', 'processing', 'completed', 'failed'
  errorDetails: jsonb("error_details"),
  metadata: jsonb("metadata"),
  processedBy: integer("processed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => {
  return {
    batchIdx: index("payment_ingestion_batch_idx").on(table.batchId),
    statusIdx: index("payment_ingestion_status_idx").on(table.status),
    createdIdx: index("payment_ingestion_created_idx").on(table.createdAt),
  };
});

// Outbox Messages - Transactional outbox pattern for reliable messaging
export const outboxMessages = pgTable("outbox_messages", {
  id: serial("id").primaryKey(),
  aggregateId: text("aggregate_id"),
  aggregateType: text("aggregate_type"), // 'payment', 'loan', 'escrow'
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").default('pending'), // 'pending', 'sent', 'failed'
  retryCount: integer("retry_count").default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
}, (table) => {
  return {
    statusIdx: index("outbox_status_idx").on(table.status),
    createdIdx: index("outbox_created_idx").on(table.createdAt),
    aggregateIdx: index("outbox_aggregate_idx").on(table.aggregateType, table.aggregateId),
  };
});

// Exception Cases - Track payment and processing exceptions
export const exceptionCases = pgTable("exception_cases", {
  id: serial("id").primaryKey(),
  caseType: text("case_type").notNull(), // 'payment_mismatch', 'nsf', 'overpayment', 'unidentified_payment'
  referenceType: text("reference_type"), // 'payment', 'loan', 'escrow'
  referenceId: integer("reference_id"),
  status: text("status").notNull().default('open'), // 'open', 'investigating', 'resolved', 'escalated'
  severity: priorityEnum("severity").default('medium'),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  description: text("description").notNull(),
  resolution: text("resolution"),
  assignedTo: integer("assigned_to").references(() => users.id),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    typeIdx: index("exception_case_type_idx").on(table.caseType),
    statusIdx: index("exception_case_status_idx").on(table.status),
    assignedIdx: index("exception_case_assigned_idx").on(table.assignedTo),
    referenceIdx: index("exception_case_reference_idx").on(table.referenceType, table.referenceId),
  };
});

// Ledger Entries - Double-entry bookkeeping for financial transactions
export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  entryDate: date("entry_date").notNull(),
  postDate: timestamp("post_date").defaultNow().notNull(),
  accountCode: text("account_code").notNull(), // GL account code
  accountName: text("account_name"),
  debit: decimal("debit", { precision: 15, scale: 2 }),
  credit: decimal("credit", { precision: 15, scale: 2 }),
  balance: decimal("balance", { precision: 15, scale: 2 }),
  referenceType: text("reference_type"), // 'payment', 'disbursement', 'adjustment'
  referenceId: integer("reference_id"),
  description: text("description"),
  journalId: text("journal_id"),
  reversedBy: integer("reversed_by").references(() => ledgerEntries.id),
  metadata: jsonb("metadata"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    entryDateIdx: index("ledger_entry_date_idx").on(table.entryDate),
    accountIdx: index("ledger_account_idx").on(table.accountCode),
    referenceIdx: index("ledger_reference_idx").on(table.referenceType, table.referenceId),
    journalIdx: index("ledger_journal_idx").on(table.journalId),
  };
});

// Reconciliations - Track payment and account reconciliations
export const reconciliations = pgTable("reconciliations", {
  id: serial("id").primaryKey(),
  reconciliationType: text("reconciliation_type").notNull(), // 'payment', 'bank', 'investor', 'gl'
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status").notNull(), // 'pending', 'in_progress', 'completed', 'failed'
  totalTransactions: integer("total_transactions"),
  matchedTransactions: integer("matched_transactions"),
  unmatchedTransactions: integer("unmatched_transactions"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }),
  matchedAmount: decimal("matched_amount", { precision: 15, scale: 2 }),
  unmatchedAmount: decimal("unmatched_amount", { precision: 15, scale: 2 }),
  discrepancies: jsonb("discrepancies"),
  reconciliationData: jsonb("reconciliation_data"),
  performedBy: integer("performed_by").references(() => users.id),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    typeIdx: index("reconciliation_type_idx").on(table.reconciliationType),
    periodIdx: index("reconciliation_period_idx").on(table.periodStart, table.periodEnd),
    statusIdx: index("reconciliation_status_idx").on(table.status),
  };
});

// ========================================
// SERVICING CYCLE TABLES
// ========================================

// Interest Accruals - Track daily interest calculations
export const interestAccruals = pgTable("interest_accruals", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  accrualDate: date("accrual_date").notNull(),
  principalBalance: decimal("principal_balance", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 6, scale: 4 }).notNull(),
  dailyInterest: decimal("daily_interest", { precision: 10, scale: 2 }).notNull(),
  accruedInterest: decimal("accrued_interest", { precision: 10, scale: 2 }).notNull(),
  daysInPeriod: integer("days_in_period"),
  isPaid: boolean("is_paid").default(false),
  paymentId: integer("payment_id").references(() => payments.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("interest_accrual_loan_idx").on(table.loanId),
    dateIdx: index("interest_accrual_date_idx").on(table.accrualDate),
    uniqueLoanDate: uniqueIndex("interest_accrual_unique").on(table.loanId, table.accrualDate),
  };
});

// Servicing Runs - Track batch servicing operations
export const servicingRuns = pgTable("servicing_runs", {
  id: serial("id").primaryKey(),
  runId: text("run_id").unique().notNull(),
  runDate: date("run_date").notNull(),
  runType: text("run_type").notNull(), // 'daily', 'monthly', 'year_end', 'ad_hoc'
  status: text("status").notNull(), // 'pending', 'running', 'completed', 'failed'
  totalLoans: integer("total_loans"),
  processedLoans: integer("processed_loans"),
  failedLoans: integer("failed_loans"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  errorDetails: jsonb("error_details"),
  metadata: jsonb("metadata"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    runDateIdx: index("servicing_run_date_idx").on(table.runDate),
    statusIdx: index("servicing_run_status_idx").on(table.status),
  };
});

// Servicing Events - Log individual servicing actions
export const servicingEvents = pgTable("servicing_events", {
  id: serial("id").primaryKey(),
  runId: text("run_id").references(() => servicingRuns.runId),
  eventKey: text("event_key").unique(),
  eventType: text("event_type").notNull(), // 'interest_accrual', 'fee_assessment', 'escrow_analysis', etc.
  loanId: integer("loan_id").references(() => loans.id),
  valuationDate: date("valuation_date"),
  amount: decimal("amount", { precision: 15, scale: 2 }),
  principal: decimal("principal", { precision: 15, scale: 2 }),
  interest: decimal("interest", { precision: 15, scale: 2 }),
  escrow: decimal("escrow", { precision: 15, scale: 2 }),
  fees: decimal("fees", { precision: 15, scale: 2 }),
  details: jsonb("details"),
  status: text("status"), // 'success', 'failed', 'skipped'
  errorMessage: text("error_message"),
  timestamp: timestamp("timestamp").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    runIdx: index("servicing_event_run_idx").on(table.runId),
    loanIdx: index("servicing_event_loan_idx").on(table.loanId),
    typeIdx: index("servicing_event_type_idx").on(table.eventType),
  };
});

// Servicing Exceptions - Track processing exceptions
export const servicingExceptions = pgTable("servicing_exceptions", {
  id: serial("id").primaryKey(),
  runId: text("run_id").references(() => servicingRuns.runId),
  loanId: integer("loan_id").references(() => loans.id),
  exceptionType: text("exception_type").notNull(),
  severity: priorityEnum("severity").default('medium'),
  message: text("message").notNull(),
  stackTrace: text("stack_trace"),
  context: jsonb("context"),
  isResolved: boolean("is_resolved").default(false),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    runIdx: index("servicing_exception_run_idx").on(table.runId),
    loanIdx: index("servicing_exception_loan_idx").on(table.loanId),
    typeIdx: index("servicing_exception_type_idx").on(table.exceptionType),
    unresolvedIdx: index("servicing_exception_unresolved_idx").on(table.isResolved),
  };
});

// Payments Inbox - Incoming payment staging area
export const paymentsInbox = pgTable("payments_inbox", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").unique(),
  source: text("source").notNull(), // 'ach', 'wire', 'check', 'lockbox'
  referenceNumber: text("reference_number"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  payerName: text("payer_name"),
  payerAccount: text("payer_account"),
  receivedDate: date("received_date").notNull(),
  effectiveDate: date("effective_date"),
  status: text("status").notNull(), // 'pending', 'matched', 'unmatched', 'processed', 'rejected'
  matchedLoanId: integer("matched_loan_id").references(() => loans.id),
  paymentId: integer("payment_id").references(() => payments.id),
  matchConfidence: decimal("match_confidence", { precision: 3, scale: 2 }),
  rawData: jsonb("raw_data"),
  metadata: jsonb("metadata"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    statusIdx: index("inbox_status_idx").on(table.status),
    receivedIdx: index("inbox_received_idx").on(table.receivedDate),
    externalIdx: index("inbox_external_idx").on(table.externalId),
  };
});

// ========================================
// Phase 7: Investor Remittance Tables
// ========================================

// Investor Distributions - Track investor payment distributions
export const investorDistributions = pgTable("investor_distributions", {
  id: serial("id").primaryKey(),
  investorId: integer("investor_id").references(() => investors.id).notNull(),
  paymentId: integer("payment_id").references(() => payments.id),
  distributionDate: date("distribution_date").notNull(),
  principalAmount: decimal("principal_amount", { precision: 15, scale: 2 }),
  interestAmount: decimal("interest_amount", { precision: 15, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull(), // 'pending', 'processed', 'paid', 'failed'
  remittanceId: text("remittance_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    investorIdx: index("investor_dist_investor_idx").on(table.investorId),
    paymentIdx: index("investor_dist_payment_idx").on(table.paymentId),
    dateIdx: index("investor_dist_date_idx").on(table.distributionDate),
    statusIdx: index("investor_dist_status_idx").on(table.status),
  };
});

// Investor contracts for remittance
export const investorContracts = pgTable("investor_contract", {
  contractId: uuid("contract_id").primaryKey().default(sql`gen_random_uuid()`),
  investorId: integer("investor_id").notNull().references(() => users.id),
  productCode: text("product_code").notNull(),
  method: text("method").notNull(), // 'scheduled_p_i', 'actual_cash', 'scheduled_p_i_with_interest_shortfall'
  remittanceDay: integer("remittance_day").notNull(), // 1-31
  cutoffDay: integer("cutoff_day").notNull(), // 1-31
  custodialBankAcctId: uuid("custodial_bank_acct_id").notNull(),
  servicerFeeBps: integer("servicer_fee_bps").notNull().default(0),
  lateFeeSpitBps: integer("late_fee_split_bps").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// Waterfall rules for investor contracts
export const investorWaterfallRules = pgTable("investor_waterfall_rule", {
  ruleId: uuid("rule_id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: uuid("contract_id").notNull().references(() => investorContracts.contractId, { onDelete: 'cascade' }),
  rank: integer("rank").notNull(),
  bucket: text("bucket").notNull(), // 'interest', 'principal', 'late_fees', 'escrow', 'recoveries'
  capMinor: decimal("cap_minor", { precision: 20, scale: 0 }),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  uniqueContractRank: unique().on(table.contractId, table.rank)
}));

// Remittance cycles
export const remittanceCycles = pgTable("remittance_cycle", {
  cycleId: uuid("cycle_id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: uuid("contract_id").notNull().references(() => investorContracts.contractId, { onDelete: 'cascade' }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status").notNull().default("open"), // 'open', 'locked', 'file_generated', 'sent', 'settled', 'closed'
  totalPrincipalMinor: decimal("total_principal_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  totalInterestMinor: decimal("total_interest_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  totalFeesMinor: decimal("total_fees_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  servicerFeeMinor: decimal("servicer_fee_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  investorDueMinor: decimal("investor_due_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lockedAt: timestamp("locked_at"),
  settledAt: timestamp("settled_at")
}, (table) => ({
  uniquePeriod: unique().on(table.contractId, table.periodStart, table.periodEnd),
  statusIdx: index("idx_remittance_cycle_status").on(table.status),
  periodIdx: index("idx_remittance_cycle_period").on(table.periodStart, table.periodEnd)
}));

// Remittance items (loan-level details)
export const remittanceItems = pgTable("remittance_item", {
  itemId: uuid("item_id").primaryKey().default(sql`gen_random_uuid()`),
  cycleId: uuid("cycle_id").notNull().references(() => remittanceCycles.cycleId, { onDelete: 'cascade' }),
  loanId: integer("loan_id").references(() => loans.id),
  principalMinor: decimal("principal_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  interestMinor: decimal("interest_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  feesMinor: decimal("fees_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  investorShareMinor: decimal("investor_share_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  servicerFeeMinor: decimal("servicer_fee_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  cycleIdx: index("idx_remittance_item_cycle").on(table.cycleId),
  loanIdx: index("idx_remittance_item_loan").on(table.loanId)
}));

// Remittance export files
export const remittanceExports = pgTable("remittance_export", {
  exportId: uuid("export_id").primaryKey().default(sql`gen_random_uuid()`),
  cycleId: uuid("cycle_id").notNull().references(() => remittanceCycles.cycleId, { onDelete: 'cascade' }),
  format: text("format").notNull(), // 'csv', 'xml'
  fileHash: varchar("file_hash", { length: 64 }).notNull(),
  bytes: text("bytes").notNull(), // Store as base64
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  cycleIdx: index("idx_remittance_export_cycle").on(table.cycleId)
}));

// Remittance reconciliation snapshots
export const remittanceReconSnapshots = pgTable("remittance_recon_snapshot", {
  snapshotId: uuid("snapshot_id").primaryKey().default(sql`gen_random_uuid()`),
  cycleId: uuid("cycle_id").notNull().references(() => remittanceCycles.cycleId),
  glPrincipalVarianceMinor: decimal("gl_principal_variance_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  glInterestVarianceMinor: decimal("gl_interest_variance_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  glFeeVarianceMinor: decimal("gl_fee_variance_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  reconciledAt: timestamp("reconciled_at").defaultNow().notNull(),
  reconciledBy: text("reconciled_by").notNull()
});

// ========================================
// EXPORT SCHEMAS AND TYPES
// ========================================

// User-related exports
export const insertUserSchema = createInsertSchema(users);
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Borrower-related exports
export const insertBorrowerEntitySchema = createInsertSchema(borrowerEntities);
export type BorrowerEntity = typeof borrowerEntities.$inferSelect;
export type InsertBorrowerEntity = z.infer<typeof insertBorrowerEntitySchema>;

// Property-related exports
export const insertPropertySchema = createInsertSchema(properties);
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;

// Loan-related exports
export const insertLoanSchema = createInsertSchema(loans);
export type Loan = typeof loans.$inferSelect;
export type InsertLoan = z.infer<typeof insertLoanSchema>;

export const insertLoanBorrowerSchema = createInsertSchema(loanBorrowers);
export type LoanBorrower = typeof loanBorrowers.$inferSelect;
export type InsertLoanBorrower = z.infer<typeof insertLoanBorrowerSchema>;

export const insertLoanFeeSchema = createInsertSchema(loanFees);
export type LoanFee = typeof loanFees.$inferSelect;
export type InsertLoanFee = z.infer<typeof insertLoanFeeSchema>;

// Payment-related exports
export const insertPaymentSchema = createInsertSchema(payments);
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export const insertPaymentScheduleSchema = createInsertSchema(paymentSchedule);
export type PaymentSchedule = typeof paymentSchedule.$inferSelect;
export type InsertPaymentSchedule = z.infer<typeof insertPaymentScheduleSchema>;

// Escrow-related exports
export const insertEscrowAccountSchema = createInsertSchema(escrowAccounts);
export type EscrowAccount = typeof escrowAccounts.$inferSelect;
export type InsertEscrowAccount = z.infer<typeof insertEscrowAccountSchema>;

export const insertEscrowTransactionSchema = createInsertSchema(escrowTransactions);
export type EscrowTransaction = typeof escrowTransactions.$inferSelect;
export type InsertEscrowTransaction = z.infer<typeof insertEscrowTransactionSchema>;

export const insertEscrowDisbursementSchema = createInsertSchema(escrowDisbursements);
export type EscrowDisbursement = typeof escrowDisbursements.$inferSelect;
export type InsertEscrowDisbursement = z.infer<typeof insertEscrowDisbursementSchema>;

export const insertEscrowDisbursementPaymentSchema = createInsertSchema(escrowDisbursementPayments);
export type EscrowDisbursementPayment = typeof escrowDisbursementPayments.$inferSelect;
export type InsertEscrowDisbursementPayment = z.infer<typeof insertEscrowDisbursementPaymentSchema>;

// Document-related exports
export const insertDocumentSchema = createInsertSchema(documents);
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

// Notification-related exports
export const insertNotificationSchema = createInsertSchema(notifications);
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Collection-related exports
export const insertCollectionCaseSchema = createInsertSchema(collectionCases);
export type CollectionCase = typeof collectionCases.$inferSelect;
export type InsertCollectionCase = z.infer<typeof insertCollectionCaseSchema>;

export const insertCollectionActivitySchema = createInsertSchema(collectionActivities);
export type CollectionActivity = typeof collectionActivities.$inferSelect;
export type InsertCollectionActivity = z.infer<typeof insertCollectionActivitySchema>;

// Audit-related exports
export const insertAuditLogSchema = createInsertSchema(auditLogs);
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Phase 7: Investor Remittance exports
export const insertInvestorContractSchema = createInsertSchema(investorContracts);
export type InvestorContract = typeof investorContracts.$inferSelect;
export type InsertInvestorContract = z.infer<typeof insertInvestorContractSchema>;

export const insertInvestorWaterfallRuleSchema = createInsertSchema(investorWaterfallRules);
export type InvestorWaterfallRule = typeof investorWaterfallRules.$inferSelect;
export type InsertInvestorWaterfallRule = z.infer<typeof insertInvestorWaterfallRuleSchema>;

export const insertRemittanceCycleSchema = createInsertSchema(remittanceCycles);
export type RemittanceCycle = typeof remittanceCycles.$inferSelect;
export type InsertRemittanceCycle = z.infer<typeof insertRemittanceCycleSchema>;

export const insertRemittanceItemSchema = createInsertSchema(remittanceItems);
export type RemittanceItem = typeof remittanceItems.$inferSelect;
export type InsertRemittanceItem = z.infer<typeof insertRemittanceItemSchema>;

export const insertRemittanceExportSchema = createInsertSchema(remittanceExports);
export type RemittanceExport = typeof remittanceExports.$inferSelect;
export type InsertRemittanceExport = z.infer<typeof insertRemittanceExportSchema>;

export const insertRemittanceReconSnapshotSchema = createInsertSchema(remittanceReconSnapshots);
export type RemittanceReconSnapshot = typeof remittanceReconSnapshots.$inferSelect;
export type InsertRemittanceReconSnapshot = z.infer<typeof insertRemittanceReconSnapshotSchema>;

// Additional missing exports for storage.ts compatibility
export const investors = pgTable("investors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvestorSchema = createInsertSchema(investors);
export type Investor = typeof investors.$inferSelect;
export type InsertInvestor = z.infer<typeof insertInvestorSchema>;

// Export loan ledger type
export const loanLedger = pgTable("loan_ledger", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  transactionDate: date("transaction_date").notNull(),
  transactionType: text("transaction_type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  principalAmount: decimal("principal_amount", { precision: 10, scale: 2 }),
  interestAmount: decimal("interest_amount", { precision: 10, scale: 2 }),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }),
  lateFeeAmount: decimal("late_fee_amount", { precision: 10, scale: 2 }),
  otherFeeAmount: decimal("other_fee_amount", { precision: 10, scale: 2 }),
  principalBalance: decimal("principal_balance", { precision: 15, scale: 2 }),
  escrowBalance: decimal("escrow_balance", { precision: 10, scale: 2 }),
  description: text("description"),
  reference: text("reference"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});