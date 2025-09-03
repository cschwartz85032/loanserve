#!/usr/bin/env bash
set -euo pipefail

# Nightly PostgreSQL logical dump with encryption and manifest
DAY=$(date -u +%F)
TMP=/tmp/pgdump-${DAY}.sql.gz

echo "[Backup] Starting PostgreSQL logical dump for ${DAY}"

# Perform parallel dump and compress
PGPASSWORD="${DB_PASS:?}" pg_dump \
  -h "${DB_HOST:?}" -U "${DB_USER:?}" -d "${DB_NAME:?}" \
  -j "${BACKUP_PG_PARALLEL_JOBS:-4}" -F p --no-owner --no-privileges \
  | gzip -c > "$TMP"

# Calculate checksum
SHA=$(sha256sum "$TMP" | awk '{print $1}')
SIZE=$(stat -c%s "$TMP")

echo "[Backup] Dump complete. Size: ${SIZE} bytes, SHA256: ${SHA}"

# Upload to S3 with KMS encryption
aws s3 cp "$TMP" "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/pg/${DAY}.sql.gz" \
  --sse aws:kms --sse-kms-key-id "${BACKUP_ENCRYPTION_KMS_ARN:?}"

# Create manifest file
MANIFEST=$(printf '{"date":"%s","sha256":"%s","size":%d,"type":"logical_dump","retention_days":90}' \
  "$DAY" "$SHA" "$SIZE")

aws s3 cp <(echo "$MANIFEST") \
  "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/pg/${DAY}.manifest.json" \
  --sse aws:kms --sse-kms-key-id "${BACKUP_ENCRYPTION_KMS_ARN:?}"

# Cleanup
rm -f "$TMP"

echo "[Backup] PostgreSQL backup completed successfully"