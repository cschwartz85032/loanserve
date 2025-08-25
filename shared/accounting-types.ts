/**
 * Accounting domain types
 * All money values are in minor units (cents) as bigint for precision
 */

export type Minor = bigint; // cents
export type Currency = 'USD' | 'EUR' | 'GBP';
export type UUID = string;

// Day count conventions for interest calculation
export type DayCount = 'ACT_365F' | 'ACT_360' | 'US_30_360' | 'EURO_30_360' | 'ACT_ACT';
export type RoundingMode = 'half_away_from_zero' | 'half_even';

// Loan status types
export type LoanStatus = 
  | 'active' 
  | 'matured' 
  | 'paid_off' 
  | 'defaulted' 
  | 'charged_off' 
  | 'in_modification' 
  | 'bankruptcy' 
  | 'foreclosure';

// Interest types
export type InterestType = 'fixed' | 'arm' | 'io_then_p_i' | 'interest_only';
export type CompoundingMethod = 'simple' | 'compound';

// Payment method types
export type PaymentMethod = 'ach' | 'card' | 'wire' | 'check' | 'cash' | 'other';

// Escrow types
export type EscrowType = 'tax' | 'hazard' | 'flood' | 'mip' | 'pmi' | 'hoa' | 'other';

// Fee codes
export type FeeCode = 'late' | 'nsf' | 'deferral' | 'extension' | 'other';

// GL account types for double-entry
export type GLAccount = 
  // Asset accounts
  | 'loan_principal'       // outstanding principal
  | 'interest_receivable'   // accrued but unpaid interest
  | 'cash'                  // cash/bank
  | 'suspense'              // unapplied/suspense
  | 'fees_receivable'       // assessed fees receivable
  // Liability accounts
  | 'escrow_liability'      // owed to payees
  | 'investor_liability'    // owed to investors
  // Income accounts (P&L)
  | 'interest_income'       // interest earned
  | 'fee_income'            // late/nsf/other fees
  // Expense accounts (P&L)
  | 'writeoff_expense'      // charge-offs
  | 'servicing_expense';    // servicing costs

// Waterfall bucket names for payment allocation
export type BucketName = 
  | 'fees_due' 
  | 'interest_past_due' 
  | 'interest_current' 
  | 'principal' 
  | 'escrow' 
  | 'future';

// Product policy configuration
export interface ProductPolicy {
  productCode: string;
  currency: Currency;
  rounding: RoundingMode;
  defaultDayCount: DayCount;
  defaultCompounding: CompoundingMethod;
  minPaymentMinor: Minor;
  paymentWaterfall: readonly BucketName[];
}

// Loan accounting configuration
export interface LoanAccountingConfig {
  loanId: number;
  productCode: string;
  status: LoanStatus;
  lienPosition: number;
  jurisdiction: string;
  investorId?: UUID;
  servicingType: string;
  originationDate: string; // ISO date
  originalPrincipalMinor: Minor;
  currency: Currency;
}

// Loan terms (effective-dated)
export interface LoanTerms {
  termsId: UUID;
  loanId: number;
  effectiveFrom: string; // ISO date
  effectiveTo?: string;
  interestType: InterestType;
  nominalRateBps: number;
  indexName?: string;
  indexMarginBps?: number;
  rateCapUpBps?: number;
  rateCapDownBps?: number;
  compounding: CompoundingMethod;
  dayCount: DayCount;
  firstPaymentDate: string; // ISO date
  termMonths: number;
  scheduledPaymentMinor?: Minor;
  interestOnlyMonths?: number;
}

// Schedule plan and rows
export interface SchedulePlan {
  planId: UUID;
  loanId: number;
  termsId: UUID;
  version: number;
  generatedAt: string;
  active: boolean;
}

export interface ScheduleRow {
  planId: UUID;
  periodNo: number;
  dueDate: string;
  scheduledPrincipalMinor: Minor;
  scheduledInterestMinor: Minor;
  escrowTargetMinor: Minor;
  feeTargetMinor: Minor;
}

// Ledger event and entries
export interface LedgerEvent {
  eventId: UUID;
  loanId: number;
  effectiveDate: string;
  schema: string;
  correlationId: string;
  createdAt: string;
  finalizedAt?: string;
}

export interface LedgerEntry {
  entryId: UUID;
  eventId: UUID;
  loanId: number;
  account: GLAccount;
  debitMinor: Minor;
  creditMinor: Minor;
  currency: Currency;
  memo?: string;
  createdAt: string;
}

// Payment allocation
export interface Outstanding {
  feesDueMinor: Minor;
  interestPastDueMinor: Minor;
  interestCurrentMinor: Minor;
  principalMinor: Minor;
  escrowMinor: Minor;
}

export interface Allocation {
  bucket: BucketName;
  appliedMinor: Minor;
}

// Loan balances
export interface LoanBalances {
  principalMinor: Minor;
  interestReceivableMinor: Minor;
  escrowLiabilityMinor: Minor;
  feesReceivableMinor: Minor;
  cashMinor: Minor;
}

// Fee policy
export interface FeePolicy {
  policyId: UUID;
  productCode: string;
  jurisdiction: string;
  effectiveFrom: string;
  effectiveTo?: string;
  lateFeeType: 'amount' | 'percent';
  lateFeeAmountMinor: Minor;
  lateFeePercentBps: number;
  lateFeeGraceDays: number;
  nsfFeeMinor: Minor;
  deferralFeeMinor: Minor;
}

// Helper functions for working with minor units
export function toMinor(amount: number | string): Minor {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return BigInt(Math.round(num * 100));
}

export function fromMinor(minor: Minor): number {
  return Number(minor) / 100;
}

export function formatMinor(minor: Minor): string {
  return (Number(minor) / 100).toFixed(2);
}

// Type guards
export function isValidGLAccount(account: string): account is GLAccount {
  const validAccounts: GLAccount[] = [
    'loan_principal', 'interest_receivable', 'cash', 'suspense', 'fees_receivable',
    'escrow_liability', 'investor_liability', 'interest_income', 'fee_income',
    'writeoff_expense', 'servicing_expense'
  ];
  return validAccounts.includes(account as GLAccount);
}

export function isValidBucketName(bucket: string): bucket is BucketName {
  const validBuckets: BucketName[] = [
    'fees_due', 'interest_past_due', 'interest_current', 'principal', 'escrow', 'future'
  ];
  return validBuckets.includes(bucket as BucketName);
}