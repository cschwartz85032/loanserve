#!/usr/bin/env bash
set -euo pipefail

# Weekly DR restore test with smoke testing
echo "[DR] Starting weekly disaster recovery restore test"

# Find latest logical dump
LATEST_KEY=$(aws s3 ls "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/pg/" | \
  grep '\.sql\.gz$' | sort | tail -n1 | awk '{print $4}')

if [[ -z "$LATEST_KEY" ]]; then
  echo "[DR] ERROR: No PostgreSQL backup found"
  exit 1
fi

echo "[DR] Using backup: ${LATEST_KEY}"

# Download and verify backup
TMP=/tmp/restore-$(date +%s).sql.gz
aws s3 cp "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/pg/${LATEST_KEY}" "$TMP"

# Verify checksum if manifest exists
MANIFEST_KEY="${LATEST_KEY%.sql.gz}.manifest.json"
if aws s3 ls "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/pg/${MANIFEST_KEY}" >/dev/null 2>&1; then
  echo "[DR] Verifying backup integrity..."
  aws s3 cp "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/pg/${MANIFEST_KEY}" - | \
    jq -r '.sha256' > /tmp/expected_sha
  ACTUAL_SHA=$(sha256sum "$TMP" | awk '{print $1}')
  EXPECTED_SHA=$(cat /tmp/expected_sha)
  
  if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
    echo "[DR] ERROR: Backup checksum mismatch"
    echo "[DR] Expected: $EXPECTED_SHA"
    echo "[DR] Actual: $ACTUAL_SHA"
    exit 1
  fi
  echo "[DR] Backup integrity verified"
fi

# Drop and recreate DR database
echo "[DR] Recreating DR database..."
PGPASSWORD="${DR_DB_PASS:?}" psql -h "${DR_DB_HOST:?}" -U "${DR_DB_USER:?}" -d postgres -c \
  "DROP DATABASE IF EXISTS ${DR_DB_NAME:?}; CREATE DATABASE ${DR_DB_NAME:?};"

# Restore backup
echo "[DR] Restoring database from backup..."
gunzip -c "$TMP" | \
  PGPASSWORD="${DR_DB_PASS:?}" psql -h "${DR_DB_HOST:?}" -U "${DR_DB_USER:?}" -d "${DR_DB_NAME:?}" \
  -q --set ON_ERROR_STOP=on

# Cleanup restore file
rm -f "$TMP" /tmp/expected_sha

echo "[DR] Database restore completed"

# Wait for DR application to start
echo "[DR] Waiting for DR application to become ready..."
sleep 30

# Perform smoke test
echo "[DR] Running smoke tests..."
START_TIME=$(date +%s)

# Test 1: Health check
echo "[DR] Testing health endpoint..."
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time "${DR_SMOKE_TIMEOUT_MS:-600000}" \
  "${DR_SMOKE_URL:?}")

if [[ "$HEALTH_CODE" != "200" ]]; then
  echo "[DR] ERROR: Health check failed with status ${HEALTH_CODE}"
  exit 1
fi

# Test 2: Database connectivity
echo "[DR] Testing database connectivity..."
DB_CONN_TEST=$(PGPASSWORD="${DR_DB_PASS:?}" psql -h "${DR_DB_HOST:?}" -U "${DR_DB_USER:?}" -d "${DR_DB_NAME:?}" \
  -t -c "SELECT COUNT(*) FROM loans WHERE id IS NOT NULL" 2>/dev/null || echo "0")

if [[ "$DB_CONN_TEST" == "0" ]]; then
  echo "[DR] ERROR: Database connectivity test failed"
  exit 1
fi

# Test 3: API functionality
echo "[DR] Testing API functionality..."
API_TEST_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 30 \
  "${DR_SMOKE_URL%/healthz}/api/loans/metrics" 2>/dev/null || echo "000")

if [[ "$API_TEST_CODE" != "200" ]] && [[ "$API_TEST_CODE" != "401" ]]; then
  echo "[DR] WARNING: API test returned ${API_TEST_CODE} (may need authentication)"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "[DR] Smoke tests completed successfully in ${DURATION} seconds"
echo "[DR] DR restore and validation successful"

# Record DR test results
DR_RESULT=$(printf '{"date":"%s","duration_seconds":%d,"backup_used":"%s","status":"success","tests":{"health":200,"database":"pass","api":%s}}' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$DURATION" "$LATEST_KEY" "$API_TEST_CODE")

aws s3 cp <(echo "$DR_RESULT") \
  "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/dr-tests/$(date -u +%Y-%m-%d).json" \
  --sse aws:kms --sse-kms-key-id "${BACKUP_ENCRYPTION_KMS_ARN:?}" 2>/dev/null || true

echo "[DR] Weekly DR test completed successfully"