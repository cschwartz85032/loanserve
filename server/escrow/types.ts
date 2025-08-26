/**
 * Phase 3: Escrow Subsystem Domain Types
 * 
 * Core type definitions for escrow management including:
 * - Policy configuration (jurisdiction-based rules)
 * - Forecasting (12-month rolling projections)
 * - Disbursements (scheduled and posted payments)
 * - Analysis (annual escrow calculations)
 */

import type { UUID, Minor } from '../../shared/accounting-types';

// Message envelope for RabbitMQ
export interface MessageEnvelope<T> {
  message_id?: string;
  timestamp?: string;
  routing_key?: string;
  payload: T;
  headers?: Record<string, any>;
}

// Enum types matching database
export type JurisdictionCode = 
  | 'US_FEDERAL'
  | 'US_AL' | 'US_AK' | 'US_AZ' | 'US_AR' | 'US_CA' | 'US_CO' | 'US_CT' | 'US_DE' | 'US_FL' | 'US_GA'
  | 'US_HI' | 'US_ID' | 'US_IL' | 'US_IN' | 'US_IA' | 'US_KS' | 'US_KY' | 'US_LA' | 'US_ME' | 'US_MD'
  | 'US_MA' | 'US_MI' | 'US_MN' | 'US_MS' | 'US_MO' | 'US_MT' | 'US_NE' | 'US_NV' | 'US_NH' | 'US_NJ'
  | 'US_NM' | 'US_NY' | 'US_NC' | 'US_ND' | 'US_OH' | 'US_OK' | 'US_OR' | 'US_PA' | 'US_RI' | 'US_SC'
  | 'US_SD' | 'US_TN' | 'US_TX' | 'US_UT' | 'US_VT' | 'US_VA' | 'US_WA' | 'US_WV' | 'US_WI' | 'US_WY'
  | 'US_DC' | 'US_PR' | 'US_VI' | 'US_GU' | 'US_AS' | 'US_MP';

export type RoundingMode = 'half_away_from_zero' | 'half_even';

export type DisbursementStatusV2 = 'scheduled' | 'posted' | 'canceled';

export type GLAccountEscrow = 
  | 'escrow_liability'
  | 'escrow_advances'
  | 'escrow_refund_payable';

// Product configuration
export interface ProductPolicy {
  product_code: string;
  product_name: string;
  product_description?: string;
  created_at: Date;
}

// Escrow policy (product x jurisdiction rules)
export interface EscrowPolicy {
  policy_id: UUID;
  product_code: string;
  jurisdiction: JurisdictionCode;
  cushion_months: number;               // 0-2 months allowed
  shortage_amortization_months: number; // 1-24 months
  deficiency_amortization_months: number; // 1-24 months
  surplus_refund_threshold_minor: bigint; // Default $50.00
  collect_surplus_as_reduction: boolean;  // vs refund to borrower
  pay_when_insufficient: boolean;         // advance if balance insufficient
  rounding: RoundingMode;
  created_at: Date;
}

// 12-month rolling forecast
export interface EscrowForecast {
  forecast_id: UUID;
  loan_id: number;
  escrow_id: number;
  due_date: string;  // ISO date
  amount_minor: bigint;
  created_at: Date;
}

// Scheduled and posted disbursements
export interface EscrowDisbursement {
  disb_id: UUID;
  loan_id: number;
  escrow_id: number;
  due_date: string;  // ISO date
  amount_minor: bigint;
  status: DisbursementStatusV2;
  event_id?: UUID;  // ledger event when posted
  scheduled_at: Date;
  posted_at?: Date;
}

// Annual escrow analysis
export interface EscrowAnalysis {
  analysis_id: UUID;
  loan_id: number;
  as_of_date: string;  // ISO date
  period_start: string;  // ISO date
  period_end: string;    // ISO date (+12 months)
  annual_expected_minor: bigint;
  cushion_target_minor: bigint;
  current_balance_minor: bigint;
  shortage_minor: bigint;
  deficiency_minor: bigint;
  surplus_minor: bigint;
  new_monthly_target_minor: bigint;
  deficiency_recovery_monthly_minor: bigint;
  version: number;
  created_at: Date;
}

// Analysis line item (per escrow item)
export interface EscrowAnalysisItem {
  analysis_id: UUID;
  escrow_id: number;
  forecast_due_date: string;  // ISO date
  forecast_amount_minor: bigint;
}

// Statement metadata
export interface EscrowStatement {
  analysis_id: UUID;
  document_hash: string;
  generated_at: Date;
}

// RabbitMQ message types
export interface EscrowForecastRequest {
  loan_id: number;
  as_of_date: string;
  correlation_id: string;
}

export interface EscrowForecastResponse {
  loan_id: number;
  forecasts: Array<{
    escrow_id: number;
    due_date: string;
    amount_minor: string;  // JSON doesn't support bigint
  }>;
  correlation_id: string;
}

export interface EscrowDisbursementScheduleRequest {
  loan_id: number;
  effective_date: string;
  correlation_id: string;
}

export interface EscrowDisbursementScheduleResponse {
  loan_id: number;
  scheduled: Array<{
    disb_id: string;
    escrow_id: number;
    due_date: string;
    amount_minor: string;
  }>;
  correlation_id: string;
}

export interface EscrowAnalysisRequest {
  loan_id: number;
  as_of_date: string;
  generate_statement: boolean;
  correlation_id: string;
}

export interface EscrowAnalysisResponse {
  analysis_id: string;
  loan_id: number;
  shortage_minor: string;
  deficiency_minor: string;
  surplus_minor: string;
  new_monthly_target_minor: string;
  deficiency_recovery_monthly_minor: string;
  statement_generated: boolean;
  correlation_id: string;
}

// Utility functions for escrow calculations
export function calculateCushion(
  monthlyAmount: bigint,
  cushionMonths: number
): bigint {
  return monthlyAmount * BigInt(cushionMonths);
}

export function calculateMonthlyTarget(
  annualAmount: bigint,
  cushionAmount: bigint
): bigint {
  // (Annual + Cushion) / 12
  const total = annualAmount + cushionAmount;
  return total / BigInt(12);
}

export function determineEscrowResult(
  projectedLow: bigint,
  cushionTarget: bigint,
  currentBalance: bigint
): { shortage: bigint; deficiency: bigint; surplus: bigint } {
  // If projected low is negative, that's a deficiency
  if (projectedLow < BigInt(0)) {
    const deficiency = -projectedLow;
    const shortage = cushionTarget - currentBalance + deficiency;
    return { shortage, deficiency, surplus: BigInt(0) };
  }
  
  // If projected low is less than cushion, that's a shortage
  if (projectedLow < cushionTarget) {
    const shortage = cushionTarget - projectedLow;
    return { shortage, deficiency: BigInt(0), surplus: BigInt(0) };
  }
  
  // Otherwise we have a surplus
  const surplus = projectedLow - cushionTarget;
  return { shortage: BigInt(0), deficiency: BigInt(0), surplus };
}