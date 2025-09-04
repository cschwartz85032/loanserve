import amqp from 'amqplib';
import axios from 'axios';
import { startConsumer } from '../consumer-utils';
import { Exchanges, Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';

export async function initFloodConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Flood,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, loanId, floodData }
      const { loanId, floodData } = payload;

      // Call Flood vendor API
      const response = await axios.post(process.env.FLOOD_API_URL!, floodData, {
        headers: { Authorization: `Bearer ${process.env.FLOOD_API_KEY}` },
        timeout: 10000,
      });

      const result = response.data;
      // Persist result to DB, e.g. update flood determination status
      await client.query(
        'UPDATE loan_candidates SET flood_status=$1, flood_determination=$2 WHERE id=$3',
        [result.status, result.determination, loanId],
      );

      // Audit log
      await auditAction(client, {
        tenantId: payload.tenantId,
        targetType: 'loan_candidates',
        targetId: loanId,
        action: 'flood_determination_completed',
        changes: { flood_status: result.status, flood_determination: result.determination },
      });

      // Publish domain event (Outbox)
      await publishEvent(client, {
        tenantId: payload.tenantId,
        aggregateId: loanId,
        aggregateType: 'loan',
        eventType: 'FloodDeterminationCompleted',
        payload: { floodResult: result },
      });
    },
  });
}