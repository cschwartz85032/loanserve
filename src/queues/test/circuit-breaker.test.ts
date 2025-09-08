import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, RetryWithBackoff } from '../vendor-circuit-breaker';

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(3, 1000); // 3 failures, 1s timeout
  });

  it('should allow execution when circuit is CLOSED', async () => {
    const mockOperation = vi.fn().mockResolvedValue('success');
    
    const result = await circuitBreaker.execute(mockOperation);
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.getState().state).toBe('CLOSED');
  });

  it('should open circuit after failure threshold', async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error('Service unavailable'));
    
    // Fail 3 times to reach threshold
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Service unavailable');
    }
    
    expect(circuitBreaker.getState().state).toBe('OPEN');
    expect(circuitBreaker.getState().failures).toBe(3);
  });

  it('should reject immediately when circuit is OPEN', async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error('Service unavailable'));
    
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
    }
    
    // Next call should be rejected immediately
    await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Circuit breaker is OPEN');
    expect(mockOperation).toHaveBeenCalledTimes(3); // Should not call operation again
  });

  it('should reset to CLOSED on successful execution after timeout', async () => {
    const mockOperation = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');
    
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
    }
    
    expect(circuitBreaker.getState().state).toBe('OPEN');
    
    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should go to HALF_OPEN and succeed
    const result = await circuitBreaker.execute(mockOperation);
    expect(result).toBe('success');
    expect(circuitBreaker.getState().state).toBe('CLOSED');
    expect(circuitBreaker.getState().failures).toBe(0);
  });
});

describe('Retry With Backoff', () => {
  let retryWithBackoff: RetryWithBackoff;

  beforeEach(() => {
    retryWithBackoff = new RetryWithBackoff(3, 100, 1000, 2); // 3 retries, 100ms base, 1s max, 2x multiplier
  });

  it('should succeed on first try', async () => {
    const mockOperation = vi.fn().mockResolvedValue('success');
    
    const result = await retryWithBackoff.execute(mockOperation);
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const mockOperation = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('success');
    
    const result = await retryWithBackoff.execute(mockOperation);
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(3);
  });

  it('should fail after max retries exhausted', async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error('persistent failure'));
    
    await expect(retryWithBackoff.execute(mockOperation)).rejects.toThrow('persistent failure');
    expect(mockOperation).toHaveBeenCalledTimes(4); // Initial + 3 retries
  });

  it('should apply exponential backoff', async () => {
    const mockOperation = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');
    
    const startTime = Date.now();
    await retryWithBackoff.execute(mockOperation);
    const endTime = Date.now();
    
    // Should have waited at least 100ms + 200ms for the two retries
    // (actual time will be longer due to jitter)
    expect(endTime - startTime).toBeGreaterThan(250);
  });
});