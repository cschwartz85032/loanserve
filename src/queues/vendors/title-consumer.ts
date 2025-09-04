import amqp from 'amqplib';
import axios from 'axios';
import { startConsumer } from '../consumer-utils';
import { Exchanges, Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';

export async function initTitleConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Title,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, loanId, titleData }
      const { loanId, titleData } = payload;

      // Call Title vendor API for title verification
      const response = await axios.post(process.env.TITLE_API_URL!, titleData, {
        headers: { Authorization: `Bearer ${process.env.TITLE_API_KEY}` },
        timeout: 10000,
      });

      const result = response.data;
      // Persist result to DB, e.g. update title status
      await client.query(
        'UPDATE loan_candidates SET title_status=$1, title_issues=$2 WHERE id=$3',
        [result.status, result.issues, loanId],
      );

      // Audit log
      await auditAction(client, {
        tenantId: payload.tenantId,
        targetType: 'loan_candidates',
        targetId: loanId,
        action: 'title_verification_completed',
        changes: { title_status: result.status, title_issues: result.issues },
      });

      // Publish domain event (Outbox)
      await publishEvent(client, {
        tenantId: payload.tenantId,
        aggregateId: loanId,
        aggregateType: 'loan',
        eventType: 'TitleVerificationCompleted',
        payload: { titleResult: result },
      });
    },
  });
}