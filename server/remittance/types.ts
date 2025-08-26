/**
 * Phase 7: Investor Remittance Types
 */

export interface WaterfallRule {
  rule_id: string;
  contract_id: string;
  rank: number;
  bucket: 'interest' | 'principal' | 'late_fees' | 'escrow' | 'recoveries';
  cap_minor: bigint | null;
}

export interface InvestorContract {
  contract_id: string;
  investor_id: number;
  product_code: string;
  method: 'scheduled_p_i' | 'actual_cash' | 'scheduled_p_i_with_interest_shortfall';
  remittance_day: number;
  cutoff_day: number;
  custodial_bank_acct_id: string;
  servicer_fee_bps: number;
  late_fee_split_bps: number;
}

export interface RemittanceCycle {
  cycle_id: string;
  contract_id: string;
  period_start: Date;
  period_end: Date;
  status: 'open' | 'locked' | 'file_generated' | 'sent' | 'settled' | 'closed';
  total_principal_minor: bigint;
  total_interest_minor: bigint;
  total_fees_minor: bigint;
  servicer_fee_minor: bigint;
  investor_due_minor: bigint;
  locked_at?: Date;
  settled_at?: Date;
}

export interface RemittanceItem {
  item_id: string;
  cycle_id: string;
  loan_id: number | null;
  principal_minor: bigint;
  interest_minor: bigint;
  fees_minor: bigint;
  investor_share_minor: bigint;
  servicer_fee_minor: bigint;
}

export interface LoanCollections {
  loan_id: number;
  principal_collected: bigint;
  interest_collected: bigint;
  late_fees_collected: bigint;
  escrow_collected: bigint;
  recoveries_collected: bigint;
}

export interface WaterfallAllocation {
  bucket: string;
  amount_allocated: bigint;
  servicer_fee: bigint;
  investor_share: bigint;
}

export interface RemittanceExportData {
  format: 'csv' | 'xml';
  file_content: string;
  file_hash: string;
  cycle_id: string;
}

export interface ReconciliationSnapshot {
  cycle_id: string;
  gl_principal_variance: bigint;
  gl_interest_variance: bigint;
  gl_fee_variance: bigint;
  reconciled_by: string;
}

// Event types
export interface RemittanceCycleCreatedEvent {
  cycle_id: string;
  contract_id: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface RemittanceFileGeneratedEvent {
  cycle_id: string;
  export_id: string;
  format: string;
  file_hash: string;
  created_at: string;
}

export interface RemittanceSettledEvent {
  cycle_id: string;
  total_principal: string;
  total_interest: string;
  total_fees: string;
  servicer_fee: string;
  investor_due: string;
  settled_at: string;
}