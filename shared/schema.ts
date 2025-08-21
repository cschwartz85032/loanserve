import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { pgTable, text, timestamp, integer, serial, boolean, jsonb, json, decimal, uuid, varchar, date, index, pgEnum, uniqueIndex, time, primaryKey } from "drizzle-orm/pg-core";
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
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaRequired: boolean("mfa_required").default(false),
  require_mfa_for_sensitive: boolean("require_mfa_for_sensitive").default(true),
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
  // Servicing - single field with type toggle (like late charge)
  servicingFee: decimal("servicing_fee", { precision: 10, scale: 2 }),
  servicingFeeType: text("servicing_fee_type").notNull().default('percentage'), // 'amount' or 'percentage' - indicates how to interpret servicingFee
  lateCharge: decimal("late_charge", { precision: 10, scale: 2 }),
  lateChargeType: text("late_charge_type").notNull().default('percentage'), // 'fixed' or 'percentage' - explicitly named
  feePayer: text("fee_payer"), // 'B', 'S', 'SP'
  gracePeriodDays: integer("grace_period_days"),
  investorLoanNumber: text("investor_loan_number"),
  poolNumber: text("pool_number"),
  // Compliance
  hmda: boolean("hmda").default(false),
  hoepa: boolean("hoepa").default(false),
  qm: boolean("qm").default(false), // Qualified Mortgage
  // Borrower Information (basic contact info stored in loan for quick access)
  borrowerName: text("borrower_name"),
  borrowerCompanyName: text("borrower_company_name"),
  borrowerEmail: text("borrower_email"),
  borrowerPhone: text("borrower_phone"),
  borrowerMobile: text("borrower_mobile"),
  borrowerPhoto: text("borrower_photo"),
  // Borrower mailing address (separate from property address)
  borrowerAddress: text("borrower_address"),
  borrowerCity: text("borrower_city"),
  borrowerState: text("borrower_state"),
  borrowerZip: text("borrower_zip"),
  // Enhanced AI-extracted fields
  borrowerSSN: text("borrower_ssn"),
  borrowerIncome: decimal("borrower_income", { precision: 15, scale: 2 }),
  // Credit scores for borrower
  creditScoreEquifax: integer("credit_score_equifax"),
  creditScoreExperian: integer("credit_score_experian"),
  creditScoreTransunion: integer("credit_score_transunion"),
  // Co-Borrower information
  coBorrowerName: text("co_borrower_name"),
  coBorrowerCompanyName: text("co_borrower_company_name"),
  coBorrowerEmail: text("co_borrower_email"),
  coBorrowerPhone: text("co_borrower_phone"),
  coBorrowerAddress: text("co_borrower_address"),
  coBorrowerCity: text("co_borrower_city"),
  coBorrowerState: text("co_borrower_state"),
  coBorrowerZip: text("co_borrower_zip"),
  coBorrowerSSN: text("co_borrower_ssn"),
  coBorrowerIncome: decimal("co_borrower_income", { precision: 15, scale: 2 }),
  coBorrowerCreditScoreEquifax: integer("co_borrower_credit_score_equifax"),
  coBorrowerCreditScoreExperian: integer("co_borrower_credit_score_experian"),
  coBorrowerCreditScoreTransunion: integer("co_borrower_credit_score_transunion"),
  // Trustee information
  trusteeName: text("trustee_name"),
  trusteeCompanyName: text("trustee_company_name"),
  trusteePhone: text("trustee_phone"),
  trusteeEmail: text("trustee_email"),
  trusteeStreetAddress: text("trustee_street_address"),
  trusteeCity: text("trustee_city"),
  trusteeState: text("trustee_state"),
  trusteeZipCode: text("trustee_zip_code"),
  // Beneficiary information
  beneficiaryName: text("beneficiary_name"),
  beneficiaryCompanyName: text("beneficiary_company_name"),
  beneficiaryPhone: text("beneficiary_phone"),
  beneficiaryEmail: text("beneficiary_email"),
  beneficiaryStreetAddress: text("beneficiary_street_address"),
  beneficiaryCity: text("beneficiary_city"),
  beneficiaryState: text("beneficiary_state"),
  beneficiaryZipCode: text("beneficiary_zip_code"),
  // Escrow company information
  escrowCompanyName: text("escrow_company_name"),
  escrowNumber: text("escrow_number"),
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
  // Insurance and Tax fields (for temporary storage during creation)
  hazardInsurance: decimal("hazard_insurance", { precision: 10, scale: 2 }),
  propertyTaxes: decimal("property_taxes", { precision: 10, scale: 2 }),
  hoaFees: decimal("hoa_fees", { precision: 10, scale: 2 }),
  pmiAmount: decimal("pmi_amount", { precision: 10, scale: 2 }),
  // servicingFee removed - using servicingFeeRate/servicingFeeAmount instead
  // Additional payment fields for UI compatibility
  propertyTax: decimal("property_tax", { precision: 10, scale: 2 }),
  homeInsurance: decimal("home_insurance", { precision: 10, scale: 2 }),
  pmi: decimal("pmi", { precision: 10, scale: 2 }),
  otherMonthly: decimal("other_monthly", { precision: 10, scale: 2 }),
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
  ownershipPercentage: decimal("ownership_percentage", { precision: 8, scale: 6 }), // Aligned with investors table for precise splits
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
// INVESTOR TABLES
// ========================================

// Investors - Track ownership percentages and banking information
export const investors = pgTable("investors", {
  id: serial("id").primaryKey(),
  investorId: text("investor_id").unique().notNull(), // Unique investor identifier
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  
  // Investor details
  entityType: entityTypeEnum("entity_type").notNull(), // 'individual' or 'entity'
  name: text("name").notNull(), // Individual or entity name
  contactName: text("contact_name"), // Contact person if entity
  ssnOrEin: text("ssn_or_ein"), // SSN for individuals or EIN for entities
  email: text("email"),
  phone: text("phone"),
  
  // Address
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  
  // Banking information
  bankName: text("bank_name"),
  bankStreetAddress: text("bank_street_address"),
  bankCity: text("bank_city"),
  bankState: text("bank_state"),
  bankZipCode: text("bank_zip_code"),
  accountNumber: text("account_number"), // Encrypted
  routingNumber: text("routing_number"),
  accountType: text("account_type"), // 'checking', 'savings'
  
  // Ownership
  ownershipPercentage: decimal("ownership_percentage", { precision: 8, scale: 6 }).notNull(), // 0.000000 to 99.999999 for precise splits
  investmentAmount: decimal("investment_amount", { precision: 15, scale: 2 }),
  investmentDate: date("investment_date"),
  
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("investor_loan_idx").on(table.loanId),
    investorIdIdx: uniqueIndex("investor_id_idx").on(table.investorId),
    activeIdx: index("investor_active_idx").on(table.isActive),
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

// Escrow Disbursements - Enhanced escrow payment management
export const escrowDisbursements = pgTable("escrow_disbursements", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
  
  // Disbursement classification
  disbursementType: disbursementTypeEnum("disbursement_type").notNull(),
  description: text("description").notNull(),
  category: text("category"), // subcategory within type
  
  // Payee information
  payeeName: text("payee_name").notNull(),
  payeeContactName: text("payee_contact_name"),
  payeePhone: text("payee_phone"),
  payeeEmail: text("payee_email"),
  payeeFax: text("payee_fax"),
  
  // Payee address
  payeeStreetAddress: text("payee_street_address"),
  payeeCity: text("payee_city"),
  payeeState: text("payee_state"),
  payeeZipCode: text("payee_zip_code"),
  
  // Type-specific fields
  parcelNumber: text("parcel_number"), // For property taxes
  
  // Insurance-specific fields
  policyNumber: text("policy_number"), // For insurance
  insuredName: text("insured_name"), // Name of the insured party
  insuranceCompanyName: text("insurance_company_name"), // Insurance company name
  policyDescription: text("policy_description"), // Type of insurance (Hazard, Flood, etc.)
  policyExpirationDate: date("policy_expiration_date"), // Policy expiration date
  coverageAmount: decimal("coverage_amount", { precision: 12, scale: 2 }), // Coverage amount in dollars
  
  // Insurance property information
  insurancePropertyAddress: text("insurance_property_address"), // Property covered by insurance
  insurancePropertyCity: text("insurance_property_city"),
  insurancePropertyState: text("insurance_property_state"),
  insurancePropertyZipCode: text("insurance_property_zip_code"),
  
  // Insurance agent information
  agentName: text("agent_name"), // Insurance agent's name
  agentBusinessAddress: text("agent_business_address"), // Agent's business address
  agentCity: text("agent_city"),
  agentState: text("agent_state"),
  agentZipCode: text("agent_zip_code"),
  agentPhone: text("agent_phone"), // Agent's phone number
  agentFax: text("agent_fax"), // Agent's fax number
  agentEmail: text("agent_email"), // Agent's email
  
  // Insurance document reference
  insuranceDocumentId: integer("insurance_document_id").references(() => documents.id), // Link to uploaded insurance document
  insuranceTracking: boolean("insurance_tracking").default(true), // Active insurance tracking status
  
  // Payment method and banking information
  paymentMethod: disbursementPaymentMethodEnum("payment_method").notNull().default('check'),
  bankAccountNumber: text("bank_account_number"), // Encrypted - replaces accountNumber
  achRoutingNumber: text("ach_routing_number"),
  wireRoutingNumber: text("wire_routing_number"),
  accountType: text("account_type"), // 'checking', 'savings'
  bankName: text("bank_name"),
  wireInstructions: text("wire_instructions"),
  
  // Remittance information
  remittanceAddress: text("remittance_address"),
  remittanceCity: text("remittance_city"),
  remittanceState: text("remittance_state"),
  remittanceZipCode: text("remittance_zip_code"),
  accountNumber: text("account_number"), // For taxes - property tax account number
  referenceNumber: text("reference_number"),
  
  // Recurrence pattern
  frequency: frequencyEnum("frequency").notNull(),
  monthlyAmount: decimal("monthly_amount", { precision: 10, scale: 2 }),
  annualAmount: decimal("annual_amount", { precision: 10, scale: 2 }).notNull(),
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Due dates and scheduling
  firstDueDate: date("first_due_date"),
  nextDueDate: date("next_due_date").notNull(),
  lastPaidDate: date("last_paid_date"),
  specificDueDates: jsonb("specific_due_dates"), // For taxes with specific bi-annual dates
  
  // Status and holds
  status: disbursementStatusEnum("status").notNull().default('active'),
  isOnHold: boolean("is_on_hold").default(false).notNull(),
  holdReason: text("hold_reason"),
  holdRequestedBy: text("hold_requested_by"),
  holdDate: timestamp("hold_date"),
  
  // Auto-pay settings
  autoPayEnabled: boolean("auto_pay_enabled").default(true),
  daysBeforeDue: integer("days_before_due").default(10), // How many days before due date to pay
  
  // Additional tracking
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("escrow_disb_loan_idx").on(table.loanId),
    accountIdx: index("escrow_disb_account_idx").on(table.escrowAccountId),
    typeIdx: index("escrow_disb_type_idx").on(table.disbursementType),
    nextDueIdx: index("escrow_disb_next_due_idx").on(table.nextDueDate),
    statusIdx: index("escrow_disb_status_idx").on(table.status),
    holdIdx: index("escrow_disb_hold_idx").on(table.isOnHold),
  };
});

// Escrow Disbursement Payments - Track actual payments made
export const escrowDisbursementPayments = pgTable("escrow_disbursement_payments", {
  id: serial("id").primaryKey(),
  disbursementId: integer("disbursement_id").references(() => escrowDisbursements.id).notNull(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  ledgerEntryId: integer("ledger_entry_id"), // References accounting ledger entry
  
  // Payment details
  paymentDate: timestamp("payment_date").notNull(),
  dueDate: date("due_date").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  
  // Payment method used
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  checkNumber: text("check_number"),
  wireConfirmation: text("wire_confirmation"),
  achTransactionId: text("ach_transaction_id"),
  
  // Status
  status: paymentStatusEnum("status").notNull().default('scheduled'),
  confirmationNumber: text("confirmation_number"),
  
  // Processing
  processedBy: integer("processed_by").references(() => users.id),
  processedDate: timestamp("processed_date"),
  
  // Additional
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    disbursementIdx: index("escrow_payment_disbursement_idx").on(table.disbursementId),
    loanIdx: index("escrow_payment_loan_idx").on(table.loanId),
    dueDateIdx: index("escrow_payment_due_date_idx").on(table.dueDate),
    statusIdx: index("escrow_payment_status_idx").on(table.status),
  };
});

// Escrow Transactions
export const escrowTransactions = pgTable("escrow_transactions", {
  id: serial("id").primaryKey(),
  escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
  escrowItemId: integer("escrow_item_id"), // References escrow item
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

// Loan Ledger (Complete accounting ledger for all loan transactions)
export const loanLedger = pgTable("loan_ledger", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loans.id).notNull(),
  transactionDate: timestamp("transaction_date").notNull(),
  transactionId: text("transaction_id").notNull().unique(),
  description: text("description").notNull(),
  transactionType: text("transaction_type").notNull(), // 'principal', 'interest', 'fee', 'payment', 'escrow', 'penalty', 'reversal'
  category: text("category"), // 'origination', 'servicing', 'late_fee', 'nsf', 'modification', 'payoff', 'recording', etc.
  debitAmount: decimal("debit_amount", { precision: 12, scale: 2 }),
  creditAmount: decimal("credit_amount", { precision: 12, scale: 2 }),
  runningBalance: decimal("running_balance", { precision: 12, scale: 2 }).notNull(),
  principalBalance: decimal("principal_balance", { precision: 12, scale: 2 }).notNull(),
  interestBalance: decimal("interest_balance", { precision: 12, scale: 2 }).default('0'),
  status: text("status").notNull().default('posted'), // 'pending', 'posted', 'pending_approval', 'reversed'
  reversalOf: integer("reversal_of").references(() => loanLedger.id),
  reversedBy: integer("reversed_by").references(() => loanLedger.id),
  approvalRequired: boolean("approval_required").default(false),
  approvedBy: integer("approved_by").references(() => users.id),
  approvalDate: timestamp("approval_date"),
  approvalNotes: text("approval_notes"),
  createdBy: integer("created_by").references(() => users.id),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("ledger_loan_idx").on(table.loanId),
    dateIdx: index("ledger_date_idx").on(table.transactionDate),
    statusIdx: index("ledger_status_idx").on(table.status),
    typeIdx: index("ledger_type_idx").on(table.transactionType),
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

// User Management System Tables

// User status enum
export const userStatusEnum = pgEnum("user_status", ['invited', 'active', 'locked', 'suspended', 'disabled']);

// Permission level enum
export const permissionLevelEnum = pgEnum("permission_level", ['none', 'read', 'write', 'admin']);

// Login outcome enum
export const loginOutcomeEnum = pgEnum("login_outcome", ['succeeded', 'failed', 'locked']);

// Roles table
export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// User roles junction table
export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    userIdx: index("idx_user_roles_user_id").on(table.userId),
    roleIdx: index("idx_user_roles_role_id").on(table.roleId),
  };
});

// Permissions table
export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  resource: text("resource").notNull(),
  level: permissionLevelEnum("level").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    uniqueResourceLevel: uniqueIndex("unique_resource_level").on(table.resource, table.level),
  };
});

// Role permissions table (denormalized structure)
export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: 'cascade' }),
  resource: text("resource").notNull(),
  permission: text("permission").notNull(), // Level: none, read, write, admin
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    roleIdx: index("idx_role_permissions_role_id").on(table.roleId),
  };
});

// User IP allowlist table
export const userIpAllowlist = pgTable("user_ip_allowlist", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  ipAddress: text("ip_address").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  useCount: integer("use_count").default(0),
  cidr: text("cidr"),
  label: text("label"),
}, (table) => {
  return {
    activeIdx: index("idx_user_ip_allowlist_user_id").on(table.userId),
  };
});

// Auth events table (audit log)
export const authEvents = pgTable("auth_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  actorUserId: integer("actor_user_id").references(() => users.id),
  targetUserId: integer("target_user_id").references(() => users.id),
  eventType: text("event_type").notNull(),
  ip: text("ip"), // Using text for inet type
  userAgent: text("user_agent"),
  details: jsonb("details").notNull().default({}),
  eventKey: text("event_key").unique(),
}, (table) => {
  return {
    occurredAtIdx: index("idx_auth_events_occurred_at").on(table.occurredAt),
    actorIdx: index("idx_auth_events_actor_user_id").on(table.actorUserId),
    targetIdx: index("idx_auth_events_target_user_id").on(table.targetUserId),
    eventTypeIdx: index("idx_auth_events_event_type").on(table.eventType),
  };
});

// Login attempts table
export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: integer("user_id").references(() => users.id),
  emailAttempted: text("email_attempted"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
  ip: text("ip"), // Using text for inet type
  userAgent: text("user_agent"),
  outcome: loginOutcomeEnum("outcome").notNull(),
  reason: text("reason"),
}, (table) => {
  return {
    userIdx: index("idx_login_attempts_user_id").on(table.userId),
    attemptedAtIdx: index("idx_login_attempts_attempted_at").on(table.attemptedAt),
    ipIdx: index("idx_login_attempts_ip").on(table.ip),
  };
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    uniqueUserToken: uniqueIndex("unique_user_token").on(table.userId, table.tokenHash),
    userIdx: index("idx_password_reset_tokens_user_id").on(table.userId),
    expiresIdx: index("idx_password_reset_tokens_expires_at").on(table.expiresAt),
  };
});

// Sessions table (express-session compatible)
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  sid: varchar("sid", { length: 255 }).notNull().unique(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
  userId: varchar("user_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  lastActivity: timestamp("last_activity"),
  lastSeenAt: timestamp("last_seen_at"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  revokedAt: timestamp("revoked_at"),
  revokeReason: text("revoke_reason"),
}, (table) => {
  return {
    sidIdx: index("idx_sessions_sid").on(table.sid),
    expireIdx: index("idx_sessions_expire").on(table.expire),
  };
});

// CRM Tables
// CRM Notes table
export const crmNotes = pgTable("crm_notes", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isPrivate: boolean("is_private").default(false),
  mentionedUsers: jsonb("mentioned_users").default([]),
  attachments: jsonb("attachments").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_notes_loan_idx").on(table.loanId),
    userIdx: index("crm_notes_user_idx").on(table.userId),
    createdAtIdx: index("crm_notes_created_at_idx").on(table.createdAt),
  };
});

// CRM Tasks table
export const crmTasks = pgTable("crm_tasks", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  createdBy: integer("created_by").notNull().references(() => users.id),
  assignedTo: integer("assigned_to").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default('pending'), // pending, in_progress, completed, cancelled
  priority: text("priority").default('medium'), // low, medium, high, urgent
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  tags: jsonb("tags").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_tasks_loan_idx").on(table.loanId),
    assignedToIdx: index("crm_tasks_assigned_to_idx").on(table.assignedTo),
    statusIdx: index("crm_tasks_status_idx").on(table.status),
    dueDateIdx: index("crm_tasks_due_date_idx").on(table.dueDate),
  };
});

// CRM Appointments table
export const crmAppointments = pgTable("crm_appointments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  createdBy: integer("created_by").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  attendees: jsonb("attendees").default([]),
  reminderMinutes: integer("reminder_minutes").default(15),
  status: text("status").default('scheduled'), // scheduled, completed, cancelled, rescheduled
  meetingLink: text("meeting_link"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_appointments_loan_idx").on(table.loanId),
    startTimeIdx: index("crm_appointments_start_time_idx").on(table.startTime),
    statusIdx: index("crm_appointments_status_idx").on(table.status),
  };
});

// CRM Calls table
export const crmCalls = pgTable("crm_calls", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  direction: text("direction").notNull(), // inbound, outbound
  status: text("status").notNull(), // completed, missed, voicemail, scheduled
  duration: integer("duration"), // in seconds
  outcome: text("outcome"),
  notes: text("notes"),
  scheduledFor: timestamp("scheduled_for"),
  completedAt: timestamp("completed_at"),
  recordingUrl: text("recording_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_calls_loan_idx").on(table.loanId),
    userIdx: index("crm_calls_user_idx").on(table.userId),
    statusIdx: index("crm_calls_status_idx").on(table.status),
    scheduledForIdx: index("crm_calls_scheduled_for_idx").on(table.scheduledFor),
  };
});

// CRM Activity table (timeline)
export const crmActivity = pgTable("crm_activity", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  activityType: text("activity_type").notNull(), // note, task, call, appointment, email, document, status_change
  activityData: jsonb("activity_data").notNull(),
  relatedId: integer("related_id"), // ID of related record (note_id, task_id, etc.)
  isSystem: boolean("is_system").default(false), // System-generated vs user action
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_activity_loan_idx").on(table.loanId),
    userIdx: index("crm_activity_user_idx").on(table.userId),
    typeIdx: index("crm_activity_type_idx").on(table.activityType),
    createdAtIdx: index("crm_activity_created_at_idx").on(table.createdAt),
  };
});

// CRM Collaborators table
export const crmCollaborators = pgTable("crm_collaborators", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull(), // viewer, editor, manager
  permissions: jsonb("permissions").default({}),
  addedBy: integer("added_by").notNull().references(() => users.id),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at"),
}, (table) => {
  return {
    loanUserIdx: uniqueIndex("crm_collaborators_loan_user_idx").on(table.loanId, table.userId),
    loanIdx: index("crm_collaborators_loan_idx").on(table.loanId),
    userIdx: index("crm_collaborators_user_idx").on(table.userId),
  };
});

// CRM Deals table
export const crmDeals = pgTable("crm_deals", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  value: decimal("value", { precision: 12, scale: 2 }),
  stage: text("stage").notNull(), // prospecting, qualification, proposal, negotiation, closed_won, closed_lost
  probability: integer("probability").default(0), // 0-100
  expectedCloseDate: date("expected_close_date"),
  actualCloseDate: date("actual_close_date"),
  lostReason: text("lost_reason"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    loanIdx: index("crm_deals_loan_idx").on(table.loanId),
    stageIdx: index("crm_deals_stage_idx").on(table.stage),
    assignedToIdx: index("crm_deals_assigned_to_idx").on(table.assignedTo),
  };
});

// Core schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBorrowerEntitySchema = createInsertSchema(borrowerEntities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true, updatedAt: true });

// User Management System Schemas and Types
export const insertRoleSchema = createInsertSchema(roles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ assignedAt: true });
export const insertPermissionSchema = createInsertSchema(permissions).omit({ id: true, createdAt: true });
export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ createdAt: true });
export const insertUserIpAllowlistSchema = createInsertSchema(userIpAllowlist).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuthEventSchema = createInsertSchema(authEvents).omit({ id: true, occurredAt: true });
export const insertLoginAttemptSchema = createInsertSchema(loginAttempts).omit({ id: true, attemptedAt: true });
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true, lastSeenAt: true });

// User Management System Types
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type UserIpAllowlist = typeof userIpAllowlist.$inferSelect;
export type InsertUserIpAllowlist = z.infer<typeof insertUserIpAllowlistSchema>;
export type AuthEvent = typeof authEvents.$inferSelect;
export type InsertAuthEvent = z.infer<typeof insertAuthEventSchema>;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type InsertLoginAttempt = z.infer<typeof insertLoginAttemptSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export const insertLoanSchema = createInsertSchema(loans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLoanBorrowerSchema = createInsertSchema(loanBorrowers).omit({ id: true, createdAt: true });
export const insertGuarantorSchema = createInsertSchema(guarantors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvestorSchema = createInsertSchema(investors).omit({ id: true, createdAt: true, updatedAt: true });

// Payment schemas
export const insertPaymentScheduleSchema = createInsertSchema(paymentSchedule).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true });

// Escrow schemas
export const insertEscrowAccountSchema = createInsertSchema(escrowAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEscrowDisbursementSchema = createInsertSchema(escrowDisbursements).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  paymentMethod: z.enum(['check', 'ach', 'wire'])
});
export const insertEscrowDisbursementPaymentSchema = createInsertSchema(escrowDisbursementPayments).omit({ id: true, createdAt: true });
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

// Ledger schemas
export const insertLoanLedgerSchema = createInsertSchema(loanLedger).omit({ id: true, createdAt: true, updatedAt: true });

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
export type Investor = typeof investors.$inferSelect;
export type InsertInvestor = z.infer<typeof insertInvestorSchema>;
export type PaymentSchedule = typeof paymentSchedule.$inferSelect;
export type InsertPaymentSchedule = z.infer<typeof insertPaymentScheduleSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type EscrowAccount = typeof escrowAccounts.$inferSelect;
export type InsertEscrowAccount = z.infer<typeof insertEscrowAccountSchema>;
export type EscrowDisbursement = typeof escrowDisbursements.$inferSelect;
export type InsertEscrowDisbursement = z.infer<typeof insertEscrowDisbursementSchema>;
export type EscrowDisbursementPayment = typeof escrowDisbursementPayments.$inferSelect;
export type InsertEscrowDisbursementPayment = z.infer<typeof insertEscrowDisbursementPaymentSchema>;
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
export type LoanLedger = typeof loanLedger.$inferSelect;
export type InsertLoanLedger = z.infer<typeof insertLoanLedgerSchema>;
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

// ========================================
// SERVICING CYCLE TABLES
// ========================================

// Servicing run tracking
export const servicingRuns = pgTable('servicing_runs', {
  id: serial('id').primaryKey(),
  runId: text('run_id').notNull().unique(),
  valuationDate: date('valuation_date').notNull(),
  startTime: timestamp('start_time').notNull().defaultNow(),
  endTime: timestamp('end_time'),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  loansProcessed: integer('loans_processed').notNull().default(0),
  totalLoans: integer('total_loans').notNull().default(0),
  eventsCreated: integer('events_created').notNull().default(0),
  exceptionsCreated: integer('exceptions_created').notNull().default(0),
  totalDisbursedBeneficiary: decimal('total_disbursed_beneficiary', { precision: 12, scale: 2 }).default('0.00'),
  totalDisbursedInvestors: decimal('total_disbursed_investors', { precision: 12, scale: 2 }).default('0.00'),
  reconciliationStatus: text('reconciliation_status', { enum: ['pending', 'balanced', 'imbalanced'] }).default('pending'),
  inputHash: text('input_hash'),
  errors: text('errors').array(),
  dryRun: boolean('dry_run').notNull().default(false),
  loanIds: text('loan_ids').array(),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Servicing events
export const servicingEvents = pgTable('servicing_events', {
  id: serial('id').primaryKey(),
  runId: text('run_id').notNull().references(() => servicingRuns.runId),
  eventKey: text('event_key').notNull(),
  eventType: text('event_type').notNull(), // interest_accrual, assess_due, late_fee, post_payment, distribute_investors, etc.
  loanId: integer('loan_id').references(() => loans.id),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  valuationDate: date('valuation_date').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }),
  principal: decimal('principal', { precision: 12, scale: 2 }),
  interest: decimal('interest', { precision: 12, scale: 2 }),
  escrow: decimal('escrow', { precision: 12, scale: 2 }),
  fees: decimal('fees', { precision: 12, scale: 2 }),
  details: jsonb('details').notNull().default('{}'),
  status: text('status', { enum: ['success', 'failed', 'pending'] }).notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  uniqueEventKey: uniqueIndex('unique_event_key').on(table.valuationDate, table.eventKey),
  loanIdIdx: index('servicing_events_loan_id_idx').on(table.loanId),
  runIdIdx: index('servicing_events_run_id_idx').on(table.runId),
  eventTypeIdx: index('servicing_events_type_idx').on(table.eventType)
}));

// Servicing exceptions queue
export const servicingExceptions = pgTable('servicing_exceptions', {
  id: serial('id').primaryKey(),
  runId: text('run_id').references(() => servicingRuns.runId),
  loanId: integer('loan_id').references(() => loans.id),
  severity: text('severity', { enum: ['low', 'medium', 'high', 'critical'] }).notNull(),
  type: text('type').notNull(), // insufficient_escrow, missing_payment, data_anomaly, etc.
  message: text('message').notNull(),
  suggestedAction: text('suggested_action'),
  dueDate: date('due_date'),
  status: text('status', { enum: ['open', 'resolved', 'escalated'] }).notNull().default('open'),
  resolvedBy: integer('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at'),
  resolutionNotes: text('resolution_notes'),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  loanIdIdx: index('servicing_exceptions_loan_id_idx').on(table.loanId),
  statusIdx: index('servicing_exceptions_status_idx').on(table.status),
  severityIdx: index('servicing_exceptions_severity_idx').on(table.severity)
}));

// Payment inbox for unprocessed payments
export const paymentsInbox = pgTable('payments_inbox', {
  id: serial('id').primaryKey(),
  referenceNumber: text('reference_number').unique(),
  valueDate: date('value_date').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  borrowerId: integer('borrower_id').references(() => borrowerEntities.id),
  loanId: integer('loan_id').references(() => loans.id),
  matchedBy: text('matched_by'), // loan_id_memo, borrower_id, reference_number, etc.
  matchConfidence: decimal('match_confidence', { precision: 3, scale: 2 }), // 0.00 to 1.00
  status: text('status', { enum: ['unmatched', 'matched', 'processed', 'suspense', 'rejected'] }).notNull().default('unmatched'),
  processedAt: timestamp('processed_at'),
  processedByRunId: text('processed_by_run_id').references(() => servicingRuns.runId),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  loanIdIdx: index('payments_inbox_loan_id_idx').on(table.loanId),
  statusIdx: index('payments_inbox_status_idx').on(table.status),
  valueDateIdx: index('payments_inbox_value_date_idx').on(table.valueDate)
}));

// Interest accrual tracking
export const interestAccruals = pgTable('interest_accruals', {
  id: serial('id').primaryKey(),
  loanId: integer('loan_id').notNull().references(() => loans.id),
  accrualDate: date('accrual_date').notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  dayCount: integer('day_count').notNull(),
  dayCountConvention: text('day_count_convention').notNull(), // ACT/365, 30/360, etc.
  interestRate: decimal('interest_rate', { precision: 8, scale: 4 }).notNull(),
  principalBalance: decimal('principal_balance', { precision: 12, scale: 2 }).notNull(),
  dailyRate: decimal('daily_rate', { precision: 12, scale: 10 }).notNull(),
  accruedAmount: decimal('accrued_amount', { precision: 12, scale: 2 }).notNull(),
  runId: text('run_id').references(() => servicingRuns.runId),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  uniqueAccrual: uniqueIndex('unique_accrual').on(table.loanId, table.accrualDate),
  loanIdIdx: index('interest_accruals_loan_id_idx').on(table.loanId)
}));

// Investor distribution tracking
export const investorDistributions = pgTable('investor_distributions', {
  id: serial('id').primaryKey(),
  runId: text('run_id').notNull().references(() => servicingRuns.runId),
  loanId: integer('loan_id').notNull().references(() => loans.id),
  investorId: integer('investor_id').notNull().references(() => investors.id),
  distributionDate: date('distribution_date').notNull(),
  ownershipPercentage: decimal('ownership_percentage', { precision: 8, scale: 6 }).notNull(),
  grossAmount: decimal('gross_amount', { precision: 12, scale: 2 }).notNull(),
  principalAmount: decimal('principal_amount', { precision: 12, scale: 2 }).notNull(),
  interestAmount: decimal('interest_amount', { precision: 12, scale: 2 }).notNull(),
  feesAmount: decimal('fees_amount', { precision: 12, scale: 2 }).notNull(),
  netAmount: decimal('net_amount', { precision: 12, scale: 2 }).notNull(),
  roundingAdjustment: decimal('rounding_adjustment', { precision: 6, scale: 4 }).default('0.00'),
  status: text('status', { enum: ['pending', 'processed', 'paid', 'failed'] }).notNull().default('pending'),
  paidAt: timestamp('paid_at'),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  loanInvestorIdx: index('investor_distributions_loan_investor_idx').on(table.loanId, table.investorId),
  runIdIdx: index('investor_distributions_run_id_idx').on(table.runId)
}));

// Escrow advance tracking
export const escrowAdvances = pgTable('escrow_advances', {
  id: serial('id').primaryKey(),
  loanId: integer('loan_id').notNull().references(() => loans.id),
  escrowAccountId: integer('escrow_account_id').references(() => escrowAccounts.id),
  advanceDate: date('advance_date').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  repaymentMonths: integer('repayment_months').notNull().default(12),
  monthlyRepayment: decimal('monthly_repayment', { precision: 12, scale: 2 }).notNull(),
  outstandingBalance: decimal('outstanding_balance', { precision: 12, scale: 2 }).notNull(),
  status: text('status', { enum: ['active', 'paid', 'written_off'] }).notNull().default('active'),
  paidOffDate: date('paid_off_date'),
  runId: text('run_id').references(() => servicingRuns.runId),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  loanIdIdx: index('escrow_advances_loan_id_idx').on(table.loanId),
  statusIdx: index('escrow_advances_status_idx').on(table.status)
}));

// ========================================
// MFA TABLES - Multi-Factor Authentication
// ========================================

// MFA factors for users (TOTP, SMS, etc.)
export const userMfaFactors = pgTable('user_mfa_factors', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  factorType: text('factor_type', { enum: ['totp', 'sms', 'email'] }).notNull(),
  factorName: text('factor_name').notNull(), // e.g., "iPhone Authenticator"
  // TOTP specific fields
  totpSecret: text('totp_secret'), // Encrypted at rest
  totpIssuer: text('totp_issuer').default('LoanServe Pro'),
  totpAlgorithm: text('totp_algorithm').default('SHA1'),
  totpDigits: integer('totp_digits').default(6),
  totpPeriod: integer('totp_period').default(30), // Time step in seconds
  // SMS/Email specific fields
  phoneNumber: text('phone_number'),
  emailAddress: text('email_address'),
  // Verification status
  verified: boolean('verified').default(false).notNull(),
  verifiedAt: timestamp('verified_at'),
  lastUsedAt: timestamp('last_used_at'),
  // Device trust
  trustedDevices: jsonb('trusted_devices').default('[]'), // Array of trusted device fingerprints
  // Metadata
  enrolledAt: timestamp('enrolled_at').notNull().defaultNow(),
  enrolledIp: text('enrolled_ip'),
  enrolledUserAgent: text('enrolled_user_agent'),
  isActive: boolean('is_active').default(true).notNull(),
  metadata: jsonb('metadata').default('{}')
}, (table) => ({
  userIdIdx: index('user_mfa_factors_user_id_idx').on(table.userId),
  factorTypeIdx: index('user_mfa_factors_factor_type_idx').on(table.factorType),
  activeIdx: index('user_mfa_factors_active_idx').on(table.isActive)
}));

// MFA backup codes
export const mfaBackupCodes = pgTable('mfa_backup_codes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(), // Hashed backup code
  usedAt: timestamp('used_at'),
  usedIp: text('used_ip'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at')
}, (table) => ({
  userIdIdx: index('mfa_backup_codes_user_id_idx').on(table.userId),
  codeHashIdx: uniqueIndex('mfa_backup_codes_code_hash_idx').on(table.codeHash)
}));

// MFA challenges (pending MFA verifications)
export const mfaChallenges = pgTable('mfa_challenges', {
  id: serial('id').primaryKey(),
  challengeId: text('challenge_id').notNull().unique(), // UUID for challenge
  userId: integer('user_id').notNull().references(() => users.id),
  sessionId: text('session_id'), // Session that initiated the challenge
  factorId: integer('factor_id').references(() => userMfaFactors.id),
  challengeType: text('challenge_type', { enum: ['login', 'step_up', 'enrollment'] }).notNull(),
  // Challenge details
  action: text('action'), // What action requires MFA (e.g., 'transfer_funds', 'change_password')
  requiredFactors: integer('required_factors').default(1), // Number of factors required
  completedFactors: integer('completed_factors').default(0),
  // Rate limiting
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(5),
  lastAttemptAt: timestamp('last_attempt_at'),
  lockedUntil: timestamp('locked_until'),
  // Status
  status: text('status', { enum: ['pending', 'verified', 'failed', 'expired'] }).notNull().default('pending'),
  verifiedAt: timestamp('verified_at'),
  // Metadata
  ip: text('ip'),
  userAgent: text('user_agent'),
  deviceFingerprint: text('device_fingerprint'),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull() // Challenge expiry (usually 5-10 minutes)
}, (table) => ({
  challengeIdIdx: uniqueIndex('mfa_challenges_challenge_id_idx').on(table.challengeId),
  userIdIdx: index('mfa_challenges_user_id_idx').on(table.userId),
  statusIdx: index('mfa_challenges_status_idx').on(table.status),
  expiresAtIdx: index('mfa_challenges_expires_at_idx').on(table.expiresAt)
}));

// MFA audit log for tracking all MFA events
export const mfaAuditLog = pgTable('mfa_audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  factorId: integer('factor_id').references(() => userMfaFactors.id),
  challengeId: text('challenge_id').references(() => mfaChallenges.challengeId),
  eventType: text('event_type').notNull(), // enrolled, verified, failed, disabled, backup_used, etc.
  eventDetails: jsonb('event_details').default('{}'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  deviceFingerprint: text('device_fingerprint'),
  success: boolean('success').notNull(),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  userIdIdx: index('mfa_audit_log_user_id_idx').on(table.userId),
  eventTypeIdx: index('mfa_audit_log_event_type_idx').on(table.eventType),
  createdAtIdx: index('mfa_audit_log_created_at_idx').on(table.createdAt)
}));

// Create insert schemas for servicing cycle tables
export const insertServicingRunSchema = createInsertSchema(servicingRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertServicingRun = z.infer<typeof insertServicingRunSchema>;
export type ServicingRun = typeof servicingRuns.$inferSelect;

export const insertServicingEventSchema = createInsertSchema(servicingEvents).omit({
  id: true,
  createdAt: true
});
export type InsertServicingEvent = z.infer<typeof insertServicingEventSchema>;
export type ServicingEvent = typeof servicingEvents.$inferSelect;

export const insertServicingExceptionSchema = createInsertSchema(servicingExceptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertServicingException = z.infer<typeof insertServicingExceptionSchema>;
export type ServicingException = typeof servicingExceptions.$inferSelect;

export const insertPaymentInboxSchema = createInsertSchema(paymentsInbox).omit({
  id: true,
  createdAt: true
});
export type InsertPaymentInbox = z.infer<typeof insertPaymentInboxSchema>;
export type PaymentInbox = typeof paymentsInbox.$inferSelect;

export const insertInterestAccrualSchema = createInsertSchema(interestAccruals).omit({
  id: true,
  createdAt: true
});
export type InsertInterestAccrual = z.infer<typeof insertInterestAccrualSchema>;
export type InterestAccrual = typeof interestAccruals.$inferSelect;

export const insertInvestorDistributionSchema = createInsertSchema(investorDistributions).omit({
  id: true,
  createdAt: true
});
export type InsertInvestorDistribution = z.infer<typeof insertInvestorDistributionSchema>;
export type InvestorDistribution = typeof investorDistributions.$inferSelect;

export const insertEscrowAdvanceSchema = createInsertSchema(escrowAdvances).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertEscrowAdvance = z.infer<typeof insertEscrowAdvanceSchema>;
export type EscrowAdvance = typeof escrowAdvances.$inferSelect;

// MFA schemas
export const insertUserMfaFactorSchema = createInsertSchema(userMfaFactors).omit({
  id: true,
  enrolledAt: true
});
export type InsertUserMfaFactor = z.infer<typeof insertUserMfaFactorSchema>;
export type UserMfaFactor = typeof userMfaFactors.$inferSelect;

export const insertMfaBackupCodeSchema = createInsertSchema(mfaBackupCodes).omit({
  id: true,
  createdAt: true
});
export type InsertMfaBackupCode = z.infer<typeof insertMfaBackupCodeSchema>;
export type MfaBackupCode = typeof mfaBackupCodes.$inferSelect;

export const insertMfaChallengeSchema = createInsertSchema(mfaChallenges).omit({
  id: true,
  createdAt: true
});
export type InsertMfaChallenge = z.infer<typeof insertMfaChallengeSchema>;
export type MfaChallenge = typeof mfaChallenges.$inferSelect;

export const insertMfaAuditLogSchema = createInsertSchema(mfaAuditLog).omit({
  id: true,
  createdAt: true
});
export type InsertMfaAuditLog = z.infer<typeof insertMfaAuditLogSchema>;
export type MfaAuditLog = typeof mfaAuditLog.$inferSelect;