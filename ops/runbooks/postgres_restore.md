# PostgreSQL Restore Runbook

## Overview
This runbook covers restoration procedures for the LoanServe PostgreSQL database using AWS RDS Aurora point-in-time recovery (PITR) and logical dump restores.

## Prerequisites
- AWS CLI configured with appropriate permissions
- Access to backup S3 bucket: `loanserve-backups`
- RDS cluster identifier: `loanserve-prod-aurora`

## 1. Point-in-Time Recovery (PITR)

### When to Use
- Data corruption or accidental deletion within the last 35 days
- Need to restore to a specific timestamp
- Primary recovery method for production

### Procedure

1. **Identify restore time** (must be within retention window):
   ```bash
   # Check available restore window
   aws rds describe-db-clusters \
     --db-cluster-identifier loanserve-prod-aurora \
     --query 'DBClusters[0].EarliestRestorableTime'
   ```

2. **Create restored cluster**:
   ```bash
   RESTORE_TO="2025-10-01T03:10:00Z"  # Replace with desired timestamp
   
   aws rds restore-db-cluster-to-point-in-time \
     --db-cluster-identifier loanserve-prod-aurora-restored \
     --source-db-cluster-identifier loanserve-prod-aurora \
     --restore-to-time "$RESTORE_TO" \
     --use-latest-restorable-time false
   ```

3. **Create writer instance**:
   ```bash
   aws rds create-db-instance \
     --db-instance-identifier loanserve-prod-aurora-restored-writer \
     --db-cluster-identifier loanserve-prod-aurora-restored \
     --db-instance-class db.r6g.large \
     --engine aurora-postgresql
   ```

4. **Wait for cluster to be available**:
   ```bash
   aws rds wait db-cluster-available \
     --db-cluster-identifier loanserve-prod-aurora-restored
   ```

5. **Test connectivity and validate data**:
   ```bash
   # Get endpoint
   ENDPOINT=$(aws rds describe-db-clusters \
     --db-cluster-identifier loanserve-prod-aurora-restored \
     --query 'DBClusters[0].Endpoint' --output text)
   
   # Test connection
   PGPASSWORD="$DB_PASS" psql -h "$ENDPOINT" -U loanserve -d loanserve -c "SELECT COUNT(*) FROM loans;"
   ```

## 2. Logical Dump Restore

### When to Use
- Restore to development/DR environment
- Point-in-time recovery not available
- Cross-region restore
- Selective table restore

### Procedure

1. **Find available backups**:
   ```bash
   aws s3 ls s3://loanserve-backups/prod/pg/ | tail -10
   ```

2. **Download and verify backup**:
   ```bash
   BACKUP_DATE="2025-10-01"  # Replace with desired date
   
   # Download backup
   aws s3 cp "s3://loanserve-backups/prod/pg/${BACKUP_DATE}.sql.gz" \
     "/tmp/restore.sql.gz"
   
   # Download and verify manifest
   aws s3 cp "s3://loanserve-backups/prod/pg/${BACKUP_DATE}.manifest.json" \
     "/tmp/manifest.json"
   
   EXPECTED_SHA=$(jq -r '.sha256' /tmp/manifest.json)
   ACTUAL_SHA=$(sha256sum /tmp/restore.sql.gz | awk '{print $1}')
   
   if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
     echo "ERROR: Checksum mismatch"
     exit 1
   fi
   ```

3. **Prepare target database**:
   ```bash
   # Drop and recreate database (WARNING: DATA LOSS)
   PGPASSWORD="$TARGET_DB_PASS" psql -h "$TARGET_DB_HOST" -U "$TARGET_DB_USER" -d postgres -c \
     "DROP DATABASE IF EXISTS $TARGET_DB_NAME; CREATE DATABASE $TARGET_DB_NAME;"
   ```

4. **Restore backup**:
   ```bash
   gunzip -c /tmp/restore.sql.gz | \
     PGPASSWORD="$TARGET_DB_PASS" psql -h "$TARGET_DB_HOST" -U "$TARGET_DB_USER" -d "$TARGET_DB_NAME" \
     --set ON_ERROR_STOP=on
   ```

5. **Validate restore**:
   ```bash
   PGPASSWORD="$TARGET_DB_PASS" psql -h "$TARGET_DB_HOST" -U "$TARGET_DB_USER" -d "$TARGET_DB_NAME" -c \
     "SELECT 
        COUNT(*) as total_loans,
        MAX(created_at) as latest_loan,
        COUNT(DISTINCT tenant_id) as tenant_count
      FROM loans;"
   ```

## 3. Emergency Recovery Checklist

### Immediate Actions (< 5 minutes)
- [ ] Assess scope of data loss
- [ ] Determine last known good timestamp
- [ ] Verify backup availability
- [ ] Notify stakeholders

### Recovery Execution (< 30 minutes)
- [ ] Initiate PITR or logical restore
- [ ] Monitor restore progress
- [ ] Validate critical data integrity
- [ ] Update DNS/connection strings if needed

### Post-Recovery
- [ ] Full application smoke test
- [ ] Verify all services are operational
- [ ] Document incident and lessons learned
- [ ] Update monitoring/alerting if needed

## 4. Troubleshooting

### Common Issues

**PITR fails with "invalid restore time"**
- Check available restore window
- Ensure timestamp is in UTC format
- Verify timestamp is within retention period

**Logical restore fails with permission errors**
- Ensure target user has CREATE privileges
- Check database connection parameters
- Verify target database exists

**Slow restore performance**
- Increase instance size temporarily
- Use parallel restore options
- Consider partial restore for specific tables

### Recovery Time Objectives (RTO)
- **PITR**: 15-45 minutes depending on cluster size
- **Logical restore**: 30-120 minutes depending on data volume
- **Cross-region restore**: 60-180 minutes

### Recovery Point Objectives (RPO)
- **PITR**: 5 minutes (continuous WAL archiving)
- **Logical backup**: 24 hours (nightly dumps)

## 5. Validation Queries

After any restore, run these queries to validate data integrity:

```sql
-- Check critical tables
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables 
WHERE tablename IN ('loans', 'users', 'payments', 'documents')
ORDER BY tablename;

-- Verify recent activity
SELECT 
  DATE(created_at) as date,
  COUNT(*) as transactions
FROM audit_logs 
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Check for data consistency
SELECT 
  COUNT(*) as orphaned_payments
FROM payments p
LEFT JOIN loans l ON p.loan_id = l.id
WHERE l.id IS NULL;
```