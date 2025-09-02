# AI Servicing Pipeline Troubleshooting Runbook

## Overview

This runbook provides step-by-step procedures for diagnosing and resolving issues in the AI Servicing Pipeline.

## Non-Negotiables Verification

Before troubleshooting, verify these core principles are maintained:

### ✅ Investor-First Priority
- All investor directives should have highest authority priority (1000)
- Escrow instructions should have second priority (900)
- Check Authority Matrix decisions for correct hierarchy

### ✅ Do-Not-Ping Enforcement
- No manual intervention requests for data available in documents
- Automated extraction should handle standard document types
- Human-in-the-loop only for confidence below threshold

### ✅ Explainable Construction
- Every extracted value must have complete lineage
- Document references with text hashes required
- Confidence scores and source attribution mandatory

### ✅ Deterministic Before AI
- Authority Matrix resolves all conflicts deterministically
- Same input always produces same output
- No random or time-dependent decisions

### ✅ Self-Healing Operations
- Workers retry failed operations automatically
- DLQ captures permanently failed items
- Idempotency prevents duplicate processing

### ✅ Security Compliance
- All operations logged to immutable audit
- RLS enforced for tenant isolation
- Encryption for sensitive data

## Common Issues and Solutions

### 1. Document Processing Failures

#### Symptoms
- Documents stuck in processing queue
- High error rates in document intake worker
- Extraction confidence consistently low

#### Diagnosis Steps
```bash
# Check worker health
curl http://localhost:5000/api/phase10/health

# Check queue depths
curl http://localhost:5000/metrics | grep ai_pipeline_queue_depth

# Check recent audit events
curl "http://localhost:5000/api/phase10/audit/events?eventType=AI_PIPELINE.WORKER.WORK_ERROR&limit=10"
```

#### Resolution
1. **Check document format support**
   - Verify file type is supported (PDF, CSV, JSON, MISMO)
   - Validate file is not corrupted
   - Check file size limits

2. **Verify AWS Textract access**
   - Check AWS credentials and permissions
   - Verify region configuration
   - Test Textract service availability

3. **Review extraction thresholds**
   - Check `CONF_ACCEPT` and `CONF_HITL` settings
   - Adjust thresholds if too restrictive
   - Review extractor version compatibility

### 2. Authority Matrix Conflicts

#### Symptoms
- Unexpected field values chosen
- Conflicts not resolved deterministically
- Manual overrides not respected

#### Diagnosis Steps
```bash
# Check authority decisions
curl "http://localhost:5000/api/phase10/audit/events?eventType=AI_PIPELINE.AUTHORITY_DECISION&limit=10"

# Check field-specific rules
# Review Authority Matrix configuration
```

#### Resolution
1. **Verify authority hierarchy**
   - Check `AUTHORITY_HIERARCHY` constants
   - Validate field-specific rules
   - Ensure investor directives have priority 1000

2. **Review conflict sources**
   - Check source types and priorities
   - Verify timestamp handling
   - Validate confidence scoring

3. **Test deterministic behavior**
   - Process same document multiple times
   - Verify consistent results
   - Check for time-dependent logic

### 3. Lineage Tracking Issues

#### Symptoms
- Missing lineage records
- Hash verification failures
- Incomplete audit trails

#### Diagnosis Steps
```bash
# Check lineage statistics
# Review lineage tracker health
# Verify document reference integrity
```

#### Resolution
1. **Verify hash generation**
   - Check text extraction accuracy
   - Validate hash algorithm consistency
   - Review document reference storage

2. **Check lineage chains**
   - Verify parent-child relationships
   - Check for circular references
   - Validate transformation records

3. **Audit lineage integrity**
   - Run verification checks
   - Compare expected vs actual hashes
   - Review transformation logs

### 4. Performance Issues

#### Symptoms
- Slow document processing
- High queue depths
- Worker timeouts

#### Diagnosis Steps
```bash
# Check processing times
curl http://localhost:5000/metrics | grep ai_pipeline_processing_duration

# Monitor system resources
top
free -h
df -h

# Check database performance
# Monitor connection pools
```

#### Resolution
1. **Scale workers**
   - Increase worker pool size
   - Add more worker instances
   - Optimize worker configuration

2. **Optimize database queries**
   - Check query performance
   - Add indexes if needed
   - Optimize audit log queries

3. **Review timeout settings**
   - Adjust `OCR_TIMEOUT_MS`
   - Increase worker timeout values
   - Optimize retry strategies

### 5. Validation Failures

#### Symptoms
- High validation error rates
- Incorrect business rule application
- Auto-correction not working

#### Diagnosis Steps
```bash
# Check validation metrics
curl http://localhost:5000/metrics | grep ai_pipeline_validation_errors

# Review validation rules
# Check program-specific configurations
```

#### Resolution
1. **Review validation rules**
   - Check rule definitions
   - Verify program-specific rules
   - Update business logic if needed

2. **Check data quality**
   - Review source document quality
   - Validate extraction accuracy
   - Check field normalization

3. **Update thresholds**
   - Adjust conforming limits
   - Update market range validations
   - Review cross-field validations

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Processing Metrics**
   - `ai_pipeline_documents_processed_total`
   - `ai_pipeline_processing_duration_seconds`
   - `ai_pipeline_queue_depth`

2. **Quality Metrics**
   - `ai_pipeline_extraction_accuracy`
   - `ai_pipeline_confidence_distribution`
   - `ai_pipeline_validation_errors_total`

3. **System Health**
   - `ai_pipeline_worker_health`
   - `ai_pipeline_authority_decisions_total`

### Alert Thresholds

- **Critical**: Worker health < 80%, Processing time > 5 minutes
- **Warning**: Queue depth > 1000, Confidence < 60%
- **Info**: Authority conflicts, Auto-corrections applied

## Recovery Procedures

### 1. Worker Recovery
```bash
# Restart failed workers
systemctl restart ai-pipeline-worker

# Clear stuck queue items
# Move items to retry queue

# Verify worker health
curl http://localhost:5000/api/phase10/health
```

### 2. Data Recovery
```bash
# Identify failed documents
# Reprocess from source
# Verify lineage integrity

# Check audit logs for data changes
curl "http://localhost:5000/api/phase10/audit/events?resourceUrn=urn:document:${DOC_ID}"
```

### 3. Database Recovery
```bash
# Check RLS policies
# Verify tenant isolation
# Review audit log integrity

# Restore from backup if needed
# Verify encryption keys
```

## Escalation Procedures

### Level 1: Automated Recovery
- Self-healing workers attempt recovery
- Retry mechanisms activate
- DLQ captures failed items

### Level 2: System Administrator
- Manual worker restart
- Configuration adjustments
- Threshold modifications

### Level 3: Development Team
- Code fixes required
- New validation rules needed
- Architecture changes

### Level 4: Business Stakeholders
- Business rule changes
- Authority hierarchy updates
- Compliance requirements

## Emergency Contacts

- **System Administrator**: [Contact Info]
- **Development Team Lead**: [Contact Info]
- **Database Administrator**: [Contact Info]
- **Security Team**: [Contact Info]

## Compliance and Audit

### Required Documentation
- All troubleshooting actions must be logged
- Audit trail must remain intact
- Data lineage must be preserved

### Audit Trail Verification
```bash
# Verify audit log integrity
curl "http://localhost:5000/api/phase10/audit/verify/urn:pipeline:troubleshooting"

# Check immutable audit chain
# Verify hash chain integrity
```

## Testing and Validation

### After Resolution
1. Process test documents
2. Verify metrics return to normal
3. Check audit logs for completeness
4. Validate lineage tracking
5. Confirm authority matrix decisions

### Regression Testing
1. Test with known good documents
2. Verify deterministic behavior
3. Check all non-negotiables
4. Validate security controls