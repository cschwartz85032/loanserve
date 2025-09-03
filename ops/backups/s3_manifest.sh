#!/usr/bin/env bash
set -euo pipefail

# S3 artifact inventory for audit trail
DAY=$(date -u +%F)
TMP=/tmp/s3-artifacts-${DAY}.json

echo "[Backup] Creating S3 artifact manifest for ${DAY}"

# List all artifacts in S3 bucket
aws s3 ls "s3://${ARTIFACTS_BUCKET:?}/${ARTIFACTS_PREFIX:?}/" --recursive \
  | awk '{print $1" "$2" "$3" "$4}' \
  | jq -R -s '
    split("\n") | 
    map(select(length>0)) | 
    map(split(" ")) | 
    map({"date": .[0], "time": .[1], "size": (.[2]|tonumber), "key": .[3]})
  ' > "$TMP"

# Validate JSON
if ! jq empty "$TMP" 2>/dev/null; then
  echo "[Backup] ERROR: Invalid JSON in S3 manifest"
  exit 1
fi

# Calculate checksum
SHA=$(sha256sum "$TMP" | awk '{print $1}')
SIZE=$(stat -c%s "$TMP")
COUNT=$(jq length "$TMP")

echo "[Backup] S3 manifest created. Files: ${COUNT}, Size: ${SIZE} bytes, SHA256: ${SHA}"

# Upload manifest to backup bucket
aws s3 cp "$TMP" "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/s3-artifacts/${DAY}.json" \
  --sse aws:kms --sse-kms-key-id "${BACKUP_ENCRYPTION_KMS_ARN:?}"

# Create metadata manifest
METADATA=$(printf '{"date":"%s","sha256":"%s","size":%d,"file_count":%d,"type":"s3_manifest","retention_days":2555}' \
  "$DAY" "$SHA" "$SIZE" "$COUNT")

aws s3 cp <(echo "$METADATA") \
  "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/s3-artifacts/${DAY}.manifest.json" \
  --sse aws:kms --sse-kms-key-id "${BACKUP_ENCRYPTION_KMS_ARN:?}"

# Cleanup
rm -f "$TMP"

echo "[Backup] S3 artifact manifest completed successfully"