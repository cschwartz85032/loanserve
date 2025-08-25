/**
 * Unit Tests: Idempotency Key Generator
 * Tests deterministic key generation, collision avoidance, and consistency
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

class IdempotencyKeyGenerator {
  /**
   * Generate deterministic idempotency key from payment attributes
   */
  static generatePaymentKey(
    loanId: string,
    amount: number,
    source: string,
    externalRef: string,
    effectiveDate: string
  ): string {
    const normalized = {
      loan_id: loanId.trim().toLowerCase(),
      amount_cents: Math.round(amount * 100), // Convert to cents
      source: source.trim().toLowerCase(),
      external_ref: externalRef.trim(),
      effective_date: effectiveDate.trim()
    };

    const payload = JSON.stringify(normalized, Object.keys(normalized).sort());
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Generate composite key for distributed operations
   */
  static generateCompositeKey(
    entityType: string,
    entityId: string,
    operation: string,
    timestamp?: number
  ): string {
    const components = [
      entityType,
      entityId,
      operation,
      timestamp ? Math.floor(timestamp / 1000) : '' // Round to seconds
    ].filter(Boolean);

    return components.join(':');
  }

  /**
   * Generate temporal key with time window
   */
  static generateTemporalKey(
    baseKey: string,
    windowSizeMs: number = 60000 // 1 minute default
  ): string {
    const now = Date.now();
    const window = Math.floor(now / windowSizeMs);
    return `${baseKey}:${window}`;
  }

  /**
   * Generate hash-based key for large payloads
   */
  static generateHashKey(payload: any): string {
    // Normalize object by sorting keys
    const normalized = this.normalizeObject(payload);
    const json = JSON.stringify(normalized);
    
    // Use SHA-256 for consistent hashing
    return crypto
      .createHash('sha256')
      .update(json, 'utf8')
      .digest('base64')
      .replace(/[+/=]/g, ''); // Make URL-safe
  }

  private static normalizeObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeObject(item));
    }

    const sortedObj: any = {};
    Object.keys(obj)
      .sort()
      .forEach(key => {
        sortedObj[key] = this.normalizeObject(obj[key]);
      });

    return sortedObj;
  }
}

describe('Idempotency Key Generator', () => {
  describe('Payment Key Generation', () => {
    it('should generate consistent keys for identical payments', () => {
      const key1 = IdempotencyKeyGenerator.generatePaymentKey(
        '17',
        1000.50,
        'ACH',
        'REF-123',
        '2025-08-25'
      );

      const key2 = IdempotencyKeyGenerator.generatePaymentKey(
        '17',
        1000.50,
        'ACH',
        'REF-123',
        '2025-08-25'
      );

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA-256 hex length
    });

    it('should generate different keys for different amounts', () => {
      const key1 = IdempotencyKeyGenerator.generatePaymentKey(
        '17',
        1000.00,
        'ACH',
        'REF-123',
        '2025-08-25'
      );

      const key2 = IdempotencyKeyGenerator.generatePaymentKey(
        '17',
        1000.01, // 1 cent difference
        'ACH',
        'REF-123',
        '2025-08-25'
      );

      expect(key1).not.toBe(key2);
    });

    it('should normalize inputs for consistency', () => {
      const key1 = IdempotencyKeyGenerator.generatePaymentKey(
        '  17  ',
        1000,
        'ach',
        'REF-123  ',
        '2025-08-25'
      );

      const key2 = IdempotencyKeyGenerator.generatePaymentKey(
        '17',
        1000,
        'ACH',
        'REF-123',
        '2025-08-25'
      );

      expect(key1).toBe(key2);
    });

    it('should handle floating point precision correctly', () => {
      const key1 = IdempotencyKeyGenerator.generatePaymentKey(
        '17',
        100.10,
        'ACH',
        'REF-123',
        '2025-08-25'
      );

      const key2 = IdempotencyKeyGenerator.generatePaymentKey(
        '17',
        100.1, // JavaScript treats these as same
        'ACH',
        'REF-123',
        '2025-08-25'
      );

      expect(key1).toBe(key2);
    });

    it('should generate unique keys for different external refs', () => {
      const refs = ['REF-001', 'REF-002', 'REF-003', 'REF-004', 'REF-005'];
      const keys = new Set();

      refs.forEach(ref => {
        const key = IdempotencyKeyGenerator.generatePaymentKey(
          '17',
          1000,
          'ACH',
          ref,
          '2025-08-25'
        );
        keys.add(key);
      });

      expect(keys.size).toBe(refs.length);
    });
  });

  describe('Composite Key Generation', () => {
    it('should generate predictable composite keys', () => {
      const key = IdempotencyKeyGenerator.generateCompositeKey(
        'payment',
        'PAY-123',
        'validate'
      );

      expect(key).toBe('payment:PAY-123:validate');
    });

    it('should include timestamp when provided', () => {
      const timestamp = 1756130000000;
      const key = IdempotencyKeyGenerator.generateCompositeKey(
        'payment',
        'PAY-123',
        'process',
        timestamp
      );

      expect(key).toBe('payment:PAY-123:process:1756130000');
    });

    it('should handle missing optional parameters', () => {
      const key = IdempotencyKeyGenerator.generateCompositeKey(
        'loan',
        '17',
        'update'
      );

      expect(key).toBe('loan:17:update');
    });
  });

  describe('Temporal Key Generation', () => {
    it('should generate same key within time window', () => {
      const baseKey = 'payment:123';
      const windowSize = 60000; // 1 minute

      const key1 = IdempotencyKeyGenerator.generateTemporalKey(baseKey, windowSize);
      
      // Wait a bit but stay within window
      const key2 = IdempotencyKeyGenerator.generateTemporalKey(baseKey, windowSize);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different windows', () => {
      const baseKey = 'payment:123';
      const windowSize = 1; // 1ms window to force different windows

      const key1 = IdempotencyKeyGenerator.generateTemporalKey(baseKey, windowSize);
      
      // Small delay to ensure different window
      const start = Date.now();
      while (Date.now() - start < 2) { /* wait */ }
      
      const key2 = IdempotencyKeyGenerator.generateTemporalKey(baseKey, windowSize);

      expect(key1).not.toBe(key2);
    });

    it('should use default window size when not specified', () => {
      const key = IdempotencyKeyGenerator.generateTemporalKey('test');
      expect(key).toMatch(/^test:\d+$/);
    });
  });

  describe('Hash Key Generation', () => {
    it('should generate consistent hash for complex objects', () => {
      const payload = {
        loan: { id: '17', number: 'LN-123' },
        payment: { amount: 1000, date: '2025-08-25' },
        metadata: { source: 'api', version: '1.0' }
      };

      const key1 = IdempotencyKeyGenerator.generateHashKey(payload);
      const key2 = IdempotencyKeyGenerator.generateHashKey(payload);

      expect(key1).toBe(key2);
    });

    it('should normalize object key order', () => {
      const payload1 = {
        b: 2,
        a: 1,
        c: { d: 4, e: 5 }
      };

      const payload2 = {
        a: 1,
        c: { e: 5, d: 4 },
        b: 2
      };

      const key1 = IdempotencyKeyGenerator.generateHashKey(payload1);
      const key2 = IdempotencyKeyGenerator.generateHashKey(payload2);

      expect(key1).toBe(key2);
    });

    it('should handle arrays in payloads', () => {
      const payload = {
        items: [1, 2, 3],
        tags: ['payment', 'ach', 'validated']
      };

      const key = IdempotencyKeyGenerator.generateHashKey(payload);
      expect(key).toBeTruthy();
      expect(key).not.toContain('+'); // URL-safe
      expect(key).not.toContain('/');
      expect(key).not.toContain('=');
    });

    it('should generate different keys for different payloads', () => {
      const payloads = [
        { id: 1, type: 'payment' },
        { id: 2, type: 'payment' },
        { id: 1, type: 'refund' },
        { id: 1, type: 'payment', extra: true }
      ];

      const keys = new Set(payloads.map(p => 
        IdempotencyKeyGenerator.generateHashKey(p)
      ));

      expect(keys.size).toBe(payloads.length);
    });

    it('should handle null and undefined values', () => {
      const payload1 = { a: null, b: undefined, c: 1 };
      const payload2 = { c: 1, a: null, b: undefined };

      const key1 = IdempotencyKeyGenerator.generateHashKey(payload1);
      const key2 = IdempotencyKeyGenerator.generateHashKey(payload2);

      expect(key1).toBe(key2);
    });
  });

  describe('Collision Resistance', () => {
    it('should have low collision rate for similar inputs', () => {
      const keys = new Set();
      const collisions = [];

      // Generate keys for similar payments
      for (let i = 0; i < 10000; i++) {
        const key = IdempotencyKeyGenerator.generatePaymentKey(
          '17',
          1000 + (i * 0.01), // Increment by penny
          'ACH',
          `REF-${i}`,
          '2025-08-25'
        );

        if (keys.has(key)) {
          collisions.push({ index: i, key });
        }
        keys.add(key);
      }

      expect(collisions).toHaveLength(0);
      expect(keys.size).toBe(10000);
    });

    it('should handle high-entropy inputs', () => {
      const keys = new Set();

      for (let i = 0; i < 1000; i++) {
        const randomData = {
          id: crypto.randomBytes(16).toString('hex'),
          timestamp: Date.now() + i,
          random: Math.random()
        };

        const key = IdempotencyKeyGenerator.generateHashKey(randomData);
        keys.add(key);
      }

      expect(keys.size).toBe(1000); // All unique
    });
  });
});