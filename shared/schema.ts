import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { pgTable, text, timestamp, integer, serial, boolean, jsonb, decimal, uuid, varchar, date, index, pgEnum, uniqueIndex, time } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
// CORE TABLES
// ========================================

// Users table - System users with role-based access
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  email: text("email").unique().notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  middleName: text("middle_name"),
  role: userRoleEnum("role").notNull(),
  phone: text("phone"),
  mobilePhone: text("mobile_phone"),
  fax: text("fax"),
  address: text("address"),
  address2: text("address_2"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country").default('USA'),
  dateOfBirth: date("date_of_birth"),
  ssn: text("ssn"), // Encrypted
  employerName: text("employer_name"),
  employerPhone: text("employer_phone"),
  jobTitle: text("job_title"),
  yearsEmployed: integer("years_employed"),
  monthlyIncome: decimal("monthly_income", { precision: 12, scale: 2 }),
  isActive: boolean("is_active").default(true).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  profileImage: text("profile_image"),
  preferences: jsonb("preferences"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
}, (table) => {
  return {
    emailIdx: index("user_email_idx").on(table.email),
    roleIdx: index("user_role_idx").on(table.role),
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
  applicationDate: date("application_date"),
  approvalDate: date("approval_date"),
  fundingDate: date("funding_date"),
  firstPaymentDate: date("first_payment_date"),
  maturityDate: date("maturity_date").notNull(),
  nextPaymentDate: date("next_payment_date"),
  lastPaymentDate: date("last_payment_date"),
  // Payment information
  paymentFrequency: frequencyEnum("payment_frequency").default('monthly').notNull(),
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }).notNull(),
  principalAndInterest: decimal("principal_and_interest", { precision: 10, scale: 2 }),
  monthlyEscrow: decimal("monthly_escrow", { precision: 10, scale: 2 }),
  monthlyMI: decimal("monthly_mi", { precision: 10, scale: 2 }),
  // LTV and Insurance
  originalLTV: decimal("original_ltv", { precision: 5, scale: 2 }),
  currentLTV: decimal("current_ltv", { precision: 5, scale: 2 }),
  combinedLTV: decimal("combined_ltv", { precision: 5, scale: 2 }),
  miRequired: boolean("mi_required").default(false),
  miProvider: text("mi_provider"),
  miCertificateNumber: text("mi_certificate_number"),
  // Escrow
  escrowRequired: boolean("escrow_required").default(false),
  escrowWaived: boolean("escrow_waived").default(false),
  // Status
  status: loanStatusEnum("status").notNull(),
  statusDate: timestamp("status_date").defaultNow().notNull(),
  statusReason: text("status_reason"),
  delinquentDays: integer("delinquent_days").default(0),
  timesDelinquent30: integer("times_delinquent_30").default(0),
  timesDelinquent60: integer("times_delinquent_60").default(0),
  timesDelinquent90: integer("times_delinquent_90").default(0),
  foreclosureDate: date("foreclosure_date"),
  saleDate: date("sale_date"),
  // Servicing
  servicingFeeRate: decimal("servicing_fee_rate", { precision: 5, scale: 4 }),
  servicingFeeAmount: decimal("servicing_fee_amount", { precision: 10, scale: 2 }),
  investorLoanNumber: text("investor_loan_number"),
  poolNumber: text("pool_number"),
  // Compliance
  hmda: boolean("hmda").default(false),
  hoepa: boolean("hoepa").default(false),
  qm: boolean("qm").default(false), // Qualified Mortgage
  // Borrower Information (basic contact info stored in loan for quick access)
  borrowerName: text("borrower_name"),
  borrowerEmail: text("borrower_email"),
  borrowerPhone: text("borrower_phone"),
  // Borrower mailing address (separate from property address)
  borrowerAddress: text("borrower_address"),
  borrowerCity: text("borrower_city"),
  borrowerState: text("borrower_state"),
  borrowerZip: text("borrower_zip"),
  // Enhanced AI-extracted fields
  borrowerSSN: text("borrower_ssn"),
  borrowerIncome: decimal("borrower_income", { precision: 15, scale: 2 }),
  // Trustee information
  trusteeName: text("trustee_name"),
  trusteePhone: text("trustee_phone"),
  trusteeEmail: text("trustee_email"),
  trusteeStreetAddress: text("trustee_street_address"),
  trusteeCity: text("trustee_city"),
  trusteeState: text("trustee_state"),
  trusteeZipCode: text("trustee_zip_code"),
  // Beneficiary information
  beneficiaryName: text("beneficiary_name"),
  beneficiaryPhone: text("beneficiary_phone"),
  beneficiaryEmail: text("beneficiary_email"),
  beneficiaryStreetAddress: text("beneficiary_street_address"),
  beneficiaryCity: text("beneficiary_city"),
  beneficiaryState: text("beneficiary_state"),
  beneficiaryZipCode: text("beneficiary_zip_code"),
  // Escrow company information
  escrowCompanyName: text("escrow_company_name"),
  escrowCompanyPhone: text("escrow_company_phone"),
  escrowCompanyEmail: text("escrow_company_email"),
  escrowCompanyStreetAddress: text("escrow_company_street_address"),
  escrowCompanyCity: text("escrow_company_city"),
  escrowCompanyState: text("escrow_company_state"),
  escrowCompanyZipCode: text("escrow_company_zip_code"),
  loanDocuments: jsonb("loan_documents"),
  defaultConditions: jsonb("default_conditions"),
  insuranceRequirements: jsonb("insurance_requirements"),
  crossDefaultParties: jsonb("cross_default_parties"),
  closingCosts: decimal("closing_costs", { precision: 15, scale: 2 }),
  downPayment: decimal("down_payment", { precision: 15, scale: 2 }),
  // Additional fields
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanNumberIdx: uniqueIndex("loan_number_idx").on(table.loanNumber),
    statusIdx: index("loan_status_idx").on(table.status),
    propertyIdx: index("loan_property_idx").on(table.propertyId),
    maturityIdx: index("loan_maturity_idx").on(table.maturityDate),
    nextPaymentIdx: index("loan_next_payment_idx").on(table.nextPaymentDate),
  };
});

// Loan Borrowers - Many-to-many relationship
export const loanBorrowers = pgTable("loan_borrowers", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  borrowerId: integer("borrower_id").references(() => borrowerEntities.id).notNull(),
  borrowerType: text("borrower_type").notNull(), // 'primary', 'co_borrower', 'guarantor'
  ownershipPercentage: decimal("ownership_percentage", { precision: 5, scale: 2 }),
  signingAuthority: boolean("signing_authority").default(true),
  liabilityPercentage: decimal("liability_percentage", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanBorrowerIdx: uniqueIndex("loan_borrower_idx").on(table.loanId, table.borrowerId),
    loanIdx: index("loan_borrowers_loan_idx").on(table.loanId),
    borrowerIdx: index("loan_borrowers_borrower_idx").on(table.borrowerId),
  };
});

// Guarantors - Additional security for loans
export const guarantors = pgTable("guarantors", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  guarantorEntityId: integer("guarantor_entity_id").references(() => borrowerEntities.id).notNull(),
  guaranteeAmount: decimal("guarantee_amount", { precision: 15, scale: 2 }),
  guaranteePercentage: decimal("guarantee_percentage", { precision: 5, scale: 2 }),
  guaranteeType: text("guarantee_type"), // 'full', 'limited', 'payment', 'collection'
  startDate: date("start_date"),
  endDate: date("end_date"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("guarantor_loan_idx").on(table.loanId),
    entityIdx: index("guarantor_entity_idx").on(table.guarantorEntityId),
  };
});

// ========================================
// PAYMENT TABLES
// ========================================

// Payment Schedule - Pre-calculated payment schedule
export const paymentSchedule = pgTable("payment_schedule", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  paymentNumber: integer("payment_number").notNull(),
  dueDate: date("due_date").notNull(),
  principalAmount: decimal("principal_amount", { precision: 10, scale: 2 }).notNull(),
  interestAmount: decimal("interest_amount", { precision: 10, scale: 2 }).notNull(),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }),
  miAmount: decimal("mi_amount", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  principalBalance: decimal("principal_balance", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanPaymentIdx: uniqueIndex("schedule_loan_payment_idx").on(table.loanId, table.paymentNumber),
    dueDateIdx: index("schedule_due_date_idx").on(table.dueDate),
  };
});

// Payments - Actual payment records
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  scheduleId: integer("schedule_id").references(() => paymentSchedule.id),
  paymentNumber: integer("payment_number"),
  // Dates
  dueDate: date("due_date"),
  receivedDate: timestamp("received_date"),
  effectiveDate: date("effective_date").notNull(),
  // Amounts
  scheduledAmount: decimal("scheduled_amount", { precision: 10, scale: 2 }),
  totalReceived: decimal("total_received", { precision: 10, scale: 2 }).notNull(),
  principalAmount: decimal("principal_amount", { precision: 10, scale: 2 }),
  interestAmount: decimal("interest_amount", { precision: 10, scale: 2 }),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }),
  miAmount: decimal("mi_amount", { precision: 10, scale: 2 }),
  lateFeeAmount: decimal("late_fee_amount", { precision: 8, scale: 2 }),
  otherFeeAmount: decimal("other_fee_amount", { precision: 8, scale: 2 }),
  // Payment details
  paymentMethod: text("payment_method"), // 'check', 'ach', 'wire', 'cash', 'credit_card'
  checkNumber: text("check_number"),
  transactionId: text("transaction_id"),
  confirmationNumber: text("confirmation_number"),
  // Status
  status: paymentStatusEnum("status").notNull(),
  nsfCount: integer("nsf_count").default(0),
  reversalReason: text("reversal_reason"),
  // Processing
  processedBy: integer("processed_by").references(() => users.id),
  processedDate: timestamp("processed_date"),
  batchId: text("batch_id"),
  // Additional
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("payment_loan_idx").on(table.loanId),
    dueDateIdx: index("payment_due_date_idx").on(table.dueDate),
    effectiveDateIdx: index("payment_effective_date_idx").on(table.effectiveDate),
    statusIdx: index("payment_status_idx").on(table.status),
    batchIdx: index("payment_batch_idx").on(table.batchId),
  };
});

// ========================================
// ESCROW TABLES
// ========================================

// Escrow Accounts
export const escrowAccounts = pgTable("escrow_accounts", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).unique().notNull(),
  accountNumber: text("account_number").unique().notNull(),
  // Balances
  currentBalance: decimal("current_balance", { precision: 12, scale: 2 }).default('0').notNull(),
  availableBalance: decimal("available_balance", { precision: 12, scale: 2 }).default('0'),
  pendingDeposits: decimal("pending_deposits", { precision: 12, scale: 2 }).default('0'),
  pendingDisbursements: decimal("pending_disbursements", { precision: 12, scale: 2 }).default('0'),
  // Requirements
  monthlyPayment: decimal("monthly_payment", { precision: 10, scale: 2 }).default('0'),
  minimumBalance: decimal("minimum_balance", { precision: 10, scale: 2 }).default('0'),
  cushionAmount: decimal("cushion_amount", { precision: 10, scale: 2 }).default('0'),
  targetBalance: decimal("target_balance", { precision: 12, scale: 2 }).default('0'),
  // Analysis
  projectedLowestBalance: decimal("projected_lowest_balance", { precision: 12, scale: 2 }),
  projectedLowestMonth: text("projected_lowest_month"),
  shortageAmount: decimal("shortage_amount", { precision: 10, scale: 2 }).default('0'),
  surplusAmount: decimal("surplus_amount", { precision: 10, scale: 2 }).default('0'),
  shortageSpreadMonths: integer("shortage_spread_months"),
  // Analysis dates
  lastAnalysisDate: date("last_analysis_date"),
  nextAnalysisDate: date("next_analysis_date"),
  analysisEffectiveDate: date("analysis_effective_date"),
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  waived: boolean("waived").default(false),
  waivedDate: date("waived_date"),
  waivedBy: integer("waived_by").references(() => users.id),
  waivedReason: text("waived_reason"),
  // Additional
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    accountNumberIdx: uniqueIndex("escrow_account_number_idx").on(table.accountNumber),
    loanIdx: uniqueIndex("escrow_loan_idx").on(table.loanId),
    activeIdx: index("escrow_active_idx").on(table.isActive),
  };
});

// Escrow Items - Types of escrow disbursements
export const escrowItems = pgTable("escrow_items", {
  id: serial("id").primaryKey(),
  escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
  itemType: text("item_type").notNull(), // 'property_tax', 'insurance', 'hoa', 'pmi', 'other'
  payeeId: integer("payee_id").references(() => payees.id).notNull(),
  description: text("description").notNull(),
  // Payment details
  frequency: frequencyEnum("frequency").notNull(),
  annualAmount: decimal("annual_amount", { precision: 10, scale: 2 }).notNull(),
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }).notNull(),
  // Due dates
  firstDueDate: date("first_due_date"),
  nextDueDate: date("next_due_date"),
  lastPaidDate: date("last_paid_date"),
  // Reference numbers
  accountNumber: text("account_number"),
  policyNumber: text("policy_number"),
  referenceNumber: text("reference_number"),
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  autoPayEnabled: boolean("auto_pay_enabled").default(true),
  // Additional
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    accountIdx: index("escrow_item_account_idx").on(table.escrowAccountId),
    typeIdx: index("escrow_item_type_idx").on(table.itemType),
    nextDueIdx: index("escrow_item_next_due_idx").on(table.nextDueDate),
  };
});

// Escrow Transactions
export const escrowTransactions = pgTable("escrow_transactions", {
  id: serial("id").primaryKey(),
  escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
  escrowItemId: integer("escrow_item_id").references(() => escrowItems.id),
  // Transaction details
  transactionDate: timestamp("transaction_date").notNull(),
  effectiveDate: date("effective_date").notNull(),
  transactionType: transactionTypeEnum("transaction_type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  runningBalance: decimal("running_balance", { precision: 12, scale: 2 }).notNull(),
  // Payment details
  payeeId: integer("payee_id").references(() => payees.id),
  checkNumber: text("check_number"),
  wireConfirmation: text("wire_confirmation"),
  referenceNumber: text("reference_number"),
  // Source
  paymentId: integer("payment_id").references(() => payments.id),
  // Processing
  processedBy: integer("processed_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  batchId: text("batch_id"),
  // Additional
  description: text("description").notNull(),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    accountIdx: index("escrow_trans_account_idx").on(table.escrowAccountId),
    dateIdx: index("escrow_trans_date_idx").on(table.transactionDate),
    typeIdx: index("escrow_trans_type_idx").on(table.transactionType),
  };
});

// Payees
export const payees = pgTable("payees", {
  id: serial("id").primaryKey(),
  payeeType: text("payee_type").notNull(), // 'tax_authority', 'insurance_company', 'hoa', 'utility', 'other'
  name: text("name").notNull(),
  // Contact
  contactName: text("contact_name"),
  phone: text("phone"),
  fax: text("fax"),
  email: text("email"),
  website: text("website"),
  // Address
  address: text("address"),
  address2: text("address_2"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country").default('USA'),
  // Payment information
  paymentMethod: text("payment_method"), // 'check', 'ach', 'wire'
  accountNumber: text("account_number"),
  routingNumber: text("routing_number"),
  wireInstructions: text("wire_instructions"),
  // Tax specific
  taxAuthority: boolean("tax_authority").default(false),
  taxDistrict: text("tax_district"),
  // Insurance specific
  naicCode: text("naic_code"),
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  isPreferred: boolean("is_preferred").default(false),
  // Additional
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    nameIdx: index("payee_name_idx").on(table.name),
    typeIdx: index("payee_type_idx").on(table.payeeType),
    activeIdx: index("payee_active_idx").on(table.isActive),
  };
});

// ========================================
// DOCUMENT TABLES
// ========================================

// Documents
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  // References
  loanId: integer("loan_id").references(() => loans.id),
  borrowerId: integer("borrower_id").references(() => borrowerEntities.id),
  propertyId: integer("property_id").references(() => properties.id),
  // Document details
  category: documentCategoryEnum("category").notNull(),
  documentType: text("document_type"),
  title: text("title").notNull(),
  description: text("description"),
  // File information
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  storageUrl: text("storage_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  // Document metadata
  documentDate: date("document_date"),
  recordedDate: date("recorded_date"),
  expirationDate: date("expiration_date"),
  // Recording information
  recordingNumber: text("recording_number"),
  bookNumber: text("book_number"),
  pageNumber: text("page_number"),
  instrumentNumber: text("instrument_number"),
  // Security and access
  isPublic: boolean("is_public").default(false).notNull(),
  isConfidential: boolean("is_confidential").default(false),
  requiresSignature: boolean("requires_signature").default(false),
  isSigned: boolean("is_signed").default(false),
  // Version control
  version: integer("version").default(1).notNull(),
  parentDocumentId: integer("parent_document_id").references(() => documents.id),
  isCurrentVersion: boolean("is_current_version").default(true),
  // User tracking
  uploadedBy: integer("uploaded_by").references(() => users.id).notNull(),
  lastAccessedBy: integer("last_accessed_by").references(() => users.id),
  lastAccessedAt: timestamp("last_accessed_at"),
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  archivedDate: timestamp("archived_date"),
  archivedBy: integer("archived_by").references(() => users.id),
  // Additional
  tags: text("tags").array(),
  notes: text("notes"), // Store AI extraction JSON or other notes
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("document_loan_idx").on(table.loanId),
    borrowerIdx: index("document_borrower_idx").on(table.borrowerId),
    categoryIdx: index("document_category_idx").on(table.category),
    uploadedByIdx: index("document_uploaded_by_idx").on(table.uploadedBy),
    documentDateIdx: index("document_date_idx").on(table.documentDate),
  };
});

// Document Templates
export const documentTemplates = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: documentCategoryEnum("category").notNull(),
  description: text("description"),
  templateContent: text("template_content"),
  templateUrl: text("template_url"),
  variables: jsonb("variables"), // List of merge fields
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ========================================
// SERVICING AND COLLECTIONS
// ========================================

// Servicing Instructions
export const servicingInstructions = pgTable("servicing_instructions", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  instructionType: text("instruction_type").notNull(), // 'payment', 'escrow', 'collection', 'reporting'
  priority: priorityEnum("priority").default('medium'),
  effectiveDate: date("effective_date").notNull(),
  expirationDate: date("expiration_date"),
  instructions: text("instructions").notNull(),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("servicing_loan_idx").on(table.loanId),
    typeIdx: index("servicing_type_idx").on(table.instructionType),
    activeIdx: index("servicing_active_idx").on(table.isActive),
  };
});

// Collection Activities
export const collectionActivities = pgTable("collection_activities", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  activityDate: timestamp("activity_date").defaultNow().notNull(),
  activityType: text("activity_type").notNull(), // 'call', 'letter', 'email', 'visit', 'legal'
  status: collectionStatusEnum("status").notNull(),
  contactMethod: text("contact_method"),
  contactPerson: text("contact_person"),
  phoneNumber: text("phone_number"),
  promiseDate: date("promise_date"),
  promiseAmount: decimal("promise_amount", { precision: 10, scale: 2 }),
  result: text("result"),
  nextActionDate: date("next_action_date"),
  nextAction: text("next_action"),
  notes: text("notes").notNull(),
  performedBy: integer("performed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("collection_loan_idx").on(table.loanId),
    dateIdx: index("collection_date_idx").on(table.activityDate),
    statusIdx: index("collection_status_idx").on(table.status),
  };
});

// ========================================
// LEGAL AND COMPLIANCE
// ========================================

// Legal Proceedings
export const legalProceedings = pgTable("legal_proceedings", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  proceedingType: text("proceeding_type").notNull(), // 'foreclosure', 'bankruptcy', 'litigation', 'eviction'
  caseNumber: text("case_number"),
  courtName: text("court_name"),
  filingDate: date("filing_date"),
  attorneyName: text("attorney_name"),
  attorneyFirm: text("attorney_firm"),
  attorneyPhone: text("attorney_phone"),
  attorneyEmail: text("attorney_email"),
  status: text("status").notNull(),
  statusDate: date("status_date"),
  saleDate: date("sale_date"),
  redemptionDeadline: date("redemption_deadline"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("legal_loan_idx").on(table.loanId),
    typeIdx: index("legal_type_idx").on(table.proceedingType),
    caseIdx: index("legal_case_idx").on(table.caseNumber),
  };
});

// Fee Templates (Default fee schedules for lenders)
export const feeTemplates = pgTable("fee_templates", {
  id: serial("id").primaryKey(),
  lenderId: integer("lender_id").references(() => users.id).notNull(),
  templateName: text("template_name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  fees: jsonb("fees").notNull(), // Array of fee definitions
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    lenderIdx: index("fee_template_lender_idx").on(table.lenderId),
    defaultIdx: index("fee_template_default_idx").on(table.isDefault),
  };
});

// Loan Fees (Fees applied to specific loans)
export const loanFees = pgTable("loan_fees", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  feeType: text("fee_type").notNull(), // 'origination', 'servicing', 'late', 'nsf', 'modification', 'payoff', 'recording', etc.
  feeName: text("fee_name").notNull(),
  feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }).notNull(),
  feePercentage: decimal("fee_percentage", { precision: 5, scale: 3 }), // For percentage-based fees
  frequency: text("frequency"), // 'one-time', 'monthly', 'quarterly', 'annual'
  chargeDate: date("charge_date"),
  dueDate: date("due_date"),
  paidDate: date("paid_date"),
  waived: boolean("waived").default(false),
  waivedBy: integer("waived_by").references(() => users.id),
  waivedReason: text("waived_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("loan_fee_loan_idx").on(table.loanId),
    typeIdx: index("loan_fee_type_idx").on(table.feeType),
    dueDateIdx: index("loan_fee_due_date_idx").on(table.dueDate),
  };
});

// Insurance Policies
export const insurancePolicies = pgTable("insurance_policies", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id),
  propertyId: integer("property_id").references(() => properties.id).notNull(),
  policyType: text("policy_type").notNull(), // 'hazard', 'flood', 'earthquake', 'wind', 'liability'
  insuranceCompany: text("insurance_company").notNull(),
  policyNumber: text("policy_number").notNull(),
  effectiveDate: date("effective_date").notNull(),
  expirationDate: date("expiration_date").notNull(),
  coverageAmount: decimal("coverage_amount", { precision: 12, scale: 2 }).notNull(),
  deductible: decimal("deductible", { precision: 10, scale: 2 }),
  annualPremium: decimal("annual_premium", { precision: 10, scale: 2 }).notNull(),
  agentName: text("agent_name"),
  agentPhone: text("agent_phone"),
  agentEmail: text("agent_email"),
  isEscrowPaid: boolean("is_escrow_paid").default(false),
  isActive: boolean("is_active").default(true),
  lastVerifiedDate: date("last_verified_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("insurance_loan_idx").on(table.loanId),
    propertyIdx: index("insurance_property_idx").on(table.propertyId),
    policyNumberIdx: index("insurance_policy_number_idx").on(table.policyNumber),
    expirationIdx: index("insurance_expiration_idx").on(table.expirationDate),
  };
});

// ========================================
// SYSTEM TABLES
// ========================================

// Audit Log
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  loanId: integer("loan_id").references(() => loans.id),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(), // 'create', 'update', 'delete', 'view', 'export'
  previousValues: jsonb("previous_values"),
  newValues: jsonb("new_values"),
  changedFields: text("changed_fields").array(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index("audit_user_idx").on(table.userId),
    entityIdx: index("audit_entity_idx").on(table.entityType, table.entityId),
    createdAtIdx: index("audit_created_at_idx").on(table.createdAt),
  };
});

// Notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: notificationTypeEnum("type").notNull(),
  priority: priorityEnum("priority").default('medium').notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: integer("related_entity_id"),
  actionUrl: text("action_url"),
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),
  isArchived: boolean("is_archived").default(false),
  archivedAt: timestamp("archived_at"),
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  emailSent: boolean("email_sent").default(false),
  smsSent: boolean("sms_sent").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index("notification_user_idx").on(table.userId),
    readIdx: index("notification_is_read_idx").on(table.isRead),
    typeIdx: index("notification_type_idx").on(table.type),
    createdAtIdx: index("notification_created_idx").on(table.createdAt),
  };
});

// Tasks/Workflows
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull(), // 'review', 'approval', 'processing', 'verification'
  priority: priorityEnum("priority").default('medium'),
  status: text("status").notNull(), // 'pending', 'in_progress', 'completed', 'cancelled'
  // References
  loanId: integer("loan_id").references(() => loans.id),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: integer("related_entity_id"),
  // Assignment
  assignedTo: integer("assigned_to").references(() => users.id),
  assignedBy: integer("assigned_by").references(() => users.id),
  assignedDate: timestamp("assigned_date"),
  // Dates
  dueDate: timestamp("due_date"),
  startedDate: timestamp("started_date"),
  completedDate: timestamp("completed_date"),
  // Additional
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    assignedToIdx: index("task_assigned_to_idx").on(table.assignedTo),
    statusIdx: index("task_status_idx").on(table.status),
    dueDateIdx: index("task_due_date_idx").on(table.dueDate),
    loanIdx: index("task_loan_idx").on(table.loanId),
  };
});

// System Settings
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  description: text("description"),
  isEditable: boolean("is_editable").default(true),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    categoryKeyIdx: uniqueIndex("settings_category_key_idx").on(table.category, table.key),
  };
});

// ========================================
// DEFINE RELATIONSHIPS
// ========================================

// Users Relations
export const usersRelations = relations(users, ({ many }) => ({
  loansAsLender: many(loans),
  loansAsServicer: many(loans),
  documentsUploaded: many(documents),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
  tasks: many(tasks),
}));

// Loan Relations
export const loansRelations = relations(loans, ({ one, many }) => ({
  property: one(properties, {
    fields: [loans.propertyId],
    references: [properties.id],
  }),
  lender: one(users, {
    fields: [loans.lenderId],
    references: [users.id],
  }),
  servicer: one(users, {
    fields: [loans.servicerId],
    references: [users.id],
  }),
  investor: one(users, {
    fields: [loans.investorId],
    references: [users.id],
  }),
  borrowers: many(loanBorrowers),
  guarantors: many(guarantors),
  payments: many(payments),
  paymentSchedule: many(paymentSchedule),
  documents: many(documents),
  escrowAccount: one(escrowAccounts),
  servicingInstructions: many(servicingInstructions),
  collectionActivities: many(collectionActivities),
  legalProceedings: many(legalProceedings),
  insurancePolicies: many(insurancePolicies),
  tasks: many(tasks),
}));

// Other relations remain largely the same but updated with new tables...

// ========================================
// CREATE INSERT SCHEMAS AND TYPES
// ========================================

// Core schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBorrowerEntitySchema = createInsertSchema(borrowerEntities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLoanSchema = createInsertSchema(loans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLoanBorrowerSchema = createInsertSchema(loanBorrowers).omit({ id: true, createdAt: true });
export const insertGuarantorSchema = createInsertSchema(guarantors).omit({ id: true, createdAt: true, updatedAt: true });

// Payment schemas
export const insertPaymentScheduleSchema = createInsertSchema(paymentSchedule).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true });

// Escrow schemas
export const insertEscrowAccountSchema = createInsertSchema(escrowAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEscrowItemSchema = createInsertSchema(escrowItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEscrowTransactionSchema = createInsertSchema(escrowTransactions).omit({ id: true, createdAt: true });
export const insertPayeeSchema = createInsertSchema(payees).omit({ id: true, createdAt: true, updatedAt: true });

// Document schemas
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentTemplateSchema = createInsertSchema(documentTemplates).omit({ id: true, createdAt: true, updatedAt: true });

// Servicing schemas
export const insertServicingInstructionSchema = createInsertSchema(servicingInstructions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCollectionActivitySchema = createInsertSchema(collectionActivities).omit({ id: true, createdAt: true });

// Legal schemas
export const insertLegalProceedingSchema = createInsertSchema(legalProceedings).omit({ id: true, createdAt: true, updatedAt: true });

// Fee schemas
export const insertFeeTemplateSchema = createInsertSchema(feeTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLoanFeeSchema = createInsertSchema(loanFees).omit({ id: true, createdAt: true, updatedAt: true });

// Insurance schemas
export const insertInsurancePolicySchema = createInsertSchema(insurancePolicies).omit({ id: true, createdAt: true, updatedAt: true });

// System schemas
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, createdAt: true, updatedAt: true });

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type BorrowerEntity = typeof borrowerEntities.$inferSelect;
export type InsertBorrowerEntity = z.infer<typeof insertBorrowerEntitySchema>;
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Loan = typeof loans.$inferSelect;
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type LoanBorrower = typeof loanBorrowers.$inferSelect;
export type InsertLoanBorrower = z.infer<typeof insertLoanBorrowerSchema>;
export type Guarantor = typeof guarantors.$inferSelect;
export type InsertGuarantor = z.infer<typeof insertGuarantorSchema>;
export type PaymentSchedule = typeof paymentSchedule.$inferSelect;
export type InsertPaymentSchedule = z.infer<typeof insertPaymentScheduleSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type EscrowAccount = typeof escrowAccounts.$inferSelect;
export type InsertEscrowAccount = z.infer<typeof insertEscrowAccountSchema>;
export type EscrowItem = typeof escrowItems.$inferSelect;
export type InsertEscrowItem = z.infer<typeof insertEscrowItemSchema>;
export type EscrowTransaction = typeof escrowTransactions.$inferSelect;
export type InsertEscrowTransaction = z.infer<typeof insertEscrowTransactionSchema>;
export type Payee = typeof payees.$inferSelect;
export type InsertPayee = z.infer<typeof insertPayeeSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type ServicingInstruction = typeof servicingInstructions.$inferSelect;
export type InsertServicingInstruction = z.infer<typeof insertServicingInstructionSchema>;
export type CollectionActivity = typeof collectionActivities.$inferSelect;
export type InsertCollectionActivity = z.infer<typeof insertCollectionActivitySchema>;
export type LegalProceeding = typeof legalProceedings.$inferSelect;
export type InsertLegalProceeding = z.infer<typeof insertLegalProceedingSchema>;
export type FeeTemplate = typeof feeTemplates.$inferSelect;
export type InsertFeeTemplate = z.infer<typeof insertFeeTemplateSchema>;
export type LoanFee = typeof loanFees.$inferSelect;
export type InsertLoanFee = z.infer<typeof insertLoanFeeSchema>;
export type InsurancePolicy = typeof insurancePolicies.$inferSelect;
export type InsertInsurancePolicy = z.infer<typeof insertInsurancePolicySchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

// For backward compatibility, keep the original named exports
export type EscrowPayment = EscrowTransaction;
export type InsertEscrowPayment = InsertEscrowTransaction;
export const escrowPayments = escrowTransactions;
export const insertEscrowPaymentSchema = insertEscrowTransactionSchema;