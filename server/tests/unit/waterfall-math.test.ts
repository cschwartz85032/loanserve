/**
 * Unit Tests: Waterfall Math
 * Tests payment allocation waterfall logic, priority ordering, and rounding
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';

// Payment allocation waterfall priorities
enum AllocationPriority {
  LATE_FEES = 1,
  OTHER_FEES = 2,
  ESCROW_SHORTAGE = 3,
  INTEREST = 4,
  PRINCIPAL = 5,
  SUSPENSE = 6
}

interface AllocationBucket {
  type: string;
  priority: number;
  required: Decimal;
  allocated: Decimal;
}

class PaymentWaterfall {
  private buckets: AllocationBucket[] = [];

  addBucket(type: string, priority: number, required: number): void {
    this.buckets.push({
      type,
      priority,
      required: new Decimal(required),
      allocated: new Decimal(0)
    });
  }

  allocate(amount: number): Map<string, number> {
    let remaining = new Decimal(amount);
    
    // Sort buckets by priority
    this.buckets.sort((a, b) => a.priority - b.priority);

    // Allocate to each bucket in priority order
    for (const bucket of this.buckets) {
      if (remaining.lte(0)) break;
      
      const toAllocate = Decimal.min(remaining, bucket.required);
      bucket.allocated = toAllocate;
      remaining = remaining.minus(toAllocate);
    }

    // Build result map
    const result = new Map<string, number>();
    for (const bucket of this.buckets) {
      result.set(bucket.type, bucket.allocated.toNumber());
    }

    // Add suspense if any remaining
    if (remaining.gt(0)) {
      result.set('suspense', remaining.toNumber());
    }

    return result;
  }

  getAllocations(): Map<string, number> {
    const result = new Map<string, number>();
    for (const bucket of this.buckets) {
      result.set(bucket.type, bucket.allocated.toNumber());
    }
    return result;
  }
}

describe('Waterfall Math', () => {
  describe('Basic Allocation', () => {
    it('should allocate payment to single bucket when sufficient', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 1000);

      const allocations = waterfall.allocate(1500);
      
      expect(allocations.get('principal')).toBe(1000);
      expect(allocations.get('suspense')).toBe(500);
    });

    it('should allocate partial payment to highest priority', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('late_fee', AllocationPriority.LATE_FEES, 50);
      waterfall.addBucket('interest', AllocationPriority.INTEREST, 200);
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 800);

      const allocations = waterfall.allocate(100);
      
      expect(allocations.get('late_fee')).toBe(50);
      expect(allocations.get('interest')).toBe(50);
      expect(allocations.get('principal')).toBe(0);
    });

    it('should respect waterfall priority order', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 500);
      waterfall.addBucket('late_fee', AllocationPriority.LATE_FEES, 25);
      waterfall.addBucket('interest', AllocationPriority.INTEREST, 175);
      waterfall.addBucket('escrow', AllocationPriority.ESCROW_SHORTAGE, 100);

      const allocations = waterfall.allocate(300);
      
      // Should allocate in priority order
      expect(allocations.get('late_fee')).toBe(25);   // Priority 1
      expect(allocations.get('escrow')).toBe(100);    // Priority 3
      expect(allocations.get('interest')).toBe(175);  // Priority 4
      expect(allocations.get('principal')).toBe(0);   // Priority 5 (no funds left)
    });
  });

  describe('Decimal Precision', () => {
    it('should handle penny precision without rounding errors', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('interest', AllocationPriority.INTEREST, 333.33);
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 666.67);

      const allocations = waterfall.allocate(1000);
      
      expect(allocations.get('interest')).toBe(333.33);
      expect(allocations.get('principal')).toBe(666.67);
      
      // Total should equal exactly 1000
      const total = Array.from(allocations.values()).reduce((sum, val) => sum + val, 0);
      expect(total).toBe(1000);
    });

    it('should handle fractional cent calculations', () => {
      const waterfall = new PaymentWaterfall();
      // Simulating interest calculation that results in fractional cents
      const dailyInterest = 1095.89 * 0.0425 / 365; // ~$0.1276
      waterfall.addBucket('interest', AllocationPriority.INTEREST, dailyInterest * 30);
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 500);

      const allocations = waterfall.allocate(600);
      
      const interestAllocated = allocations.get('interest')!;
      const principalAllocated = allocations.get('principal')!;
      
      // Interest should be properly rounded
      expect(interestAllocated).toBeCloseTo(3.83, 2);
      expect(principalAllocated).toBeCloseTo(500, 2);
      
      // Remaining goes to suspense
      const suspense = allocations.get('suspense') || 0;
      expect(interestAllocated + principalAllocated + suspense).toBeCloseTo(600, 2);
    });

    it('should avoid floating point errors in calculations', () => {
      const waterfall = new PaymentWaterfall();
      // Known problematic floating point calculation
      waterfall.addBucket('fee1', AllocationPriority.OTHER_FEES, 0.1);
      waterfall.addBucket('fee2', AllocationPriority.OTHER_FEES, 0.2);
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 99.7);

      const allocations = waterfall.allocate(100);
      
      expect(allocations.get('fee1')).toBe(0.1);
      expect(allocations.get('fee2')).toBe(0.2);
      expect(allocations.get('principal')).toBe(99.7);
      
      // Should sum to exactly 100
      const total = Array.from(allocations.values()).reduce((sum, val) => sum + val, 0);
      expect(total).toBe(100);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle overpayment with suspense account', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('late_fee', AllocationPriority.LATE_FEES, 50);
      waterfall.addBucket('interest', AllocationPriority.INTEREST, 200);
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 800);

      const allocations = waterfall.allocate(1500);
      
      expect(allocations.get('late_fee')).toBe(50);
      expect(allocations.get('interest')).toBe(200);
      expect(allocations.get('principal')).toBe(800);
      expect(allocations.get('suspense')).toBe(450);
    });

    it('should handle zero payment amount', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('interest', AllocationPriority.INTEREST, 200);
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 800);

      const allocations = waterfall.allocate(0);
      
      expect(allocations.get('interest')).toBe(0);
      expect(allocations.get('principal')).toBe(0);
    });

    it('should handle negative balances appropriately', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('escrow_shortage', AllocationPriority.ESCROW_SHORTAGE, -150); // Credit balance
      waterfall.addBucket('interest', AllocationPriority.INTEREST, 200);
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 800);

      const allocations = waterfall.allocate(1000);
      
      // Should skip negative buckets
      expect(allocations.get('escrow_shortage')).toBe(0);
      expect(allocations.get('interest')).toBe(200);
      expect(allocations.get('principal')).toBe(800);
    });

    it('should allocate multiple fees in priority order', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('late_fee', AllocationPriority.LATE_FEES, 35);
      waterfall.addBucket('nsf_fee', AllocationPriority.LATE_FEES, 30);
      waterfall.addBucket('servicing_fee', AllocationPriority.OTHER_FEES, 15);
      waterfall.addBucket('hoa_fee', AllocationPriority.OTHER_FEES, 250);
      waterfall.addBucket('interest', AllocationPriority.INTEREST, 450);
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 1220);

      const allocations = waterfall.allocate(1500);
      
      // All fees should be paid first
      expect(allocations.get('late_fee')).toBe(35);
      expect(allocations.get('nsf_fee')).toBe(30);
      expect(allocations.get('servicing_fee')).toBe(15);
      expect(allocations.get('hoa_fee')).toBe(250);
      expect(allocations.get('interest')).toBe(450);
      expect(allocations.get('principal')).toBe(720); // Partial
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large payment amounts', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('interest', AllocationPriority.INTEREST, 500);
      waterfall.addBucket('principal', AllocationPriority.PRINCIPAL, 250000);

      const allocations = waterfall.allocate(1000000);
      
      expect(allocations.get('interest')).toBe(500);
      expect(allocations.get('principal')).toBe(250000);
      expect(allocations.get('suspense')).toBe(749500);
    });

    it('should handle very small payment amounts', () => {
      const waterfall = new PaymentWaterfall();
      waterfall.addBucket('late_fee', AllocationPriority.LATE_FEES, 50);
      waterfall.addBucket('interest', AllocationPriority.INTEREST, 200);

      const allocations = waterfall.allocate(0.01);
      
      expect(allocations.get('late_fee')).toBe(0.01);
      expect(allocations.get('interest')).toBe(0);
    });

    it('should maintain precision with many allocations', () => {
      const waterfall = new PaymentWaterfall();
      
      // Add 100 small fee buckets
      for (let i = 0; i < 100; i++) {
        waterfall.addBucket(`fee_${i}`, AllocationPriority.OTHER_FEES, 0.01);
      }
      
      const allocations = waterfall.allocate(1);
      
      // Should allocate exactly 1 cent to each of 100 buckets
      let total = 0;
      for (let i = 0; i < 100; i++) {
        total += allocations.get(`fee_${i}`) || 0;
      }
      
      expect(total).toBe(1);
    });
  });
});