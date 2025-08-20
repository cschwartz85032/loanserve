var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  auditLogs: () => auditLogs,
  borrowerEntities: () => borrowerEntities,
  collectionActivities: () => collectionActivities,
  collectionStatusEnum: () => collectionStatusEnum,
  disbursementPaymentMethodEnum: () => disbursementPaymentMethodEnum,
  disbursementStatusEnum: () => disbursementStatusEnum,
  disbursementTypeEnum: () => disbursementTypeEnum,
  documentCategoryEnum: () => documentCategoryEnum,
  documentTemplates: () => documentTemplates,
  documents: () => documents,
  entityTypeEnum: () => entityTypeEnum,
  escrowAccounts: () => escrowAccounts,
  escrowAdvances: () => escrowAdvances,
  escrowDisbursementPayments: () => escrowDisbursementPayments,
  escrowDisbursements: () => escrowDisbursements,
  escrowPayments: () => escrowPayments,
  escrowTransactions: () => escrowTransactions,
  feeTemplates: () => feeTemplates,
  frequencyEnum: () => frequencyEnum,
  guarantors: () => guarantors,
  insertAuditLogSchema: () => insertAuditLogSchema,
  insertBorrowerEntitySchema: () => insertBorrowerEntitySchema,
  insertCollectionActivitySchema: () => insertCollectionActivitySchema,
  insertDocumentSchema: () => insertDocumentSchema,
  insertDocumentTemplateSchema: () => insertDocumentTemplateSchema,
  insertEscrowAccountSchema: () => insertEscrowAccountSchema,
  insertEscrowAdvanceSchema: () => insertEscrowAdvanceSchema,
  insertEscrowDisbursementPaymentSchema: () => insertEscrowDisbursementPaymentSchema,
  insertEscrowDisbursementSchema: () => insertEscrowDisbursementSchema,
  insertEscrowPaymentSchema: () => insertEscrowPaymentSchema,
  insertEscrowTransactionSchema: () => insertEscrowTransactionSchema,
  insertFeeTemplateSchema: () => insertFeeTemplateSchema,
  insertGuarantorSchema: () => insertGuarantorSchema,
  insertInsurancePolicySchema: () => insertInsurancePolicySchema,
  insertInterestAccrualSchema: () => insertInterestAccrualSchema,
  insertInvestorDistributionSchema: () => insertInvestorDistributionSchema,
  insertInvestorSchema: () => insertInvestorSchema,
  insertLegalProceedingSchema: () => insertLegalProceedingSchema,
  insertLoanBorrowerSchema: () => insertLoanBorrowerSchema,
  insertLoanFeeSchema: () => insertLoanFeeSchema,
  insertLoanLedgerSchema: () => insertLoanLedgerSchema,
  insertLoanSchema: () => insertLoanSchema,
  insertNotificationSchema: () => insertNotificationSchema,
  insertPayeeSchema: () => insertPayeeSchema,
  insertPaymentInboxSchema: () => insertPaymentInboxSchema,
  insertPaymentScheduleSchema: () => insertPaymentScheduleSchema,
  insertPaymentSchema: () => insertPaymentSchema,
  insertPropertySchema: () => insertPropertySchema,
  insertServicingEventSchema: () => insertServicingEventSchema,
  insertServicingExceptionSchema: () => insertServicingExceptionSchema,
  insertServicingInstructionSchema: () => insertServicingInstructionSchema,
  insertServicingRunSchema: () => insertServicingRunSchema,
  insertSystemSettingSchema: () => insertSystemSettingSchema,
  insertTaskSchema: () => insertTaskSchema,
  insertUserSchema: () => insertUserSchema,
  insurancePolicies: () => insurancePolicies,
  interestAccruals: () => interestAccruals,
  investorDistributions: () => investorDistributions,
  investors: () => investors,
  legalProceedings: () => legalProceedings,
  loanBorrowers: () => loanBorrowers,
  loanFees: () => loanFees,
  loanLedger: () => loanLedger,
  loanStatusEnum: () => loanStatusEnum,
  loanTypeEnum: () => loanTypeEnum,
  loans: () => loans,
  loansRelations: () => loansRelations,
  notificationTypeEnum: () => notificationTypeEnum,
  notifications: () => notifications,
  payees: () => payees,
  paymentMethodEnum: () => paymentMethodEnum,
  paymentSchedule: () => paymentSchedule,
  paymentStatusEnum: () => paymentStatusEnum,
  payments: () => payments,
  paymentsInbox: () => paymentsInbox,
  priorityEnum: () => priorityEnum,
  properties: () => properties,
  propertyTypeEnum: () => propertyTypeEnum,
  servicingEvents: () => servicingEvents,
  servicingExceptions: () => servicingExceptions,
  servicingInstructions: () => servicingInstructions,
  servicingRuns: () => servicingRuns,
  systemSettings: () => systemSettings,
  tasks: () => tasks,
  transactionTypeEnum: () => transactionTypeEnum,
  userRoleEnum: () => userRoleEnum,
  users: () => users,
  usersRelations: () => usersRelations
});
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { pgTable, text, timestamp, integer, serial, boolean, jsonb, decimal, date, index, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
var userRoleEnum, loanStatusEnum, loanTypeEnum, propertyTypeEnum, entityTypeEnum, paymentStatusEnum, documentCategoryEnum, transactionTypeEnum, notificationTypeEnum, priorityEnum, frequencyEnum, disbursementTypeEnum, paymentMethodEnum, disbursementPaymentMethodEnum, disbursementStatusEnum, collectionStatusEnum, users, borrowerEntities, properties, loans, loanBorrowers, guarantors, investors, paymentSchedule, payments, escrowAccounts, escrowDisbursements, escrowDisbursementPayments, escrowTransactions, payees, documents, documentTemplates, servicingInstructions, collectionActivities, legalProceedings, feeTemplates, loanLedger, loanFees, insurancePolicies, auditLogs, notifications, tasks, systemSettings, usersRelations, loansRelations, insertUserSchema, insertBorrowerEntitySchema, insertPropertySchema, insertLoanSchema, insertLoanBorrowerSchema, insertGuarantorSchema, insertInvestorSchema, insertPaymentScheduleSchema, insertPaymentSchema, insertEscrowAccountSchema, insertEscrowDisbursementSchema, insertEscrowDisbursementPaymentSchema, insertEscrowTransactionSchema, insertPayeeSchema, insertDocumentSchema, insertDocumentTemplateSchema, insertServicingInstructionSchema, insertCollectionActivitySchema, insertLegalProceedingSchema, insertFeeTemplateSchema, insertLoanFeeSchema, insertLoanLedgerSchema, insertInsurancePolicySchema, insertAuditLogSchema, insertNotificationSchema, insertTaskSchema, insertSystemSettingSchema, escrowPayments, insertEscrowPaymentSchema, servicingRuns, servicingEvents, servicingExceptions, paymentsInbox, interestAccruals, investorDistributions, escrowAdvances, insertServicingRunSchema, insertServicingEventSchema, insertServicingExceptionSchema, insertPaymentInboxSchema, insertInterestAccrualSchema, insertInvestorDistributionSchema, insertEscrowAdvanceSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    userRoleEnum = pgEnum("user_role", [
      "lender",
      "borrower",
      "investor",
      "escrow_officer",
      "legal",
      "servicer",
      "admin"
    ]);
    loanStatusEnum = pgEnum("loan_status", [
      "application",
      "underwriting",
      "approved",
      "active",
      "current",
      "delinquent",
      "default",
      "forbearance",
      "modification",
      "foreclosure",
      "reo",
      "closed",
      "paid_off",
      "charged_off"
    ]);
    loanTypeEnum = pgEnum("loan_type", [
      "conventional",
      "fha",
      "va",
      "usda",
      "jumbo",
      "portfolio",
      "hard_money",
      "bridge",
      "construction",
      "commercial",
      "reverse_mortgage"
    ]);
    propertyTypeEnum = pgEnum("property_type", [
      "single_family",
      "condo",
      "townhouse",
      "multi_family",
      "manufactured",
      "commercial",
      "land",
      "mixed_use"
    ]);
    entityTypeEnum = pgEnum("entity_type", [
      "individual",
      "corporation",
      "llc",
      "partnership",
      "trust",
      "estate",
      "government"
    ]);
    paymentStatusEnum = pgEnum("payment_status", [
      "scheduled",
      "pending",
      "processing",
      "completed",
      "failed",
      "reversed",
      "partial",
      "late",
      "nsf",
      "waived"
    ]);
    documentCategoryEnum = pgEnum("document_category", [
      "loan_application",
      "loan_agreement",
      "promissory_note",
      "deed_of_trust",
      "mortgage",
      "security_agreement",
      "ucc_filing",
      "assignment",
      "modification",
      "forbearance_agreement",
      "insurance_policy",
      "tax_document",
      "escrow_statement",
      "title_report",
      "appraisal",
      "inspection",
      "financial_statement",
      "income_verification",
      "closing_disclosure",
      "settlement_statement",
      "reconveyance",
      "release",
      "legal_notice",
      "correspondence",
      "servicing_transfer",
      "compliance",
      "other"
    ]);
    transactionTypeEnum = pgEnum("transaction_type", [
      "deposit",
      "withdrawal",
      "transfer",
      "payment_principal",
      "payment_interest",
      "payment_escrow",
      "payment_fee",
      "payment_late_fee",
      "insurance_premium",
      "property_tax",
      "hoa_fee",
      "disbursement",
      "adjustment",
      "refund"
    ]);
    notificationTypeEnum = pgEnum("notification_type", [
      "payment_due",
      "payment_received",
      "payment_failed",
      "payment_late",
      "document_required",
      "document_received",
      "escrow_shortage",
      "escrow_surplus",
      "escrow_analysis",
      "insurance_expiring",
      "tax_due",
      "rate_change",
      "maturity_approaching",
      "system",
      "legal",
      "compliance"
    ]);
    priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent", "critical"]);
    frequencyEnum = pgEnum("frequency", [
      "once",
      "daily",
      "weekly",
      "bi_weekly",
      "semi_monthly",
      "monthly",
      "quarterly",
      "semi_annual",
      "annual"
    ]);
    disbursementTypeEnum = pgEnum("disbursement_type", [
      "taxes",
      "insurance",
      "hoa",
      "other"
    ]);
    paymentMethodEnum = pgEnum("payment_method", [
      "check",
      "ach",
      "wire",
      "cash",
      "credit_card",
      "online"
    ]);
    disbursementPaymentMethodEnum = pgEnum("disbursement_payment_method", [
      "check",
      "ach",
      "wire"
    ]);
    disbursementStatusEnum = pgEnum("disbursement_status", [
      "active",
      "on_hold",
      "suspended",
      "cancelled",
      "completed",
      "terminated"
      // For historical records that are no longer active (e.g., old insurance policies)
    ]);
    collectionStatusEnum = pgEnum("collection_status", [
      "current",
      "contact_made",
      "promise_to_pay",
      "arrangement_made",
      "broken_promise",
      "skip_trace",
      "legal_review",
      "foreclosure_initiated",
      "charge_off_pending"
    ]);
    users = pgTable("users", {
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
      country: text("country").default("USA"),
      dateOfBirth: date("date_of_birth"),
      ssn: text("ssn"),
      // Encrypted
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
      lockedUntil: timestamp("locked_until")
    }, (table) => {
      return {
        emailIdx: index("user_email_idx").on(table.email),
        roleIdx: index("user_role_idx").on(table.role),
        activeIdx: index("user_active_idx").on(table.isActive)
      };
    });
    borrowerEntities = pgTable("borrower_entities", {
      id: serial("id").primaryKey(),
      entityType: entityTypeEnum("entity_type").notNull(),
      // Individual fields
      firstName: text("first_name"),
      lastName: text("last_name"),
      middleName: text("middle_name"),
      suffix: text("suffix"),
      dateOfBirth: date("date_of_birth"),
      ssn: text("ssn"),
      // Encrypted
      // Entity fields
      entityName: text("entity_name"),
      ein: text("ein"),
      // Employer Identification Number
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
      mailingCountry: text("mailing_country").default("USA"),
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
      verificationStatus: text("verification_status").default("pending"),
      verificationDate: timestamp("verification_date"),
      notes: text("notes"),
      metadata: jsonb("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        entityTypeIdx: index("borrower_entity_type_idx").on(table.entityType),
        emailIdx: index("borrower_email_idx").on(table.email),
        ssnIdx: index("borrower_ssn_idx").on(table.ssn),
        einIdx: index("borrower_ein_idx").on(table.ein)
      };
    });
    properties = pgTable("properties", {
      id: serial("id").primaryKey(),
      propertyType: propertyTypeEnum("property_type").notNull(),
      // Address
      address: text("address").notNull(),
      address2: text("address_2"),
      city: text("city").notNull(),
      state: text("state").notNull(),
      zipCode: text("zip_code").notNull(),
      county: text("county"),
      country: text("country").default("USA"),
      // Legal description
      legalDescription: text("legal_description"),
      apn: text("apn"),
      // Assessor's Parcel Number
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
      occupancyStatus: text("occupancy_status"),
      // 'owner_occupied', 'rental', 'second_home', 'vacant'
      rentalIncome: decimal("rental_income", { precision: 10, scale: 2 }),
      primaryResidence: boolean("primary_residence").default(false),
      metadata: jsonb("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        apnIdx: index("property_apn_idx").on(table.apn),
        addressIdx: index("property_address_idx").on(table.address, table.city, table.state),
        typeIdx: index("property_type_idx").on(table.propertyType)
      };
    });
    loans = pgTable("loans", {
      id: serial("id").primaryKey(),
      loanNumber: text("loan_number").unique().notNull(),
      loanType: loanTypeEnum("loan_type").notNull(),
      loanPurpose: text("loan_purpose"),
      // 'purchase', 'refinance', 'cash_out', 'construction'
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
      rateType: text("rate_type").notNull(),
      // 'fixed', 'variable', 'adjustable'
      indexType: text("index_type"),
      // 'SOFR', 'prime', 'LIBOR'
      margin: decimal("margin", { precision: 6, scale: 4 }),
      rateAdjustmentFrequency: integer("rate_adjustment_frequency"),
      // months
      rateCapInitial: decimal("rate_cap_initial", { precision: 6, scale: 4 }),
      rateCapPeriodic: decimal("rate_cap_periodic", { precision: 6, scale: 4 }),
      rateCapLifetime: decimal("rate_cap_lifetime", { precision: 6, scale: 4 }),
      rateFloor: decimal("rate_floor", { precision: 6, scale: 4 }),
      // Terms
      loanTerm: integer("loan_term").notNull(),
      // months
      amortizationTerm: integer("amortization_term"),
      // months
      balloonMonths: integer("balloon_months"),
      balloonAmount: decimal("balloon_amount", { precision: 15, scale: 2 }),
      prepaymentPenalty: boolean("prepayment_penalty").default(false),
      prepaymentPenaltyTerm: integer("prepayment_penalty_term"),
      // months
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
      paymentFrequency: frequencyEnum("payment_frequency").default("monthly").notNull(),
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
      servicingFeeType: text("servicing_fee_type"),
      // 'fixed' or 'percentage'
      lateCharge: decimal("late_charge", { precision: 10, scale: 2 }),
      lateChargeType: text("late_charge_type"),
      // 'fixed' or 'percentage'
      feePayer: text("fee_payer"),
      // 'B', 'S', 'SP'
      gracePeriodDays: integer("grace_period_days"),
      investorLoanNumber: text("investor_loan_number"),
      poolNumber: text("pool_number"),
      // Compliance
      hmda: boolean("hmda").default(false),
      hoepa: boolean("hoepa").default(false),
      qm: boolean("qm").default(false),
      // Qualified Mortgage
      // Borrower Information (basic contact info stored in loan for quick access)
      borrowerName: text("borrower_name"),
      borrowerCompanyName: text("borrower_company_name"),
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
      servicingFee: decimal("servicing_fee", { precision: 10, scale: 2 }),
      // Additional payment fields for UI compatibility
      propertyTax: decimal("property_tax", { precision: 10, scale: 2 }),
      homeInsurance: decimal("home_insurance", { precision: 10, scale: 2 }),
      pmi: decimal("pmi", { precision: 10, scale: 2 }),
      otherMonthly: decimal("other_monthly", { precision: 10, scale: 2 }),
      // Additional fields  
      notes: text("notes"),
      metadata: jsonb("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanNumberIdx: uniqueIndex("loan_number_idx").on(table.loanNumber),
        statusIdx: index("loan_status_idx").on(table.status),
        propertyIdx: index("loan_property_idx").on(table.propertyId),
        maturityIdx: index("loan_maturity_idx").on(table.maturityDate),
        nextPaymentIdx: index("loan_next_payment_idx").on(table.nextPaymentDate)
      };
    });
    loanBorrowers = pgTable("loan_borrowers", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      borrowerId: integer("borrower_id").references(() => borrowerEntities.id).notNull(),
      borrowerType: text("borrower_type").notNull(),
      // 'primary', 'co_borrower', 'guarantor'
      ownershipPercentage: decimal("ownership_percentage", { precision: 8, scale: 6 }),
      // Aligned with investors table for precise splits
      signingAuthority: boolean("signing_authority").default(true),
      liabilityPercentage: decimal("liability_percentage", { precision: 5, scale: 2 }),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanBorrowerIdx: uniqueIndex("loan_borrower_idx").on(table.loanId, table.borrowerId),
        loanIdx: index("loan_borrowers_loan_idx").on(table.loanId),
        borrowerIdx: index("loan_borrowers_borrower_idx").on(table.borrowerId)
      };
    });
    guarantors = pgTable("guarantors", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      guarantorEntityId: integer("guarantor_entity_id").references(() => borrowerEntities.id).notNull(),
      guaranteeAmount: decimal("guarantee_amount", { precision: 15, scale: 2 }),
      guaranteePercentage: decimal("guarantee_percentage", { precision: 5, scale: 2 }),
      guaranteeType: text("guarantee_type"),
      // 'full', 'limited', 'payment', 'collection'
      startDate: date("start_date"),
      endDate: date("end_date"),
      isActive: boolean("is_active").default(true),
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("guarantor_loan_idx").on(table.loanId),
        entityIdx: index("guarantor_entity_idx").on(table.guarantorEntityId)
      };
    });
    investors = pgTable("investors", {
      id: serial("id").primaryKey(),
      investorId: text("investor_id").unique().notNull(),
      // Unique investor identifier
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      // Investor details
      entityType: entityTypeEnum("entity_type").notNull(),
      // 'individual' or 'entity'
      name: text("name").notNull(),
      // Individual or entity name
      contactName: text("contact_name"),
      // Contact person if entity
      ssnOrEin: text("ssn_or_ein"),
      // SSN for individuals or EIN for entities
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
      accountNumber: text("account_number"),
      // Encrypted
      routingNumber: text("routing_number"),
      accountType: text("account_type"),
      // 'checking', 'savings'
      // Ownership
      ownershipPercentage: decimal("ownership_percentage", { precision: 8, scale: 6 }).notNull(),
      // 0.000000 to 99.999999 for precise splits
      investmentAmount: decimal("investment_amount", { precision: 15, scale: 2 }),
      investmentDate: date("investment_date"),
      // Status
      isActive: boolean("is_active").default(true).notNull(),
      notes: text("notes"),
      metadata: jsonb("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("investor_loan_idx").on(table.loanId),
        investorIdIdx: uniqueIndex("investor_id_idx").on(table.investorId),
        activeIdx: index("investor_active_idx").on(table.isActive)
      };
    });
    paymentSchedule = pgTable("payment_schedule", {
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanPaymentIdx: uniqueIndex("schedule_loan_payment_idx").on(table.loanId, table.paymentNumber),
        dueDateIdx: index("schedule_due_date_idx").on(table.dueDate)
      };
    });
    payments = pgTable("payments", {
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
      paymentMethod: text("payment_method"),
      // 'check', 'ach', 'wire', 'cash', 'credit_card'
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("payment_loan_idx").on(table.loanId),
        dueDateIdx: index("payment_due_date_idx").on(table.dueDate),
        effectiveDateIdx: index("payment_effective_date_idx").on(table.effectiveDate),
        statusIdx: index("payment_status_idx").on(table.status),
        batchIdx: index("payment_batch_idx").on(table.batchId)
      };
    });
    escrowAccounts = pgTable("escrow_accounts", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id).unique().notNull(),
      accountNumber: text("account_number").unique().notNull(),
      // Balances
      currentBalance: decimal("current_balance", { precision: 12, scale: 2 }).default("0").notNull(),
      availableBalance: decimal("available_balance", { precision: 12, scale: 2 }).default("0"),
      pendingDeposits: decimal("pending_deposits", { precision: 12, scale: 2 }).default("0"),
      pendingDisbursements: decimal("pending_disbursements", { precision: 12, scale: 2 }).default("0"),
      // Requirements
      monthlyPayment: decimal("monthly_payment", { precision: 10, scale: 2 }).default("0"),
      minimumBalance: decimal("minimum_balance", { precision: 10, scale: 2 }).default("0"),
      cushionAmount: decimal("cushion_amount", { precision: 10, scale: 2 }).default("0"),
      targetBalance: decimal("target_balance", { precision: 12, scale: 2 }).default("0"),
      // Analysis
      projectedLowestBalance: decimal("projected_lowest_balance", { precision: 12, scale: 2 }),
      projectedLowestMonth: text("projected_lowest_month"),
      shortageAmount: decimal("shortage_amount", { precision: 10, scale: 2 }).default("0"),
      surplusAmount: decimal("surplus_amount", { precision: 10, scale: 2 }).default("0"),
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        accountNumberIdx: uniqueIndex("escrow_account_number_idx").on(table.accountNumber),
        loanIdx: uniqueIndex("escrow_loan_idx").on(table.loanId),
        activeIdx: index("escrow_active_idx").on(table.isActive)
      };
    });
    escrowDisbursements = pgTable("escrow_disbursements", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
      // Disbursement classification
      disbursementType: disbursementTypeEnum("disbursement_type").notNull(),
      description: text("description").notNull(),
      category: text("category"),
      // subcategory within type
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
      parcelNumber: text("parcel_number"),
      // For property taxes
      // Insurance-specific fields
      policyNumber: text("policy_number"),
      // For insurance
      insuredName: text("insured_name"),
      // Name of the insured party
      insuranceCompanyName: text("insurance_company_name"),
      // Insurance company name
      policyDescription: text("policy_description"),
      // Type of insurance (Hazard, Flood, etc.)
      policyExpirationDate: date("policy_expiration_date"),
      // Policy expiration date
      coverageAmount: decimal("coverage_amount", { precision: 12, scale: 2 }),
      // Coverage amount in dollars
      // Insurance property information
      insurancePropertyAddress: text("insurance_property_address"),
      // Property covered by insurance
      insurancePropertyCity: text("insurance_property_city"),
      insurancePropertyState: text("insurance_property_state"),
      insurancePropertyZipCode: text("insurance_property_zip_code"),
      // Insurance agent information
      agentName: text("agent_name"),
      // Insurance agent's name
      agentBusinessAddress: text("agent_business_address"),
      // Agent's business address
      agentCity: text("agent_city"),
      agentState: text("agent_state"),
      agentZipCode: text("agent_zip_code"),
      agentPhone: text("agent_phone"),
      // Agent's phone number
      agentFax: text("agent_fax"),
      // Agent's fax number
      agentEmail: text("agent_email"),
      // Agent's email
      // Insurance document reference
      insuranceDocumentId: integer("insurance_document_id").references(() => documents.id),
      // Link to uploaded insurance document
      insuranceTracking: boolean("insurance_tracking").default(true),
      // Active insurance tracking status
      // Payment method and banking information
      paymentMethod: disbursementPaymentMethodEnum("payment_method").notNull().default("check"),
      bankAccountNumber: text("bank_account_number"),
      // Encrypted - replaces accountNumber
      achRoutingNumber: text("ach_routing_number"),
      wireRoutingNumber: text("wire_routing_number"),
      accountType: text("account_type"),
      // 'checking', 'savings'
      bankName: text("bank_name"),
      wireInstructions: text("wire_instructions"),
      // Remittance information
      remittanceAddress: text("remittance_address"),
      remittanceCity: text("remittance_city"),
      remittanceState: text("remittance_state"),
      remittanceZipCode: text("remittance_zip_code"),
      accountNumber: text("account_number"),
      // For taxes - property tax account number
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
      specificDueDates: jsonb("specific_due_dates"),
      // For taxes with specific bi-annual dates
      // Status and holds
      status: disbursementStatusEnum("status").notNull().default("active"),
      isOnHold: boolean("is_on_hold").default(false).notNull(),
      holdReason: text("hold_reason"),
      holdRequestedBy: text("hold_requested_by"),
      holdDate: timestamp("hold_date"),
      // Auto-pay settings
      autoPayEnabled: boolean("auto_pay_enabled").default(true),
      daysBeforeDue: integer("days_before_due").default(10),
      // How many days before due date to pay
      // Additional tracking
      notes: text("notes"),
      metadata: jsonb("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("escrow_disb_loan_idx").on(table.loanId),
        accountIdx: index("escrow_disb_account_idx").on(table.escrowAccountId),
        typeIdx: index("escrow_disb_type_idx").on(table.disbursementType),
        nextDueIdx: index("escrow_disb_next_due_idx").on(table.nextDueDate),
        statusIdx: index("escrow_disb_status_idx").on(table.status),
        holdIdx: index("escrow_disb_hold_idx").on(table.isOnHold)
      };
    });
    escrowDisbursementPayments = pgTable("escrow_disbursement_payments", {
      id: serial("id").primaryKey(),
      disbursementId: integer("disbursement_id").references(() => escrowDisbursements.id).notNull(),
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      ledgerEntryId: integer("ledger_entry_id"),
      // References accounting ledger entry
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
      status: paymentStatusEnum("status").notNull().default("scheduled"),
      confirmationNumber: text("confirmation_number"),
      // Processing
      processedBy: integer("processed_by").references(() => users.id),
      processedDate: timestamp("processed_date"),
      // Additional
      notes: text("notes"),
      metadata: jsonb("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        disbursementIdx: index("escrow_payment_disbursement_idx").on(table.disbursementId),
        loanIdx: index("escrow_payment_loan_idx").on(table.loanId),
        dueDateIdx: index("escrow_payment_due_date_idx").on(table.dueDate),
        statusIdx: index("escrow_payment_status_idx").on(table.status)
      };
    });
    escrowTransactions = pgTable("escrow_transactions", {
      id: serial("id").primaryKey(),
      escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id).notNull(),
      escrowItemId: integer("escrow_item_id"),
      // References escrow item
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        accountIdx: index("escrow_trans_account_idx").on(table.escrowAccountId),
        dateIdx: index("escrow_trans_date_idx").on(table.transactionDate),
        typeIdx: index("escrow_trans_type_idx").on(table.transactionType)
      };
    });
    payees = pgTable("payees", {
      id: serial("id").primaryKey(),
      payeeType: text("payee_type").notNull(),
      // 'tax_authority', 'insurance_company', 'hoa', 'utility', 'other'
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
      country: text("country").default("USA"),
      // Payment information
      paymentMethod: text("payment_method"),
      // 'check', 'ach', 'wire'
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        nameIdx: index("payee_name_idx").on(table.name),
        typeIdx: index("payee_type_idx").on(table.payeeType),
        activeIdx: index("payee_active_idx").on(table.isActive)
      };
    });
    documents = pgTable("documents", {
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
      notes: text("notes"),
      // Store AI extraction JSON or other notes
      metadata: jsonb("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("document_loan_idx").on(table.loanId),
        borrowerIdx: index("document_borrower_idx").on(table.borrowerId),
        categoryIdx: index("document_category_idx").on(table.category),
        uploadedByIdx: index("document_uploaded_by_idx").on(table.uploadedBy),
        documentDateIdx: index("document_date_idx").on(table.documentDate)
      };
    });
    documentTemplates = pgTable("document_templates", {
      id: serial("id").primaryKey(),
      name: text("name").notNull(),
      category: documentCategoryEnum("category").notNull(),
      description: text("description"),
      templateContent: text("template_content"),
      templateUrl: text("template_url"),
      variables: jsonb("variables"),
      // List of merge fields
      isActive: boolean("is_active").default(true),
      createdBy: integer("created_by").references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    servicingInstructions = pgTable("servicing_instructions", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      instructionType: text("instruction_type").notNull(),
      // 'payment', 'escrow', 'collection', 'reporting'
      priority: priorityEnum("priority").default("medium"),
      effectiveDate: date("effective_date").notNull(),
      expirationDate: date("expiration_date"),
      instructions: text("instructions").notNull(),
      isActive: boolean("is_active").default(true),
      createdBy: integer("created_by").references(() => users.id),
      approvedBy: integer("approved_by").references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("servicing_loan_idx").on(table.loanId),
        typeIdx: index("servicing_type_idx").on(table.instructionType),
        activeIdx: index("servicing_active_idx").on(table.isActive)
      };
    });
    collectionActivities = pgTable("collection_activities", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      activityDate: timestamp("activity_date").defaultNow().notNull(),
      activityType: text("activity_type").notNull(),
      // 'call', 'letter', 'email', 'visit', 'legal'
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("collection_loan_idx").on(table.loanId),
        dateIdx: index("collection_date_idx").on(table.activityDate),
        statusIdx: index("collection_status_idx").on(table.status)
      };
    });
    legalProceedings = pgTable("legal_proceedings", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      proceedingType: text("proceeding_type").notNull(),
      // 'foreclosure', 'bankruptcy', 'litigation', 'eviction'
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("legal_loan_idx").on(table.loanId),
        typeIdx: index("legal_type_idx").on(table.proceedingType),
        caseIdx: index("legal_case_idx").on(table.caseNumber)
      };
    });
    feeTemplates = pgTable("fee_templates", {
      id: serial("id").primaryKey(),
      lenderId: integer("lender_id").references(() => users.id).notNull(),
      templateName: text("template_name").notNull(),
      description: text("description"),
      isDefault: boolean("is_default").default(false),
      fees: jsonb("fees").notNull(),
      // Array of fee definitions
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        lenderIdx: index("fee_template_lender_idx").on(table.lenderId),
        defaultIdx: index("fee_template_default_idx").on(table.isDefault)
      };
    });
    loanLedger = pgTable("loan_ledger", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      transactionDate: timestamp("transaction_date").notNull(),
      transactionId: text("transaction_id").notNull().unique(),
      description: text("description").notNull(),
      transactionType: text("transaction_type").notNull(),
      // 'principal', 'interest', 'fee', 'payment', 'escrow', 'penalty', 'reversal'
      category: text("category"),
      // 'origination', 'servicing', 'late_fee', 'nsf', 'modification', 'payoff', 'recording', etc.
      debitAmount: decimal("debit_amount", { precision: 12, scale: 2 }),
      creditAmount: decimal("credit_amount", { precision: 12, scale: 2 }),
      runningBalance: decimal("running_balance", { precision: 12, scale: 2 }).notNull(),
      principalBalance: decimal("principal_balance", { precision: 12, scale: 2 }).notNull(),
      interestBalance: decimal("interest_balance", { precision: 12, scale: 2 }).default("0"),
      status: text("status").notNull().default("posted"),
      // 'pending', 'posted', 'pending_approval', 'reversed'
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("ledger_loan_idx").on(table.loanId),
        dateIdx: index("ledger_date_idx").on(table.transactionDate),
        statusIdx: index("ledger_status_idx").on(table.status),
        typeIdx: index("ledger_type_idx").on(table.transactionType)
      };
    });
    loanFees = pgTable("loan_fees", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id).notNull(),
      feeType: text("fee_type").notNull(),
      // 'origination', 'servicing', 'late', 'nsf', 'modification', 'payoff', 'recording', etc.
      feeName: text("fee_name").notNull(),
      feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }).notNull(),
      feePercentage: decimal("fee_percentage", { precision: 5, scale: 3 }),
      // For percentage-based fees
      frequency: text("frequency"),
      // 'one-time', 'monthly', 'quarterly', 'annual'
      chargeDate: date("charge_date"),
      dueDate: date("due_date"),
      paidDate: date("paid_date"),
      waived: boolean("waived").default(false),
      waivedBy: integer("waived_by").references(() => users.id),
      waivedReason: text("waived_reason"),
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("loan_fee_loan_idx").on(table.loanId),
        typeIdx: index("loan_fee_type_idx").on(table.feeType),
        dueDateIdx: index("loan_fee_due_date_idx").on(table.dueDate)
      };
    });
    insurancePolicies = pgTable("insurance_policies", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").references(() => loans.id),
      propertyId: integer("property_id").references(() => properties.id).notNull(),
      policyType: text("policy_type").notNull(),
      // 'hazard', 'flood', 'earthquake', 'wind', 'liability'
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        loanIdx: index("insurance_loan_idx").on(table.loanId),
        propertyIdx: index("insurance_property_idx").on(table.propertyId),
        policyNumberIdx: index("insurance_policy_number_idx").on(table.policyNumber),
        expirationIdx: index("insurance_expiration_idx").on(table.expirationDate)
      };
    });
    auditLogs = pgTable("audit_logs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id),
      loanId: integer("loan_id").references(() => loans.id),
      entityType: text("entity_type").notNull(),
      entityId: integer("entity_id").notNull(),
      action: text("action").notNull(),
      // 'create', 'update', 'delete', 'view', 'export'
      previousValues: jsonb("previous_values"),
      newValues: jsonb("new_values"),
      changedFields: text("changed_fields").array(),
      ipAddress: text("ip_address"),
      userAgent: text("user_agent"),
      sessionId: text("session_id"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        userIdx: index("audit_user_idx").on(table.userId),
        entityIdx: index("audit_entity_idx").on(table.entityType, table.entityId),
        createdAtIdx: index("audit_created_at_idx").on(table.createdAt)
      };
    });
    notifications = pgTable("notifications", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      type: notificationTypeEnum("type").notNull(),
      priority: priorityEnum("priority").default("medium").notNull(),
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        userIdx: index("notification_user_idx").on(table.userId),
        readIdx: index("notification_is_read_idx").on(table.isRead),
        typeIdx: index("notification_type_idx").on(table.type),
        createdAtIdx: index("notification_created_idx").on(table.createdAt)
      };
    });
    tasks = pgTable("tasks", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      description: text("description"),
      taskType: text("task_type").notNull(),
      // 'review', 'approval', 'processing', 'verification'
      priority: priorityEnum("priority").default("medium"),
      status: text("status").notNull(),
      // 'pending', 'in_progress', 'completed', 'cancelled'
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        assignedToIdx: index("task_assigned_to_idx").on(table.assignedTo),
        statusIdx: index("task_status_idx").on(table.status),
        dueDateIdx: index("task_due_date_idx").on(table.dueDate),
        loanIdx: index("task_loan_idx").on(table.loanId)
      };
    });
    systemSettings = pgTable("system_settings", {
      id: serial("id").primaryKey(),
      category: text("category").notNull(),
      key: text("key").notNull(),
      value: jsonb("value").notNull(),
      description: text("description"),
      isEditable: boolean("is_editable").default(true),
      updatedBy: integer("updated_by").references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        categoryKeyIdx: uniqueIndex("settings_category_key_idx").on(table.category, table.key)
      };
    });
    usersRelations = relations(users, ({ many }) => ({
      loansAsLender: many(loans),
      loansAsServicer: many(loans),
      documentsUploaded: many(documents),
      notifications: many(notifications),
      auditLogs: many(auditLogs),
      tasks: many(tasks)
    }));
    loansRelations = relations(loans, ({ one, many }) => ({
      property: one(properties, {
        fields: [loans.propertyId],
        references: [properties.id]
      }),
      lender: one(users, {
        fields: [loans.lenderId],
        references: [users.id]
      }),
      servicer: one(users, {
        fields: [loans.servicerId],
        references: [users.id]
      }),
      investor: one(users, {
        fields: [loans.investorId],
        references: [users.id]
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
      tasks: many(tasks)
    }));
    insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
    insertBorrowerEntitySchema = createInsertSchema(borrowerEntities).omit({ id: true, createdAt: true, updatedAt: true });
    insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true, updatedAt: true });
    insertLoanSchema = createInsertSchema(loans).omit({ id: true, createdAt: true, updatedAt: true });
    insertLoanBorrowerSchema = createInsertSchema(loanBorrowers).omit({ id: true, createdAt: true });
    insertGuarantorSchema = createInsertSchema(guarantors).omit({ id: true, createdAt: true, updatedAt: true });
    insertInvestorSchema = createInsertSchema(investors).omit({ id: true, createdAt: true, updatedAt: true });
    insertPaymentScheduleSchema = createInsertSchema(paymentSchedule).omit({ id: true, createdAt: true });
    insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true });
    insertEscrowAccountSchema = createInsertSchema(escrowAccounts).omit({ id: true, createdAt: true, updatedAt: true });
    insertEscrowDisbursementSchema = createInsertSchema(escrowDisbursements).omit({ id: true, createdAt: true, updatedAt: true }).extend({
      paymentMethod: z.enum(["check", "ach", "wire"])
    });
    insertEscrowDisbursementPaymentSchema = createInsertSchema(escrowDisbursementPayments).omit({ id: true, createdAt: true });
    insertEscrowTransactionSchema = createInsertSchema(escrowTransactions).omit({ id: true, createdAt: true });
    insertPayeeSchema = createInsertSchema(payees).omit({ id: true, createdAt: true, updatedAt: true });
    insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
    insertDocumentTemplateSchema = createInsertSchema(documentTemplates).omit({ id: true, createdAt: true, updatedAt: true });
    insertServicingInstructionSchema = createInsertSchema(servicingInstructions).omit({ id: true, createdAt: true, updatedAt: true });
    insertCollectionActivitySchema = createInsertSchema(collectionActivities).omit({ id: true, createdAt: true });
    insertLegalProceedingSchema = createInsertSchema(legalProceedings).omit({ id: true, createdAt: true, updatedAt: true });
    insertFeeTemplateSchema = createInsertSchema(feeTemplates).omit({ id: true, createdAt: true, updatedAt: true });
    insertLoanFeeSchema = createInsertSchema(loanFees).omit({ id: true, createdAt: true, updatedAt: true });
    insertLoanLedgerSchema = createInsertSchema(loanLedger).omit({ id: true, createdAt: true, updatedAt: true });
    insertInsurancePolicySchema = createInsertSchema(insurancePolicies).omit({ id: true, createdAt: true, updatedAt: true });
    insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
    insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
    insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
    insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, createdAt: true, updatedAt: true });
    escrowPayments = escrowTransactions;
    insertEscrowPaymentSchema = insertEscrowTransactionSchema;
    servicingRuns = pgTable("servicing_runs", {
      id: serial("id").primaryKey(),
      runId: text("run_id").notNull().unique(),
      valuationDate: date("valuation_date").notNull(),
      startTime: timestamp("start_time").notNull().defaultNow(),
      endTime: timestamp("end_time"),
      status: text("status", { enum: ["pending", "running", "completed", "failed", "cancelled"] }).notNull().default("pending"),
      loansProcessed: integer("loans_processed").notNull().default(0),
      totalLoans: integer("total_loans").notNull().default(0),
      eventsCreated: integer("events_created").notNull().default(0),
      exceptionsCreated: integer("exceptions_created").notNull().default(0),
      totalDisbursedBeneficiary: decimal("total_disbursed_beneficiary", { precision: 12, scale: 2 }).default("0.00"),
      totalDisbursedInvestors: decimal("total_disbursed_investors", { precision: 12, scale: 2 }).default("0.00"),
      reconciliationStatus: text("reconciliation_status", { enum: ["pending", "balanced", "imbalanced"] }).default("pending"),
      inputHash: text("input_hash"),
      errors: text("errors").array(),
      dryRun: boolean("dry_run").notNull().default(false),
      loanIds: text("loan_ids").array(),
      createdBy: integer("created_by").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    servicingEvents = pgTable("servicing_events", {
      id: serial("id").primaryKey(),
      runId: text("run_id").notNull().references(() => servicingRuns.runId),
      eventKey: text("event_key").notNull(),
      eventType: text("event_type").notNull(),
      // interest_accrual, assess_due, late_fee, post_payment, distribute_investors, etc.
      loanId: integer("loan_id").references(() => loans.id),
      timestamp: timestamp("timestamp").notNull().defaultNow(),
      valuationDate: date("valuation_date").notNull(),
      amount: decimal("amount", { precision: 12, scale: 2 }),
      principal: decimal("principal", { precision: 12, scale: 2 }),
      interest: decimal("interest", { precision: 12, scale: 2 }),
      escrow: decimal("escrow", { precision: 12, scale: 2 }),
      fees: decimal("fees", { precision: 12, scale: 2 }),
      details: jsonb("details").notNull().default("{}"),
      status: text("status", { enum: ["success", "failed", "pending"] }).notNull().default("pending"),
      errorMessage: text("error_message"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => ({
      uniqueEventKey: uniqueIndex("unique_event_key").on(table.valuationDate, table.eventKey),
      loanIdIdx: index("servicing_events_loan_id_idx").on(table.loanId),
      runIdIdx: index("servicing_events_run_id_idx").on(table.runId),
      eventTypeIdx: index("servicing_events_type_idx").on(table.eventType)
    }));
    servicingExceptions = pgTable("servicing_exceptions", {
      id: serial("id").primaryKey(),
      runId: text("run_id").references(() => servicingRuns.runId),
      loanId: integer("loan_id").references(() => loans.id),
      severity: text("severity", { enum: ["low", "medium", "high", "critical"] }).notNull(),
      type: text("type").notNull(),
      // insufficient_escrow, missing_payment, data_anomaly, etc.
      message: text("message").notNull(),
      suggestedAction: text("suggested_action"),
      dueDate: date("due_date"),
      status: text("status", { enum: ["open", "resolved", "escalated"] }).notNull().default("open"),
      resolvedBy: integer("resolved_by").references(() => users.id),
      resolvedAt: timestamp("resolved_at"),
      resolutionNotes: text("resolution_notes"),
      metadata: jsonb("metadata").default("{}"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      loanIdIdx: index("servicing_exceptions_loan_id_idx").on(table.loanId),
      statusIdx: index("servicing_exceptions_status_idx").on(table.status),
      severityIdx: index("servicing_exceptions_severity_idx").on(table.severity)
    }));
    paymentsInbox = pgTable("payments_inbox", {
      id: serial("id").primaryKey(),
      referenceNumber: text("reference_number").unique(),
      valueDate: date("value_date").notNull(),
      amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
      borrowerId: integer("borrower_id").references(() => borrowerEntities.id),
      loanId: integer("loan_id").references(() => loans.id),
      matchedBy: text("matched_by"),
      // loan_id_memo, borrower_id, reference_number, etc.
      matchConfidence: decimal("match_confidence", { precision: 3, scale: 2 }),
      // 0.00 to 1.00
      status: text("status", { enum: ["unmatched", "matched", "processed", "suspense", "rejected"] }).notNull().default("unmatched"),
      processedAt: timestamp("processed_at"),
      processedByRunId: text("processed_by_run_id").references(() => servicingRuns.runId),
      metadata: jsonb("metadata").default("{}"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => ({
      loanIdIdx: index("payments_inbox_loan_id_idx").on(table.loanId),
      statusIdx: index("payments_inbox_status_idx").on(table.status),
      valueDateIdx: index("payments_inbox_value_date_idx").on(table.valueDate)
    }));
    interestAccruals = pgTable("interest_accruals", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").notNull().references(() => loans.id),
      accrualDate: date("accrual_date").notNull(),
      fromDate: date("from_date").notNull(),
      toDate: date("to_date").notNull(),
      dayCount: integer("day_count").notNull(),
      dayCountConvention: text("day_count_convention").notNull(),
      // ACT/365, 30/360, etc.
      interestRate: decimal("interest_rate", { precision: 8, scale: 4 }).notNull(),
      principalBalance: decimal("principal_balance", { precision: 12, scale: 2 }).notNull(),
      dailyRate: decimal("daily_rate", { precision: 12, scale: 10 }).notNull(),
      accruedAmount: decimal("accrued_amount", { precision: 12, scale: 2 }).notNull(),
      runId: text("run_id").references(() => servicingRuns.runId),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => ({
      uniqueAccrual: uniqueIndex("unique_accrual").on(table.loanId, table.accrualDate),
      loanIdIdx: index("interest_accruals_loan_id_idx").on(table.loanId)
    }));
    investorDistributions = pgTable("investor_distributions", {
      id: serial("id").primaryKey(),
      runId: text("run_id").notNull().references(() => servicingRuns.runId),
      loanId: integer("loan_id").notNull().references(() => loans.id),
      investorId: integer("investor_id").notNull().references(() => investors.id),
      distributionDate: date("distribution_date").notNull(),
      ownershipPercentage: decimal("ownership_percentage", { precision: 8, scale: 6 }).notNull(),
      grossAmount: decimal("gross_amount", { precision: 12, scale: 2 }).notNull(),
      principalAmount: decimal("principal_amount", { precision: 12, scale: 2 }).notNull(),
      interestAmount: decimal("interest_amount", { precision: 12, scale: 2 }).notNull(),
      feesAmount: decimal("fees_amount", { precision: 12, scale: 2 }).notNull(),
      netAmount: decimal("net_amount", { precision: 12, scale: 2 }).notNull(),
      roundingAdjustment: decimal("rounding_adjustment", { precision: 6, scale: 4 }).default("0.00"),
      status: text("status", { enum: ["pending", "processed", "paid", "failed"] }).notNull().default("pending"),
      paidAt: timestamp("paid_at"),
      metadata: jsonb("metadata").default("{}"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => ({
      loanInvestorIdx: index("investor_distributions_loan_investor_idx").on(table.loanId, table.investorId),
      runIdIdx: index("investor_distributions_run_id_idx").on(table.runId)
    }));
    escrowAdvances = pgTable("escrow_advances", {
      id: serial("id").primaryKey(),
      loanId: integer("loan_id").notNull().references(() => loans.id),
      escrowAccountId: integer("escrow_account_id").references(() => escrowAccounts.id),
      advanceDate: date("advance_date").notNull(),
      amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
      reason: text("reason").notNull(),
      repaymentMonths: integer("repayment_months").notNull().default(12),
      monthlyRepayment: decimal("monthly_repayment", { precision: 12, scale: 2 }).notNull(),
      outstandingBalance: decimal("outstanding_balance", { precision: 12, scale: 2 }).notNull(),
      status: text("status", { enum: ["active", "paid", "written_off"] }).notNull().default("active"),
      paidOffDate: date("paid_off_date"),
      runId: text("run_id").references(() => servicingRuns.runId),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      loanIdIdx: index("escrow_advances_loan_id_idx").on(table.loanId),
      statusIdx: index("escrow_advances_status_idx").on(table.status)
    }));
    insertServicingRunSchema = createInsertSchema(servicingRuns).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertServicingEventSchema = createInsertSchema(servicingEvents).omit({
      id: true,
      createdAt: true
    });
    insertServicingExceptionSchema = createInsertSchema(servicingExceptions).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertPaymentInboxSchema = createInsertSchema(paymentsInbox).omit({
      id: true,
      createdAt: true
    });
    insertInterestAccrualSchema = createInsertSchema(interestAccruals).omit({
      id: true,
      createdAt: true
    });
    insertInvestorDistributionSchema = createInsertSchema(investorDistributions).omit({
      id: true,
      createdAt: true
    });
    insertEscrowAdvanceSchema = createInsertSchema(escrowAdvances).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
  }
});

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
var pool, db2;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    neonConfig.webSocketConstructor = ws;
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db2 = drizzle({ client: pool, schema: schema_exports });
  }
});

// server/storage.ts
import { eq, desc, and, or, count, sum, gte } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
var PostgresSessionStore, DatabaseStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_db();
    PostgresSessionStore = connectPg(session);
    DatabaseStorage = class {
      sessionStore;
      constructor() {
        this.sessionStore = new PostgresSessionStore({
          pool,
          createTableIfMissing: true
        });
      }
      // User methods
      async getUser(id) {
        const [user] = await db2.select().from(users).where(eq(users.id, id));
        return user || void 0;
      }
      async getUserByUsername(username) {
        const [user] = await db2.select().from(users).where(eq(users.username, username));
        return user || void 0;
      }
      async getUserByEmail(email) {
        const [user] = await db2.select().from(users).where(eq(users.email, email));
        return user || void 0;
      }
      async createUser(insertUser) {
        const [user] = await db2.insert(users).values(insertUser).returning();
        return user;
      }
      async updateUser(id, updateUser) {
        const [user] = await db2.update(users).set({ ...updateUser, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
        return user;
      }
      // Borrower Entity methods
      async getBorrowerEntity(id) {
        const [entity] = await db2.select().from(borrowerEntities).where(eq(borrowerEntities.id, id));
        return entity || void 0;
      }
      async createBorrowerEntity(entity) {
        const [borrower] = await db2.insert(borrowerEntities).values(entity).returning();
        return borrower;
      }
      async updateBorrowerEntity(id, entity) {
        const [borrower] = await db2.update(borrowerEntities).set({ ...entity, updatedAt: /* @__PURE__ */ new Date() }).where(eq(borrowerEntities.id, id)).returning();
        return borrower;
      }
      async getBorrowerEntities() {
        return await db2.select().from(borrowerEntities).where(eq(borrowerEntities.isActive, true));
      }
      // Property methods
      async getProperty(id) {
        const [property] = await db2.select().from(properties).where(eq(properties.id, id));
        return property || void 0;
      }
      async createProperty(property) {
        const [prop] = await db2.insert(properties).values(property).returning();
        return prop;
      }
      async updateProperty(id, property) {
        const [prop] = await db2.update(properties).set({ ...property, updatedAt: /* @__PURE__ */ new Date() }).where(eq(properties.id, id)).returning();
        return prop;
      }
      async getProperties() {
        return await db2.select().from(properties).orderBy(desc(properties.createdAt));
      }
      // Loan methods
      async getLoans(filters = {}) {
        let query = db2.select().from(loans).leftJoin(properties, eq(loans.propertyId, properties.id));
        const conditions = [];
        if (filters.lenderId) conditions.push(eq(loans.lenderId, filters.lenderId));
        if (filters.servicerId) conditions.push(eq(loans.servicerId, filters.servicerId));
        if (filters.investorId) conditions.push(eq(loans.investorId, filters.investorId));
        if (filters.status) conditions.push(eq(loans.status, filters.status));
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
        query = query.orderBy(desc(loans.createdAt));
        if (filters.limit) {
          query = query.limit(filters.limit);
        }
        if (filters.offset) {
          query = query.offset(filters.offset);
        }
        const result = await query;
        return result.map((row) => ({
          ...row.loans,
          property: row.properties
        }));
      }
      async getLoan(id) {
        const [result] = await db2.select().from(loans).leftJoin(properties, eq(loans.propertyId, properties.id)).where(eq(loans.id, id));
        if (!result) return void 0;
        return {
          ...result.loans,
          // Include property fields at the loan level for easy access
          apn: result.properties?.apn,
          parcelNumber: result.properties?.apn,
          legalDescription: result.properties?.legalDescription,
          propertyAddress: result.properties?.address,
          propertyType: result.properties?.propertyType,
          propertyValue: result.properties?.purchasePrice || result.properties?.currentValue,
          property: result.properties
        };
      }
      async getLoanByNumber(loanNumber) {
        const [loan] = await db2.select().from(loans).where(eq(loans.loanNumber, loanNumber));
        return loan || void 0;
      }
      async createLoan(insertLoan) {
        console.log("=== STORAGE: createLoan called ===");
        console.log("Insert data received:", JSON.stringify(insertLoan, null, 2));
        try {
          console.log("Attempting to insert into database...");
          const [loan] = await db2.insert(loans).values(insertLoan).returning();
          console.log("Loan inserted successfully:", loan);
          return loan;
        } catch (error) {
          console.error("=== DATABASE ERROR ===");
          console.error("Error inserting loan:", error);
          console.error("Error message:", error.message);
          console.error("Error code:", error.code);
          console.error("Error detail:", error.detail);
          throw error;
        }
      }
      async updateLoan(id, updateLoan) {
        const cleanUpdateData = { ...updateLoan };
        Object.keys(cleanUpdateData).forEach((key) => {
          const value = cleanUpdateData[key];
          if (value === void 0) {
            delete cleanUpdateData[key];
          }
          if (value && typeof value === "string" && (key.includes("Date") || key === "createdAt" || key === "updatedAt")) {
            try {
              cleanUpdateData[key] = new Date(value);
            } catch (e) {
              delete cleanUpdateData[key];
            }
          }
        });
        delete cleanUpdateData.createdAt;
        delete cleanUpdateData.updatedAt;
        const [loan] = await db2.update(loans).set(cleanUpdateData).where(eq(loans.id, id)).returning();
        return loan;
      }
      async deleteLoan(id) {
        await db2.delete(documents).where(eq(documents.loanId, id));
        await db2.delete(loanBorrowers).where(eq(loanBorrowers.loanId, id));
        await db2.delete(investors).where(eq(investors.loanId, id));
        await db2.delete(payments).where(eq(payments.loanId, id));
        await db2.delete(paymentSchedule).where(eq(paymentSchedule.loanId, id));
        await db2.delete(loans).where(eq(loans.id, id));
      }
      async getLoanMetrics(userId) {
        let conditions = [];
        if (userId) {
          conditions.push(or(
            eq(loans.lenderId, userId),
            eq(loans.servicerId, userId),
            eq(loans.investorId, userId)
          ));
        }
        const whereClause = conditions.length > 0 ? and(...conditions) : void 0;
        const [totalPortfolioResult] = await db2.select({ total: sum(loans.principalBalance) }).from(loans).where(whereClause);
        const [activeLoansResult] = await db2.select({ count: count() }).from(loans).where(and(
          eq(loans.status, "active"),
          whereClause
        ));
        const [delinquentResult] = await db2.select({ count: count() }).from(loans).where(and(
          eq(loans.status, "delinquent"),
          whereClause
        ));
        const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
        const yearStart = new Date(currentYear, 0, 1);
        const [collectionsResult] = await db2.select({ total: sum(payments.totalReceived) }).from(payments).innerJoin(loans, eq(payments.loanId, loans.id)).where(and(
          gte(payments.effectiveDate, yearStart.toISOString().split("T")[0]),
          whereClause
        ));
        return {
          totalPortfolio: totalPortfolioResult?.total || "0",
          activeLoans: Number(activeLoansResult?.count) || 0,
          delinquentLoans: Number(delinquentResult?.count) || 0,
          collectionsYTD: collectionsResult?.total || "0"
        };
      }
      // Loan Borrower methods
      async getLoanBorrowers(loanId) {
        return await db2.select().from(loanBorrowers).where(eq(loanBorrowers.loanId, loanId));
      }
      async createLoanBorrower(loanBorrower) {
        const [lb] = await db2.insert(loanBorrowers).values(loanBorrower).returning();
        return lb;
      }
      async deleteLoanBorrower(id) {
        await db2.delete(loanBorrowers).where(eq(loanBorrowers.id, id));
      }
      // Investor methods
      async getInvestorsByLoan(loanId) {
        return await db2.select().from(investors).where(eq(investors.loanId, loanId));
      }
      async createInvestor(investor) {
        const [inv] = await db2.insert(investors).values(investor).returning();
        return inv;
      }
      async updateInvestor(id, investor) {
        const cleanUpdateData = { ...investor };
        Object.keys(cleanUpdateData).forEach((key) => {
          const value = cleanUpdateData[key];
          if (value === void 0) {
            delete cleanUpdateData[key];
          }
          if (value && typeof value === "string" && (key.includes("Date") || key === "createdAt" || key === "updatedAt")) {
            try {
              cleanUpdateData[key] = new Date(value);
            } catch (e) {
              delete cleanUpdateData[key];
            }
          }
        });
        delete cleanUpdateData.createdAt;
        delete cleanUpdateData.updatedAt;
        const [inv] = await db2.update(investors).set(cleanUpdateData).where(eq(investors.id, id)).returning();
        return inv;
      }
      async deleteInvestor(id) {
        await db2.delete(investors).where(eq(investors.id, id));
      }
      // Payment methods
      async getPayments(loanId, limit) {
        let query = db2.select().from(payments).where(eq(payments.loanId, loanId)).orderBy(desc(payments.effectiveDate));
        if (limit) {
          query = query.limit(limit);
        }
        return await query;
      }
      async createPayment(insertPayment) {
        const [payment] = await db2.insert(payments).values(insertPayment).returning();
        return payment;
      }
      async getPaymentHistory(loanId) {
        return await this.getPayments(loanId);
      }
      async updatePayment(id, updatePayment) {
        const [payment] = await db2.update(payments).set({ ...updatePayment, updatedAt: /* @__PURE__ */ new Date() }).where(eq(payments.id, id)).returning();
        return payment;
      }
      // Payment Schedule methods
      async getPaymentSchedule(loanId) {
        return await db2.select().from(paymentSchedule).where(eq(paymentSchedule.loanId, loanId)).orderBy(paymentSchedule.paymentNumber);
      }
      async createPaymentSchedule(schedule) {
        const [ps] = await db2.insert(paymentSchedule).values(schedule).returning();
        return ps;
      }
      async generatePaymentSchedule(loanId) {
        return [];
      }
      // Escrow methods
      async getEscrowAccount(loanId) {
        const [account] = await db2.select().from(escrowAccounts).where(eq(escrowAccounts.loanId, loanId));
        return account || void 0;
      }
      async createEscrowAccount(insertAccount) {
        const [account] = await db2.insert(escrowAccounts).values(insertAccount).returning();
        return account;
      }
      async updateEscrowAccount(id, updateAccount) {
        const [account] = await db2.update(escrowAccounts).set({ ...updateAccount, updatedAt: /* @__PURE__ */ new Date() }).where(eq(escrowAccounts.id, id)).returning();
        return account;
      }
      async getEscrowTransactions(filters = {}) {
        let query = db2.select().from(escrowTransactions);
        if (filters.escrowAccountId) {
          query = query.where(eq(escrowTransactions.escrowAccountId, filters.escrowAccountId));
        }
        query = query.orderBy(desc(escrowTransactions.transactionDate));
        if (filters.limit) {
          query = query.limit(filters.limit);
        }
        return await query;
      }
      async createEscrowTransaction(transaction) {
        const [trans] = await db2.insert(escrowTransactions).values(transaction).returning();
        return trans;
      }
      // Stub implementations - escrowItems table not implemented yet
      async getEscrowItems(escrowAccountId) {
        return [];
      }
      async createEscrowItem(item) {
        return { id: 0, ...item };
      }
      async getEscrowMetrics() {
        const [balanceResult] = await db2.select({ total: sum(escrowAccounts.currentBalance) }).from(escrowAccounts).where(eq(escrowAccounts.isActive, true));
        const [pendingResult] = await db2.select({ total: sum(escrowAccounts.pendingDisbursements) }).from(escrowAccounts).where(eq(escrowAccounts.isActive, true));
        const [shortageResult] = await db2.select({ total: sum(escrowAccounts.shortageAmount) }).from(escrowAccounts).where(eq(escrowAccounts.isActive, true));
        const [surplusResult] = await db2.select({ total: sum(escrowAccounts.surplusAmount) }).from(escrowAccounts).where(eq(escrowAccounts.isActive, true));
        return {
          totalBalance: balanceResult?.total || "0",
          pendingDisbursements: pendingResult?.total || "0",
          shortages: shortageResult?.total || "0",
          surpluses: surplusResult?.total || "0"
        };
      }
      // Document methods
      async getDocuments(filters = {}) {
        let query = db2.select().from(documents);
        const conditions = [];
        if (filters.loanId) conditions.push(eq(documents.loanId, filters.loanId));
        if (filters.borrowerId) conditions.push(eq(documents.borrowerId, filters.borrowerId));
        if (filters.category) conditions.push(eq(documents.category, filters.category));
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
        query = query.orderBy(desc(documents.createdAt));
        return await query;
      }
      async createDocument(insertDocument) {
        const result = await db2.insert(documents).values(insertDocument).returning();
        return result[0];
      }
      async getDocument(id) {
        const [document] = await db2.select().from(documents).where(eq(documents.id, id));
        return document || void 0;
      }
      async updateDocument(id, updateDocument) {
        const [document] = await db2.update(documents).set({ ...updateDocument, updatedAt: /* @__PURE__ */ new Date() }).where(eq(documents.id, id)).returning();
        return document;
      }
      async deleteDocument(id) {
        await db2.delete(documents).where(eq(documents.id, id));
      }
      // Audit methods
      async createAuditLog(insertAuditLog) {
        const [log2] = await db2.insert(auditLogs).values(insertAuditLog).returning();
        return log2;
      }
      async getAuditLogs(entityType, entityId) {
        return await db2.select().from(auditLogs).where(and(
          eq(auditLogs.entityType, entityType),
          eq(auditLogs.entityId, entityId)
        )).orderBy(desc(auditLogs.createdAt));
      }
      // Notification methods
      async getNotifications(userId, limit) {
        let query = db2.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
        if (limit) {
          query = query.limit(limit);
        }
        return await query;
      }
      async createNotification(insertNotification) {
        const [notification] = await db2.insert(notifications).values(insertNotification).returning();
        return notification;
      }
      async markNotificationAsRead(id) {
        await db2.update(notifications).set({ isRead: true, readAt: /* @__PURE__ */ new Date() }).where(eq(notifications.id, id));
      }
      async getUnreadNotificationCount(userId) {
        const [result] = await db2.select({ count: count() }).from(notifications).where(and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        ));
        return Number(result?.count) || 0;
      }
      // Escrow Disbursement methods implementation
      async getEscrowDisbursements(loanId) {
        const disbursements = await db2.select().from(escrowDisbursements).where(eq(escrowDisbursements.loanId, loanId)).orderBy(desc(escrowDisbursements.createdAt));
        return disbursements;
      }
      async getEscrowDisbursement(id) {
        const [disbursement] = await db2.select().from(escrowDisbursements).where(eq(escrowDisbursements.id, id));
        return disbursement || void 0;
      }
      async createEscrowDisbursement(disbursement) {
        const [newDisbursement] = await db2.insert(escrowDisbursements).values(disbursement).returning();
        return newDisbursement;
      }
      async updateEscrowDisbursement(id, disbursement) {
        const [updatedDisbursement] = await db2.update(escrowDisbursements).set(disbursement).where(eq(escrowDisbursements.id, id)).returning();
        return updatedDisbursement;
      }
      async deleteEscrowDisbursement(id) {
        await db2.delete(escrowDisbursements).where(eq(escrowDisbursements.id, id));
      }
      async holdEscrowDisbursement(id, reason, requestedBy) {
        const [disbursement] = await db2.update(escrowDisbursements).set({
          isOnHold: true,
          holdReason: reason,
          holdRequestedBy: requestedBy,
          holdDate: /* @__PURE__ */ new Date()
        }).where(eq(escrowDisbursements.id, id)).returning();
        return disbursement;
      }
      async releaseEscrowDisbursement(id) {
        const [disbursement] = await db2.update(escrowDisbursements).set({
          isOnHold: false,
          holdReason: null,
          holdRequestedBy: null,
          holdDate: null
        }).where(eq(escrowDisbursements.id, id)).returning();
        return disbursement;
      }
      async getEscrowSummary(loanId) {
        const disbursements = await this.getEscrowDisbursements(loanId);
        const totalDisbursements = disbursements.length;
        const activeDisbursements = disbursements.filter((d) => !d.isOnHold && d.status === "active").length;
        const onHoldDisbursements = disbursements.filter((d) => d.isOnHold).length;
        const totalAnnualAmount = disbursements.reduce((sum2, d) => sum2 + parseFloat(d.annualAmount || "0"), 0).toFixed(2);
        return {
          summary: {
            totalDisbursements,
            activeDisbursements,
            onHoldDisbursements,
            totalAnnualAmount
          }
        };
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/routes/escrow-disbursements.ts
var escrow_disbursements_exports = {};
__export(escrow_disbursements_exports, {
  default: () => escrow_disbursements_default
});
import { Router as Router2 } from "express";
import { eq as eq4 } from "drizzle-orm";
var router2, escrow_disbursements_default;
var init_escrow_disbursements = __esm({
  "server/routes/escrow-disbursements.ts"() {
    "use strict";
    init_storage();
    init_db();
    init_schema();
    init_schema();
    router2 = Router2();
    router2.get("/api/loans/:loanId/escrow-disbursements", async (req, res) => {
      try {
        const loanId = parseInt(req.params.loanId);
        const disbursements = await storage.getEscrowDisbursements(loanId);
        res.json(disbursements);
      } catch (error) {
        console.error("Error fetching escrow disbursements:", error);
        res.status(500).json({ error: "Failed to fetch escrow disbursements" });
      }
    });
    router2.get("/api/escrow-disbursements/:id", async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const disbursement = await storage.getEscrowDisbursement(id);
        if (!disbursement) {
          return res.status(404).json({ error: "Disbursement not found" });
        }
        res.json(disbursement);
      } catch (error) {
        console.error("Error fetching disbursement:", error);
        res.status(500).json({ error: "Failed to fetch disbursement" });
      }
    });
    router2.post("/api/loans/:loanId/escrow-disbursements", async (req, res) => {
      try {
        const loanId = parseInt(req.params.loanId);
        let escrowAccount = await storage.getEscrowAccount(loanId);
        if (!escrowAccount) {
          escrowAccount = await storage.createEscrowAccount({
            loanId,
            accountNumber: `ESC-${loanId}-${Date.now()}`,
            currentBalance: "0",
            isActive: true
          });
        }
        const validatedData = insertEscrowDisbursementSchema.parse({
          ...req.body,
          loanId,
          escrowAccountId: escrowAccount.id
        });
        const disbursement = await storage.createEscrowDisbursement(validatedData);
        res.status(201).json(disbursement);
      } catch (error) {
        console.error("Error creating disbursement:", error);
        const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid disbursement data";
        res.status(400).json({ error: errorMessage, details: error.issues || error.message });
      }
    });
    router2.patch("/api/escrow-disbursements/:id", async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const existingDisbursement = await storage.getEscrowDisbursement(id);
        if (!existingDisbursement) {
          return res.status(404).json({ error: "Disbursement not found" });
        }
        const updatedDisbursement = await storage.updateEscrowDisbursement(id, req.body);
        res.json(updatedDisbursement);
      } catch (error) {
        console.error("Error updating disbursement:", error);
        res.status(400).json({ error: "Failed to update disbursement" });
      }
    });
    router2.delete("/api/escrow-disbursements/:id", async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        await storage.deleteEscrowDisbursement(id);
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting disbursement:", error);
        res.status(400).json({ error: "Failed to delete disbursement" });
      }
    });
    router2.post("/api/escrow-disbursements/:id/payments", async (req, res) => {
      try {
        const disbursementId = parseInt(req.params.id);
        const disbursement = await storage.getEscrowDisbursement(disbursementId);
        if (!disbursement) {
          return res.status(404).json({ error: "Disbursement not found" });
        }
        const validatedData = insertEscrowDisbursementPaymentSchema.parse({
          ...req.body,
          disbursementId,
          loanId: disbursement.loanId
        });
        const [payment] = await db2.insert(escrowDisbursementPayments).values(validatedData).returning();
        const ledgerEntry = await db2.insert(loanLedger).values({
          loanId: disbursement.loanId,
          transactionDate: validatedData.paymentDate,
          description: `Escrow disbursement: ${disbursement.description}`,
          transactionType: "disbursement",
          debitAmount: validatedData.amount,
          creditAmount: "0",
          category: "escrow",
          notes: `Payment for ${disbursement.disbursementType} - ${disbursement.description}`
        }).returning();
        await db2.update(escrowDisbursementPayments).set({ ledgerEntryId: ledgerEntry[0].id }).where(eq4(escrowDisbursementPayments.id, payment.id));
        res.status(201).json({ ...payment, ledgerEntryId: ledgerEntry[0].id });
      } catch (error) {
        console.error("Error recording disbursement payment:", error);
        const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid payment data";
        res.status(400).json({ error: errorMessage, details: error.issues || error.message });
      }
    });
    router2.get("/api/loans/:loanId/escrow-summary", async (req, res) => {
      try {
        const loanId = parseInt(req.params.loanId);
        const summary = await storage.getEscrowSummary(loanId);
        res.json(summary);
      } catch (error) {
        console.error("Error getting escrow summary:", error);
        res.status(500).json({ error: "Failed to get escrow summary" });
      }
    });
    router2.post("/api/escrow-disbursements/:id/hold", async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: "Invalid disbursement ID" });
        }
        const { action, reason, requestedBy } = req.body;
        let result;
        if (action === "hold") {
          result = await storage.holdEscrowDisbursement(id, reason, requestedBy);
        } else if (action === "release") {
          result = await storage.releaseEscrowDisbursement(id);
        } else {
          return res.status(400).json({ error: "Action must be 'hold' or 'release'" });
        }
        res.json(result);
      } catch (error) {
        console.error("Error putting disbursement on hold:", error);
        res.status(400).json({ error: "Failed to update disbursement hold status" });
      }
    });
    escrow_disbursements_default = router2;
  }
});

// server/services/servicing-cycle-service.ts
import { eq as eq5, and as and4, lte, sql as sql3, inArray } from "drizzle-orm";
import { addDays, differenceInDays, parseISO } from "date-fns";
var ServicingCycleService;
var init_servicing_cycle_service = __esm({
  "server/services/servicing-cycle-service.ts"() {
    "use strict";
    init_schema();
    ServicingCycleService = class {
      constructor(db3) {
        this.db = db3;
      }
      // Helper method for extremely detailed event logging
      async createDetailedEventLog(runId, loanId, valuationDate, eventType, details) {
        try {
          const eventKey = `log_${eventType}_${loanId}_${valuationDate}_${Date.now()}`;
          await this.db.insert(servicingEvents).values({
            runId,
            eventKey,
            eventType: `LOG_${eventType}`,
            loanId,
            timestamp: /* @__PURE__ */ new Date(),
            valuationDate,
            amount: details.amount || "0.00",
            principal: details.principal || "0.00",
            interest: details.interest || "0.00",
            escrow: details.escrow || "0.00",
            fees: details.fees || "0.00",
            details: JSON.stringify(details),
            status: "success",
            errorMessage: null,
            createdAt: /* @__PURE__ */ new Date()
          });
        } catch (error) {
          console.error("Failed to create detailed event log:", error);
        }
      }
      async runCycle(runId, valuationDate, loanIds, dryRun = true) {
        try {
          await this.db.update(servicingRuns).set({ status: "running", startTime: /* @__PURE__ */ new Date() }).where(eq5(servicingRuns.runId, runId));
          let loansToProcess = [];
          if (loanIds && loanIds.length > 0) {
            loansToProcess = await this.db.query.loans.findMany({
              where: inArray(loans.id, loanIds.map((id) => parseInt(id)))
            });
          } else {
            loansToProcess = await this.db.query.loans.findMany({
              where: eq5(loans.status, "active")
            });
          }
          let loansProcessed = 0;
          let eventsCreated = 0;
          let exceptionsCreated = 0;
          let totalDisbursedBeneficiary = 0;
          let totalDisbursedInvestors = 0;
          for (const loan of loansToProcess) {
            try {
              const result = await this.processLoan(runId, loan, valuationDate, dryRun);
              eventsCreated += result.eventsCreated;
              exceptionsCreated += result.exceptionsCreated;
              totalDisbursedBeneficiary += result.disbursedBeneficiary;
              totalDisbursedInvestors += result.disbursedInvestors;
              loansProcessed++;
              if (loansProcessed % 10 === 0) {
                await this.db.update(servicingRuns).set({
                  loansProcessed,
                  eventsCreated,
                  exceptionsCreated,
                  totalDisbursedBeneficiary: totalDisbursedBeneficiary.toFixed(2),
                  totalDisbursedInvestors: totalDisbursedInvestors.toFixed(2)
                }).where(eq5(servicingRuns.runId, runId));
              }
            } catch (error) {
              console.error(`Error processing loan ${loan.id}:`, error);
              await this.createException(
                runId,
                loan.id,
                "high",
                "processing_error",
                `Failed to process loan: ${error.message}`,
                "Review error logs and retry processing"
              );
              exceptionsCreated++;
            }
          }
          const reconciliationStatus = this.calculateReconciliationStatus(
            totalDisbursedBeneficiary,
            totalDisbursedInvestors
          );
          await this.db.update(servicingRuns).set({
            status: "completed",
            endTime: /* @__PURE__ */ new Date(),
            loansProcessed,
            eventsCreated,
            exceptionsCreated,
            totalDisbursedBeneficiary: totalDisbursedBeneficiary.toFixed(2),
            totalDisbursedInvestors: totalDisbursedInvestors.toFixed(2),
            reconciliationStatus
          }).where(eq5(servicingRuns.runId, runId));
        } catch (error) {
          console.error("Servicing cycle failed:", error);
          await this.db.update(servicingRuns).set({
            status: "failed",
            endTime: /* @__PURE__ */ new Date(),
            errors: [error.message]
          }).where(eq5(servicingRuns.runId, runId));
          throw error;
        }
      }
      async processLoan(runId, loan, valuationDate, dryRun) {
        let eventsCreated = 0;
        let exceptionsCreated = 0;
        let disbursedBeneficiary = 0;
        let disbursedInvestors = 0;
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "LOAN_PROCESSING_START", {
          message: `Starting comprehensive processing for loan ${loan.loanNumber}`,
          loanNumber: loan.loanNumber,
          loanStatus: loan.status,
          principalBalance: loan.currentBalance,
          originalAmount: loan.originalAmount,
          interestRate: loan.interestRate,
          interestRateType: loan.interestRateType,
          maturityDate: loan.maturityDate,
          originationDate: loan.originationDate,
          lastPaymentDate: loan.lastPaymentDate,
          nextPaymentDue: loan.nextPaymentDue,
          paymentAmount: loan.paymentAmount,
          paymentFrequency: loan.paymentFrequency,
          gracePeriodDays: loan.gracePeriodDays,
          lateFeePercentage: loan.lateFeePercentage,
          prepaymentPenalty: loan.prepaymentPenalty,
          dryRunMode: dryRun,
          valuationDate,
          processingTime: (/* @__PURE__ */ new Date()).toISOString(),
          decision: "INITIATED",
          reason: "Loan has been selected for daily servicing cycle processing"
        });
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "INTEREST_ACCRUAL_START", {
          message: "Beginning interest accrual evaluation",
          currentBalance: loan.currentBalance,
          interestRate: loan.interestRate,
          lastInterestAccrualDate: loan.lastInterestAccrualDate,
          daysSinceLastAccrual: loan.lastInterestAccrualDate ? differenceInDays(new Date(valuationDate), new Date(loan.lastInterestAccrualDate)) : "never accrued",
          decision: "EVALUATING",
          reason: "Checking if interest needs to be accrued based on time elapsed and balance"
        });
        const accrualResult = await this.processInterestAccrual(runId, loan, valuationDate, dryRun);
        eventsCreated += accrualResult.eventsCreated;
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "INTEREST_ACCRUAL_COMPLETE", {
          message: "Interest accrual processing completed",
          eventsCreated: accrualResult.eventsCreated,
          decision: accrualResult.eventsCreated > 0 ? "ACCRUED" : "SKIPPED",
          reason: accrualResult.eventsCreated > 0 ? "Interest successfully accrued" : "No interest to accrue for this period"
        });
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "PAYMENT_INBOX_START", {
          message: "Searching payment inbox for matching payments",
          loanNumber: loan.loanNumber,
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          searchCriteria: {
            byLoanId: true,
            byBorrowerId: true,
            byReferenceNumber: true
          },
          decision: "SEARCHING",
          reason: "Looking for unprocessed payments that could belong to this loan"
        });
        const paymentResult = await this.processPayments(runId, loan, valuationDate, dryRun);
        eventsCreated += paymentResult.eventsCreated;
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "PAYMENT_INBOX_COMPLETE", {
          message: "Payment inbox processing completed",
          paymentsProcessed: paymentResult.eventsCreated,
          decision: paymentResult.eventsCreated > 0 ? "PROCESSED" : "NO_PAYMENTS",
          reason: paymentResult.eventsCreated > 0 ? "Payments found and processed" : "No matching payments found in inbox"
        });
        const firstPaymentDate = loan.firstPaymentDate ? new Date(loan.firstPaymentDate) : null;
        const currentDate = new Date(valuationDate);
        let actualNextPaymentDate = null;
        let missedPayments = 0;
        if (firstPaymentDate && loan.paymentFrequency === "monthly") {
          const monthsSinceFirst = differenceInDays(currentDate, firstPaymentDate) / 30;
          if (monthsSinceFirst > 0) {
            missedPayments = Math.floor(monthsSinceFirst);
            actualNextPaymentDate = addDays(firstPaymentDate, missedPayments * 30);
          } else {
            actualNextPaymentDate = firstPaymentDate;
          }
        }
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "FEE_ASSESSMENT_START", {
          message: "Evaluating fee and late charge assessment",
          firstPaymentDate: loan.firstPaymentDate,
          currentDate: valuationDate,
          actualNextPaymentDate: actualNextPaymentDate?.toISOString(),
          missedPayments,
          paymentFrequency: loan.paymentFrequency,
          gracePeriodDays: loan.gracePeriodDays,
          lateFeePercentage: loan.lateFeePercentage,
          paymentAmount: loan.paymentAmount,
          decision: "EVALUATING",
          reason: missedPayments > 0 ? `Found ${missedPayments} missed monthly payments` : "Checking payment schedule"
        });
        const feeResult = await this.assessFees(runId, loan, valuationDate, dryRun);
        eventsCreated += feeResult.eventsCreated;
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "FEE_ASSESSMENT_COMPLETE", {
          message: "Fee assessment completed",
          feesAssessed: feeResult.eventsCreated,
          decision: feeResult.eventsCreated > 0 ? "FEES_CHARGED" : "NO_FEES",
          reason: feeResult.eventsCreated > 0 ? "Late fees or other charges assessed" : "No fees to assess at this time"
        });
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "ESCROW_DISBURSEMENT_START", {
          message: "Checking for scheduled escrow disbursements",
          loanId: loan.id,
          valuationDate,
          searchCriteria: {
            status: "scheduled",
            dueDateOnOrBefore: valuationDate
          },
          decision: "SEARCHING",
          reason: "Looking for escrow disbursements that are due for payment"
        });
        const escrowResult = await this.processEscrowDisbursements(runId, loan, valuationDate, dryRun);
        eventsCreated += escrowResult.eventsCreated;
        disbursedBeneficiary += escrowResult.disbursed;
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "ESCROW_DISBURSEMENT_COMPLETE", {
          message: "Escrow disbursement processing completed",
          disbursementsProcessed: escrowResult.eventsCreated,
          totalDisbursed: escrowResult.disbursed,
          decision: escrowResult.eventsCreated > 0 ? "DISBURSED" : "NO_DISBURSEMENTS",
          reason: escrowResult.eventsCreated > 0 ? "Escrow disbursements successfully processed" : "No escrow disbursements due"
        });
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "INVESTOR_DISTRIBUTION_START", {
          message: "Calculating investor distributions",
          loanId: loan.id,
          checkingForInvestors: true,
          decision: "EVALUATING",
          reason: "Determining if there are investors requiring payment distributions"
        });
        const distributionResult = await this.calculateInvestorDistributions(runId, loan, valuationDate, dryRun);
        eventsCreated += distributionResult.eventsCreated;
        disbursedInvestors += distributionResult.distributed;
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "INVESTOR_DISTRIBUTION_COMPLETE", {
          message: "Investor distribution calculation completed",
          distributionsCalculated: distributionResult.eventsCreated,
          totalDistributed: distributionResult.distributed,
          decision: distributionResult.eventsCreated > 0 ? "DISTRIBUTED" : "NO_DISTRIBUTIONS",
          reason: distributionResult.eventsCreated > 0 ? "Investor distributions calculated" : "No investor distributions needed"
        });
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_START", {
          message: "Starting comprehensive exception analysis",
          checksToPerform: [
            "payment_overdue_check",
            "escrow_shortage_check",
            "maturity_approaching_check",
            "insurance_expiry_check",
            "balance_discrepancy_check",
            "investor_reconciliation_check"
          ],
          decision: "ANALYZING",
          reason: "Running all exception rules to identify potential issues or risks"
        });
        const exceptionResult = await this.checkForExceptions(runId, loan, valuationDate);
        exceptionsCreated += exceptionResult.exceptionsCreated;
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_COMPLETE", {
          message: "Exception analysis completed",
          exceptionsFound: exceptionResult.exceptionsCreated,
          decision: exceptionResult.exceptionsCreated > 0 ? "EXCEPTIONS_FOUND" : "NO_EXCEPTIONS",
          reason: exceptionResult.exceptionsCreated > 0 ? "Issues identified requiring attention" : "No exceptions or issues found"
        });
        await this.createDetailedEventLog(runId, loan.id, valuationDate, "LOAN_PROCESSING_COMPLETE", {
          message: `Completed all processing steps for loan ${loan.loanNumber}`,
          summary: {
            eventsCreated,
            exceptionsCreated,
            disbursedToBeneficiary: disbursedBeneficiary,
            disbursedToInvestors: disbursedInvestors,
            totalDisbursed: disbursedBeneficiary + disbursedInvestors
          },
          processingTime: (/* @__PURE__ */ new Date()).toISOString(),
          dryRunMode: dryRun,
          decision: "COMPLETED_SUCCESSFULLY",
          reason: "All loan servicing steps have been executed successfully"
        });
        return {
          eventsCreated,
          exceptionsCreated,
          disbursedBeneficiary,
          disbursedInvestors
        };
      }
      async processInterestAccrual(runId, loan, valuationDate, dryRun) {
        let eventsCreated = 0;
        try {
          await this.createDetailedEventLog(runId, loan.id, valuationDate, "INTEREST_ACCRUAL_LOOKUP", {
            message: "Looking up last interest accrual record",
            loanId: loan.id,
            searchingFor: "most recent accrual date",
            decision: "QUERYING",
            reason: "Need to determine from date for interest calculation"
          });
          const lastAccrual = await this.db.query.interestAccruals.findFirst({
            where: eq5(interestAccruals.loanId, loan.id),
            orderBy: (interestAccruals3, { desc: desc5 }) => [desc5(interestAccruals3.accrualDate)]
          });
          await this.createDetailedEventLog(runId, loan.id, valuationDate, "INTEREST_ACCRUAL_LAST_FOUND", {
            message: lastAccrual ? "Found previous accrual record" : "No previous accrual found",
            lastAccrualDate: lastAccrual?.accrualDate || null,
            lastAccrualAmount: lastAccrual?.accruedAmount || null,
            decision: lastAccrual ? "FOUND" : "NOT_FOUND",
            reason: lastAccrual ? "Will calculate from day after last accrual" : "Will calculate from loan origination date"
          });
          const fromDate = lastAccrual && lastAccrual.accrualDate ? addDays(parseISO(String(lastAccrual.accrualDate)), 1) : loan.originationDate ? parseISO(String(loan.originationDate)) : /* @__PURE__ */ new Date();
          const toDate = parseISO(String(valuationDate));
          const dayCount = differenceInDays(toDate, fromDate);
          await this.createDetailedEventLog(runId, loan.id, valuationDate, "INTEREST_ACCRUAL_DATE_CALC", {
            message: "Calculated accrual period",
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString(),
            dayCount,
            decision: dayCount > 0 ? "WILL_ACCRUE" : "SKIP_ACCRUAL",
            reason: dayCount > 0 ? `${dayCount} days to accrue interest for` : "No days to accrue (already accrued or future date)"
          });
          if (dayCount <= 0) {
            await this.createDetailedEventLog(runId, loan.id, valuationDate, "INTEREST_ACCRUAL_SKIPPED", {
              message: "Skipping interest accrual",
              fromDate: fromDate.toISOString(),
              toDate: toDate.toISOString(),
              dayCount,
              decision: "SKIPPED",
              reason: dayCount === 0 ? "Already accrued for this date" : "Invalid date range (negative days)"
            });
            return { eventsCreated: 0 };
          }
          const principalBalance = parseFloat(loan.currentBalance || loan.originalAmount);
          const interestRate = parseFloat(loan.interestRate) / 100;
          const dailyRate = interestRate / 365;
          const accruedAmount = principalBalance * dailyRate * dayCount;
          await this.createDetailedEventLog(runId, loan.id, valuationDate, "INTEREST_ACCRUAL_CALCULATION", {
            message: "Calculated interest accrual amount",
            principalBalance,
            annualInterestRate: loan.interestRate,
            annualInterestRateDecimal: interestRate,
            dailyRate,
            dayCount,
            calculation: `${principalBalance} * ${dailyRate} * ${dayCount}`,
            accruedAmount: accruedAmount.toFixed(2),
            decision: "CALCULATED",
            reason: `Interest calculated using ${loan.interestRateType || "standard"} method`
          });
          const eventKey = `interest_accrual_${loan.id}_${valuationDate}`;
          await this.createEvent(runId, eventKey, "interest_accrual", loan.id, valuationDate, {
            amount: accruedAmount.toFixed(2),
            interest: accruedAmount.toFixed(2),
            details: {
              fromDate: fromDate.toISOString().split("T")[0],
              toDate: toDate.toISOString().split("T")[0],
              dayCount,
              principalBalance: principalBalance.toFixed(2),
              interestRate: (interestRate * 100).toFixed(2),
              dailyRate: dailyRate.toFixed(10)
            }
          });
          if (!dryRun) {
            await this.db.insert(interestAccruals).values({
              loanId: loan.id,
              accrualDate: valuationDate,
              fromDate: fromDate.toISOString().split("T")[0],
              toDate: toDate.toISOString().split("T")[0],
              dayCount,
              dayCountConvention: "ACT/365",
              interestRate: (interestRate * 100).toFixed(4),
              principalBalance: principalBalance.toFixed(2),
              dailyRate: dailyRate.toFixed(10),
              accruedAmount: accruedAmount.toFixed(2),
              runId
            });
          }
          eventsCreated++;
        } catch (error) {
          console.error(`Error processing interest accrual for loan ${loan.id}:`, error);
        }
        return { eventsCreated };
      }
      async processPayments(runId, loan, valuationDate, dryRun) {
        let eventsCreated = 0;
        try {
          const payments2 = await this.db.query.paymentsInbox.findMany({
            where: and4(
              eq5(paymentsInbox.loanId, loan.id),
              eq5(paymentsInbox.status, "matched"),
              lte(paymentsInbox.valueDate, valuationDate)
            )
          });
          for (const payment of payments2) {
            const eventKey = `post_payment_${payment.id}_${valuationDate}`;
            await this.createEvent(runId, eventKey, "post_payment", loan.id, valuationDate, {
              amount: payment.amount,
              details: {
                paymentId: payment.id,
                referenceNumber: payment.referenceNumber,
                valueDate: payment.valueDate
              }
            });
            if (!dryRun) {
              await this.db.update(paymentsInbox).set({
                status: "processed",
                processedAt: /* @__PURE__ */ new Date(),
                processedByRunId: runId
              }).where(eq5(paymentsInbox.id, payment.id));
              await this.db.insert(loanLedger).values({
                loanId: loan.id,
                transactionDate: valuationDate,
                effectiveDate: payment.valueDate,
                transactionType: "payment",
                transactionSubtype: "borrower_payment",
                description: `Payment received - Ref: ${payment.referenceNumber}`,
                amount: payment.amount,
                principalAmount: "0.00",
                // Will be calculated based on waterfall
                interestAmount: "0.00",
                escrowAmount: "0.00",
                feesAmount: "0.00",
                reference: payment.referenceNumber
              });
            }
            eventsCreated++;
          }
        } catch (error) {
          console.error(`Error processing payments for loan ${loan.id}:`, error);
        }
        return { eventsCreated };
      }
      async assessFees(runId, loan, valuationDate, dryRun) {
        let eventsCreated = 0;
        try {
          const dueFees = await this.db.query.loanFees.findMany({
            where: and4(
              eq5(loanFees.loanId, loan.id),
              sql3`${loanFees.paidDate} IS NULL`,
              sql3`${loanFees.dueDate} <= ${valuationDate}::date`
            )
          });
          for (const fee of dueFees) {
            const eventKey = `assess_fee_${fee.id}_${valuationDate}`;
            await this.createEvent(runId, eventKey, "assess_fee", loan.id, valuationDate, {
              amount: fee.feeAmount,
              fees: fee.feeAmount,
              details: {
                feeId: fee.id,
                feeName: fee.feeName,
                dueDate: fee.dueDate
              }
            });
            eventsCreated++;
          }
          const paymentDate = parseISO(valuationDate);
          const dueDate = parseISO(loan.paymentDueDay || "15");
          const daysLate = differenceInDays(paymentDate, dueDate);
          if (daysLate > loan.gracePeriodDays && parseFloat(loan.currentBalance) > 0) {
            const lateFeeAmount = parseFloat(loan.lateFeeAmount || "50.00");
            const eventKey = `late_fee_${loan.id}_${valuationDate}`;
            await this.createEvent(runId, eventKey, "late_fee", loan.id, valuationDate, {
              amount: lateFeeAmount.toFixed(2),
              fees: lateFeeAmount.toFixed(2),
              details: {
                daysLate,
                gracePeriodDays: loan.gracePeriodDays
              }
            });
            if (!dryRun) {
              await this.db.insert(loanFees).values({
                loanId: loan.id,
                templateId: null,
                feeName: "Late Fee",
                feeType: "late_fee",
                amount: lateFeeAmount.toFixed(2),
                frequency: "one_time",
                status: "unpaid",
                dueDate: valuationDate,
                assessedDate: valuationDate
              });
            }
            eventsCreated++;
          }
        } catch (error) {
          console.error(`Error assessing fees for loan ${loan.id}:`, error);
        }
        return { eventsCreated };
      }
      async processEscrowDisbursements(runId, loan, valuationDate, dryRun) {
        let eventsCreated = 0;
        let disbursed = 0;
        try {
          const disbursements = await this.db.query.escrowDisbursements.findMany({
            where: eq5(escrowDisbursements.loanId, loan.id)
          });
          for (const disbursement of disbursements) {
            const eventKey = `escrow_disbursement_${disbursement.id}_${valuationDate}`;
            const amount = parseFloat(disbursement.coverageAmount || "0");
            await this.createEvent(runId, eventKey, "escrow_disbursement", loan.id, valuationDate, {
              amount: amount.toFixed(2),
              escrow: amount.toFixed(2),
              details: {
                disbursementId: disbursement.id,
                payee: disbursement.payeeName,
                category: disbursement.category,
                type: disbursement.disbursementType
              }
            });
            if (!dryRun) {
            }
            disbursed += amount;
            eventsCreated++;
          }
        } catch (error) {
          console.error(`Error processing escrow disbursements for loan ${loan.id}:`, error);
        }
        return { eventsCreated, disbursed };
      }
      async calculateInvestorDistributions(runId, loan, valuationDate, dryRun) {
        let eventsCreated = 0;
        let distributed = 0;
        try {
          const loanInvestorsList = await this.db.query.investors.findMany({
            where: eq5(investors.loanId, loan.id)
          });
          if (loanInvestorsList.length === 0) {
            return { eventsCreated: 0, distributed: 0 };
          }
          const recentPayments = await this.db.query.loanLedger.findMany({
            where: and4(
              eq5(loanLedger.loanId, loan.id),
              eq5(loanLedger.transactionType, "payment"),
              sql3`${loanLedger.transactionDate} >= ${valuationDate}`
            )
          });
          for (const payment of recentPayments) {
            const totalAmount = parseFloat(payment.amount);
            for (const investor of loanInvestorsList) {
              const ownershipPercentage = parseFloat(investor.ownershipPercentage) / 100;
              const distributionAmount = totalAmount * ownershipPercentage;
              const eventKey = `investor_distribution_${investor.investorId}_${payment.id}_${valuationDate}`;
              await this.createEvent(runId, eventKey, "distribute_investors", loan.id, valuationDate, {
                amount: distributionAmount.toFixed(2),
                details: {
                  investorId: investor.investorId,
                  investorName: investor.name,
                  ownershipPercentage: (ownershipPercentage * 100).toFixed(2),
                  paymentId: payment.id
                }
              });
              if (!dryRun) {
                await this.db.insert(investorDistributions).values({
                  runId,
                  loanId: loan.id,
                  investorId: investor.id,
                  distributionDate: valuationDate,
                  ownershipPercentage: (ownershipPercentage * 100).toFixed(6),
                  grossAmount: distributionAmount.toFixed(2),
                  principalAmount: (parseFloat(payment.principalAmount || "0") * ownershipPercentage).toFixed(2),
                  interestAmount: (parseFloat(payment.interestAmount || "0") * ownershipPercentage).toFixed(2),
                  feesAmount: (parseFloat(payment.feesAmount || "0") * ownershipPercentage).toFixed(2),
                  netAmount: distributionAmount.toFixed(2),
                  status: "pending"
                });
              }
              distributed += distributionAmount;
              eventsCreated++;
            }
          }
        } catch (error) {
          console.error(`Error calculating investor distributions for loan ${loan.id}:`, error);
        }
        return { eventsCreated, distributed };
      }
      async checkForExceptions(runId, loan, valuationDate) {
        let exceptionsCreated = 0;
        try {
          await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_ESCROW_START", {
            message: "Checking escrow account status",
            loanId: loan.id,
            checkType: "escrow_balance_check",
            decision: "CHECKING",
            reason: "Verifying if escrow account has sufficient balance"
          });
          const escrowAccount = await this.db.query.escrowAccounts.findFirst({
            where: eq5(escrowAccounts.loanId, loan.id)
          });
          if (escrowAccount) {
            const balance = parseFloat(escrowAccount.currentBalance);
            await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_ESCROW_RESULT", {
              message: "Escrow account found and evaluated",
              accountId: escrowAccount.id,
              currentBalance: balance,
              isNegative: balance < 0,
              isLow: balance < 1e3,
              decision: balance < 0 ? "EXCEPTION_REQUIRED" : balance < 1e3 ? "WARNING" : "SUFFICIENT",
              reason: balance < 0 ? "Negative escrow balance requires immediate attention" : balance < 1e3 ? "Low escrow balance may require monitoring" : "Escrow balance is sufficient"
            });
            if (balance < 0) {
              await this.createException(
                runId,
                loan.id,
                "high",
                "insufficient_escrow",
                `Escrow account has negative balance: $${balance.toFixed(2)}`,
                "Review escrow account and consider escrow advance"
              );
              exceptionsCreated++;
              await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CREATED_ESCROW", {
                message: "Escrow shortage exception created",
                severity: "high",
                balance,
                decision: "EXCEPTION_LOGGED",
                reason: "Negative escrow balance is a high priority issue"
              });
            }
          } else {
            await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_ESCROW_NOT_FOUND", {
              message: "No escrow account found for loan",
              loanId: loan.id,
              decision: "NO_ESCROW",
              reason: "Loan may not have escrow requirement or account not set up"
            });
          }
          await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_PAYMENT_START", {
            message: "Checking payment history",
            loanId: loan.id,
            paymentDueDay: loan.paymentDueDay,
            checkType: "payment_history_check",
            decision: "CHECKING",
            reason: "Verifying payment compliance and identifying delinquencies"
          });
          const lastPayment = await this.db.query.loanLedger.findFirst({
            where: and4(
              eq5(loanLedger.loanId, loan.id),
              eq5(loanLedger.transactionType, "payment")
            ),
            orderBy: (loanLedger3, { desc: desc5 }) => [desc5(loanLedger3.transactionDate)]
          });
          if (lastPayment && lastPayment.transactionDate) {
            const lastPaymentDate = parseISO(String(lastPayment.transactionDate));
            const currentDate = parseISO(String(valuationDate));
            const daysSinceLastPayment = differenceInDays(currentDate, lastPaymentDate);
            await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_PAYMENT_RESULT", {
              message: "Payment history analyzed",
              lastPaymentDate: lastPayment.transactionDate,
              lastPaymentAmount: lastPayment.amount,
              daysSinceLastPayment,
              is30DaysLate: daysSinceLastPayment > 30,
              is60DaysLate: daysSinceLastPayment > 60,
              is90DaysLate: daysSinceLastPayment > 90,
              decision: daysSinceLastPayment > 90 ? "CRITICAL_DELINQUENCY" : daysSinceLastPayment > 60 ? "SERIOUS_DELINQUENCY" : daysSinceLastPayment > 30 ? "DELINQUENT" : "CURRENT",
              reason: daysSinceLastPayment > 90 ? "Loan is severely delinquent - immediate action required" : daysSinceLastPayment > 60 ? "Loan is seriously delinquent - escalation needed" : daysSinceLastPayment > 30 ? "Loan is delinquent - follow-up required" : "Loan payments are current"
            });
            if (daysSinceLastPayment > 60) {
              await this.createException(
                runId,
                loan.id,
                "critical",
                "missing_payment",
                `No payment received for ${daysSinceLastPayment} days`,
                "Contact borrower immediately"
              );
              exceptionsCreated++;
              await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CREATED_PAYMENT", {
                message: "Payment delinquency exception created",
                severity: "critical",
                daysSinceLastPayment,
                decision: "EXCEPTION_LOGGED",
                reason: "Serious payment delinquency requires immediate intervention"
              });
            }
          } else {
            await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_NO_PAYMENTS", {
              message: "No payment history found",
              loanId: loan.id,
              decision: "NO_PAYMENT_HISTORY",
              reason: "Loan may be new or no payments have been recorded yet"
            });
          }
          await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_DATA_START", {
            message: "Checking loan data integrity",
            checkingFields: ["interestRate", "principalBalance", "maturityDate", "paymentAmount"],
            decision: "VALIDATING",
            reason: "Ensuring all critical loan data is present and valid"
          });
          const dataIssues = [];
          if (!loan.interestRate || parseFloat(loan.interestRate) === 0) {
            dataIssues.push("Missing or zero interest rate");
            await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_DATA_INTEREST", {
              message: "Interest rate anomaly detected",
              interestRate: loan.interestRate,
              hasInterestRate: !!loan.interestRate,
              isZero: parseFloat(loan.interestRate || 0) === 0,
              decision: "DATA_ANOMALY",
              reason: "Loan must have a valid interest rate for proper servicing"
            });
            await this.createException(
              runId,
              loan.id,
              "medium",
              "data_anomaly",
              "Loan has no interest rate defined",
              "Update loan terms with correct interest rate"
            );
            exceptionsCreated++;
          }
          if (!loan.paymentAmount || parseFloat(loan.paymentAmount) === 0) {
            dataIssues.push("Missing or zero payment amount");
            await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_DATA_PAYMENT", {
              message: "Payment amount anomaly detected",
              paymentAmount: loan.paymentAmount,
              hasPaymentAmount: !!loan.paymentAmount,
              isZero: parseFloat(loan.paymentAmount || 0) === 0,
              decision: "DATA_ANOMALY",
              reason: "Loan must have a valid payment amount for servicing"
            });
          }
          if (loan.maturityDate) {
            const maturityDate = parseISO(loan.maturityDate);
            const currentDate = parseISO(valuationDate);
            const daysToMaturity = differenceInDays(maturityDate, currentDate);
            await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_MATURITY", {
              message: "Checking loan maturity",
              maturityDate: loan.maturityDate,
              currentDate: valuationDate,
              daysToMaturity,
              isMatured: daysToMaturity < 0,
              maturingSoon: daysToMaturity >= 0 && daysToMaturity <= 90,
              decision: daysToMaturity < 0 ? "MATURED" : daysToMaturity <= 30 ? "MATURING_SOON" : daysToMaturity <= 90 ? "APPROACHING_MATURITY" : "NOT_NEAR_MATURITY",
              reason: daysToMaturity < 0 ? "Loan has matured and requires payoff processing" : daysToMaturity <= 30 ? "Loan maturing within 30 days - prepare for payoff" : daysToMaturity <= 90 ? "Loan approaching maturity - begin preparations" : "Loan maturity is not imminent"
            });
            if (daysToMaturity >= 0 && daysToMaturity <= 30) {
              await this.createException(
                runId,
                loan.id,
                "medium",
                "approaching_maturity",
                `Loan maturing in ${daysToMaturity} days`,
                "Prepare maturity notices and payoff documentation"
              );
              exceptionsCreated++;
            }
          }
          await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_SUMMARY", {
            message: "Exception check completed",
            checksPerformed: [
              "escrow_balance",
              "payment_history",
              "data_integrity",
              "maturity_date"
            ],
            exceptionsFound: exceptionsCreated,
            dataIssues,
            decision: exceptionsCreated > 0 ? "EXCEPTIONS_FOUND" : "NO_EXCEPTIONS",
            reason: exceptionsCreated > 0 ? `Found ${exceptionsCreated} exception(s) requiring attention` : "All checks passed without exceptions"
          });
        } catch (error) {
          console.error(`Error checking exceptions for loan ${loan.id}:`, error);
          await this.createDetailedEventLog(runId, loan.id, valuationDate, "EXCEPTION_CHECK_ERROR", {
            message: "Error during exception checking",
            error: error.message,
            stack: error.stack,
            decision: "ERROR",
            reason: "Unexpected error prevented complete exception checking"
          });
        }
        return { exceptionsCreated };
      }
      async createEvent(runId, eventKey, eventType, loanId, valuationDate, data) {
        try {
          await this.db.insert(servicingEvents).values({
            runId,
            eventKey,
            eventType,
            loanId,
            valuationDate,
            amount: data.amount,
            principal: data.principal,
            interest: data.interest,
            escrow: data.escrow,
            fees: data.fees,
            details: data.details || {},
            status: "success"
          });
        } catch (error) {
          if (error.code === "23505") {
            console.log(`Event ${eventKey} already exists, skipping`);
          } else {
            console.error(`Error creating event ${eventKey}:`, error);
            throw error;
          }
        }
      }
      async createException(runId, loanId, severity, type, message, suggestedAction) {
        try {
          await this.db.insert(servicingExceptions).values({
            runId,
            loanId,
            severity,
            type,
            message,
            suggestedAction,
            dueDate: addDays(/* @__PURE__ */ new Date(), severity === "critical" ? 1 : severity === "high" ? 3 : 7).toISOString().split("T")[0],
            status: "open"
          });
        } catch (error) {
          console.error(`Error creating exception for loan ${loanId}:`, error);
        }
      }
      calculateReconciliationStatus(disbursedBeneficiary, disbursedInvestors) {
        const difference = Math.abs(disbursedBeneficiary - disbursedInvestors);
        if (difference < 0.01) {
          return "balanced";
        } else if (difference < 10) {
          return "pending";
        } else {
          return "imbalanced";
        }
      }
      async reprocessLoan(runId, loanId, valuationDate) {
        const loan = await this.db.query.loans.findFirst({
          where: eq5(loans.id, loanId)
        });
        if (!loan) {
          throw new Error(`Loan ${loanId} not found`);
        }
        await this.db.delete(servicingEvents).where(and4(
          eq5(servicingEvents.loanId, loanId),
          eq5(servicingEvents.valuationDate, valuationDate)
        ));
        return await this.processLoan(runId, loan, valuationDate, false);
      }
    };
  }
});

// server/routes/servicing-cycle.ts
var servicing_cycle_exports = {};
__export(servicing_cycle_exports, {
  default: () => servicing_cycle_default
});
import { Router as Router3 } from "express";
import { eq as eq6, and as and5, desc as desc4, sql as sql4 } from "drizzle-orm";
import crypto from "crypto";
function convertToCSV(report) {
  const lines = [];
  lines.push("RUN SUMMARY");
  lines.push("Field,Value");
  Object.entries(report.run).forEach(([key, value]) => {
    lines.push(`${key},"${value}"`);
  });
  lines.push("");
  lines.push("EVENTS");
  lines.push("Event Type,Loan ID,Amount,Status,Timestamp");
  report.events.forEach((e) => {
    lines.push(`${e.eventType},${e.loanId},${e.amount},${e.status},"${e.timestamp}"`);
  });
  lines.push("");
  lines.push("EXCEPTIONS");
  lines.push("Loan ID,Severity,Type,Message,Status");
  report.exceptions.forEach((e) => {
    lines.push(`${e.loanId},${e.severity},${e.type},"${e.message}",${e.status}`);
  });
  return lines.join("\n");
}
var router3, servicingService, servicing_cycle_default;
var init_servicing_cycle = __esm({
  "server/routes/servicing-cycle.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_servicing_cycle_service();
    router3 = Router3();
    servicingService = new ServicingCycleService(db2);
    router3.get("/current", async (req, res) => {
      try {
        const currentRun = await db2.query.servicingRuns.findFirst({
          where: eq6(servicingRuns.status, "running"),
          orderBy: desc4(servicingRuns.startTime)
        });
        res.json(currentRun || null);
      } catch (error) {
        console.error("Error fetching current run:", error);
        res.status(500).json({ error: "Failed to fetch current servicing run" });
      }
    });
    router3.get("/runs", async (req, res) => {
      try {
        const runs = await db2.query.servicingRuns.findMany({
          orderBy: desc4(servicingRuns.startTime),
          limit: 20
        });
        res.json(runs);
      } catch (error) {
        console.error("Error fetching runs:", error);
        res.status(500).json({ error: "Failed to fetch servicing runs" });
      }
    });
    router3.get("/exceptions", async (req, res) => {
      try {
        const exceptions = await db2.select({
          id: servicingExceptions.id,
          runId: servicingExceptions.runId,
          loanId: servicingExceptions.loanId,
          loanNumber: loans.loanNumber,
          severity: servicingExceptions.severity,
          type: servicingExceptions.type,
          message: servicingExceptions.message,
          suggestedAction: servicingExceptions.suggestedAction,
          dueDate: servicingExceptions.dueDate,
          status: servicingExceptions.status,
          createdAt: servicingExceptions.createdAt
        }).from(servicingExceptions).leftJoin(loans, eq6(servicingExceptions.loanId, loans.id)).orderBy(desc4(servicingExceptions.createdAt)).limit(100);
        res.json(exceptions);
      } catch (error) {
        console.error("Error fetching exceptions:", error);
        res.status(500).json({ error: "Failed to fetch exceptions" });
      }
    });
    router3.get("/summary/:date", async (req, res) => {
      try {
        const { date: date2 } = req.params;
        const runs = await db2.query.servicingRuns.findMany({
          where: eq6(servicingRuns.valuationDate, date2)
        });
        const summary = {
          loansProcessed: runs.reduce((sum2, run) => sum2 + run.loansProcessed, 0),
          totalLoans: runs[0]?.totalLoans || 0,
          paymentsPosted: "0.00",
          paymentCount: 0,
          investorDistributions: "0.00",
          investorCount: 0
        };
        if (runs.length > 0) {
          const paymentEvents = await db2.query.servicingEvents.findMany({
            where: and5(
              eq6(servicingEvents.valuationDate, date2),
              eq6(servicingEvents.eventType, "post_payment")
            )
          });
          summary.paymentCount = paymentEvents.length;
          summary.paymentsPosted = paymentEvents.reduce((sum2, event) => sum2 + parseFloat(event.amount || "0"), 0).toFixed(2);
          const distributions = await db2.query.investorDistributions.findMany({
            where: eq6(investorDistributions.distributionDate, date2)
          });
          const uniqueInvestors = new Set(distributions.map((d) => d.investorId));
          summary.investorCount = uniqueInvestors.size;
          summary.investorDistributions = distributions.reduce((sum2, dist) => sum2 + parseFloat(dist.netAmount), 0).toFixed(2);
        }
        res.json(summary);
      } catch (error) {
        console.error("Error fetching summary:", error);
        res.status(500).json({ error: "Failed to fetch summary" });
      }
    });
    router3.post("/start", async (req, res) => {
      try {
        const { valuationDate, loanIds, dryRun = true } = req.body;
        const userId = req.user?.id;
        const runningCycle = await db2.query.servicingRuns.findFirst({
          where: eq6(servicingRuns.status, "running")
        });
        if (runningCycle) {
          return res.status(400).json({
            error: "A servicing cycle is already running",
            runId: runningCycle.runId
          });
        }
        const runId = `RUN-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
        const inputHash = crypto.createHash("sha256").update(JSON.stringify({ valuationDate, loanIds, dryRun })).digest("hex");
        let totalLoans = 0;
        if (loanIds && loanIds.length > 0) {
          totalLoans = loanIds.length;
        } else {
          const loanCount = await db2.select({ count: sql4`count(*)` }).from(loans).where(eq6(loans.status, "active"));
          totalLoans = Number(loanCount[0].count);
        }
        await db2.insert(servicingRuns).values({
          runId,
          valuationDate,
          status: "pending",
          totalLoans,
          loansProcessed: 0,
          eventsCreated: 0,
          exceptionsCreated: 0,
          dryRun,
          loanIds,
          inputHash,
          createdBy: userId
        });
        servicingService.runCycle(runId, valuationDate, loanIds, dryRun).catch((error) => {
          console.error("Servicing cycle failed:", error);
          db2.update(servicingRuns).set({
            status: "failed",
            endTime: /* @__PURE__ */ new Date(),
            errors: [error.message]
          }).where(eq6(servicingRuns.runId, runId)).catch(console.error);
        });
        res.json({
          runId,
          totalLoans,
          status: "started",
          message: `Servicing cycle started for ${totalLoans} loans`
        });
      } catch (error) {
        console.error("Error starting servicing cycle:", error);
        res.status(500).json({ error: "Failed to start servicing cycle" });
      }
    });
    router3.post("/cancel/:runId", async (req, res) => {
      try {
        const { runId } = req.params;
        const run = await db2.query.servicingRuns.findFirst({
          where: eq6(servicingRuns.runId, runId)
        });
        if (!run) {
          return res.status(404).json({ error: "Run not found" });
        }
        if (run.status !== "running") {
          return res.status(400).json({ error: "Can only cancel running cycles" });
        }
        await db2.update(servicingRuns).set({
          status: "cancelled",
          endTime: /* @__PURE__ */ new Date()
        }).where(eq6(servicingRuns.runId, runId));
        res.json({ message: "Servicing cycle cancelled", runId });
      } catch (error) {
        console.error("Error cancelling servicing cycle:", error);
        res.status(500).json({ error: "Failed to cancel servicing cycle" });
      }
    });
    router3.post("/reprocess", async (req, res) => {
      try {
        const { runId, loanId, valuationDate } = req.body;
        const run = await db2.query.servicingRuns.findFirst({
          where: eq6(servicingRuns.runId, runId)
        });
        if (!run) {
          return res.status(404).json({ error: "Run not found" });
        }
        const result = await servicingService.reprocessLoan(runId, loanId, valuationDate);
        res.json({
          message: "Loan reprocessed successfully",
          eventsCreated: result.eventsCreated,
          exceptionsCreated: result.exceptionsCreated
        });
      } catch (error) {
        console.error("Error reprocessing loan:", error);
        res.status(500).json({ error: "Failed to reprocess loan" });
      }
    });
    router3.get("/export/:runId", async (req, res) => {
      try {
        const { runId } = req.params;
        const { format = "json" } = req.query;
        const run = await db2.query.servicingRuns.findFirst({
          where: eq6(servicingRuns.runId, runId)
        });
        if (!run) {
          return res.status(404).json({ error: "Run not found" });
        }
        const events = await db2.query.servicingEvents.findMany({
          where: eq6(servicingEvents.runId, runId)
        });
        const exceptions = await db2.query.servicingExceptions.findMany({
          where: eq6(servicingExceptions.runId, runId)
        });
        const report = {
          run: {
            runId: run.runId,
            valuationDate: run.valuationDate,
            status: run.status,
            dryRun: run.dryRun,
            startTime: run.startTime,
            endTime: run.endTime,
            loansProcessed: run.loansProcessed,
            totalLoans: run.totalLoans,
            eventsCreated: run.eventsCreated,
            exceptionsCreated: run.exceptionsCreated,
            totalDisbursedBeneficiary: run.totalDisbursedBeneficiary,
            totalDisbursedInvestors: run.totalDisbursedInvestors,
            reconciliationStatus: run.reconciliationStatus
          },
          events: events.map((e) => ({
            eventType: e.eventType,
            loanId: e.loanId,
            amount: e.amount,
            status: e.status,
            timestamp: e.timestamp,
            details: e.details
            // Include the detailed decision logging data
          })),
          exceptions: exceptions.map((e) => ({
            loanId: e.loanId,
            severity: e.severity,
            type: e.type,
            message: e.message,
            status: e.status
          })),
          summary: {
            eventsByType: events.reduce((acc, e) => {
              acc[e.eventType] = (acc[e.eventType] || 0) + 1;
              return acc;
            }, {}),
            exceptionsBySeverity: exceptions.reduce((acc, e) => {
              acc[e.severity] = (acc[e.severity] || 0) + 1;
              return acc;
            }, {})
          }
        };
        if (format === "csv") {
          const csv = convertToCSV(report);
          res.setHeader("Content-Type", "text/csv");
          res.setHeader("Content-Disposition", `attachment; filename=servicing-run-${runId}.csv`);
          res.send(csv);
        } else {
          res.json(report);
        }
      } catch (error) {
        console.error("Error exporting report:", error);
        res.status(500).json({ error: "Failed to export report" });
      }
    });
    servicing_cycle_default = router3;
  }
});

// server/migrations.ts
var migrations_exports = {};
__export(migrations_exports, {
  runMigrations: () => runMigrations
});
async function runMigrations() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  console.log("[Migration] Auto-migration will run on production deployment");
}
var init_migrations = __esm({
  "server/migrations.ts"() {
    "use strict";
  }
});

// server/index.ts
import express2 from "express";

// server/routes.ts
init_storage();
import { createServer } from "http";

// server/auth.ts
init_storage();
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session2 from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
var scryptAsync = promisify(scrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync(supplied, salt, 64);
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
function setupAuth(app2) {
  const sessionSettings = {
    secret: process.env.SESSION_SECRET || "dev-session-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: false,
      // Allow non-HTTPS in development
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1e3
      // 24 hours
    }
  };
  app2.set("trust proxy", 1);
  app2.use(session2(sessionSettings));
  app2.use(passport.initialize());
  app2.use(passport.session());
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !await comparePasswords(password, user.password)) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    })
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });
  app2.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }
    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password)
    });
    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });
  app2.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        return res.status(500).json({ error: "Internal server error" });
      }
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      req.login(user, (err2) => {
        if (err2) {
          return res.status(500).json({ error: "Login failed" });
        }
        return res.status(200).json(user);
      });
    })(req, res, next);
  });
  app2.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  app2.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}

// server/routes.ts
import multer from "multer";
import path from "path";
import fs2 from "fs/promises";

// server/openai.ts
import fs from "fs/promises";
import axios from "axios";
import { setTimeout as promiseSetTimeout } from "timers/promises";
import { setTimeout as nodeSetTimeout, clearTimeout } from "timers";
import { v4 as uuidv4 } from "uuid";
var fromPath;
var getDocument;
try {
  ({ fromPath } = await import("pdf2pic"));
  console.log("[INFO] Successfully loaded pdf2pic module");
} catch (error) {
  console.error("[FATAL] Failed to load pdf2pic module", {
    error: error.message
  });
  throw new Error("pdf2pic module is not installed. Run `npm install pdf2pic`");
}
try {
  ({ getDocument } = await import("pdfjs-dist/legacy/build/pdf.js"));
  console.log("[INFO] Successfully loaded pdfjs-dist module");
} catch (error) {
  console.error("[FATAL] Failed to load pdfjs-dist module", {
    error: error.message
  });
  throw new Error(
    "pdfjs-dist module is not installed. Run `npm install pdfjs-dist@3.11.338`"
  );
}
var DocumentAnalysisService = class {
  config;
  apiKey;
  logger;
  constructor() {
    const apiKey = process.env.XAI_API_KEY_NEW || process.env.XAI_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("XAI_API_KEY or XAI_API_KEY_NEW is missing or invalid");
    }
    this.apiKey = apiKey;
    this.config = {
      baseURL: "https://api.x.ai/v1",
      timeout: 18e4,
      maxRetries: 3,
      initialRetryDelay: 500,
      maxFileSize: 10 * 1024 * 1024,
      // 10MB
      maxPagesToConvert: 5,
      maxJsonContentSize: 1e6
      // 1MB
    };
    this.logger = {
      info: (message, meta = {}) => console.log(`[INFO] ${message}`, meta),
      warn: (message, meta = {}) => console.warn(`[WARN] ${message}`, meta),
      error: (message, meta = {}) => console.error(`[ERROR] ${message}`, meta)
    };
    this.logger.info("DocumentAnalysisService initialized", {
      apiKeyLength: apiKey.length,
      config: this.config
    });
  }
  validateFile(fileName, fileBuffer) {
    if (!fileName) {
      throw new Error("File name is required");
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error("File buffer is empty or invalid");
    }
    if (fileBuffer.length > this.config.maxFileSize) {
      throw new Error(
        `File size exceeds maximum limit of ${this.config.maxFileSize / (1024 * 1024)}MB`
      );
    }
    if (!/\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
      throw new Error(
        "Unsupported file type. Supported types: PDF, JPG, JPEG, PNG, GIF, WEBP"
      );
    }
  }
  buildDocumentAnalysisPrompt(fileName, fileBuffer, documentText) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    const isPDF = /\.pdf$/i.test(fileName);
    const promptParts = [
      `Analyze this ${isImage ? "image" : "PDF document"} named "${fileName}" completely and extract all relevant mortgage loan information.`,
      "",
      "=== DOCUMENT ANALYSIS ===",
      `Document: ${fileName}`,
      `Size: ${Math.round(fileBuffer.length / 1024)}KB`,
      `Type: ${isImage ? "Image" : "PDF"}`,
      documentText ? `Content: ${documentText}` : "",
      // Removed 5000 character limit
      "",
      "=== EXTRACTION REQUIREMENTS ===",
      "First, identify what type of document this is (e.g., loan application, property deed, insurance policy, tax return, income statement, credit report, appraisal, settlement statement, etc.).",
      "",
      "SPECIAL HANDLING FOR CREDIT REPORTS:",
      "If this is a credit report, ONLY extract the following limited information:",
      "- Borrower's SSN",
      "- Borrower's current address (street, city, state, zip)",
      "- Credit scores from all three bureaus (Equifax, Experian, TransUnion)",
      "- Co-borrower's SSN (if present)",
      "- Co-borrower's current address (if present)",
      "- Co-borrower's credit scores (if present)",
      "DO NOT extract loan information, beneficiary/servicer details, or any other data from credit reports.",
      "",
      "For all other document types, extract ALL relevant information from the COMPLETE document including:",
      "- Property details: Extract complete address (street, city, state, zip separately), property type, property value/appraisal value, purchase price if available, APN (Assessor's Parcel Number) or Parcel Number",
      "- Loan information: Extract loan amount, interest rate (as percentage), loan term IN MONTHS (convert years to months), loan type, prepayment penalty terms and expiration date, late charge (amount or percentage), grace period (number of days)",
      "- Fee responsibility: Who pays monthly fees - B (Borrower), S (Beneficiary/Servicer), SP (Split between parties)",
      "- Down payment: Calculate from purchase price minus loan amount if not explicitly stated",
      "- Borrower information: Full name (individual and/or company), phone, email, SSN/EIN/TIN if present, annual income, complete mailing address (may differ from property), credit scores from all three bureaus (Equifax, Experian, TransUnion) if available",
      "- Co-Borrower information: Full name, phone, email, SSN/EIN/TIN if present, annual income, complete mailing address, credit scores from all three bureaus if available",
      "- Payment details: Monthly payment amount (principal + interest), monthly escrow amount, HOA fees if applicable",
      "- Financial details: Property value, down payment amount, closing costs, PMI amount, property taxes (annual), hazard insurance (annual)",
      "- Important dates: Closing/origination date, first payment due date, maturity date (calculate from origination + term), prepayment penalty expiration date",
      "- Trustee/Title Company: Company name, contact name if available, phone, email, complete street address (street, city, state, zip)",
      "- Beneficiary/Lender: Company name, contact name if available, phone, email, complete street address (street, city, state, zip)",
      "- Escrow Company: Company name, ESCROW NUMBER (very important), phone, email, complete street address (street, city, state, zip)",
      "- Investor information: Investor name, bank name, ABA/routing number, account number, account type (checking/savings)",
      "- Loan documents referenced: List all documents mentioned (Note, Deed of Trust, etc.)",
      "- Default conditions: Extract and summarize key events that constitute default",
      "- Insurance requirements: Specific types required and minimum coverage amounts",
      "- Cross-default parties: List any entities mentioned in cross-default clauses",
      "",
      "IMPORTANT EXTRACTION RULES:",
      "- For credit reports: ONLY extract SSN, current address, and credit scores - ignore all other information",
      "- Extract addresses with separate components (street, city, state, zip) - never combine into single field",
      "- The borrower's mailing address may be different from the property address - extract both",
      "- CALCULATE missing values when possible:",
      "  * If loan term is in years, convert to months (years \xD7 12)",
      "  * If down payment not stated but purchase price and loan amount are present: down payment = purchase price - loan amount",
      "  * If maturity date not stated but origination date and term are present: maturity date = origination date + term",
      "  * If property value not stated, use purchase price or appraisal value if available",
      "- Extract ALL numeric values as numbers, not strings (e.g., 250000 not '250000')",
      "- Extract percentages as numbers (e.g., 5.5 for 5.5%, not '5.5%')",
      "- Extract dates in YYYY-MM-DD format",
      "- Extract the ESCROW NUMBER if present anywhere in the document (may be labeled as 'Escrow #', 'File #', 'Order #', etc.)",
      "- Only return null if information is truly not present and cannot be calculated",
      "- For credit reports: Return null for ALL fields except SSN, addresses, and credit scores",
      "- For PDF documents, use both text content and images to ensure nothing is missed",
      "",
      "Return a JSON object with extracted data: {",
      '  "documentType": "document_category_here",',
      '  "extractedData": {',
      '    "propertyStreetAddress": "street_address_only_or_null",',
      '    "propertyCity": "city_only_or_null",',
      '    "propertyState": "state_only_or_null",',
      '    "propertyZipCode": "zip_code_only_or_null",',
      '    "propertyType": "extracted_value_or_null",',
      '    "propertyValue": number_or_null,',
      '    "apnNumber": "assessor_parcel_number_or_null",',
      '    "borrowerName": "extracted_value_or_null",',
      '    "borrowerCompanyName": "company_name_or_null",',
      '    "borrowerPhone": "phone_or_null",',
      '    "borrowerEmail": "email_or_null",',
      '    "borrowerSSN": "ssn_or_null",',
      '    "borrowerIncome": number_or_null,',
      '    "borrowerStreetAddress": "borrower_street_address_or_null",',
      '    "borrowerCity": "borrower_city_or_null",',
      '    "borrowerState": "borrower_state_or_null",',
      '    "borrowerZipCode": "borrower_zip_code_or_null",',
      '    "creditScoreEquifax": number_or_null,',
      '    "creditScoreExperian": number_or_null,',
      '    "creditScoreTransunion": number_or_null,',
      '    "coBorrowerName": "co_borrower_name_or_null",',
      '    "coBorrowerCompanyName": "co_borrower_company_or_null",',
      '    "coBorrowerPhone": "co_borrower_phone_or_null",',
      '    "coBorrowerEmail": "co_borrower_email_or_null",',
      '    "coBorrowerSSN": "co_borrower_ssn_or_null",',
      '    "coBorrowerIncome": number_or_null,',
      '    "coBorrowerStreetAddress": "co_borrower_street_or_null",',
      '    "coBorrowerCity": "co_borrower_city_or_null",',
      '    "coBorrowerState": "co_borrower_state_or_null",',
      '    "coBorrowerZipCode": "co_borrower_zip_or_null",',
      '    "coBorrowerCreditScoreEquifax": number_or_null,',
      '    "coBorrowerCreditScoreExperian": number_or_null,',
      '    "coBorrowerCreditScoreTransunion": number_or_null,',
      '    "loanAmount": number_or_null,',
      '    "interestRate": number_or_null,',
      '    "loanTermMonths": number_in_months_or_null,',
      '    "loanType": "extracted_value_or_null",',
      '    "lateCharge": "late_charge_amount_or_percentage_or_null",',
      '    "gracePeriod": number_of_days_or_null,',
      '    "feePayer": "B_or_S_or_SP_or_null",',
      '    "monthlyPayment": number_or_null,',
      '    "escrowAmount": number_or_null,',
      '    "hoaFees": number_or_null,',
      '    "downPayment": number_or_null,',
      '    "closingCosts": number_or_null,',
      '    "pmi": number_or_null,',
      '    "taxes": number_or_null,',
      '    "insurance": number_or_null,',
      '    "closingDate": "YYYY-MM-DD_or_null",',
      '    "firstPaymentDate": "YYYY-MM-DD_or_null",',
      '    "maturityDate": "YYYY-MM-DD_or_null",',
      '    "prepaymentExpirationDate": "YYYY-MM-DD_or_null",',
      '    "trusteeName": "extracted_value_or_null",',
      '    "trusteeCompanyName": "company_name_or_null",',
      '    "trusteePhone": "phone_or_null",',
      '    "trusteeEmail": "email_or_null",',
      '    "trusteeStreetAddress": "street_address_only_or_null",',
      '    "trusteeCity": "city_only_or_null",',
      '    "trusteeState": "state_only_or_null",',
      '    "trusteeZipCode": "zip_code_only_or_null",',
      '    "beneficiaryName": "extracted_value_or_null",',
      '    "beneficiaryCompanyName": "company_name_or_null",',
      '    "beneficiaryPhone": "phone_or_null",',
      '    "beneficiaryEmail": "email_or_null",',
      '    "beneficiaryStreetAddress": "street_address_only_or_null",',
      '    "beneficiaryCity": "city_only_or_null",',
      '    "beneficiaryState": "state_only_or_null",',
      '    "beneficiaryZipCode": "zip_code_only_or_null",',
      '    "escrowCompanyName": "name_or_null",',
      '    "escrowNumber": "escrow_number_or_null",',
      '    "escrowCompanyPhone": "phone_or_null",',
      '    "escrowCompanyEmail": "email_or_null",',
      '    "escrowCompanyStreetAddress": "street_or_null",',
      '    "escrowCompanyCity": "city_or_null",',
      '    "escrowCompanyState": "state_or_null",',
      '    "escrowCompanyZipCode": "zip_or_null",',
      '    "investorName": "investor_name_or_null",',
      '    "investorBankName": "bank_name_or_null",',
      '    "investorABANumber": "aba_routing_number_or_null",',
      '    "investorAccountNumber": "account_number_or_null",',
      '    "investorAccountType": "checking_or_savings_or_null",',
      '    "loanDocuments": ["array_of_documents_or_null"],',
      '    "defaultConditions": ["array_of_conditions_or_null"],',
      '    "insuranceRequirements": ["array_of_requirements_or_null"],',
      '    "crossDefaultParties": ["array_of_entities_or_null"]',
      "  },",
      '  "confidence": 0.85',
      "}",
      "",
      "IMPORTANT: Include the complete document context in the analysis and ensure accuracy with provided text."
    ];
    const prompt = promptParts.join("\n");
    this.logger.info("Generated document analysis prompt", {
      length: prompt.length
    });
    return prompt;
  }
  async extractPDFText(fileBuffer) {
    try {
      const uint8Array = new Uint8Array(fileBuffer);
      const pdf = await getDocument({ data: uint8Array }).promise;
      let text2 = "";
      const numPages = pdf.numPages;
      this.logger.info("Extracting text from PDF", { numPages });
      for (let i = 1; i <= numPages && i <= this.config.maxPagesToConvert; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(" ").trim();
        text2 += pageText + "\n";
        this.logger.info(`Extracted text from page ${i}`, {
          length: pageText.length
        });
      }
      text2 = text2.trim();
      if (text2.length > 0) {
        this.logger.info("Successfully extracted text from PDF", {
          length: text2.length
        });
        return text2;
      } else {
        this.logger.warn("Extracted PDF text is empty");
        return void 0;
      }
    } catch (error) {
      this.logger.error("PDF text extraction failed", { error: error.message });
      return void 0;
    }
  }
  async convertPDFToImages(fileBuffer) {
    const tempPdfPath = `/tmp/temp_${uuidv4()}.pdf`;
    const base64Images = [];
    let extractedText;
    try {
      extractedText = await this.extractPDFText(fileBuffer);
      this.logger.info("Attempting PDF to image conversion", {
        fileSize: fileBuffer.length
      });
      await fs.writeFile(tempPdfPath, fileBuffer);
      const convert = fromPath(tempPdfPath, {
        density: 300,
        saveFilename: "page",
        savePath: "/tmp/",
        format: "png",
        width: 2e3,
        height: 2800
      });
      for (let i = 1; i <= this.config.maxPagesToConvert; i++) {
        try {
          const page = await convert(i, { responseType: "buffer" });
          if (page.buffer && page.buffer.length > 1e3) {
            const base64Image = page.buffer.toString("base64");
            base64Images.push(base64Image);
            this.logger.info(`Converted PDF page ${i}`, {
              size: base64Image.length
            });
          } else {
            this.logger.warn(`PDF page ${i} has insufficient data`, {
              size: page.buffer?.length || 0
            });
          }
        } catch (pageError) {
          this.logger.warn(`Failed to convert PDF page ${i}`, {
            error: pageError.message
          });
          break;
        }
      }
    } catch (error) {
      this.logger.error("PDF image conversion failed", {
        error: error.message
      });
      if (!extractedText) {
        extractedText = await this.extractPDFText(fileBuffer);
      }
    } finally {
      await fs.unlink(tempPdfPath).catch(() => this.logger.warn("Failed to clean up temp PDF file"));
    }
    if (!extractedText && base64Images.length === 0) {
      throw new Error("Failed to extract text or images from PDF");
    }
    return { images: base64Images, text: extractedText };
  }
  async analyzeDocumentWithGrok(fileName, fileBuffer) {
    try {
      this.validateFile(fileName, fileBuffer);
      this.logger.info(`Processing document`, {
        fileName,
        size: fileBuffer.length
      });
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
      const isPDF = /\.pdf$/i.test(fileName);
      let documentText;
      if (isPDF) {
        const { text: text2 } = await this.convertPDFToImages(fileBuffer);
        documentText = text2;
      }
      const prompt = this.buildDocumentAnalysisPrompt(
        fileName,
        fileBuffer,
        documentText
      );
      const result = await this.generateDocumentAnalysisWithStreaming(
        prompt,
        fileName,
        fileBuffer
      );
      return {
        documentType: result.documentType || "unknown",
        extractedData: result.extractedData || {},
        confidence: result.confidence || 0.5
      };
    } catch (error) {
      this.logger.error("Failed to analyze document", { error: error.message });
      return {
        documentType: "unknown",
        extractedData: {},
        confidence: 0
      };
    }
  }
  async generateDocumentAnalysisWithStreaming(prompt, fileName, fileBuffer) {
    const modelsToTry = ["grok-4-0709"];
    let lastError = null;
    for (const model of modelsToTry) {
      this.logger.info(`Attempting analysis with model`, { model });
      for (let retryCount = 0; retryCount < this.config.maxRetries; retryCount++) {
        try {
          const startTime = Date.now();
          const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
          const isPDF = /\.pdf$/i.test(fileName);
          const content = [{ type: "text", text: prompt }];
          if (isImage) {
            content.push({
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${fileBuffer.toString("base64")}`
              }
            });
          } else if (isPDF) {
            const { images } = await this.convertPDFToImages(fileBuffer);
            if (images.length > 0) {
              images.forEach((base64Image) => {
                if (base64Image && base64Image.length > 1e3) {
                  content.push({
                    type: "image_url",
                    image_url: { url: `data:image/png;base64,${base64Image}` }
                  });
                }
              });
              this.logger.info(`Added images to request`, {
                count: images.length
              });
            } else {
              this.logger.warn(
                "No valid images extracted, using text-only prompt"
              );
            }
          }
          const response = await axios({
            url: `${this.config.baseURL}/chat/completions`,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`
            },
            data: {
              model,
              messages: [
                {
                  role: "system",
                  content: "You are an expert mortgage document analysis AI. Extract all relevant loan, property, borrower, trustee, beneficiary, and related information from the provided document with high accuracy. Do not generate fictitious data; return null for missing information."
                },
                {
                  role: "user",
                  content
                }
              ],
              response_format: { type: "json_object" },
              temperature: 0.1,
              max_tokens: 8e3,
              // Increased to avoid truncation
              stream: true
            },
            responseType: "stream",
            timeout: this.config.timeout,
            validateStatus: (status) => status === 200
          });
          this.logger.info(`API call initiated`, {
            model,
            duration: Date.now() - startTime,
            promptLength: prompt.length,
            contentItems: content.length
          });
          const result = await this.processDocumentStream(response);
          if (!result || !result.documentType && !result.extractedData) {
            throw new Error("No valid data in response");
          }
          this.logger.info(`Document analyzed successfully`, {
            model,
            documentType: result.documentType
          });
          return result;
        } catch (error) {
          lastError = error;
          const axiosError = error;
          this.logger.error(`Analysis attempt failed`, {
            model,
            retry: retryCount + 1,
            error: lastError.message
          });
          if (axiosError.response?.status === 429) {
            const delay2 = this.config.initialRetryDelay * Math.pow(2, retryCount);
            this.logger.warn(`Rate limited, retrying after ${delay2}ms`, {
              model,
              retry: retryCount + 1
            });
            await promiseSetTimeout(delay2);
            continue;
          }
          if (axiosError.response?.status === 400 || axiosError.response?.status === 404) {
            this.logger.warn(`Model ${model} not available, trying next model`);
            break;
          }
          if (axiosError.code === "ECONNABORTED") {
            this.logger.warn(
              `Timeout for ${model} attempt ${retryCount + 1}. Retrying in ${delay2}ms`
            );
            const delay2 = this.config.initialRetryDelay * Math.pow(2, retryCount);
            await promiseSetTimeout(delay2);
            continue;
          }
          if (retryCount === this.config.maxRetries - 1) {
            this.logger.warn(
              `Retries exhausted for ${model}, trying next model`
            );
            break;
          }
          const delay = this.config.initialRetryDelay * Math.pow(2, retryCount);
          await promiseSetTimeout(delay);
        }
      }
    }
    this.logger.error("All models failed", { lastError: lastError?.message });
    throw new Error(lastError?.message || "All model attempts failed");
  }
  async processDocumentStream(response) {
    let jsonContent = "";
    let buffer = "";
    let hasData = false;
    let chunkCount = 0;
    return new Promise((resolve, reject) => {
      const timeoutId = nodeSetTimeout(() => {
        if (!hasData) {
          this.logger.error(
            "No data received within 20 seconds, treating as failure"
          );
          reject(new Error("No data received from API within timeout"));
        }
      }, 2e4);
      response.data.on("data", (chunk) => {
        if (!hasData) clearTimeout(timeoutId);
        hasData = true;
        chunkCount++;
        const chunkStr = chunk.toString();
        buffer += chunkStr;
        if (chunkStr.trim()) hasData = true;
        this.logger.info(`Received chunk`, {
          length: chunkStr.length,
          chunkCount
        });
        if (jsonContent.length + chunkStr.length > this.config.maxJsonContentSize) {
          this.logger.error("JSON content size exceeds maximum limit", {
            currentSize: jsonContent.length,
            maxSize: this.config.maxJsonContentSize
          });
          reject(new Error("JSON content size exceeds maximum limit"));
          return;
        }
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              this.logger.info(
                `Stream completed. JSON content length: ${jsonContent.length}`
              );
              if (!jsonContent || jsonContent.length === 0) {
                this.logger.error("Empty response received from API");
                reject(new Error("Empty response from API"));
                return;
              }
              try {
                const cleanContent = jsonContent.replace(
                  /data: \[DONE\]\s*$/,
                  ""
                );
                const result = JSON.parse(cleanContent);
                if (result && (result.documentType || result.extractedData)) {
                  this.logger.info("Stream processing completed", {
                    resultLength: cleanContent.length
                  });
                  resolve(result);
                } else {
                  this.logger.error(
                    "Response lacks valid document analysis data",
                    {
                      contentSnippet: cleanContent.substring(0, 200)
                    }
                  );
                  reject(new Error("Invalid response format"));
                }
                return;
              } catch (e) {
                this.logger.error("JSON parse error in stream", {
                  error: e.message,
                  contentSnippet: jsonContent.substring(
                    Math.max(0, jsonContent.length - 200)
                  )
                });
                this.extractResultFromPartialJSON(jsonContent, resolve, reject);
                return;
              }
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                jsonContent += content;
              }
            } catch (e) {
              this.logger.warn("Non-JSON data in stream", {
                data: data.substring(0, 100)
              });
            }
          }
        }
      });
      response.data.on("end", () => {
        clearTimeout(timeoutId);
        if (!hasData || !jsonContent) {
          this.logger.error("Stream ended with no meaningful data");
          reject(new Error("No data received from API"));
          return;
        }
        try {
          const cleanContent = jsonContent.replace(/data: \[DONE\]\s*$/, "");
          const result = JSON.parse(cleanContent);
          if (result && (result.documentType || result.extractedData)) {
            this.logger.info("Stream completed", {
              resultLength: cleanContent.length
            });
            resolve(result);
          } else {
            this.logger.error(
              "Final response lacks valid document analysis data",
              {
                contentSnippet: cleanContent.substring(0, 200)
              }
            );
            reject(new Error("Invalid response format"));
          }
        } catch (e) {
          this.logger.error("Final JSON parse error", {
            error: e.message,
            contentSnippet: jsonContent.substring(
              Math.max(0, jsonContent.length - 200)
            )
          });
          this.extractResultFromPartialJSON(jsonContent, resolve, reject);
        }
      });
      response.data.on("error", (error) => {
        clearTimeout(timeoutId);
        this.logger.error("Stream error", { error: error.message });
        reject(new Error(`Stream error: ${error.message}`));
      });
    });
  }
  extractResultFromPartialJSON(content, resolve, reject) {
    if (!content.trim()) {
      this.logger.warn("No content to parse in partial JSON");
      reject(new Error("No content to parse in partial JSON"));
      return;
    }
    try {
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const jsonStr = content.substring(jsonStart, jsonEnd + 1);
        const result = JSON.parse(jsonStr);
        if (result && (result.documentType || result.extractedData)) {
          this.logger.info("Recovered result from partial JSON", {
            resultLength: jsonStr.length
          });
          resolve(result);
        } else {
          this.logger.error("Partial JSON lacks valid document analysis data", {
            contentSnippet: jsonStr.substring(0, 200)
          });
          reject(new Error("Invalid partial JSON format"));
        }
      } else {
        this.logger.error("No valid JSON structure in partial content", {
          contentSnippet: content.substring(0, 200)
        });
        reject(new Error("No valid JSON structure in partial content"));
      }
    } catch (e) {
      this.logger.error("Failed to extract result from partial JSON", {
        error: e.message,
        contentSnippet: content.substring(0, 200)
      });
      reject(new Error(`Failed to parse partial JSON: ${e.message}`));
    }
  }
};
async function analyzeDocument(filePath, fileName) {
  const service = new DocumentAnalysisService();
  try {
    const fileBuffer = await fs.readFile(filePath);
    return await service.analyzeDocumentWithGrok(fileName, fileBuffer);
  } catch (error) {
    service.logger.error("Error reading document file", {
      error: error.message
    });
    return {
      documentType: "unknown",
      extractedData: {},
      confidence: 0
    };
  }
}

// server/routes/fees.ts
init_db();
init_schema();
import { Router } from "express";
import { eq as eq2, and as and2, desc as desc2 } from "drizzle-orm";
var router = Router();
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}
router.get("/templates", requireAuth, async (req, res) => {
  try {
    const templates = await db2.select().from(feeTemplates).where(eq2(feeTemplates.lenderId, req.user.id)).orderBy(desc2(feeTemplates.isDefault), desc2(feeTemplates.createdAt));
    res.json(templates);
  } catch (error) {
    console.error("Error fetching fee templates:", error);
    res.status(500).json({ error: "Failed to fetch fee templates" });
  }
});
router.get("/templates/default", requireAuth, async (req, res) => {
  try {
    const [template] = await db2.select().from(feeTemplates).where(and2(
      eq2(feeTemplates.lenderId, req.user.id),
      eq2(feeTemplates.isDefault, true)
    )).limit(1);
    res.json(template || null);
  } catch (error) {
    console.error("Error fetching default template:", error);
    res.status(500).json({ error: "Failed to fetch default template" });
  }
});
router.post("/templates", requireAuth, async (req, res) => {
  try {
    const { templateName, description, fees, isDefault } = req.body;
    if (isDefault) {
      await db2.update(feeTemplates).set({ isDefault: false }).where(eq2(feeTemplates.lenderId, req.user.id));
    }
    const [template] = await db2.insert(feeTemplates).values({
      lenderId: req.user.id,
      templateName,
      description,
      fees,
      isDefault: isDefault || false
    }).returning();
    res.json(template);
  } catch (error) {
    console.error("Error creating fee template:", error);
    res.status(500).json({ error: "Failed to create fee template" });
  }
});
router.put("/templates/:id", requireAuth, async (req, res) => {
  try {
    const { templateName, description, fees, isDefault } = req.body;
    const templateId = parseInt(req.params.id);
    if (isDefault) {
      await db2.update(feeTemplates).set({ isDefault: false }).where(and2(
        eq2(feeTemplates.lenderId, req.user.id),
        eq2(feeTemplates.id, templateId)
      ));
    }
    const [template] = await db2.update(feeTemplates).set({
      templateName,
      description,
      fees,
      isDefault,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and2(
      eq2(feeTemplates.id, templateId),
      eq2(feeTemplates.lenderId, req.user.id)
    )).returning();
    res.json(template);
  } catch (error) {
    console.error("Error updating fee template:", error);
    res.status(500).json({ error: "Failed to update fee template" });
  }
});
router.delete("/templates/:id", requireAuth, async (req, res) => {
  try {
    await db2.delete(feeTemplates).where(and2(
      eq2(feeTemplates.id, parseInt(req.params.id)),
      eq2(feeTemplates.lenderId, req.user.id)
    ));
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting fee template:", error);
    res.status(500).json({ error: "Failed to delete fee template" });
  }
});
router.get("/loan/:loanId", requireAuth, async (req, res) => {
  try {
    const fees = await db2.select().from(loanFees).where(eq2(loanFees.loanId, parseInt(req.params.loanId))).orderBy(desc2(loanFees.createdAt));
    res.json(fees);
  } catch (error) {
    console.error("Error fetching loan fees:", error);
    res.status(500).json({ error: "Failed to fetch loan fees" });
  }
});
router.post("/loan/:loanId", requireAuth, async (req, res) => {
  try {
    const { feeType, feeName, feeAmount, feePercentage, frequency, chargeDate, dueDate, notes } = req.body;
    const [fee] = await db2.insert(loanFees).values({
      loanId: parseInt(req.params.loanId),
      feeType,
      feeName,
      feeAmount,
      feePercentage,
      frequency,
      chargeDate,
      dueDate,
      notes
    }).returning();
    res.json(fee);
  } catch (error) {
    console.error("Error adding loan fee:", error);
    res.status(500).json({ error: "Failed to add loan fee" });
  }
});
router.put("/loan-fee/:id", requireAuth, async (req, res) => {
  try {
    const { feeAmount, dueDate, paidDate, waived, waivedReason, notes } = req.body;
    const [fee] = await db2.update(loanFees).set({
      feeAmount,
      dueDate,
      paidDate,
      waived,
      waivedBy: waived ? req.user.id : null,
      waivedReason,
      notes,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq2(loanFees.id, parseInt(req.params.id))).returning();
    res.json(fee);
  } catch (error) {
    console.error("Error updating loan fee:", error);
    res.status(500).json({ error: "Failed to update loan fee" });
  }
});
router.delete("/loan-fee/:id", requireAuth, async (req, res) => {
  try {
    await db2.delete(loanFees).where(eq2(loanFees.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting loan fee:", error);
    res.status(500).json({ error: "Failed to delete loan fee" });
  }
});
router.post("/loan/:loanId/apply-template/:templateId", requireAuth, async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const templateId = parseInt(req.params.templateId);
    const [template] = await db2.select().from(feeTemplates).where(eq2(feeTemplates.id, templateId)).limit(1);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    const [loan] = await db2.select().from(loans).where(eq2(loans.id, loanId)).limit(1);
    if (!loan) {
      return res.status(404).json({ error: "Loan not found" });
    }
    const feesData = template.fees;
    const createdFees = [];
    for (const fee of feesData) {
      let feeAmount = fee.amount;
      if (fee.isPercentage && fee.percentage) {
        feeAmount = (parseFloat(loan.originalAmount) * fee.percentage / 100).toFixed(2);
      }
      const [createdFee] = await db2.insert(loanFees).values({
        loanId,
        feeType: fee.type,
        feeName: fee.name,
        feeAmount: feeAmount.toString(),
        feePercentage: fee.percentage?.toString(),
        frequency: fee.frequency,
        chargeDate: fee.chargeDate,
        dueDate: fee.dueDate,
        notes: `Applied from template: ${template.templateName}`
      }).returning();
      createdFees.push(createdFee);
    }
    res.json({ success: true, fees: createdFees });
  } catch (error) {
    console.error("Error applying template to loan:", error);
    res.status(500).json({ error: "Failed to apply template to loan" });
  }
});
var fees_default = router;

// server/routes/ledger.ts
init_db();
init_schema();
import { eq as eq3, desc as desc3 } from "drizzle-orm";
import { parse } from "json2csv";
import PDFDocument from "pdfkit";
import sgMail from "@sendgrid/mail";
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}
async function getLoanLedger(req, res) {
  try {
    const { loanId } = req.params;
    const entries = await db2.select().from(loanLedger).where(eq3(loanLedger.loanId, parseInt(loanId))).orderBy(loanLedger.transactionDate, loanLedger.id);
    res.json(entries);
  } catch (error) {
    console.error("Error fetching loan ledger:", error);
    res.status(500).json({ error: "Failed to fetch ledger entries" });
  }
}
async function addLedgerTransaction(req, res) {
  try {
    const { loanId } = req.params;
    const transaction = req.body;
    const userId = req.user?.id;
    console.log("Adding ledger transaction:", { loanId, transaction, userId });
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const lastEntry = await db2.select().from(loanLedger).where(eq3(loanLedger.loanId, parseInt(loanId))).orderBy(desc3(loanLedger.transactionDate), desc3(loanLedger.id)).limit(1);
    const lastBalance = lastEntry[0]?.runningBalance || "0";
    const lastPrincipalBalance = lastEntry[0]?.principalBalance || "0";
    const lastInterestBalance = lastEntry[0]?.interestBalance || "0";
    const debit = parseFloat(transaction.debitAmount || "0");
    const credit = parseFloat(transaction.creditAmount || "0");
    const newBalance = parseFloat(lastBalance) + credit - debit;
    let newPrincipalBalance = parseFloat(lastPrincipalBalance);
    let newInterestBalance = parseFloat(lastInterestBalance);
    if (transaction.transactionType === "principal") {
      if (credit > 0) {
        newPrincipalBalance += credit;
      } else if (debit > 0) {
        newPrincipalBalance -= debit;
      }
    } else if (transaction.transactionType === "interest") {
      if (credit > 0) {
        newInterestBalance += credit;
      } else if (debit > 0) {
        newInterestBalance -= debit;
      }
    }
    const approvalRequired = transaction.transactionType === "reversal" || debit > 1e4 || credit > 1e4;
    const [newEntry] = await db2.insert(loanLedger).values({
      loanId: parseInt(loanId),
      transactionDate: new Date(transaction.transactionDate),
      transactionId,
      description: transaction.description,
      transactionType: transaction.transactionType,
      category: transaction.category,
      debitAmount: transaction.debitAmount ? transaction.debitAmount.toString() : null,
      creditAmount: transaction.creditAmount ? transaction.creditAmount.toString() : null,
      runningBalance: newBalance.toFixed(2),
      principalBalance: newPrincipalBalance.toFixed(2),
      interestBalance: newInterestBalance.toFixed(2),
      status: approvalRequired ? "pending_approval" : "posted",
      approvalRequired,
      createdBy: userId,
      notes: transaction.notes,
      reversalOf: transaction.reversalOf
    }).returning();
    console.log("Transaction added successfully:", newEntry);
    res.json(newEntry);
  } catch (error) {
    console.error("Error adding ledger transaction:", error);
    res.status(500).json({ error: "Failed to add transaction" });
  }
}
async function approveLedgerTransaction(req, res) {
  try {
    const { transactionId } = req.params;
    const { approvalNotes } = req.body;
    const userId = req.user?.id;
    const [transaction] = await db2.select().from(loanLedger).where(eq3(loanLedger.id, parseInt(transactionId))).limit(1);
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    if (transaction.status !== "pending_approval") {
      return res.status(400).json({ error: "Transaction is not pending approval" });
    }
    const [updated] = await db2.update(loanLedger).set({
      status: "posted",
      approvedBy: userId,
      approvalDate: /* @__PURE__ */ new Date(),
      approvalNotes,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq3(loanLedger.id, parseInt(transactionId))).returning();
    res.json(updated);
  } catch (error) {
    console.error("Error approving transaction:", error);
    res.status(500).json({ error: "Failed to approve transaction" });
  }
}
async function exportLedgerToCSV(req, res) {
  try {
    const { loanId } = req.params;
    const entries = await db2.select().from(loanLedger).where(eq3(loanLedger.loanId, parseInt(loanId))).orderBy(loanLedger.transactionDate, loanLedger.id);
    const formattedEntries = entries.map((entry) => ({
      transactionDate: new Date(entry.transactionDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }),
      transactionId: entry.transactionId,
      description: entry.description,
      transactionType: entry.transactionType,
      debitAmount: entry.debitAmount ? parseFloat(entry.debitAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
      creditAmount: entry.creditAmount ? parseFloat(entry.creditAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
      runningBalance: parseFloat(entry.runningBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      principalBalance: parseFloat(entry.principalBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      status: entry.status
    }));
    const fields = [
      "transactionDate",
      "transactionId",
      "description",
      "transactionType",
      "debitAmount",
      "creditAmount",
      "runningBalance",
      "principalBalance",
      "status"
    ];
    const csv = parse(formattedEntries, { fields });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="loan-${loanId}-ledger.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("Error exporting ledger:", error);
    res.status(500).json({ error: "Failed to export ledger" });
  }
}
async function exportLedgerToPDF(req, res) {
  try {
    const { loanId } = req.params;
    const entries = await db2.select().from(loanLedger).where(eq3(loanLedger.loanId, parseInt(loanId))).orderBy(loanLedger.transactionDate, loanLedger.id);
    const loanData = await db2.select().from(loans).where(eq3(loans.id, parseInt(loanId))).limit(1);
    const doc = new PDFDocument();
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="loan-${loanId}-ledger.pdf"`);
      res.send(pdfData);
    });
    doc.fontSize(20).text("Loan Ledger Report", { align: "center" });
    doc.fontSize(12).text(`Loan Number: ${loanData[0]?.loanNumber || "N/A"}`, { align: "center" });
    doc.moveDown();
    doc.fontSize(10);
    doc.text("Date | Transaction | Description | Debit | Credit | Balance", { underline: true });
    doc.moveDown();
    entries.forEach((entry) => {
      const date2 = new Date(entry.transactionDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      const debit = entry.debitAmount ? parseFloat(entry.debitAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";
      const credit = entry.creditAmount ? parseFloat(entry.creditAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";
      const balance = parseFloat(entry.runningBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      doc.text(`${date2} | ${entry.transactionId} | ${entry.description} | ${debit} | ${credit} | ${balance}`);
    });
    doc.end();
  } catch (error) {
    console.error("Error exporting ledger to PDF:", error);
    res.status(500).json({ error: "Failed to export ledger" });
  }
}
async function emailLedger(req, res) {
  try {
    const { loanId } = req.params;
    const { recipientEmail, recipientName, format } = req.body;
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(400).json({ error: "Email service not configured" });
    }
    const entries = await db2.select().from(loanLedger).where(eq3(loanLedger.loanId, parseInt(loanId))).orderBy(loanLedger.transactionDate, loanLedger.id);
    const loanData = await db2.select().from(loans).where(eq3(loans.id, parseInt(loanId))).limit(1);
    let attachment;
    let filename;
    if (format === "csv") {
      const fields = [
        "transactionDate",
        "transactionId",
        "description",
        "transactionType",
        "debitAmount",
        "creditAmount",
        "runningBalance",
        "principalBalance",
        "status"
      ];
      const csv = parse(entries, { fields });
      attachment = Buffer.from(csv).toString("base64");
      filename = `loan-${loanId}-ledger.csv`;
    } else {
      const doc = new PDFDocument();
      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.fontSize(20).text("Loan Ledger Report", { align: "center" });
      doc.fontSize(12).text(`Loan Number: ${loanData[0]?.loanNumber || "N/A"}`, { align: "center" });
      doc.moveDown();
      entries.forEach((entry) => {
        const date2 = new Date(entry.transactionDate).toLocaleDateString();
        doc.fontSize(10).text(`${date2} - ${entry.description}: Debit: ${entry.debitAmount || "-"}, Credit: ${entry.creditAmount || "-"}, Balance: ${entry.runningBalance}`);
      });
      doc.end();
      await new Promise((resolve) => doc.on("end", resolve));
      attachment = Buffer.concat(buffers).toString("base64");
      filename = `loan-${loanId}-ledger.pdf`;
    }
    const msg = {
      to: recipientEmail,
      from: process.env.SENDGRID_FROM_EMAIL || "noreply@loanservepro.com",
      subject: `Loan Ledger Report - ${loanData[0]?.loanNumber || "Loan #" + loanId}`,
      text: `Dear ${recipientName},

Please find attached the loan ledger report for loan ${loanData[0]?.loanNumber || "#" + loanId}.

Best regards,
LoanServe Pro`,
      html: `<p>Dear ${recipientName},</p><p>Please find attached the loan ledger report for loan ${loanData[0]?.loanNumber || "#" + loanId}.</p><p>Best regards,<br>LoanServe Pro</p>`,
      attachments: [
        {
          content: attachment,
          filename,
          type: format === "csv" ? "text/csv" : "application/pdf",
          disposition: "attachment"
        }
      ]
    };
    await sgMail.send(msg);
    res.json({ success: true, message: "Ledger report sent successfully" });
  } catch (error) {
    console.error("Error emailing ledger:", error);
    res.status(500).json({ error: "Failed to email ledger report" });
  }
}
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}
function registerLedgerRoutes(app2) {
  app2.get("/api/loans/:loanId/ledger", isAuthenticated, getLoanLedger);
  app2.post("/api/loans/:loanId/ledger", isAuthenticated, addLedgerTransaction);
  app2.post("/api/ledger/:transactionId/approve", isAuthenticated, approveLedgerTransaction);
  app2.get("/api/loans/:loanId/ledger/export/csv", isAuthenticated, exportLedgerToCSV);
  app2.get("/api/loans/:loanId/ledger/export/pdf", isAuthenticated, exportLedgerToPDF);
  app2.post("/api/loans/:loanId/ledger/email", isAuthenticated, emailLedger);
  app2.get("/api/ledger/:transactionId/approve", isAuthenticated, (req, res) => {
    res.json({ message: "Use POST method for approval" });
  });
}

// server/routes.ts
init_schema();
function isAuthenticated2(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}
var uploadStorage = multer.diskStorage({
  destination: async function(req, file, cb) {
    const uploadDir = "server/uploads";
    try {
      await fs2.mkdir(uploadDir, { recursive: true });
    } catch (error) {
      console.error("Error creating upload directory:", error);
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});
var upload = multer({ storage: uploadStorage });
async function registerRoutes(app2) {
  await setupAuth(app2);
  app2.get("/api/borrowers", async (req, res) => {
    try {
      const borrowers = await storage.getBorrowerEntities();
      res.json(borrowers);
    } catch (error) {
      console.error("Error fetching borrowers:", error);
      res.status(500).json({ error: "Failed to fetch borrowers" });
    }
  });
  app2.get("/api/borrowers/:id", async (req, res) => {
    try {
      const borrower = await storage.getBorrowerEntity(parseInt(req.params.id));
      if (!borrower) {
        return res.status(404).json({ error: "Borrower not found" });
      }
      res.json(borrower);
    } catch (error) {
      console.error("Error fetching borrower:", error);
      res.status(500).json({ error: "Failed to fetch borrower" });
    }
  });
  app2.post("/api/borrowers", isAuthenticated2, async (req, res) => {
    try {
      const validatedData = insertBorrowerEntitySchema.parse(req.body);
      const borrower = await storage.createBorrowerEntity(validatedData);
      await storage.createAuditLog({
        userId: req.user?.id,
        action: "CREATE_BORROWER",
        entityType: "borrower",
        entityId: borrower.id,
        newValues: borrower
      });
      res.status(201).json(borrower);
    } catch (error) {
      console.error("Error creating borrower:", error);
      res.status(400).json({ error: "Invalid borrower data" });
    }
  });
  app2.put("/api/borrowers/:id", isAuthenticated2, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingBorrower = await storage.getBorrowerEntity(id);
      if (!existingBorrower) {
        return res.status(404).json({ error: "Borrower not found" });
      }
      const borrower = await storage.updateBorrowerEntity(id, req.body);
      await storage.createAuditLog({
        userId: req.user?.id,
        action: "UPDATE_BORROWER",
        entityType: "borrower",
        entityId: borrower.id,
        previousValues: existingBorrower,
        newValues: borrower
      });
      res.json(borrower);
    } catch (error) {
      console.error("Error updating borrower:", error);
      res.status(400).json({ error: "Failed to update borrower" });
    }
  });
  app2.get("/api/properties", async (req, res) => {
    try {
      const properties2 = await storage.getProperties();
      res.json(properties2);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ error: "Failed to fetch properties" });
    }
  });
  app2.get("/api/properties/:id", async (req, res) => {
    try {
      const property = await storage.getProperty(parseInt(req.params.id));
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      res.json(property);
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({ error: "Failed to fetch property" });
    }
  });
  app2.post("/api/properties", isAuthenticated2, async (req, res) => {
    try {
      const validatedData = insertPropertySchema.parse(req.body);
      const property = await storage.createProperty(validatedData);
      res.status(201).json(property);
    } catch (error) {
      console.error("Error creating property:", error);
      const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid property data";
      res.status(400).json({ error: errorMessage, details: error.issues || error.message });
    }
  });
  app2.put("/api/properties/:id", isAuthenticated2, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingProperty = await storage.getProperty(id);
      if (!existingProperty) {
        return res.status(404).json({ error: "Property not found" });
      }
      const property = await storage.updateProperty(id, req.body);
      await storage.createAuditLog({
        userId: req.user?.id,
        action: "UPDATE_PROPERTY",
        entityType: "property",
        entityId: property.id,
        previousValues: existingProperty,
        newValues: property
      });
      res.json(property);
    } catch (error) {
      console.error("Error updating property:", error);
      res.status(400).json({ error: "Failed to update property" });
    }
  });
  app2.get("/api/loans", async (req, res) => {
    try {
      const {
        lenderId,
        servicerId,
        investorId,
        status,
        limit = "50",
        offset = "0"
      } = req.query;
      const loans2 = await storage.getLoans({
        lenderId: lenderId ? parseInt(lenderId) : void 0,
        servicerId: servicerId ? parseInt(servicerId) : void 0,
        investorId: investorId ? parseInt(investorId) : void 0,
        status: status || void 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      res.json(loans2);
    } catch (error) {
      console.error("Error fetching loans:", error);
      res.status(500).json({ error: "Failed to fetch loans" });
    }
  });
  app2.get("/api/loans/metrics", async (req, res) => {
    try {
      const userId = req.user?.id;
      const metrics = await storage.getLoanMetrics(userId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching loan metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });
  app2.get("/api/loans/:id", async (req, res) => {
    try {
      const loan = await storage.getLoan(parseInt(req.params.id));
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      res.json(loan);
    } catch (error) {
      console.error("Error fetching loan:", error);
      res.status(500).json({ error: "Failed to fetch loan" });
    }
  });
  app2.post("/api/loans", isAuthenticated2, async (req, res) => {
    console.log("=== BACKEND: LOAN CREATION ENDPOINT CALLED (v2) ===");
    console.log("Request body received:", JSON.stringify(req.body, null, 2));
    try {
      console.log("Validating loan data with insertLoanSchema...");
      const validatedData = insertLoanSchema.parse(req.body);
      console.log("Validation successful. Validated data:", JSON.stringify(validatedData, null, 2));
      console.log("Calling storage.createLoan...");
      const loan = await storage.createLoan(validatedData);
      console.log("Loan created in database:", loan);
      console.log("Sending success response");
      res.status(201).json(loan);
    } catch (error) {
      console.error("=== BACKEND ERROR IN LOAN CREATION ===");
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);
      console.error("Error details:", error);
      if (error.issues) {
        console.error("Zod validation errors:", error.issues);
        error.issues.forEach((issue, index2) => {
          console.error(`Issue ${index2 + 1}:`, {
            path: issue.path.join("."),
            message: issue.message,
            code: issue.code
          });
        });
      }
      const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid loan data";
      res.status(400).json({ error: errorMessage, details: error.issues || error.message });
    }
  });
  app2.delete("/api/loans/:id", isAuthenticated2, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingLoan = await storage.getLoan(id);
      if (!existingLoan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      await storage.deleteLoan(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting loan:", error);
      res.status(400).json({ error: "Failed to delete loan" });
    }
  });
  const updateLoanHandler = async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingLoan = await storage.getLoan(id);
      if (!existingLoan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      const { createdAt, updatedAt, ...updateData } = req.body;
      const cleanedData = Object.entries(updateData).reduce((acc, [key, value]) => {
        const integerFields = [
          "gracePeriodDays",
          "loanTerm",
          "amortizationTerm",
          "balloonMonths",
          "prepaymentPenaltyTerm",
          "rateAdjustmentFrequency",
          "yearBuilt",
          "squareFeet",
          "bedrooms",
          "bathrooms",
          "stories",
          "garageSpaces"
        ];
        const numericFields = [
          "servicingFee",
          "lateCharge",
          "interestRate",
          "margin",
          "rateCapInitial",
          "rateCapPeriodic",
          "rateCapLifetime",
          "rateFloor",
          "balloonAmount",
          "prepaymentPenaltyAmount",
          "propertyValue",
          "originalAmount",
          "principalBalance",
          "paymentAmount",
          "monthlyEscrow",
          "monthlyMI",
          "originalLTV",
          "currentLTV",
          "combinedLTV",
          "propertyTax",
          "homeInsurance",
          "pmi",
          "otherMonthly",
          "hazardInsurance",
          "propertyTaxes",
          "hoaFees",
          "pmiAmount",
          "principalAndInterest",
          "escrowAmount",
          "closingCosts",
          "downPayment",
          "borrowerIncome",
          "coBorrowerIncome",
          "creditScoreEquifax",
          "creditScoreExperian",
          "creditScoreTransunion",
          "coBorrowerCreditScoreEquifax",
          "coBorrowerCreditScoreExperian",
          "coBorrowerCreditScoreTransunion",
          "purchasePrice",
          "originalAppraisalValue",
          "currentValue",
          "annualPropertyTax",
          "annualInsurance",
          "annualHOA",
          "lotSize",
          "rentalIncome"
        ];
        if ((integerFields.includes(key) || numericFields.includes(key)) && value === "") {
          acc[key] = null;
        } else {
          acc[key] = value;
        }
        return acc;
      }, {});
      const loan = await storage.updateLoan(id, cleanedData);
      res.json(loan);
    } catch (error) {
      console.error("Error updating loan:", error);
      res.status(400).json({ error: "Failed to update loan" });
    }
  };
  app2.put("/api/loans/:id", isAuthenticated2, updateLoanHandler);
  app2.patch("/api/loans/:id", isAuthenticated2, updateLoanHandler);
  app2.get("/api/loans/:loanId/borrowers", async (req, res) => {
    try {
      const loanBorrowers2 = await storage.getLoanBorrowers(parseInt(req.params.loanId));
      res.json(loanBorrowers2);
    } catch (error) {
      console.error("Error fetching loan borrowers:", error);
      res.status(500).json({ error: "Failed to fetch loan borrowers" });
    }
  });
  app2.post("/api/loans/:loanId/borrowers", isAuthenticated2, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertLoanBorrowerSchema.parse({
        ...req.body,
        loanId
      });
      const loanBorrower = await storage.createLoanBorrower(validatedData);
      res.status(201).json(loanBorrower);
    } catch (error) {
      console.error("Error creating loan borrower:", error);
      res.status(400).json({ error: "Invalid loan borrower data" });
    }
  });
  app2.delete("/api/loan-borrowers/:id", isAuthenticated2, async (req, res) => {
    try {
      await storage.deleteLoanBorrower(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting loan borrower:", error);
      res.status(400).json({ error: "Failed to delete loan borrower" });
    }
  });
  app2.get("/api/loans/:loanId/investors", async (req, res) => {
    try {
      const investors3 = await storage.getInvestorsByLoan(parseInt(req.params.loanId));
      res.json(investors3);
    } catch (error) {
      console.error("Error fetching investors:", error);
      res.status(500).json({ error: "Failed to fetch investors" });
    }
  });
  app2.post("/api/loans/:loanId/investors", isAuthenticated2, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const investorId = req.body.investorId || `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const validatedData = insertInvestorSchema.parse({
        ...req.body,
        loanId,
        investorId
      });
      const investor = await storage.createInvestor(validatedData);
      res.status(201).json(investor);
    } catch (error) {
      console.error("Error creating investor:", error);
      res.status(400).json({ error: "Invalid investor data" });
    }
  });
  app2.put("/api/investors/:id", isAuthenticated2, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { createdAt, updatedAt, ...updateData } = req.body;
      if (updateData.investmentDate) {
        updateData.investmentDate = typeof updateData.investmentDate === "string" ? updateData.investmentDate : new Date(updateData.investmentDate).toISOString().split("T")[0];
      }
      const investor = await storage.updateInvestor(id, updateData);
      res.json(investor);
    } catch (error) {
      console.error("Error updating investor:", error);
      res.status(400).json({ error: "Failed to update investor" });
    }
  });
  app2.delete("/api/investors/:id", isAuthenticated2, async (req, res) => {
    try {
      await storage.deleteInvestor(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting investor:", error);
      res.status(400).json({ error: "Failed to delete investor" });
    }
  });
  app2.get("/api/loans/:loanId/payments", async (req, res) => {
    try {
      const { limit = "50" } = req.query;
      const payments2 = await storage.getPayments(parseInt(req.params.loanId), parseInt(limit));
      res.json(payments2);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });
  app2.post("/api/loans/:loanId/payments", isAuthenticated2, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertPaymentSchema.parse({
        ...req.body,
        loanId
      });
      const payment = await storage.createPayment(validatedData);
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId,
        action: "CREATE_PAYMENT",
        entityType: "payment",
        entityId: payment.id,
        newValues: payment
      });
      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating payment:", error);
      res.status(400).json({ error: "Invalid payment data" });
    }
  });
  app2.put("/api/payments/:id", isAuthenticated2, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const payment = await storage.updatePayment(id, req.body);
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: payment.loanId,
        action: "UPDATE_PAYMENT",
        entityType: "payment",
        entityId: payment.id,
        newValues: payment
      });
      res.json(payment);
    } catch (error) {
      console.error("Error updating payment:", error);
      res.status(400).json({ error: "Failed to update payment" });
    }
  });
  app2.get("/api/loans/:loanId/payment-schedule", async (req, res) => {
    try {
      const schedule = await storage.getPaymentSchedule(parseInt(req.params.loanId));
      res.json(schedule);
    } catch (error) {
      console.error("Error fetching payment schedule:", error);
      res.status(500).json({ error: "Failed to fetch payment schedule" });
    }
  });
  app2.post("/api/loans/:loanId/payment-schedule", isAuthenticated2, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertPaymentScheduleSchema.parse({
        ...req.body,
        loanId
      });
      const schedule = await storage.createPaymentSchedule(validatedData);
      res.status(201).json(schedule);
    } catch (error) {
      console.error("Error creating payment schedule:", error);
      res.status(400).json({ error: "Invalid payment schedule data" });
    }
  });
  app2.post("/api/loans/:loanId/payment-schedule/generate", isAuthenticated2, async (req, res) => {
    try {
      const schedule = await storage.generatePaymentSchedule(parseInt(req.params.loanId));
      res.json(schedule);
    } catch (error) {
      console.error("Error generating payment schedule:", error);
      res.status(500).json({ error: "Failed to generate payment schedule" });
    }
  });
  app2.get("/api/loans/:loanId/escrow", async (req, res) => {
    try {
      const escrowAccount = await storage.getEscrowAccount(parseInt(req.params.loanId));
      if (!escrowAccount) {
        return res.status(404).json({ error: "Escrow account not found" });
      }
      res.json(escrowAccount);
    } catch (error) {
      console.error("Error fetching escrow account:", error);
      res.status(500).json({ error: "Failed to fetch escrow account" });
    }
  });
  app2.post("/api/loans/:loanId/escrow", isAuthenticated2, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertEscrowAccountSchema.parse({
        ...req.body,
        loanId
      });
      const escrowAccount = await storage.createEscrowAccount(validatedData);
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId,
        action: "CREATE_ESCROW_ACCOUNT",
        entityType: "escrow_account",
        entityId: escrowAccount.id,
        newValues: escrowAccount
      });
      res.status(201).json(escrowAccount);
    } catch (error) {
      console.error("Error creating escrow account:", error);
      res.status(400).json({ error: "Invalid escrow account data" });
    }
  });
  app2.put("/api/escrow/:id", isAuthenticated2, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const escrowAccount = await storage.updateEscrowAccount(id, req.body);
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: escrowAccount.loanId,
        action: "UPDATE_ESCROW_ACCOUNT",
        entityType: "escrow_account",
        entityId: escrowAccount.id,
        newValues: escrowAccount
      });
      res.json(escrowAccount);
    } catch (error) {
      console.error("Error updating escrow account:", error);
      res.status(400).json({ error: "Failed to update escrow account" });
    }
  });
  app2.get("/api/escrow/metrics", async (req, res) => {
    try {
      const metrics = await storage.getEscrowMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching escrow metrics:", error);
      res.status(500).json({ error: "Failed to fetch escrow metrics" });
    }
  });
  app2.get("/api/escrow-payments", async (req, res) => {
    try {
      const { limit = "10" } = req.query;
      const transactions = await storage.getEscrowTransactions({
        limit: parseInt(limit)
      });
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching escrow payments:", error);
      res.status(500).json({ error: "Failed to fetch escrow payments" });
    }
  });
  app2.get("/api/escrow/:escrowId/transactions", async (req, res) => {
    try {
      const { limit = "50" } = req.query;
      const transactions = await storage.getEscrowTransactions({
        escrowAccountId: parseInt(req.params.escrowId),
        limit: parseInt(limit)
      });
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching escrow transactions:", error);
      res.status(500).json({ error: "Failed to fetch escrow transactions" });
    }
  });
  app2.post("/api/escrow/:escrowId/transactions", isAuthenticated2, async (req, res) => {
    try {
      const escrowAccountId = parseInt(req.params.escrowId);
      const validatedData = insertEscrowTransactionSchema.parse({
        ...req.body,
        escrowAccountId
      });
      const transaction = await storage.createEscrowTransaction(validatedData);
      await storage.createAuditLog({
        userId: req.user?.id,
        action: "CREATE_ESCROW_TRANSACTION",
        entityType: "escrow_transaction",
        entityId: transaction.id,
        newValues: transaction
      });
      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating escrow transaction:", error);
      res.status(400).json({ error: "Invalid escrow transaction data" });
    }
  });
  app2.get("/api/escrow/:escrowId/items", async (req, res) => {
    try {
      const items = await storage.getEscrowItems(parseInt(req.params.escrowId));
      res.json(items);
    } catch (error) {
      console.error("Error fetching escrow items:", error);
      res.status(500).json({ error: "Failed to fetch escrow items" });
    }
  });
  app2.post("/api/escrow/:escrowId/items", isAuthenticated2, async (req, res) => {
    try {
      const escrowAccountId = parseInt(req.params.escrowId);
      const validatedData = insertEscrowItemSchema.parse({
        ...req.body,
        escrowAccountId
      });
      const item = await storage.createEscrowItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating escrow item:", error);
      res.status(400).json({ error: "Invalid escrow item data" });
    }
  });
  app2.post("/api/documents/upload", isAuthenticated2, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const { loanId, category, description } = req.body;
      if (!loanId) {
        return res.status(400).json({ error: "Loan ID is required" });
      }
      const document = await storage.createDocument({
        loanId: parseInt(loanId),
        category: category || "other",
        // Fixed: use 'other' instead of invalid 'loan_document'
        title: req.file.originalname,
        description: description || `Uploaded ${req.file.originalname}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        storageUrl: `/uploads/${req.file.filename}`,
        uploadedBy: req.user?.id,
        notes: req.body.notes || null
        // Store AI extraction JSON or other notes
      });
      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });
  app2.get("/api/documents", async (req, res) => {
    try {
      const { loanId, borrowerId, category } = req.query;
      const documents2 = await storage.getDocuments({
        loanId: loanId ? parseInt(loanId) : void 0,
        borrowerId: borrowerId ? parseInt(borrowerId) : void 0,
        category: category || void 0
      });
      res.json(documents2);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });
  app2.get("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });
  app2.delete("/api/documents/:id", isAuthenticated2, async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      await storage.deleteDocument(parseInt(req.params.id));
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });
  app2.get("/api/documents/:id/file", async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      let filePath = "";
      if (document.storageUrl) {
        if (document.storageUrl.startsWith("/documents/")) {
          filePath = path.join("server/uploads", document.storageUrl.replace("/documents/", ""));
        } else if (document.storageUrl.startsWith("/uploads/")) {
          filePath = path.join("server", document.storageUrl);
        } else {
          filePath = path.join("server/uploads", document.storageUrl);
        }
      } else {
        return res.status(404).json({ error: "File not found" });
      }
      try {
        await fs2.access(filePath);
        const fileName = document.fileName || document.originalFileName || "document";
        const mimeType = document.mimeType || "application/octet-stream";
        res.set({
          "Content-Type": mimeType,
          "Content-Disposition": `inline; filename="${fileName}"`,
          "Cache-Control": "public, max-age=3600",
          "X-Frame-Options": "SAMEORIGIN",
          "X-Content-Type-Options": "nosniff"
        });
        const fileStream = await fs2.readFile(filePath);
        res.send(fileStream);
      } catch (fileError) {
        console.error("File not found:", filePath);
        const fileName = document.fileName || document.originalFileName || "document";
        const mimeType = document.mimeType || "application/octet-stream";
        res.set({
          "Content-Type": "text/plain",
          "Content-Disposition": `inline; filename="${fileName}.txt"`,
          "Cache-Control": "public, max-age=3600"
        });
        const fallbackContent = `DOCUMENT: ${document.title || fileName}

This document was uploaded to the system but the file content is not available for preview.

Document Information:
- Type: ${document.category || "Document"}
- Created: ${new Date(document.createdAt).toLocaleDateString()}  
- File Size: ${document.fileSize ? Math.round(document.fileSize / 1024) + " KB" : "Unknown"}
- MIME Type: ${mimeType}
- Description: ${document.description || "No description available"}

To implement full file serving:
1. Upload actual files using the file upload endpoint
2. Store files in the server/uploads directory
3. Reference the correct file path in the database`;
        res.send(fallbackContent);
      }
    } catch (error) {
      console.error("Error serving document file:", error);
      res.status(500).json({ error: "Failed to serve document file" });
    }
  });
  function safeParseNumber(value, defaultValue = 0) {
    if (value === null || value === void 0 || value === "") return defaultValue;
    const parsed = typeof value === "string" ? parseFloat(value) : Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  function determineCategory(fileName) {
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes("loan") || lowerName.includes("application")) return "loan_application";
    if (lowerName.includes("agreement")) return "loan_agreement";
    if (lowerName.includes("note")) return "promissory_note";
    if (lowerName.includes("deed")) return "deed_of_trust";
    if (lowerName.includes("mortgage")) return "mortgage";
    if (lowerName.includes("insurance") || lowerName.includes("policy")) return "insurance_policy";
    if (lowerName.includes("tax")) return "tax_document";
    if (lowerName.includes("escrow")) return "escrow_statement";
    if (lowerName.includes("title")) return "title_report";
    if (lowerName.includes("appraisal")) return "appraisal";
    if (lowerName.includes("inspection")) return "inspection";
    if (lowerName.includes("financial") || lowerName.includes("statement")) return "financial_statement";
    if (lowerName.includes("income")) return "income_verification";
    if (lowerName.includes("closing")) return "closing_disclosure";
    if (lowerName.includes("settlement")) return "settlement_statement";
    return "other";
  }
  app2.post("/api/documents/upload", isAuthenticated2, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const category = determineCategory(req.file.originalname);
      const documentData = {
        title: req.body.title || req.file.originalname.split(".")[0],
        fileName: req.file.originalname,
        category: req.body.category || category,
        storageUrl: `/documents/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        description: req.body.description || "Uploaded via file upload",
        uploadedBy: req.user?.id,
        version: 1,
        isActive: true,
        loanId: req.body.loanId ? parseInt(req.body.loanId) : null,
        borrowerId: req.body.borrowerId ? parseInt(req.body.borrowerId) : null,
        notes: req.body.notes || null
        // Store AI extraction JSON or other notes
      };
      const validatedData = insertDocumentSchema.parse(documentData);
      const document = await storage.createDocument(validatedData);
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: document.loanId,
        action: "CREATE_DOCUMENT",
        entityType: "document",
        entityId: document.id,
        newValues: document
      });
      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(400).json({ error: "Failed to upload document" });
    }
  });
  app2.post("/api/documents", isAuthenticated2, async (req, res) => {
    try {
      const validatedData = insertDocumentSchema.parse({
        ...req.body,
        uploadedBy: req.user?.id
      });
      const document = await storage.createDocument(validatedData);
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: document.loanId,
        action: "CREATE_DOCUMENT",
        entityType: "document",
        entityId: document.id,
        newValues: document
      });
      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(400).json({ error: "Invalid document data" });
    }
  });
  app2.put("/api/documents/:id", isAuthenticated2, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingDocument = await storage.getDocument(id);
      if (!existingDocument) {
        return res.status(404).json({ error: "Document not found" });
      }
      const document = await storage.updateDocument(id, req.body);
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: document.loanId,
        action: "UPDATE_DOCUMENT",
        entityType: "document",
        entityId: document.id,
        previousValues: existingDocument,
        newValues: document
      });
      res.json(document);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(400).json({ error: "Failed to update document" });
    }
  });
  app2.delete("/api/documents/:id", isAuthenticated2, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      await storage.deleteDocument(id);
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: document.loanId,
        action: "DELETE_DOCUMENT",
        entityType: "document",
        entityId: document.id,
        previousValues: document
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(400).json({ error: "Failed to delete document" });
    }
  });
  app2.get("/api/notifications", isAuthenticated2, async (req, res) => {
    try {
      const { limit = "20" } = req.query;
      const notifications2 = await storage.getNotifications(req.user.id, parseInt(limit));
      res.json(notifications2);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });
  app2.get("/api/notifications/unread-count", isAuthenticated2, async (req, res) => {
    try {
      const count2 = await storage.getUnreadNotificationCount(req.user.id);
      res.json({ count: count2 });
    } catch (error) {
      console.error("Error fetching unread notification count:", error);
      res.status(500).json({ error: "Failed to fetch notification count" });
    }
  });
  app2.post("/api/notifications", isAuthenticated2, async (req, res) => {
    try {
      const validatedData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(validatedData);
      res.status(201).json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(400).json({ error: "Invalid notification data" });
    }
  });
  app2.put("/api/notifications/:id/read", isAuthenticated2, async (req, res) => {
    try {
      await storage.markNotificationAsRead(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(400).json({ error: "Failed to mark notification as read" });
    }
  });
  app2.post("/api/migrate-database", isAuthenticated2, async (req, res) => {
    try {
      if (req.user?.username !== "loanatik") {
        return res.status(403).json({
          success: false,
          error: "Only administrators can run database migrations"
        });
      }
      const details = [];
      const migrations = [
        // Servicing settings
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS servicing_fee_type text DEFAULT 'percentage'`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS late_charge_type text DEFAULT 'percentage'`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS fee_payer text`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS grace_period_days integer`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS investor_loan_number text`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS pool_number text`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS late_charge decimal(10, 2)`,
        // Payment settings
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS property_tax decimal(10, 2)`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS home_insurance decimal(10, 2)`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS pmi decimal(10, 2)`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS other_monthly decimal(10, 2)`,
        // Other fields
        `ALTER TABLE properties ADD COLUMN IF NOT EXISTS apn text`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS escrow_number text`
      ];
      for (const migration of migrations) {
        try {
          await db.execute(sql.raw(migration));
          const columnName = migration.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1];
          details.push(`\u2713 Added column: ${columnName}`);
        } catch (error) {
          if (error.code === "42701") {
            const columnName = migration.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1];
            details.push(`\u2713 Column already exists: ${columnName}`);
          } else {
            details.push(`\u2717 Error: ${error.message}`);
          }
        }
      }
      res.json({ success: true, details });
    } catch (error) {
      console.error("Error running migration:", error);
      res.status(500).json({
        success: false,
        error: "Failed to run migration",
        details: []
      });
    }
  });
  app2.get("/api/audit-logs/:entityType/:entityId", isAuthenticated2, async (req, res) => {
    try {
      const logs = await storage.getAuditLogs(req.params.entityType, parseInt(req.params.entityId));
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });
  app2.use("/api/fees", fees_default);
  registerLedgerRoutes(app2);
  app2.post("/api/documents/analyze", upload.single("file"), isAuthenticated2, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      console.log(`[Document Analysis] Starting analysis for: ${req.file.originalname}, Size: ${req.file.size} bytes`);
      const result = await analyzeDocument(req.file.path, req.file.originalname || req.file.filename);
      if (result.documentType === "unknown" && result.confidence === 0) {
        console.error(`[Document Analysis] Failed to analyze ${req.file.originalname} - returning error`);
        return res.status(500).json({ error: "Document analysis failed - document may be too complex or large" });
      }
      console.log(`[Document Analysis] Successfully analyzed: ${req.file.originalname}, Type: ${result.documentType}`);
      res.json(result);
    } catch (error) {
      console.error(`[Document Analysis] Error analyzing ${req.file?.originalname}:`, error.message);
      console.error("Full error:", error);
      res.status(500).json({ error: `Failed to analyze document: ${error.message || "Unknown error"}` });
    }
  });
  app2.post("/api/loans/create-from-documents", isAuthenticated2, async (req, res) => {
    try {
      const { extractedData, documentTypes } = req.body;
      const loanAmount = safeParseNumber(extractedData.loanAmount);
      const loanTerm = safeParseNumber(extractedData.loanTerm, 30);
      const loanData = {
        borrowerName: extractedData.borrowerName || "Unknown",
        propertyAddress: extractedData.propertyAddress || "Unknown",
        loanAmount,
        interestRate: safeParseNumber(extractedData.interestRate),
        loanTerm,
        monthlyPayment: safeParseNumber(extractedData.monthlyPayment),
        loanStatus: "active",
        originationDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        maturityDate: new Date(Date.now() + loanTerm * 365 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0],
        remainingBalance: loanAmount,
        nextPaymentDate: extractedData.firstPaymentDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0],
        nextPaymentAmount: safeParseNumber(extractedData.monthlyPayment),
        servicingFee: 25,
        // Default servicing fee
        // Additional extracted fields
        loanType: extractedData.loanType || "conventional",
        propertyType: extractedData.propertyType || "single_family",
        propertyValue: safeParseNumber(extractedData.propertyValue),
        downPayment: safeParseNumber(extractedData.downPayment),
        closingCosts: safeParseNumber(extractedData.closingCosts),
        pmiAmount: safeParseNumber(extractedData.pmi),
        hazardInsurance: safeParseNumber(extractedData.insurance),
        propertyTaxes: safeParseNumber(extractedData.taxes),
        hoaFees: safeParseNumber(extractedData.hoaFees),
        escrowAmount: safeParseNumber(extractedData.escrowAmount)
      };
      const validatedData = insertLoanSchema.parse(loanData);
      const loan = await storage.createLoan(validatedData);
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: loan.id,
        action: "CREATE_LOAN_AI",
        entityType: "loan",
        entityId: loan.id,
        newValues: { ...loan, documentTypes }
      });
      res.status(201).json(loan);
    } catch (error) {
      console.error("Error creating loan from documents:", error);
      res.status(400).json({ error: "Failed to create loan from extracted data" });
    }
  });
  const escrowDisbursementRoutes = await Promise.resolve().then(() => (init_escrow_disbursements(), escrow_disbursements_exports));
  app2.use(escrowDisbursementRoutes.default);
  const servicingCycleRoutes = await Promise.resolve().then(() => (init_servicing_cycle(), servicing_cycle_exports));
  app2.use("/api/servicing-cycle", servicingCycleRoutes.default);
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs3 from "fs";
import path3 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path2 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path2.resolve(import.meta.dirname, "client", "src"),
      "@shared": path2.resolve(import.meta.dirname, "shared"),
      "@assets": path2.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path2.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path2.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs3.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path3.resolve(import.meta.dirname, "public");
  if (!fs3.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path4 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path4.startsWith("/api")) {
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  if (process.env.NODE_ENV === "production") {
    const { runMigrations: runMigrations2 } = await Promise.resolve().then(() => (init_migrations(), migrations_exports));
    await runMigrations2();
  }
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
