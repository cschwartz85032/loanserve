// QC System: Business Day Calculator for TRID/ECOA Timing
// Handles business day calculations with timezone awareness and US federal holidays

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import tz from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(tz);

const Z = process.env.QC_BUSINESS_TZ || "America/New_York";

// Simple US holiday set (can be replaced by file if QC_TRID_BUSINESS_DAYS_FILE set)
const FIXED = new Set<string>(); // YYYY-MM-DD in Z

function loadHolidays() {
  const file = process.env.QC_TRID_BUSINESS_DAYS_FILE;
  if (!file) {
    // Add common US federal holidays for current year and next year
    const year = new Date().getFullYear();
    [year, year + 1].forEach(y => {
      FIXED.add(`${y}-01-01`); // New Year's Day
      FIXED.add(`${y}-07-04`); // Independence Day
      FIXED.add(`${y}-12-25`); // Christmas Day
      // Add other federal holidays as needed
    });
    return;
  }
  try {
    const fs = require("fs");
    const arr = JSON.parse(fs.readFileSync(file, "utf-8"));
    arr.forEach((d: string) => FIXED.add(dayjs.tz(d, Z).format("YYYY-MM-DD")));
  } catch {
    /* ignore file loading errors */
  }
}
loadHolidays();

/**
 * Check if a given date is a business day (not weekend, not holiday)
 */
export function isBusinessDay(d: dayjs.Dayjs): boolean {
  const local = d.tz(Z);
  const dow = local.day();
  if (dow === 0 || dow === 6) return false; // Sunday = 0, Saturday = 6
  if (FIXED.has(local.format("YYYY-MM-DD"))) return false;
  return true;
}

/**
 * Add a specified number of business days to a start date
 */
export function addBusinessDays(startISO: string, days: number): string {
  let d = dayjs.tz(startISO, Z);
  let added = 0;
  while (added < days) {
    d = d.add(1, "day");
    if (isBusinessDay(d)) added++;
  }
  return d.format("YYYY-MM-DD");
}

/**
 * Calculate the number of business days between two dates
 */
export function diffBusinessDays(aISO: string, bISO: string): number {
  let a = dayjs.tz(aISO, Z);
  let b = dayjs.tz(bISO, Z);
  if (b.isBefore(a)) [a, b] = [b, a];
  let d = a;
  let count = 0;
  while (d.isBefore(b, "day")) {
    d = d.add(1, "day");
    if (isBusinessDay(d)) count++;
  }
  return count;
}