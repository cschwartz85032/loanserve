import { pgTable, index, serial, timestamp, integer, text, decimal, varchar, boolean, unique, date, jsonb, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { sql } from 'drizzle-orm';

// Template types
export const templateTypes = pgEnum('template_type', ['email', 'word']);

// Contacts table
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerId: integer("borrower_id").references(() => borrowers.id),
  propertyId: integer("property_id").references(() => properties.id),
  investorId: integer("investor_id").references(() => investors.id),
  escrowHolderId: integer("escrow_holder_id").references(() => escrowAccounts.id),
  contactType: text("contact_type").notNull(),
  phoneNumbers: text("phone_numbers").array(),
  emailAddresses: text("email_addresses").array(),
  businessName: text("business_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  fullName: text("full_name"),
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  faxNumber: text("fax_number"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Properties table
export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  propertyType: text("property_type").notNull(),
  occupancyStatus: text("occupancy_status").notNull(),
  currentValue: decimal("current_value", { precision: 12, scale: 2 }),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }),
  purchaseDate: date("purchase_date"),
  legalDescription: text("legal_description"),
  parcelNumber: text("parcel_number"),
  county: text("county"),
  subdivision: text("subdivision"),
  yearBuilt: integer("year_built"),
  squareFootage: integer("square_footage"),
  lotSize: decimal("lot_size", { precision: 10, scale: 2 }),
  numberOfUnits: integer("number_of_units"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Borrowers table
export const borrowers = pgTable("borrowers", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  ssn: text("ssn"),
  dateOfBirth: date("date_of_birth"),
  phoneNumber: text("phone_number"),
  mobilePhone: varchar("mobile_phone"),
  email: text("email"),
  currentAddress: text("current_address"),
  mailingAddress: text("mailing_address"),
  employmentStatus: text("employment_status"),
  creditScore: integer("credit_score"),
  maritalStatus: text("marital_status"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Co-borrowers table
export const coBorrowers = pgTable("co_borrowers", {
  id: serial("id").primaryKey(),
  borrowerId: integer("borrower_id").notNull().references(() => borrowers.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  ssn: text("ssn"),
  dateOfBirth: date("date_of_birth"),
  phoneNumber: text("phone_number"),
  email: text("email"),
  currentAddress: text("current_address"),
  relationship: text("relationship"),
  creditScore: integer("credit_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Investors table  
export const investors = pgTable("investors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  entityType: text("entity_type").notNull(),
  taxId: text("tax_id"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankRoutingNumber: text("bank_routing_number"),
  wireInstructions: text("wire_instructions"),
  investorCode: text("investor_code"),
  servicingFeePercentage: decimal("servicing_fee_percentage", { precision: 5, scale: 3 }),
  poolName: text("pool_name"),
  poolNumber: text("pool_number"),
  remittanceType: text("remittance_type"),
  remittanceDayOfMonth: integer("remittance_day_of_month"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Loans table
export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  loanNumber: text("loan_number").notNull().unique(),
  loanType: text("loan_type").notNull(),
  propertyId: integer("property_id").references(() => properties.id),
  borrowerId: integer("borrower_id").references(() => borrowers.id),
  investorId: integer("investor_id").references(() => investors.id),
  status: text("status").notNull().default("active"),
  originalAmount: decimal("original_amount", { precision: 12, scale: 2 }).notNull(),
  principalBalance: decimal("principal_balance", { precision: 12, scale: 2 }).notNull(),
  currentBalance: decimal("current_balance", { precision: 12, scale: 2 }),
  interestRate: decimal("interest_rate", { precision: 5, scale: 3 }).notNull(),
  currentInterestRate: decimal("current_interest_rate", { precision: 5, scale: 3 }),
  rateType: text("rate_type").notNull(),
  rateAdjustmentDate: date("rate_adjustment_date"),
  rateAdjustmentFrequency: integer("rate_adjustment_frequency"),
  rateCap: decimal("rate_cap", { precision: 5, scale: 3 }),
  rateFloor: decimal("rate_floor", { precision: 5, scale: 3 }),
  marginRate: decimal("margin_rate", { precision: 5, scale: 3 }),
  indexType: text("index_type"),
  indexRate: decimal("index_rate", { precision: 5, scale: 3 }),
  term: integer("term").notNull(),
  remainingTerm: integer("remaining_term"),
  loanTerm: integer("loan_term").notNull(),
  originationDate: date("origination_date"),
  firstPaymentDate: date("first_payment_date"),
  maturityDate: date("maturity_date").notNull(),
  nextPaymentDueDate: date("next_payment_due_date"),
  paymentFrequency: text("payment_frequency").notNull(),
  paymentAmount: decimal("payment_amount", { precision: 12, scale: 2 }).notNull(),
  principalAndInterest: decimal("principal_and_interest", { precision: 12, scale: 2 }),
  escrowAmount: decimal("escrow_amount", { precision: 12, scale: 2 }),
  totalPayment: decimal("total_payment", { precision: 12, scale: 2 }),
  lateFeeGraceDays: integer("late_fee_grace_days"),
  lateFeeAmount: decimal("late_fee_amount", { precision: 12, scale: 2 }),
  lateFeePercentage: decimal("late_fee_percentage", { precision: 5, scale: 3 }),
  prepaymentPenaltyTerm: integer("prepayment_penalty_term"),
  prepaymentPenaltyAmount: decimal("prepayment_penalty_amount", { precision: 12, scale: 2 }),
  prepaymentPenaltyPercentage: decimal("prepayment_penalty_percentage", { precision: 5, scale: 3 }),
  servicingFeeAmount: decimal("servicing_fee_amount", { precision: 12, scale: 2 }),
  servicingFeePercentage: decimal("servicing_fee_percentage", { precision: 5, scale: 3 }),
  pastDueAmount: decimal("past_due_amount", { precision: 12, scale: 2 }),
  daysDelinquent: integer("days_delinquent"),
  delinquencyStatus: text("delinquency_status"),
  lastPaymentDate: date("last_payment_date"),
  lastPaymentAmount: decimal("last_payment_amount", { precision: 12, scale: 2 }),
  accruedInterest: decimal("accrued_interest", { precision: 12, scale: 2 }),
  loanToValue: decimal("loan_to_value", { precision: 5, scale: 2 }),
  debtToIncome: decimal("debt_to_income", { precision: 5, scale: 2 }),
  interestOnlyPeriod: integer("interest_only_period"),
  isInterestOnly: boolean("is_interest_only"),
  balloonPaymentAmount: decimal("balloon_payment_amount", { precision: 12, scale: 2 }),
  balloonPaymentDate: date("balloon_payment_date"),
  trustName: text("trust_name"),
  trusteeName: text("trustee_name"),
  trusteePhone: text("trustee_phone"),
  trusteeAddress: text("trustee_address"),
  trustDate: date("trust_date"),
  beneficiaryName: text("beneficiary_name"),
  mortgageInsuranceAmount: decimal("mortgage_insurance_amount", { precision: 12, scale: 2 }),
  pmiRemovalDate: date("pmi_removal_date"),
  pmiRemovalLTV: decimal("pmi_removal_ltv", { precision: 5, scale: 2 }),
  armConversionOption: boolean("arm_conversion_option"),
  armConversionDate: date("arm_conversion_date"),
  adjustmentIndexValue: decimal("adjustment_index_value", { precision: 10, scale: 6 }),
  lastRateChangeDate: date("last_rate_change_date"),
  nextRateChangeDate: date("next_rate_change_date"),
  periodicCapUp: decimal("periodic_cap_up", { precision: 5, scale: 3 }),
  periodicCapDown: decimal("periodic_cap_down", { precision: 5, scale: 3 }),
  lifetimeCapUp: decimal("lifetime_cap_up", { precision: 5, scale: 3 }),
  lifetimeCapDown: decimal("lifetime_cap_down", { precision: 5, scale: 3 }),
  modificationFlag: boolean("modification_flag"),
  modificationDate: date("modification_date"),
  originalInterestRate: decimal("original_interest_rate", { precision: 5, scale: 3 }),
  originalLoanAmount: decimal("original_loan_amount", { precision: 12, scale: 2 }),
  originalLoanTerm: integer("original_loan_term"),
  refinanceDate: date("refinance_date"),
  cashOutAmount: decimal("cash_out_amount", { precision: 12, scale: 2 }),
  escrowTaxes: decimal("escrow_taxes", { precision: 10, scale: 2 }),
  escrowInsurance: decimal("escrow_insurance", { precision: 10, scale: 2 }),
  escrowPMI: decimal("escrow_pmi", { precision: 10, scale: 2 }),
  escrowHOA: decimal("escrow_hoa", { precision: 10, scale: 2 }),
  escrowOther: decimal("escrow_other", { precision: 10, scale: 2 }),
  totalMonthlyPayment: decimal("total_monthly_payment", { precision: 10, scale: 2 }),
  interestPaidYTD: decimal("interest_paid_ytd", { precision: 10, scale: 2 }),
  principalPaidYTD: decimal("principal_paid_ytd", { precision: 10, scale: 2 }),
  escrowBalance: decimal("escrow_balance", { precision: 10, scale: 2 }),
  prepaymentPenaltyExpiry: date("prepayment_penalty_expiry"),
  foreclosureStartDate: date("foreclosure_start_date"),
  reoDate: date("reo_date"),
  reoValue: decimal("reo_value", { precision: 10, scale: 2 }),
  netProceedsFromSale: decimal("net_proceeds_from_sale", { precision: 10, scale: 2 }),
  liquidationDate: date("liquidation_date"),
  chargeOffAmount: decimal("charge_off_amount", { precision: 10, scale: 2 }),
  chargeOffDate: date("charge_off_date"),
  ownershipPercentage: decimal("ownership_percentage", { precision: 5, scale: 4 }).notNull().default("1.0000"),
  documentId: integer("document_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lateChargesDue: decimal("late_charges_due", { precision: 10, scale: 2 }).default("0"),
  lateChargesUnpaid: decimal("late_charges_unpaid", { precision: 10, scale: 2 }).default("0"),
  suspenseBalance: decimal("suspense_balance", { precision: 10, scale: 2 }),
  miPremiumDue: decimal("mi_premium_due", { precision: 10, scale: 2 }),
  miPremiumUnpaid: decimal("mi_premium_unpaid", { precision: 10, scale: 2 }),
  nextEscrowAnalysisDate: date("next_escrow_analysis_date"),
  prepaymentPenaltyIndicator: boolean("prepayment_penalty_indicator"),
  interestOnlyIndicator: boolean("interest_only_indicator"),
  negativeAmortizationIndicator: boolean("negative_amortization_indicator"),
  interestRateRoundingMethod: text("interest_rate_rounding_method"),
  interestRateRoundingFactor: decimal("interest_rate_rounding_factor", { precision: 10, scale: 8 }),
  delinquencyBucket: text("delinquency_bucket"),
  daysInMonth: integer("days_in_month"),
  daysInYear: integer("days_in_year"),
  dailyInterestAmount: decimal("daily_interest_amount", { precision: 10, scale: 8 }),
  interestCalculationMethod: text("interest_calculation_method"),
  lateChargeType: text("late_charge_type"),
  lateChargeMinimum: decimal("late_charge_minimum", { precision: 10, scale: 2 }),
  lateChargeMaximum: decimal("late_charge_maximum", { precision: 10, scale: 2 }),
  customerServiceRep: text("customer_service_rep"),
  lossReason: text("loss_reason"),
  curtailmentAmount: decimal("curtailment_amount", { precision: 10, scale: 2 })
}, (loans) => ({
  // Define indexes for the loans table
  statusIdx: index().on(loans.status),
  borrowerIdx: index().on(loans.borrowerId),
  propertyIdx: index().on(loans.propertyId),
  investorIdx: index().on(loans.investorId),
  loanNumberIdx: index().on(loans.loanNumber)
}));

// Templates table
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: templateTypes("type").notNull(),
  content: text("content").notNull(),
  variables: text("variables").array(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  isPending: boolean("is_pending").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: varchar("email_verification_token", { length: 255 }),
  emailVerificationExpires: timestamp("email_verification_expires", { withTimezone: true }),
  lastPasswordChange: timestamp("last_password_change", { withTimezone: true }).notNull().defaultNow(),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lastFailedLogin: timestamp("last_failed_login", { withTimezone: true }),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: varchar("last_login_ip", { length: 45 }),
  mfaSecret: varchar("mfa_secret", { length: 255 }),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  totpSecret: varchar("totp_secret", { length: 255 }),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  backupCodes: text("backup_codes"),
  activeMfaMethods: jsonb("active_mfa_methods").default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  emailIdx: index("idx_users_email").on(table.email),
  usernameIdx: index("idx_users_username").on(table.username)
}));

// Roles table
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  nameIdx: index("idx_roles_name").on(table.name)
}));

// User Roles Junction Table
export const userRoles = pgTable("user_roles", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: 'cascade' }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  assignedBy: integer("assigned_by").references(() => users.id)
}, (table) => ({
  pk: unique().on(table.userId, table.roleId),
  userIdx: index("idx_user_roles_user").on(table.userId),
  roleIdx: index("idx_user_roles_role").on(table.roleId)
}));

// Permissions table
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  resource: varchar("resource", { length: 255 }).notNull(),
  permission: varchar("permission", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  resourcePermissionIdx: unique("idx_permissions_resource_permission").on(table.resource, table.permission)
}));

// Role Permissions Junction Table
export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  scope: text("scope"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  pk: unique().on(table.roleId, table.permissionId),
  roleIdx: index("idx_role_permissions_role").on(table.roleId),
  permissionIdx: index("idx_role_permissions_permission").on(table.permissionId)
}));

// System settings table
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id)
}, (table) => ({
  keyIdx: index("idx_system_settings_key").on(table.key)
}));

// Login attempts table
export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }),
  email: varchar("email", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  userAgent: text("user_agent"),
  success: boolean("success").notNull(),
  failureReason: text("failure_reason"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  ipIdx: index("idx_login_attempts_ip").on(table.ipAddress),
  attemptedAtIdx: index("idx_login_attempts_time").on(table.attemptedAt),
  usernameIdx: index("idx_login_attempts_username").on(table.username)
}));

// User IP Allowlist table
export const userIpAllowlist = pgTable("user_ip_allowlist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer("created_by").references(() => users.id)
}, (table) => ({
  userIpIdx: unique("idx_user_ip_allowlist_user_ip").on(table.userId, table.ipAddress),
  userIdx: index("idx_user_ip_allowlist_user").on(table.userId)
}));

// Auth events table for audit logging
export const authEvents = pgTable("auth_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  eventData: jsonb("event_data"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index("idx_auth_events_user").on(table.userId),
  eventTypeIdx: index("idx_auth_events_type").on(table.eventType),
  createdAtIdx: index("idx_auth_events_time").on(table.createdAt)
}));

// Documents table
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerId: integer("borrower_id").references(() => borrowers.id),
  propertyId: integer("property_id").references(() => properties.id),
  documentType: text("document_type").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  storageUrl: text("storage_url").notNull(),
  status: text("status").notNull().default("pending"),
  extractedData: jsonb("extracted_data"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Notices table
export const notices = pgTable("notices", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  noticeType: text("notice_type").notNull(),
  templateId: integer("template_id").references(() => templates.id),
  recipientName: text("recipient_name").notNull(),
  recipientAddress: text("recipient_address").notNull(),
  sendDate: date("send_date").notNull(),
  dueDate: date("due_date"),
  content: text("content").notNull(),
  status: text("status").notNull().default("pending"),
  deliveryMethod: text("delivery_method"),
  trackingNumber: text("tracking_number"),
  responseReceived: boolean("response_received").default(false),
  responseDate: date("response_date"),
  generatedBy: integer("generated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Escrow Accounts table
export const escrowAccounts = pgTable("escrow_accounts", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  accountNumber: text("account_number").notNull().unique(),
  balance: decimal("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  cushionAmount: decimal("cushion_amount", { precision: 12, scale: 2 }).default("0"),
  analysisDate: date("analysis_date"),
  nextAnalysisDate: date("next_analysis_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Escrow Disbursements table
export const escrowDisbursements = pgTable("escrow_disbursements", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  escrowAccountId: integer("escrow_account_id").notNull().references(() => escrowAccounts.id),
  disbursementType: text("disbursement_type").notNull(),
  payeeName: text("payee_name").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: date("due_date").notNull(),
  paidDate: date("paid_date"),
  status: text("status").notNull().default("scheduled"),
  checkNumber: text("check_number"),
  invoiceNumber: text("invoice_number"),
  policyNumber: text("policy_number"),
  taxYear: integer("tax_year"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  description: text("description"),
  category: text("category"),
  payeeContactName: text("payee_contact_name"),
  payeePhone: text("payee_phone"),
  payeeEmail: text("payee_email"),
  payeeFax: text("payee_fax"),
  payeeStreetAddress: text("payee_street_address"),
  payeeCity: text("payee_city"),
  payeeState: text("payee_state"),
  payeeZipCode: text("payee_zip_code"),
  parcelNumber: text("parcel_number"),
  insuredName: text("insured_name"),
  insuranceCompanyName: text("insurance_company_name"),
  policyDescription: text("policy_description"),
  policyExpirationDate: date("policy_expiration_date"),
  coverageAmount: decimal("coverage_amount", { precision: 12, scale: 2 }),
  insurancePropertyAddress: text("insurance_property_address"),
  insurancePropertyCity: text("insurance_property_city"),
  insurancePropertyState: text("insurance_property_state"),
  insurancePropertyZipCode: text("insurance_property_zip_code"),
  agentName: text("agent_name"),
  agentBusinessAddress: text("agent_business_address"),
  agentCity: text("agent_city"),
  agentState: text("agent_state"),
  agentZipCode: text("agent_zip_code"),
  agentPhone: text("agent_phone"),
  agentFax: text("agent_fax"),
  agentEmail: text("agent_email"),
  insuranceDocumentId: integer("insurance_document_id"),
  insuranceTracking: boolean("insurance_tracking").default(false),
  paymentMethod: text("payment_method"),
  bankAccountNumber: text("bank_account_number"),
  achRoutingNumber: text("ach_routing_number"),
  wireRoutingNumber: text("wire_routing_number"),
  accountType: text("account_type"),
  bankName: text("bank_name"),
  wireInstructions: text("wire_instructions"),
  remittanceInstructions: text("remittance_instructions"),
  taxId: text("tax_id"),
  payeeType: text("payee_type"),
  daysToDisburse: integer("days_to_disburse"),
  disbursementFrequency: text("disbursement_frequency"),
  yearlyAmount: decimal("yearly_amount", { precision: 12, scale: 2 }),
  hoaFeeName: text("hoa_fee_name"),
  hoaManagementCompanyName: text("hoa_management_company_name"),
  billReceivedDate: date("bill_received_date"),
  billDueDate: date("bill_due_date"),
  onHold: boolean("on_hold").default(false),
  holdReason: text("hold_reason"),
  comments: text("comments")
});

// Audit Logs table for compliance
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  tableName: text("table_name"),
  recordId: text("record_id"),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

// Payment Ingestions table
export const paymentIngestions = pgTable("payment_ingestions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: text("source_id").notNull().unique(),
  sourceSystemId: text("source_system_id").notNull(),
  status: text("status").notNull().default("pending"),
  rawData: jsonb("raw_data").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorDetails: jsonb("error_details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  sourceIdIdx: index("idx_payment_ingestions_source_id").on(table.sourceId),
  statusIdx: index("idx_payment_ingestions_status").on(table.status)
}));

// Payment Artifacts table
export const paymentArtifacts = pgTable("payment_artifacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  type: text("type").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  paymentIdx: index("idx_payment_artifacts_payment").on(table.paymentId)
}));

// Payment Events table
export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  paymentIdx: index("idx_payment_events_payment").on(table.paymentId),
  eventTypeIdx: index("idx_payment_events_type").on(table.eventType)
}));

// Ledger Entries table for double-entry bookkeeping
export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentId: uuid("payment_id").references(() => payments.id),
  entryDate: date("entry_date").notNull(),
  accountType: text("account_type").notNull(),
  accountCode: text("account_code").notNull(),
  debitAmount: decimal("debit_amount", { precision: 12, scale: 2 }).notNull(),
  creditAmount: decimal("credit_amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  correlationId: text("correlation_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  paymentIdx: index("idx_ledger_entries_payment").on(table.paymentId),
  correlationIdx: index("idx_ledger_entries_correlation").on(table.correlationId),
  accountIdx: index("idx_ledger_entries_account").on(table.accountCode)
}));

// Inbox table for inbound messages
export const inbox = pgTable("inbox", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: text("message_id").notNull().unique(),
  exchange: text("exchange").notNull(),
  routingKey: text("routing_key").notNull(),
  payload: jsonb("payload").notNull(),
  headers: jsonb("headers"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  status: text("status").notNull().default("pending")
}, (table) => ({
  messageIdIdx: index("idx_inbox_message_id").on(table.messageId),
  statusIdx: index("idx_inbox_status").on(table.status)
}));

// Outbox table for outbound messages
export const outbox = pgTable("outbox", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  aggregateId: text("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  metadata: jsonb("metadata"),
  status: text("status").notNull().default("pending"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  statusIdx: index("idx_outbox_status").on(table.status),
  aggregateIdx: index("idx_outbox_aggregate").on(table.aggregateId),
  nextRetryIdx: index("idx_outbox_next_retry").on(table.nextRetryAt)
}));

// Outbox Messages table
export const outboxMessages = pgTable("outbox_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  aggregateId: text("aggregate_id").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  aggregateIdx: index("idx_outbox_messages_aggregate").on(table.aggregateId, table.aggregateType),
  eventTypeIdx: index("idx_outbox_messages_event_type").on(table.eventType),
  createdAtIdx: index("idx_outbox_messages_created_at").on(table.createdAt)
}));

// Reconciliations table
export const reconciliations = pgTable("reconciliations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reconciliationDate: date("reconciliation_date").notNull(),
  bankStatementBalance: decimal("bank_statement_balance", { precision: 12, scale: 2 }).notNull(),
  systemBalance: decimal("system_balance", { precision: 12, scale: 2 }).notNull(),
  variance: decimal("variance", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  reconciledBy: integer("reconciled_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  dateIdx: index("idx_reconciliations_date").on(table.reconciliationDate),
  statusIdx: index("idx_reconciliations_status").on(table.status)
}));

// Exception Cases table
export const exceptionCases = pgTable("exception_cases", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  referenceType: text("reference_type").notNull(),
  referenceId: text("reference_id").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  severity: text("severity").notNull(),
  state: text("state").notNull(),
  assignedTo: text("assigned_to"),
  aiRecommendation: jsonb("ai_recommendation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
}, (table) => ({
  stateSeverityIdx: index().on(table.state, table.severity)
}));

// Password History table
export const passwordHistory = pgTable("password_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index("idx_password_history_user").on(table.userId),
  createdAtIdx: index("idx_password_history_created_at").on(table.createdAt)
}));

// Sessions table for express-session
export const sessions = pgTable('sessions', {
  sid: text('sid').primaryKey(),
  sess: jsonb('sess').notNull(),
  expire: timestamp('expire', { withTimezone: true }).notNull()
}, (table) => ({
  expireIdx: index('idx_sessions_expire').on(table.expire)
}));

// Payments table (updated with UUID primary key)
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  paymentDate: date("payment_date").notNull(),
  effectiveDate: date("effective_date").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  principalAmount: decimal("principal_amount", { precision: 12, scale: 2 }),
  interestAmount: decimal("interest_amount", { precision: 12, scale: 2 }),
  escrowAmount: decimal("escrow_amount", { precision: 12, scale: 2 }),
  lateCharges: decimal("late_charges", { precision: 12, scale: 2 }),
  otherFees: decimal("other_fees", { precision: 12, scale: 2 }),
  feeAmount: decimal("fee_amount", { precision: 12, scale: 2 }),
  checkNumber: text("check_number"),
  transactionId: text("transaction_id"),
  confirmationNumber: text("confirmation_number"),
  processedBy: text("processed_by"),
  processedDate: date("processed_date"),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  miAmount: decimal("mi_amount", { precision: 12, scale: 2 }),
  totalReceived: decimal("total_received", { precision: 12, scale: 2 }),
  totalApplied: decimal("total_applied", { precision: 12, scale: 2 }),
  unappliedAmount: decimal("unapplied_amount", { precision: 12, scale: 2 }),
  currentPrincipalBalance: decimal("current_principal_balance", { precision: 12, scale: 2 }),
  currentInterestBalance: decimal("current_interest_balance", { precision: 12, scale: 2 }),
  currentEscrowBalance: decimal("current_escrow_balance", { precision: 12, scale: 2 }),
  currentFeesBalance: decimal("current_fees_balance", { precision: 12, scale: 2 }),
  currentSuspenseBalance: decimal("current_suspense_balance", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  loanIdx: index("idx_payments_loan").on(table.loanId),
  statusIdx: index("idx_payments_status").on(table.status),
  effectiveDateIdx: index("idx_payments_effective_date").on(table.effectiveDate)
}));

// ID Mappings table
export const idMappings = pgTable("id_mappings", {
  uuid: varchar("uuid", { length: 36 }).primaryKey(),
  intId: serial("int_id").unique(),
  tableName: text("table_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  intIdIdx: index("idx_id_mappings_int").on(table.intId),
  tableNameIdx: index("idx_id_mappings_table").on(table.tableName)
}));

// Loan Ledger table
export const loanLedger = pgTable("loan_ledger", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  transactionDate: date("transaction_date").notNull(),
  effectiveDate: date("effective_date").notNull(),
  transactionType: text("transaction_type").notNull(),
  transactionCode: text("transaction_code"),
  paymentId: uuid("payment_id").references(() => payments.id),
  principalAmount: decimal("principal_amount", { precision: 12, scale: 2 }),
  interestAmount: decimal("interest_amount", { precision: 12, scale: 2 }),
  escrowAmount: decimal("escrow_amount", { precision: 12, scale: 2 }),
  feeAmount: decimal("fee_amount", { precision: 12, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  principalBalance: decimal("principal_balance", { precision: 12, scale: 2 }),
  interestBalance: decimal("interest_balance", { precision: 12, scale: 2 }),
  escrowBalance: decimal("escrow_balance", { precision: 12, scale: 2 }),
  description: text("description"),
  reversalOf: integer("reversal_of"),
  reversedBy: integer("reversed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: integer("created_by").references(() => users.id)
}, (table) => ({
  loanIdx: index("idx_loan_ledger_loan").on(table.loanId),
  paymentIdx: index("idx_loan_ledger_payment").on(table.paymentId),
  transactionDateIdx: index("idx_loan_ledger_transaction_date").on(table.transactionDate)
}));

// Payment History table
export const paymentHistory = pgTable("payment_history", {
  id: serial("id").primaryKey(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  changeType: text("change_type").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  changedBy: integer("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
  reason: text("reason")
});

// Escrow Analysis table
export const escrowAnalysis = pgTable("escrow_analysis", {
  id: serial("id").primaryKey(),
  escrowAccountId: integer("escrow_account_id").notNull().references(() => escrowAccounts.id),
  analysisDate: date("analysis_date").notNull(),
  analysisType: text("analysis_type").notNull(),
  projectedLowBalance: decimal("projected_low_balance", { precision: 12, scale: 2 }),
  projectedHighBalance: decimal("projected_high_balance", { precision: 12, scale: 2 }),
  shortage: decimal("shortage", { precision: 12, scale: 2 }),
  surplus: decimal("surplus", { precision: 12, scale: 2 }),
  newPaymentAmount: decimal("new_payment_amount", { precision: 12, scale: 2 }),
  effectiveDate: date("effective_date"),
  status: text("status").notNull().default("pending"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedDate: date("approved_date"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

// Password Reset table
export const passwordReset = pgTable("password_reset", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  tokenIdx: index("idx_password_reset_token").on(table.token),
  userIdx: index("idx_password_reset_user").on(table.userId),
  expiresIdx: index("idx_password_reset_expires").on(table.expiresAt)
}));

// CRM Module Tables
// Call Logs table
export const crmCallLogs = pgTable("crm_call_logs", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  contactId: integer("contact_id").references(() => contacts.id),
  callType: text("call_type").notNull(), // 'inbound', 'outbound'
  callDateTime: timestamp("call_date_time", { withTimezone: true }).notNull(),
  duration: integer("duration"), // in seconds
  outcome: text("outcome"), // 'completed', 'no_answer', 'busy', 'voicemail'
  notes: text("notes"),
  recording: text("recording"), // URL to recording if available
  followUpRequired: boolean("follow_up_required").default(false),
  followUpDate: date("follow_up_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// Activity Timeline table
export const crmActivityTimeline = pgTable("crm_activity_timeline", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  activityType: text("activity_type").notNull(), // 'call', 'email', 'note', 'task', 'document', 'payment'
  activityData: jsonb("activity_data").notNull(),
  relatedId: integer("related_id"), // Reference to related record (call_id, email_id, etc.)
  isSystem: boolean("is_system").default(false), // System-generated vs user-created
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// Notes table
export const crmNotes = pgTable("crm_notes", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  category: text("category"), // 'general', 'payment', 'escrow', 'compliance', 'collection'
  isPinned: boolean("is_pinned").default(false),
  attachments: jsonb("attachments"), // Array of file references
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// Tasks table
export const crmTasks = pgTable("crm_tasks", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  assignedTo: integer("assigned_to").notNull().references(() => users.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("normal"), // 'low', 'normal', 'high', 'urgent'
  status: text("status").notNull().default("pending"), // 'pending', 'in_progress', 'completed', 'cancelled'
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedDate: timestamp("completed_date", { withTimezone: true }),
  completedBy: integer("completed_by").references(() => users.id),
  category: text("category"), // 'follow_up', 'document', 'payment', 'compliance', 'other'
  reminderDate: timestamp("reminder_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// Customer interactions tracking
export const crmInteractions = pgTable("crm_interactions", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  interactionType: text("interaction_type").notNull(), // 'inquiry', 'complaint', 'request', 'notification'
  channel: text("channel").notNull(), // 'phone', 'email', 'portal', 'mail', 'in_person'
  subject: text("subject").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"), // 'open', 'pending', 'resolved', 'escalated'
  resolutionNotes: text("resolution_notes"),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedDate: timestamp("resolved_date", { withTimezone: true }),
  satisfactionRating: integer("satisfaction_rating"), // 1-5 scale
  tags: text("tags").array(), // For categorization and search
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// Appointments/Meetings table
export const crmAppointments = pgTable("crm_appointments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  location: text("location"),
  meetingType: text("meeting_type"), // 'in_person', 'phone', 'video'
  attendees: jsonb("attendees"), // Array of user IDs and contact IDs
  status: text("status").notNull().default("scheduled"), // 'scheduled', 'completed', 'cancelled', 'no_show'
  reminderSent: boolean("reminder_sent").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// Loan collaboration table (for internal team communication)
export const crmLoanCollaborators = pgTable("crm_loan_collaborators", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull(), // 'primary_servicer', 'backup_servicer', 'supervisor', 'specialist'
  permissions: jsonb("permissions"), // Specific permissions for this collaborator
  addedBy: integer("added_by").notNull().references(() => users.id),
  addedDate: timestamp("added_date", { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean("is_active").default(true)
}, (table) => ({
  uniqueLoanUser: unique().on(table.loanId, table.userId)
}));

// Phase 7: Investor Remittance Tables
// Investor Contract table
export const investorContracts = pgTable("investor_contract", {
  contractId: uuid("contract_id").primaryKey().default(sql`gen_random_uuid()`),
  investorId: integer("investor_id").notNull().references(() => investors.id),
  productCode: text("product_code").notNull(),
  method: text("method").notNull(), // CHECK: scheduled_p_i, actual_cash, scheduled_p_i_with_interest_shortfall
  remittanceDay: integer("remittance_day").notNull(), // CHECK: 1-31
  cutoffDay: integer("cutoff_day").notNull(), // CHECK: 1-31
  custodialBankAcctId: uuid("custodial_bank_acct_id").notNull().references(() => bankAccounts.bankAcctId),
  servicerFeeBps: integer("servicer_fee_bps").notNull().default(0),
  lateFeeSpitBps: integer("late_fee_split_bps").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// Waterfall Rule table
export const investorWaterfallRules = pgTable("investor_waterfall_rule", {
  ruleId: uuid("rule_id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: uuid("contract_id").notNull().references(() => investorContracts.contractId, { onDelete: 'cascade' }),
  rank: integer("rank").notNull(),
  bucket: text("bucket").notNull(), // CHECK: interest, principal, late_fees, escrow, recoveries
  capMinor: decimal("cap_minor", { precision: 20, scale: 0 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  uniqueContractRank: unique().on(table.contractId, table.rank)
}));

// Remittance Cycle table  
export const remittanceCycles = pgTable("remittance_cycle", {
  cycleId: uuid("cycle_id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: uuid("contract_id").notNull().references(() => investorContracts.contractId, { onDelete: 'cascade' }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status").notNull().default("open"), // remit_status enum
  totalPrincipalMinor: decimal("total_principal_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  totalInterestMinor: decimal("total_interest_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  totalFeesMinor: decimal("total_fees_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  servicerFeeMinor: decimal("servicer_fee_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  investorDueMinor: decimal("investor_due_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true })
}, (table) => ({
  uniquePeriod: unique().on(table.contractId, table.periodStart, table.periodEnd),
  statusIdx: index("idx_remittance_cycle_status").on(table.status),
  periodIdx: index("idx_remittance_cycle_period").on(table.periodStart, table.periodEnd)
}));

// Remittance Item table
export const remittanceItems = pgTable("remittance_item", {
  itemId: uuid("item_id").primaryKey().default(sql`gen_random_uuid()`),
  cycleId: uuid("cycle_id").notNull().references(() => remittanceCycles.cycleId, { onDelete: 'cascade' }),
  loanId: integer("loan_id").references(() => loans.id),
  principalMinor: decimal("principal_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  interestMinor: decimal("interest_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  feesMinor: decimal("fees_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  investorShareMinor: decimal("investor_share_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  servicerFeeMinor: decimal("servicer_fee_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  cycleIdx: index("idx_remittance_item_cycle").on(table.cycleId),
  loanIdx: index("idx_remittance_item_loan").on(table.loanId)
}));

// Remittance Export table
export const remittanceExports = pgTable("remittance_export", {
  exportId: uuid("export_id").primaryKey().default(sql`gen_random_uuid()`),
  cycleId: uuid("cycle_id").notNull().references(() => remittanceCycles.cycleId, { onDelete: 'cascade' }),
  format: text("format").notNull(), // CHECK: csv, xml
  fileHash: varchar("file_hash", { length: 64 }).notNull(),
  bytes: text("bytes").notNull(), // Store as base64
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  cycleIdx: index("idx_remittance_export_cycle").on(table.cycleId)
}));

// Remittance Reconciliation Snapshot table
export const remittanceReconSnapshots = pgTable("remittance_recon_snapshot", {
  snapshotId: uuid("snapshot_id").primaryKey().default(sql`gen_random_uuid()`),
  cycleId: uuid("cycle_id").notNull().references(() => remittanceCycles.cycleId),
  glPrincipalVarianceMinor: decimal("gl_principal_variance_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  glInterestVarianceMinor: decimal("gl_interest_variance_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  glFeeVarianceMinor: decimal("gl_fee_variance_minor", { precision: 20, scale: 0 }).notNull().default("0"),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull().defaultNow(),
  reconciledBy: text("reconciled_by").notNull()
});

// Bank Account table (for cash management)
export const bankAccounts = pgTable("bank_account", {
  bankAcctId: uuid("bank_acct_id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  bankId: text("bank_id").notNull(),
  accountNumber: text("account_number_mask").notNull(),
  type: text("type").notNull(), // CHECK: operating, custodial_p_i, escrow, fees
  isActive: boolean("is_active").notNull().default(true),
  lastFourDigits: text("last_four_digits"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// Export insert schemas and types
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;

export const insertBorrowerSchema = createInsertSchema(borrowers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBorrower = z.infer<typeof insertBorrowerSchema>;
export type Borrower = typeof borrowers.$inferSelect;

export const insertCoBorrowerSchema = createInsertSchema(coBorrowers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoBorrower = z.infer<typeof insertCoBorrowerSchema>;
export type CoBorrower = typeof coBorrowers.$inferSelect;

export const insertInvestorSchema = createInsertSchema(investors).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvestor = z.infer<typeof insertInvestorSchema>;
export type Investor = typeof investors.$inferSelect;

export const insertLoanSchema = createInsertSchema(loans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Loan = typeof loans.$inferSelect;

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export const insertTemplateSchema = createInsertSchema(templates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templates.$inferSelect;

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export const insertNoticeSchema = createInsertSchema(notices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotice = z.infer<typeof insertNoticeSchema>;
export type Notice = typeof notices.$inferSelect;

export const insertEscrowAccountSchema = createInsertSchema(escrowAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEscrowAccount = z.infer<typeof insertEscrowAccountSchema>;
export type EscrowAccount = typeof escrowAccounts.$inferSelect;

export const insertEscrowDisbursementSchema = createInsertSchema(escrowDisbursements).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEscrowDisbursement = z.infer<typeof insertEscrowDisbursementSchema>;
export type EscrowDisbursement = typeof escrowDisbursements.$inferSelect;

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  lastPasswordChange: true,
  failedLoginAttempts: true,
  activeMfaMethods: true 
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertRoleSchema = createInsertSchema(roles).omit({ id: true, createdAt: true });
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ assignedAt: true });
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

export const insertPermissionSchema = createInsertSchema(permissions).omit({ id: true, createdAt: true });
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ assignedAt: true });
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, updatedAt: true });
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

export const insertLoginAttemptSchema = createInsertSchema(loginAttempts).omit({ id: true, attemptedAt: true });
export type InsertLoginAttempt = z.infer<typeof insertLoginAttemptSchema>;
export type LoginAttempt = typeof loginAttempts.$inferSelect;

export const insertUserIpAllowlistSchema = createInsertSchema(userIpAllowlist).omit({ id: true, createdAt: true });
export type InsertUserIpAllowlist = z.infer<typeof insertUserIpAllowlistSchema>;
export type UserIpAllowlist = typeof userIpAllowlist.$inferSelect;

export const insertAuthEventSchema = createInsertSchema(authEvents).omit({ id: true, createdAt: true });
export type InsertAuthEvent = z.infer<typeof insertAuthEventSchema>;
export type AuthEvent = typeof authEvents.$inferSelect;

export const insertPasswordHistorySchema = createInsertSchema(passwordHistory).omit({ id: true, createdAt: true });
export type InsertPasswordHistory = z.infer<typeof insertPasswordHistorySchema>;
export type PasswordHistory = typeof passwordHistory.$inferSelect;

export const insertPasswordResetSchema = createInsertSchema(passwordReset).omit({ id: true, createdAt: true });
export type InsertPasswordReset = z.infer<typeof insertPasswordResetSchema>;
export type PasswordReset = typeof passwordReset.$inferSelect;

export const insertLoanLedgerSchema = createInsertSchema(loanLedger).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLoanLedger = z.infer<typeof insertLoanLedgerSchema>;
export type LoanLedger = typeof loanLedger.$inferSelect;

export const insertPaymentHistorySchema = createInsertSchema(paymentHistory).omit({ id: true, changedAt: true });
export type InsertPaymentHistory = z.infer<typeof insertPaymentHistorySchema>;
export type PaymentHistory = typeof paymentHistory.$inferSelect;

export const insertEscrowAnalysisSchema = createInsertSchema(escrowAnalysis).omit({ id: true, createdAt: true });
export type InsertEscrowAnalysis = z.infer<typeof insertEscrowAnalysisSchema>;
export type EscrowAnalysis = typeof escrowAnalysis.$inferSelect;

export const insertSessionSchema = createInsertSchema(sessions);
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// CRM Module Schemas
export const insertCrmCallLogSchema = createInsertSchema(crmCallLogs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmCallLog = z.infer<typeof insertCrmCallLogSchema>;
export type CrmCallLog = typeof crmCallLogs.$inferSelect;

export const insertCrmActivityTimelineSchema = createInsertSchema(crmActivityTimeline).omit({ id: true, createdAt: true });
export type InsertCrmActivityTimeline = z.infer<typeof insertCrmActivityTimelineSchema>;
export type CrmActivityTimeline = typeof crmActivityTimeline.$inferSelect;

export const insertCrmNoteSchema = createInsertSchema(crmNotes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmNote = z.infer<typeof insertCrmNoteSchema>;
export type CrmNote = typeof crmNotes.$inferSelect;

export const insertCrmTaskSchema = createInsertSchema(crmTasks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmTask = z.infer<typeof insertCrmTaskSchema>;
export type CrmTask = typeof crmTasks.$inferSelect;

export const insertCrmInteractionSchema = createInsertSchema(crmInteractions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmInteraction = z.infer<typeof insertCrmInteractionSchema>;
export type CrmInteraction = typeof crmInteractions.$inferSelect;

export const insertCrmAppointmentSchema = createInsertSchema(crmAppointments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmAppointment = z.infer<typeof insertCrmAppointmentSchema>;
export type CrmAppointment = typeof crmAppointments.$inferSelect;

export const insertCrmLoanCollaboratorSchema = createInsertSchema(crmLoanCollaborators).omit({ id: true });
export type InsertCrmLoanCollaborator = z.infer<typeof insertCrmLoanCollaboratorSchema>;
export type CrmLoanCollaborator = typeof crmLoanCollaborators.$inferSelect;

// Investor remittance schemas
export type InsertInvestorContract = z.infer<typeof insertInvestorContractSchema>;
export type InvestorContract = typeof investorContracts.$inferSelect;

export const insertInvestorContractSchema = createInsertSchema(investorContracts).omit({
  contractId: true,
  createdAt: true
});

export type InsertInvestorWaterfallRule = z.infer<typeof insertInvestorWaterfallRuleSchema>;
export type InvestorWaterfallRule = typeof investorWaterfallRules.$inferSelect;

export const insertInvestorWaterfallRuleSchema = createInsertSchema(investorWaterfallRules).omit({
  ruleId: true,
  createdAt: true
});

export type InsertRemittanceCycle = z.infer<typeof insertRemittanceCycleSchema>;
export type RemittanceCycle = typeof remittanceCycles.$inferSelect;

export const insertRemittanceCycleSchema = createInsertSchema(remittanceCycles).omit({
  cycleId: true,
  createdAt: true,
  lockedAt: true,
  settledAt: true
});

export type InsertRemittanceItem = z.infer<typeof insertRemittanceItemSchema>;
export type RemittanceItem = typeof remittanceItems.$inferSelect;

export const insertRemittanceItemSchema = createInsertSchema(remittanceItems).omit({
  itemId: true,
  createdAt: true
});

export type InsertRemittanceExport = z.infer<typeof insertRemittanceExportSchema>;
export type RemittanceExport = typeof remittanceExports.$inferSelect;

export const insertRemittanceExportSchema = createInsertSchema(remittanceExports).omit({
  exportId: true,
  createdAt: true
});

export type InsertRemittanceReconSnapshot = z.infer<typeof insertRemittanceReconSnapshotSchema>;
export type RemittanceReconSnapshot = typeof remittanceReconSnapshots.$inferSelect;

export const insertRemittanceReconSnapshotSchema = createInsertSchema(remittanceReconSnapshots).omit({
  snapshotId: true,
  reconciledAt: true
});

export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccounts.$inferSelect;

export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({
  bankAcctId: true,
  createdAt: true
});

// Export types for new tables
export const insertIdMappingSchema = createInsertSchema(idMappings).omit({
  uuid: true,
  createdAt: true
});
export type InsertIdMapping = z.infer<typeof insertIdMappingSchema>;
export type IdMapping = typeof idMappings.$inferSelect;

export const insertPaymentIngestionSchema = createInsertSchema(paymentIngestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertPaymentIngestion = z.infer<typeof insertPaymentIngestionSchema>;
export type PaymentIngestion = typeof paymentIngestions.$inferSelect;

export const insertPaymentArtifactSchema = createInsertSchema(paymentArtifacts).omit({
  id: true,
  createdAt: true
});
export type InsertPaymentArtifact = z.infer<typeof insertPaymentArtifactSchema>;
export type PaymentArtifact = typeof paymentArtifacts.$inferSelect;

export const insertPaymentEventSchema = createInsertSchema(paymentEvents).omit({
  id: true,
  createdAt: true
});
export type InsertPaymentEvent = z.infer<typeof insertPaymentEventSchema>;
export type PaymentEvent = typeof paymentEvents.$inferSelect;

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;

export const insertInboxSchema = createInsertSchema(inbox).omit({
  id: true,
  processedAt: true
});
export type InsertInbox = z.infer<typeof insertInboxSchema>;
export type Inbox = typeof inbox.$inferSelect;

export const insertOutboxSchema = createInsertSchema(outbox).omit({
  id: true,
  createdAt: true,
  publishedAt: true,
  attemptCount: true,
  lastError: true,
  nextRetryAt: true
});
export type InsertOutbox = z.infer<typeof insertOutboxSchema>;
export type Outbox = typeof outbox.$inferSelect;

export const insertOutboxMessageSchema = createInsertSchema(outboxMessages).omit({
  id: true,
  createdAt: true
});
export type InsertOutboxMessage = z.infer<typeof insertOutboxMessageSchema>;
export type OutboxMessage = typeof outboxMessages.$inferSelect;

export const insertReconciliationSchema = createInsertSchema(reconciliations).omit({
  id: true,
  createdAt: true
});
export type InsertReconciliation = z.infer<typeof insertReconciliationSchema>;
export type Reconciliation = typeof reconciliations.$inferSelect;

export const insertExceptionCaseSchema = createInsertSchema(exceptionCases).omit({
  id: true,
  createdAt: true
});
export type InsertExceptionCase = z.infer<typeof insertExceptionCaseSchema>;
export type ExceptionCase = typeof exceptionCases.$inferSelect;

