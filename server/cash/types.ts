/**
 * Cash Management and Bank Reconciliation Types
 */

export type UUID = string;
export type Minor = bigint;

// Bank Account Types
export type BankAccountType = 'operating' | 'custodial_p_i' | 'escrow' | 'fees';

export interface BankAccount {
  bank_acct_id: UUID;
  name: string;
  bank_id: string;
  account_number_mask: string;
  currency: string;
  type: BankAccountType;
  gl_cash_account: string;
  active: boolean;
  created_at: Date;
}

// ACH Types
export type AchServiceClass = '200' | '220' | '225';
export type AchTxnCode = '22' | '27' | '32' | '37';
export type AchBatchStatus = 'open' | 'sealed' | 'filed' | 'settled' | 'failed';

export interface AchBatch {
  ach_batch_id: UUID;
  bank_acct_id: UUID;
  service_class: AchServiceClass;
  company_id: string;
  company_name: string;
  effective_entry_date: string;
  created_by: string;
  total_entries: number;
  total_amount_minor: Minor;
  status: AchBatchStatus;
  created_at: Date;
}

export interface AchEntry {
  ach_entry_id: UUID;
  ach_batch_id: UUID;
  loan_id?: number;
  txn_code: AchTxnCode;
  rdfi_routing: string;
  dda_account_mask: string;
  amount_minor: Minor;
  trace_number?: string;
  addenda?: string;
  idempotency_key: string;
  created_at: Date;
}

export interface AchReturn {
  ach_return_id: UUID;
  ach_entry_id: UUID;
  return_code: string;
  return_date: string;
  amount_minor: Minor;
  addenda?: string;
  processed_at?: Date;
  created_at: Date;
}

// Bank Statement Types
export type BankStmtFormat = 'bai2' | 'camt.053';
export type BankTxnType = 'credit' | 'debit' | 'fee' | 'return';

export interface BankStatementFile {
  stmt_file_id: UUID;
  bank_acct_id: UUID;
  format: BankStmtFormat;
  as_of_date: string;
  raw_bytes: Buffer;
  file_hash: string;
  created_at: Date;
}

export interface BankTxn {
  bank_txn_id: UUID;
  stmt_file_id: UUID;
  bank_acct_id: UUID;
  posted_date: string;
  value_date?: string;
  amount_minor: Minor;
  type: BankTxnType;
  bank_ref?: string;
  description?: string;
  matched: boolean;
  matched_event_id?: UUID;
  created_at: Date;
}

// Reconciliation Types
export interface CashMatchCandidate {
  candidate_id: UUID;
  bank_txn_id: UUID;
  event_id?: UUID;
  score: number;
  reason: string;
  created_at: Date;
}

export type ReconStatus = 'new' | 'investigating' | 'resolved' | 'written_off';

export interface ReconException {
  recon_id: UUID;
  bank_txn_id: UUID;
  variance_minor: Minor;
  status: ReconStatus;
  assigned_to?: string;
  note?: string;
  created_at: Date;
}

// Service Interfaces
export interface AchFileRequest {
  achBatchId: string;
}

export interface AchReturnNormalized {
  traceNumber: string;
  returnCode: string;
  returnDate: string;
  amountMinor: Minor;
  addenda?: string;
}

export interface CanonicalBankTxn {
  bankAcctId: string;
  postedDate: string;
  valueDate?: string;
  amountMinor: Minor;
  type: BankTxnType;
  bankRef?: string;
  description?: string;
}

// NACHA File Structure
export interface NachaFileHeader {
  recordType: '1';
  priorityCode: string;
  immediateDestination: string;
  immediateOrigin: string;
  fileCreationDate: string;
  fileCreationTime: string;
  fileIdModifier: string;
  recordSize: string;
  blockingFactor: string;
  formatCode: string;
  immediateDestinationName: string;
  immediateOriginName: string;
  referenceCode: string;
}

export interface NachaBatchHeader {
  recordType: '5';
  serviceClassCode: string;
  companyName: string;
  companyDiscretionaryData: string;
  companyId: string;
  standardEntryClass: string;
  companyEntryDescription: string;
  companyDescriptiveDate: string;
  effectiveEntryDate: string;
  settlementDate: string;
  originatorStatusCode: string;
  originatingDfiId: string;
  batchNumber: string;
}

export interface NachaEntryDetail {
  recordType: '6';
  transactionCode: string;
  receivingDfiId: string;
  checkDigit: string;
  dfiAccountNumber: string;
  amount: string;
  individualIdNumber: string;
  individualName: string;
  discretionaryData: string;
  addendaRecordIndicator: string;
  traceNumber: string;
}