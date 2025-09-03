#!/usr/bin/env bash
set -euo pipefail

# Vault Raft storage snapshot backup
DAY=$(date -u +%F)
TMP=/tmp/vault-${DAY}.snap

echo "[Backup] Starting Vault snapshot for ${DAY}"

# Create Vault snapshot
curl -s --header "X-Vault-Token: ${VAULT_TOKEN:?}" \
  --request PUT "${VAULT_ADDR:?}/v1/sys/storage/raft/snapshot" \
  --output "$TMP"

# Verify snapshot file
if [[ ! -s "$TMP" ]]; then
  echo "[Backup] ERROR: Vault snapshot is empty or failed"
  exit 1
fi

# Calculate checksum
SHA=$(sha256sum "$TMP" | awk '{print $1}')
SIZE=$(stat -c%s "$TMP")

echo "[Backup] Vault snapshot created. Size: ${SIZE} bytes, SHA256: ${SHA}"

# Upload to S3 with encryption
aws s3 cp "$TMP" "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/vault/${DAY}.snap" \
  --sse aws:kms --sse-kms-key-id "${BACKUP_ENCRYPTION_KMS_ARN:?}"

# Create manifest
MANIFEST=$(printf '{"date":"%s","sha256":"%s","size":%d,"type":"vault_snapshot","retention_days":365}' \
  "$DAY" "$SHA" "$SIZE")

aws s3 cp <(echo "$MANIFEST") \
  "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/vault/${DAY}.manifest.json" \
  --sse aws:kms --sse-kms-key-id "${BACKUP_ENCRYPTION_KMS_ARN:?}"

# Cleanup
rm -f "$TMP"

echo "[Backup] Vault backup completed successfully"