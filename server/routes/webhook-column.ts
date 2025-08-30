import express from 'express';
import crypto from 'crypto';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';

const COLUMN_SECRET = process.env.COLUMN_WEBHOOK_SECRET!;
const router = express.Router();

router.post('/webhook/column', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.header('X-Signature') || '';
  const expectedSig = crypto.createHmac('sha256', COLUMN_SECRET).update(req.body).digest('hex');
  
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return res.status(401).send('Invalid signature');
  }
  
  const event = JSON.parse(req.body.toString('utf8'));
  const idempotencyKey = event.id;
  
  // Normalize event as needed; example for payment settled
  const normalized = {
    event_type: event.type,
    occurred_at: event.occurred_at || new Date().toISOString(),
    resource: event.resource,
  };
  
  try {
    const rabbit = getEnhancedRabbitMQService();
    
    // Publish to payments topic exchange with routing key for Column events
    await rabbit.publish({
      message_id: `column-webhook-${idempotencyKey}`,
      correlation_id: req.correlationId || crypto.randomUUID(),
      trace_id: req.correlationId || crypto.randomUUID(), 
      schema: 'loanserve.v1.payment.column_event',
      priority: 5,
      data: normalized
    }, {
      exchange: 'payments.topic',
      routingKey: 'payment.column.event',
      persistent: true,
      headers: { 
        'x-idempotency-key': idempotencyKey,
        'x-event-type': event.type
      }
    });
    
    res.sendStatus(200);
  } catch (error) {
    console.error('[ColumnWebhook] Failed to publish event:', error);
    res.sendStatus(200); // Still return 200 to prevent Column retries on our processing errors
  }
});

export default router;