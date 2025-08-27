import type { Express, Request, Response } from 'express';
import { db } from '../db.js';
import { and, eq, desc, isNull, sql } from 'drizzle-orm';
import {
  borrowerUsers,
  borrowerPaymentMethods,
  borrowerNotices,
  borrowerPreferences,
  loanBorrowerLinks,
  loans,
  borrowerEntities,
  payments,
  escrowAccounts,
  properties,
  loanTerms,
  loanBalances,
  type InsertBorrowerPaymentMethod,
  type InsertBorrowerPreferences,
} from '@shared/schema.js';
import { z } from 'zod';
import { loggers } from '../utils/logger.js';
import { requireBorrower } from '../auth/middleware.js';

const logger = loggers.api;

// Validation schemas
const updateContactInfoSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

const addPaymentMethodSchema = z.object({
  type: z.literal('ach'),
  routingNumber: z.string().regex(/^\d{9}$/, 'Invalid routing number'),
  accountNumber: z.string().min(4).max(17),
  accountType: z.enum(['checking', 'savings']),
  nameOnAccount: z.string(),
});

const makePaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethodId: z.number().int(),
  principal: z.number().min(0).optional(),
  interest: z.number().min(0).optional(),
  escrow: z.number().min(0).optional(),
  fees: z.number().min(0).optional(),
});

export function registerBorrowerRoutes(app: Express) {
  // Get borrower dashboard data
  app.get('/api/borrower/dashboard', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      if (!borrowerUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get borrower's loans with current status
      const userLoans = await db
        .select({
          loanId: loans.id,
          loanNumber: loans.loanNumber,
          propertyAddress: properties.address,
          propertyCity: properties.city,
          propertyState: properties.state,
          principalBalance: loanBalances.principalBalance,
          escrowBalance: loanBalances.escrowBalance,
          nextPaymentDate: loans.nextPaymentDate,
          paymentAmount: loans.paymentAmount,
          status: loans.status,
          role: loanBorrowerLinks.role,
        })
        .from(loanBorrowerLinks)
        .innerJoin(loans, eq(loanBorrowerLinks.loanId, loans.id))
        .innerJoin(properties, eq(loans.propertyId, properties.id))
        .leftJoin(loanBalances, eq(loans.id, loanBalances.loanId))
        .where(eq(loanBorrowerLinks.borrowerUserId, borrowerUserId))
        .orderBy(loans.loanNumber);

      // Get recent payments
      const recentPayments = await db
        .select({
          id: payments.id,
          loanNumber: loans.loanNumber,
          receivedDate: payments.receivedDate,
          totalAmount: payments.totalAmount,
          status: payments.status,
        })
        .from(payments)
        .innerJoin(loans, eq(payments.loanId, loans.id))
        .innerJoin(loanBorrowerLinks, eq(loans.id, loanBorrowerLinks.loanId))
        .where(
          and(
            eq(loanBorrowerLinks.borrowerUserId, borrowerUserId),
            eq(payments.status, 'completed')
          )
        )
        .orderBy(desc(payments.receivedDate))
        .limit(5);

      // Get unread notices
      const unreadNotices = await db
        .select({
          id: borrowerNotices.id,
          type: borrowerNotices.type,
          title: borrowerNotices.title,
          createdAt: borrowerNotices.createdAt,
        })
        .from(borrowerNotices)
        .where(
          and(
            eq(borrowerNotices.borrowerUserId, borrowerUserId),
            isNull(borrowerNotices.readAt)
          )
        )
        .orderBy(desc(borrowerNotices.createdAt))
        .limit(5);

      res.json({
        loans: userLoans,
        recentPayments,
        unreadNotices,
      });
    } catch (error) {
      logger.error('Error fetching borrower dashboard:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  // Get specific loan details
  app.get('/api/borrower/loans/:id', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      const loanId = parseInt(req.params.id);
      
      if (!borrowerUserId || isNaN(loanId)) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      // Verify borrower has access to this loan
      const access = await db
        .select()
        .from(loanBorrowerLinks)
        .where(
          and(
            eq(loanBorrowerLinks.loanId, loanId),
            eq(loanBorrowerLinks.borrowerUserId, borrowerUserId)
          )
        )
        .limit(1);

      if (access.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get loan details with property and balances
      const [loanDetails] = await db
        .select({
          loan: loans,
          property: properties,
          balances: loanBalances,
          escrow: escrowAccounts,
        })
        .from(loans)
        .innerJoin(properties, eq(loans.propertyId, properties.id))
        .leftJoin(loanBalances, eq(loans.id, loanBalances.loanId))
        .leftJoin(escrowAccounts, eq(loans.id, escrowAccounts.loanId))
        .where(eq(loans.id, loanId))
        .limit(1);

      res.json(loanDetails);
    } catch (error) {
      logger.error('Error fetching loan details:', error);
      res.status(500).json({ error: 'Failed to fetch loan details' });
    }
  });

  // Get payment history
  app.get('/api/borrower/loans/:id/payments', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      const loanId = parseInt(req.params.id);
      
      if (!borrowerUserId || isNaN(loanId)) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      // Verify access
      const access = await db
        .select()
        .from(loanBorrowerLinks)
        .where(
          and(
            eq(loanBorrowerLinks.loanId, loanId),
            eq(loanBorrowerLinks.borrowerUserId, borrowerUserId)
          )
        )
        .limit(1);

      if (access.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get payment history
      const paymentHistory = await db
        .select({
          id: payments.id,
          paymentNumber: payments.paymentNumber,
          dueDate: payments.dueDate,
          receivedDate: payments.receivedDate,
          principalAmount: payments.principalAmount,
          interestAmount: payments.interestAmount,
          escrowAmount: payments.escrowAmount,
          feeAmount: payments.feeAmount,
          totalAmount: payments.totalAmount,
          status: payments.status,
          referenceNumber: payments.referenceNumber,
        })
        .from(payments)
        .where(eq(payments.loanId, loanId))
        .orderBy(desc(payments.receivedDate))
        .limit(100);

      res.json(paymentHistory);
    } catch (error) {
      logger.error('Error fetching payment history:', error);
      res.status(500).json({ error: 'Failed to fetch payment history' });
    }
  });

  // Get borrower profile
  app.get('/api/borrower/profile', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      if (!borrowerUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const [profile] = await db
        .select({
          user: borrowerUsers,
          entity: borrowerEntities,
          preferences: borrowerPreferences,
        })
        .from(borrowerUsers)
        .innerJoin(borrowerEntities, eq(borrowerUsers.borrowerEntityId, borrowerEntities.id))
        .leftJoin(borrowerPreferences, eq(borrowerUsers.id, borrowerPreferences.borrowerUserId))
        .where(eq(borrowerUsers.id, borrowerUserId))
        .limit(1);

      res.json(profile);
    } catch (error) {
      logger.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  // Update contact information
  app.patch('/api/borrower/profile/contact', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      if (!borrowerUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const data = updateContactInfoSchema.parse(req.body);

      await db
        .update(borrowerUsers)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(borrowerUsers.id, borrowerUserId));

      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating contact info:', error);
      res.status(500).json({ error: 'Failed to update contact information' });
    }
  });

  // Get payment methods
  app.get('/api/borrower/payment-methods', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      if (!borrowerUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const methods = await db
        .select({
          id: borrowerPaymentMethods.id,
          type: borrowerPaymentMethods.type,
          last4: borrowerPaymentMethods.last4,
          bankName: borrowerPaymentMethods.bankName,
          accountType: borrowerPaymentMethods.accountType,
          nameOnAccount: borrowerPaymentMethods.nameOnAccount,
          status: borrowerPaymentMethods.status,
          isDefault: borrowerPaymentMethods.isDefault,
        })
        .from(borrowerPaymentMethods)
        .where(
          and(
            eq(borrowerPaymentMethods.borrowerUserId, borrowerUserId),
            eq(borrowerPaymentMethods.status, 'active')
          )
        )
        .orderBy(desc(borrowerPaymentMethods.isDefault));

      res.json(methods);
    } catch (error) {
      logger.error('Error fetching payment methods:', error);
      res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
  });

  // Add payment method
  app.post('/api/borrower/payment-methods', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      if (!borrowerUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const data = addPaymentMethodSchema.parse(req.body);

      // Create processor token (mock for now)
      const processorToken = `ach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const last4 = data.accountNumber.slice(-4);

      const newMethod: InsertBorrowerPaymentMethod = {
        borrowerUserId,
        type: data.type,
        processorToken,
        last4,
        accountType: data.accountType,
        nameOnAccount: data.nameOnAccount,
        bankName: 'Bank', // Would come from routing number lookup
        status: 'active',
        isDefault: false,
        verifiedAt: new Date(),
      };

      const [created] = await db
        .insert(borrowerPaymentMethods)
        .values(newMethod)
        .returning();

      res.json({
        id: created.id,
        type: created.type,
        last4: created.last4,
        bankName: created.bankName,
        accountType: created.accountType,
      });
    } catch (error) {
      logger.error('Error adding payment method:', error);
      res.status(500).json({ error: 'Failed to add payment method' });
    }
  });

  // Make a payment
  app.post('/api/borrower/loans/:id/payments', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      const loanId = parseInt(req.params.id);
      
      if (!borrowerUserId || isNaN(loanId)) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      // Verify access
      const access = await db
        .select()
        .from(loanBorrowerLinks)
        .where(
          and(
            eq(loanBorrowerLinks.loanId, loanId),
            eq(loanBorrowerLinks.borrowerUserId, borrowerUserId)
          )
        )
        .limit(1);

      if (access.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const data = makePaymentSchema.parse(req.body);

      // Verify payment method belongs to borrower
      const [method] = await db
        .select()
        .from(borrowerPaymentMethods)
        .where(
          and(
            eq(borrowerPaymentMethods.id, data.paymentMethodId),
            eq(borrowerPaymentMethods.borrowerUserId, borrowerUserId)
          )
        )
        .limit(1);

      if (!method) {
        return res.status(400).json({ error: 'Invalid payment method' });
      }

      // Create payment record
      const paymentId = `BP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
      
      await db.insert(payments).values({
        id: paymentId,
        loanId,
        receivedDate: new Date(),
        effectiveDate: new Date(),
        principalAmount: data.principal || 0,
        interestAmount: data.interest || 0,
        escrowAmount: data.escrow || 0,
        feeAmount: data.fees || 0,
        totalAmount: data.amount,
        totalReceived: data.amount,
        paymentMethod: 'ACH',
        paymentSource: 'borrower_portal',
        status: 'processing',
        referenceNumber: paymentId,
        createdBy: req.user?.id,
      });

      // Create notice
      await db.insert(borrowerNotices).values({
        loanId,
        borrowerUserId,
        type: 'payment_received',
        title: 'Payment Received',
        message: `Your payment of $${data.amount.toFixed(2)} has been received and is being processed.`,
        payload: { paymentId, amount: data.amount },
      });

      res.json({
        paymentId,
        status: 'processing',
        amount: data.amount,
        message: 'Payment is being processed. You will receive a confirmation once it\'s posted.',
      });
    } catch (error) {
      logger.error('Error processing payment:', error);
      res.status(500).json({ error: 'Failed to process payment' });
    }
  });

  // Get notices
  app.get('/api/borrower/notices', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      if (!borrowerUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const notices = await db
        .select({
          id: borrowerNotices.id,
          loanId: borrowerNotices.loanId,
          loanNumber: loans.loanNumber,
          type: borrowerNotices.type,
          title: borrowerNotices.title,
          message: borrowerNotices.message,
          readAt: borrowerNotices.readAt,
          createdAt: borrowerNotices.createdAt,
        })
        .from(borrowerNotices)
        .innerJoin(loans, eq(borrowerNotices.loanId, loans.id))
        .where(eq(borrowerNotices.borrowerUserId, borrowerUserId))
        .orderBy(desc(borrowerNotices.createdAt))
        .limit(50);

      res.json(notices);
    } catch (error) {
      logger.error('Error fetching notices:', error);
      res.status(500).json({ error: 'Failed to fetch notices' });
    }
  });

  // Mark notice as read
  app.patch('/api/borrower/notices/:id/read', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      const noticeId = parseInt(req.params.id);
      
      if (!borrowerUserId || isNaN(noticeId)) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      await db
        .update(borrowerNotices)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(borrowerNotices.id, noticeId),
            eq(borrowerNotices.borrowerUserId, borrowerUserId)
          )
        );

      res.json({ success: true });
    } catch (error) {
      logger.error('Error marking notice as read:', error);
      res.status(500).json({ error: 'Failed to mark notice as read' });
    }
  });

  // Get preferences
  app.get('/api/borrower/preferences', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      if (!borrowerUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const [prefs] = await db
        .select()
        .from(borrowerPreferences)
        .where(eq(borrowerPreferences.borrowerUserId, borrowerUserId))
        .limit(1);

      if (!prefs) {
        // Create default preferences
        const defaultPrefs: InsertBorrowerPreferences = {
          borrowerUserId,
          statementDelivery: 'paperless',
          paperlessConsent: false,
          emailNotifications: true,
          smsNotifications: false,
          language: 'en',
          timezone: 'America/Phoenix',
        };

        const [created] = await db
          .insert(borrowerPreferences)
          .values(defaultPrefs)
          .returning();

        return res.json(created);
      }

      res.json(prefs);
    } catch (error) {
      logger.error('Error fetching preferences:', error);
      res.status(500).json({ error: 'Failed to fetch preferences' });
    }
  });

  // Update preferences
  app.patch('/api/borrower/preferences', requireBorrower, async (req: Request, res: Response) => {
    try {
      const borrowerUserId = req.user?.borrowerUserId;
      if (!borrowerUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await db
        .update(borrowerPreferences)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(borrowerPreferences.borrowerUserId, borrowerUserId));

      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating preferences:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  });
}