import { RulesEngine, WaterfallInput } from '../rules-engine';

describe('RulesEngine', () => {
  let engine: RulesEngine;

  beforeEach(() => {
    engine = new RulesEngine();
  });

  describe('applyWaterfall', () => {
    it('should allocate in order: fees, interest, principal, escrow', () => {
      const input: WaterfallInput = {
        amountCents: 100000,
        due: {
          fees: 5000,
          interest: 30000,
          principal: 50000,
          escrowShortage: 10000
        },
        policy: {
          allowFees: true,
          allowInterest: true,
          allowPrincipal: true,
          allowEscrow: true,
          defaultLoan: false
        }
      };

      const result = engine.applyWaterfall(input);

      expect(result.xF).toBe(5000);
      expect(result.xI).toBe(30000);
      expect(result.xP).toBe(50000);
      expect(result.xE).toBe(10000);
      expect(result.suspense).toBe(5000);
    });

    it('should respect policy flags', () => {
      const input: WaterfallInput = {
        amountCents: 100000,
        due: {
          fees: 5000,
          interest: 30000,
          principal: 50000,
          escrowShortage: 10000
        },
        policy: {
          allowFees: true,
          allowInterest: true,
          allowPrincipal: false, // Principal not allowed
          allowEscrow: false,    // Escrow not allowed
          defaultLoan: true
        }
      };

      const result = engine.applyWaterfall(input);

      expect(result.xF).toBe(5000);
      expect(result.xI).toBe(30000);
      expect(result.xP).toBe(0); // Should be 0 due to policy
      expect(result.xE).toBe(0); // Should be 0 due to policy
      expect(result.suspense).toBe(65000);
    });

    it('should handle insufficient funds', () => {
      const input: WaterfallInput = {
        amountCents: 10000,
        due: {
          fees: 5000,
          interest: 30000,
          principal: 50000,
          escrowShortage: 10000
        },
        policy: {
          allowFees: true,
          allowInterest: true,
          allowPrincipal: true,
          allowEscrow: true,
          defaultLoan: false
        }
      };

      const result = engine.applyWaterfall(input);

      expect(result.xF).toBe(5000);
      expect(result.xI).toBe(5000); // Remaining amount
      expect(result.xP).toBe(0);
      expect(result.xE).toBe(0);
      expect(result.suspense).toBe(0);
    });

    it('should handle zero payment', () => {
      const input: WaterfallInput = {
        amountCents: 0,
        due: {
          fees: 5000,
          interest: 30000,
          principal: 50000,
          escrowShortage: 10000
        },
        policy: {
          allowFees: true,
          allowInterest: true,
          allowPrincipal: true,
          allowEscrow: true,
          defaultLoan: false
        }
      };

      const result = engine.applyWaterfall(input);

      expect(result.xF).toBe(0);
      expect(result.xI).toBe(0);
      expect(result.xP).toBe(0);
      expect(result.xE).toBe(0);
      expect(result.suspense).toBe(0);
    });

    it('should handle overpayment', () => {
      const input: WaterfallInput = {
        amountCents: 200000,
        due: {
          fees: 5000,
          interest: 30000,
          principal: 50000,
          escrowShortage: 10000
        },
        policy: {
          allowFees: true,
          allowInterest: true,
          allowPrincipal: true,
          allowEscrow: true,
          defaultLoan: false
        }
      };

      const result = engine.applyWaterfall(input);

      expect(result.xF).toBe(5000);
      expect(result.xI).toBe(30000);
      expect(result.xP).toBe(50000);
      expect(result.xE).toBe(10000);
      expect(result.suspense).toBe(105000); // Overpayment goes to suspense
    });
  });

  describe('Property Tests', () => {
    // Property test: Conservation of cents
    it('should conserve cents for all inputs', () => {
      for (let i = 0; i < 1000; i++) {
        const input: WaterfallInput = {
          amountCents: Math.floor(Math.random() * 1000000),
          due: {
            fees: Math.floor(Math.random() * 10000),
            interest: Math.floor(Math.random() * 50000),
            principal: Math.floor(Math.random() * 100000),
            escrowShortage: Math.floor(Math.random() * 20000)
          },
          policy: {
            allowFees: Math.random() > 0.2,
            allowInterest: Math.random() > 0.1,
            allowPrincipal: Math.random() > 0.1,
            allowEscrow: Math.random() > 0.3,
            defaultLoan: Math.random() > 0.8
          }
        };

        const result = engine.applyWaterfall(input);
        const total = result.xF + result.xI + result.xP + result.xE + result.suspense;

        expect(total).toBe(input.amountCents);
      }
    });

    // Property test: No negative components
    it('should never produce negative components', () => {
      for (let i = 0; i < 1000; i++) {
        const input: WaterfallInput = {
          amountCents: Math.floor(Math.random() * 1000000),
          due: {
            fees: Math.floor(Math.random() * 10000),
            interest: Math.floor(Math.random() * 50000),
            principal: Math.floor(Math.random() * 100000),
            escrowShortage: Math.floor(Math.random() * 20000)
          },
          policy: {
            allowFees: Math.random() > 0.2,
            allowInterest: Math.random() > 0.1,
            allowPrincipal: Math.random() > 0.1,
            allowEscrow: Math.random() > 0.3,
            defaultLoan: Math.random() > 0.8
          }
        };

        const result = engine.applyWaterfall(input);

        expect(result.xF).toBeGreaterThanOrEqual(0);
        expect(result.xI).toBeGreaterThanOrEqual(0);
        expect(result.xP).toBeGreaterThanOrEqual(0);
        expect(result.xE).toBeGreaterThanOrEqual(0);
        expect(result.suspense).toBeGreaterThanOrEqual(0);
      }
    });

    // Property test: Allocations never exceed dues
    it('should never allocate more than due amounts', () => {
      for (let i = 0; i < 1000; i++) {
        const input: WaterfallInput = {
          amountCents: Math.floor(Math.random() * 1000000),
          due: {
            fees: Math.floor(Math.random() * 10000),
            interest: Math.floor(Math.random() * 50000),
            principal: Math.floor(Math.random() * 100000),
            escrowShortage: Math.floor(Math.random() * 20000)
          },
          policy: {
            allowFees: true,
            allowInterest: true,
            allowPrincipal: true,
            allowEscrow: true,
            defaultLoan: false
          }
        };

        const result = engine.applyWaterfall(input);

        expect(result.xF).toBeLessThanOrEqual(input.due.fees);
        expect(result.xI).toBeLessThanOrEqual(input.due.interest);
        expect(result.xP).toBeLessThanOrEqual(input.due.principal);
        expect(result.xE).toBeLessThanOrEqual(input.due.escrowShortage);
      }
    });

    // Property test: Policy compliance
    it('should respect policy flags in all cases', () => {
      for (let i = 0; i < 1000; i++) {
        const input: WaterfallInput = {
          amountCents: Math.floor(Math.random() * 1000000),
          due: {
            fees: Math.floor(Math.random() * 10000),
            interest: Math.floor(Math.random() * 50000),
            principal: Math.floor(Math.random() * 100000),
            escrowShortage: Math.floor(Math.random() * 20000)
          },
          policy: {
            allowFees: Math.random() > 0.5,
            allowInterest: Math.random() > 0.5,
            allowPrincipal: Math.random() > 0.5,
            allowEscrow: Math.random() > 0.5,
            defaultLoan: Math.random() > 0.8
          }
        };

        const result = engine.applyWaterfall(input);

        if (!input.policy.allowFees) expect(result.xF).toBe(0);
        if (!input.policy.allowInterest) expect(result.xI).toBe(0);
        if (!input.policy.allowPrincipal) expect(result.xP).toBe(0);
        if (!input.policy.allowEscrow) expect(result.xE).toBe(0);
      }
    });
  });

  describe('getPostingDecision', () => {
    it('should post ACH on settled event', () => {
      const decision = engine.getPostingDecision('ach', 'settled');
      expect(decision.shouldPost).toBe(true);
      expect(decision.reason).toContain('auto-posts');
    });

    it('should post ACH on cleared event', () => {
      const decision = engine.getPostingDecision('ach', 'cleared');
      expect(decision.shouldPost).toBe(true);
      expect(decision.reason).toContain('auto-posts');
    });

    it('should not post ACH on pending event', () => {
      const decision = engine.getPostingDecision('ach', 'pending');
      expect(decision.shouldPost).toBe(false);
      expect(decision.reason).toContain('does not post on event pending');
    });

    it('should post wire on completed event', () => {
      const decision = engine.getPostingDecision('wire', 'completed');
      expect(decision.shouldPost).toBe(true);
      expect(decision.reason).toContain('auto-posts');
    });

    it('should post realtime on completed event', () => {
      const decision = engine.getPostingDecision('realtime', 'completed');
      expect(decision.shouldPost).toBe(true);
      expect(decision.reason).toContain('auto-posts');
    });

    it('should post card on capture event', () => {
      const decision = engine.getPostingDecision('card', 'capture');
      expect(decision.shouldPost).toBe(true);
      expect(decision.reason).toContain('auto-posts');
    });

    it('should post card on settlement event', () => {
      const decision = engine.getPostingDecision('card', 'settlement');
      expect(decision.shouldPost).toBe(true);
      expect(decision.reason).toContain('auto-posts');
    });

    it('should post PayPal on capture event', () => {
      const decision = engine.getPostingDecision('paypal', 'capture');
      expect(decision.shouldPost).toBe(true);
      expect(decision.reason).toContain('auto-posts');
    });

    it('should post Venmo on settlement event', () => {
      const decision = engine.getPostingDecision('venmo', 'settlement');
      expect(decision.shouldPost).toBe(true);
      expect(decision.reason).toContain('auto-posts');
    });

    it('should handle unknown rail', () => {
      const decision = engine.getPostingDecision('unknown' as any, 'any');
      expect(decision.shouldPost).toBe(false);
      expect(decision.requiresManualReview).toBe(true);
      expect(decision.reason).toContain('Unknown payment rail');
    });
  });

  describe('validateWaterfallResult', () => {
    it('should validate correct result', () => {
      const input: WaterfallInput = {
        amountCents: 100000,
        due: {
          fees: 5000,
          interest: 30000,
          principal: 50000,
          escrowShortage: 10000
        },
        policy: {
          allowFees: true,
          allowInterest: true,
          allowPrincipal: true,
          allowEscrow: true,
          defaultLoan: false
        }
      };

      const result = engine.applyWaterfall(input);
      const isValid = engine.validateWaterfallResult(input, result);

      expect(isValid).toBe(true);
    });

    it('should detect conservation failure', () => {
      const input: WaterfallInput = {
        amountCents: 100000,
        due: {
          fees: 5000,
          interest: 30000,
          principal: 50000,
          escrowShortage: 10000
        },
        policy: {
          allowFees: true,
          allowInterest: true,
          allowPrincipal: true,
          allowEscrow: true,
          defaultLoan: false
        }
      };

      const result = {
        xF: 5000,
        xI: 30000,
        xP: 50000,
        xE: 10000,
        suspense: 0 // Wrong - should be 5000
      };

      const isValid = engine.validateWaterfallResult(input, result);
      expect(isValid).toBe(false);
    });

    it('should detect negative components', () => {
      const input: WaterfallInput = {
        amountCents: 100000,
        due: {
          fees: 5000,
          interest: 30000,
          principal: 50000,
          escrowShortage: 10000
        },
        policy: {
          allowFees: true,
          allowInterest: true,
          allowPrincipal: true,
          allowEscrow: true,
          defaultLoan: false
        }
      };

      const result = {
        xF: 5000,
        xI: 30000,
        xP: 50000,
        xE: 10000,
        suspense: -5000 // Negative!
      };

      const isValid = engine.validateWaterfallResult(input, result);
      expect(isValid).toBe(false);
    });

    it('should detect policy violations', () => {
      const input: WaterfallInput = {
        amountCents: 100000,
        due: {
          fees: 5000,
          interest: 30000,
          principal: 50000,
          escrowShortage: 10000
        },
        policy: {
          allowFees: false, // Not allowed
          allowInterest: true,
          allowPrincipal: true,
          allowEscrow: true,
          defaultLoan: false
        }
      };

      const result = {
        xF: 5000, // Should be 0 per policy
        xI: 30000,
        xP: 50000,
        xE: 10000,
        suspense: 5000
      };

      const isValid = engine.validateWaterfallResult(input, result);
      expect(isValid).toBe(false);
    });
  });

  describe('testConservationOfCents', () => {
    it('should pass property test for conservation', () => {
      const passed = engine.testConservationOfCents(100);
      expect(passed).toBe(true);
    });
  });
});