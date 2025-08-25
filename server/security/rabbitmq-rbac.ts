/**
 * RabbitMQ Role-Based Access Control (RBAC) Configuration
 * Implements per-service user isolation with least privilege principle
 */

export interface ServiceCredentials {
  username: string;
  password: string;
  vhost: string;
  permissions: ServicePermissions;
  tags: string[];
}

export interface ServicePermissions {
  configure: string;
  write: string;
  read: string;
}

/**
 * RBAC configuration for each service with least privilege access
 * Each service only has access to its required queues and exchanges
 */
export const RABBITMQ_RBAC_CONFIG = {
  // Payment Validation Service - Only reads from validation queue
  'payment-validator': {
    username: 'svc_payment_validator',
    vhost: '/',
    permissions: {
      configure: '',  // No configuration rights
      write: 'payments\\.validation\\.response',  // Can write responses
      read: 'payments\\.validation',  // Can only read validation queue
    },
    tags: ['monitoring'],
    exchanges: ['payments.topic'],
    queues: ['payments.validation'],
  },

  // Payment Processing Service - Processes validated payments
  'payment-processor': {
    username: 'svc_payment_processor',
    vhost: '/',
    permissions: {
      configure: '',
      write: 'payments\\.processing\\.complete|payments\\.distribution',
      read: 'payments\\.processing',
    },
    tags: ['monitoring'],
    exchanges: ['payments.topic'],
    queues: ['payments.processing', 'payments.distribution'],
  },

  // Investor Service - Handles investor calculations and distributions
  'investor-service': {
    username: 'svc_investor',
    vhost: '/',
    permissions: {
      configure: '',
      write: 'investor\\.calc\\.result|investor\\.distribution\\.complete',
      read: 'investor\\.(calc|clawback).*',
    },
    tags: ['monitoring'],
    exchanges: ['investor.direct'],
    queues: ['investor.calculations', 'investor.clawback'],
  },

  // Document Service - AI document analysis
  'document-service': {
    username: 'svc_documents',
    vhost: '/',
    permissions: {
      configure: '',
      write: 'documents\\.analysis\\.result',
      read: 'documents\\.analysis\\.request',
    },
    tags: ['monitoring'],
    exchanges: ['documents.direct'],
    queues: ['documents.analysis.request'],
  },

  // Notification Service - Email/SMS/Dashboard notifications
  'notification-service': {
    username: 'svc_notifications',
    vhost: '/',
    permissions: {
      configure: '',
      write: 'notifications\\.sent',
      read: 'notifications\\.(email|sms|dashboard)',
    },
    tags: ['monitoring'],
    exchanges: ['notifications.topic'],
    queues: ['notifications.email', 'notifications.sms', 'notifications.dashboard'],
  },

  // Audit Service - Read-only audit logging
  'audit-service': {
    username: 'svc_audit',
    vhost: '/',
    permissions: {
      configure: '',
      write: '',  // Write-only, cannot read
      read: 'audit\\.events',
    },
    tags: ['monitoring'],
    exchanges: ['audit.topic'],
    queues: ['audit.events'],
  },

  // Servicing Cycle - Daily batch processing
  'servicing-cycle': {
    username: 'svc_servicing',
    vhost: '/',
    permissions: {
      configure: '',
      write: 'servicing\\.complete|payments\\.topic',
      read: 'servicing\\.daily\\.tasks\\..*',
    },
    tags: ['monitoring'],
    exchanges: ['servicing.direct', 'payments.topic'],
    queues: ['servicing.daily.tasks.*'],
  },

  // Escrow Service - Escrow operations
  'escrow-service': {
    username: 'svc_escrow',
    vhost: '/',
    permissions: {
      configure: '',
      write: 'escrow\\.(validated|disbursed|reconciled)',
      read: 'escrow\\.(validate|disburse|reconcile)',
    },
    tags: ['monitoring'],
    exchanges: ['escrow.workflow'],
    queues: ['escrow.operations'],
  },

  // Admin Service - Full access for monitoring and management
  'admin-service': {
    username: 'svc_admin',
    vhost: '/',
    permissions: {
      configure: '.*',  // Can configure all resources
      write: '.*',      // Can write to all resources
      read: '.*',       // Can read all resources
    },
    tags: ['administrator', 'monitoring', 'management'],
    exchanges: ['*'],
    queues: ['*'],
  },
};

/**
 * Generate RabbitMQ user creation commands for CloudAMQP
 */
export function generateRabbitMQUserCommands(): string[] {
  const commands: string[] = [];
  
  for (const [service, config] of Object.entries(RABBITMQ_RBAC_CONFIG)) {
    const { username, vhost, permissions, tags } = config;
    
    // Create user command
    commands.push(`rabbitmqctl add_user ${username} <GENERATE_SECURE_PASSWORD>`);
    
    // Set user tags
    if (tags.length > 0) {
      commands.push(`rabbitmqctl set_user_tags ${username} ${tags.join(' ')}`);
    }
    
    // Set permissions
    commands.push(
      `rabbitmqctl set_permissions -p "${vhost}" ${username} "${permissions.configure}" "${permissions.write}" "${permissions.read}"`
    );
  }
  
  return commands;
}

/**
 * Generate environment variables for service authentication
 */
export function generateServiceEnvVars(): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  for (const [service, config] of Object.entries(RABBITMQ_RBAC_CONFIG)) {
    const prefix = service.toUpperCase().replace(/-/g, '_');
    envVars[`${prefix}_RABBITMQ_USER`] = config.username;
    envVars[`${prefix}_RABBITMQ_PASS`] = '<GENERATE_SECURE_PASSWORD>';
    envVars[`${prefix}_RABBITMQ_VHOST`] = config.vhost;
  }
  
  return envVars;
}

/**
 * Validate service has required permissions for operation
 */
export function validateServicePermission(
  service: string,
  operation: 'read' | 'write' | 'configure',
  resource: string
): boolean {
  const config = RABBITMQ_RBAC_CONFIG[service];
  if (!config) return false;
  
  const pattern = config.permissions[operation];
  if (!pattern) return false;
  
  // Convert permission pattern to regex and test
  const regex = new RegExp(`^${pattern}$`);
  return regex.test(resource);
}

/**
 * Get service-specific connection URL
 */
export function getServiceConnectionUrl(service: string): string {
  const config = RABBITMQ_RBAC_CONFIG[service];
  if (!config) {
    throw new Error(`Unknown service: ${service}`);
  }
  
  const username = process.env[`${service.toUpperCase().replace(/-/g, '_')}_RABBITMQ_USER`] || config.username;
  const password = process.env[`${service.toUpperCase().replace(/-/g, '_')}_RABBITMQ_PASS`] || '';
  const host = process.env.CLOUDAMQP_URL ? new URL(process.env.CLOUDAMQP_URL).host : 'localhost:5672';
  const vhost = encodeURIComponent(config.vhost);
  
  return `amqps://${username}:${password}@${host}/${vhost}`;
}

/**
 * Security audit for RabbitMQ permissions
 */
export function auditServicePermissions(): {
  service: string;
  issues: string[];
  recommendations: string[];
}[] {
  const audit: any[] = [];
  
  for (const [service, config] of Object.entries(RABBITMQ_RBAC_CONFIG)) {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check for overly broad permissions
    if (config.permissions.configure === '.*' && service !== 'admin-service') {
      issues.push('Service has full configuration rights');
      recommendations.push('Restrict configure permissions to specific resources');
    }
    
    if (config.permissions.write === '.*' && service !== 'admin-service') {
      issues.push('Service has unlimited write access');
      recommendations.push('Limit write access to required queues/exchanges only');
    }
    
    if (config.permissions.read === '.*' && service !== 'admin-service') {
      issues.push('Service has unlimited read access');
      recommendations.push('Limit read access to required queues only');
    }
    
    // Check for missing monitoring tag
    if (!config.tags.includes('monitoring')) {
      recommendations.push('Add monitoring tag for observability');
    }
    
    audit.push({
      service,
      issues,
      recommendations,
    });
  }
  
  return audit;
}

/**
 * CloudAMQP-specific security configuration
 */
export const CLOUDAMQP_SECURITY_CONFIG = {
  // TLS Configuration
  tls: {
    enabled: true,
    version: 'TLSv1.3',  // Minimum TLS version
    cipherSuites: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_AES_128_GCM_SHA256',
      'TLS_CHACHA20_POLY1305_SHA256',
    ],
    verifyPeer: true,
    failIfNoPeerCert: true,
  },
  
  // Connection limits per service
  connectionLimits: {
    'payment-validator': 10,
    'payment-processor': 10,
    'investor-service': 5,
    'document-service': 3,
    'notification-service': 5,
    'audit-service': 2,
    'servicing-cycle': 5,
    'escrow-service': 3,
    'admin-service': 2,
  },
  
  // Rate limiting
  rateLimits: {
    messagesPerSecond: 1000,
    connectionsPerMinute: 10,
    maxQueuedMessages: 100000,
  },
  
  // Security policies
  policies: {
    passwordRotationDays: 90,
    enforceStrongPasswords: true,
    minPasswordLength: 32,
    requireMFA: true,
    auditLogging: true,
    encryptAtRest: true,
  },
};