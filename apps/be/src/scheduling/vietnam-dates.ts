const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export class InvalidScheduleDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidScheduleDateError';
  }
}

function parseDateParts(dateStr: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = DATE_PATTERN.exec(dateStr);
  if (!match) {
    throw new InvalidScheduleDateError(`Invalid YYYY-MM-DD date: ${dateStr}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new InvalidScheduleDateError(`Non-existent calendar date: ${dateStr}`);
  }

  return { year, month, day };
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthStartOf(dateStr: string): string {
  const { year, month } = parseDateParts(dateStr);
  return formatDateParts(year, month, 1);
}

export function monthEndOf(dateStr: string): string {
  const { year, month } = parseDateParts(dateStr);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return formatDateParts(year, month, lastDay);
}

export function addDays(dateStr: string, days: number): string {
  const { year, month, day } = parseDateParts(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateParts(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
  );
}

export function diffDays(targetDateStr: string, baseDateStr: string): number {
  const t = parseDateParts(targetDateStr);
  const b = parseDateParts(baseDateStr);
  const tMs = Date.UTC(t.year, t.month - 1, t.day);
  const bMs = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((tMs - bMs) / (24 * 60 * 60 * 1000));
}

/**
 * Generates weekly occurrence dates (every 7 days) starting at startDateStr within the same Vietnam calendar month.
 */
export function generateWeeklyMonthDates(startDateStr: string): string[] {
  const monthEnd = monthEndOf(startDateStr);
  const dates: string[] = [];
  let current = startDateStr;
  while (current <= monthEnd) {
    dates.push(current);
    current = addDays(current, 7);
  }
  return dates;
}

/**
 * Validates that weekStartStr is a Monday and returns the 7-day Monday..Sunday range.
 */
export function resolveTimetableWeekRange(weekStartStr: string): {
  weekStart: string;
  weekEnd: string;
  dates: string[];
} {
  const { year, month, day } = parseDateParts(weekStartStr);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (dayOfWeek !== 1) {
    throw new InvalidScheduleDateError(
      'weekStart must be a Monday in YYYY-MM-DD format',
    );
  }

  const dates: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    dates.push(addDays(weekStartStr, i));
  }
  return {
    weekStart: weekStartStr,
    weekEnd: dates[6],
    dates,
  };
}
