/**
 * Payment API Routes
 * Handles payment queries, allocations, and event timeline
 */

import { Router } from 'express';
import { db } from '../db';
import { payments, paymentEvents, ledgerEntries, loans, paymentArtifacts } from '@shared/schema';
import { eq, desc, and, sql, gte, or } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// Get all payments across all loans
router.get('/api/payments/all', async (req, res) => {
  try {
    // Fetch all payments with allocations from ledger entries
    const paymentsData = await db
      .select({
        payment: payments,
        loan: {
          loanNumber: loans.loanNumber,
          borrowerName: loans.borrowerName,
          propertyAddress: loans.propertyAddress
        },
        allocations: sql<any>`
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'type', ${ledgerEntries.entryType},
                'amount', ${ledgerEntries.amount},
                'description', ${ledgerEntries.description}
              )
            ) FILTER (WHERE ${ledgerEntries.id} IS NOT NULL),
            '[]'::json
          )`
      })
      .from(payments)
      .leftJoin(loans, eq(payments.loanId, loans.id))
      .leftJoin(ledgerEntries, eq(ledgerEntries.paymentId, payments.id))
      .groupBy(payments.id, loans.id)
      .orderBy(desc(payments.effectiveDate));

    // Fetch artifacts for each payment
    const paymentIds = paymentsData.map(p => p.payment.id);
    const artifacts = paymentIds.length > 0 ? await db
      .select()
      .from(paymentArtifacts)
      .where(sql`${paymentArtifacts.paymentId} = ANY(${paymentIds})`) : [];

    // Group artifacts by payment
    const artifactsByPayment = artifacts.reduce((acc, artifact) => {
      const paymentId = artifact.paymentId;
      if (!acc[paymentId]) acc[paymentId] = [];
      acc[paymentId].push({
        id: artifact.id,
        type: artifact.artifactType,
        url: artifact.storageUrl,
        createdAt: artifact.createdAt,
        metadata: artifact.metadata
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Format response with allocations and artifacts
    const formattedPayments = paymentsData.map(({ payment, loan, allocations }) => ({
      id: payment.id,
      loanId: payment.loanId,
      loanNumber: loan?.loanNumber,
      borrowerName: loan?.borrowerName,
      propertyAddress: loan?.propertyAddress,
      
      // Payment details
      amount: payment.totalReceived,
      effectiveDate: payment.effectiveDate,
      receivedDate: payment.receivedDate,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      confirmationNumber: payment.confirmationNumber,
      
      // Allocations breakdown
      allocations: {
        principal: payment.principalAmount || '0',
        interest: payment.interestAmount || '0',
        escrow: payment.escrowAmount || '0',
        lateFee: payment.lateFeeAmount || '0',
        otherFee: payment.otherFeeAmount || '0',
        suspense: payment.suspenseAmount || '0',
        details: allocations || []
      },
      
      // Channel info
      sourceChannel: payment.sourceChannel,
      idempotencyKey: payment.idempotencyKey,
      
      // Processing info
      processedDate: payment.processedDate,
      reconciledAt: payment.reconciledAt,
      
      // Artifacts with secure links
      artifacts: artifactsByPayment[payment.id] || [],
      
      // Metadata
      metadata: payment.metadata,
      notes: payment.notes
    }));

    res.json({
      payments: formattedPayments,
      total: formattedPayments.length
    });

  } catch (error) {
    console.error('Error fetching all payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Get all payments for a loan with allocations
router.get('/api/payments/:loanId', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    // Fetch payments with allocations from ledger entries
    const paymentsData = await db
      .select({
        payment: payments,
        loan: {
          loanNumber: loans.loanNumber,
          borrowerName: loans.borrowerName,
          propertyAddress: loans.propertyAddress
        },
        allocations: sql<any>`
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'type', ${ledgerEntries.entryType},
                'amount', ${ledgerEntries.amount},
                'description', ${ledgerEntries.description}
              )
            ) FILTER (WHERE ${ledgerEntries.id} IS NOT NULL),
            '[]'::json
          )`
      })
      .from(payments)
      .leftJoin(loans, eq(payments.loanId, loans.id))
      .leftJoin(ledgerEntries, eq(ledgerEntries.paymentId, payments.id))
      .where(eq(payments.loanId, loanId))
      .groupBy(payments.id, loans.id)
      .orderBy(desc(payments.effectiveDate));

    // Fetch artifacts for each payment
    const paymentIds = paymentsData.map(p => p.payment.id);
    const artifacts = await db
      .select()
      .from(paymentArtifacts)
      .where(sql`${paymentArtifacts.paymentId} = ANY(${paymentIds})`);

    // Group artifacts by payment
    const artifactsByPayment = artifacts.reduce((acc, artifact) => {
      const paymentId = artifact.paymentId;
      if (!acc[paymentId]) acc[paymentId] = [];
      acc[paymentId].push({
        id: artifact.id,
        type: artifact.artifactType,
        url: artifact.storageUrl,
        createdAt: artifact.createdAt,
        metadata: artifact.metadata
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Format response with allocations and artifacts
    const formattedPayments = paymentsData.map(({ payment, loan, allocations }) => ({
      id: payment.id,
      loanId: payment.loanId,
      loanNumber: loan?.loanNumber,
      borrowerName: loan?.borrowerName,
      propertyAddress: loan?.propertyAddress,
      
      // Payment details
      amount: payment.totalReceived,
      effectiveDate: payment.effectiveDate,
      receivedDate: payment.receivedDate,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      confirmationNumber: payment.confirmationNumber,
      
      // Allocations breakdown
      allocations: {
        principal: payment.principalAmount || '0',
        interest: payment.interestAmount || '0',
        escrow: payment.escrowAmount || '0',
        lateFee: payment.lateFeeAmount || '0',
        otherFee: payment.otherFeeAmount || '0',
        suspense: payment.suspenseAmount || '0',
        details: allocations || []
      },
      
      // Channel info
      sourceChannel: payment.sourceChannel,
      idempotencyKey: payment.idempotencyKey,
      
      // Processing info
      processedDate: payment.processedDate,
      reconciledAt: payment.reconciledAt,
      
      // Artifacts with secure links
      artifacts: artifactsByPayment[payment.id] || [],
      
      // Metadata
      metadata: payment.metadata,
      notes: payment.notes
    }));

    res.json({
      payments: formattedPayments,
      total: formattedPayments.length
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Get payment events timeline
router.get('/api/payments/:paymentId/events', async (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    
    // Fetch all events for this payment
    const events = await db
      .select({
        id: paymentEvents.id,
        type: paymentEvents.type,
        eventTime: paymentEvents.eventTime,
        actorType: paymentEvents.actorType,
        actorId: paymentEvents.actorId,
        correlationId: paymentEvents.correlationId,
        data: paymentEvents.data,
        eventHash: paymentEvents.eventHash,
        prevEventHash: paymentEvents.prevEventHash
      })
      .from(paymentEvents)
      .where(
        sql`${paymentEvents.data}->>'actual_payment_id' = ${paymentId} 
            OR ${paymentEvents.data}->>'payment_id' = ${paymentId}`
      )
      .orderBy(desc(paymentEvents.eventTime));

    // Format events for timeline display
    const timeline = events.map(event => ({
      id: event.id,
      type: event.type,
      timestamp: event.eventTime,
      actor: {
        type: event.actorType,
        id: event.actorId
      },
      description: getEventDescription(event.type, event.data),
      data: event.data,
      hash: {
        current: event.eventHash,
        previous: event.prevEventHash
      },
      correlationId: event.correlationId
    }));

    res.json({
      paymentId,
      events: timeline,
      total: timeline.length
    });

  } catch (error) {
    console.error('Error fetching payment events:', error);
    res.status(500).json({ error: 'Failed to fetch payment events' });
  }
});

// Get single payment details with full breakdown
router.get('/api/payments/detail/:paymentId', async (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    
    // Fetch payment with all related data
    const [paymentData] = await db
      .select({
        payment: payments,
        loan: loans
      })
      .from(payments)
      .leftJoin(loans, eq(payments.loanId, loans.id))
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!paymentData) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Fetch ledger entries for allocation details
    const ledgerData = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.paymentId, paymentId))
      .orderBy(desc(ledgerEntries.createdAt));

    // Fetch artifacts
    const artifactsData = await db
      .select()
      .from(paymentArtifacts)
      .where(eq(paymentArtifacts.paymentId, paymentId));

    // Fetch recent events
    const recentEvents = await db
      .select()
      .from(paymentEvents)
      .where(
        sql`${paymentEvents.data}->>'actual_payment_id' = ${paymentId} 
            OR ${paymentEvents.data}->>'payment_id' = ${paymentId}`
      )
      .orderBy(desc(paymentEvents.eventTime))
      .limit(10);

    res.json({
      payment: {
        ...paymentData.payment,
        loan: paymentData.loan
      },
      ledgerEntries: ledgerData,
      artifacts: artifactsData,
      recentEvents: recentEvents.map(e => ({
        id: e.id,
        type: e.type,
        timestamp: e.eventTime,
        description: getEventDescription(e.type, e.data)
      }))
    });

  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({ error: 'Failed to fetch payment details' });
  }
});

// Helper function to generate human-readable event descriptions
function getEventDescription(eventType: string, data: any): string {
  switch (eventType) {
    case 'payment.posted':
      return `Payment posted for $${data.allocations?.total || data.amount || 0}`;
    case 'payment.validated':
      return 'Payment validated successfully';
    case 'payment.classified':
      return `Payment classified as ${data.policy || 'standard'}`;
    case 'payment.allocated':
      return 'Payment allocations calculated';
    case 'payment.reversed':
      return `Payment reversed: ${data.reason || 'No reason provided'}`;
    case 'payment.reconciled':
      return 'Payment reconciled with bank statement';
    case 'payment.distributed':
      return 'Investor distributions calculated';
    case 'ledger.posted':
      return 'Ledger entries posted';
    case 'ledger.reversed':
      return 'Ledger entries reversed';
    default:
      return eventType.replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

// Get payment metrics for dashboard
router.get('/api/payments/metrics', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Get today's collections
    const todayResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(amount), 0)`
      })
      .from(payments)
      .where(
        and(
          gte(payments.paymentDate, today.toISOString()),
          eq(payments.status, 'completed')
        )
      );
    
    // Get pending payments count
    const pendingResult = await db
      .select({
        count: sql<number>`COUNT(*)`
      })
      .from(payments)
      .where(eq(payments.status, 'pending'));
    
    // Get failed payments count
    const failedResult = await db
      .select({
        count: sql<number>`COUNT(*)`
      })
      .from(payments)
      .where(eq(payments.status, 'failed'));
    
    // Get month to date collections
    const mtdResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(amount), 0)`
      })
      .from(payments)
      .where(
        and(
          gte(payments.paymentDate, firstOfMonth.toISOString()),
          eq(payments.status, 'completed')
        )
      );
    
    // Get exception count (failed or returned)
    const exceptionResult = await db
      .select({
        count: sql<number>`COUNT(*)`
      })
      .from(payments)
      .where(
        or(
          eq(payments.status, 'failed'),
          eq(payments.status, 'returned')
        )
      );

    res.json({
      todayCollections: Number(todayResult[0]?.total || 0),
      pendingCount: Number(pendingResult[0]?.count || 0),
      failedCount: Number(failedResult[0]?.count || 0),
      monthToDate: Number(mtdResult[0]?.total || 0),
      exceptionCount: Number(exceptionResult[0]?.count || 0)
    });
  } catch (error) {
    console.error('Error fetching payment metrics:', error);
    res.status(500).json({ error: 'Failed to fetch payment metrics' });
  }
});

export default router;