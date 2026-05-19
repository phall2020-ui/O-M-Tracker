import { formatMonthLabel, normalizeMonth } from './month-periods';

export interface CapacityHistorySource {
  month: string;
  systemSizeKwp: number;
  snapshotCount: number;
}

export interface CapacityHistoryPoint {
  month: string;
  contractedCapacityKwp: number;
  contractedCapacityMw: number;
  sites: number;
}

function addMonths(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

function shortMonthLabel(month: string): string {
  return formatMonthLabel(month).replace(/^(\w{3})\w*/, '$1');
}

export function buildCapacityHistory(
  summaries: CapacityHistorySource[],
  selectedMonth: string,
  monthCount = 12
): CapacityHistoryPoint[] {
  const endMonth = normalizeMonth(selectedMonth);
  if (!endMonth) {
    throw new Error('selectedMonth must use YYYY-MM format');
  }

  const byMonth = new Map(summaries.map((summary) => [summary.month, summary]));

  return Array.from({ length: monthCount }, (_, index) => {
    const month = addMonths(endMonth, index - monthCount + 1);
    const summary = byMonth.get(month);
    const contractedCapacityKwp = Math.round(summary?.systemSizeKwp || 0);
    return {
      month: shortMonthLabel(month),
      contractedCapacityKwp,
      contractedCapacityMw: Number((contractedCapacityKwp / 1000).toFixed(3)),
      sites: summary?.snapshotCount || 0,
    };
  });
}
