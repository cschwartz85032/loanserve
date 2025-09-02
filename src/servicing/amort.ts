export function calcMonthlyPI(noteAmount: number, annualRatePct: number, termMonths: number): number {
  const r = (annualRatePct / 100) / 12;
  if (r === 0) return round2(noteAmount / termMonths);
  const pmt = noteAmount * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
  return round2(pmt);
}

export function buildSchedule(params: {
  noteAmount: number;
  annualRatePct: number;
  termMonths: number;
  firstPaymentDate: string;
  escrowMonthly: number;
}) {
  const { noteAmount, annualRatePct, termMonths, firstPaymentDate, escrowMonthly } = params;
  const pi = calcMonthlyPI(noteAmount, annualRatePct, termMonths);
  const r = (annualRatePct / 100) / 12;

  const rows: Array<{
    installment_no: number;
    due_date: string;
    principal_due: number;
    interest_due: number;
    escrow_due: number;
    total_due: number;
    principal_balance_after: number;
  }> = [];

  let bal = noteAmount;
  let d = new Date(firstPaymentDate);
  for (let n = 1; n <= termMonths; n++) {
    const interest = round2(bal * r);
    const principal = round2(pi - interest);
    const escrow = round2(escrowMonthly);
    const total = round2(principal + interest + escrow);
    bal = round2(bal - principal);
    rows.push({
      installment_no: n,
      due_date: toISO(addMonths(d, n - 1)),
      principal_due: principal,
      interest_due: interest,
      escrow_due: escrow,
      total_due: total,
      principal_balance_after: Math.max(0, bal)
    });
  }
  return { pi, rows };
}

export function estimateEscrowMonthly(inputs: {
  taxAnnual?: number;
  hoiAnnual?: number;
  floodAnnual?: number;
  hoaAnnual?: number;
  cushionMonths?: number;
  inflationPct?: number;
}): { monthly: number; buckets: Record<string, number> } {
  const inf = inputs.inflationPct ?? 0.03;
  const next = (amt?: number) => round2((amt ?? 0) * (1 + inf));
  const buckets = {
    TAX: round2(next(inputs.taxAnnual) / 12),
    HOI: round2(next(inputs.hoiAnnual) / 12),
    FLOOD: round2(next(inputs.floodAnnual) / 12),
    HOA: round2((inputs.hoaAnnual ?? 0) / 12)
  };
  const monthly = round2(buckets.TAX + buckets.HOI + buckets.FLOOD + buckets.HOA);
  return { monthly, buckets };
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}