/**
 * Loan amortization schedule generator
 */

import { levelPayment, simpleInterest, getDaysInYear, daysBetween } from './money';
import type { DayCount, Minor } from '../../shared/accounting-types';

export interface ScheduleInput {
  principalMinor: bigint;
  annualRateBps: number;
  termMonths: number;
  startDate: string; // first payment due date
  dayCount: DayCount;
  rounding: 'half_away_from_zero' | 'half_even';
  interestOnlyMonths: number;
  balloonMonths?: number;
  balloonAmountMinor?: bigint;
}

export interface ScheduleRow {
  periodNo: number;
  dueDate: string;
  principalMinor: bigint;
  interestMinor: bigint;
  totalPaymentMinor: bigint;
  balanceMinor: bigint;
}

function periodsPerYear(frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual'): number {
  switch (frequency) {
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semiannual': return 2;
    case 'annual': return 1;
    default: return 12;
  }
}

/**
 * Generate a level payment amortization schedule
 */
export function generateLevelSchedule(inp: ScheduleInput): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let remaining = inp.principalMinor;
  const r = (inp.annualRateBps / 10000) / periodsPerYear('monthly');
  const n = inp.termMonths;
  
  // Calculate payment amount
  let pmt: bigint;
  if (inp.balloonMonths && inp.balloonMonths < n) {
    // Balloon loan: calculate payment based on full amortization 
    // but with balloon payment at specified month
    pmt = levelPayment(inp.principalMinor, r, n, inp.rounding);
  } else {
    pmt = levelPayment(inp.principalMinor, r, n, inp.rounding);
  }
  
  let prevDate = addMonths(inp.startDate, -1);
  
  for (let k = 1; k <= n; k++) {
    const dueDate = addMonths(inp.startDate, k - 1);
    
    // Calculate interest based on remaining balance
    let interestMinor: bigint;
    if (inp.dayCount === 'ACT_365F' || inp.dayCount === 'ACT_360') {
      // Actual day count calculation
      const days = daysBetween(prevDate, dueDate, inp.dayCount);
      const baseDays = getDaysInYear(inp.dayCount);
      interestMinor = simpleInterest(remaining, inp.annualRateBps, days, baseDays);
    } else {
      // Simple monthly calculation
      interestMinor = BigInt(Math.round(Number(remaining) * r));
    }
    
    // Determine principal payment
    let principalMinor: bigint;
    let totalPaymentMinor: bigint;
    
    if (k <= inp.interestOnlyMonths) {
      // Interest-only period
      principalMinor = 0n;
      totalPaymentMinor = interestMinor;
    } else if (inp.balloonMonths && k === inp.balloonMonths) {
      // Balloon payment month
      principalMinor = inp.balloonAmountMinor || remaining;
      totalPaymentMinor = principalMinor + interestMinor;
    } else if (k === n) {
      // Last payment: pay off remaining balance
      principalMinor = remaining;
      totalPaymentMinor = principalMinor + interestMinor;
    } else {
      // Regular payment
      principalMinor = pmt - interestMinor;
      if (principalMinor > remaining) {
        principalMinor = remaining;
      }
      totalPaymentMinor = pmt;
    }
    
    // Update balance
    remaining = remaining - principalMinor;
    if (remaining < 0n) remaining = 0n;
    
    rows.push({
      periodNo: k,
      dueDate,
      principalMinor,
      interestMinor,
      totalPaymentMinor,
      balanceMinor: remaining
    });
    
    prevDate = dueDate;
    
    // Stop if loan is paid off (for balloon loans)
    if (remaining === 0n) break;
  }
  
  return rows;
}

/**
 * Generate an interest-only schedule
 */
export function generateInterestOnlySchedule(inp: ScheduleInput): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let remaining = inp.principalMinor;
  const r = (inp.annualRateBps / 10000) / periodsPerYear('monthly');
  const n = inp.termMonths;
  
  let prevDate = addMonths(inp.startDate, -1);
  
  for (let k = 1; k <= n; k++) {
    const dueDate = addMonths(inp.startDate, k - 1);
    
    // Calculate interest
    let interestMinor: bigint;
    if (inp.dayCount === 'ACT_365F' || inp.dayCount === 'ACT_360') {
      const days = daysBetween(prevDate, dueDate, inp.dayCount);
      const baseDays = getDaysInYear(inp.dayCount);
      interestMinor = simpleInterest(remaining, inp.annualRateBps, days, baseDays);
    } else {
      interestMinor = BigInt(Math.round(Number(remaining) * r));
    }
    
    // Determine if this is the last payment
    const principalMinor = k === n ? remaining : 0n;
    const totalPaymentMinor = interestMinor + principalMinor;
    
    // Update balance
    remaining = remaining - principalMinor;
    
    rows.push({
      periodNo: k,
      dueDate,
      principalMinor,
      interestMinor,
      totalPaymentMinor,
      balanceMinor: remaining
    });
    
    prevDate = dueDate;
  }
  
  return rows;
}

/**
 * Generate a custom schedule with specified payments
 */
export function generateCustomSchedule(
  principalMinor: bigint,
  annualRateBps: number,
  payments: Array<{ dueDate: string; paymentMinor: bigint }>,
  dayCount: DayCount
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let remaining = principalMinor;
  const r = (annualRateBps / 10000) / periodsPerYear('monthly');
  
  let prevDate = payments[0]?.dueDate 
    ? addMonths(payments[0].dueDate, -1)
    : new Date().toISOString().slice(0, 10);
  
  payments.forEach((payment, index) => {
    // Calculate interest
    let interestMinor: bigint;
    if (dayCount === 'ACT_365F' || dayCount === 'ACT_360') {
      const days = daysBetween(prevDate, payment.dueDate, dayCount);
      const baseDays = getDaysInYear(dayCount);
      interestMinor = simpleInterest(remaining, annualRateBps, days, baseDays);
    } else {
      interestMinor = BigInt(Math.round(Number(remaining) * r));
    }
    
    // Apply payment: interest first, then principal
    const principalMinor = payment.paymentMinor > interestMinor
      ? payment.paymentMinor - interestMinor
      : 0n;
    
    // Update balance
    remaining = remaining - principalMinor;
    if (remaining < 0n) remaining = 0n;
    
    rows.push({
      periodNo: index + 1,
      dueDate: payment.dueDate,
      principalMinor,
      interestMinor,
      totalPaymentMinor: payment.paymentMinor,
      balanceMinor: remaining
    });
    
    prevDate = payment.dueDate;
  });
  
  return rows;
}

/**
 * Add months to a date
 */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  
  // Handle month-end dates properly
  const originalDay = new Date(isoDate + 'T00:00:00Z').getUTCDate();
  if (d.getUTCDate() !== originalDay) {
    // We've rolled over to next month, go back to last day of target month
    d.setUTCDate(0);
  }
  
  return d.toISOString().slice(0, 10);
}

/**
 * Calculate next payment date based on frequency
 */
export function nextPaymentDate(
  lastDate: string,
  frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual'
): string {
  const monthsToAdd = frequency === 'monthly' ? 1
    : frequency === 'quarterly' ? 3
    : frequency === 'semiannual' ? 6
    : 12;
  
  return addMonths(lastDate, monthsToAdd);
}

/**
 * Check if a payment is late
 */
export function isPaymentLate(
  dueDate: string,
  graceDays: number,
  asOfDate: string = new Date().toISOString().slice(0, 10)
): boolean {
  const due = new Date(dueDate + 'T00:00:00Z');
  const asOf = new Date(asOfDate + 'T00:00:00Z');
  const grace = new Date(due);
  grace.setUTCDate(grace.getUTCDate() + graceDays);
  
  return asOf > grace;
}

/**
 * Calculate days late
 */
export function daysLate(
  dueDate: string,
  asOfDate: string = new Date().toISOString().slice(0, 10)
): number {
  const due = new Date(dueDate + 'T00:00:00Z');
  const asOf = new Date(asOfDate + 'T00:00:00Z');
  const diffMs = asOf.getTime() - due.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}