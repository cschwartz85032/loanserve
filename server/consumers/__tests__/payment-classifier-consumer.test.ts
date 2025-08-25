import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentClassifierConsumer } from '../payment-classifier-consumer';
import { db } from '../../db';
import { loans } from '@shared/schema';
import { getEnhancedRabbitMQService } from '../../services/rabbitmq-enhanced';
import { PaymentEventService } from '../../services/payment-event';
import { ExceptionCaseService } from '../../services/exception-case';

// Mock dependencies
vi.mock('../../db');
vi.mock('../../services/rabbitmq-enhanced');
vi.mock('../../services/payment-event');
vi.mock('../../services/exception-case');

describe('PaymentClassifierConsumer', () => {
  let classifier: PaymentClassifierConsumer;
  let mockRabbitMQ: any;
  let mockEventService: any;
  let mockExceptionService: any;

  beforeEach(() => {
    // Setup mocks
    mockRabbitMQ = {
      consume: vi.fn(),
      publish: vi.fn(),
      cancelConsumer: vi.fn()
    };
    
    mockEventService = {
      createEvent: vi.fn()
    };
    
    mockExceptionService = {
      createException: vi.fn()
    };

    vi.mocked(getEnhancedRabbitMQService).mockReturnValue(mockRabbitMQ);
    vi.mocked(PaymentEventService).mockImplementation(() => mockEventService);
    vi.mocked(ExceptionCaseService).mockImplementation(() => mockExceptionService);

    classifier = new PaymentClassifierConsumer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Policy Classification', () => {
    const mockEnvelope = {
      message_id: 'test-123',
      correlation_id: 'corr-456',
      idempotency_key: 'idem-789',
      borrower: {
        loan_id: '1001'
      }
    };

    it('should classify CURRENT status loan as "current" policy', async () => {
      // Mock loan with current status
      const mockLoan = {
        id: 1001,
        status: 'active',
        daysPastDue: 0,
        nextPaymentDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days future
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      // Start consumer and trigger callback
      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Verify published with current policy
      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          env: mockEnvelope,
          policy: 'current',
          config: expect.objectContaining({
            policy: 'current',
            waterfall: ['interest', 'principal', 'escrow', 'fees'],
            requiresReview: false,
            autoApply: true
          })
        })
      );
    });

    it('should classify DELINQUENT status loan as "delinquent" policy', async () => {
      // Mock loan with delinquent status (30 days past due)
      const mockLoan = {
        id: 1001,
        status: 'delinquent',
        daysPastDue: 30,
        nextPaymentDueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days past
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Verify published with delinquent policy
      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          env: mockEnvelope,
          policy: 'delinquent',
          config: expect.objectContaining({
            policy: 'delinquent',
            waterfall: ['fees', 'interest', 'principal', 'escrow'],
            requiresReview: false,
            flags: expect.objectContaining({
              applyLateFees: true,
              notifyInvestors: true
            })
          })
        })
      );
    });

    it('should classify DEFAULT status loan as "default" policy', async () => {
      // Mock loan with default status (120 days past due)
      const mockLoan = {
        id: 1001,
        status: 'default',
        daysPastDue: 120,
        nextPaymentDueDate: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) // 120 days past
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Verify published with default policy
      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          env: mockEnvelope,
          policy: 'default',
          config: expect.objectContaining({
            policy: 'default',
            waterfall: ['fees', 'interest', 'principal'],
            requiresReview: true,
            autoApply: false,
            flags: expect.objectContaining({
              acceleratePayoff: true,
              escalateToLegal: true,
              requireSupervisorApproval: true
            })
          })
        })
      );
    });

    it('should classify CHARGED_OFF status loan as "charged_off" policy', async () => {
      // Mock loan with charged off status (200 days past due)
      const mockLoan = {
        id: 1001,
        status: 'charged_off',
        daysPastDue: 200,
        nextPaymentDueDate: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) // 200 days past
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Verify published with charged_off policy
      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          env: mockEnvelope,
          policy: 'charged_off',
          config: expect.objectContaining({
            policy: 'charged_off',
            waterfall: ['recovery'],
            requiresReview: true,
            flags: expect.objectContaining({
              acceleratePayoff: true,
              escalateToLegal: true,
              allowPartialPayments: false
            })
          })
        })
      );
    });

    it('should classify loan based on daysPastDue when > 180', async () => {
      // Mock loan with many days past due (should override status)
      const mockLoan = {
        id: 1001,
        status: 'active', // Status says active but days past due says charged off
        daysPastDue: 185,
        nextPaymentDueDate: new Date(Date.now() - 185 * 24 * 60 * 60 * 1000)
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Should use charged_off policy based on days past due
      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          policy: 'charged_off'
        })
      );
    });

    it('should classify loan based on daysPastDue when > 90', async () => {
      // Mock loan with 95 days past due (should be default)
      const mockLoan = {
        id: 1001,
        status: 'active',
        daysPastDue: 95,
        nextPaymentDueDate: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000)
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Should use default policy based on days past due
      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          policy: 'default'
        })
      );
    });

    it('should classify forbearance loan as "conservative" policy', async () => {
      const mockLoan = {
        id: 1001,
        status: 'forbearance',
        daysPastDue: 0,
        nextPaymentDueDate: new Date()
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          policy: 'conservative'
        })
      );
    });

    it('should classify application/underwriting loan as "suspense" policy', async () => {
      const mockLoan = {
        id: 1001,
        status: 'application',
        daysPastDue: 0,
        nextPaymentDueDate: null
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          policy: 'suspense'
        })
      );
    });
  });

  describe('Missing Loan Handling', () => {
    const mockEnvelope = {
      message_id: 'test-123',
      correlation_id: 'corr-456',
      idempotency_key: 'idem-789',
      borrower: {
        loan_id: '9999'
      }
    };

    it('should use conservative policy when loan not found', async () => {
      // Mock no loan found
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Verify conservative policy used
      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          env: mockEnvelope,
          policy: 'conservative'
        })
      );
    });

    it('should create exception when loan not found', async () => {
      // Mock no loan found
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Verify exception created
      expect(mockExceptionService.createException).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'reconcile_variance',
          subcategory: 'loan_state_missing',
          severity: 'medium',
          state: 'open',
          aiRecommendation: expect.objectContaining({
            reason: 'Loan not found or state unknown, routing to suspense',
            loanId: '9999',
            envelope: mockEnvelope
          })
        })
      );
    });

    it('should use conservative policy when no loan ID provided', async () => {
      const envelopeNoLoan = {
        message_id: 'test-123',
        correlation_id: 'corr-456',
        idempotency_key: 'idem-789',
        borrower: {} // No loan_id
      };

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(envelopeNoLoan, { content: Buffer.from(JSON.stringify({ env: envelopeNoLoan })) });

      // Verify conservative policy used
      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          policy: 'conservative'
        })
      );
    });

    it('should use conservative policy for unknown loan status', async () => {
      const mockLoan = {
        id: 1001,
        status: 'unknown_status_xyz', // Unknown status
        daysPastDue: 0,
        nextPaymentDueDate: new Date()
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Should use conservative policy for unknown status
      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          policy: 'conservative'
        })
      );
    });
  });

  describe('Event Creation', () => {
    it('should create payment.classified event for each message', async () => {
      const mockEnvelope = {
        message_id: 'test-123',
        correlation_id: 'corr-456',
        idempotency_key: 'idem-789',
        borrower: {
          loan_id: '1001'
        }
      };

      const mockLoan = {
        id: 1001,
        status: 'active',
        daysPastDue: 0,
        nextPaymentDueDate: new Date()
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, { content: Buffer.from(JSON.stringify({ env: mockEnvelope })) });

      // Verify event created
      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment.classified',
          actorType: 'system',
          actorId: 'classifier-consumer',
          correlationId: 'corr-456',
          data: expect.objectContaining({
            policy: 'current',
            loanId: '1001',
            loanStatus: 'active',
            daysPastDue: 0,
            waterfall: ['interest', 'principal', 'escrow', 'fees']
          })
        })
      );
    });
  });

  describe('Consumer Lifecycle', () => {
    it('should start consumer on q.classify queue', async () => {
      await classifier.start();

      expect(mockRabbitMQ.consume).toHaveBeenCalledWith(
        expect.objectContaining({
          queue: 'q.classify',
          prefetch: 25,
          consumerTag: 'classifier-consumer'
        }),
        expect.any(Function)
      );
    });

    it('should stop consumer gracefully', async () => {
      mockRabbitMQ.consume.mockResolvedValue('test-consumer-tag');
      
      await classifier.start();
      await classifier.stop();

      expect(mockRabbitMQ.cancelConsumer).toHaveBeenCalledWith('test-consumer-tag');
    });
  });

  describe('Policy Flags Verification', () => {
    it('should set correct flags for current policy', async () => {
      const mockLoan = {
        id: 1001,
        status: 'active',
        daysPastDue: 0
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      const mockEnvelope = {
        message_id: 'test-123',
        borrower: { loan_id: '1001' }
      };

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, {});

      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          config: expect.objectContaining({
            flags: {
              applyLateFees: false,
              acceleratePayoff: false,
              notifyInvestors: false,
              escalateToLegal: false,
              allowPartialPayments: true,
              requireSupervisorApproval: false
            }
          })
        })
      );
    });

    it('should set correct flags for delinquent policy', async () => {
      const mockLoan = {
        id: 1001,
        status: 'delinquent',
        daysPastDue: 45
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLoan])
          })
        })
      } as any);

      const mockEnvelope = {
        message_id: 'test-123',
        borrower: { loan_id: '1001' }
      };

      await classifier.start();
      const consumeCallback = mockRabbitMQ.consume.mock.calls[0][1];
      await consumeCallback(mockEnvelope, {});

      expect(mockRabbitMQ.publish).toHaveBeenCalledWith(
        'payments.saga',
        'saga.payment.start',
        expect.objectContaining({
          config: expect.objectContaining({
            flags: {
              applyLateFees: true,
              acceleratePayoff: false,
              notifyInvestors: true,
              escalateToLegal: false,
              allowPartialPayments: true,
              requireSupervisorApproval: false
            }
          })
        })
      );
    });
  });
});