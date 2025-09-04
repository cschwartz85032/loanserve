import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { drizzle } from 'drizzle-orm/postgres-js';

export async function initDisbursementConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Disbursement,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, paymentId, allocationRules }
      const { paymentId, allocationRules, tenantId } = payload;
      const db = drizzle(client);

      // Get payment details
      const [payment] = await db.select()
        .from(payments)
        .where(eq(payments.id, paymentId));

      if (!payment) {
        throw new Error(`Payment ${paymentId} not found`);
      }

      // Allocate payment using waterfall rules
      const allocation = await calculatePaymentAllocation(
        payment.amount,
        payment.loanId,
        allocationRules,
        client
      );

      // Create allocation entries
      for (const entry of allocation.entries) {
        await db.insert(paymentAllocations).values({
          paymentId,
          loanId: payment.loanId,
          category: entry.category, // 'fees', 'interest', 'principal', 'escrow'
          amount: entry.amount,
          appliedDate: new Date()
        });
      }

      // Update loan balances
      await updateLoanBalances(payment.loanId, allocation, client);

      // Update payment status
      await db.update(payments)
        .set({ 
          status: 'allocated',
          allocatedAt: new Date(),
          allocationSummary: allocation.summary
        })
        .where(eq(payments.id, paymentId));

      // Publish domain event
      await publishEvent(client, {
        tenantId,
        aggregateId: payment.loanId,
        aggregateType: 'loan',
        eventType: 'PaymentAllocated',
        payload: {
          paymentId,
          amount: payment.amount,
          allocation: allocation.summary
        },
      });

      // Audit log
      await auditAction(client, {
        tenantId,
        targetType: 'payments',
        targetId: paymentId,
        action: 'payment_allocated',
        changes: {
          allocation: allocation.summary,
          balanceUpdates: allocation.balanceChanges
        },
      });
    },
  });
}

async function calculatePaymentAllocation(
  amount: number,
  loanId: string,
  rules: any[],
  client: any
): Promise<any> {
  // Placeholder - would implement waterfall allocation logic
  // 1. Late fees first
  // 2. Current fees
  // 3. Interest (past due first, then current)
  // 4. Principal
  // 5. Escrow shortage
  
  return {
    entries: [
      { category: 'interest', amount: amount * 0.6 },
      { category: 'principal', amount: amount * 0.4 }
    ],
    summary: { totalAllocated: amount },
    balanceChanges: { principalReduction: amount * 0.4 }
  };
}

async function updateLoanBalances(loanId: string, allocation: any, client: any): Promise<void> {
  // Placeholder - would update loan balance tables
  const db = drizzle(client);
  
  // Update principal balance, interest accrued, etc.
  await db.update(loanBalances)
    .set({
      principalBalance: sql`principal_balance - ${allocation.balanceChanges.principalReduction}`,
      lastPaymentDate: new Date(),
      updatedAt: new Date()
    })
    .where(eq(loanBalances.loanId, loanId));
}