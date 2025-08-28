import { pgTable, pgEnum, serial, text, integer, decimal, date, boolean, timestamp, jsonb, index, unique, varchar, check, bigint, real, uniqueIndex, uuid} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "lender", "servicer", "investor", "borrower"]);
export const loanStatusEnum = pgEnum("loan_status", ["active", "defaulted", "paid_off", "reo", "forbearance", "modification", "bankruptcy"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "applied", "reversed", "failed", "nsf"]);
export const paymentChannelEnum = pgEnum("payment_channel", ["ach", "wire", "check", "money_order", "payoff", "cash"]);
export const propertyTypeEnum = pgEnum("property_type", ["single_family", "condo", "townhouse", "multi_family", "commercial", "land", "manufactured", "other"]);
export const documentTypeEnum = pgEnum("document_type", ["application", "note", "mortgage", "appraisal", "title", "insurance", "income", "tax_return", "bank_statement", "correspondence", "servicing", "legal", "other"]);
export const documentStatusEnum = pgEnum("document_status", ["pending", "processing", "complete", "failed", "error"]);
export const occupancyTypeEnum = pgEnum("occupancy_type", ["owner_occupied", "second_home", "investment"]);
export const loanTypeEnum = pgEnum("loan_type", ["conventional", "fha", "va", "usda", "jumbo", "portfolio", "hard_money", "other"]);
export const loanPurposeEnum = pgEnum("loan_purpose", ["purchase", "refinance", "cash_out_refi", "construction", "rehabilitation", "other"]);

// Tables
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("borrower"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  company: text("company"),
  phone: text("phone"),
  isActive: boolean("is_active").default(true).notNull(),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until")
}, (t) => ({
  emailIdx: index("users_email_idx").on(t.email),
  roleIdx: index("users_role_idx").on(t.role),
  activeIdx: index("users_active_idx").on(t.isActive)
}));

export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  uniquePermission: unique().on(t.resource, t.action),
  resourceIdx: index("permissions_resource_idx").on(t.resource)
}));

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  role: userRoleEnum("role").notNull(),
  permissionId: integer("permission_id").references(() => permissions.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  uniqueRolePermission: unique().on(t.role, t.permissionId),
  roleIdx: index("role_permissions_role_idx").on(t.role)
}));

// Policy rules - for permission enforcement
export const policyRules = pgTable("policy_rules", {
  id: serial("id").primaryKey(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  condition: jsonb("condition").notNull(), // JSON expression for rule evaluation
  effect: text("effect").notNull(), // 'allow' or 'deny'
  priority: integer("priority").default(0).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  resourceActionIdx: index("policy_rules_resource_action_idx").on(t.resource, t.action),
  activeIdx: index("policy_rules_active_idx").on(t.isActive),
  priorityIdx: index("policy_rules_priority_idx").on(t.priority)
}));

export const userPermissionOverrides = pgTable("user_permission_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  permissionId: integer("permission_id").references(() => permissions.id).notNull(),
  grant: boolean("grant").notNull(), // true = grant, false = revoke
  expiresAt: timestamp("expires_at"),
  reason: text("reason"),
  grantedBy: integer("granted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  uniqueUserPermission: unique().on(t.userId, t.permissionId),
  userIdx: index("overrides_user_idx").on(t.userId),
  expiresIdx: index("overrides_expires_idx").on(t.expiresAt)
}));

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  tokenIdx: index("sessions_token_idx").on(t.token),
  userIdx: index("sessions_user_idx").on(t.userId),
  expiresIdx: index("sessions_expires_idx").on(t.expiresAt)
}));

export const lenders = pgTable("lenders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  website: text("website"),
  taxId: text("tax_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  nameIdx: index("lenders_name_idx").on(t.name)
}));

export const servicers = pgTable("servicers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  website: text("website"),
  taxId: text("tax_id"),
  servicingFeeRate: decimal("servicing_fee_rate", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  nameIdx: index("servicers_name_idx").on(t.name)
}));

// Borrower Entities - represents actual borrowers
export const borrowerEntities = pgTable("borrower_entities", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  ssn: text("ssn"),
  dateOfBirth: date("date_of_birth"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  creditScore: integer("credit_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  nameIdx: index("borrower_entities_name_idx").on(t.firstName, t.lastName),
  emailIdx: index("borrower_entities_email_idx").on(t.email)
}));

// Properties - real estate properties
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
  garageSpaces: integer("garage_spaces"),
  hasHoa: boolean("has_hoa").default(false),
  hoaFee: decimal("hoa_fee", { precision: 10, scale: 2 }),
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
  floodZone: text("flood_zone"),
  floodInsuranceRequired: boolean("flood_insurance_required").default(false),
  // Occupancy
  occupancyType: occupancyTypeEnum("occupancy_type"),
  rentalIncome: decimal("rental_income", { precision: 10, scale: 2 }),
  // Meta
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  addressIdx: index("properties_address_idx").on(t.address, t.city, t.state),
  apnIdx: index("properties_apn_idx").on(t.apn)
}));

export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  loanNumber: text("loan_number").notNull(),
  // Core relationships
  lenderId: integer("lender_id").references(() => lenders.id),
  servicerId: integer("servicer_id").references(() => servicers.id),
  investorId: integer("investor_id").references(() => users.id),
  // Property
  propertyId: integer("property_id").references(() => properties.id).notNull(),
  // Loan terms
  originalAmount: decimal("original_amount", { precision: 15, scale: 2 }).notNull(),
  principalBalance: decimal("principal_balance", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 6, scale: 4 }).notNull(),
  loanTerm: integer("loan_term").notNull(), // months
  loanType: loanTypeEnum("loan_type").notNull(),
  loanPurpose: loanPurposeEnum("loan_purpose"),
  originationDate: date("origination_date").notNull(),
  firstPaymentDate: date("first_payment_date").notNull(),
  maturityDate: date("maturity_date").notNull(),
  paymentDay: integer("payment_day").notNull(), // day of month (1-31)
  // Payment details
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }).notNull(),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }),
  currentInterestRate: decimal("current_interest_rate", { precision: 6, scale: 4 }),
  nextPaymentDueDate: date("next_payment_due_date"),
  lastPaymentDate: date("last_payment_date"),
  lastPaymentAmount: decimal("last_payment_amount", { precision: 10, scale: 2 }),
  // Status
  status: loanStatusEnum("status").notNull().default("active"),
  currentDaysDelinquent: integer("current_days_delinquent").default(0).notNull(),
  timesThirtyDaysLate: integer("times_thirty_days_late").default(0).notNull(),
  timesSixtyDaysLate: integer("times_sixty_days_late").default(0).notNull(),
  timesNinetyDaysLate: integer("times_ninety_days_late").default(0).notNull(),
  // Servicing fees and charges
  servicingFee: decimal("servicing_fee", { precision: 10, scale: 2 }),
  lateFeeAmount: decimal("late_fee_amount", { precision: 10, scale: 2 }),
  nsfFeeAmount: decimal("nsf_fee_amount", { precision: 10, scale: 2 }),
  // Loan features
  hasEscrow: boolean("has_escrow").default(true).notNull(),
  hasPmi: boolean("has_pmi").default(false).notNull(),
  pmiAmount: decimal("pmi_amount", { precision: 10, scale: 2 }),
  isAdjustableRate: boolean("is_adjustable_rate").default(false).notNull(),
  rateAdjustmentFrequency: integer("rate_adjustment_frequency"), // months
  rateCapInitial: decimal("rate_cap_initial", { precision: 6, scale: 4 }),
  rateCapPeriodic: decimal("rate_cap_periodic", { precision: 6, scale: 4 }),
  rateCapLifetime: decimal("rate_cap_lifetime", { precision: 6, scale: 4 }),
  rateFloor: decimal("rate_floor", { precision: 6, scale: 4 }),
  indexName: text("index_name"),
  margin: decimal("margin", { precision: 6, scale: 4 }),
  // Prepayment
  hasPrepaymentPenalty: boolean("has_prepayment_penalty").default(false).notNull(),
  prepaymentPenaltyEndDate: date("prepayment_penalty_end_date"),
  prepaymentPenaltyAmount: decimal("prepayment_penalty_amount", { precision: 10, scale: 2 }),
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  importedFrom: text("imported_from"),
  externalId: text("external_id"),
  notes: text("notes"),
  tags: text("tags")
}, (t) => ({
  loanNumberIdx: uniqueIndex("loan_number_idx").on(table.loanNumber),
  statusIdx: index("loan_status_idx").on(table.status),
  propertyIdx: index("loan_property_idx").on(table.propertyId),
  maturityIdx: index("loan_maturity_idx").on(table.maturityDate),
  servicerIdx: index("loan_servicer_idx").on(table.servicerId),
  nextPaymentIdx: index("loan_next_payment_idx").on(table.nextPaymentDueDate),
  delinquentIdx: index("loan_delinquent_idx").on(table.currentDaysDelinquent)
}));

// Loan Borrowers - junction table for many-to-many relationship
export const loanBorrowers = pgTable("loan_borrowers", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("loan_borrowers_loan_idx").on(t.loanId),
  borrowerIdx: index("loan_borrowers_borrower_idx").on(t.borrowerEntityId),
  uniqueLoanBorrower: unique().on(t.loanId, t.borrowerEntityId)
}));

export const investors = pgTable("investors", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  investorId: text("investor_id").notNull(),
  investorName: text("investor_name").notNull(),
  ownershipPercentage: decimal("ownership_percentage", { precision: 5, scale: 2 }).notNull(),
  purchaseDate: date("purchase_date"),
  purchasePrice: decimal("purchase_price", { precision: 15, scale: 2 }),
  servicingRightsPurchased: boolean("servicing_rights_purchased").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("investors_loan_idx").on(t.loanId),
  investorIdx: index("investors_investor_idx").on(t.investorId)
}));

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  paymentDate: date("payment_date").notNull(),
  effectiveDate: date("effective_date").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  principalAmount: decimal("principal_amount", { precision: 10, scale: 2 }).notNull(),
  interestAmount: decimal("interest_amount", { precision: 10, scale: 2 }).notNull(),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }),
  feesAmount: decimal("fees_amount", { precision: 10, scale: 2 }),
  lateChargesAmount: decimal("late_charges_amount", { precision: 10, scale: 2 }),
  status: paymentStatusEnum("status").notNull().default("pending"),
  channel: paymentChannelEnum("channel").notNull(),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  reversedAt: timestamp("reversed_at"),
  reversalReason: text("reversal_reason"),
  processedBy: integer("processed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("payments_loan_idx").on(t.loanId),
  dateIdx: index("payments_date_idx").on(t.paymentDate),
  statusIdx: index("payments_status_idx").on(t.status),
  referenceIdx: index("payments_reference_idx").on(t.referenceNumber)
}));

export const escrowAccounts = pgTable("escrow_accounts", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  currentBalance: decimal("current_balance", { precision: 10, scale: 2 }).notNull().default('0'),
  targetBalance: decimal("target_balance", { precision: 10, scale: 2 }),
  // Annual amounts
  propertyTaxAmount: decimal("property_tax_amount", { precision: 10, scale: 2 }),
  homeownersInsuranceAmount: decimal("homeowners_insurance_amount", { precision: 10, scale: 2 }),
  mortgageInsuranceAmount: decimal("mortgage_insurance_amount", { precision: 10, scale: 2 }),
  floodInsuranceAmount: decimal("flood_insurance_amount", { precision: 10, scale: 2 }),
  otherAmount1: decimal("other_amount_1", { precision: 10, scale: 2 }),
  otherAmount1Description: text("other_amount_1_description"),
  // Disbursement info
  nextPropertyTaxDueDate: date("next_property_tax_due_date"),
  nextInsuranceDueDate: date("next_insurance_due_date"),
  lastAnalysisDate: date("last_analysis_date"),
  nextAnalysisDate: date("next_analysis_date"),
  // Status
  hasShortage: boolean("has_shortage").default(false).notNull(),
  shortageAmount: decimal("shortage_amount", { precision: 10, scale: 2 }),
  hasSurplus: boolean("has_surplus").default(false).notNull(),
  surplusAmount: decimal("surplus_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: uniqueIndex("escrow_accounts_loan_idx").on(t.loanId)
}));

export const escrowTransactions = pgTable("escrow_transactions", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
  transactionDate: date("transaction_date").notNull(),
  effectiveDate: date("effective_date").notNull(),
  type: text("type").notNull(), // "deposit", "disbursement", "adjustment"
  category: text("category").notNull(), // "property_tax", "insurance", "pmi", "other"
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull(),
  payee: text("payee"),
  referenceNumber: text("reference_number"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  accountIdx: index("escrow_transactions_account_idx").on(t.escrowAccountId),
  dateIdx: index("escrow_transactions_date_idx").on(t.transactionDate),
  typeIdx: index("escrow_transactions_type_idx").on(t.type)
}));

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  documentType: documentTypeEnum("document_type").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storageKey: text("storage_key").notNull(),
  storageUrl: text("storage_url"),
  status: documentStatusEnum("status").notNull().default("pending"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
  extractedText: text("extracted_text"),
  aiAnalysis: jsonb("ai_analysis"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("documents_loan_idx").on(t.loanId),
  borrowerIdx: index("documents_borrower_idx").on(t.borrowerEntityId),
  typeIdx: index("documents_type_idx").on(t.documentType),
  uploadedAtIdx: index("documents_uploaded_at_idx").on(t.uploadedAt)
}));

export const paymentSchedule = pgTable("payment_schedule", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  dueDate: date("due_date").notNull(),
  paymentNumber: integer("payment_number").notNull(),
  principalAmount: decimal("principal_amount", { precision: 10, scale: 2 }).notNull(),
  interestAmount: decimal("interest_amount", { precision: 10, scale: 2 }).notNull(),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }),
  pmiAmount: decimal("pmi_amount", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  beginningBalance: decimal("beginning_balance", { precision: 15, scale: 2 }).notNull(),
  endingBalance: decimal("ending_balance", { precision: 15, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").default(false).notNull(),
  paidDate: date("paid_date"),
  paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("schedule_loan_idx").on(t.loanId),
  dueDateIdx: index("schedule_due_date_idx").on(t.dueDate),
  loanDueDateIdx: uniqueIndex("schedule_loan_due_date_idx").on(t.loanId, t.dueDate)
}));

// Audit logs - automatically created by triggers
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: integer("record_id"),
  action: text("action").notNull(), // INSERT, UPDATE, DELETE
  userId: integer("user_id").references(() => users.id),
  changes: jsonb("changes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  tableIdx: index("audit_logs_table_idx").on(t.tableName),
  recordIdx: index("audit_logs_record_idx").on(t.recordId),
  userIdx: index("audit_logs_user_idx").on(t.userId),
  createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt)
}));

// Notes and comments
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  userId: integer("user_id").references(() => users.id).notNull(),
  noteType: text("note_type").notNull(), // "general", "collection", "servicing", "investor", etc.
  content: text("content").notNull(),
  isPrivate: boolean("is_private").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("notes_loan_idx").on(t.loanId),
  borrowerIdx: index("notes_borrower_idx").on(t.borrowerEntityId),
  userIdx: index("notes_user_idx").on(t.userId),
  typeIdx: index("notes_type_idx").on(t.noteType),
  createdAtIdx: index("notes_created_at_idx").on(t.createdAt)
}));

// Tasks and workflows
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  taskType: text("task_type").notNull(), // "review", "collection_call", "document_request", etc.
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"), // "low", "medium", "high", "urgent"
  status: text("status").notNull().default("pending"), // "pending", "in_progress", "completed", "cancelled"
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("tasks_loan_idx").on(t.loanId),
  assignedToIdx: index("tasks_assigned_to_idx").on(t.assignedTo),
  statusIdx: index("tasks_status_idx").on(t.status),
  dueDateIdx: index("tasks_due_date_idx").on(t.dueDate)
}));

// Escrow disbursements
export const escrowDisbursements = pgTable("escrow_disbursements", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
  disbursementType: text("disbursement_type").notNull(), // "property_tax", "insurance", "pmi", etc.
  payee: text("payee").notNull(),
  accountNumber: text("account_number"),
  scheduledDate: date("scheduled_date").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("scheduled"), // "scheduled", "pending", "processed", "failed"
  processedDate: date("processed_date"),
  checkNumber: text("check_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("disbursements_loan_idx").on(t.loanId),
  scheduledDateIdx: index("disbursements_scheduled_date_idx").on(t.scheduledDate),
  statusIdx: index("disbursements_status_idx").on(t.status)
}));

// Collection activities
export const collectionActivities = pgTable("collection_activities", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  activityType: text("activity_type").notNull(), // "call", "letter", "email", "text", "visit", etc.
  activityDate: timestamp("activity_date").notNull(),
  contactedPerson: text("contacted_person"),
  outcome: text("outcome"), // "promised_payment", "left_message", "no_answer", etc.
  promisedPaymentDate: date("promised_payment_date"),
  promisedPaymentAmount: decimal("promised_payment_amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
  nextActionDate: date("next_action_date"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("collection_activities_loan_idx").on(t.loanId),
  dateIdx: index("collection_activities_date_idx").on(t.activityDate),
  userIdx: index("collection_activities_user_idx").on(t.userId)
}));

// Reporting snapshots
export const loanSnapshots = pgTable("loan_snapshots", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  principalBalance: decimal("principal_balance", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 6, scale: 4 }).notNull(),
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }).notNull(),
  status: loanStatusEnum("status").notNull(),
  daysDelinquent: integer("days_delinquent").notNull(),
  lastPaymentDate: date("last_payment_date"),
  lastPaymentAmount: decimal("last_payment_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  loanDateIdx: uniqueIndex("snapshots_loan_date_idx").on(t.loanId, t.snapshotDate),
  dateIdx: index("snapshots_date_idx").on(t.snapshotDate)
}));

// CRM Related Tables
export const crmContacts = pgTable("crm_contacts", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerId: integer("borrower_id").references(() => borrowerEntities.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  role: text("role"), // "borrower", "co-borrower", "attorney", "realtor", etc.
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("crm_contacts_loan_idx").on(t.loanId),
  borrowerIdx: index("crm_contacts_borrower_idx").on(t.borrowerId),
  emailIdx: index("crm_contacts_email_idx").on(t.email)
}));

export const crmActivities = pgTable("crm_activities", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  contactId: integer("contact_id").references(() => crmContacts.id),
  userId: integer("user_id").references(() => users.id),
  activityType: text("activity_type").notNull(), // "call", "email", "note", "meeting", "task"
  subject: text("subject"),
  description: text("description"),
  outcome: text("outcome"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  duration: integer("duration"), // in minutes
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("crm_activities_loan_idx").on(t.loanId),
  contactIdx: index("crm_activities_contact_idx").on(t.contactId),
  userIdx: index("crm_activities_user_idx").on(t.userId),
  typeIdx: index("crm_activities_type_idx").on(t.activityType),
  scheduledIdx: index("crm_activities_scheduled_idx").on(t.scheduledAt)
}));

// Payment Allocations - track how payments are distributed
export const paymentAllocations = pgTable("payment_allocations", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").references(() => payments.id).notNull(),
  allocationType: text("allocation_type").notNull(), // "principal", "interest", "escrow", "late_fee", etc.
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  paymentIdx: index("allocations_payment_idx").on(t.paymentId),
  typeIdx: index("allocations_type_idx").on(t.allocationType)
}));

// Investor positions - track ownership percentages
export const investorPositions = pgTable("investor_positions", {
  id: serial("id").primaryKey(),
  investorId: text("investor_id").notNull(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  ownershipPercentage: decimal("ownership_percentage", { precision: 6, scale: 4 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  expirationDate: date("expiration_date"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  investorLoanIdx: index("positions_investor_loan_idx").on(t.investorId, t.loanId),
  effectiveDateIdx: index("positions_effective_date_idx").on(t.effectiveDate)
}));

// Escrow disbursement payments - track actual payments made
export const escrowDisbursementPayments = pgTable("escrow_disbursement_payments", {
  id: serial("id").primaryKey(),
  disbursementId: integer("disbursement_id").references(() => escrowDisbursements.id).notNull(),
  paymentMethod: text("payment_method").notNull(), // "check", "ach", "wire"
  paymentReference: text("payment_reference"),
  paymentDate: date("payment_date").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull(), // "pending", "cleared", "returned"
  clearedDate: date("cleared_date"),
  returnReason: text("return_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  disbursementIdx: index("disbursement_payments_disbursement_idx").on(t.disbursementId),
  statusIdx: index("disbursement_payments_status_idx").on(t.status)
}));

// Escrow analysis records
export const escrowAnalysis = pgTable("escrow_analysis", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  analysisDate: date("analysis_date").notNull(),
  analysisType: text("analysis_type").notNull(), // "annual", "short_year", "manual"
  projectedLowPoint: decimal("projected_low_point", { precision: 10, scale: 2 }),
  projectedLowPointMonth: text("projected_low_point_month"),
  requiredCushion: decimal("required_cushion", { precision: 10, scale: 2 }),
  shortage: decimal("shortage", { precision: 10, scale: 2 }),
  surplus: decimal("surplus", { precision: 10, scale: 2 }),
  newMonthlyPayment: decimal("new_monthly_payment", { precision: 10, scale: 2 }),
  effectiveDate: date("effective_date"),
  shortageSpreadMonths: integer("shortage_spread_months"),
  createdBy: integer("created_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("escrow_analysis_loan_idx").on(t.loanId),
  dateIdx: index("escrow_analysis_date_idx").on(t.analysisDate)
}));

// Add Email Template System Tables
export const emailTemplateFolders = pgTable("email_template_folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id").references(() => emailTemplateFolders.id),
  description: text("description"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  parentIdx: index("email_template_folders_parent_idx").on(t.parentId),
  nameIdx: index("email_template_folders_name_idx").on(t.name)
}));

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  folderId: integer("folder_id").references(() => emailTemplateFolders.id),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  category: text("category"), // "collection", "servicing", "investor", etc.
  variables: jsonb("variables"), // List of variables used in template
  attachments: jsonb("attachments"), // Default attachments configuration
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  folderIdx: index("email_templates_folder_idx").on(t.folderId),
  categoryIdx: index("email_templates_category_idx").on(t.category),
  activeIdx: index("email_templates_active_idx").on(t.isActive),
  nameIdx: index("email_templates_name_idx").on(t.name)
}));

export const smsTemplates = pgTable("sms_templates", {
  id: serial("id").primaryKey(),
  folderId: integer("folder_id").references(() => emailTemplateFolders.id),
  name: text("name").notNull(),
  content: text("content").notNull(),
  category: text("category"), // "collection", "reminder", "alert", etc.
  variables: jsonb("variables"), // List of variables used in template
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  folderIdx: index("sms_templates_folder_idx").on(t.folderId),
  categoryIdx: index("sms_templates_category_idx").on(t.category),
  activeIdx: index("sms_templates_active_idx").on(t.isActive),
  nameIdx: index("sms_templates_name_idx").on(t.name)
}));

// Document folders for hierarchical organization
export const documentFolders = pgTable("document_folders", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  parentId: integer("parent_id").references(() => documentFolders.id),
  name: text("name").notNull(),
  path: text("path").notNull(), // Full path for easier querying
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("document_folders_loan_idx").on(t.loanId),
  parentIdx: index("document_folders_parent_idx").on(t.parentId),
  pathIdx: index("document_folders_path_idx").on(t.path)
}));

// Update documents table to include folder reference
export const documentsV2 = pgTable("documents_v2", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id),
  folderId: integer("folder_id").references(() => documentFolders.id),
  documentType: documentTypeEnum("document_type").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storageKey: text("storage_key").notNull(),
  storageUrl: text("storage_url"),
  status: documentStatusEnum("status").notNull().default("pending"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
  extractedText: text("extracted_text"),
  aiAnalysis: jsonb("ai_analysis"),
  fileHash: text("file_hash"), // SHA256 hash for deduplication
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("documents_v2_loan_idx").on(t.loanId),
  borrowerIdx: index("documents_v2_borrower_idx").on(t.borrowerEntityId),
  folderIdx: index("documents_v2_folder_idx").on(t.folderId),
  typeIdx: index("documents_v2_type_idx").on(t.documentType),
  uploadedAtIdx: index("documents_v2_uploaded_at_idx").on(t.uploadedAt),
  hashIdx: index("documents_v2_hash_idx").on(t.fileHash)
}));

// Document access logs
export const documentAccessLogs = pgTable("document_access_logs", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documentsV2.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(), // "view", "download", "print", "email"
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  documentIdx: index("doc_access_document_idx").on(t.documentId),
  userIdx: index("doc_access_user_idx").on(t.userId),
  actionIdx: index("doc_access_action_idx").on(t.action)
}));

// ================================================================================
// NEW ADDITIONS FOR Q2 2025 - DOUBLE-ENTRY LEDGER, CASH MANAGEMENT, AND BANKING
// ================================================================================

// General ledger events (transaction headers)
export const generalLedgerEvents = pgTable("general_ledger_events", {
  eventId: uuid("event_id").primaryKey().defaultRandom(),
  eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull().defaultNow(),
  eventType: text("event_type").notNull(), // payment, disbursement, adjustment, fee, etc.
  businessDate: date("business_date").notNull(),
  sourceSystem: text("source_system").notNull(), // servicing, cash_mgmt, escrow, etc.
  sourceId: text("source_id"), // Reference to source record
  description: text("description").notNull(),
  reversalOfEventId: uuid("reversal_of_event_id").references(() => generalLedgerEvents.eventId),
  isReversed: boolean("is_reversed").notNull().default(false),
  userId: integer("user_id").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  timestampIdx: index("gl_events_timestamp_idx").on(t.eventTimestamp),
  businessDateIdx: index("gl_events_business_date_idx").on(t.businessDate),
  eventTypeIdx: index("gl_events_type_idx").on(t.eventType),
  sourceIdx: index("gl_events_source_idx").on(t.sourceSystem, t.sourceId)
}));

// General ledger entries (double-entry line items)
export const generalLedgerEntries = pgTable("general_ledger_entries", {
  entryId: uuid("entry_id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").references(() => generalLedgerEvents.eventId).notNull(),
  accountCode: text("account_code").notNull(), // Chart of accounts code
  accountName: text("account_name").notNull(),
  debitAmountMinor: bigint("debit_amount_minor", { mode: 'bigint' }).notNull().default(0n),
  creditAmountMinor: bigint("credit_amount_minor", { mode: 'bigint' }).notNull().default(0n),
  currency: text("currency").notNull().default('USD'),
  loanId: integer("loan_id").references(() => loans.id),
  entityType: text("entity_type"), // loan, investor, vendor, etc.
  entityId: text("entity_id"), // Reference to specific entity
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  eventIdx: index("gl_entries_event_idx").on(t.eventId),
  accountIdx: index("gl_entries_account_idx").on(t.accountCode),
  loanIdx: index("gl_entries_loan_idx").on(t.loanId),
  entityIdx: index("gl_entries_entity_idx").on(t.entityType, t.entityId),
  check('gl_entry_single_amount', sql`(debit_amount_minor = 0 OR credit_amount_minor = 0)`)
}));

// Loan terms (replaces inline fields in loans table for proper history)
export const loanTerms = pgTable("loan_terms", {
  termId: uuid("term_id").primaryKey().defaultRandom(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  effectiveDate: date("effective_date").notNull(),
  expirationDate: date("expiration_date"),
  interestRatePercent: decimal("interest_rate_percent", { precision: 8, scale: 5 }).notNull(),
  piPaymentMinor: bigint("pi_payment_minor", { mode: 'bigint' }).notNull(),
  escrowPaymentMinor: bigint("escrow_payment_minor", { mode: 'bigint' }),
  totalPaymentMinor: bigint("total_payment_minor", { mode: 'bigint' }).notNull(),
  lateFeeDays: integer("late_fee_days").notNull().default(15),
  lateFeeMinor: bigint("late_fee_minor", { mode: 'bigint' }).notNull(),
  lateFeePercent: decimal("late_fee_percent", { precision: 5, scale: 3 }),
  prepaymentPenaltyEndDate: date("prepayment_penalty_end_date"),
  prepaymentPenaltyPercent: decimal("prepayment_penalty_percent", { precision: 5, scale: 3 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  loanIdx: index("loan_terms_loan_idx").on(t.loanId),
  effectiveIdx: index("loan_terms_effective_idx").on(t.effectiveDate),
  activeIdx: index("loan_terms_active_idx").on(t.isActive).where(sql`is_active = true`)
}));

// Loan balances snapshot table (for performance)
export const loanBalances = pgTable("loan_balances", {
  loanId: integer("loan_id").primaryKey().references(() => loans.id),
  currentPrincipalMinor: bigint("current_principal_minor", { mode: 'bigint' }).notNull(),
  currentEscrowMinor: bigint("current_escrow_minor", { mode: 'bigint' }).notNull().default(0n),
  suspenseMinor: bigint("suspense_minor", { mode: 'bigint' }).notNull().default(0n),
  currentDueMinor: bigint("current_due_minor", { mode: 'bigint' }).notNull().default(0n),
  totalFeesMinor: bigint("total_fees_minor", { mode: 'bigint' }).notNull().default(0n),
  lastPaymentDate: date("last_payment_date"),
  lastPaymentAmountMinor: bigint("last_payment_amount_minor", { mode: 'bigint' }),
  nextDueDate: date("next_due_date"),
  daysDelinquent: integer("days_delinquent").notNull().default(0),
  delinquentAmountMinor: bigint("delinquent_amount_minor", { mode: 'bigint' }).notNull().default(0n),
  payoffGoodThroughDate: date("payoff_good_through_date"),
  payoffAmountMinor: bigint("payoff_amount_minor", { mode: 'bigint' }),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  nextDueIdx: index("loan_balances_next_due_idx").on(t.nextDueDate),
  delinquentIdx: index("loan_balances_delinquent_idx").on(t.daysDelinquent)
}));

// Escrow forecasts table
export const escrowForecasts = pgTable("escrow_forecasts", {
  forecastId: uuid("forecast_id").primaryKey().defaultRandom(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  monthDate: date("month_date").notNull(),
  beginningBalanceMinor: bigint("beginning_balance_minor", { mode: 'bigint' }).notNull(),
  escrowPaymentMinor: bigint("escrow_payment_minor", { mode: 'bigint' }).notNull(),
  taxDisbursementMinor: bigint("tax_disbursement_minor", { mode: 'bigint' }).notNull().default(0n),
  insuranceDisbursementMinor: bigint("insurance_disbursement_minor", { mode: 'bigint' }).notNull().default(0n),
  pmiDisbursementMinor: bigint("pmi_disbursement_minor", { mode: 'bigint' }).notNull().default(0n),
  otherDisbursementMinor: bigint("other_disbursement_minor", { mode: 'bigint' }).notNull().default(0n),
  endingBalanceMinor: bigint("ending_balance_minor", { mode: 'bigint' }).notNull(),
  minimumBalanceMinor: bigint("minimum_balance_minor", { mode: 'bigint' }).notNull(),
  surplusDeficitMinor: bigint("surplus_deficit_minor", { mode: 'bigint' }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  loanMonthIdx: unique().on(t.loanId, t.monthDate),
  monthIdx: index("escrow_forecasts_month_idx").on(t.monthDate)
}));

// Remittance cycle configuration
export const remittanceCycle = pgTable("remittance_cycle", {
  cycleId: uuid("cycle_id").primaryKey().defaultRandom(),
  investorId: text("investor_id").notNull(),
  cycleCode: text("cycle_code").notNull(), // MONTHLY, DAILY, etc.
  description: text("description"),
  cutoffDayOfMonth: integer("cutoff_day_of_month"), // For monthly cycles
  remitDayOfMonth: integer("remit_day_of_month"), // For monthly cycles
  cutoffTime: text("cutoff_time").notNull().default('17:00'), // HH:MM format
  timezone: text("timezone").notNull().default('America/New_York'),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  investorIdx: index("remittance_cycle_investor_idx").on(t.investorId),
  activeIdx: index("remittance_cycle_active_idx").on(t.isActive)
}));

// Migrate audit_log to use proper event sourcing pattern
export const auditLog = pgTable("audit_log", {
  eventId: varchar("event_id", { length: 36 }).primaryKey().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  objectKind: text("object_kind").notNull(),
  objectId: text("object_id").notNull(),
  payload: jsonb("payload"),
  prevHash: varchar("prev_hash", { length: 64 }),
  currHash: varchar("curr_hash", { length: 64 })
}, (t) => ({
  occurredAtIdx: index("audit_log_occurred_at_idx").on(t.occurredAt),
  objectIdx: index("audit_log_object_idx").on(t.objectKind, t.objectId)
}));

// ========================================
// CASH MANAGEMENT AND BANKING TABLES
// ========================================

// Bank Accounts - Financial institution accounts
export const bankAccounts = pgTable("bank_accounts", {
  bankAcctId: uuid("bank_acct_id").primaryKey().defaultRandom(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(), // Encrypted
  routingNumber: text("routing_number").notNull(),
  accountType: text("account_type").notNull(), // checking, savings, escrow, trust
  bankName: text("bank_name").notNull(),
  purpose: text("purpose").notNull(), // operating, escrow, payoff, investor
  currentBalanceMinor: bigint("current_balance_minor", { mode: 'bigint' }).notNull().default(0n),
  availableBalanceMinor: bigint("available_balance_minor", { mode: 'bigint' }).notNull().default(0n),
  lastReconciled: timestamp("last_reconciled", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  purposeIdx: index("bank_accounts_purpose_idx").on(t.purpose),
  activeIdx: index("bank_accounts_active_idx").on(t.isActive)
}));

// Bank Transactions - Imported from bank
export const bankTxn = pgTable("bank_txn", {
  bankTxnId: uuid("bank_txn_id").primaryKey().defaultRandom(),
  bankAcctId: uuid("bank_acct_id").references(() => bankAccounts.bankAcctId).notNull(),
  externalId: text("external_id").notNull(), // Bank's transaction ID
  txnDate: date("txn_date").notNull(),
  postDate: date("post_date").notNull(),
  amountMinor: bigint("amount_minor", { mode: 'bigint' }).notNull(),
  txnType: text("txn_type").notNull(), // debit, credit
  bankDescription: text("bank_description").notNull(),
  checkNumber: text("check_number"),
  referenceNumber: text("reference_number"),
  category: text("category"), // Internal categorization
  reconStatus: text("recon_status").notNull().default('pending'), // pending, matched, exception
  matchedEventId: uuid("matched_event_id").references(() => generalLedgerEvents.eventId),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  accountDateIdx: index("bank_txn_acct_date_idx").on(t.bankAcctId, t.txnDate),
  statusIdx: index("bank_txn_status_idx").on(t.reconStatus),
  externalIdx: unique().on(t.bankAcctId, t.externalId)
}));

// Bank Statement Files - Track imported statements
export const bankStatementFiles = pgTable("bank_statement_files", {
  stmtFileId: uuid("stmt_file_id").primaryKey().defaultRandom(),
  bankAcctId: uuid("bank_acct_id").references(() => bankAccounts.bankAcctId).notNull(),
  filename: text("filename").notNull(),
  format: text("format").notNull(), // bai2, mt940, csv, ofx
  fileHash: text("file_hash").notNull().unique(), // SHA256 for deduplication
  statementDate: date("statement_date").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  openingBalanceMinor: bigint("opening_balance_minor", { mode: 'bigint' }).notNull(),
  closingBalanceMinor: bigint("closing_balance_minor", { mode: 'bigint' }).notNull(),
  transactionCount: integer("transaction_count").notNull(),
  status: text("status").notNull().default('pending'), // pending, processing, completed, failed
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errors: jsonb("errors"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  hashIdx: unique().on(t.fileHash),
  bankAcctDateIdx: index("stmt_files_acct_date_idx").on(t.bankAcctId, t.statementDate)
}));

// ACH Batch - Groups of ACH transactions
export const achBatch = pgTable("ach_batch", {
  achBatchId: uuid("ach_batch_id").primaryKey().defaultRandom(),
  bankAcctId: uuid("bank_acct_id").references(() => bankAccounts.bankAcctId).notNull(),
  serviceClass: text("service_class").notNull(), // 200, 220, 225
  companyId: text("company_id").notNull(),
  companyName: text("company_name").notNull(),
  effectiveEntryDate: date("effective_entry_date").notNull(),
  totalEntries: integer("total_entries").notNull(),
  totalAmountMinor: bigint("total_amount_minor", { mode: 'bigint' }).notNull(),
  status: text("status").notNull().default('pending'), // pending, submitted, settled, failed
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  statusIdx: index("ach_batch_status_idx").on(t.status),
  effectiveDateIdx: index("ach_batch_date_idx").on(t.effectiveEntryDate)
}));

// ACH Entry - Individual ACH transactions
export const achEntry = pgTable("ach_entry", {
  achEntryId: uuid("ach_entry_id").primaryKey().defaultRandom(),
  achBatchId: uuid("ach_batch_id").references(() => achBatch.achBatchId).notNull(),
  loanId: integer("loan_id").references(() => loans.id),
  txnCode: text("txn_code").notNull(), // 22, 27, 32, 37
  rdfiRouting: text("rdfi_routing").notNull(),
  ddaAccountMask: text("dda_account_mask").notNull(), // Last 4 digits
  amountMinor: bigint("amount_minor", { mode: 'bigint' }).notNull(),
  traceNumber: text("trace_number").notNull().unique(),
  individualName: text("individual_name").notNull(),
  addenda: text("addenda"),
  status: text("status").notNull().default('pending'), // pending, sent, settled, returned
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  batchIdx: index("ach_entry_batch_idx").on(t.achBatchId),
  loanIdx: index("ach_entry_loan_idx").on(t.loanId),
  traceIdx: unique().on(t.traceNumber)
}));

// ACH Returns - Track returned ACH transactions
export const achReturns = pgTable("ach_returns", {
  achReturnId: uuid("ach_return_id").primaryKey().defaultRandom(),
  achEntryId: uuid("ach_entry_id").references(() => achEntry.achEntryId).notNull(),
  returnCode: text("return_code").notNull(), // R01, R02, etc.
  returnReason: text("return_reason").notNull(),
  returnDate: date("return_date").notNull(),
  amountMinor: bigint("amount_minor", { mode: 'bigint' }).notNull(),
  traceNumber: text("trace_number").notNull(),
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  entryIdx: index("ach_return_entry_idx").on(t.achEntryId),
  processedIdx: index("ach_return_processed_idx").on(t.processed)
}));

// Cash Match Candidates - For reconciliation
export const cashMatchCandidates = pgTable("cash_match_candidates", {
  candidateId: uuid("candidate_id").primaryKey().defaultRandom(),
  bankTxnId: uuid("bank_txn_id").references(() => bankTxn.bankTxnId).notNull(),
  eventId: uuid("event_id").notNull(), // Reference to ledger event
  score: integer("score").notNull(), // Confidence score 0-100
  matchReason: text("match_reason").notNull(),
  amountVarianceMinor: bigint("amount_variance_minor", { mode: 'bigint' }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  bankTxnIdx: index("match_candidate_txn_idx").on(t.bankTxnId),
  scoreIdx: index("match_candidate_score_idx").on(t.score)
}));

// Reconciliation Exceptions - Unmatched transactions
export const reconExceptions = pgTable("recon_exceptions", {
  exceptionId: uuid("exception_id").primaryKey().defaultRandom(),
  bankTxnId: uuid("bank_txn_id").references(() => bankTxn.bankTxnId),
  category: text("category").notNull(), // ach_return, nsf, wire_recall, duplicate, dispute
  subcategory: text("subcategory"),
  severity: text("severity").notNull(), // low, medium, high, critical
  state: text("state").notNull().default('open'), // open, pending, resolved, cancelled
  assignedTo: integer("assigned_to").references(() => users.id),
  aiRecommendation: jsonb("ai_recommendation"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  stateIdx: index("recon_exception_state_idx").on(t.state),
  severityIdx: index("recon_exception_severity_idx").on(t.severity)
}));

// ========================================
// BORROWER PORTAL TABLES - Phase 1
// ========================================

// Borrower portal users - maps authenticated users to borrower entities
export const borrowerUsers = pgTable("borrower_users", {
  id: serial("id").primaryKey(),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id).notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
  status: text("status").default('active').notNull(), // active, disabled
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  emailIdx: index("borrower_users_email_idx").on(t.email),
  entityIdx: index("borrower_users_entity_idx").on(t.borrowerEntityId),
  uniqueEntityEmail: unique().on(t.borrowerEntityId, t.email)
}));

// Links loans to borrower entities with roles
export const loanBorrowerLinks = pgTable("loan_borrower_links", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  borrowerEntityId: integer("borrower_entity_id").references(() => borrowerEntities.id).notNull(),
  borrowerUserId: integer("borrower_user_id").references(() => borrowerUsers.id),
  role: text("role").notNull(), // primary, co, authorized
  permissions: jsonb("permissions"), // view_only, make_payments, full_access
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  loanIdx: index("loan_borrower_loan_idx").on(t.loanId),
  entityIdx: index("loan_borrower_entity_idx").on(t.borrowerEntityId),
  uniqueLoanBorrowerRole: unique().on(t.loanId, t.borrowerEntityId, t.role)
}));

// Payment methods for borrower portal
export const borrowerPaymentMethods = pgTable("borrower_payment_methods", {
  id: serial("id").primaryKey(),
  borrowerUserId: integer("borrower_user_id").references(() => borrowerUsers.id).notNull(),
  type: text("type").notNull(), // ach, card (ach only for Phase 1)
  nickname: text("nickname"),
  accountNumberMask: text("account_number_mask").notNull(), // Last 4 digits
  routingNumber: text("routing_number"), // For ACH
  accountType: text("account_type"), // checking, savings
  tokenReference: text("token_reference").notNull(), // Secure token from payment processor
  isDefault: boolean("is_default").default(false).notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  userIdx: index("payment_methods_user_idx").on(t.borrowerUserId),
  typeIdx: index("payment_methods_type_idx").on(t.type),
  defaultIdx: index("payment_methods_default_idx").on(t.isDefault)
}));

// ========================================
// PHASE 9 COMPLIANCE TABLES
// ========================================

// Compliance audit log (append-only with hash chain)
export const complianceAuditLog = pgTable("compliance_audit_log", {
  id: bigserial("id").primaryKey(),
  correlationId: uuid("correlation_id").notNull(),
  accountId: uuid("account_id"),
  actorType: text("actor_type").notNull().check(sql`actor_type IN ('user','system','integration')`),
  actorId: text("actor_id"),
  eventType: text("event_type").notNull(),  // 'CRUD.CREATE','FIN.POST','NOTICE.SENT', etc.
  eventTsUtc: timestamp("event_ts_utc", { withTimezone: true }).notNull().defaultNow(),
  resourceType: text("resource_type").notNull(),  // 'loan','payment','notice','consent', ...
  resourceId: text("resource_id"),
  payloadJson: jsonb("payload_json").notNull(), // PII minimized
  payloadHash: text("payload_hash"),
  prevHash: text("prev_hash"),
  recordHash: text("record_hash"),
  ipAddr: text("ip_addr"),
  userAgent: text("user_agent"),
  geo: jsonb("geo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  correlationIdx: index("compliance_audit_correlation_idx").on(t.correlationId, t.eventTsUtc),
  accountIdx: index("compliance_audit_account_idx").on(t.accountId, t.eventTsUtc),
  eventIdx: index("compliance_audit_event_idx").on(t.eventType, t.eventTsUtc),
  resourceIdx: index("compliance_audit_resource_idx").on(t.resourceType, t.resourceId)
}));

// Consent records
export const consentRecord = pgTable("consent_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull(),
  purpose: text("purpose").notNull(),       // 'emarketing','esign','privacy', etc.
  scope: text("scope").notNull(),       // 'loan:read','email:marketing', ...
  status: text("status").notNull().check(sql`status IN ('granted','revoked')`),
  channel: text("channel").notNull().check(sql`channel IN ('web','email','sms','paper','ivr')`),
  version: text("version").notNull(),       // doc/policy version or hash
  evidenceUri: text("evidence_uri"),                // WORM link
  locale: text("locale").default('en-US'),
  tsGrantedUtc: timestamp("ts_granted_utc", { withTimezone: true }),
  tsRevokedUtc: timestamp("ts_revoked_utc", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  subjectIdx: index("consent_subject_idx").on(t.subjectId, t.purpose)
}));

// Communication preferences (granular)
export const communicationPreference = pgTable("communication_preference", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull(),
  channel: text("channel").notNull().check(sql`channel IN ('email','sms','phone','push','mail')`),
  topic: text("topic").notNull(),       // 'billing','collections','marketing','privacy'
  allowed: boolean("allowed").notNull().default(true),
  frequency: text("frequency").check(sql`frequency IN ('immediate','daily','weekly','monthly')`),
  lastUpdatedBy: text("last_updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  uniquePref: unique().on(t.subjectId, t.channel, t.topic)
}));

// Retention policies (config as data)
export const retentionPolicy = pgTable("retention_policy", {
  id: uuid("id").primaryKey().defaultRandom(),
  dataClass: text("data_class").notNull(),   // 'PII.ID','FIN.TXN','DOC.APPRAISAL', ...
  jurisdiction: text("jurisdiction").notNull(),   // 'US','EU','CA', ...
  minRetentionDays: integer("min_retention_days").notNull(),
  maxRetentionDays: integer("max_retention_days"),
  legalHoldAllowed: boolean("legal_hold_allowed").notNull().default(true),
  policyVersion: text("policy_version").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  uniqueRetPol: unique().on(t.dataClass, t.jurisdiction, t.policyVersion)
}));

// Legal hold
export const legalHold = pgTable("legal_hold", {
  id: uuid("id").primaryKey().defaultRandom(),
  scopeType: text("scope_type").notNull().check(sql`scope_type IN ('artifact','account','subject')`),
  scopeId: text("scope_id").notNull(),
  reason: text("reason").notNull(),
  imposedBy: text("imposed_by").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true })
}, (t) => ({
  scopeIdx: index("legal_hold_scope_idx").on(t.scopeType, t.scopeId).where(sql`active = true`)
}));

// Process timers (parameterized notice windows)
export const processTimer = pgTable("process_timer", {
  id: uuid("id").primaryKey().defaultRandom(),
  timerCode: text("timer_code").notNull(),   // 'NOTICE.ADVERSE.ACTION','NOTICE.PRIVACY.ANNUAL', ...
  jurisdiction: text("jurisdiction").notNull(),
  windowHoursMin: integer("window_hours_min").notNull(),
  windowHoursMax: integer("window_hours_max").notNull(),
  graceHours: integer("grace_hours").default(0),
  version: text("version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  uniqueTimer: unique().on(t.timerCode, t.jurisdiction, t.version)
}));

// Deletion receipts (immutable)
export const deletionReceipt = pgTable("deletion_receipt", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id"),
  dataClass: text("data_class").notNull(),
  payloadSummary: jsonb("payload_summary").notNull(),
  deletedAtUtc: timestamp("deleted_at_utc", { withTimezone: true }).notNull().defaultNow(),
  evidenceUri: text("evidence_uri"),
  responsibleActor: text("responsible_actor").notNull(),
  recordHash: text("record_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// Notice delivery log
export const noticeDeliveryLog = pgTable("notice_delivery_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id"),
  subjectId: uuid("subject_id"),
  noticeCode: text("notice_code").notNull(),     // 'PRIVACY.ANNUAL','ESCROW.ANALYSIS', ...
  deliveryChannel: text("delivery_channel").notNull(),     // 'email','mail','portal'
  deliveryStatus: text("delivery_status").notNull().check(sql`delivery_status IN ('queued','sent','failed','opened','returned')`),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  accountIdx: index("notice_account_idx").on(t.accountId, t.noticeCode, t.scheduledFor)
}));

// Account balance ledger for balance replay
export const accountBalanceLedger = pgTable("account_balance_ledger", {
  id: bigserial("id").primaryKey(),
  accountId: uuid("account_id").notNull(),
  postingTsUtc: timestamp("posting_ts_utc", { withTimezone: true }).notNull(),
  amountCents: bigint("amount_cents", { mode: 'bigint' }).notNull(),
  currency: text("currency").notNull().default('USD'),
  txnType: text("txn_type").notNull().check(sql`txn_type IN ('debit','credit')`),
  description: text("description"),
  externalRef: text("external_ref"),
  correlationId: uuid("correlation_id").notNull()
}, (t) => ({
  acctIdx: index("acct_ledger_idx").on(t.accountId, t.postingTsUtc)
}));

// Artifact registry (WORM links)
export const artifact = pgTable("artifact", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id"),
  subjectId: uuid("subject_id"),
  artifactCode: text("artifact_code").notNull(), // 'DISCLOSURE.TILA','APPRAISAL','PRIVACY.NOTICE'
  uri: text("uri").notNull(), // object store URL / DMS ID
  sha256: text("sha256").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// DSAR requests
export const dataSubjectRequest = pgTable("data_subject_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull(),
  type: text("type").notNull().check(sql`type IN ('access','deletion','correction')`),
  status: text("status").notNull().check(sql`status IN ('received','in_progress','completed','rejected')`),
  submittedVia: text("submitted_via").notNull().check(sql`submitted_via IN ('portal','email','mail')`),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  detailsJson: jsonb("details_json"),
  caseRef: text("case_ref")
}, (t) => ({
  subjectIdx: index("dsar_subject_idx").on(t.subjectId, t.status)
}));

// Export all schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertLenderSchema = createInsertSchema(lenders).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertLender = z.infer<typeof insertLenderSchema>;
export type Lender = typeof lenders.$inferSelect;

export const insertServicerSchema = createInsertSchema(servicers).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertServicer = z.infer<typeof insertServicerSchema>;
export type Servicer = typeof servicers.$inferSelect;

export const insertBorrowerEntitySchema = createInsertSchema(borrowerEntities).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertBorrowerEntity = z.infer<typeof insertBorrowerEntitySchema>;
export type BorrowerEntity = typeof borrowerEntities.$inferSelect;

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;

export const insertLoanSchema = createInsertSchema(loans).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Loan = typeof loans.$inferSelect;

export const insertLoanBorrowerSchema = createInsertSchema(loanBorrowers).omit({
  id: true,
  createdAt: true
});
export type InsertLoanBorrower = z.infer<typeof insertLoanBorrowerSchema>;
export type LoanBorrower = typeof loanBorrowers.$inferSelect;

export const insertInvestorSchema = createInsertSchema(investors).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertInvestor = z.infer<typeof insertInvestorSchema>;
export type Investor = typeof investors.$inferSelect;

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export const insertEscrowAccountSchema = createInsertSchema(escrowAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertEscrowAccount = z.infer<typeof insertEscrowAccountSchema>;
export type EscrowAccount = typeof escrowAccounts.$inferSelect;

export const insertEscrowTransactionSchema = createInsertSchema(escrowTransactions).omit({
  id: true,
  createdAt: true
});
export type InsertEscrowTransaction = z.infer<typeof insertEscrowTransactionSchema>;
export type EscrowTransaction = typeof escrowTransactions.$inferSelect;

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  uploadedAt: true
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export const insertPaymentScheduleSchema = createInsertSchema(paymentSchedule).omit({
  id: true,
  createdAt: true
});
export type InsertPaymentSchedule = z.infer<typeof insertPaymentScheduleSchema>;
export type PaymentSchedule = typeof paymentSchedule.$inferSelect;

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export const insertEscrowDisbursementSchema = createInsertSchema(escrowDisbursements).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertEscrowDisbursement = z.infer<typeof insertEscrowDisbursementSchema>;
export type EscrowDisbursement = typeof escrowDisbursements.$inferSelect;

export const insertCollectionActivitySchema = createInsertSchema(collectionActivities).omit({
  id: true,
  createdAt: true
});
export type InsertCollectionActivity = z.infer<typeof insertCollectionActivitySchema>;
export type CollectionActivity = typeof collectionActivities.$inferSelect;

export const insertLoanSnapshotSchema = createInsertSchema(loanSnapshots).omit({
  id: true,
  createdAt: true
});
export type InsertLoanSnapshot = z.infer<typeof insertLoanSnapshotSchema>;
export type LoanSnapshot = typeof loanSnapshots.$inferSelect;

export const insertCrmContactSchema = createInsertSchema(crmContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertCrmContact = z.infer<typeof insertCrmContactSchema>;
export type CrmContact = typeof crmContacts.$inferSelect;

export const insertCrmActivitySchema = createInsertSchema(crmActivities).omit({
  id: true,
  createdAt: true
});
export type InsertCrmActivity = z.infer<typeof insertCrmActivitySchema>;
export type CrmActivity = typeof crmActivities.$inferSelect;

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true
});
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
  id: true,
  createdAt: true
});
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

export const insertUserPermissionOverrideSchema = createInsertSchema(userPermissionOverrides).omit({
  id: true,
  createdAt: true
});
export type InsertUserPermissionOverride = z.infer<typeof insertUserPermissionOverrideSchema>;
export type UserPermissionOverride = typeof userPermissionOverrides.$inferSelect;

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true
});
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export const insertPaymentAllocationSchema = createInsertSchema(paymentAllocations).omit({
  id: true,
  createdAt: true
});
export type InsertPaymentAllocation = z.infer<typeof insertPaymentAllocationSchema>;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;

export const insertInvestorPositionSchema = createInsertSchema(investorPositions).omit({
  id: true,
  createdAt: true
});
export type InsertInvestorPosition = z.infer<typeof insertInvestorPositionSchema>;
export type InvestorPosition = typeof investorPositions.$inferSelect;

export const insertEscrowDisbursementPaymentSchema = createInsertSchema(escrowDisbursementPayments).omit({
  id: true,
  createdAt: true
});
export type InsertEscrowDisbursementPayment = z.infer<typeof insertEscrowDisbursementPaymentSchema>;
export type EscrowDisbursementPayment = typeof escrowDisbursementPayments.$inferSelect;

export const insertEscrowAnalysisSchema = createInsertSchema(escrowAnalysis).omit({
  id: true,
  createdAt: true
});
export type InsertEscrowAnalysis = z.infer<typeof insertEscrowAnalysisSchema>;
export type EscrowAnalysis = typeof escrowAnalysis.$inferSelect;

export const insertEmailTemplateFolderSchema = createInsertSchema(emailTemplateFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertEmailTemplateFolder = z.infer<typeof insertEmailTemplateFolderSchema>;
export type EmailTemplateFolder = typeof emailTemplateFolders.$inferSelect;

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

export const insertSmsTemplateSchema = createInsertSchema(smsTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertSmsTemplate = z.infer<typeof insertSmsTemplateSchema>;
export type SmsTemplate = typeof smsTemplates.$inferSelect;

export const insertDocumentFolderSchema = createInsertSchema(documentFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertDocumentFolder = z.infer<typeof insertDocumentFolderSchema>;
export type DocumentFolder = typeof documentFolders.$inferSelect;

export const insertDocumentV2Schema = createInsertSchema(documentsV2).omit({
  id: true,
  createdAt: true,
  uploadedAt: true
});
export type InsertDocumentV2 = z.infer<typeof insertDocumentV2Schema>;
export type DocumentV2 = typeof documentsV2.$inferSelect;

export const insertDocumentAccessLogSchema = createInsertSchema(documentAccessLogs).omit({
  id: true,
  createdAt: true
});
export type InsertDocumentAccessLog = z.infer<typeof insertDocumentAccessLogSchema>;
export type DocumentAccessLog = typeof documentAccessLogs.$inferSelect;

export const insertPolicyRuleSchema = createInsertSchema(policyRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertPolicyRule = z.infer<typeof insertPolicyRuleSchema>;
export type PolicyRule = typeof policyRules.$inferSelect;

// New double-entry and cash management types
export const insertGeneralLedgerEventSchema = createInsertSchema(generalLedgerEvents).omit({
  eventId: true,
  eventTimestamp: true,
  createdAt: true
});
export type InsertGeneralLedgerEvent = z.infer<typeof insertGeneralLedgerEventSchema>;
export type GeneralLedgerEvent = typeof generalLedgerEvents.$inferSelect;

export const insertGeneralLedgerEntrySchema = createInsertSchema(generalLedgerEntries).omit({
  entryId: true,
  createdAt: true
});
export type InsertGeneralLedgerEntry = z.infer<typeof insertGeneralLedgerEntrySchema>;
export type GeneralLedgerEntry = typeof generalLedgerEntries.$inferSelect;

export const insertLoanTermsSchema = createInsertSchema(loanTerms).omit({
  termId: true,
  createdAt: true
});
export type InsertLoanTerms = z.infer<typeof insertLoanTermsSchema>;
export type LoanTerms = typeof loanTerms.$inferSelect;

export const insertLoanBalancesSchema = createInsertSchema(loanBalances).omit({
  lastUpdated: true
});
export type InsertLoanBalances = z.infer<typeof insertLoanBalancesSchema>;
export type LoanBalances = typeof loanBalances.$inferSelect;

export const insertEscrowForecastSchema = createInsertSchema(escrowForecasts).omit({
  forecastId: true,
  createdAt: true
});
export type InsertEscrowForecast = z.infer<typeof insertEscrowForecastSchema>;
export type EscrowForecast = typeof escrowForecasts.$inferSelect;

export const insertRemittanceCycleSchema = createInsertSchema(remittanceCycle).omit({
  cycleId: true,
  createdAt: true
});
export type InsertRemittanceCycle = z.infer<typeof insertRemittanceCycleSchema>;
export type RemittanceCycle = typeof remittanceCycle.$inferSelect;

export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({
  bankAcctId: true,
  createdAt: true
});
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccounts.$inferSelect;

export const insertBankTxnSchema = createInsertSchema(bankTxn).omit({
  bankTxnId: true,
  createdAt: true
});
export type InsertBankTxn = z.infer<typeof insertBankTxnSchema>;
export type BankTxn = typeof bankTxn.$inferSelect;

export const insertBankStatementFileSchema = createInsertSchema(bankStatementFiles).omit({
  stmtFileId: true,
  createdAt: true
});
export type InsertBankStatementFile = z.infer<typeof insertBankStatementFileSchema>;
export type BankStatementFile = typeof bankStatementFiles.$inferSelect;

export const insertAchBatchSchema = createInsertSchema(achBatch).omit({
  achBatchId: true,
  createdAt: true
});
export type InsertAchBatch = z.infer<typeof insertAchBatchSchema>;
export type AchBatch = typeof achBatch.$inferSelect;

export const insertAchEntrySchema = createInsertSchema(achEntry).omit({
  achEntryId: true,
  createdAt: true
});
export type InsertAchEntry = z.infer<typeof insertAchEntrySchema>;
export type AchEntry = typeof achEntry.$inferSelect;

export const insertAchReturnSchema = createInsertSchema(achReturns).omit({
  achReturnId: true,
  createdAt: true
});
export type InsertAchReturn = z.infer<typeof insertAchReturnSchema>;
export type AchReturn = typeof achReturns.$inferSelect;

export const insertCashMatchCandidateSchema = createInsertSchema(cashMatchCandidates).omit({
  candidateId: true,
  createdAt: true
});
export type InsertCashMatchCandidate = z.infer<typeof insertCashMatchCandidateSchema>;
export type CashMatchCandidate = typeof cashMatchCandidates.$inferSelect;

export const insertReconExceptionSchema = createInsertSchema(reconExceptions).omit({
  exceptionId: true,
  createdAt: true
});
export type InsertReconException = z.infer<typeof insertReconExceptionSchema>;
export type ReconException = typeof reconExceptions.$inferSelect;

// Phase 9 Compliance Types
export const insertComplianceAuditLogSchema = createInsertSchema(complianceAuditLog).omit({
  id: true,
  eventTsUtc: true,
  createdAt: true
});
export type InsertComplianceAuditLog = z.infer<typeof insertComplianceAuditLogSchema>;
export type ComplianceAuditLog = typeof complianceAuditLog.$inferSelect;

export const insertConsentRecordSchema = createInsertSchema(consentRecord).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertConsentRecord = z.infer<typeof insertConsentRecordSchema>;
export type ConsentRecord = typeof consentRecord.$inferSelect;

export const insertCommunicationPreferenceSchema = createInsertSchema(communicationPreference).omit({
  id: true,
  updatedAt: true
});
export type InsertCommunicationPreference = z.infer<typeof insertCommunicationPreferenceSchema>;
export type CommunicationPreference = typeof communicationPreference.$inferSelect;

export const insertRetentionPolicySchema = createInsertSchema(retentionPolicy).omit({
  id: true,
  createdAt: true
});
export type InsertRetentionPolicy = z.infer<typeof insertRetentionPolicySchema>;
export type RetentionPolicy = typeof retentionPolicy.$inferSelect;

export const insertLegalHoldSchema = createInsertSchema(legalHold).omit({
  id: true,
  createdAt: true
});
export type InsertLegalHold = z.infer<typeof insertLegalHoldSchema>;
export type LegalHold = typeof legalHold.$inferSelect;

export const insertProcessTimerSchema = createInsertSchema(processTimer).omit({
  id: true,
  createdAt: true
});
export type InsertProcessTimer = z.infer<typeof insertProcessTimerSchema>;
export type ProcessTimer = typeof processTimer.$inferSelect;

export const insertDeletionReceiptSchema = createInsertSchema(deletionReceipt).omit({
  id: true,
  deletedAtUtc: true,
  createdAt: true
});
export type InsertDeletionReceipt = z.infer<typeof insertDeletionReceiptSchema>;
export type DeletionReceipt = typeof deletionReceipt.$inferSelect;

export const insertNoticeDeliveryLogSchema = createInsertSchema(noticeDeliveryLog).omit({
  id: true,
  createdAt: true
});
export type InsertNoticeDeliveryLog = z.infer<typeof insertNoticeDeliveryLogSchema>;
export type NoticeDeliveryLog = typeof noticeDeliveryLog.$inferSelect;

export const insertAccountBalanceLedgerSchema = createInsertSchema(accountBalanceLedger).omit({
  id: true
});
export type InsertAccountBalanceLedger = z.infer<typeof insertAccountBalanceLedgerSchema>;
export type AccountBalanceLedger = typeof accountBalanceLedger.$inferSelect;

export const insertArtifactSchema = createInsertSchema(artifact).omit({
  id: true,
  createdAt: true
});
export type InsertArtifact = z.infer<typeof insertArtifactSchema>;
export type Artifact = typeof artifact.$inferSelect;

export const insertDataSubjectRequestSchema = createInsertSchema(dataSubjectRequest).omit({
  id: true,
  openedAt: true
});
export type InsertDataSubjectRequest = z.infer<typeof insertDataSubjectRequestSchema>;
export type DataSubjectRequest = typeof dataSubjectRequest.$inferSelect;
