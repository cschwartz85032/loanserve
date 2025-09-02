import { describe, it, expect, beforeAll } from 'vitest';
import { runDailyCycle } from '../src/servicing/cycle';

describe('Servicing Cycle Engine', () => {
  const tenantId = "00000000-0000-0000-0000-000000000001";
  
  it('runs daily cycle idempotently', async () => {
    const asOf = "2025-01-15";
    
    // First run should process
    const r1 = await runDailyCycle(tenantId, asOf);
    expect(r1.ok).toBe(true);
    
    // Second run should be skipped (idempotent)
    const r2 = await runDailyCycle(tenantId, asOf);
    expect(r2.skipped).toBe(true);
  });

  it('handles cycle with no active loans gracefully', async () => {
    const asOf = "2025-01-16";
    
    const result = await runDailyCycle(tenantId, asOf);
    expect(result.ok).toBe(true);
    expect(result.issued).toBe(0);
    expect(result.lateFees).toBe(0);
    expect(result.billsQueued).toBe(0);
  });
});