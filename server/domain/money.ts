/**
 * Money math utilities for deterministic, integer-safe financial calculations
 * All values in minor units (cents) as bigint
 */

import type { RoundingMode } from '../../shared/accounting-types';

/**
 * Round a minor unit value (already in cents)
 */
export function roundMinor(x: bigint, mode: RoundingMode): bigint {
  return x; // already minor units; no rounding needed for integer cents
}

/**
 * Convert basis points to decimal rate per period
 * @param annualBps Annual rate in basis points (e.g., 550 for 5.5%)
 * @param periodsPerYear Number of periods per year (e.g., 12 for monthly)
 * @returns Decimal rate per period (e.g., 0.00458333 for 5.5% annual monthly)
 */
export function bpsToRatePerPeriod(annualBps: number, periodsPerYear: number): number {
  return (annualBps / 10000) / periodsPerYear;
}

/**
 * Calculate level payment amount for fixed loans
 * @param pvMinor Present value (principal) in minor units
 * @param r Periodic decimal rate (e.g., 0.005 for 0.5% per month)
 * @param n Number of periods
 * @param rounding Rounding mode for final payment amount
 * @returns Payment amount in minor units
 */
export function levelPayment(
  pvMinor: bigint, 
  r: number, 
  n: number, 
  rounding: RoundingMode
): bigint {
  if (n <= 0) throw new Error('Number of periods must be > 0');
  
  if (r === 0) {
    // Simple division for 0% interest
    const q = Number(pvMinor) / n;
    return BigInt(Math.round(q));
  }
  
  // Standard amortization formula: PMT = P * r / (1 - (1 + r)^-n)
  const pv = Number(pvMinor);
  const pmt = (r * pv) / (1 - Math.pow(1 + r, -n));
  
  // Round to nearest cent
  const rounded = rounding === 'half_even'
    ? Math.round(pmt) // JavaScript Math.round is half-away-from-zero
    : Math.round(pmt);
    
  return BigInt(rounded);
}

/**
 * Calculate per-diem interest
 * @param principalMinor Principal amount in minor units
 * @param nominalRateBps Annual nominal rate in basis points
 * @param baseDays Number of days in year (360, 365, or actual)
 * @returns Daily interest amount in minor units
 */
export function perDiem(
  principalMinor: bigint, 
  nominalRateBps: number, 
  baseDays: number
): bigint {
  const rate = (nominalRateBps / 10000) / baseDays;
  const amt = Number(principalMinor) * rate;
  return BigInt(Math.round(amt));
}

/**
 * Calculate simple interest for a period
 * @param principalMinor Principal amount in minor units
 * @param annualRateBps Annual rate in basis points
 * @param days Number of days in period
 * @param baseDays Days in year for calculation
 * @returns Interest amount in minor units
 */
export function simpleInterest(
  principalMinor: bigint,
  annualRateBps: number,
  days: number,
  baseDays: number
): bigint {
  const rate = (annualRateBps / 10000) * (days / baseDays);
  const interest = Number(principalMinor) * rate;
  return BigInt(Math.round(interest));
}

/**
 * Calculate remaining balance after n payments
 * @param pvMinor Original principal in minor units
 * @param paymentMinor Payment amount in minor units
 * @param r Periodic interest rate as decimal
 * @param n Number of payments made
 * @returns Remaining balance in minor units
 */
export function remainingBalance(
  pvMinor: bigint,
  paymentMinor: bigint,
  r: number,
  n: number
): bigint {
  if (r === 0) {
    // Simple case: no interest
    const remaining = Number(pvMinor) - (Number(paymentMinor) * n);
    return remaining > 0 ? BigInt(Math.round(remaining)) : 0n;
  }
  
  // Formula: B = P(1+r)^n - PMT((1+r)^n - 1)/r
  const pv = Number(pvMinor);
  const pmt = Number(paymentMinor);
  const factor = Math.pow(1 + r, n);
  const balance = (pv * factor) - (pmt * (factor - 1) / r);
  
  return balance > 0 ? BigInt(Math.round(balance)) : 0n;
}

/**
 * Split payment into principal and interest components
 * @param paymentMinor Total payment amount in minor units
 * @param balanceMinor Current balance in minor units
 * @param r Periodic interest rate as decimal
 * @returns Object with interest and principal portions
 */
export function splitPayment(
  paymentMinor: bigint,
  balanceMinor: bigint,
  r: number
): { interestMinor: bigint; principalMinor: bigint } {
  const interestMinor = BigInt(Math.round(Number(balanceMinor) * r));
  const principalMinor = paymentMinor - interestMinor;
  
  return {
    interestMinor: interestMinor > 0n ? interestMinor : 0n,
    principalMinor: principalMinor > 0n ? principalMinor : 0n
  };
}

/**
 * Calculate late fee based on policy
 * @param paymentMinor Payment amount in minor units
 * @param lateFeeType 'amount' or 'percent'
 * @param lateFeeAmountMinor Fixed late fee amount in minor units
 * @param lateFeePercentBps Late fee as percentage in basis points
 * @returns Late fee amount in minor units
 */
export function calculateLateFee(
  paymentMinor: bigint,
  lateFeeType: 'amount' | 'percent',
  lateFeeAmountMinor: bigint,
  lateFeePercentBps: number
): bigint {
  if (lateFeeType === 'amount') {
    return lateFeeAmountMinor;
  } else {
    const fee = Number(paymentMinor) * (lateFeePercentBps / 10000);
    return BigInt(Math.round(fee));
  }
}

/**
 * Convert annual rate to monthly rate
 * @param annualRateBps Annual rate in basis points
 * @returns Monthly rate as decimal
 */
export function annualToMonthlyRate(annualRateBps: number): number {
  return (annualRateBps / 10000) / 12;
}

/**
 * Get number of days in year based on convention
 * @param convention Day count convention
 * @param year Year for ACT_ACT calculation
 * @returns Number of days
 */
export function getDaysInYear(
  convention: 'ACT_365F' | 'ACT_360' | 'US_30_360' | 'EURO_30_360' | 'ACT_ACT',
  year?: number
): number {
  switch (convention) {
    case 'ACT_360':
    case 'US_30_360':
    case 'EURO_30_360':
      return 360;
    case 'ACT_365F':
      return 365;
    case 'ACT_ACT':
      if (!year) throw new Error('Year required for ACT_ACT convention');
      // Check for leap year
      return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 366 : 365;
    default:
      return 365;
  }
}

/**
 * Calculate days between dates based on convention
 * @param startDate Start date string (ISO format)
 * @param endDate End date string (ISO format)
 * @param convention Day count convention
 * @returns Number of days
 */
export function daysBetween(
  startDate: string,
  endDate: string,
  convention: 'ACT_365F' | 'ACT_360' | 'US_30_360' | 'EURO_30_360' | 'ACT_ACT'
): number {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  
  if (convention === 'US_30_360' || convention === 'EURO_30_360') {
    // 30/360 convention: each month = 30 days
    const y1 = start.getUTCFullYear();
    const m1 = start.getUTCMonth() + 1;
    const d1 = Math.min(start.getUTCDate(), 30);
    
    const y2 = end.getUTCFullYear();
    const m2 = end.getUTCMonth() + 1;
    const d2 = Math.min(end.getUTCDate(), 30);
    
    return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
  } else {
    // Actual day count
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}