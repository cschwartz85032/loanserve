#!/usr/bin/env bash
set -euo pipefail

# RabbitMQ definitions backup
DAY=$(date -u +%F)
TMP=/tmp/rmq-defs-${DAY}.json

echo "[Backup] Starting RabbitMQ definitions export for ${DAY}"

# Export RabbitMQ definitions (exchanges, queues, bindings, etc.)
curl -s -u "${RMQ_USER:?}:${RMQ_PASS:?}" \
  "http://${RMQ_HOST:-rabbitmq}:15672/api/definitions" \
  -o "$TMP"

# Validate JSON
if ! jq empty "$TMP" 2>/dev/null; then
  echo "[Backup] ERROR: Invalid JSON in RabbitMQ definitions"
  exit 1
fi

# Calculate checksum
SHA=$(sha256sum "$TMP" | awk '{print $1}')
SIZE=$(stat -c%s "$TMP")

echo "[Backup] RabbitMQ definitions exported. Size: ${SIZE} bytes, SHA256: ${SHA}"

# Upload to S3 with encryption
aws s3 cp "$TMP" "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/rmq/${DAY}.json" \
  --sse aws:kms --sse-kms-key-id "${BACKUP_ENCRYPTION_KMS_ARN:?}"

# Create manifest
MANIFEST=$(printf '{"date":"%s","sha256":"%s","size":%d,"type":"rmq_definitions","retention_days":365}' \
  "$DAY" "$SHA" "$SIZE")

aws s3 cp <(echo "$MANIFEST") \
  "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/rmq/${DAY}.manifest.json" \
  --sse aws:kms --sse-kms-key-id "${BACKUP_ENCRYPTION_KMS_ARN:?}"

# Cleanup
rm -f "$TMP"

echo "[Backup] RabbitMQ backup completed successfully"