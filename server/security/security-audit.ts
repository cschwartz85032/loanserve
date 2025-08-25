/**
 * Security Audit and Secret Rotation Service
 * Implements security scanning, audit logging, and secret rotation procedures
 */

import * as crypto from 'crypto';
import { db } from '../db';

export interface SecurityAuditResult {
  timestamp: Date;
  category: string;
  status: 'pass' | 'fail' | 'warning';
  findings: SecurityFinding[];
  recommendations: string[];
  score: number; // 0-100
}

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location?: string;
  remediation: string;
}

export interface SecretRotationSchedule {
  secret: string;
  lastRotated: Date;
  nextRotation: Date;
  rotationInterval: number; // days
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Comprehensive Security Audit Service
 */
export class SecurityAuditService {
  /**
   * Run complete security audit
   */
  async runFullAudit(): Promise<SecurityAuditResult[]> {
    const results: SecurityAuditResult[] = [];
    
    // 1. TLS Configuration Audit
    results.push(await this.auditTLSConfiguration());
    
    // 2. Authentication & Authorization Audit
    results.push(await this.auditAuthentication());
    
    // 3. Database Security Audit
    results.push(await this.auditDatabaseSecurity());
    
    // 4. API Security Audit
    results.push(await this.auditAPISecurity());
    
    // 5. RabbitMQ Security Audit
    results.push(await this.auditRabbitMQSecurity());
    
    // 6. Secret Management Audit
    results.push(await this.auditSecretManagement());
    
    // 7. PII Protection Audit
    results.push(await this.auditPIIProtection());
    
    // 8. Webhook Security Audit
    results.push(await this.auditWebhookSecurity());
    
    return results;
  }

  /**
   * Audit TLS configuration
   */
  private async auditTLSConfiguration(): Promise<SecurityAuditResult> {
    const findings: SecurityFinding[] = [];
    const recommendations: string[] = [];
    
    // Check if TLS is enforced
    if (process.env.NODE_ENV === 'production' && !process.env.FORCE_TLS) {
      findings.push({
        severity: 'critical',
        type: 'TLS',
        description: 'TLS not enforced in production',
        remediation: 'Set FORCE_TLS=true in production environment',
      });
    }
    
    // Check TLS version
    const tlsVersion = process.env.TLS_MIN_VERSION || '';
    if (!tlsVersion || parseFloat(tlsVersion) < 1.2) {
      findings.push({
        severity: 'high',
        type: 'TLS',
        description: 'TLS version below 1.2',
        remediation: 'Set TLS_MIN_VERSION=1.3 for maximum security',
      });
    }
    
    // Check HSTS
    if (!process.env.HSTS_ENABLED) {
      findings.push({
        severity: 'medium',
        type: 'HSTS',
        description: 'HTTP Strict Transport Security not enabled',
        remediation: 'Enable HSTS with max-age=31536000',
      });
    }
    
    const score = findings.length === 0 ? 100 : 
                  findings.some(f => f.severity === 'critical') ? 0 :
                  findings.some(f => f.severity === 'high') ? 40 :
                  findings.some(f => f.severity === 'medium') ? 70 : 85;
    
    return {
      timestamp: new Date(),
      category: 'TLS Configuration',
      status: score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail',
      findings,
      recommendations: [
        'Use TLS 1.3 minimum',
        'Enable HSTS with preload',
        'Implement certificate pinning',
        'Use strong cipher suites only',
      ],
      score,
    };
  }

  /**
   * Audit authentication and authorization
   */
  private async auditAuthentication(): Promise<SecurityAuditResult> {
    const findings: SecurityFinding[] = [];
    
    // Check password policy
    const passwordPolicy = await db.query(
      `SELECT * FROM system_settings WHERE category = 'password_policy'`
    );
    
    if (!passwordPolicy || !passwordPolicy[0]?.value?.enabled) {
      findings.push({
        severity: 'high',
        type: 'Password Policy',
        description: 'Password policy not enforced',
        remediation: 'Enable strong password requirements',
      });
    }
    
    // Check session configuration
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      findings.push({
        severity: 'critical',
        type: 'Session',
        description: 'Weak or missing session secret',
        remediation: 'Use a strong session secret (minimum 32 characters)',
      });
    }
    
    // Check for MFA
    if (!process.env.MFA_ENABLED) {
      findings.push({
        severity: 'medium',
        type: 'MFA',
        description: 'Multi-factor authentication not enabled',
        remediation: 'Implement MFA for all admin accounts',
      });
    }
    
    const score = findings.length === 0 ? 100 :
                  findings.some(f => f.severity === 'critical') ? 20 :
                  findings.some(f => f.severity === 'high') ? 50 : 75;
    
    return {
      timestamp: new Date(),
      category: 'Authentication & Authorization',
      status: score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail',
      findings,
      recommendations: [
        'Implement MFA for all users',
        'Use OAuth2/SAML for SSO',
        'Implement account lockout policies',
        'Regular password rotation',
      ],
      score,
    };
  }

  /**
   * Audit database security
   */
  private async auditDatabaseSecurity(): Promise<SecurityAuditResult> {
    const findings: SecurityFinding[] = [];
    
    // Check if database connection uses SSL
    if (!process.env.DATABASE_URL?.includes('sslmode=require')) {
      findings.push({
        severity: 'high',
        type: 'Database',
        description: 'Database connection not using SSL',
        remediation: 'Add sslmode=require to DATABASE_URL',
      });
    }
    
    // Check PII encryption
    if (!process.env.PII_ENCRYPTION_KEY) {
      findings.push({
        severity: 'critical',
        type: 'Encryption',
        description: 'PII encryption key not configured',
        remediation: 'Set PII_ENCRYPTION_KEY for field-level encryption',
      });
    }
    
    // Check database access logs
    const auditLogs = await db.query(
      `SELECT COUNT(*) as count FROM auth_events WHERE created_at > NOW() - INTERVAL '1 day'`
    );
    
    if (!auditLogs || auditLogs[0]?.count === 0) {
      findings.push({
        severity: 'medium',
        type: 'Audit',
        description: 'No recent audit logs found',
        remediation: 'Ensure audit logging is enabled and working',
      });
    }
    
    const score = findings.length === 0 ? 100 :
                  findings.some(f => f.severity === 'critical') ? 10 :
                  findings.some(f => f.severity === 'high') ? 45 : 70;
    
    return {
      timestamp: new Date(),
      category: 'Database Security',
      status: score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail',
      findings,
      recommendations: [
        'Enable row-level security',
        'Implement database activity monitoring',
        'Regular backup encryption',
        'Use read replicas for reporting',
      ],
      score,
    };
  }

  /**
   * Audit API security
   */
  private async auditAPISecurity(): Promise<SecurityAuditResult> {
    const findings: SecurityFinding[] = [];
    
    // Check rate limiting
    if (!process.env.RATE_LIMIT_ENABLED) {
      findings.push({
        severity: 'high',
        type: 'Rate Limiting',
        description: 'API rate limiting not enabled',
        remediation: 'Enable rate limiting to prevent abuse',
      });
    }
    
    // Check CORS configuration
    if (process.env.CORS_ORIGIN === '*') {
      findings.push({
        severity: 'medium',
        type: 'CORS',
        description: 'CORS allows all origins',
        remediation: 'Restrict CORS to specific trusted origins',
      });
    }
    
    // Check API key management
    if (!process.env.API_KEY_ROTATION_DAYS) {
      findings.push({
        severity: 'medium',
        type: 'API Keys',
        description: 'API key rotation not configured',
        remediation: 'Implement automatic API key rotation',
      });
    }
    
    const score = findings.length === 0 ? 100 :
                  findings.some(f => f.severity === 'high') ? 50 : 75;
    
    return {
      timestamp: new Date(),
      category: 'API Security',
      status: score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail',
      findings,
      recommendations: [
        'Implement API versioning',
        'Use API gateways for centralized security',
        'Add request signing for critical endpoints',
        'Implement API usage analytics',
      ],
      score,
    };
  }

  /**
   * Audit RabbitMQ security
   */
  private async auditRabbitMQSecurity(): Promise<SecurityAuditResult> {
    const findings: SecurityFinding[] = [];
    
    // Check if using TLS for RabbitMQ
    if (!process.env.CLOUDAMQP_URL?.startsWith('amqps://')) {
      findings.push({
        severity: 'high',
        type: 'RabbitMQ',
        description: 'RabbitMQ not using TLS',
        remediation: 'Use amqps:// protocol for secure connections',
      });
    }
    
    // Check service isolation
    const servicesWithoutIsolation = [
      'payment-validator',
      'payment-processor',
      'investor-service',
    ].filter(service => !process.env[`${service.toUpperCase().replace(/-/g, '_')}_RABBITMQ_USER`]);
    
    if (servicesWithoutIsolation.length > 0) {
      findings.push({
        severity: 'high',
        type: 'RabbitMQ RBAC',
        description: `Services without RBAC isolation: ${servicesWithoutIsolation.join(', ')}`,
        remediation: 'Create separate RabbitMQ users for each service',
      });
    }
    
    const score = findings.length === 0 ? 100 :
                  findings.some(f => f.severity === 'high') ? 40 : 70;
    
    return {
      timestamp: new Date(),
      category: 'RabbitMQ Security',
      status: score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail',
      findings,
      recommendations: [
        'Use per-service credentials',
        'Enable RabbitMQ management audit logs',
        'Implement message encryption for sensitive data',
        'Regular permission audits',
      ],
      score,
    };
  }

  /**
   * Audit secret management
   */
  private async auditSecretManagement(): Promise<SecurityAuditResult> {
    const findings: SecurityFinding[] = [];
    
    // Check for hardcoded secrets
    const criticalSecrets = [
      'DATABASE_URL',
      'SESSION_SECRET',
      'PII_ENCRYPTION_KEY',
      'CLOUDAMQP_URL',
      'SIGNED_URL_SECRET',
    ];
    
    const missingSecrets = criticalSecrets.filter(secret => !process.env[secret]);
    if (missingSecrets.length > 0) {
      findings.push({
        severity: 'critical',
        type: 'Secrets',
        description: `Missing critical secrets: ${missingSecrets.join(', ')}`,
        remediation: 'Configure all required secrets in environment',
      });
    }
    
    // Check secret rotation
    const rotationSchedule = await this.getSecretRotationSchedule();
    const overdueSecrets = rotationSchedule.filter(
      s => s.nextRotation < new Date()
    );
    
    if (overdueSecrets.length > 0) {
      findings.push({
        severity: 'high',
        type: 'Secret Rotation',
        description: `${overdueSecrets.length} secrets overdue for rotation`,
        remediation: 'Rotate overdue secrets immediately',
      });
    }
    
    const score = findings.length === 0 ? 100 :
                  findings.some(f => f.severity === 'critical') ? 0 :
                  findings.some(f => f.severity === 'high') ? 40 : 70;
    
    return {
      timestamp: new Date(),
      category: 'Secret Management',
      status: score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail',
      findings,
      recommendations: [
        'Use a secret management service (Vault, AWS Secrets Manager)',
        'Implement automatic secret rotation',
        'Never commit secrets to version control',
        'Use different secrets per environment',
      ],
      score,
    };
  }

  /**
   * Audit PII protection
   */
  private async auditPIIProtection(): Promise<SecurityAuditResult> {
    const findings: SecurityFinding[] = [];
    
    // Check PII encryption
    if (!process.env.PII_ENCRYPTION_KEY) {
      findings.push({
        severity: 'critical',
        type: 'PII',
        description: 'PII encryption not configured',
        remediation: 'Implement field-level encryption for PII',
      });
    }
    
    // Check data retention policies
    if (!process.env.DATA_RETENTION_DAYS) {
      findings.push({
        severity: 'medium',
        type: 'Data Retention',
        description: 'No data retention policy configured',
        remediation: 'Implement automatic data purging policies',
      });
    }
    
    // Check PII access logs
    const piiAccessLogs = await db.query(
      `SELECT COUNT(*) as count FROM audit_logs 
       WHERE action LIKE '%PII%' AND created_at > NOW() - INTERVAL '7 days'`
    );
    
    if (!piiAccessLogs || piiAccessLogs[0]?.count === 0) {
      findings.push({
        severity: 'medium',
        type: 'PII Audit',
        description: 'No PII access logs found',
        remediation: 'Ensure PII access is being logged',
      });
    }
    
    const score = findings.length === 0 ? 100 :
                  findings.some(f => f.severity === 'critical') ? 0 :
                  findings.some(f => f.severity === 'high') ? 40 : 70;
    
    return {
      timestamp: new Date(),
      category: 'PII Protection',
      status: score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail',
      findings,
      recommendations: [
        'Implement data masking for non-privileged users',
        'Use tokenization for sensitive data',
        'Regular PII access audits',
        'Implement right-to-be-forgotten procedures',
      ],
      score,
    };
  }

  /**
   * Audit webhook security
   */
  private async auditWebhookSecurity(): Promise<SecurityAuditResult> {
    const findings: SecurityFinding[] = [];
    
    // Check webhook signature validation
    const webhookProviders = ['column', 'stripe', 'plaid'];
    const missingSecrets = webhookProviders.filter(
      provider => !process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`]
    );
    
    if (missingSecrets.length > 0) {
      findings.push({
        severity: 'high',
        type: 'Webhook',
        description: `Missing webhook secrets for: ${missingSecrets.join(', ')}`,
        remediation: 'Configure webhook secrets for all providers',
      });
    }
    
    // Check IP allowlisting
    if (!process.env.WEBHOOK_IP_ALLOWLIST_ENABLED) {
      findings.push({
        severity: 'medium',
        type: 'IP Allowlist',
        description: 'Webhook IP allowlisting not enabled',
        remediation: 'Enable IP allowlisting for webhook endpoints',
      });
    }
    
    const score = findings.length === 0 ? 100 :
                  findings.some(f => f.severity === 'high') ? 50 : 75;
    
    return {
      timestamp: new Date(),
      category: 'Webhook Security',
      status: score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail',
      findings,
      recommendations: [
        'Implement webhook replay protection',
        'Add webhook event deduplication',
        'Monitor webhook failures',
        'Implement webhook retry logic with backoff',
      ],
      score,
    };
  }

  /**
   * Get secret rotation schedule
   */
  private async getSecretRotationSchedule(): Promise<SecretRotationSchedule[]> {
    // In production, this would read from a database or configuration
    const schedule: SecretRotationSchedule[] = [
      {
        secret: 'DATABASE_URL',
        lastRotated: new Date('2024-11-01'),
        nextRotation: new Date('2025-02-01'),
        rotationInterval: 90,
        priority: 'critical',
      },
      {
        secret: 'SESSION_SECRET',
        lastRotated: new Date('2024-10-01'),
        nextRotation: new Date('2025-01-01'),
        rotationInterval: 90,
        priority: 'critical',
      },
      {
        secret: 'PII_ENCRYPTION_KEY',
        lastRotated: new Date('2024-09-01'),
        nextRotation: new Date('2025-03-01'),
        rotationInterval: 180,
        priority: 'critical',
      },
      {
        secret: 'API_KEYS',
        lastRotated: new Date('2024-12-01'),
        nextRotation: new Date('2025-01-01'),
        rotationInterval: 30,
        priority: 'high',
      },
      {
        secret: 'WEBHOOK_SECRETS',
        lastRotated: new Date('2024-11-15'),
        nextRotation: new Date('2025-02-15'),
        rotationInterval: 90,
        priority: 'medium',
      },
    ];
    
    return schedule;
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(): Promise<string> {
    const results = await this.runFullAudit();
    
    const overallScore = Math.round(
      results.reduce((sum, r) => sum + r.score, 0) / results.length
    );
    
    const criticalFindings = results.flatMap(r => 
      r.findings.filter(f => f.severity === 'critical')
    );
    
    const highFindings = results.flatMap(r =>
      r.findings.filter(f => f.severity === 'high')
    );
    
    let report = `# Security Audit Report\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += `## Overall Security Score: ${overallScore}/100\n\n`;
    
    if (criticalFindings.length > 0) {
      report += `## ⚠️ CRITICAL FINDINGS (${criticalFindings.length})\n`;
      criticalFindings.forEach(f => {
        report += `- ${f.description}\n`;
        report += `  Remediation: ${f.remediation}\n`;
      });
      report += '\n';
    }
    
    if (highFindings.length > 0) {
      report += `## ⚠️ HIGH PRIORITY FINDINGS (${highFindings.length})\n`;
      highFindings.forEach(f => {
        report += `- ${f.description}\n`;
        report += `  Remediation: ${f.remediation}\n`;
      });
      report += '\n';
    }
    
    report += '## Category Scores\n';
    results.forEach(r => {
      const emoji = r.status === 'pass' ? '✅' : 
                   r.status === 'warning' ? '⚠️' : '❌';
      report += `${emoji} ${r.category}: ${r.score}/100\n`;
    });
    
    report += '\n## Recommendations\n';
    const allRecommendations = new Set(
      results.flatMap(r => r.recommendations)
    );
    
    allRecommendations.forEach(rec => {
      report += `- ${rec}\n`;
    });
    
    return report;
  }
}

/**
 * Secret Rotation Service
 */
export class SecretRotationService {
  /**
   * Rotate a specific secret
   */
  async rotateSecret(secretName: string): Promise<{
    success: boolean;
    newValue?: string;
    error?: string;
  }> {
    try {
      // Generate new secret value
      const newValue = this.generateSecretValue(secretName);
      
      // Update in environment (in production, update in secret manager)
      process.env[secretName] = newValue;
      
      // Log rotation event
      await this.logRotation(secretName);
      
      // Trigger dependent service restarts if needed
      await this.notifyDependentServices(secretName);
      
      return { success: true, newValue };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate new secret value based on type
   */
  private generateSecretValue(secretName: string): string {
    if (secretName.includes('KEY') || secretName.includes('SECRET')) {
      // Generate cryptographic key
      return crypto.randomBytes(32).toString('base64');
    } else if (secretName.includes('PASSWORD')) {
      // Generate strong password
      return this.generateStrongPassword();
    } else if (secretName.includes('TOKEN')) {
      // Generate token
      return crypto.randomBytes(24).toString('hex');
    } else {
      // Default to random string
      return crypto.randomBytes(32).toString('base64');
    }
  }

  /**
   * Generate strong password
   */
  private generateStrongPassword(): string {
    const length = 32;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    return password;
  }

  /**
   * Log secret rotation event
   */
  private async logRotation(secretName: string): Promise<void> {
    await db.query(
      `INSERT INTO secret_rotation_log (secret_name, rotated_at, rotated_by)
       VALUES ($1, NOW(), 'system')`,
      [secretName]
    );
  }

  /**
   * Notify dependent services of secret rotation
   */
  private async notifyDependentServices(secretName: string): Promise<void> {
    // Map secrets to dependent services
    const dependencies: Record<string, string[]> = {
      'DATABASE_URL': ['all'],
      'SESSION_SECRET': ['api'],
      'PII_ENCRYPTION_KEY': ['api', 'workers'],
      'CLOUDAMQP_URL': ['workers'],
      'SIGNED_URL_SECRET': ['api'],
    };
    
    const services = dependencies[secretName] || [];
    
    for (const service of services) {
      console.log(`[SecretRotation] Notifying ${service} of ${secretName} rotation`);
      // In production, trigger service restart or reload
    }
  }

  /**
   * Batch rotate multiple secrets
   */
  async batchRotate(secrets: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const secret of secrets) {
      const result = await this.rotateSecret(secret);
      results.set(secret, result.success);
    }
    
    return results;
  }
}

// Export singleton instances
export const securityAuditService = new SecurityAuditService();
export const secretRotationService = new SecretRotationService();