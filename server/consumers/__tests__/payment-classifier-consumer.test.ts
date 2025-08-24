import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentClassifierConsumer } from '../payment-classifier-consumer';
import { db } from '../../db';
import { loans } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Mock dependencies
vi.mock('../../db');
vi.mock('../../services/rabbitmq-enhanced', () => ({
  getEnhancedRabbitMQService: vi.fn(() => ({
    consume: vi.fn(),
    publish: vi.fn(),
    cancelConsumer: vi.fn()
  }))
}));
vi.mock('../../services/payment-event', () => ({
  PaymentEventService: vi.fn().mockImplementation(() => ({
    createEvent: vi.fn()
  }))
}));
vi.mock('../../services/exception-case', () => ({
  ExceptionCaseService: vi.fn().mockImplementation(() => ({
    createException: vi.fn()
  }))
}));

describe('PaymentClassifierConsumer', () => {
  let consumer: PaymentClassifierConsumer;
  let mockDb: any;
  let mockRabbitmq: any;

  beforeEach(() => {
    consumer = new PaymentClassifierConsumer();
    mockDb = db as any;
    mockRabbitmq = (consumer as any).rabbitmq;
    
    // Setup mock database responses
    mockDb.select = vi.fn().mockReturnThis();
    mockDb.from = vi.fn().mockReturnThis();
    mockDb.where = vi.fn().mockReturnThis();
    mockDb.limit = vi.fn().mockReturnThis();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Loan State to Policy Mapping', () => {
    const testCases = [
      // Current states
      { status: 'active', daysPastDue: 0, expectedPolicy: 'current' },
      { status: 'current', daysPastDue: 0, expectedPolicy: 'current' },
      
      // Delinquent states
      { status: 'active', daysPastDue: 30, expectedPolicy: 'delinquent' },
      { status: 'delinquent', daysPastDue: 60, expectedPolicy: 'delinquent' },
      { status: 'active', daysPastDue: 89, expectedPolicy: 'delinquent' },
      
      // Default states
      { status: 'active', daysPastDue: 91, expectedPolicy: 'default' },
      { status: 'default', daysPastDue: 120, expectedPolicy: 'default' },
      { status: 'active', daysPastDue: 179, expectedPolicy: 'default' },
      
      // Charged off states
      { status: 'active', daysPastDue: 181, expectedPolicy: 'charged_off' },
      { status: 'charged_off', daysPastDue: 365, expectedPolicy: 'charged_off' },
      { status: 'foreclosure', daysPastDue: 0, expectedPolicy: 'charged_off' },
      { status: 'reo', daysPastDue: 0, expectedPolicy: 'charged_off' },
      
      // Conservative states
      { status: 'forbearance', daysPastDue: 0, expectedPolicy: 'conservative' },
      { status: 'modification', daysPastDue: 0, expectedPolicy: 'conservative' },
      
      // Suspense states
      { status: 'application', daysPastDue: 0, expectedPolicy: 'suspense' },
      { status: 'underwriting', daysPastDue: 0, expectedPolicy: 'suspense' },
      { status: 'approved', daysPastDue: 0, expectedPolicy: 'suspense' },
      { status: 'closed', daysPastDue: 0, expectedPolicy: 'suspense' },
      { status: 'paid_off', daysPastDue: 0, expectedPolicy: 'suspense' },
      
      // Unknown states (should default to conservative)
      { status: 'unknown_status', daysPastDue: 0, expectedPolicy: 'conservative' },
      { status: null, daysPastDue: 0, expectedPolicy: 'conservative' },
      { status: undefined, daysPastDue: 0, expectedPolicy: 'conservative' }
    ];

    testCases.forEach(({ status, daysPastDue, expectedPolicy }) => {
      it(`should map loan status '${status}' with ${daysPastDue} days past due to policy '${expectedPolicy}'`, () => {
        const loan = { status, daysPastDue };
        const policy = (consumer as any).getPolicyForLoan(loan);
        expect(policy).toBe(expectedPolicy);
      });
    });
  });

  describe('Missing Loan Handling', () => {
    it('should use conservative policy when loan is not found', async () => {
      // Mock database to return empty result
      mockDb.limit = vi.fn().mockResolvedValue([]);
      
      const result = await (consumer as any).getLoanAndPolicy('999');
      
      expect(result.loan).toBeNull();
      expect(result.policy).toBe('conservative');
      expect(result.config.policy).toBe('conservative');
    });

    it('should create exception case for missing loan', async () => {
      const mockCreateException = vi.fn();
      (consumer as any).exceptionCaseService.createException = mockCreateException;
      
      const envelope = {
        message_id: 'test-123',
        borrower: { loan_id: '999' },
        correlation_id: 'corr-123',
        idempotency_key: 'idem-123'
      };
      
      await (consumer as any).createConservativeException(
        envelope,
        'Loan not found',
        '999'
      );
      
      expect(mockCreateException).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'reconcile_variance',
          subcategory: 'loan_state_missing',
          severity: 'medium',
          state: 'open'
        })
      );
    });

    it('should use conservative policy when loan ID is null', async () => {
      const result = await (consumer as any).getLoanAndPolicy(null);
      
      expect(result.loan).toBeNull();
      expect(result.policy).toBe('conservative');
    });

    it('should use conservative policy when database error occurs', async () => {
      // Mock database to throw error
      mockDb.limit = vi.fn().mockRejectedValue(new Error('DB Error'));
      
      const result = await (consumer as any).getLoanAndPolicy('123');
      
      expect(result.loan).toBeNull();
      expect(result.policy).toBe('conservative');
    });
  });

  describe('Message Publishing', () => {
    it('should publish to payments.saga with saga.payment.start routing', async () => {
      const mockPublish = vi.fn();
      (consumer as any).rabbitmq.publish = mockPublish;
      
      const envelope = {
        message_id: 'test-123',
        borrower: { loan_id: '123' },
        correlation_id: 'corr-123'
      };
      
      const loan = { id: 123, status: 'current', daysPastDue: 0 };
      
      await (consumer as any).publishToSaga(
        envelope,
        'current',
        { policy: 'current', waterfall: ['interest', 'principal'] },
        loan
      );
      
      expect(mockPublish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          env: envelope,
          policy: 'current',
          config: expect.any(Object),
          context: expect.objectContaining({
            loanId: 123,
            loanStatus: 'current',
            daysPastDue: 0
          })
        })
      );
    });
  });

  describe('Policy Configurations', () => {
    it('should have correct waterfall for current policy', () => {
      const loan = { status: 'current', daysPastDue: 0 };
      const policy = (consumer as any).getPolicyForLoan(loan);
      const config = (consumer as any).POLICY_CONFIGS[policy];
      
      expect(config.waterfall).toEqual(['interest', 'principal', 'escrow', 'fees']);
      expect(config.autoApply).toBe(true);
      expect(config.flags.applyLateFees).toBe(false);
    });

    it('should have correct waterfall for delinquent policy', () => {
      const loan = { status: 'delinquent', daysPastDue: 45 };
      const policy = (consumer as any).getPolicyForLoan(loan);
      const config = (consumer as any).POLICY_CONFIGS[policy];
      
      expect(config.waterfall).toEqual(['fees', 'interest', 'principal', 'escrow']);
      expect(config.autoApply).toBe(true);
      expect(config.flags.applyLateFees).toBe(true);
    });

    it('should have correct waterfall for default policy', () => {
      const loan = { status: 'default', daysPastDue: 120 };
      const policy = (consumer as any).getPolicyForLoan(loan);
      const config = (consumer as any).POLICY_CONFIGS[policy];
      
      expect(config.waterfall).toEqual(['fees', 'interest', 'principal']);
      expect(config.autoApply).toBe(false);
      expect(config.flags.escalateToLegal).toBe(true);
    });

    it('should have correct waterfall for charged_off policy', () => {
      const loan = { status: 'charged_off', daysPastDue: 365 };
      const policy = (consumer as any).getPolicyForLoan(loan);
      const config = (consumer as any).POLICY_CONFIGS[policy];
      
      expect(config.waterfall).toEqual(['recovery']);
      expect(config.autoApply).toBe(false);
      expect(config.flags.escalateToLegal).toBe(true);
    });
  });
});