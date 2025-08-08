import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  timestamp, 
  decimal, 
  integer, 
  boolean, 
  jsonb,
  uuid,
  pgEnum
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", [
  "lender", 
  "borrower", 
  "investor", 
  "escrow_officer", 
  "legal"
]);

export const loanStatusEnum = pgEnum("loan_status", [
  "originated",
  "active", 
  "current",
  "delinquent_30",
  "delinquent_60", 
  "delinquent_90",
  "foreclosure",
  "bankruptcy",
  "paid_off",
  "charged_off"
]);

export const documentTypeEnum = pgEnum("document_type", [
  "loan_application",
  "credit_report",
  "income_verification",
  "property_appraisal",
  "insurance_policy",
  "property_deed",
  "tax_return",
  "bank_statement",
  "legal_document",
  "correspondence"
]);

export const paymentTypeEnum = pgEnum("payment_type", [
  "principal_interest",
  "escrow_taxes",
  "escrow_insurance", 
  "escrow_hoa",
  "late_fee",
  "other_fee"
]);

export const escrowTypeEnum = pgEnum("escrow_type", [
  "property_tax",
  "hazard_insurance",
  "pmi_insurance",
  "hoa_fees",
  "flood_insurance",
  "other"
]);

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: userRoleEnum("role").notNull(),
  company: text("company"),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Loans table
export const loans = pgTable("loans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanNumber: text("loan_number").notNull().unique(),
  borrowerId: uuid("borrower_id").references(() => users.id),
  lenderId: uuid("lender_id").references(() => users.id),
  investorId: uuid("investor_id").references(() => users.id),
  originalAmount: decimal("original_amount", { precision: 15, scale: 2 }).notNull(),
  currentBalance: decimal("current_balance", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 4 }).notNull(),
  termMonths: integer("term_months").notNull(),
  monthlyPayment: decimal("monthly_payment", { precision: 10, scale: 2 }).notNull(),
  nextPaymentDate: timestamp("next_payment_date"),
  maturityDate: timestamp("maturity_date"),
  status: loanStatusEnum("status").default("originated"),
  propertyAddress: text("property_address").notNull(),
  propertyCity: text("property_city").notNull(),
  propertyState: text("property_state").notNull(),
  propertyZip: text("property_zip").notNull(),
  propertyValue: decimal("property_value", { precision: 15, scale: 2 }),
  loanToValue: decimal("loan_to_value", { precision: 5, scale: 4 }),
  originationDate: timestamp("origination_date").defaultNow(),
  firstPaymentDate: timestamp("first_payment_date"),
  payoffDate: timestamp("payoff_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Payments table
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid("loan_id").references(() => loans.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  principalAmount: decimal("principal_amount", { precision: 10, scale: 2 }).default("0"),
  interestAmount: decimal("interest_amount", { precision: 10, scale: 2 }).default("0"),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }).default("0"),
  feesAmount: decimal("fees_amount", { precision: 10, scale: 2 }).default("0"),
  paymentType: paymentTypeEnum("payment_type").notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  receivedDate: timestamp("received_date").defaultNow(),
  paymentMethod: text("payment_method"), // ACH, Check, Wire, etc.
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  processedBy: uuid("processed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow()
});

// Escrow Accounts table
export const escrowAccounts = pgTable("escrow_accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid("loan_id").references(() => loans.id),
  escrowType: escrowTypeEnum("escrow_type").notNull(),
  currentBalance: decimal("current_balance", { precision: 10, scale: 2 }).default("0"),
  monthlyPayment: decimal("monthly_payment", { precision: 10, scale: 2 }).notNull(),
  annualAmount: decimal("annual_amount", { precision: 10, scale: 2 }).notNull(),
  lastAnalysisDate: timestamp("last_analysis_date"),
  nextAnalysisDate: timestamp("next_analysis_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Escrow Payments table
export const escrowPayments = pgTable("escrow_payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  escrowAccountId: uuid("escrow_account_id").references(() => escrowAccounts.id),
  loanId: uuid("loan_id").references(() => loans.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  payeeName: text("payee_name").notNull(),
  payeeAddress: text("payee_address"),
  paymentDate: timestamp("payment_date").notNull(),
  dueDate: timestamp("due_date"),
  status: text("status").default("pending"), // pending, approved, paid, cancelled
  checkNumber: text("check_number"),
  confirmationNumber: text("confirmation_number"),
  notes: text("notes"),
  approvedBy: uuid("approved_by").references(() => users.id),
  processedBy: uuid("processed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Documents table
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid("loan_id").references(() => loans.id),
  borrowerId: uuid("borrower_id").references(() => users.id),
  documentType: documentTypeEnum("document_type").notNull(),
  fileName: text("file_name").notNull(),
  originalFileName: text("original_file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  filePath: text("file_path").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  tags: text("tags").array(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  isRequired: boolean("is_required").default(false),
  expirationDate: timestamp("expiration_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Audit Log table
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id),
  loanId: uuid("loan_id").references(() => loans.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow()
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id),
  loanId: uuid("loan_id").references(() => loans.id),
  type: text("type").notNull(), // payment_due, document_required, etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  priority: text("priority").default("normal"), // low, normal, high, urgent
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow()
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true
});

export const insertLoanSchema = createInsertSchema(loans).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  receivedDate: true
});

export const insertEscrowAccountSchema = createInsertSchema(escrowAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertEscrowPaymentSchema = createInsertSchema(escrowPayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Loan = typeof loans.$inferSelect;
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type EscrowAccount = typeof escrowAccounts.$inferSelect;
export type InsertEscrowAccount = z.infer<typeof insertEscrowAccountSchema>;
export type EscrowPayment = typeof escrowPayments.$inferSelect;
export type InsertEscrowPayment = z.infer<typeof insertEscrowPaymentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
