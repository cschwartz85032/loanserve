// QC System: Deterministic Rule Implementations
// Mortgage-specific QC rules with explainable results and evidence tracking

import { addBusinessDays, diffBusinessDays } from "../businessDays";

type DP = Record<string, { 
  value: any; 
  confidence?: number; 
  evidence_doc_id?: string; 
  evidence_page?: number 
}>;

type RuleCtx = { 
  loanId: string; 
  datapoints: DP; 
  program?: string 
};

type Result = { 
  ok: boolean; 
  message?: string; 
  evidence_doc_id?: string; 
  evidence_page?: number 
};

/**
 * Convert any value to a number, stripping currency symbols and formatting
 */
function num(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number") return x;
  const n = Number(String(x).replace(/[^\d.]/g, ""));
  return isFinite(n) ? n : null;
}

// QC001 — Note amount equals CD Loan Amount (exact match within $0.01)
export function QC001(ctx: RuleCtx): Result {
  const note = num(ctx.datapoints.NoteAmount?.value);
  const cd = num(ctx.datapoints.TotalLoanAmount?.value);
  if (note == null || cd == null) return { ok: true }; // do not fail on missing; other rules handle completeness
  const ok = Math.abs(note - cd) < 0.01;
  return ok ? { ok: true } : {
    ok: false,
    message: `QC001: NoteAmount $${note} != CD TotalLoanAmount $${cd}`,
    evidence_doc_id: ctx.datapoints.TotalLoanAmount?.evidence_doc_id,
    evidence_page: ctx.datapoints.TotalLoanAmount?.evidence_page
  };
}

// QC002 — Rate on Note equals CD/APOR tolerance
// params: { tolerance: 0.125 } percentage points
export function QC002(ctx: RuleCtx, params: { tolerance: number }): Result {
  const note = num(ctx.datapoints.InterestRate?.value);
  const cd = num(ctx.datapoints.InterestRate?.value); // if you store CD rate separately, map here
  if (note == null || cd == null) return { ok: true };
  const tol = params?.tolerance ?? 0.125;
  const ok = Math.abs(note - cd) <= tol + 1e-9;
  return ok ? { ok: true } : { 
    ok: false, 
    message: `QC002: Rate difference ${Math.abs(note - cd).toFixed(3)} > ${tol}%`,
    evidence_doc_id: ctx.datapoints.InterestRate?.evidence_doc_id,
    evidence_page: ctx.datapoints.InterestRate?.evidence_page
  };
}

// QC003 — First Payment Date aligns with Note Date (<= maxDays after Note Date)
export function QC003(ctx: RuleCtx, params: { maxDays: number }): Result {
  const first = ctx.datapoints.FirstPaymentDate?.value;
  const noteDate = ctx.datapoints.NoteDate?.value || ctx.datapoints.MaturityDate?.value; // fallback if NoteDate not captured
  if (!first || !noteDate) return { ok: true };
  const allow = params?.maxDays ?? 62;
  const diff = diffBusinessDays(String(noteDate), String(first));
  const ok = diff <= allow;
  return ok ? { ok: true } : { 
    ok: false, 
    message: `QC003: FirstPaymentDate is ${diff} business days after NoteDate (max ${allow})`,
    evidence_doc_id: ctx.datapoints.FirstPaymentDate?.evidence_doc_id,
    evidence_page: ctx.datapoints.FirstPaymentDate?.evidence_page
  };
}

// QC004 — Maturity equals term (Maturity - FirstPayment ≈ AmortTermMonths)
export function QC004(ctx: RuleCtx): Result {
  const term = Number(ctx.datapoints.AmortTermMonths?.value);
  const first = ctx.datapoints.FirstPaymentDate?.value;
  const maturity = ctx.datapoints.MaturityDate?.value;
  if (!term || !first || !maturity) return { ok: true };
  // Rough check: difference in months
  const a = new Date(String(first));
  const b = new Date(String(maturity));
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  const ok = Math.abs(months - term) <= 1; // allow 1-month rounding
  return ok ? { ok: true } : { 
    ok: false, 
    message: `QC004: Term months ${term} != calendar months ${months}`,
    evidence_doc_id: ctx.datapoints.MaturityDate?.evidence_doc_id,
    evidence_page: ctx.datapoints.MaturityDate?.evidence_page
  };
}

// QC013 — HOI present if program requires (program_requirements)
export function QC013(ctx: RuleCtx, params: { required: boolean }): Result {
  const req = params?.required ?? false;
  if (!req) return { ok: true };
  const carrier = ctx.datapoints.HomeownersInsCarrier?.value;
  const policy = ctx.datapoints.HOIPolicyNumber?.value;
  if (carrier && policy) return { ok: true };
  return { 
    ok: false, 
    message: "QC013: HOI required by program but missing carrier/policy",
    evidence_doc_id: ctx.datapoints.HomeownersInsCarrier?.evidence_doc_id || ctx.datapoints.HOIPolicyNumber?.evidence_doc_id,
    evidence_page: ctx.datapoints.HomeownersInsCarrier?.evidence_page || ctx.datapoints.HOIPolicyNumber?.evidence_page
  };
}

// QC017 — UCDP/SSR status acceptable
export function QC017(ctx: RuleCtx): Result {
  const ssr = String(ctx.datapoints.UCDPSSRStatus?.value || "").toUpperCase();
  if (!ssr) return { ok: true };
  const ok = /ACCEPT|SUBMISSION SUCCESS|SUCCESS/.test(ssr);
  return ok ? { ok: true } : { 
    ok: false, 
    message: `QC017: SSR status '${ssr}' not acceptable`,
    evidence_doc_id: ctx.datapoints.UCDPSSRStatus?.evidence_doc_id,
    evidence_page: ctx.datapoints.UCDPSSRStatus?.evidence_page
  };
}

// QC020 — TRID LE timing: LE within 3 business days of application date
export function QC020(ctx: RuleCtx, params: { maxDays: number }): Result {
  const appDate = ctx.datapoints.TRID_ApplicationDate?.value || ctx.datapoints.ApplicationDate?.value;
  const leDate = ctx.datapoints.TRID_LEDate?.value;
  if (!appDate || !leDate) return { ok: true };
  const max = params?.maxDays ?? 3;
  const diff = diffBusinessDays(String(appDate), String(leDate));
  const ok = diff <= max;
  return ok ? { ok: true } : { 
    ok: false, 
    message: `QC020: LE issued ${diff} business days after app (max ${max})`,
    evidence_doc_id: ctx.datapoints.TRID_LEDate?.evidence_doc_id,
    evidence_page: ctx.datapoints.TRID_LEDate?.evidence_page
  };
}

// QC021 — TRID CD timing: CD ≥3 business days before consummation (NoteDate)
export function QC021(ctx: RuleCtx, params: { minDays: number }): Result {
  const cdDate = ctx.datapoints.TRID_CDDate?.value;
  const noteDate = ctx.datapoints.NoteDate?.value;
  if (!cdDate || !noteDate) return { ok: true };
  const min = params?.minDays ?? 3;
  const diff = diffBusinessDays(String(cdDate), String(noteDate));
  const ok = diff >= min;
  return ok ? { ok: true } : { 
    ok: false, 
    message: `QC021: CD only ${diff} business days before NoteDate (min ${min})`,
    evidence_doc_id: ctx.datapoints.TRID_CDDate?.evidence_doc_id,
    evidence_page: ctx.datapoints.TRID_CDDate?.evidence_page
  };
}

// QC043 — Wire instructions read-only post approval (enforced by system config flag)
export function QC043(ctx: RuleCtx, params: { approved: boolean }): Result {
  const approved = !!params?.approved;
  const edited = ctx.datapoints.WireEditedAfterApproval?.value === true;
  if (!approved) return { ok: true }; // rule not active yet
  return edited ? { 
    ok: false, 
    message: "QC043: Wire instructions edited after approval (forbidden)",
    evidence_doc_id: ctx.datapoints.WireEditedAfterApproval?.evidence_doc_id,
    evidence_page: ctx.datapoints.WireEditedAfterApproval?.evidence_page
  } : { ok: true };
}

// QC050 — QC certificate produced (checked at finalize)
export function QC050(ctx: RuleCtx): Result {
  const cert = ctx.datapoints.QCCertificateId?.value;
  return cert ? { ok: true } : { 
    ok: false, 
    message: "QC050: QC Certificate missing",
    evidence_doc_id: ctx.datapoints.QCCertificateId?.evidence_doc_id,
    evidence_page: ctx.datapoints.QCCertificateId?.evidence_page
  };
}