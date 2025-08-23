# LoanServe Pro Messaging Infrastructure Documentation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Message Envelope Standard](#message-envelope-standard)
4. [Queue Architecture](#queue-architecture)
5. [Exchange Topology](#exchange-topology)
6. [Usage Examples](#usage-examples)
7. [Consumer Patterns](#consumer-patterns)
8. [Error Handling](#error-handling)
9. [Monitoring & Operations](#monitoring--operations)
10. [Best Practices](#best-practices)

---

## Architecture Overview

LoanServe Pro uses an enterprise-grade RabbitMQ messaging infrastructure hosted on CloudAMQP for asynchronous processing of loan servicing operations. The system implements advanced patterns including:

- **Dual Connection Pooling**: Separate connections for publishers and consumers
- **Publisher Confirms**: Guaranteed message delivery
- **Idempotency**: Exactly-once processing guarantees
- **Saga Orchestration**: Complex multi-step workflows
- **Sharded Queues**: Per-loan serialization for ordered processing
- **Dead Letter Queues**: Comprehensive error handling

### Key Statistics
- **38 Total Queues**
- **12 Exchanges**
- **22 Quorum Queues** (high durability for financial data)
- **3 Lazy Queues** (for large message backlogs)
- **11 Dead Letter Queues** (error handling)

---

## Core Components

### 1. Enhanced RabbitMQ Service
Located at `server/services/rabbitmq-enhanced.ts`

**Features:**
- Automatic topology setup on startup
- Connection resilience with exponential backoff
- Publisher confirms for reliability
- Consumer channel management
- Built-in monitoring and metrics

### 2. Message Factory
Located at `server/messaging/message-factory.ts`

**Capabilities:**
- ULID generation for unique message IDs
- Correlation tracking for request/response patterns
- Schema versioning
- Priority and TTL support

### 3. Idempotent Consumer
Located at `server/messaging/idempotent-consumer.ts`

**Guarantees:**
- Exactly-once processing
- Result caching for duplicate detection
- Automatic cleanup of old entries
- Processing metrics tracking

### 4. Topology Manager
Located at `server/messaging/rabbitmq-topology.ts`

**Manages:**
- Exchange declarations
- Queue configurations
- Binding definitions
- Dead letter routing

---

## Message Envelope Standard

All messages follow a standardized envelope format for consistency and traceability:

```typescript
interface MessageEnvelope<T = any> {
  // Core identification
  message_id: string;        // ULID format (e.g., "01K3C1MXX48FCWRNEEKYJF1R8P")
  correlation_id: string;    // UUID for request correlation
  causation_id?: string;     // Original message that caused this one
  
  // Schema management
  schema_name: string;       // Message type identifier
  schema_version: string;    // Semantic versioning (e.g., "1.0.0")
  
  // Timing
  timestamp: Date;           // Message creation time
  expires_at?: Date;         // Optional expiration
  
  // Content
  data: T;                   // Actual message payload
  metadata?: Record<string, any>;  // Additional context
  
  // Delivery control
  priority?: MessagePriority;  // 0 (low) to 10 (urgent)
  reply_to?: string;          // Queue for responses
  
  // Tracing
  trace_context?: TraceContext;  // W3C trace context
  retry_count?: number;       // Retry attempts
  source?: string;            // Originating service
}
```

### Example Envelope
```json
{
  "message_id": "01K3C1MXX48FCWRNEEKYJF1R8P",
  "correlation_id": "89f4522d-1880-4d68-9feb-044a0a3110f3",
  "schema_name": "payment.received",
  "schema_version": "1.0.0",
  "timestamp": "2025-08-23T18:00:00Z",
  "data": {
    "payment_id": "PMT-2025-001",
    "loan_id": "LN-100234",
    "amount": 2500.00,
    "payment_date": "2025-08-23",
    "payment_method": "ACH"
  },
  "metadata": {
    "source_system": "payment_portal",
    "user_id": "USR-456"
  },
  "priority": 5
}
```

---

## Queue Architecture

### 1. Daily Servicing Queues (Sharded)
**Purpose:** Process daily loan servicing tasks with per-loan serialization

**Queues:**
- `servicing.daily.tasks.0` through `servicing.daily.tasks.7`

**Configuration:**
- Type: Quorum queues
- Sharding: 8 shards based on loan ID hash
- Dead Letter: Individual DLQ per shard

**Example Usage:**
```typescript
// Calculate shard for loan
const loanId = "LN-100234";
const shard = EnhancedRabbitMQService.calculateShard(loanId, 8);

// Publish to specific shard
await rabbitmq.publish(envelope, {
  exchange: 'servicing.direct',
  routingKey: `servicing.${shard}.interest`
});
```

### 2. Payment Processing Pipeline
**Purpose:** Validate, process, and distribute loan payments

**Queues:**
| Queue | Purpose | Type | Routing Key |
|-------|---------|------|-------------|
| `payments.validation` | Validate payment data | Quorum | `payment.*.received` |
| `payments.processing` | Process validated payments | Quorum | `payment.*.validated` |
| `payments.distribution` | Distribute to investors | Quorum | `payment.*.processed` |
| `payments.compliance` | Compliance checks | Quorum | `payment.*.compliance` |

**Flow Example:**
```typescript
// 1. Payment received
const paymentEnvelope = messageFactory.create({
  schema_name: 'payment.received',
  data: {
    payment_id: 'PMT-001',
    loan_id: 'LN-100234',
    amount: 2500.00,
    payment_date: new Date()
  }
});

// Publish to validation queue
await rabbitmq.publish(paymentEnvelope, {
  exchange: 'payments.topic',
  routingKey: 'payment.loan.received'
});

// 2. After validation, publish to processing
const validatedEnvelope = messageFactory.createReply(paymentEnvelope, {
  schema_name: 'payment.validated',
  data: { ...validatedPaymentData }
});

await rabbitmq.publish(validatedEnvelope, {
  exchange: 'payments.topic',
  routingKey: 'payment.loan.validated'
});
```

### 3. Document Analysis
**Purpose:** AI-powered document processing

**Queue:** `documents.analysis.request`
- Type: Lazy queue (handles large documents)
- Exchange: `documents.direct`
- Routing Key: `analyze`

**Example:**
```typescript
const docEnvelope = messageFactory.create({
  schema_name: 'document.analysis.request',
  data: {
    document_id: 'DOC-789',
    file_path: '/uploads/loan-agreement.pdf',
    analysis_type: 'loan_extraction',
    loan_id: 'LN-100234'
  },
  priority: MessagePriority.HIGH
});

await rabbitmq.publish(docEnvelope, {
  exchange: 'documents.direct',
  routingKey: 'analyze'
});
```

### 4. Notification System
**Purpose:** Multi-channel notifications

**Queues:**
- `notifications.email` - Email notifications
- `notifications.sms` - SMS alerts
- `notifications.dashboard` - In-app notifications

**Routing Pattern:** `notify.{priority}.{loan_id}.{channel}`

**Example:**
```typescript
// Send high-priority payment reminder via email
const notificationEnvelope = messageFactory.create({
  schema_name: 'notification.send',
  data: {
    recipient: 'borrower@example.com',
    template: 'payment_reminder',
    variables: {
      name: 'John Doe',
      amount: '$2,500',
      due_date: '2025-08-30'
    }
  },
  priority: MessagePriority.HIGH
});

await rabbitmq.publish(notificationEnvelope, {
  exchange: 'notifications.topic',
  routingKey: 'notify.high.LN-100234.email'
});
```

### 5. Escrow Workflow
**Purpose:** Multi-step escrow disbursement process

**Queues:**
- `escrow.validate` - Validate disbursement request
- `escrow.authorize` - Obtain authorization
- `escrow.disburse` - Execute disbursement
- `escrow.reconcile` - Reconcile accounts

**Saga Example:**
```typescript
// Start escrow disbursement saga
const sagaId = ulid();
const disbursementEnvelope = messageFactory.create({
  schema_name: 'escrow.disbursement.request',
  data: {
    saga_id: sagaId,
    loan_id: 'LN-100234',
    disbursement_type: 'property_tax',
    amount: 5000.00,
    payee: 'County Tax Office'
  },
  metadata: {
    saga_type: 'escrow_disbursement',
    current_step: 'validate'
  }
});

// Publish to validation step
await rabbitmq.publish(disbursementEnvelope, {
  exchange: 'escrow.workflow',
  routingKey: 'escrow.validate'
});
```

### 6. Compliance Monitoring
**Purpose:** Regulatory and investor compliance

**Queues:**
- `compliance.regulatory` - Government compliance
- `compliance.investor` - Investor requirements
- `compliance.internal` - Internal policies

### 7. Investor Calculations
**Purpose:** Prioritized investor distribution calculations

**Queues:**
- `investor.calc.p10` - Priority 10 (highest)
- `investor.calc.p5` - Priority 5 (medium)
- `investor.calc.p1` - Priority 1 (low)

### 8. Audit Trail
**Purpose:** Comprehensive audit logging

**Queue:** `audit.events`
- Type: Lazy queue (high volume)
- Retention: Extended for compliance

---

## Exchange Topology

| Exchange | Type | Purpose |
|----------|------|---------|
| `servicing.direct` | Direct | Daily servicing task routing |
| `payments.topic` | Topic | Payment pipeline routing |
| `documents.direct` | Direct | Document processing |
| `notifications.topic` | Topic | Multi-channel notifications |
| `escrow.workflow` | Topic | Escrow saga steps |
| `escrow.compensate` | Topic | Saga compensation |
| `compliance.topic` | Topic | Compliance checks |
| `investor.direct` | Direct | Investor calculations |
| `audit.topic` | Topic | Audit events |
| `dlx.main` | Topic | Dead letter routing |
| `retry.5s` | Topic | 5-second retry |
| `retry.30s` | Topic | 30-second retry |

---

## Usage Examples

### Publishing a Message
```typescript
import { getEnhancedRabbitMQService } from './services/rabbitmq-enhanced';
import { getMessageFactory } from './messaging/message-factory';

async function publishPayment(paymentData: PaymentData) {
  const rabbitmq = getEnhancedRabbitMQService();
  const messageFactory = getMessageFactory();
  
  // Create message envelope
  const envelope = messageFactory.create({
    schema_name: 'payment.received',
    schema_version: '1.0.0',
    data: paymentData,
    priority: MessagePriority.NORMAL
  });
  
  // Publish with confirmation
  const published = await rabbitmq.publish(envelope, {
    exchange: 'payments.topic',
    routingKey: 'payment.loan.received',
    priority: 5
  });
  
  if (published) {
    console.log(`Payment message published: ${envelope.message_id}`);
  }
}
```

### Creating an Idempotent Consumer
```typescript
import { createIdempotentHandler } from './messaging/idempotent-consumer';

// Define handler
const paymentHandler = createIdempotentHandler({
  consumer_id: 'payment-processor',
  handler: async (envelope: MessageEnvelope<PaymentData>) => {
    const { data } = envelope;
    
    // Process payment
    const result = await processPayment(data);
    
    // Return result for caching
    return {
      payment_id: result.id,
      status: 'processed',
      timestamp: new Date()
    };
  },
  result_hash_fn: (result) => {
    // Create hash for duplicate detection
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(result))
      .digest('hex');
  }
});

// Consume messages
await rabbitmq.consume('payments.validation', paymentHandler);
```

### Implementing a Saga Step
```typescript
async function handleEscrowValidation(envelope: MessageEnvelope) {
  const { saga_id, loan_id, amount } = envelope.data;
  
  try {
    // Validate disbursement
    const validation = await validateDisbursement(loan_id, amount);
    
    if (validation.approved) {
      // Progress to next step
      const nextEnvelope = messageFactory.createReply(envelope, {
        schema_name: 'escrow.validation.complete',
        data: {
          ...envelope.data,
          validation_result: validation
        },
        metadata: {
          ...envelope.metadata,
          current_step: 'authorize'
        }
      });
      
      await rabbitmq.publish(nextEnvelope, {
        exchange: 'escrow.workflow',
        routingKey: 'escrow.authorize'
      });
    } else {
      // Trigger compensation
      await publishCompensation(saga_id, 'validation_failed');
    }
  } catch (error) {
    // Record failure
    await recordSagaFailure(saga_id, error);
    
    // Send to DLQ
    throw error;
  }
}
```

### Batch Processing
```typescript
async function processDailyServicing(loanIds: string[]) {
  const messageFactory = getMessageFactory();
  const rabbitmq = getEnhancedRabbitMQService();
  
  // Create batch of messages
  const messages = messageFactory.createBatch(
    loanIds.map(loanId => ({
      schema_name: 'servicing.daily.task',
      data: {
        loan_id: loanId,
        task_type: 'interest_accrual',
        processing_date: new Date()
      }
    }))
  );
  
  // Publish to sharded queues
  const results = await Promise.all(
    messages.map(async (envelope) => {
      const loanId = envelope.data.loan_id;
      const shard = EnhancedRabbitMQService.calculateShard(loanId, 8);
      
      return rabbitmq.publish(envelope, {
        exchange: 'servicing.direct',
        routingKey: `servicing.${shard}.interest`
      });
    })
  );
  
  console.log(`Published ${results.filter(r => r).length} servicing tasks`);
}
```

---

## Consumer Patterns

### Basic Consumer
```typescript
await rabbitmq.consume('queue.name', async (msg) => {
  const envelope = JSON.parse(msg.content.toString());
  
  try {
    await processMessage(envelope);
    msg.ack(); // Acknowledge success
  } catch (error) {
    msg.nack(false, false); // Send to DLQ
  }
});
```

### Idempotent Consumer with Retry
```typescript
const handler = createIdempotentHandler({
  consumer_id: 'my-consumer',
  handler: async (envelope) => {
    // Process with automatic duplicate detection
    return await processWithRetry(envelope);
  },
  max_retries: 3,
  retry_delay_ms: 1000
});

await rabbitmq.consume('queue.name', handler);
```

### Parallel Consumer Pool
```typescript
// Create multiple consumers for parallel processing
const consumerCount = 4;
const consumers = [];

for (let i = 0; i < consumerCount; i++) {
  consumers.push(
    rabbitmq.consume(`payments.processing`, handler, {
      consumerTag: `consumer-${i}`,
      prefetch: 10 // Process up to 10 messages in parallel
    })
  );
}

await Promise.all(consumers);
```

---

## Error Handling

### Dead Letter Queue Strategy
Each primary queue has a corresponding DLQ for failed messages:

```typescript
// Primary queue configuration
{
  name: 'payments.validation',
  options: {
    arguments: {
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'payments.dlq',
      'x-max-retries': 3
    }
  }
}
```

### Processing Dead Letters
```typescript
async function processDLQ() {
  await rabbitmq.consume('dlq.payments', async (msg) => {
    const envelope = JSON.parse(msg.content.toString());
    const deathCount = msg.properties.headers['x-death']?.[0]?.count || 0;
    
    // Store in database for manual review
    await db.execute(`
      INSERT INTO dead_letter_messages 
      (queue_name, message_id, envelope, error_count, last_failed_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    `, ['payments', envelope.message_id, envelope, deathCount]);
    
    // Alert operations team
    await sendAlert({
      type: 'dlq_message',
      queue: 'payments',
      message_id: envelope.message_id,
      failure_count: deathCount
    });
    
    msg.ack();
  });
}
```

### Retry Logic with Exponential Backoff
```typescript
async function retryWithBackoff(
  fn: () => Promise<any>,
  maxRetries: number = 3
) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
```

---

## Monitoring & Operations

### Connection Health Check
```typescript
async function checkMessagingHealth() {
  const rabbitmq = getEnhancedRabbitMQService();
  const status = await rabbitmq.getConnectionStatus();
  
  return {
    publisher_connected: status.publisherConnected,
    consumer_connected: status.consumerConnected,
    active_consumers: status.activeConsumers,
    reconnect_attempts: status.reconnectAttempts
  };
}
```

### Queue Statistics
```typescript
async function getQueueStats(queueName: string) {
  const rabbitmq = getEnhancedRabbitMQService();
  return await rabbitmq.getQueueStats(queueName);
}

// Example response:
{
  messageCount: 42,
  consumerCount: 2
}
```

### Message Metrics
```typescript
async function getConsumerMetrics(consumerId: string) {
  const result = await db.execute(`
    SELECT 
      COUNT(*) as total_processed,
      AVG(processing_time_ms) as avg_time_ms,
      SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*) as success_rate
    FROM message_metrics
    WHERE consumer = $1
      AND processed_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
  `, [consumerId]);
  
  return result.rows[0];
}
```

### Topology Verification
```typescript
async function verifyTopology() {
  const topology = await rabbitmq.getTopologyStats();
  
  const expected = {
    exchanges: 12,
    queues: 38,
    quorumQueues: 22,
    lazyQueues: 3,
    dlqs: 11
  };
  
  const isValid = Object.entries(expected).every(
    ([key, value]) => topology[key] === value
  );
  
  return { isValid, topology, expected };
}
```

---

## Best Practices

### 1. Message Design
- Keep payloads small and focused
- Use schema versioning for backward compatibility
- Include all context needed for processing
- Avoid circular dependencies between services

### 2. Queue Configuration
- Use quorum queues for financial data
- Use lazy queues for high-volume, low-priority messages
- Set appropriate TTLs for time-sensitive messages
- Configure prefetch based on processing capacity

### 3. Error Handling
- Always define DLQ routing
- Implement idempotency for critical operations
- Log failed messages with full context
- Set up alerts for DLQ accumulation

### 4. Performance
- Use batch publishing for bulk operations
- Implement connection pooling
- Monitor queue depths and consumer lag
- Scale consumers based on queue metrics

### 5. Security
- Never include sensitive data in routing keys
- Encrypt sensitive payload fields
- Use separate vhosts for different environments
- Implement message signing for critical operations

### 6. Testing
```typescript
// Example integration test
describe('Payment Processing Pipeline', () => {
  it('should process payment through all stages', async () => {
    const testPayment = {
      payment_id: 'TEST-001',
      loan_id: 'LN-TEST',
      amount: 1000
    };
    
    // Publish test message
    const envelope = messageFactory.create({
      schema_name: 'payment.received',
      data: testPayment
    });
    
    await rabbitmq.publish(envelope, {
      exchange: 'payments.topic',
      routingKey: 'payment.test.received'
    });
    
    // Wait for processing
    await waitForMessage('payments.distribution', (msg) => {
      const processed = JSON.parse(msg.content.toString());
      return processed.data.payment_id === testPayment.payment_id;
    });
    
    // Verify results
    const result = await getPaymentStatus(testPayment.payment_id);
    expect(result.status).toBe('distributed');
  });
});
```

---

## Troubleshooting

### Common Issues

**1. Messages stuck in queue**
- Check consumer health
- Verify consumer acknowledgment
- Look for processing errors in logs

**2. High memory usage**
- Switch to lazy queues for large backlogs
- Implement pagination for bulk operations
- Set queue length limits

**3. Message ordering issues**
- Use sharded queues for per-entity ordering
- Implement sequence numbers
- Consider saga patterns for complex workflows

**4. Duplicate processing**
- Implement idempotency keys
- Use consumer inbox pattern
- Check for consumer reconnection issues

---

## Migration Path

### Adding New Queue
1. Update topology configuration
2. Deploy topology changes
3. Update consumers
4. Start publishing
5. Monitor metrics

### Changing Message Schema
1. Increment schema version
2. Support both versions in consumer
3. Gradually migrate publishers
4. Deprecate old version
5. Remove legacy support

---

## API Endpoints for Testing

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/messaging/topology` | GET | View current topology |
| `/api/messaging/connection-info` | GET | Check connection status |
| `/api/messaging/queue-stats/:queue` | GET | Get queue statistics |
| `/api/messaging/publish-test` | POST | Test message publishing |
| `/api/messaging/test-idempotent` | POST | Test idempotency |
| `/api/messaging/publish-batch` | POST | Test batch publishing |

---

## Environment Variables

```bash
# Required
CLOUDAMQP_URL=amqps://user:pass@host/vhost

# Optional
RABBITMQ_PREFETCH=10
RABBITMQ_HEARTBEAT=30
RABBITMQ_CONNECTION_TIMEOUT=30000
RABBITMQ_MAX_RECONNECT_ATTEMPTS=10
```

---

## Support & Maintenance

### Health Monitoring Checklist
- [ ] All connections active
- [ ] Queue depths within limits
- [ ] Consumer lag acceptable
- [ ] DLQ accumulation monitored
- [ ] Error rates within thresholds
- [ ] Message processing times normal

### Daily Operations
1. Review DLQ messages
2. Check consumer metrics
3. Monitor queue depths
4. Verify topology integrity
5. Review error logs

### Capacity Planning
- Monitor peak message rates
- Track processing times
- Plan for seasonal variations
- Scale consumers proactively
- Implement circuit breakers

---

## Conclusion

The LoanServe Pro messaging infrastructure provides a robust, scalable foundation for asynchronous processing of loan servicing operations. With built-in reliability patterns, comprehensive monitoring, and clear operational procedures, the system is designed to handle enterprise-scale workloads while maintaining data integrity and compliance requirements.

For additional support or questions, consult the technical architecture team or refer to the CloudAMQP documentation for platform-specific features.