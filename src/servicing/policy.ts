import dayjs from "dayjs";
import tz from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(tz);

const Z = process.env.SVC_BUSINESS_TZ || "America/New_York";

export function daysPastDue(dueISO: string, paid: boolean, paidAt?: string | null, asOfISO?: string): number {
  const asOf = dayjs.tz(asOfISO || dayjs().format("YYYY-MM-DD"), Z);
  const due = dayjs.tz(dueISO, Z);
  
  if (paid && paidAt) {
    const p = dayjs.tz(paidAt, Z);
    return Math.max(0, p.diff(due, "day"));
  }
  
  return Math.max(0, asOf.diff(due, "day"));
}

export function delinquencyBucket(dpd: number): string {
  const buckets = (process.env.DELINQ_BUCKETS || "0,30,60,90,120")
    .split(",")
    .map(n => Number(n.trim()))
    .sort((a, b) => a - b);
  
  let label = `${buckets[0]}+`;
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (dpd >= buckets[i]) {
      label = `${buckets[i]}+`;
      break;
    }
  }
  return label;
}

export function lateFee(pi: number): number {
  const pct = Number(process.env.LATE_FEE_PCT_OF_PI || "0.05");
  return round2(pi * pct);
}

export function graceDays(loanGrace?: number): number {
  if (loanGrace && loanGrace > 0) return loanGrace;
  return Number(process.env.LATE_FEE_GRACE_DAYS || "15");
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}