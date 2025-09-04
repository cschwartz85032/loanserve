import amqp from 'amqplib';
import axios from 'axios';
import { startConsumer } from '../consumer-utils';
import { Exchanges, Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';

export async function initHoiConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Hoi,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, loanId, hoiData }
      const { loanId, hoiData } = payload;

      // Call HOI vendor API for hazard insurance tracking
      const response = await axios.post(process.env.HOI_API_URL!, hoiData, {
        headers: { Authorization: `Bearer ${process.env.HOI_API_KEY}` },
        timeout: 10000,
      });

      const result = response.data;
      // Persist result to DB, e.g. update insurance status
      await client.query(
        'UPDATE loan_candidates SET hoi_status=$1, insurance_coverage=$2 WHERE id=$3',
        [result.status, result.coverage, loanId],
      );

      // Audit log
      await auditAction(client, {
        tenantId: payload.tenantId,
        targetType: 'loan_candidates',
        targetId: loanId,
        action: 'hoi_verification_completed',
        changes: { hoi_status: result.status, insurance_coverage: result.coverage },
      });

      // Publish domain event (Outbox)
      await publishEvent(client, {
        tenantId: payload.tenantId,
        aggregateId: loanId,
        aggregateType: 'loan',
        eventType: 'HoiVerificationCompleted',
        payload: { hoiResult: result },
      });
    },
  });
}