/**
 * Collections and Default Management Types
 */

export type UUID = string;
export type Minor = bigint;

export type DelinquencyBucket = 'current' | 'dpd_1_29' | 'dpd_30_59' | 'dpd_60_89' | 'dpd_90_plus';

export interface DelinquencyStatus {
  loan_id: number;
  as_of_date: string;
  earliest_unpaid_due_date?: string;
  unpaid_due_minor: Minor;
  dpd: number;
  bucket: DelinquencyBucket;
}

export interface DelinquencySnapshot extends DelinquencyStatus {
  snap_id: UUID;
  schedule_plan_id?: UUID;
  created_at: Date;
}

export interface LateFeeAssessment {
  fee_id: UUID;
  loan_id: number;
  period_due_date: string;
  amount_minor: Minor;
  template_id: number;
  event_id: UUID;
}

export type CollectionCaseStatus = 
  | 'normal' 
  | 'soft' 
  | 'hard' 
  | 'pre_foreclosure' 
  | 'foreclosure' 
  | 'bankruptcy' 
  | 'closed';

export interface CollectionCase {
  case_id: UUID;
  loan_id: number;
  status: CollectionCaseStatus;
  opened_at: Date;
  closed_at?: Date;
}

export type PlanType = 'repayment' | 'deferral' | 'forbearance' | 'trial_mod';
export type PlanStatus = 'draft' | 'active' | 'completed' | 'defaulted' | 'canceled';

export interface PlanHeader {
  plan_id: UUID;
  loan_id: number;
  type: PlanType;
  status: PlanStatus;
  starts_on: string;
  ends_on?: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface PlanInstallment {
  plan_id: UUID;
  installment_no: number;
  due_date: string;
  amount_minor: Minor;
}

export interface PlanProgress {
  plan_id: UUID;
  installment_no: number;
  due_date: string;
  paid_minor: Minor;
  last_payment_event?: UUID;
  status: 'pending' | 'partial' | 'paid' | 'missed';
}

export type ForeclosureMilestone = 
  | 'breach_letter_sent'
  | 'referral_to_attorney'
  | 'notice_of_default_recorded'
  | 'lis_pendens_filed'
  | 'sale_scheduled'
  | 'sale_postponed'
  | 'sale_completed'
  | 'reinstated'
  | 'redeemed'
  | 'eviction_started'
  | 'eviction_completed'
  | 'case_closed';

export interface ForeclosureCase {
  fc_id: UUID;
  loan_id: number;
  case_opened_at: Date;
  attorney_id?: UUID;
  status: 'open' | 'closed';
}

export interface ForeclosureEvent {
  fc_id: UUID;
  milestone: ForeclosureMilestone;
  occurred_at: Date;
  meta: Record<string, any>;
}

// Message types for RabbitMQ
export interface DelinquencyComputeRequest {
  loan_id: number;
  as_of_date: string;
  correlation_id: string;
}

export interface LateFeeAssessRequest {
  loan_id: number;
  due_date: string;
  correlation_id: string;
}

export interface PlanOrchestrationCommand {
  plan_id: UUID;
  command: 'activate' | 'complete' | 'default' | 'cancel';
  correlation_id: string;
}

export interface ForeclosureMilestoneCommand {
  fc_id: UUID;
  milestone: ForeclosureMilestone;
  meta?: Record<string, any>;
  correlation_id: string;
}