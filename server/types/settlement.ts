/**
 * Phase 3: Settlement & Reconciliation Type Definitions
 * Bank-agnostic canonical data contracts
 */

// Rails and transaction types
export type Rail = 'ach' | 'wire' | 'check' | 'card' | 'rtp';
export type ExtType = 'credit' | 'debit' | 'return' | 'fee';
export type Direction = 'inbound' | 'outbound' | 'refund' | 'investor_payout';

// Canonical external transaction from bank
export interface BankTx {
  extTxId: string;            // unique per artifact set
  method: Rail;
  type: ExtType;
  amountCents: number;
  currency: 'USD';
  postedAt: string;           // ISO 8601 UTC
  bankAccountToken: string;   // tokenized identifier
  extReference?: string;      // ACH trace, IMAD/OMAD, MT103 ref, check number
  counterparty?: string;
  memo?: string;
  fileId?: string;            // bank_files.file_id if known
  rawMeta?: Record<string, unknown>;
}

// Expected settlement for tracking
export interface ExpectedSettlement {
  expectId?: number;
  paymentId: string;
  loanId: string;
  method: Rail;
  direction: Direction;
  amountCents: number;
  currency: 'USD';
  initiatedAt: string;
  effectiveDate: string;
  extRefHint?: string;
  state: 'pending' | 'settled' | 'returned' | 'partial' | 'failed';
}

// Reconciliation match result
export interface ReconciliationMatch {
  matchId?: number;
  extTxId: string;
  expectId: number;
  score: number;              // 0.00 to 1.00
  matchedAt: string;
  strategy: 'deterministic_ref' | 'amount_date' | 'fuzzy_window' | 'manual';
  status: 'matched' | 'auto_confirmed' | 'manual_pending' | 'rejected';
  reviewer?: string;
}

// Reconciliation exception
export interface ReconciliationException {
  excId?: number;
  kind: 'unmatched_credit' | 'amount_mismatch' | 'duplicate' | 'stale';
  extTxId?: string;
  expectId?: number;
  openedAt: string;
  state: 'open' | 'in_review' | 'resolved' | 'suppressed';
  resolution?: string;
  resolvedAt?: string;
}

// Settlement window configuration
export interface SettlementWindow {
  rail: Rail;
  minHours: number;
  maxHours: number;
  cutoffTime: string;         // HH:MM:SS in UTC
  businessDays: boolean;
  retryConfig?: {
    maxRetries: number;
    backoff: 'none' | 'linear' | 'geometric';
  };
}

// ACH return codes
export const ACH_RETURN_CODES = {
  // Retryable codes
  R01: { retryable: true, description: 'Insufficient Funds' },
  R09: { retryable: true, description: 'Uncollected Funds' },
  
  // Non-retryable codes
  R02: { retryable: false, description: 'Account Closed' },
  R03: { retryable: false, description: 'No Account' },
  R04: { retryable: false, description: 'Invalid Account Number' },
  R07: { retryable: false, description: 'Authorization Revoked' },
  R08: { retryable: false, description: 'Payment Stopped' },
  R10: { retryable: false, description: 'Customer Advises Not Authorized' },
  R29: { retryable: false, description: 'Corporate Customer Advises Not Authorized' },
} as const;

// Bank file formats
export type BankFileFormat = 'BAI2' | 'MT940' | 'NACHA_RET' | 'CAMT.053';

// Bank file record
export interface BankFile {
  fileId?: number;
  sourceSystem: string;
  format: BankFileFormat;
  receivedAt: string;
  businessDate: string;
  sha256: string;              // hex string
  rowCount: number;
  status: 'ingested' | 'parsed' | 'reconciled' | 'failed';
  errorReason?: string;
}

// ACH batch submission
export interface AchBatch {
  batchId?: string;
  entries: Array<{
    amount: number;
    accountNumber: string;
    routingNumber: string;
    accountType: 'checking' | 'savings';
    name: string;
    addenda?: string;
    traceNumber?: string;
  }>;
  effectiveDate: string;
  serviceClass: 'debit' | 'credit' | 'mixed';
  companyName: string;
  companyId: string;
  entryDescription: string;
}

// Wire instruction
export interface WireInstruction {
  amount: number;
  currency: 'USD';
  beneficiaryName: string;
  beneficiaryAccount: string;
  beneficiaryBank: {
    name: string;
    routingNumber?: string;
    swiftCode?: string;
    address?: string;
  };
  originatorName: string;
  originatorAccount: string;
  reference?: string;
  purposeCode?: string;
  imad?: string;               // assigned after submission
  omad?: string;               // assigned after submission
}