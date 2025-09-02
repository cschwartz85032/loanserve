# AI Servicing Pipeline Implementation

## 🎯 Non-Negotiables ✅ COMPLETE

### ✅ Investor-First; Escrow-Led Intake
- **Authority Matrix** with investor directives at priority 1000 (highest)
- **Escrow instructions** at priority 900 (second highest)
- **Deterministic conflict resolution** ensures investor requirements always win
- **MISMO/CSV/JSON/PDF support** for lender document imports

### ✅ Do-Not-Ping Enforcement
- **Server-side enforcement** prevents human contact for available data
- **Automated document processing** handles standard formats
- **Confidence thresholds** (CONF_ACCEPT=0.80, CONF_HITL=0.60) determine automation
- **Vendor API integration** for authoritative data sources

### ✅ Explainable by Construction
- **Complete lineage tracking**: doc_id, page, text_hash, confidence, source, version
- **SHA-256 text hashes** for tamper detection and integrity verification
- **Transformation logging** tracks all data modifications with timestamps
- **Human-readable explanations** generated from lineage chains

### ✅ Deterministic Before AI
- **Authority Matrix** resolves all conflicts using predefined hierarchy
- **Field-specific rules** for specialized loan data handling
- **Time-independent decisions** ensure reproducible results
- **Business rule validation** with program-specific logic (FNMA, FHLMC)

### ✅ Self-Healing Architecture
- **Idempotent workers** prevent duplicate processing
- **Exponential backoff retry** with configurable limits
- **Dead Letter Queue (DLQ)** for permanently failed items
- **Comprehensive error handling** with detailed logging

### ✅ Enterprise Security
- **SSO/MFA integration** through existing Phase 10 infrastructure
- **Row Level Security (RLS)** with tenant isolation
- **KMS encryption** using envelope encryption pattern
- **Immutable audit trails** with hash-chain verification

## 🏗 Architecture Components

### Core Pipeline (`src/ai-pipeline.ts`)
Main orchestrator implementing all non-negotiables with health monitoring and compliance reporting.

### Authority Matrix (`src/authority/authority-matrix.ts`)
Deterministic conflict resolution with investor-first hierarchy:
- Investor Directive (1000) → Escrow Instruction (900) → Manual Entry (800) → Vendor API (700) → Document Parse (600) → AI Extraction (500) → OCR (400)

### Self-Healing Workers (`src/workers/`)
- **Document Intake Worker**: Processes MISMO/CSV/JSON/PDF with AWS Textract
- **Self-Healing Framework**: Base class with retry logic, DLQ, and monitoring

### Lineage Tracking (`src/utils/lineage-tracker.ts`)
Complete provenance tracking with:
- Document references with bounding boxes
- Text hash verification for integrity
- Transformation chains with input/output tracking
- Derived lineage for calculated fields

### Field Validators (`src/utils/validation/field-validators.ts`)
Business rule validation with:
- FNMA/FHLMC program-specific rules
- Cross-field validations (e.g., maturity after origination)
- Auto-correction suggestions
- Confidence threshold enforcement

### Pipeline Monitor (`src/monitoring/pipeline-monitor.ts`)
Real-time observability with:
- Prometheus metrics export
- Alert management with severity levels
- Health status reporting
- Performance tracking

## 📊 Document Processing Flow

```
1. Document Intake
   ├── Format Detection (MISMO/CSV/JSON/PDF)
   ├── OCR/Text Extraction (AWS Textract)
   ├── AI Field Extraction (X.AI Grok)
   └── Document Classification

2. Authority Resolution
   ├── Apply Investor Directives (Priority 1000)
   ├── Apply Escrow Instructions (Priority 900)
   ├── Resolve Field Conflicts (Deterministic)
   └── Create Authority Decisions

3. Lineage Creation
   ├── Generate Text Hashes (SHA-256)
   ├── Record Document References
   ├── Track Transformations
   └── Build Explanation Chains

4. Validation & Quality
   ├── Business Rule Validation
   ├── Confidence Threshold Checks
   ├── Cross-Field Validations
   └── Auto-Correction Suggestions

5. Audit & Monitoring
   ├── Log to Immutable Audit (Phase 10)
   ├── Record Metrics (Prometheus)
   ├── Generate Alerts
   └── Update Health Status
```

## 🔧 Configuration

### Environment Variables (`config/ai-pipeline.env.example`)
```bash
# Core Configuration
EXTRACTOR_VERSION=v2025.09.01
PROGRAM=FNMA
INVESTOR_PROFILE=DEFAULT

# Processing Thresholds
CONF_ACCEPT=0.80        # Auto-accept threshold
CONF_HITL=0.60          # Human-in-the-loop threshold
OCR_TIMEOUT_MS=180000   # 3 minutes

# AI Processing
SPLIT_COSINE_THETA=0.35
CLASSIFIER_DELTA=0.18
OCR_MIN_CONF_PAGE=0.80

# AWS Integration
AWS_REGION=us-east-1
S3_BUCKET=loanserve-docs
S3_PREFIX=tenants

# Message Queue
AMQP_URL=amqps://YOUR_RABBIT_URL
```

### Validation Rules
- **Loan amounts**: $0.01 - $50M range, FNMA conforming limits
- **Interest rates**: 0.1% - 50% range, market reasonableness
- **Dates**: Future maturity, logical sequencing
- **Names**: Format validation, proper case normalization
- **Addresses**: Street number validation, completeness checks

## 📈 Monitoring & Observability

### Key Metrics
- `ai_pipeline_documents_processed_total` - Processing volume
- `ai_pipeline_processing_duration_seconds` - Performance tracking
- `ai_pipeline_extraction_accuracy` - Quality metrics
- `ai_pipeline_validation_errors_total` - Error tracking
- `ai_pipeline_authority_decisions_total` - Conflict resolution
- `ai_pipeline_worker_health` - System health

### Alert Thresholds
- **Critical**: Worker failure, processing timeout > 5min
- **Warning**: Low confidence < 60%, high queue depth > 1000
- **Info**: Authority conflicts resolved, auto-corrections applied

### Health Dashboard
- Real-time processing status
- Confidence score distributions
- Authority decision statistics
- Lineage integrity verification

## 🚀 Usage Examples

### Basic Document Processing
```typescript
import AIPipeline from './src/ai-pipeline';

const pipeline = new AIPipeline({
  tenantId: 'tenant-123',
  program: 'FNMA',
  enableMonitoring: true
});

const result = await pipeline.processDocument(
  'doc-001',
  '/path/to/loan.pdf',
  'pdf',
  {
    loanUrn: 'urn:loan:LN-2025-001',
    escrowInstructions: [
      {
        type: 'payment_schedule',
        priority: 1,
        rule: 'monthly_payment',
        value: { frequency: 'monthly', day: 1 }
      }
    ],
    investorDirectives: [
      {
        investorId: 'FNMA',
        type: 'rate_adjustment',
        priority: 1,
        requirement: 'max_rate_7_percent',
        value: 7.0,
        compliance: 'mandatory'
      }
    ]
  }
);
```

### Lineage Verification
```typescript
// Get complete explanation for extracted field
const explanation = await pipeline.getFieldLineage(lineageId);
console.log(explanation);
// Output: "Field 'loan_amount' has value '$250,000' with 95% confidence.
//          Source: ai_extraction (v2025.09.01) using prompt v1.2
//          Extracted from document doc-001, page 1
//          Source text: 'Loan Amount: $250,000.00'
//          Data age: 0.1 hours"
```

### Authority Conflict Resolution
```typescript
// Resolve conflicts between multiple sources
const values = [
  {
    value: 250000,
    source: { type: 'document_parse', confidence: 0.9 },
    fieldName: 'loan_amount'
  },
  {
    value: 260000,
    source: { type: 'investor_directive', confidence: 1.0 },
    fieldName: 'loan_amount'
  }
];

const resolution = await pipeline.resolveFieldConflicts('loan_amount', values);
// Result: investor_directive wins (priority 1000 > 600)
```

## 🔒 Security & Compliance

### Phase 10 Integration
- All pipeline operations logged to immutable audit
- Hash-chain verification for tamper detection
- Row Level Security for multi-tenant isolation
- Envelope encryption for sensitive data

### Audit Requirements
- Complete lineage for every extracted value
- Authority decisions with justifications
- Processing timestamps and durations
- Error tracking and resolution

### Data Integrity
- SHA-256 hashes for all source text
- Tamper detection via hash verification
- Idempotent processing prevents duplicates
- Deterministic results ensure reproducibility

## 📚 Troubleshooting

See `runbooks/ai-pipeline-troubleshooting.md` for:
- Common issue diagnosis
- Step-by-step resolution procedures
- Emergency recovery protocols
- Compliance verification steps

## 🎯 Success Criteria Met

✅ **Investor-first processing** with mandatory directive compliance  
✅ **Escrow-led intake** with second-highest priority  
✅ **Multi-format support** for MISMO, CSV, JSON, and PDF  
✅ **Do-Not-Ping enforcement** with automated decision making  
✅ **Complete explainability** with full lineage tracking  
✅ **Deterministic processing** via Authority Matrix  
✅ **Self-healing architecture** with retries and DLQ  
✅ **Enterprise security** with Phase 10 integration  
✅ **Real-time monitoring** with Prometheus metrics  
✅ **Compliance readiness** with immutable audit trails  

The AI Servicing Pipeline is now **production-ready** for enterprise mortgage servicing operations! 🚀