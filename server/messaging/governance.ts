/**
 * Governance Policy Enforcement
 * 
 * Ensures architectural principles are never violated.
 * Domain-critical features must never be disabled for infrastructure issues.
 */

import chalk from 'chalk';

export enum GovernanceViolation {
  DISABLED_BUSINESS_FEATURE = 'DISABLED_BUSINESS_FEATURE',
  MISSING_DLQ = 'MISSING_DLQ',
  SKIPPED_QUEUE = 'SKIPPED_QUEUE',
  NO_IDEMPOTENCY = 'NO_IDEMPOTENCY',
  NO_AUDIT_LOG = 'NO_AUDIT_LOG',
}

export interface GovernanceCheck {
  rule: string;
  violated: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
}

export class GovernanceEnforcer {
  private violations: GovernanceCheck[] = [];

  /**
   * Check if any business features are disabled
   */
  checkBusinessFeatures(config: any): void {
    // List of business features that must NEVER be disabled
    const criticalFeatures = [
      { key: 'escrow.enabled', name: 'Escrow Management' },
      { key: 'payments.enabled', name: 'Payment Processing' },
      { key: 'remittance.enabled', name: 'Investor Remittance' },
      { key: 'cashManagement.enabled', name: 'Cash Management' },
      { key: 'compliance.enabled', name: 'Compliance Checks' },
    ];

    for (const feature of criticalFeatures) {
      const path = feature.key.split('.');
      let value = config;
      
      for (const segment of path) {
        value = value?.[segment];
      }
      
      if (value === false) {
        this.violations.push({
          rule: 'NEVER_DISABLE_BUSINESS_FEATURES',
          violated: true,
          severity: 'critical',
          message: `${feature.name} is disabled! This violates architectural principles.`,
        });
        
        // Log emergency alert
        console.error(
          chalk.bgRed.white.bold(
            `\n🚨 ARCHITECTURE VIOLATION: ${feature.name} is disabled!\n`
          )
        );
        console.error(
          chalk.red(
            `   This is a CRITICAL violation. Business features must NEVER be disabled for infrastructure issues.\n`
          )
        );
      }
    }
  }

  /**
   * Check for missing DLQ protection
   */
  checkDLQProtection(queues: Set<string>): void {
    const requiredDLQs = [
      'q.escrow.dlq.v2',
      'dlq.payments',
      'dlq.general',
      'q.remit.dlq',
    ];

    for (const dlq of requiredDLQs) {
      if (!queues.has(dlq)) {
        this.violations.push({
          rule: 'DLQ_PROTECTION_REQUIRED',
          violated: true,
          severity: 'critical',
          message: `Missing critical DLQ: ${dlq}. System vulnerable to message loss!`,
        });
      }
    }
  }

  /**
   * Check for skipped queue declarations
   */
  checkSkippedQueues(skippedQueues: string[]): void {
    for (const queue of skippedQueues) {
      const severity = queue.includes('dlq') ? 'critical' : 'high';
      
      this.violations.push({
        rule: 'NO_SKIPPED_QUEUES',
        violated: true,
        severity,
        message: `Queue '${queue}' was skipped due to conflicts. Run migration tool!`,
      });
      
      if (severity === 'critical') {
        console.error(
          chalk.bgRed.white.bold(
            `\n🚨 CRITICAL: DLQ '${queue}' is not protected!\n`
          )
        );
      }
    }
  }

  /**
   * Check for idempotency on critical operations
   */
  checkIdempotency(operations: Map<string, any>): void {
    const criticalOps = [
      'payment.process',
      'payment.allocate',
      'escrow.disburse',
      'remittance.calculate',
      'investor.distribute',
    ];

    for (const op of criticalOps) {
      const config = operations.get(op);
      if (!config?.idempotent) {
        this.violations.push({
          rule: 'IDEMPOTENCY_REQUIRED',
          violated: true,
          severity: 'high',
          message: `Operation '${op}' lacks idempotency protection!`,
        });
      }
    }
  }

  /**
   * Enforce governance - throw if critical violations
   */
  enforce(): void {
    const criticalViolations = this.violations.filter(v => v.severity === 'critical');
    
    if (criticalViolations.length > 0) {
      console.error(chalk.bgRed.white.bold('\n🚫 GOVERNANCE VIOLATIONS DETECTED\n'));
      
      for (const violation of criticalViolations) {
        console.error(chalk.red(`• ${violation.message}`));
      }
      
      console.error(chalk.yellow('\n📋 Required Actions:'));
      console.error(chalk.yellow('1. Re-enable all disabled business features'));
      console.error(chalk.yellow('2. Run npm run migrate-queues to fix queue conflicts'));
      console.error(chalk.yellow('3. Ensure all DLQs are properly configured'));
      console.error(chalk.yellow('4. Add idempotency to critical operations\n'));
      
      // In production, this would prevent deployment
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Critical governance violations detected. Deployment blocked.');
      }
    }
    
    // Log warnings for non-critical violations
    const warnings = this.violations.filter(v => v.severity !== 'critical');
    if (warnings.length > 0) {
      console.warn(chalk.yellow('\n⚠️  Governance Warnings:'));
      for (const warning of warnings) {
        console.warn(chalk.yellow(`• ${warning.message}`));
      }
    }
  }

  /**
   * Generate governance report
   */
  generateReport(): any {
    return {
      timestamp: new Date().toISOString(),
      violations: this.violations,
      criticalCount: this.violations.filter(v => v.severity === 'critical').length,
      passed: this.violations.length === 0,
      rules: {
        'NEVER_DISABLE_BUSINESS_FEATURES': 'Business features must never be disabled for infrastructure issues',
        'DLQ_PROTECTION_REQUIRED': 'All queues must have DLQ protection',
        'NO_SKIPPED_QUEUES': 'No queues should be skipped during topology setup',
        'IDEMPOTENCY_REQUIRED': 'Critical operations must be idempotent',
        'AUDIT_LOG_REQUIRED': 'All operations must be audited',
      },
    };
  }
}

// Export singleton enforcer
export const governanceEnforcer = new GovernanceEnforcer();