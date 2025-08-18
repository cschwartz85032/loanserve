import { 
  users, 
  loans, 
  payments, 
  escrowAccounts, 
  escrowTransactions, 
  documents, 
  auditLogs, 
  notifications,
  borrowerEntities,
  properties,
  loanBorrowers,
  paymentSchedule,
  escrowDisbursements,
  escrowDisbursementPayments,
  type User, 
  type InsertUser,
  type Loan,
  type InsertLoan,
  type Payment,
  type InsertPayment,
  type EscrowAccount,
  type InsertEscrowAccount,
  type EscrowTransaction,
  type InsertEscrowTransaction,
  type Document,
  type InsertDocument,
  type AuditLog,
  type InsertAuditLog,
  type Notification,
  type InsertNotification,
  type BorrowerEntity,
  type InsertBorrowerEntity,
  type Property,
  type InsertProperty,
  type LoanBorrower,
  type InsertLoanBorrower,
  type PaymentSchedule,
  type InsertPaymentSchedule,
  type EscrowDisbursement,
  type InsertEscrowDisbursement,
  type EscrowDisbursementPayment,
  type InsertEscrowDisbursementPayment,
  investors,
  type Investor,
  type InsertInvestor
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql, count, sum, isNull, gte } from "drizzle-orm";
import session, { Store } from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;

  // Borrower Entity methods
  getBorrowerEntity(id: number): Promise<BorrowerEntity | undefined>;
  createBorrowerEntity(entity: InsertBorrowerEntity): Promise<BorrowerEntity>;
  updateBorrowerEntity(id: number, entity: Partial<InsertBorrowerEntity>): Promise<BorrowerEntity>;
  getBorrowerEntities(): Promise<BorrowerEntity[]>;

  // Property methods
  getProperty(id: number): Promise<Property | undefined>;
  createProperty(property: InsertProperty): Promise<Property>;
  updateProperty(id: number, property: Partial<InsertProperty>): Promise<Property>;
  getProperties(): Promise<Property[]>;

  // Loan methods
  getLoans(filters?: {
    lenderId?: number;
    servicerId?: number;
    investorId?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Loan[]>;
  getLoan(id: number): Promise<Loan | undefined>;
  getLoanByNumber(loanNumber: string): Promise<Loan | undefined>;
  createLoan(loan: InsertLoan): Promise<Loan>;
  updateLoan(id: number, loan: Partial<InsertLoan>): Promise<Loan>;
  deleteLoan(id: number): Promise<void>;
  getLoanMetrics(userId?: number): Promise<{
    totalPortfolio: string;
    activeLoans: number;
    delinquentLoans: number;
    collectionsYTD: string;
  }>;

  // Loan Borrower methods
  getLoanBorrowers(loanId: number): Promise<LoanBorrower[]>;
  createLoanBorrower(loanBorrower: InsertLoanBorrower): Promise<LoanBorrower>;
  deleteLoanBorrower(id: number): Promise<void>;

  // Investor methods
  getInvestorsByLoan(loanId: number): Promise<Investor[]>;
  createInvestor(investor: InsertInvestor): Promise<Investor>;
  updateInvestor(id: number, investor: Partial<InsertInvestor>): Promise<Investor>;
  deleteInvestor(id: number): Promise<void>;

  // Payment methods
  getPayments(loanId: number, limit?: number): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentHistory(loanId: number): Promise<Payment[]>;
  updatePayment(id: number, payment: Partial<InsertPayment>): Promise<Payment>;

  // Payment Schedule methods
  getPaymentSchedule(loanId: number): Promise<PaymentSchedule[]>;
  createPaymentSchedule(schedule: InsertPaymentSchedule): Promise<PaymentSchedule>;
  generatePaymentSchedule(loanId: number): Promise<PaymentSchedule[]>;

  // Escrow methods
  getEscrowAccount(loanId: number): Promise<EscrowAccount | undefined>;
  createEscrowAccount(escrowAccount: InsertEscrowAccount): Promise<EscrowAccount>;
  updateEscrowAccount(id: number, escrowAccount: Partial<InsertEscrowAccount>): Promise<EscrowAccount>;
  getEscrowTransactions(filters?: {
    escrowAccountId?: number;
    limit?: number;
  }): Promise<EscrowTransaction[]>;
  createEscrowTransaction(transaction: InsertEscrowTransaction): Promise<EscrowTransaction>;
  getEscrowItems(escrowAccountId: number): Promise<any[]>;
  createEscrowItem(item: any): Promise<any>;
  getEscrowMetrics(): Promise<{
    totalBalance: string;
    pendingDisbursements: string;
    shortages: string;
    surpluses: string;
  }>;

  // Escrow Disbursement methods
  getEscrowDisbursements(loanId: number): Promise<EscrowDisbursement[]>;
  getEscrowDisbursement(id: number): Promise<EscrowDisbursement | undefined>;
  createEscrowDisbursement(disbursement: InsertEscrowDisbursement): Promise<EscrowDisbursement>;
  updateEscrowDisbursement(id: number, disbursement: Partial<InsertEscrowDisbursement>): Promise<EscrowDisbursement>;
  deleteEscrowDisbursement(id: number): Promise<void>;
  holdEscrowDisbursement(id: number, reason?: string, requestedBy?: string): Promise<EscrowDisbursement>;
  releaseEscrowDisbursement(id: number): Promise<EscrowDisbursement>;
  getEscrowSummary(loanId: number): Promise<{
    summary: {
      totalDisbursements: number;
      activeDisbursements: number;
      onHoldDisbursements: number;
      totalAnnualAmount: string;
    };
  }>;

  // Document methods
  getDocuments(filters?: {
    loanId?: number;
    borrowerId?: number;
    category?: string;
  }): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: number): Promise<Document | undefined>;
  updateDocument(id: number, document: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;

  // Audit methods
  createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(entityType: string, entityId: number): Promise<AuditLog[]>;

  // Notification methods
  getNotifications(userId: number, limit?: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<void>;
  getUnreadNotificationCount(userId: number): Promise<number>;

  sessionStore: Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: number, updateUser: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updateUser, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Borrower Entity methods
  async getBorrowerEntity(id: number): Promise<BorrowerEntity | undefined> {
    const [entity] = await db.select().from(borrowerEntities).where(eq(borrowerEntities.id, id));
    return entity || undefined;
  }

  async createBorrowerEntity(entity: InsertBorrowerEntity): Promise<BorrowerEntity> {
    const [borrower] = await db
      .insert(borrowerEntities)
      .values(entity)
      .returning();
    return borrower;
  }

  async updateBorrowerEntity(id: number, entity: Partial<InsertBorrowerEntity>): Promise<BorrowerEntity> {
    const [borrower] = await db
      .update(borrowerEntities)
      .set({ ...entity, updatedAt: new Date() })
      .where(eq(borrowerEntities.id, id))
      .returning();
    return borrower;
  }

  async getBorrowerEntities(): Promise<BorrowerEntity[]> {
    return await db.select().from(borrowerEntities).where(eq(borrowerEntities.isActive, true));
  }

  // Property methods
  async getProperty(id: number): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property || undefined;
  }

  async createProperty(property: InsertProperty): Promise<Property> {
    const [prop] = await db
      .insert(properties)
      .values(property)
      .returning();
    return prop;
  }

  async updateProperty(id: number, property: Partial<InsertProperty>): Promise<Property> {
    const [prop] = await db
      .update(properties)
      .set({ ...property, updatedAt: new Date() })
      .where(eq(properties.id, id))
      .returning();
    return prop;
  }

  async getProperties(): Promise<Property[]> {
    return await db.select().from(properties).orderBy(desc(properties.createdAt));
  }

  // Loan methods
  async getLoans(filters: {
    lenderId?: number;
    servicerId?: number;
    investorId?: number;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    let query = db.select().from(loans)
      .leftJoin(properties, eq(loans.propertyId, properties.id));

    const conditions = [];
    if (filters.lenderId) conditions.push(eq(loans.lenderId, filters.lenderId));
    if (filters.servicerId) conditions.push(eq(loans.servicerId, filters.servicerId));
    if (filters.investorId) conditions.push(eq(loans.investorId, filters.investorId));
    if (filters.status) conditions.push(eq(loans.status, filters.status as any));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    query = query.orderBy(desc(loans.createdAt)) as any;

    if (filters.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters.offset) {
      query = query.offset(filters.offset) as any;
    }

    const result = await query;
    // Transform the result to include property data at the right level
    return result.map(row => ({
      ...row.loans,
      property: row.properties
    })) as any[];
  }

  async getLoan(id: number): Promise<Loan | undefined> {
    const [loan] = await db.select().from(loans).where(eq(loans.id, id));
    return loan || undefined;
  }

  async getLoanByNumber(loanNumber: string): Promise<Loan | undefined> {
    const [loan] = await db.select().from(loans).where(eq(loans.loanNumber, loanNumber));
    return loan || undefined;
  }

  async createLoan(insertLoan: InsertLoan): Promise<Loan> {
    const [loan] = await db
      .insert(loans)
      .values(insertLoan)
      .returning();
    return loan;
  }

  async updateLoan(id: number, updateLoan: Partial<InsertLoan>): Promise<Loan> {
    // Remove any undefined values and convert dates properly
    const cleanUpdateData = { ...updateLoan };
    
    // Handle date conversions and remove problematic fields
    Object.keys(cleanUpdateData).forEach(key => {
      const value = cleanUpdateData[key as keyof typeof cleanUpdateData];
      
      // Remove undefined values
      if (value === undefined) {
        delete cleanUpdateData[key as keyof typeof cleanUpdateData];
      }
      
      // Convert date strings to Date objects for timestamp fields
      if (value && typeof value === 'string' && 
          (key.includes('Date') || key === 'createdAt' || key === 'updatedAt')) {
        try {
          cleanUpdateData[key as keyof typeof cleanUpdateData] = new Date(value) as any;
        } catch (e) {
          // If date conversion fails, remove the field
          delete cleanUpdateData[key as keyof typeof cleanUpdateData];
        }
      }
    });
    
    // Always remove createdAt and updatedAt as they're managed by the database
    delete cleanUpdateData.createdAt;
    delete cleanUpdateData.updatedAt;

    const [loan] = await db
      .update(loans)
      .set(cleanUpdateData)
      .where(eq(loans.id, id))
      .returning();
    return loan;
  }

  async deleteLoan(id: number): Promise<void> {
    // Delete related documents first to avoid foreign key constraint violation
    await db.delete(documents).where(eq(documents.loanId, id));
    // Delete related loan borrowers
    await db.delete(loanBorrowers).where(eq(loanBorrowers.loanId, id));
    // Delete related investors
    await db.delete(investors).where(eq(investors.loanId, id));
    // Delete related payments
    await db.delete(payments).where(eq(payments.loanId, id));
    // Delete related payment schedule
    await db.delete(paymentSchedule).where(eq(paymentSchedule.loanId, id));
    // Finally delete the loan
    await db.delete(loans).where(eq(loans.id, id));
  }

  async getLoanMetrics(userId?: number): Promise<{
    totalPortfolio: string;
    activeLoans: number;
    delinquentLoans: number;
    collectionsYTD: string;
  }> {
    let conditions = [];
    
    if (userId) {
      conditions.push(or(
        eq(loans.lenderId, userId),
        eq(loans.servicerId, userId),
        eq(loans.investorId, userId)
      ));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalPortfolioResult] = await db
      .select({ total: sum(loans.principalBalance) })
      .from(loans)
      .where(whereClause);

    const [activeLoansResult] = await db
      .select({ count: count() })
      .from(loans)
      .where(and(
        eq(loans.status, "active"),
        whereClause
      ));

    const [delinquentResult] = await db
      .select({ count: count() })
      .from(loans)
      .where(and(
        eq(loans.status, "delinquent"),
        whereClause
      ));

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    
    const [collectionsResult] = await db
      .select({ total: sum(payments.totalReceived) })
      .from(payments)
      .innerJoin(loans, eq(payments.loanId, loans.id))
      .where(and(
        gte(payments.effectiveDate, yearStart.toISOString().split('T')[0]),
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
  async getLoanBorrowers(loanId: number): Promise<LoanBorrower[]> {
    return await db.select().from(loanBorrowers).where(eq(loanBorrowers.loanId, loanId));
  }

  async createLoanBorrower(loanBorrower: InsertLoanBorrower): Promise<LoanBorrower> {
    const [lb] = await db
      .insert(loanBorrowers)
      .values(loanBorrower)
      .returning();
    return lb;
  }

  async deleteLoanBorrower(id: number): Promise<void> {
    await db.delete(loanBorrowers).where(eq(loanBorrowers.id, id));
  }

  // Investor methods
  async getInvestorsByLoan(loanId: number): Promise<Investor[]> {
    return await db.select().from(investors).where(eq(investors.loanId, loanId));
  }

  async createInvestor(investor: InsertInvestor): Promise<Investor> {
    const [inv] = await db
      .insert(investors)
      .values(investor)
      .returning();
    return inv;
  }

  async updateInvestor(id: number, investor: Partial<InsertInvestor>): Promise<Investor> {
    // Remove timestamp fields and handle date conversions
    const cleanUpdateData = { ...investor };
    
    // Handle date conversions
    Object.keys(cleanUpdateData).forEach(key => {
      const value = cleanUpdateData[key as keyof typeof cleanUpdateData];
      
      // Remove undefined values
      if (value === undefined) {
        delete cleanUpdateData[key as keyof typeof cleanUpdateData];
      }
      
      // Convert date strings to Date objects
      if (value && typeof value === 'string' && 
          (key.includes('Date') || key === 'createdAt' || key === 'updatedAt')) {
        try {
          cleanUpdateData[key as keyof typeof cleanUpdateData] = new Date(value) as any;
        } catch (e) {
          delete cleanUpdateData[key as keyof typeof cleanUpdateData];
        }
      }
    });
    
    // Remove managed timestamp fields
    delete cleanUpdateData.createdAt;
    delete cleanUpdateData.updatedAt;
    
    const [inv] = await db
      .update(investors)
      .set(cleanUpdateData)
      .where(eq(investors.id, id))
      .returning();
    return inv;
  }

  async deleteInvestor(id: number): Promise<void> {
    await db.delete(investors).where(eq(investors.id, id));
  }

  // Payment methods
  async getPayments(loanId: number, limit?: number): Promise<Payment[]> {
    let query = db
      .select()
      .from(payments)
      .where(eq(payments.loanId, loanId))
      .orderBy(desc(payments.effectiveDate));
    
    if (limit) {
      query = query.limit(limit) as any;
    }
    
    return await query;
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await db
      .insert(payments)
      .values(insertPayment)
      .returning();
    return payment;
  }

  async getPaymentHistory(loanId: number): Promise<Payment[]> {
    return await this.getPayments(loanId);
  }

  async updatePayment(id: number, updatePayment: Partial<InsertPayment>): Promise<Payment> {
    const [payment] = await db
      .update(payments)
      .set({ ...updatePayment, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return payment;
  }

  // Payment Schedule methods
  async getPaymentSchedule(loanId: number): Promise<PaymentSchedule[]> {
    return await db
      .select()
      .from(paymentSchedule)
      .where(eq(paymentSchedule.loanId, loanId))
      .orderBy(paymentSchedule.paymentNumber);
  }

  async createPaymentSchedule(schedule: InsertPaymentSchedule): Promise<PaymentSchedule> {
    const [ps] = await db
      .insert(paymentSchedule)
      .values(schedule)
      .returning();
    return ps;
  }

  async generatePaymentSchedule(loanId: number): Promise<PaymentSchedule[]> {
    // This would generate a complete amortization schedule
    // For now, returning empty array - implementation would calculate based on loan terms
    return [];
  }

  // Escrow methods
  async getEscrowAccount(loanId: number): Promise<EscrowAccount | undefined> {
    const [account] = await db
      .select()
      .from(escrowAccounts)
      .where(eq(escrowAccounts.loanId, loanId));
    return account || undefined;
  }

  async createEscrowAccount(insertAccount: InsertEscrowAccount): Promise<EscrowAccount> {
    const [account] = await db
      .insert(escrowAccounts)
      .values(insertAccount)
      .returning();
    return account;
  }

  async updateEscrowAccount(id: number, updateAccount: Partial<InsertEscrowAccount>): Promise<EscrowAccount> {
    const [account] = await db
      .update(escrowAccounts)
      .set({ ...updateAccount, updatedAt: new Date() })
      .where(eq(escrowAccounts.id, id))
      .returning();
    return account;
  }

  async getEscrowTransactions(filters: {
    escrowAccountId?: number;
    limit?: number;
  } = {}): Promise<EscrowTransaction[]> {
    let query = db.select().from(escrowTransactions);
    
    if (filters.escrowAccountId) {
      query = query.where(eq(escrowTransactions.escrowAccountId, filters.escrowAccountId)) as any;
    }
    
    query = query.orderBy(desc(escrowTransactions.transactionDate)) as any;
    
    if (filters.limit) {
      query = query.limit(filters.limit) as any;
    }
    
    return await query;
  }

  async createEscrowTransaction(transaction: InsertEscrowTransaction): Promise<EscrowTransaction> {
    const [trans] = await db
      .insert(escrowTransactions)
      .values(transaction)
      .returning();
    return trans;
  }

  async getEscrowItems(escrowAccountId: number): Promise<EscrowItem[]> {
    return await db
      .select()
      .from(escrowItems)
      .where(eq(escrowItems.escrowAccountId, escrowAccountId));
  }

  async createEscrowItem(item: InsertEscrowItem): Promise<EscrowItem> {
    const [escrowItem] = await db
      .insert(escrowItems)
      .values(item)
      .returning();
    return escrowItem;
  }

  async getEscrowMetrics(): Promise<{
    totalBalance: string;
    pendingDisbursements: string;
    shortages: string;
    surpluses: string;
  }> {
    const [balanceResult] = await db
      .select({ total: sum(escrowAccounts.currentBalance) })
      .from(escrowAccounts)
      .where(eq(escrowAccounts.isActive, true));

    const [pendingResult] = await db
      .select({ total: sum(escrowAccounts.pendingDisbursements) })
      .from(escrowAccounts)
      .where(eq(escrowAccounts.isActive, true));

    const [shortageResult] = await db
      .select({ total: sum(escrowAccounts.shortageAmount) })
      .from(escrowAccounts)
      .where(eq(escrowAccounts.isActive, true));

    const [surplusResult] = await db
      .select({ total: sum(escrowAccounts.surplusAmount) })
      .from(escrowAccounts)
      .where(eq(escrowAccounts.isActive, true));

    return {
      totalBalance: balanceResult?.total || "0",
      pendingDisbursements: pendingResult?.total || "0",
      shortages: shortageResult?.total || "0",
      surpluses: surplusResult?.total || "0"
    };
  }

  // Document methods
  async getDocuments(filters: {
    loanId?: number;
    borrowerId?: number;
    category?: string;
  } = {}): Promise<Document[]> {
    let query = db.select().from(documents);
    
    const conditions = [];
    if (filters.loanId) conditions.push(eq(documents.loanId, filters.loanId));
    if (filters.borrowerId) conditions.push(eq(documents.borrowerId, filters.borrowerId));
    if (filters.category) conditions.push(eq(documents.category, filters.category as any));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    query = query.orderBy(desc(documents.createdAt)) as any;
    
    return await query;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values(insertDocument)
      .returning();
    return document;
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async updateDocument(id: number, updateDocument: Partial<InsertDocument>): Promise<Document> {
    const [document] = await db
      .update(documents)
      .set({ ...updateDocument, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return document;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Audit methods
  async createAuditLog(insertAuditLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db
      .insert(auditLogs)
      .values(insertAuditLog)
      .returning();
    return log;
  }

  async getAuditLogs(entityType: string, entityId: number): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.entityType, entityType),
        eq(auditLogs.entityId, entityId)
      ))
      .orderBy(desc(auditLogs.createdAt));
  }

  // Notification methods
  async getNotifications(userId: number, limit?: number): Promise<Notification[]> {
    let query = db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
    
    if (limit) {
      query = query.limit(limit) as any;
    }
    
    return await query;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: number): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.id, id));
  }

  async getUnreadNotificationCount(userId: number): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    return Number(result?.count) || 0;
  }

  // Escrow Disbursement methods implementation
  async getEscrowDisbursements(loanId: number): Promise<EscrowDisbursement[]> {
    const disbursements = await db
      .select()
      .from(escrowDisbursements)
      .where(eq(escrowDisbursements.loanId, loanId))
      .orderBy(desc(escrowDisbursements.createdAt));
    return disbursements;
  }

  async getEscrowDisbursement(id: number): Promise<EscrowDisbursement | undefined> {
    const [disbursement] = await db
      .select()
      .from(escrowDisbursements)
      .where(eq(escrowDisbursements.id, id));
    return disbursement || undefined;
  }

  async createEscrowDisbursement(disbursement: InsertEscrowDisbursement): Promise<EscrowDisbursement> {
    const [newDisbursement] = await db
      .insert(escrowDisbursements)
      .values(disbursement)
      .returning();
    return newDisbursement;
  }

  async updateEscrowDisbursement(id: number, disbursement: Partial<InsertEscrowDisbursement>): Promise<EscrowDisbursement> {
    const [updatedDisbursement] = await db
      .update(escrowDisbursements)
      .set(disbursement)
      .where(eq(escrowDisbursements.id, id))
      .returning();
    return updatedDisbursement;
  }

  async deleteEscrowDisbursement(id: number): Promise<void> {
    await db.delete(escrowDisbursements).where(eq(escrowDisbursements.id, id));
  }

  async holdEscrowDisbursement(id: number, reason?: string, requestedBy?: string): Promise<EscrowDisbursement> {
    const [disbursement] = await db
      .update(escrowDisbursements)
      .set({
        isOnHold: true,
        holdReason: reason,
        holdRequestedBy: requestedBy,
        holdDate: new Date().toISOString(),
      })
      .where(eq(escrowDisbursements.id, id))
      .returning();
    return disbursement;
  }

  async releaseEscrowDisbursement(id: number): Promise<EscrowDisbursement> {
    const [disbursement] = await db
      .update(escrowDisbursements)
      .set({
        isOnHold: false,
        holdReason: null,
        holdRequestedBy: null,
        holdDate: null,
      })
      .where(eq(escrowDisbursements.id, id))
      .returning();
    return disbursement;
  }

  async getEscrowSummary(loanId: number): Promise<{
    summary: {
      totalDisbursements: number;
      activeDisbursements: number;
      onHoldDisbursements: number;
      totalAnnualAmount: string;
    };
  }> {
    const disbursements = await this.getEscrowDisbursements(loanId);
    
    const totalDisbursements = disbursements.length;
    const activeDisbursements = disbursements.filter(d => !d.isOnHold && d.status === 'active').length;
    const onHoldDisbursements = disbursements.filter(d => d.isOnHold).length;
    const totalAnnualAmount = disbursements
      .reduce((sum, d) => sum + parseFloat(d.annualAmount || '0'), 0)
      .toFixed(2);

    return {
      summary: {
        totalDisbursements,
        activeDisbursements,
        onHoldDisbursements,
        totalAnnualAmount,
      },
    };
  }
}

export const storage = new DatabaseStorage();