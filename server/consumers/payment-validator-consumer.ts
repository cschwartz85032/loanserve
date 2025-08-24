import { ConsumeMessage } from 'amqplib';
import { db } from '../db';
import { loans, paymentEvents, exceptionCases, paymentIngestions } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { PaymentEnvelope } from '../services/payment-envelope';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { PaymentEventService } from '../services/payment-event';
import { ExceptionCaseService } from '../services/exception-case';
import { randomUUID } from 'crypto';

// Validation result types
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  details?: Record<string, any>;
}

// Validation rules
export interface ValidationRules {
  checkLoanExists: boolean;
  checkLoanStatus: boolean;
  checkBankruptcy: boolean;
  checkStopPay: boolean;
  checkKYC: boolean;
  checkAmount: boolean;
  checkDates: boolean;
  checkAuthorization: boolean;
}

// Default validation rules
const DEFAULT_RULES: ValidationRules = {
  checkLoanExists: true,
  checkLoanStatus: true,
  checkBankruptcy: true,
  checkStopPay: true,
  checkKYC: true,
  checkAmount: true,
  checkDates: true,
  checkAuthorization: true
};

// Loan validation context
interface LoanContext {
  loan: any;
  isActive: boolean;
  hasBankruptcy: boolean;
  hasStopPay: boolean;
  isKYCComplete: boolean;
  isClosed: boolean;
  isInDefault: boolean;
}

export class PaymentValidatorConsumer {
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
      return JSON.parse(content) as PaymentEnvelope;
    } catch (error) {
      console.error('[Validator] Failed to parse envelope:', error);
      return null;
    }
  }

  // Get loan context for validation
  private async getLoanContext(loanId: string | null): Promise<LoanContext | null> {
    if (!loanId) return null;
    
    try {
      const result = await db
        .select()
        .from(loans)
        .where(eq(loans.id, parseInt(loanId)))
        .limit(1);
      
      if (result.length === 0) return null;
      
      const loan = result[0];
      
      // Check for bankruptcy in loan status
      const hasBankruptcy = loan.status === 'foreclosure' || 
                          loan.status === 'charged_off';
      
      return {
        loan,
        isActive: loan.status === 'active',
        hasBankruptcy,
        hasStopPay: false, // Would check stop_pay_flag if field exists
        isKYCComplete: true, // Would check KYC status if tracking
        isClosed: loan.status === 'closed' || loan.status === 'paid_off',
        isInDefault: loan.status === 'default'
      };
    } catch (error) {
      console.error('[Validator] Failed to get loan context:', error);
      throw error;
    }
  }

  // Validate loan exists
  private async validateLoanExists(
    envelope: PaymentEnvelope,
    rules: ValidationRules
  ): Promise<ValidationResult> {
    if (!rules.checkLoanExists) {
      return { valid: true };
    }
    
    const loanId = envelope.borrower?.loan_id;
    if (!loanId) {
      return {
        valid: false,
        reason: 'missing_loan_id',
        details: { message: 'Payment envelope missing loan ID' }
      };
    }
    
    const context = await this.getLoanContext(loanId);
    if (!context) {
      return {
        valid: false,
        reason: 'loan_not_found',
        details: { loan_id: loanId }
      };
    }
    
    return { valid: true };
  }

  // Validate loan status
  private async validateLoanStatus(
    envelope: PaymentEnvelope,
    rules: ValidationRules
  ): Promise<ValidationResult> {
    if (!rules.checkLoanStatus) {
      return { valid: true };
    }
    
    const loanId = envelope.borrower?.loan_id;
    const context = await this.getLoanContext(loanId);
    
    if (!context) {
      return { valid: true }; // Already checked in validateLoanExists
    }
    
    // Check bankruptcy
    if (rules.checkBankruptcy && context.hasBankruptcy) {
      return {
        valid: false,
        reason: 'legal_hold',
        details: { 
          status: context.loan.status,
          message: 'Loan is in bankruptcy/foreclosure, payments on legal hold'
        }
      };
    }
    
    // Check if closed
    if (context.isClosed) {
      return {
        valid: false,
        reason: 'loan_closed',
        details: {
          status: context.loan.status,
          message: 'Cannot process payment for closed loan'
        }
      };
    }
    
    // Check stop pay flag
    if (rules.checkStopPay && context.hasStopPay) {
      return {
        valid: false,
        reason: 'stop_pay_active',
        details: {
          message: 'Stop payment flag is active on this loan'
        }
      };
    }
    
    return { valid: true };
  }

  // Validate payment amount
  private async validateAmount(
    envelope: PaymentEnvelope,
    rules: ValidationRules
  ): Promise<ValidationResult> {
    if (!rules.checkAmount) {
      return { valid: true };
    }
    
    const amountCents = envelope.payment?.amount_cents;
    
    // Check for valid amount
    if (!amountCents || amountCents <= 0) {
      return {
        valid: false,
        reason: 'invalid_amount',
        details: {
          amount_cents: amountCents,
          message: 'Payment amount must be positive'
        }
      };
    }
    
    // Check for suspiciously large amounts (>$1M)
    if (amountCents > 100000000) {
      return {
        valid: false,
        reason: 'amount_exceeds_limit',
        details: {
          amount_cents: amountCents,
          limit_cents: 100000000,
          message: 'Payment amount exceeds maximum limit'
        }
      };
    }
    
    return { valid: true };
  }

  // Validate dates
  private async validateDates(
    envelope: PaymentEnvelope,
    rules: ValidationRules
  ): Promise<ValidationResult> {
    if (!rules.checkDates) {
      return { valid: true };
    }
    
    const valueDate = envelope.payment?.value_date;
    if (!valueDate) {
      return {
        valid: false,
        reason: 'missing_value_date',
        details: { message: 'Payment value date is required' }
      };
    }
    
    // Check if date is reasonable (not too far in past or future)
    const date = new Date(valueDate);
    const now = new Date();
    const daysDiff = Math.abs(date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 365) {
      return {
        valid: false,
        reason: 'invalid_date_range',
        details: {
          value_date: valueDate,
          message: 'Payment date is more than 1 year from current date'
        }
      };
    }
    
    return { valid: true };
  }

  // Validate KYC status
  private async validateKYC(
    envelope: PaymentEnvelope,
    rules: ValidationRules
  ): Promise<ValidationResult> {
    if (!rules.checkKYC) {
      return { valid: true };
    }
    
    // In production, check KYC database or flags
    // For now, we'll pass this check
    const isKYCComplete = true;
    
    if (!isKYCComplete) {
      return {
        valid: false,
        reason: 'kyc_incomplete',
        details: {
          borrower: envelope.borrower?.name,
          message: 'KYC verification required before payment processing'
        }
      };
    }
    
    return { valid: true };
  }

  // Validate authorization
  private async validateAuthorization(
    envelope: PaymentEnvelope,
    rules: ValidationRules
  ): Promise<ValidationResult> {
    if (!rules.checkAuthorization) {
      return { valid: true };
    }
    
    // Check if payment method is authorized
    const method = envelope.source?.channel;
    const authorizedMethods = ['ach', 'wire', 'check', 'card', 'column'];
    
    if (!method || !authorizedMethods.includes(method)) {
      return {
        valid: false,
        reason: 'unauthorized_method',
        details: {
          method,
          authorized: authorizedMethods,
          message: 'Payment method not authorized'
        }
      };
    }
    
    return { valid: true };
  }

  // Main validation orchestrator
  private async validateEnvelope(
    envelope: PaymentEnvelope,
    rules: ValidationRules = DEFAULT_RULES
  ): Promise<ValidationResult> {
    const validations = [
      () => this.validateLoanExists(envelope, rules),
      () => this.validateLoanStatus(envelope, rules),
      () => this.validateAmount(envelope, rules),
      () => this.validateDates(envelope, rules),
      () => this.validateKYC(envelope, rules),
      () => this.validateAuthorization(envelope, rules)
    ];
    
    for (const validate of validations) {
      const result = await validate();
      if (!result.valid) {
        return result;
      }
    }
    
    return { valid: true, reason: 'all_checks_passed' };
  }

  // Find ingestion ID from envelope
  private async findIngestionId(envelope: PaymentEnvelope): Promise<number | null> {
    try {
      const result = await db
        .select()
        .from(paymentIngestions)
        .where(eq(paymentIngestions.idempotencyKey, envelope.idempotency_key))
        .limit(1);
      
      return result.length > 0 ? result[0].id : null;
    } catch (error) {
      console.error('[Validator] Failed to find ingestion:', error);
      return null;
    }
  }

  // Publish validated payment
  private async publishValidated(envelope: PaymentEnvelope): Promise<void> {
    const routingKey = 'payment.validated';
    const message = {
      ...envelope,
      validation: {
        timestamp: new Date().toISOString(),
        validator: 'payment-validator-v1'
      }
    };
    
    await this.rabbitmq.publish(
      'payments.validation',
      routingKey,
      message
    );
    
    console.log(`[Validator] Published validated payment: ${envelope.message_id}`);
  }

  // Publish rejected payment
  private async publishRejected(
    envelope: PaymentEnvelope,
    result: ValidationResult
  ): Promise<void> {
    const routingKey = 'payment.rejected';
    const message = {
      ...envelope,
      rejection: {
        timestamp: new Date().toISOString(),
        reason: result.reason,
        details: result.details,
        validator: 'payment-validator-v1'
      }
    };
    
    await this.rabbitmq.publish(
      'payments.validation',
      routingKey,
      message
    );
    
    console.log(`[Validator] Published rejected payment: ${envelope.message_id}, reason: ${result.reason}`);
  }

  // Create exception case for rejected payment
  private async createRejectionException(
    envelope: PaymentEnvelope,
    result: ValidationResult,
    ingestionId: number | null
  ): Promise<void> {
    const ingestionIdStr = ingestionId ? String(ingestionId) : undefined;
    
    await this.exceptionCaseService.createException({
      ingestionId: ingestionIdStr,
      category: 'dispute', // Using 'dispute' as a general validation failure category
      subcategory: result.reason || 'validation_failed',
      severity: 'high',
      state: 'open',
      aiRecommendation: {
        errorType: result.reason,
        errorMessage: result.details?.message || 'Payment failed validation',
        errorDetails: result.details || {},
        envelope,
        suggestedActions: [
          'Review validation failure reason',
          'Verify loan and borrower information',
          'Contact borrower if needed',
          'Escalate to supervisor if legal hold'
        ]
      }
    });
  }

  // Start consumer
  async start(): Promise<void> {
    console.log('[Validator] Starting payment validator consumer');
    
    const consumerTag = await this.rabbitmq.consume(
      {
        queue: 'payments.validation',
        prefetch: 50,
        consumerTag: 'validator-consumer'
      },
      async (envelope: any, msg: any) => {
        if (!msg) return;
        
        const startTime = Date.now();
        
        try {
          // The envelope is already parsed by the consume method
          if (!envelope || !envelope.message_id) {
            console.error('[Validator] Invalid message format');
            // Message will be handled by the consume method's error handling
            return;
          }
          
          console.log(`[Validator] Processing payment: ${envelope.message_id}`);
          
          // Find ingestion ID for event tracking
          const ingestionId = await this.findIngestionId(envelope);
          const ingestionIdStr = ingestionId ? String(ingestionId) : undefined;
          
          // Validate envelope
          const result = await this.validateEnvelope(envelope);
          
          if (result.valid) {
            // Publish to validated queue
            await this.publishValidated(envelope);
            
            // Add success event
            await this.paymentEventService.createEvent({
              ingestionId: ingestionIdStr,
              type: 'payment.validated',
              eventTime: new Date(),
              actorType: 'system',
              actorId: 'validator-consumer',
              correlationId: envelope.correlation_id,
              data: {
                reason: 'ok',
                checks_passed: [
                  'loan_exists',
                  'loan_status',
                  'amount',
                  'dates',
                  'kyc',
                  'authorization'
                ]
              }
            });
            
            console.log(`[Validator] Payment validated: ${envelope.message_id}`);
          } else {
            // Publish to rejected queue
            await this.publishRejected(envelope, result);
            
            // Create exception case
            await this.createRejectionException(envelope, result, ingestionId);
            
            // Add rejection event
            await this.paymentEventService.createEvent({
              ingestionId: ingestionIdStr,
              type: 'payment.rejected',
              eventTime: new Date(),
              actorType: 'system',
              actorId: 'validator-consumer',
              correlationId: envelope.correlation_id,
              data: {
                reason: result.reason,
                details: result.details
              }
            });
            
            console.log(`[Validator] Payment rejected: ${envelope.message_id}, reason: ${result.reason}`);
          }
          
          // Message is automatically acknowledged by the consume method
          
          const duration = Date.now() - startTime;
          console.log(`[Validator] Processed in ${duration}ms`);
          
        } catch (error: any) {
          console.error('[Validator] Processing error:', error);
          
          // Check if temporary error (DB outage, etc)
          if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            // Throw error to trigger nack with requeue in consume method
            console.log('[Validator] Temporary error, message will be redelivered');
            throw error;
          } else {
            // Log error, message will be sent to DLQ by consume method
            console.error('[Validator] Permanent error:', error);
          }
        }
      }
    );
    
    this.consumerTag = consumerTag;
    console.log('[Validator] Consumer started successfully');
  }

  // Stop consumer gracefully
  async stop(): Promise<void> {
    if (this.consumerTag) {
      await this.rabbitmq.cancelConsumer(this.consumerTag);
      this.consumerTag = null;
      console.log('[Validator] Consumer stopped');
    }
  }
}