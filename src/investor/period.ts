import dayjs from "dayjs";
import tz from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(tz);

const Z = process.env.REMIT_CUTOFF_BUSINESS_TZ || "America/New_York";

export function periodFor(dateISO?: string) {
  const d = dayjs.tz(dateISO || dayjs().format("YYYY-MM-DD"), Z);
  
  if ((process.env.REMIT_CADENCE || "MONTHLY").toUpperCase() === "WEEKLY") {
    // week ends Friday; cutoff = Friday + grace business days
    const friday = d.day() >= 5 ? d.day(5) : d.day(-2); // last Friday
    const cutoff = addBusinessDays(friday, Number(process.env.REMIT_GRACE_DAYS_BUSINESS || "2"));
    const start = friday.subtract(6, "day").format("YYYY-MM-DD");
    return { 
      start, 
      end: friday.format("YYYY-MM-DD"), 
      cutoff: cutoff.format("YYYY-MM-DD") 
    };
  } else {
    const end = d.endOf("month").format("YYYY-MM-DD");
    const cutoff = addBusinessDays(dayjs.tz(end, Z), Number(process.env.REMIT_GRACE_DAYS_BUSINESS || "2"));
    const start = d.startOf("month").format("YYYY-MM-DD");
    return { start, end, cutoff: cutoff.format("YYYY-MM-DD") };
  }
}

function addBusinessDays(d: any, n: number) {
  let x = d;
  let c = 0;
  while (c < n) {
    x = x.add(1, "day");
    if (x.day() != 0 && x.day() != 6) c++;
  }
  return x;
}

export function monthlyBpsToMonthlyAmt(bps: number, upb: number) {
  // annual bps on UPB, pro-rated monthly (bps = basis points = / 10000)
  const annual = upb * (bps / 10000);
  return Math.round((annual / 12 + Number.EPSILON) * 100) / 100;
}