import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { drizzle } from 'drizzle-orm/postgres-js';

export async function initConflictConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Conflict,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, loanId, datapointKey }
      const { loanId, datapointKey, tenantId } = payload;
      const db = drizzle(client);

      // Find all datapoints for this key
      const conflictingDatapoints = await db.select()
        .from(loanDatapoints)
        .where(and(
          eq(loanDatapoints.loanId, loanId),
          eq(loanDatapoints.key, datapointKey)
        ))
        .orderBy(desc(loanDatapoints.authorityPriority));

      if (conflictingDatapoints.length <= 1) {
        // No conflict, nothing to do
        return;
      }

      // Detect conflicts between different values
      const uniqueValues = [...new Set(conflictingDatapoints.map(d => d.value))];
      
      if (uniqueValues.length > 1) {
        // Create conflict record
        await db.insert(loanConflicts).values({
          loanId,
          key: datapointKey,
          candidates: conflictingDatapoints,
          authorityRule: 'highest_priority_wins',
          status: 'open'
        });

        // Apply authority resolution - highest priority wins
        const winningDatapoint = conflictingDatapoints[0];
        await db.update(loanDatapoints)
          .set({ 
            authorityDecision: { 
              winner: true, 
              reason: 'highest_authority_priority',
              resolvedAt: new Date()
            }
          })
          .where(eq(loanDatapoints.id, winningDatapoint.id));

        // Mark other datapoints as overridden
        for (const datapoint of conflictingDatapoints.slice(1)) {
          await db.update(loanDatapoints)
            .set({
              authorityDecision: {
                winner: false,
                overriddenBy: winningDatapoint.id,
                reason: 'lower_authority_priority',
                resolvedAt: new Date()
              }
            })
            .where(eq(loanDatapoints.id, datapoint.id));
        }

        // Publish conflict resolution event
        await publishEvent(client, {
          tenantId,
          aggregateId: loanId,
          aggregateType: 'loan',
          eventType: 'ConflictResolved',
          payload: {
            key: datapointKey,
            conflictCount: conflictingDatapoints.length,
            winner: winningDatapoint.value,
            authority: 'system_rules'
          },
        });

        // Audit log
        await auditAction(client, {
          tenantId,
          targetType: 'loan_conflicts',
          targetId: loanId,
          action: 'conflict_auto_resolved',
          changes: {
            key: datapointKey,
            winnerValue: winningDatapoint.value,
            conflictCount: conflictingDatapoints.length
          },
        });
      }
    },
  });
}