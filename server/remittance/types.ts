export interface InvestorContract {
  contract_id: string;
  investor_id: string;
  product_code: string;
  method: 'scheduled_p_i' | 'actual_cash' | 'scheduled_p_i_with_interest_shortfall';
  remittance_day: number;
  cutoff_day: number;
  custodial_bank_acct_id: string;
  servicer_fee_bps: number;
  late_fee_split_bps: number;
  created_at: Date;
}

export interface InvestorWaterfallRule {
  rule_id: string;
  contract_id: string;
  rank: number;
  bucket: 'interest' | 'principal' | 'late_fees' | 'escrow' | 'recoveries';
  cap_minor?: string;
  created_at: Date;
}

export type RemitStatus = 'open' | 'locked' | 'file_generated' | 'sent' | 'settled' | 'closed';

export interface RemittanceCycle {
  cycle_id: string;
  contract_id: string;
  period_start: Date;
  period_end: Date;
  status: RemitStatus;
  total_principal_minor: string;
  total_interest_minor: string;
  total_fees_minor: string;
  servicer_fee_minor: string;
  investor_due_minor: string;
  created_at: Date;
}

export interface RemittanceItem {
  item_id: string;
  cycle_id: string;
  loan_id?: string;
  principal_minor: string;
  interest_minor: string;
  fees_minor: string;
  investor_share_minor: string;
  servicer_fee_minor: string;
}

export interface RemittanceExport {
  export_id: string;
  cycle_id: string;
  format: 'csv' | 'xml';
  file_hash: string;
  bytes: Buffer;
  created_at: Date;
}

export interface WaterfallCalculation {
  contractId: string;
  totalCollected: string;
  buckets: {
    interest: string;
    principal: string;
    late_fees: string;
    escrow: string;
    recoveries: string;
  };
  servicerFee: string;
  investorDue: string;
}

export interface RemittanceReport {
  cycleId: string;
  contractId: string;
  investorName: string;
  periodStart: Date;
  periodEnd: Date;
  loanCount: number;
  beginningUPB: string;
  endingUPB: string;
  scheduledInterest: string;
  scheduledPrincipal: string;
  actualInterest: string;
  actualPrincipal: string;
  lateFees: string;
  servicerFee: string;
  investorRemittance: string;
}