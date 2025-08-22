# Production Deployment Guide for LoanServe Pro

## Critical Environment Variables

The following environment variables MUST be set in production:

### Required Variables
```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Session Management (CRITICAL - must be consistent across deployments)
SESSION_SECRET=<generate-a-secure-random-64-character-string>
NODE_ENV=production

# Application
PORT=5000
```

### Optional Variables
```bash
# Cookie domain (if using subdomains)
COOKIE_DOMAIN=.yourdomain.com

# API Keys (if features are used)
SENDGRID_API_KEY=your-sendgrid-api-key
OPENAI_API_KEY=your-openai-api-key
XAI_API_KEY=your-xai-api-key
COLUMN_API_KEY=your-column-api-key

# Object Storage (if configured)
DEFAULT_OBJECT_STORAGE_BUCKET_ID=
PUBLIC_OBJECT_SEARCH_PATHS=
PRIVATE_OBJECT_DIR=
```

## Session Configuration Checklist

### 1. Generate Secure SESSION_SECRET
```bash
# Generate a secure session secret
openssl rand -base64 64
```
**IMPORTANT**: This value must be:
- At least 32 characters long
- Kept secret and never committed to version control
- Consistent across all instances/deployments
- Different from development

### 2. Verify HTTPS Setup
- Ensure your deployment platform provides HTTPS
- Session cookies will only work over HTTPS in production
- The application automatically sets `secure: true` and `sameSite: 'none'` for cookies when NODE_ENV=production
- This configuration is required for cross-site cookie delivery in modern browsers

### 3. Database Schema Synchronization
Before deployment, ensure database schema is synchronized:
```bash
# Run migrations in production
npm run migrate:production
```

### 4. Verify Session Table Structure
The sessions table should have these columns:
- `sid` (text, primary key)
- `sess` (json)
- `expire` (timestamp)
- `user_id` (integer, nullable)
- `ip` (text, nullable)
- `user_agent` (text, nullable)
- `created_at` (timestamp)
- `last_seen_at` (timestamp)
- `revoked_at` (timestamp, nullable)

### 5. Check User Table Structure
Ensure the users table has:
- `id` (integer, primary key)
- Password fields compatible with Argon2 format
- RBAC-related fields properly configured

## Troubleshooting Login Issues

### Problem: Users can't stay logged in after deployment

1. **Check SESSION_SECRET**
   - Must be set in environment variables
   - Must be consistent across all instances
   - Must not change between deployments

2. **Verify Cookie Settings**
   ```javascript
   // Check browser DevTools > Application > Cookies
   // Should see 'connect.sid' cookie with:
   - Secure: true (in production)
   - HttpOnly: true
   - SameSite: Lax
   ```

3. **Check Database Connection**
   - Verify DATABASE_URL is correct
   - Ensure sessions table exists
   - Check for connection pool issues

4. **Review Server Logs**
   Look for these error messages:
   - "SESSION_SECRET must be set in production"
   - "Failed to deserialize user"
   - "Session get/set error"

### Problem: "Invalid credentials" even with correct password

1. **Check Password Format**
   - System supports both Argon2 and legacy scrypt formats
   - New passwords use Argon2id

2. **Verify User Exists**
   ```sql
   SELECT id, username, email FROM users WHERE email = 'user@example.com';
   ```

3. **Check Account Lock Status**
   ```sql
   SELECT locked_until, failed_login_attempts FROM users WHERE id = ?;
   ```

### Problem: Sessions expire immediately

1. **Check System Time**
   - Ensure server time is correct
   - Database and application server should be in sync

2. **Verify Session TTL**
   - Default is 24 hours
   - Check `expire` column in sessions table

## Deployment Steps

1. **Set Environment Variables**
   - Configure all required variables in your deployment platform
   - Use secrets management for sensitive values

2. **Deploy Application**
   ```bash
   npm run build
   npm start
   ```

3. **Run Database Migrations**
   - Migrations run automatically on startup
   - Check logs for migration errors

4. **Verify Deployment**
   - Test login functionality
   - Check that session cookie is set
   - Verify user stays logged in across page refreshes

5. **Monitor Logs**
   - Watch for authentication errors
   - Monitor session creation/destruction
   - Track failed login attempts

## Security Best Practices

1. **Regular Secret Rotation**
   - Rotate SESSION_SECRET periodically (will log out all users)
   - Update API keys regularly

2. **Enable Account Lockout**
   - Configure failed login attempt thresholds
   - Set appropriate lockout durations

3. **IP Allowlisting (Optional)**
   - Configure trusted IP ranges for admin users
   - Monitor unusual login patterns

4. **Audit Logging**
   - Review auth_events table regularly
   - Monitor for suspicious activity
   - Set up alerts for multiple failed login attempts

## Support

If login issues persist after following this guide:
1. Check server error logs for specific error messages
2. Verify all environment variables are set correctly
3. Ensure database schema matches application expectations
4. Test with a clean browser session (clear cookies/cache)