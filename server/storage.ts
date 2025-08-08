import { 
  users, 
  loans, 
  payments, 
  escrowAccounts, 
  escrowPayments, 
  documents, 
  auditLogs, 
  notifications,
  type User, 
  type InsertUser,
  type Loan,
  type InsertLoan,
  type Payment,
  type InsertPayment,
  type EscrowAccount,
  type InsertEscrowAccount,
  type EscrowPayment,
  type InsertEscrowPayment,
  type Document,
  type InsertDocument,
  type AuditLog,
  type InsertAuditLog,
  type Notification,
  type InsertNotification
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql, count, sum } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;

  // Loan methods
  getLoans(filters?: {
    lenderId?: string;
    borrowerId?: string;
    investorId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Loan[]>;
  getLoan(id: string): Promise<Loan | undefined>;
  getLoanByNumber(loanNumber: string): Promise<Loan | undefined>;
  createLoan(loan: InsertLoan): Promise<Loan>;
  updateLoan(id: string, loan: Partial<InsertLoan>): Promise<Loan>;
  getLoanMetrics(userId?: string): Promise<{
    totalPortfolio: string;
    activeLoans: number;
    delinquentLoans: number;
    collectionsYTD: string;
  }>;

  // Payment methods
  getPayments(loanId: string, limit?: number): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentHistory(loanId: string): Promise<Payment[]>;

  // Escrow methods
  getEscrowAccounts(loanId: string): Promise<EscrowAccount[]>;
  createEscrowAccount(escrowAccount: InsertEscrowAccount): Promise<EscrowAccount>;
  getEscrowPayments(filters?: {
    loanId?: string;
    escrowAccountId?: string;
    status?: string;
    limit?: number;
  }): Promise<EscrowPayment[]>;
  createEscrowPayment(escrowPayment: InsertEscrowPayment): Promise<EscrowPayment>;
  getEscrowMetrics(): Promise<{
    totalBalance: string;
    insurancePayments: string;
    taxPayments: string;
    hoaPayments: string;
  }>;

  // Document methods
  getDocuments(filters?: {
    loanId?: string;
    borrowerId?: string;
    documentType?: string;
  }): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  deleteDocument(id: string): Promise<void>;

  // Audit methods
  createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog>;

  // Notification methods
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<void>;

  sessionStore: session.SessionStore;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.SessionStore;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
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

  async updateUser(id: string, updateUser: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updateUser, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Loan methods
  async getLoans(filters: {
    lenderId?: string;
    borrowerId?: string;
    investorId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Loan[]> {
    let query = db.select().from(loans);

    const conditions = [];
    if (filters.lenderId) conditions.push(eq(loans.lenderId, filters.lenderId));
    if (filters.borrowerId) conditions.push(eq(loans.borrowerId, filters.borrowerId));
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
    return result as Loan[];
  }

  async getLoan(id: string): Promise<Loan | undefined> {
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

  async updateLoan(id: string, updateLoan: Partial<InsertLoan>): Promise<Loan> {
    const [loan] = await db
      .update(loans)
      .set({ ...updateLoan, updatedAt: new Date() })
      .where(eq(loans.id, id))
      .returning();
    return loan;
  }

  async getLoanMetrics(userId?: string): Promise<{
    totalPortfolio: string;
    activeLoans: number;
    delinquentLoans: number;
    collectionsYTD: string;
  }> {
    let baseQuery = db.select().from(loans);
    
    if (userId) {
      baseQuery = baseQuery.where(
        or(
          eq(loans.lenderId, userId),
          eq(loans.borrowerId, userId),
          eq(loans.investorId, userId)
        )
      );
    }

    const [totalPortfolioResult] = await db
      .select({ total: sum(loans.currentBalance) })
      .from(loans)
      .where(userId ? or(
        eq(loans.lenderId, userId),
        eq(loans.borrowerId, userId),
        eq(loans.investorId, userId)
      ) : undefined);

    const [activeLoansResult] = await db
      .select({ count: count() })
      .from(loans)
      .where(
        and(
          eq(loans.status, "active"),
          userId ? or(
            eq(loans.lenderId, userId),
            eq(loans.borrowerId, userId),
            eq(loans.investorId, userId)
          ) : undefined
        )
      );

    const [delinquentLoansResult] = await db
      .select({ count: count() })
      .from(loans)
      .where(
        and(
          or(
            eq(loans.status, "delinquent_30"),
            eq(loans.status, "delinquent_60"),
            eq(loans.status, "delinquent_90")
          ),
          userId ? or(
            eq(loans.lenderId, userId),
            eq(loans.borrowerId, userId),
            eq(loans.investorId, userId)
          ) : undefined
        )
      );

    const [collectionsYTDResult] = await db
      .select({ total: sum(payments.amount) })
      .from(payments)
      .innerJoin(loans, eq(payments.loanId, loans.id))
      .where(
        and(
          sql`EXTRACT(YEAR FROM ${payments.receivedDate}) = EXTRACT(YEAR FROM CURRENT_DATE)`,
          userId ? or(
            eq(loans.lenderId, userId),
            eq(loans.borrowerId, userId),
            eq(loans.investorId, userId)
          ) : undefined
        )
      );

    return {
      totalPortfolio: totalPortfolioResult?.total || "0",
      activeLoans: activeLoansResult?.count || 0,
      delinquentLoans: delinquentLoansResult?.count || 0,
      collectionsYTD: collectionsYTDResult?.total || "0"
    };
  }

  // Payment methods
  async getPayments(loanId: string, limit = 50): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(eq(payments.loanId, loanId))
      .orderBy(desc(payments.receivedDate))
      .limit(limit);
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await db
      .insert(payments)
      .values(insertPayment)
      .returning();
    return payment;
  }

  async getPaymentHistory(loanId: string): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(eq(payments.loanId, loanId))
      .orderBy(desc(payments.receivedDate));
  }

  // Escrow methods
  async getEscrowAccounts(loanId: string): Promise<EscrowAccount[]> {
    return await db
      .select()
      .from(escrowAccounts)
      .where(and(eq(escrowAccounts.loanId, loanId), eq(escrowAccounts.isActive, true)));
  }

  async createEscrowAccount(insertEscrowAccount: InsertEscrowAccount): Promise<EscrowAccount> {
    const [escrowAccount] = await db
      .insert(escrowAccounts)
      .values(insertEscrowAccount)
      .returning();
    return escrowAccount;
  }

  async getEscrowPayments(filters: {
    loanId?: string;
    escrowAccountId?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<EscrowPayment[]> {
    let query = db.select().from(escrowPayments);

    const conditions = [];
    if (filters.loanId) conditions.push(eq(escrowPayments.loanId, filters.loanId));
    if (filters.escrowAccountId) conditions.push(eq(escrowPayments.escrowAccountId, filters.escrowAccountId));
    if (filters.status) conditions.push(eq(escrowPayments.status, filters.status));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    query = query.orderBy(desc(escrowPayments.dueDate)) as any;

    if (filters.limit) {
      query = query.limit(filters.limit) as any;
    }

    const result = await query;
    return result as EscrowPayment[];
  }

  async createEscrowPayment(insertEscrowPayment: InsertEscrowPayment): Promise<EscrowPayment> {
    const [escrowPayment] = await db
      .insert(escrowPayments)
      .values(insertEscrowPayment)
      .returning();
    return escrowPayment;
  }

  async getEscrowMetrics(): Promise<{
    totalBalance: string;
    insurancePayments: string;
    taxPayments: string;
    hoaPayments: string;
  }> {
    const [totalBalanceResult] = await db
      .select({ total: sum(escrowAccounts.currentBalance) })
      .from(escrowAccounts)
      .where(eq(escrowAccounts.isActive, true));

    const [insuranceResult] = await db
      .select({ total: sum(escrowPayments.amount) })
      .from(escrowPayments)
      .innerJoin(escrowAccounts, eq(escrowPayments.escrowAccountId, escrowAccounts.id))
      .where(
        and(
          or(
            eq(escrowAccounts.escrowType, "hazard_insurance"),
            eq(escrowAccounts.escrowType, "pmi_insurance"),
            eq(escrowAccounts.escrowType, "flood_insurance")
          ),
          sql`EXTRACT(YEAR FROM ${escrowPayments.paymentDate}) = EXTRACT(YEAR FROM CURRENT_DATE)`
        )
      );

    const [taxResult] = await db
      .select({ total: sum(escrowPayments.amount) })
      .from(escrowPayments)
      .innerJoin(escrowAccounts, eq(escrowPayments.escrowAccountId, escrowAccounts.id))
      .where(
        and(
          eq(escrowAccounts.escrowType, "property_tax"),
          sql`EXTRACT(YEAR FROM ${escrowPayments.paymentDate}) = EXTRACT(YEAR FROM CURRENT_DATE)`
        )
      );

    const [hoaResult] = await db
      .select({ total: sum(escrowPayments.amount) })
      .from(escrowPayments)
      .innerJoin(escrowAccounts, eq(escrowPayments.escrowAccountId, escrowAccounts.id))
      .where(
        and(
          eq(escrowAccounts.escrowType, "hoa_fees"),
          sql`EXTRACT(YEAR FROM ${escrowPayments.paymentDate}) = EXTRACT(YEAR FROM CURRENT_DATE)`
        )
      );

    return {
      totalBalance: totalBalanceResult?.total || "0",
      insurancePayments: insuranceResult?.total || "0",
      taxPayments: taxResult?.total || "0",
      hoaPayments: hoaResult?.total || "0"
    };
  }

  // Document methods
  async getDocuments(filters: {
    loanId?: string;
    borrowerId?: string;
    documentType?: string;
  } = {}): Promise<Document[]> {
    let query = db.select().from(documents);

    const conditions = [];
    if (filters.loanId) conditions.push(eq(documents.loanId, filters.loanId));
    if (filters.borrowerId) conditions.push(eq(documents.borrowerId, filters.borrowerId));
    if (filters.documentType) conditions.push(eq(documents.documentType, filters.documentType as any));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query.orderBy(desc(documents.createdAt));
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values(insertDocument)
      .returning();
    return document;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Audit methods
  async createAuditLog(insertAuditLog: InsertAuditLog): Promise<AuditLog> {
    const [auditLog] = await db
      .insert(auditLogs)
      .values(insertAuditLog)
      .returning();
    return auditLog;
  }

  // Notification methods
  async getNotifications(userId: string, limit = 50): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }
}

export const storage = new DatabaseStorage();
