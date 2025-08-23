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
