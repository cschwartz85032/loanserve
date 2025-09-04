import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { drizzle } from 'drizzle-orm/postgres-js';

export async function initEscrowConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Escrow,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, loanId, escrowAction }
      const { loanId, escrowAction, tenantId } = payload;
      const db = drizzle(client);

      switch (escrowAction.type) {
        case 'analysis':
          await performEscrowAnalysis(loanId, tenantId, client);
          break;
        case 'disbursement':
          await processEscrowDisbursement(loanId, escrowAction.disbursementId, tenantId, client);
          break;
        case 'shortage_detection':
          await detectEscrowShortage(loanId, tenantId, client);
          break;
        default:
          throw new Error(`Unknown escrow action: ${escrowAction.type}`);
      }
    },
  });
}

async function performEscrowAnalysis(loanId: string, tenantId: string, client: any): Promise<void> {
  const db = drizzle(client);

  // Get escrow account details
  const [escrowAccount] = await db.select()
    .from(escrowAccounts)
    .where(eq(escrowAccounts.loanId, loanId));

  if (!escrowAccount) {
    throw new Error(`No escrow account found for loan ${loanId}`);
  }

  // Calculate annual escrow requirements
  const escrowItems = await db.select()
    .from(escrowItems)
    .where(eq(escrowItems.escrowAccountId, escrowAccount.id));

  const annualRequired = escrowItems.reduce((total, item) => 
    total + (item.annualAmount || 0), 0);

  // Calculate shortage/surplus
  const currentBalance = escrowAccount.balance || 0;
  const monthlyPayment = escrowAccount.monthlyPayment || 0;
  const targetBalance = annualRequired / 12 * 2; // 2 months cushion

  const shortage = Math.max(0, targetBalance - currentBalance);
  const surplus = Math.max(0, currentBalance - targetBalance);

  // Update escrow analysis
  await db.insert(escrowAnalysis).values({
    escrowAccountId: escrowAccount.id,
    analysisDate: new Date(),
    annualRequired,
    currentBalance,
    targetBalance,
    shortage,
    surplus,
    recommendedMonthlyPayment: (annualRequired + shortage) / 12
  });

  // Publish analysis complete event
  await publishEvent(client, {
    tenantId,
    aggregateId: loanId,
    aggregateType: 'loan',
    eventType: 'EscrowAnalysisCompleted',
    payload: {
      shortage,
      surplus,
      currentBalance,
      recommendedPayment: (annualRequired + shortage) / 12
    },
  });

  // Audit log
  await auditAction(client, {
    tenantId,
    targetType: 'escrow_accounts',
    targetId: escrowAccount.id,
    action: 'escrow_analysis_completed',
    changes: { shortage, surplus, analysisDate: new Date() },
  });
}

async function processEscrowDisbursement(
  loanId: string, 
  disbursementId: string, 
  tenantId: string, 
  client: any
): Promise<void> {
  const db = drizzle(client);

  // Get disbursement details
  const [disbursement] = await db.select()
    .from(escrowDisbursements)
    .where(eq(escrowDisbursements.id, disbursementId));

  if (!disbursement) {
    throw new Error(`Disbursement ${disbursementId} not found`);
  }

  // Update escrow account balance
  await db.update(escrowAccounts)
    .set({
      balance: sql`balance - ${disbursement.amount}`,
      lastDisbursementDate: new Date()
    })
    .where(eq(escrowAccounts.loanId, loanId));

  // Mark disbursement as processed
  await db.update(escrowDisbursements)
    .set({
      status: 'processed',
      processedAt: new Date()
    })
    .where(eq(escrowDisbursements.id, disbursementId));

  // Publish disbursement event
  await publishEvent(client, {
    tenantId,
    aggregateId: loanId,
    aggregateType: 'loan',
    eventType: 'EscrowDisbursementProcessed',
    payload: {
      disbursementId,
      amount: disbursement.amount,
      payee: disbursement.payee,
      purpose: disbursement.purpose
    },
  });

  // Audit log
  await auditAction(client, {
    tenantId,
    targetType: 'escrow_disbursements',
    targetId: disbursementId,
    action: 'disbursement_processed',
    changes: { amount: disbursement.amount, processedAt: new Date() },
  });
}

async function detectEscrowShortage(loanId: string, tenantId: string, client: any): Promise<void> {
  // Placeholder - would implement shortage detection logic
  // Compare projected expenses vs. current balance and incoming payments
}