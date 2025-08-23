#!/bin/bash

# LoanServe Pro Comprehensive Backup Script
# Creates a timestamped backup of code, database schema, and data

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backups/backup_${TIMESTAMP}"

echo "🔵 Starting comprehensive backup at ${TIMESTAMP}"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# 1. Export code (excluding node_modules and other large directories)
echo "📁 Backing up code..."
zip -r "${BACKUP_DIR}/code_backup.zip" . \
  -x "node_modules/*" \
  -x ".git/*" \
  -x "backups/*" \
  -x "*.log" \
  -x ".cache/*" \
  -x "dist/*" \
  -x "build/*" \
  -x ".replit" \
  -x ".config/*"

# 2. Export database schema
echo "🗄️ Backing up database schema..."
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges > "${BACKUP_DIR}/schema.sql"

# 3. Export database data
echo "💾 Backing up database data..."
pg_dump "$DATABASE_URL" --data-only --no-owner --no-privileges > "${BACKUP_DIR}/data.sql"

# 4. Export full database backup (schema + data)
echo "🔒 Creating full database backup..."
pg_dump "$DATABASE_URL" --no-owner --no-privileges > "${BACKUP_DIR}/full_database.sql"

# 5. Document environment variables (names only, not values)
echo "🔐 Documenting environment variables..."
printenv | cut -d'=' -f1 | sort > "${BACKUP_DIR}/env_vars_list.txt"

# 6. Save current package versions
echo "📦 Backing up package information..."
cp package.json "${BACKUP_DIR}/package.json"
cp package-lock.json "${BACKUP_DIR}/package-lock.json" 2>/dev/null || true
npm list --depth=0 > "${BACKUP_DIR}/npm_packages.txt" 2>/dev/null || true

# 7. Create backup manifest
echo "📝 Creating backup manifest..."
cat > "${BACKUP_DIR}/manifest.json" << EOF
{
  "timestamp": "${TIMESTAMP}",
  "date": "$(date)",
  "node_version": "$(node -v)",
  "npm_version": "$(npm -v)",
  "database_url": "PostgreSQL (Neon)",
  "files": {
    "code": "code_backup.zip",
    "schema": "schema.sql",
    "data": "data.sql",
    "full_db": "full_database.sql",
    "env_vars": "env_vars_list.txt",
    "packages": "package.json"
  },
  "notes": "Pre-messaging implementation backup"
}
EOF

# 8. Create restore instructions
cat > "${BACKUP_DIR}/RESTORE_INSTRUCTIONS.md" << 'EOF'
# Restore Instructions

## To restore code:
```bash
unzip code_backup.zip
```

## To restore database schema only:
```bash
psql $DATABASE_URL < schema.sql
```

## To restore database data only:
```bash
psql $DATABASE_URL < data.sql
```

## To restore full database (schema + data):
```bash
psql $DATABASE_URL < full_database.sql
```

## To restore packages:
```bash
npm install
```

## Environment Variables:
Check env_vars_list.txt for required environment variables.
Secrets must be manually restored through Replit Secrets interface.

## Important Notes:
- Always backup current state before restoring
- Database restore will overwrite existing data
- Test restore in development environment first
EOF

# Calculate backup size
BACKUP_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)

echo "✅ Backup completed successfully!"
echo "📍 Location: ${BACKUP_DIR}"
echo "📊 Size: ${BACKUP_SIZE}"
echo ""
echo "📋 Backup includes:"
echo "  - All source code (excluding node_modules)"
echo "  - Database schema"
echo "  - Database data"  
echo "  - Package dependencies list"
echo "  - Environment variable names"
echo "  - Restore instructions"
echo ""
echo "💡 Tip: Download the backup folder to your local machine for safekeeping"
echo "💡 Tip: Replit also maintains automatic checkpoints you can restore from"