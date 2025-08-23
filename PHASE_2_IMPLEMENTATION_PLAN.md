# Phase 2: Payment Processing Pipeline - Production Implementation Plan v3.0

## Executive Summary

Building on the robust messaging infrastructure from Phase 1, Phase 2 implements a bulletproof payment processing system with enforced invariants, complete source coverage, reversible flows, and zero ambiguity. This plan incorporates expert engineering review to ensure production readiness.

---

## Core Architecture

### Payment Lifecycle State Machine

```
received → accepted_for_review → validated → posted_pending_settlement
    ↓            ↓                    ↓              ↓
rejected    under_review         processing      settled
                                      ↓              ↓
                                  returned      reversed
                                      ↓              ↓
                                compensation     closed
```

**Key Principles:**
- **Monotonic State Transitions** - Never go backwards
- **Append-Only History** - Compensating entries, never deletion
- **Per-Loan Serialization** - Advisory locks prevent race conditions
- **Idempotent Operations** - Exactly-once processing guaranteed

---

## Implementation Components

### 1. Database Foundation ✅ IMPLEMENTED

**File:** `server/db/migrations/0013_payment_processing_foundation.sql`

**Features:**
- Double-entry ledger with one-sided constraint
- Investor positions with 100% ownership enforcement via triggers
- Escrow sub-accounts with categories (tax, hazard, flood, MI)
- Idempotency inbox for exactly-once processing
- Transactional outbox for atomic event publishing
- Payment state transition audit log
- ACH return window tracking
- Configurable allocation rules

**Key Invariants:**
```sql
-- Investor ownership must sum to exactly 10000 bps (100%)
CREATE TRIGGER trg_positions_sum
AFTER INSERT OR UPDATE OR DELETE ON investor_positions
FOR EACH STATEMENT
EXECUTE FUNCTION trg_check_investor_positions_sum();

-- One-sided ledger entries (either debit OR credit, not both)
CONSTRAINT chk_one_sided CHECK (
  (debit_cents > 0 AND credit_cents = 0) OR
  (credit_cents > 0 AND debit_cents = 0)
)
```

### 2. Message Envelope Standard ✅ IMPLEMENTED

**File:** `server/messaging/payment-envelope.ts`

**Schema:**
```typescript
interface PaymentEnvelope<T> {
  // Identification
  schema: string;              // "loanserve.payment.v1.validated"
  message_id: string;          // ULID
  correlation_id: string;      // UUID
  causation_id?: string;       // Original trigger
  
  // Idempotency & Tracing
  idempotency_key?: string;    // Business operation key
  trace_id?: string;           // W3C traceparent
  
  // Timing
  occurred_at: string;         // ISO 8601
  effective_date?: string;     // Payment application date
  settlement_due_by?: string;  // Expected settlement
  
  // Source
  payment_source?: PaymentSource;
  producer: string;            // Service version
  
  // Saga
  saga_id?: string;
  saga_step?: string;
  
  // Payload
  data: T;
}
```

### 3. Idempotency Service ✅ IMPLEMENTED

**File:** `server/services/payment-idempotency.ts`

**Features:**
- Inbox pattern for duplicate detection
- Outbox pattern for transactional publishing
- Source-specific idempotency key generation
- Result hashing for cache validation

**Key Methods:**
```typescript
// Check if already processed
checkProcessed(consumer, messageId): Promise<{processed, resultHash}>

// Record as processed with result hash
recordProcessed(consumer, messageId, resultHash, client)

// Add event to outbox for publishing after commit
addToOutbox(client, aggregate, envelope, routingKey)

// Generate idempotency keys by source
generateIdempotencyKey(source, data): string
```

### 4. Payment Allocation Engine ✅ IMPLEMENTED

**File:** `server/services/payment-allocation-engine.ts`

**Features:**
- Configurable allocation rules per loan
- Support for escrow-only payments
- Exact rounding with largest remainder method
- Per-loan serialization via advisory locks
- Target balance calculations

**Allocation Order (Default):**
1. Late fees
2. Accrued interest
3. Scheduled principal
4. Escrow shortage
5. Current escrow
6. Unapplied funds

**Key Methods:**
```typescript
// Main allocation with loan locking
allocate(client, loanId, amountCents, effectiveDate, isEscrowOnly)

// Ensure distributions sum exactly to total
applyLargestRemainderRounding(distributions, totalAmount)
```

---

## Payment Source Handlers

### ACH Payment Handler

**Settlement Rules:**
- Return window: 2-60 days based on return code
- R01 (NSF): 2 business days
- R07 (Authorization revoked): 60 days
- R29 (Corporate not available): 2 days

**Idempotency Key:** `ach:{trace_number}:{company_batch_id}:{originator_id}`

### Wire Payment Handler

**Settlement Rules:**
- Immediate settlement upon bank advice
- Low return risk

**Idempotency Key:** `wire:{wire_ref}:{amount}:{date}`

### Check/Lockbox Handler

**Settlement Rules:**
- Post as pending
- Settle after bank clearance
- Handle NSF/stop payment returns

**Validation:**
- Not stale-dated
- Not post-dated
- Duplicate detection

**Idempotency Key:** `check:{number}:{account}:{amount}:{issue_date}`

### Card Payment Handler

**Settlement Rules:**
- Two-step: authorization → capture
- Settle on successful capture
- Chargebacks trigger reversal

**Idempotency Key:** `card:{transaction_id}:{merchant_ref}`

---

## Investor Distribution System

### Ownership Management

**Effective Dating:**
- Version-based ownership tracking
- Positions must sum to exactly 100% (10,000 bps)
- Database trigger enforces invariant

### Distribution Calculation

**Process:**
1. Get effective ownership for payment date
2. Calculate servicing fee
3. Apply waterfall rules (pro-rata or sequential)
4. Use largest remainder rounding
5. Post to distribution ledger

**Clawback Handling:**
- Create negative distributions on return
- Net against future payables
- Create receivable if netting not possible
- Notify investors

---

## Reversal & Compensation

### Reversal Saga Steps

1. **Reverse Loan Ledger**
   - Create mirror entries (swap debits/credits)
   - Link to original via `reversal_of`

2. **Reverse Escrow**
   - Reverse contributions
   - Move paid invoices to shortage

3. **Create Negative Distributions**
   - Generate clawback records
   - Schedule netting/collection

4. **Recompute Interest/Fees**
   - Recalculate as if payment never happened
   - Apply late fees if grace period exceeded

5. **Notifications**
   - Notify borrower
   - Notify investors
   - Create compliance event

### ACH Return Code Handling

**Retryable Returns:**
- R01 (NSF)
- R09 (Uncollected funds)

**Permanent Returns:**
- R02 (Account closed)
- R07 (Authorization revoked)
- R10 (Customer advises not authorized)

---

## Messaging Topology

### Exchanges
- `payments.topic` - Payment lifecycle events
- `returns.topic` - Bank returns/chargebacks
- `distributions.topic` - Investor calculations
- `compliance.topic` - Regulatory monitoring
- `audit.topic` - Immutable audit log

### Queue Bindings

| Queue | Bindings | Purpose |
|-------|----------|---------|
| `payments.validation` | `payment.*.received` | Initial validation |
| `payments.processing` | `payment.*.validated` | Core processing |
| `payments.posted` | `payment.*.processed` | Ledger posting |
| `payments.settlement` | `payment.*.settlement.*` | Settlement monitoring |
| `payments.returned` | `payment.*.returned` | Return handling |
| `payments.reversal` | `payment.*.reversal.*` | Compensation |
| `payments.distribution` | `payment.*.settled` | Investor calcs |
| `investor.posting` | `distribution.calculated` | Write distributions |
| `investor.clawback` | `distribution.clawback` | Handle clawbacks |
| `escrow.apply` | `payment.*.processed` | Update escrow |
| `escrow.reverse` | `payment.*.reversed` | Reverse escrow |
| `audit.events` | `*.*.*` | All events |

### DLQ Policy
- 3 retry tiers: 30s, 5m, 30m
- Functional failures → parking lot (no retry)
- Transient failures → exponential backoff

---

## Monitoring & Operations

### SLOs

| Stage | P95 Target | P99 Target |
|-------|------------|------------|
| Validation | 200ms | 500ms |
| Processing | 500ms | 1000ms |
| Distribution | 400ms | 800ms |

### Key Metrics
- Payment processing rate
- Stage latency (p95/p99)
- Queue depth and lag
- Settlement probe status
- Reversal backlog
- DLQ accumulation

### Daily Reconciliations
1. Bank files vs `payment_transactions`
2. Investor payables vs distributions
3. Escrow balances vs ledger
4. Unapplied funds aging

### Alerts
- DLQ depth > 10 for 5 minutes
- Processing lag > 100 messages
- Settlement probes overdue
- Reconciliation variance > $0.01

---

## Testing Strategy

### Unit Tests
- **Allocation Engine**: 500+ table-driven cases
- **Rounding**: Property-based testing
- **Idempotency**: Duplicate detection
- **State Machine**: Valid transitions only

### Integration Tests
- ACH: receive → validate → process → settle → distribute
- ACH Return: return → reversal → clawback
- Wire: immediate settlement flow
- Check: NSF handling
- Partial payments
- Escrow-only payments
- Back-dated payments

### Load Tests
- 1,000 payments/minute sustained
- 2,000 payments/minute peak
- Payment mix: 60% ACH, 20% wire, 15% check, 5% other
- 24-hour soak test
- Chaos engineering: kill consumers mid-transaction

### Golden Datasets
- Real-world ACH edge cases
- Month-end batch processing
- Complex waterfall distributions
- Multi-investor scenarios

---

## Security & Compliance

### Data Protection
- No PAN storage (tokens only)
- Field-level encryption for PII
- TLS everywhere
- Secrets in environment variables

### Audit Trail
- Every state transition logged
- Immutable audit events
- W3C trace context propagation
- Replicate to object storage with WORM

### Compliance
- PCI DSS for card payments
- NACHA rules for ACH
- Reg E/Z compliance
- State-specific lending regulations

---

## Performance Configuration

### Consumer Settings
- **Validation**: prefetch 64
- **Processing**: prefetch 8-16
- **Distribution**: prefetch 16-32

### Database
- Connection pool: 50-100
- Prepared statements
- Advisory locks for serialization
- Partition large tables monthly

### RabbitMQ
- Quorum queues for financial data
- Lazy queues for audit logs
- Publisher confirms enabled
- Heartbeat: 30s

---

## Operational Runbooks

### Payment Stuck in Processing
1. Check consumer health
2. Verify database locks
3. Look for processing errors
4. Manually advance if safe

### ACH Return Received
1. Identify return code
2. Trigger reversal saga
3. Monitor compensation
4. Verify completion

### Reconciliation Mismatch
1. Identify variance source
2. Check for timing differences
3. Review ledger entries
4. Adjust if necessary

### DLQ Message Recovery
1. Classify error type
2. Fix underlying issue
3. Replay with new correlation ID
4. Monitor processing

---

## Implementation Timeline

### Week 1: Foundation ✅
- Database schema
- Idempotency service
- Allocation engine
- Message envelope

### Week 2: Payment Sources
- ACH handler
- Wire handler
- Check/lockbox handler
- Card handler

### Week 3: Core Processing
- Validation consumer
- Processing consumer
- Settlement monitor
- Ledger posting

### Week 4: Distributions
- Distribution calculator
- Waterfall processor
- Clawback handler
- Investor notifications

### Week 5: Reversals
- Reversal saga
- Compensation logic
- Return code handling
- State recovery

### Week 6: Production Ready
- Integration testing
- Load testing
- Monitoring setup
- Documentation
- Deployment

---

## Success Criteria

✅ All payment sources supported
✅ State machine fully implemented
✅ Allocation engine with configurable rules
✅ Investor distributions accurate to the penny
✅ Complete reversal flows
✅ Idempotency guaranteed
✅ 100% ownership invariant enforced
✅ SLOs met under load
✅ Zero message loss
✅ Full audit trail

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data inconsistency | Saga pattern with compensation |
| Race conditions | Per-loan advisory locks |
| Duplicate processing | Idempotency inbox |
| Message loss | Outbox pattern + confirms |
| Calculation errors | Property testing + reconciliation |
| Ownership != 100% | Database trigger enforcement |

---

## Next Steps

1. **Complete handler implementations** (Week 2)
2. **Build core consumers** (Week 3)
3. **Implement distribution system** (Week 4)
4. **Add reversal flows** (Week 5)
5. **Production testing** (Week 6)

This production-ready plan incorporates all expert recommendations to deliver an enterprise-grade payment processing system with mathematical precision, complete auditability, and bulletproof reliability.