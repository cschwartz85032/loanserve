import { ConsumeMessage } from 'amqplib';
import { db } from '../db';
import { loans, paymentEvents, exceptionCases, paymentIngestions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { PaymentEnvelope } from '../services/payment-envelope';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { PaymentEventService } from '../services/payment-event';
import { ExceptionCaseService } from '../services/exception-case';
import { randomUUID } from 'crypto';

// Policy types based on loan state
export type PaymentPolicy = 
  | 'current'
  | 'delinquent' 
  | 'default'
  | 'charged_off'
  | 'suspense'
  | 'conservative';

// Policy configuration
export interface PolicyConfig {
  policy: PaymentPolicy;
  waterfall: string[];
  requiresReview: boolean;
  autoApply: boolean;
  maxDaysLate: number;
  flags: {
    applyLateFees: boolean;
    acceleratePayoff: boolean;
    notifyInvestors: boolean;
    escalateToLegal: boolean;
    allowPartialPayments: boolean;
    requireSupervisorApproval: boolean;
  };
}

// Loan state mapping to policy
const LOAN_STATE_POLICY_MAP: Record<string, PaymentPolicy> = {
  'active': 'current',
  'current': 'current',
  'delinquent': 'delinquent',
  'default': 'default',
  'charged_off': 'charged_off',
  'foreclosure': 'charged_off',
  'forbearance': 'conservative',
  'modification': 'conservative',
  'application': 'suspense',
  'underwriting': 'suspense',
  'approved': 'suspense',
  'closed': 'suspense',
  'paid_off': 'suspense',
  'reo': 'charged_off'
};

// Policy configurations
const POLICY_CONFIGS: Record<PaymentPolicy, PolicyConfig> = {
  current: {
    policy: 'current',
    waterfall: ['interest', 'principal', 'escrow', 'fees'],
    requiresReview: false,
    autoApply: true,
    maxDaysLate: 0,
    flags: {
      applyLateFees: false,
      acceleratePayoff: false,
      notifyInvestors: false,
      escalateToLegal: false,
      allowPartialPayments: true,
      requireSupervisorApproval: false
    }
  },
  delinquent: {
    policy: 'delinquent',
    waterfall: ['fees', 'interest', 'principal', 'escrow'],
    requiresReview: false,
    autoApply: true,
    maxDaysLate: 90,
    flags: {
      applyLateFees: true,
      acceleratePayoff: false,
      notifyInvestors: true,
      escalateToLegal: false,
      allowPartialPayments: true,
      requireSupervisorApproval: false
    }
  },
  default: {
    policy: 'default',
    waterfall: ['fees', 'interest', 'principal'],
    requiresReview: true,
    autoApply: false,
    maxDaysLate: 180,
    flags: {
      applyLateFees: true,
      acceleratePayoff: true,
      notifyInvestors: true,
      escalateToLegal: true,
      allowPartialPayments: false,
      requireSupervisorApproval: true
    }
  },
  charged_off: {
    policy: 'charged_off',
    waterfall: ['recovery'],
    requiresReview: true,
    autoApply: false,
    maxDaysLate: 999,
    flags: {
      applyLateFees: false,
      acceleratePayoff: true,
      notifyInvestors: true,
      escalateToLegal: true,
      allowPartialPayments: false,
      requireSupervisorApproval: true
    }
  },
  suspense: {
    policy: 'suspense',
    waterfall: ['suspense'],
    requiresReview: true,
    autoApply: false,
    maxDaysLate: 0,
    flags: {
      applyLateFees: false,
      acceleratePayoff: false,
      notifyInvestors: false,
      escalateToLegal: false,
      allowPartialPayments: false,
      requireSupervisorApproval: true
    }
  },
  conservative: {
    policy: 'conservative',
    waterfall: ['suspense'],
    requiresReview: true,
    autoApply: false,
    maxDaysLate: 0,
    flags: {
      applyLateFees: false,
      acceleratePayoff: false,
      notifyInvestors: true,
      escalateToLegal: false,
      allowPartialPayments: false,
      requireSupervisorApproval: true
    }
  }
};

export class PaymentClassifierConsumer {
  private consumerTag: string | null = null;
  private paymentEventService: PaymentEventService;
  private exceptionCaseService: ExceptionCaseService;
  private rabbitmq = getEnhancedRabbitMQService();

  constructor() {
    this.paymentEventService = new PaymentEventService();
    this.exceptionCaseService = new ExceptionCaseService();
  }

  // Parse envelope from message
  private parseEnvelope(msg: ConsumeMessage): PaymentEnvelope | null {
    try {
      const content = msg.content.toString();
      const data = JSON.parse(content);
      // Handle both { env } and direct envelope formats
      return data.env || data;
    } catch (error) {
      console.error('[Classifier] Failed to parse envelope:', error);
      return null;
    }
  }

  // Get loan and determine policy
  private async getLoanAndPolicy(loanId: string | null): Promise<{
    loan: any | null;
    policy: PaymentPolicy;
    config: PolicyConfig;
  }> {
    // Default conservative policy for missing loan
    const defaultResult = {
      loan: null,
      policy: 'conservative' as PaymentPolicy,
      config: POLICY_CONFIGS.conservative
    };

    if (!loanId) {
      console.log('[Classifier] No loan ID provided, using conservative policy');
      return defaultResult;
    }

    try {
      const result = await db
        .select()
        .from(loans)
        .where(eq(loans.id, parseInt(loanId)))
        .limit(1);

      if (result.length === 0) {
        console.log(`[Classifier] Loan ${loanId} not found, using conservative policy`);
        return defaultResult;
      }

      const loan = result[0];
      const policy = this.getPolicyForLoan(loan);
      const config = POLICY_CONFIGS[policy];

      console.log(`[Classifier] Loan ${loanId} status: ${loan.status}, policy: ${policy}`);
      
      return { loan, policy, config };
    } catch (error) {
      console.error('[Classifier] Error fetching loan:', error);
      return defaultResult;
    }
  }

  // Determine policy based on loan state
  private getPolicyForLoan(loan: any): PaymentPolicy {
    if (!loan || !loan.status) {
      return 'conservative';
    }

    // Check days past due for delinquency classification
    if (loan.daysPastDue) {
      if (loan.daysPastDue > 180) {
        return 'charged_off';
      } else if (loan.daysPastDue > 90) {
        return 'default';
      } else if (loan.daysPastDue > 0) {
        return 'delinquent';
      }
    }

    // Map loan status to policy
    const policy = LOAN_STATE_POLICY_MAP[loan.status];
    if (!policy) {
      console.warn(`[Classifier] Unknown loan status: ${loan.status}, using conservative policy`);
      return 'conservative';
    }

    return policy;
  }

  // Calculate days past due
  private calculateDaysPastDue(loan: any): number {
    if (!loan.nextPaymentDueDate) return 0;
    
    const dueDate = new Date(loan.nextPaymentDueDate);
    const today = new Date();
    const diffTime = today.getTime() - dueDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }

  // Create exception for conservative routing
  private async createConservativeException(
    envelope: PaymentEnvelope,
    reason: string,
    loanId: string | null
  ): Promise<void> {
    // Find ingestion ID
    let ingestionId: string | undefined;
    if (envelope.idempotency_key) {
      try {
        const result = await db
          .select()
          .from(paymentIngestions)
          .where(eq(paymentIngestions.idempotencyKey, envelope.idempotency_key))
          .limit(1);
        
        if (result.length > 0) {
          ingestionId = String(result[0].id);
        }
      } catch (error) {
        console.error('[Classifier] Error finding ingestion:', error);
      }
    }

    await this.exceptionCaseService.createException({
      ingestionId,
      category: 'reconcile_variance',
      subcategory: 'loan_state_missing',
      severity: 'medium',
      state: 'open',
      aiRecommendation: {
        reason,
        loanId,
        envelope,
        suggestedActions: [
          'Review loan state in system',
          'Verify loan ID is correct',
          'Check if loan was recently created',
          'Manually assign appropriate policy',
          'Route to supervisor for review'
        ]
      }
    });
  }

  // Publish to saga with policy
  private async publishToSaga(
    envelope: PaymentEnvelope,
    policy: PaymentPolicy,
    config: PolicyConfig,
    loan: any | null
  ): Promise<void> {
    const message = {
      env: envelope,
      policy,
      config,
      context: {
        loanId: loan?.id,
        loanStatus: loan?.status,
        daysPastDue: loan ? this.calculateDaysPastDue(loan) : 0,
        classifiedAt: new Date().toISOString(),
        classifier: 'payment-classifier-v1'
      }
    };

    await this.rabbitmq.publish(
      'payments.saga',
      'saga.payment.start',
      message
    );

    console.log(`[Classifier] Published to saga with policy: ${policy}`);
  }

  // Start consumer
  async start(): Promise<void> {
    console.log('[Classifier] Starting payment classifier consumer');

    const consumerTag = await this.rabbitmq.consume(
      {
        queue: 'payments.classification',
        prefetch: 25,
        consumerTag: 'classifier-consumer'
      },
      async (envelope: any, msg: any) => {
        if (!msg) return;

        const startTime = Date.now();

        try {
          // Envelope is already parsed, but may be wrapped in { env: ... }
          const paymentEnvelope = envelope.env || envelope;
          if (!paymentEnvelope || !paymentEnvelope.message_id) {
            console.error('[Classifier] Invalid message format');
            // Message will be handled by consume method
            return;
          }

          console.log(`[Classifier] Processing payment: ${paymentEnvelope.message_id}`);

          // Get loan and determine policy
          const loanId = paymentEnvelope.borrower?.loan_id;
          const { loan, policy, config } = await this.getLoanAndPolicy(loanId);

          // If using conservative policy due to missing loan state
          if (policy === 'conservative' && !loan) {
            await this.createConservativeException(
              paymentEnvelope,
              'Loan not found or state unknown, routing to suspense',
              loanId
            );
          }

          // Create classification event
          await this.paymentEventService.createEvent({
            type: 'payment.classified',
            eventTime: new Date(),
            actorType: 'system',
            actorId: 'classifier-consumer',
            correlationId: paymentEnvelope.correlation_id,
            data: {
              policy,
              loanId,
              loanStatus: loan?.status,
              daysPastDue: loan ? this.calculateDaysPastDue(loan) : 0,
              waterfall: config.waterfall,
              flags: config.flags
            }
          });

          // Publish to saga
          await this.publishToSaga(paymentEnvelope, policy, config, loan);

          // Message is automatically acknowledged by consume method

          const duration = Date.now() - startTime;
          console.log(`[Classifier] Processed in ${duration}ms, policy: ${policy}`);

        } catch (error: any) {
          console.error('[Classifier] Processing error:', error);

          // Check if temporary error
          if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.log('[Classifier] Temporary error, message will be redelivered');
            throw error; // Throw to trigger requeue
          } else {
            // Permanent error, log it (will be sent to DLQ)
            console.error('[Classifier] Permanent error:', error);
          }
        }
      }
    );

    this.consumerTag = consumerTag;
    console.log('[Classifier] Consumer started successfully');
  }

  // Stop consumer
  async stop(): Promise<void> {
    if (this.consumerTag) {
      await this.rabbitmq.cancelConsumer(this.consumerTag);
      this.consumerTag = null;
      console.log('[Classifier] Consumer stopped');
    }
  }
}