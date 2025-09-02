// src/utils/deterministic-regex.ts
// Deterministic extractors for common fields. No AI. Safe, auditable, repeatable.

export type DetHit = {
  key: string;
  value: string | number | boolean | null;
  evidenceText: string; // human-readable snippet; system will attach doc/page/textHash lineage
};

// ---------------------- Normalizers ----------------------
const moneyNorm = (s: string) =>
  Number(s.replace(/[^\d.]/g, "").replace(/(?<=\..*)\./g, "")); // drop $, commas, extra dots

const pctNorm = (s: string) => Number(s.replace(/[^\d.]/g, "")); // "7.125%" -> 7.125

const intNorm = (s: string) => Number((s.match(/\d+/)?.[0] ?? "0"));

const yesNoNorm = (s: string) => {
  const t = s.toLowerCase();
  if (/(^|\b)(yes|y|true|required)\b/.test(t)) return true;
  if (/(^|\b)(no|n|false|not required)\b/.test(t)) return false;
  return null;
};

// Month names to numbers for date normalization
const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03", apr: "04", april: "04",
  may: "05", jun: "06", june: "06", jul: "07", july: "07", aug: "08", august: "08",
  sep: "09", sept: "09", september: "09", oct: "10", october: "10", nov: "11", november: "11",
  dec: "12", december: "12"
};

function pad2(n: string) { return n.length === 1 ? "0" + n : n; }

// Accepts "YYYY-MM-DD", "MM/DD/YYYY", "Month DD, YYYY", "DD-Mon-YYYY"
export function toISODate(raw: string): string | null {
  const s = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  //  MM/DD/YYYY or M/D/YY(YY)
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const mm = pad2(m[1]);
    const dd = pad2(m[2]);
    const yyyy = (m[3].length === 2) ? ("20" + m[3]) : m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Month DD, YYYY (e.g., September 1, 2025)
  m = s.match(/^([A-Za-z]{3,12})\.?\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()]; if (!mon) return null;
    return `${m[3]}-${mon}-${pad2(m[2])}`;
  }

  // DD Mon YYYY or DD-Mon-YYYY
  m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-](\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()]; if (!mon) return null;
    return `${m[3]}-${mon}-${pad2(m[1])}`;
  }
  return null;
}

// ---------------------- Regexes ----------------------
// Currency like $200,000.00 or 200000
const CURRENCY = /(?:\$?\s*[\d]{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\$?\s*\d+(?:\.\d+)?)/;

// Percentage like 7.125% or 7.125
const PERCENT = /(?:\d{1,3}(?:\.\d+)?\s*%?)/;

// Dates (we'll normalize after)
const DATE_ANY = /(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3,12}\s+\d{1,2},\s*\d{4}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{4})/;

// Policy numbers: allow letters/digits + dashes/slashes, 6–40 chars
const POLICY = /[A-Z0-9][A-Z0-9\-\/]{5,40}/i;

// Flood zone codes (FEMA): AE, A, AH, AO, X, VE, V, D, etc. (with optional suffixes)
const FLOOD_ZONE = /\b(?:A|AE|AH|AO|AR|A99|V|VE|X|D)(?:\d+)?\b/;

// UCDP SSR IDs - typically 8–24 alphanumerics
const SSR_ID = /\b[0-9A-Z]{8,24}\b/;

// MIN (MERS MIN) 18 digits possibly with hyphen formatting
const MERS_MIN = /\b\d{7}-\d{7}-\d{1}\b|\b\d{18}\b/;

// Late charge grace days (e.g., "after 15 days", "more than 10 days late")
const GRACE_DAYS = /\b(?:after|more than|beyond)\s+(\d{1,2})\s+days?\b/i;

// Amortization term months
const TERM_MONTHS = /\b(\d{2,3})\s*(?:months|mos|mo)\b/i;

// Borrower full name near label or signature lines
const BORROWER_NAME_LINE = /(?:Borrower|Borrower\(s\)|Signature of Borrower)[:\s]*([A-Z][A-Za-z''.\-]+(?:\s+[A-Z][A-Za-z''.\-]+){0,3})/;

// ---------------------- Field Extractors ----------------------
export function findNoteAmount(text: string): DetHit | null {
  const window = /(?:PROMISSORY\s+NOTE|NOTE\s+AMOUNT|PRINCIPAL\s+SUM)[\s\S]{0,400}?/i;
  const m = text.match(new RegExp(window.source + "(" + CURRENCY.source + ")", "i"));
  if (!m) return null;
  return { key: "NoteAmount", value: moneyNorm(m[1]), evidenceText: m[0] };
}

export function findInterestRate(text: string): DetHit | null {
  const window = /(?:ANNUAL\s+INTEREST\s+RATE|INTEREST\s+RATE|RATE\s*\(FIXED|RATE\s*\(VARIABLE)[\s\S]{0,200}?/i;
  const m = text.match(new RegExp(window.source + "(" + PERCENT.source + ")", "i"));
  if (!m) return null;
  return { key: "InterestRate", value: pctNorm(m[1]), evidenceText: m[0] };
}

export function findAmortTermMonths(text: string): DetHit | null {
  const m = text.match(TERM_MONTHS);
  if (!m) return null;
  return { key: "AmortTermMonths", value: intNorm(m[1]), evidenceText: m[0] };
}

export function findFirstPaymentDate(text: string): DetHit | null {
  const window = /(?:FIRST\s+PAYMENT\s+DATE|FIRST\s+INSTALLMENT)[\s\S]{0,120}?/i;
  const m = text.match(new RegExp(window.source + "(" + DATE_ANY.source + ")", "i"));
  if (!m) return null;
  return { key: "FirstPaymentDate", value: toISODate(m[1]), evidenceText: m[0] };
}

export function findMaturityDate(text: string): DetHit | null {
  const window = /(?:MATURITY\s+DATE|FINAL\s+PAYMENT\s+DATE)[\s\S]{0,120}?/i;
  const m = text.match(new RegExp(window.source + "(" + DATE_ANY.source + ")", "i"));
  if (!m) return null;
  return { key: "MaturityDate", value: toISODate(m[1]), evidenceText: m[0] };
}

export function findLateChargePct(text: string): DetHit | null {
  const window = /(?:LATE\s+CHARGE|LATE\s+FEE)[\s\S]{0,160}?/i;
  const m = text.match(new RegExp(window.source + "(" + PERCENT.source + ")", "i"));
  if (!m) return null;
  return { key: "LateChargePct", value: pctNorm(m[1]), evidenceText: m[0] };
}

export function findLateChargeGraceDays(text: string): DetHit | null {
  const m = text.match(GRACE_DAYS);
  if (!m) return null;
  return { key: "LateChargeGraceDays", value: intNorm(m[1]), evidenceText: m[0] };
}

export function findBorrowerFullName(text: string): DetHit | null {
  const m = text.match(BORROWER_NAME_LINE);
  if (!m) return null;
  return { key: "BorrowerFullName", value: m[1].trim(), evidenceText: m[0] };
}

// ---------- CD fields ----------
export function findCD_TotalLoanAmount(text: string): DetHit | null {
  const window = /(?:Closing\s+Disclosure|Loan\s+Terms|Loan\s+Amount)[\s\S]{0,400}?/i;
  const m = text.match(new RegExp(window.source + "(" + CURRENCY.source + ")", "i"));
  if (!m) return null;
  return { key: "TotalLoanAmount", value: moneyNorm(m[1]), evidenceText: m[0] };
}

export function findCD_PandI(text: string): DetHit | null {
  const window = /(?:P&I|Principal\s*&\s*Interest|Principal\s+and\s+Interest)[\s\S]{0,160}?/i;
  const m = text.match(new RegExp(window.source + "(" + CURRENCY.source + ")", "i"));
  if (!m) return null;
  return { key: "PAndIAmount", value: moneyNorm(m[1]), evidenceText: m[0] };
}

export function findCD_EscrowRequired(text: string): DetHit | null {
  const window = /(?:Escrow|In\s+Escrow|Escrow\s+Account)[\s\S]{0,120}?/i;
  const m = text.match(new RegExp(window.source + "(Yes|No|Not Required)", "i"));
  if (!m) return null;
  return { key: "EscrowRequired", value: yesNoNorm(m[1])!, evidenceText: m[0] };
}

export function findCD_TaxEscrowMonthly(text: string): DetHit | null {
  const window = /(?:Estimated\s+Taxes|Property\s+Taxes)[\s\S]{0,140}?/i;
  const m = text.match(new RegExp(window.source + "(" + CURRENCY.source + ")", "i"));
  if (!m) return null;
  return { key: "TaxEscrowMonthly", value: moneyNorm(m[1]), evidenceText: m[0] };
}

export function findCD_InsEscrowMonthly(text: string): DetHit | null {
  const window = /(?:Homeowner'?s?\s+Insurance|Hazard\s+Insurance)[\s\S]{0,140}?/i;
  const m = text.match(new RegExp(window.source + "(" + CURRENCY.source + ")", "i"));
  if (!m) return null;
  return { key: "InsuranceEscrowMonthly", value: moneyNorm(m[1]), evidenceText: m[0] };
}

// ---------- HOI fields ----------
export function findHOI_Carrier(text: string): DetHit | null {
  const window = /(?:Insurance\s+Company|Carrier|Insurer)[\s\S]{0,120}?([A-Za-z][A-Za-z0-9 &.,'-]{2,})/i;
  const m = text.match(window);
  if (!m) return null;
  return { key: "HomeownersInsCarrier", value: m[1].trim(), evidenceText: m[0] };
}

export function findHOI_Policy(text: string): DetHit | null {
  const window = /(?:Policy\s+Number|Policy\s+No\.?)[\s\S]{0,40}?/i;
  const m = text.match(new RegExp(window.source + "(" + POLICY.source + ")", "i"));
  if (!m) return null;
  return { key: "HOIPolicyNumber", value: m[1].trim(), evidenceText: m[0] };
}

export function findHOI_Effective(text: string): DetHit | null {
  const window = /(?:Effective\s+Date|Policy\s+Effective)[\s\S]{0,40}?/i;
  const m = text.match(new RegExp(window.source + "(" + DATE_ANY.source + ")", "i"));
  if (!m) return null;
  return { key: "HOIEffectiveDate", value: toISODate(m[1]), evidenceText: m[0] };
}

export function findHOI_Expiration(text: string): DetHit | null {
  const window = /(?:Expiration\s+Date|Policy\s+Expiration)[\s\S]{0,40}?/i;
  const m = text.match(new RegExp(window.source + "(" + DATE_ANY.source + ")", "i"));
  if (!m) return null;
  return { key: "HOIExpirationDate", value: toISODate(m[1]), evidenceText: m[0] };
}

// ---------- Flood fields ----------
export function findFloodZone(text: string): DetHit | null {
  // Prefer lines that mention "Zone" or "SFHA"
  const m = text.match(new RegExp("(?:Zone\\s*:"+ "\\s*)?("+FLOOD_ZONE.source+")", "i"));
  if (!m) return null;
  return { key: "FloodZone", value: m[1].toUpperCase(), evidenceText: m[0] };
}

export function findFloodInsRequired(text: string): DetHit | null {
  // Look for "Insurance Required: Yes/No" or "IN/OUT OF SFHA"
  const m1 = text.match(/Insurance\s+Required[:\s]+(Yes|No)/i);
  if (m1) return { key: "FloodInsRequired", value: yesNoNorm(m1[1])!, evidenceText: m1[0] };
  const m2 = text.match(/\b(IN|OUT)\s+OF\s+SFHA\b/i);
  if (m2) return { key: "FloodInsRequired", value: m2[1].toUpperCase() === "IN", evidenceText: m2[0] };
  return null;
}

// ---------- Appraisal fields ----------
export function findAppraisedValue(text: string): DetHit | null {
  const window = /(?:Appraised\s+Value|Market\s+Value|Property\s+Value)[\s\S]{0,200}?/i;
  const m = text.match(new RegExp(window.source + "(" + CURRENCY.source + ")", "i"));
  if (!m) return null;
  return { key: "AppraisedValue", value: moneyNorm(m[1]), evidenceText: m[0] };
}

export function findAppraisalDate(text: string): DetHit | null {
  const window = /(?:Effective\s+Date\s+of\s+Appraisal|Appraisal\s+Date|Date\s+of\s+Inspection)[\s\S]{0,120}?/i;
  const m = text.match(new RegExp(window.source + "(" + DATE_ANY.source + ")", "i"));
  if (!m) return null;
  return { key: "AppraisalDate", value: toISODate(m[1]), evidenceText: m[0] };
}

export function findAppraisalFormType(text: string): DetHit | null {
  const formTypes = /(?:1004|1025|1073|2055|1075|URAR|Form\s+\d{4})/i;
  const m = text.match(formTypes);
  if (!m) return null;
  return { key: "AppraisalFormType", value: m[0].toUpperCase(), evidenceText: m[0] };
}

// ---------- Misc ----------
export function findUCDP_SSR(text: string): DetHit | null {
  const window = /(?:SSR|UCDP|Submission\s+Summary\s+Report)[\s\S]{0,200}?/i;
  const m = text.match(new RegExp(window.source + "(" + SSR_ID.source + ")", "i"));
  if (!m) return null;
  return { key: "UCDPSSRStatus", value: m[1], evidenceText: m[0] };
}

export function findMersMIN(text: string): DetHit | null {
  const m = text.match(MERS_MIN);
  if (!m) return null;
  return { key: "MERSMin", value: m[0].replace(/-/g, ""), evidenceText: m[0] };
}

// ---------- Property/Address fields ----------
export function findPropertyAddress(text: string): DetHit | null {
  const window = /(?:Property\s+Address|Subject\s+Property|Property\s+Location)[\s\S]{0,200}?/i;
  // Look for address pattern: number + street name + city pattern
  const addressPattern = /(\d+\s+[A-Za-z0-9\s,.-]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Place|Pl)[A-Za-z0-9\s,.-]*)/i;
  const m = text.match(new RegExp(window.source + addressPattern.source, "i"));
  if (!m) return null;
  return { key: "PropertyAddress", value: m[1].trim(), evidenceText: m[0] };
}

// ---------- Additional common extractors ----------
export function findLoanOriginatorName(text: string): DetHit | null {
  const window = /(?:Loan\s+Originator|Originating\s+Lender|Lender\s+Name)[\s\S]{0,150}?/i;
  const namePattern = /([A-Z][A-Za-z\s&.,'-]{5,50})/;
  const m = text.match(new RegExp(window.source + namePattern.source, "i"));
  if (!m) return null;
  return { key: "LoanOriginatorName", value: m[1].trim(), evidenceText: m[0] };
}

export function findPropertyType(text: string): DetHit | null {
  const types = /\b(?:Single\s+Family|Detached|Attached|Condominium|Condo|Townhouse|PUD|Manufactured|Mobile\s+Home|2-4\s+Family)\b/i;
  const m = text.match(types);
  if (!m) return null;
  return { key: "PropertyType", value: m[0], evidenceText: m[0] };
}

export function findOccupancyType(text: string): DetHit | null {
  const types = /\b(?:Primary\s+Residence|Owner\s+Occupied|Second\s+Home|Investment|Rental)\b/i;
  const m = text.match(types);
  if (!m) return null;
  return { key: "OccupancyType", value: m[0], evidenceText: m[0] };
}