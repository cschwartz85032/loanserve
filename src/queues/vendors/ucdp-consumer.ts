import amqp from 'amqplib';
import axios from 'axios';
import { startConsumer } from '../consumer-utils';
import { Exchanges, Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { CircuitBreaker, RetryWithBackoff } from '../vendor-circuit-breaker';

const circuitBreaker = new CircuitBreaker(5, 60000);
const retryWithBackoff = new RetryWithBackoff(3, 1000, 30000);

export async function initUcdpConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Ucdp,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, loanId, ucdpData }
      const { loanId, ucdpData } = payload;

      // Call UCDP vendor with circuit breaker and retry logic
      const response = await circuitBreaker.execute(() =>
        retryWithBackoff.execute(() =>
          axios.post(process.env.UCDP_API_URL!, ucdpData, {
            headers: { Authorization: `Bearer ${process.env.UCDP_API_KEY}` },
            timeout: parseInt(process.env.UCDP_TIMEOUT_MS || '15000'),
          })
        )
      );

      const result = response.data;
      // Persist result to DB, e.g. update appraisal status
      await client.query(
        'UPDATE loan_candidates SET ucdp_status=$1 WHERE id=$2',
        [result.status, loanId],
      );

      // Audit log
      await auditAction(client, {
        tenantId: payload.tenantId,
        targetType: 'loan_candidates',
        targetId: loanId,
        action: 'ucdp_submitted',
        changes: { ucdp_status: result.status },
      });

      // Publish domain event (Outbox)
      await publishEvent(client, {
        tenantId: payload.tenantId,
        aggregateId: loanId,
        aggregateType: 'loan',
        eventType: 'UcdpCompleted',
        payload: { ucdpResult: result },
      });
    },
  });
}