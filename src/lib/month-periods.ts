import { MonthOption } from '@/types';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizeMonth(value: string | null | undefined): string | null {
  if (!value || !MONTH_PATTERN.test(value)) return null;
  return value;
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function getMonthBounds(month: string): { start: Date; end: Date } {
  const normalized = normalizeMonth(month);
  if (!normalized) {
    throw new Error(`Invalid month: ${month}`);
  }

  const [year, monthNumber] = normalized.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));
  return { start, end };
}

export function formatMonthLabel(month: string): string {
  const { start } = getMonthBounds(month);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(start);
}

export function buildAvailableMonths(onboardDates: Array<string | null>, selectedMonth = currentMonth()): MonthOption[] {
  const selected = normalizeMonth(selectedMonth) || currentMonth();
  const validOnboardMonths = onboardDates
    .filter((date): date is string => Boolean(date))
    .map((date) => normalizeMonth(date.slice(0, 7)))
    .filter((month): month is string => Boolean(month));
  const firstMonth = validOnboardMonths.sort()[0] || selected;

  const [startYear, startMonth] = firstMonth.split('-').map(Number);
  const [endYear, endMonth] = selected.split('-').map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1));
  const options: MonthOption[] = [];

  while (cursor <= end) {
    const value = cursor.toISOString().slice(0, 7);
    options.push({ value, label: formatMonthLabel(value) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return options;
}
