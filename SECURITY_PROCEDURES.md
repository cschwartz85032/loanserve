# Security & Compliance Procedures

## Overview
This document outlines security procedures for LoanServe Pro's enterprise mortgage servicing platform, ensuring compliance with financial regulations and data protection requirements.

## 1. TLS Configuration

### Requirements
- **Minimum TLS Version**: 1.3
- **Cipher Suites**: TLS_AES_256_GCM_SHA384, TLS_AES_128_GCM_SHA256, TLS_CHACHA20_POLY1305_SHA256
- **HSTS**: Enabled with max-age=31536000

### Implementation
```bash
# Environment Variables
FORCE_TLS=true
TLS_MIN_VERSION=1.3
HSTS_ENABLED=true
HSTS_MAX_AGE=31536000
```

## 2. RabbitMQ RBAC Configuration

### Service Isolation
Each microservice has its own RabbitMQ user with least-privilege access:

| Service | Username | Permissions |
|---------|----------|-------------|
| Payment Validator | svc_payment_validator | Read: payments.validation, Write: validation.response |
| Payment Processor | svc_payment_processor | Read: payments.processing, Write: distribution |
| Investor Service | svc_investor | Read: investor.*, Write: calc.result |
| Document Service | svc_documents | Read: documents.request, Write: documents.result |
| Notification Service | svc_notifications | Read: notifications.*, Write: notifications.sent |
| Audit Service | svc_audit | Write-only: audit.events |

### Setup Commands
```bash
# Create service users in CloudAMQP
rabbitmqctl add_user svc_payment_validator <SECURE_PASSWORD>
rabbitmqctl set_user_tags svc_payment_validator monitoring
rabbitmqctl set_permissions -p "/" svc_payment_validator "" "payments\.validation\.response" "payments\.validation"

# Repeat for each service...
```

## 3. PII Field Encryption

### Encrypted Fields
- **Borrowers**: SSN, Date of Birth, Phone, Email, Bank Account
- **Lenders**: Tax ID, Phone, Email, Bank Account, Routing Number
- **Investors**: Tax ID, Phone, Email, Bank Account, Wire Routing
- **Properties**: Owner Name, Phone, Email
- **Payments**: Account Number, Routing Number, Wire Reference

### Encryption Setup
```bash
# Generate encryption keys
PII_ENCRYPTION_KEY=$(openssl rand -base64 32)
PII_ENCRYPTION_SALT=$(openssl rand -base64 32)
PII_HASH_SALT=$(openssl rand -base64 32)
PII_SEARCH_SALT=$(openssl rand -base64 32)
```

### Key Rotation Procedure
1. Generate new encryption key
2. Run key rotation script: `npm run security:rotate-pii-key`
3. Update environment variables
4. Restart all services
5. Verify encryption/decryption works
6. Destroy old key after 30 days

## 4. Signed URLs for Documents

### Configuration
- **Default Expiry**: 5 minutes
- **Maximum Expiry**: 1 hour
- **Download Limits by Role**:
  - Admin: Unlimited
  - Lender/Servicer: 10 downloads
  - Investor: 5 downloads
  - Borrower: 3 downloads

### URL Generation
```javascript
// Generate signed URL with IP restriction
const signedUrl = signedUrlService.generateSignedUrl(
  '/documents/loan-agreement.pdf',
  {
    expiresIn: 300, // 5 minutes
    ipRestriction: clientIp,
    userId: user.id,
    maxDownloads: 3
  }
);
```

## 5. Webhook Security

### IP Allowlisting

#### Column Banking IPs
```
54.241.31.99/32
54.241.31.102/32
54.241.25.90/32
54.241.25.91/32
54.241.34.8/32
54.241.34.9/32
```

### Signature Validation
All webhooks must be validated using HMAC signatures:

```javascript
// Column webhook validation
const signature = req.headers['x-column-signature'];
const isValid = validateColumnSignature(
  req.rawBody,
  signature,
  process.env.COLUMN_WEBHOOK_SECRET
);
```

## 6. Secret Rotation Schedule

### Critical Secrets (90-day rotation)
- DATABASE_URL
- SESSION_SECRET
- CLOUDAMQP_URL
- PII_ENCRYPTION_KEY
- SIGNED_URL_SECRET

### High Priority (30-day rotation)
- API Keys
- OAuth Client Secrets
- Webhook Secrets

### Rotation Procedure

#### 1. Pre-Rotation Checklist
- [ ] Schedule maintenance window
- [ ] Notify team members
- [ ] Backup current configuration
- [ ] Test rollback procedure

#### 2. Rotation Steps
1. Generate new secret value
2. Update staging environment first
3. Test all dependent services
4. Update production environment
5. Monitor for errors (30 minutes)
6. Update documentation

#### 3. Post-Rotation
- [ ] Verify all services operational
- [ ] Update secret rotation log
- [ ] Schedule next rotation
- [ ] Destroy old secrets after grace period (7 days)

### Automated Rotation Script
```bash
# Run monthly secret rotation
npm run security:rotate-secrets

# Rotate specific secret
npm run security:rotate-secret -- --name SESSION_SECRET
```

## 7. Security Audit Procedures

### Weekly Audits
- Review failed login attempts
- Check for unusual API activity
- Monitor webhook failures
- Review PII access logs

### Monthly Audits
- Run full security scan: `npm run security:audit`
- Review user permissions
- Check SSL certificate expiry
- Validate backup integrity

### Quarterly Audits
- Penetration testing
- Dependency vulnerability scan
- RBAC permission review
- Data retention compliance check

### Annual Audits
- Full security assessment
- Compliance certification renewal
- Disaster recovery drill
- Third-party security audit

## 8. Incident Response

### Severity Levels
- **P0 (Critical)**: Data breach, system compromise
- **P1 (High)**: Authentication bypass, PII exposure
- **P2 (Medium)**: Failed security controls, policy violations
- **P3 (Low)**: Minor vulnerabilities, configuration issues

### Response Steps
1. **Detect**: Alert triggered or issue discovered
2. **Contain**: Isolate affected systems
3. **Assess**: Determine scope and impact
4. **Remediate**: Fix vulnerability and patch systems
5. **Recover**: Restore normal operations
6. **Review**: Post-incident analysis and improvements

### Contact List
- Security Team Lead: [CONTACT]
- Database Administrator: [CONTACT]
- CloudAMQP Support: support@cloudamqp.com
- Neon Database Support: support@neon.tech

## 9. Compliance Checklist

### Daily
- [ ] Monitor security alerts
- [ ] Review authentication logs
- [ ] Check backup status

### Weekly
- [ ] Run vulnerability scans
- [ ] Review access logs
- [ ] Update security patches

### Monthly
- [ ] Rotate API keys
- [ ] Review user permissions
- [ ] Test backup restoration
- [ ] Update security documentation

### Quarterly
- [ ] Rotate all secrets
- [ ] Security training
- [ ] Penetration testing
- [ ] Compliance audit

## 10. Security Tools

### Monitoring Commands
```bash
# Run security audit
npm run security:audit

# Check PII encryption status
npm run security:check-pii

# Validate webhook configuration
npm run security:check-webhooks

# Test secret rotation
npm run security:test-rotation

# Generate security report
npm run security:report
```

### Environment Template
```env
# Security Configuration
NODE_ENV=production
FORCE_TLS=true
TLS_MIN_VERSION=1.3
HSTS_ENABLED=true

# Encryption
PII_ENCRYPTION_KEY=<32+ character key>
PII_ENCRYPTION_SALT=<32+ character salt>
PII_HASH_SALT=<32+ character salt>
PII_SEARCH_SALT=<32+ character salt>

# Session Security
SESSION_SECRET=<64+ character secret>
SESSION_TIMEOUT_MINUTES=30
SESSION_SECURE=true
SESSION_HTTPONLY=true
SESSION_SAMESITE=strict

# RabbitMQ RBAC
PAYMENT_VALIDATOR_RABBITMQ_USER=svc_payment_validator
PAYMENT_VALIDATOR_RABBITMQ_PASS=<secure_password>
# ... (repeat for each service)

# Webhook Security
COLUMN_WEBHOOK_SECRET=<webhook_secret>
WEBHOOK_IP_ALLOWLIST_ENABLED=true

# Signed URLs
SIGNED_URL_SECRET=<64+ character secret>
SIGNED_URL_DEFAULT_EXPIRY=300
SIGNED_URL_MAX_EXPIRY=3600

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Audit & Compliance
AUDIT_LOG_RETENTION_DAYS=2555
PII_ACCESS_LOG_ENABLED=true
SECURITY_AUDIT_SCHEDULE=0 0 * * 0
SECRET_ROTATION_DAYS=90
```

## Emergency Procedures

### Data Breach Response
1. Immediately isolate affected systems
2. Preserve evidence (logs, memory dumps)
3. Notify security team and legal counsel
4. Begin incident response procedure
5. Prepare breach notification (if required)

### Secret Compromise
1. Immediately rotate compromised secret
2. Audit all access using compromised secret
3. Reset all dependent service credentials
4. Review security logs for unauthorized access
5. Implement additional monitoring

### System Compromise
1. Isolate compromised system from network
2. Capture system state for forensics
3. Rebuild system from known-good backup
4. Apply all security patches
5. Conduct thorough security audit before reconnection

---

**Last Updated**: December 2024
**Review Schedule**: Quarterly
**Next Review**: March 2025