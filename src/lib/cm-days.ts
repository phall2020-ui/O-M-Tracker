import { BillingPortfolioCode } from '@/types';

export type CmEntryForSummary = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  hours: number;
  workDate: Date | string;
};

export interface CmUsageSummary {
  allowedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  portfolioAllowances?: CmAllowanceBreakdown[];
}

export interface CmAllowanceBreakdown {
  billingPortfolio: BillingPortfolioCode;
  contractedCapacityKwp: number;
  allowedDays: number;
}

export interface CmMonthlyUsageRow {
  month: string;
  monthLabel: string;
  contractedCapacityKwp: number;
  allowedDays: number;
  usedDays: number;
  pendingDays: number;
  rejectedDays: number;
  remainingDays: number;
  cumulativeAllowedDays: number;
  cumulativeUsedDays: number;
  cumulativeRemainingDays: number;
  usagePercent: number;
  cumulativeUsagePercent: number;
  status: 'UNDER' | 'WARNING' | 'EXCEEDED';
  portfolioAllowances?: CmAllowanceBreakdown[];
}

export interface CmMonthlyCapacity {
  month: string;
  contractedCapacityKwp: number;
}

export interface CmMonthlyPortfolioCapacity {
  month: string;
  billingPortfolio: BillingPortfolioCode;
  contractedCapacityKwp: number;
}

function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateCmAllowance(contractedCapacityKwp: number): number {
  return Math.floor(contractedCapacityKwp / 1000 / 12);
}

export function buildCmAllowanceBreakdown(
  rows: Array<{ billingPortfolio: BillingPortfolioCode; contractedCapacityKwp: number }>
): CmAllowanceBreakdown[] {
  return rows.map((row) => ({
    ...row,
    allowedDays: calculateCmAllowance(row.contractedCapacityKwp),
  }));
}

export function calculateCmDays(hours: number): number {
  return roundDays(hours / 8);
}

export function summarizeCmUsage(
  contractedCapacityKwp: number,
  entries: CmEntryForSummary[],
  month?: string
): CmUsageSummary {
  const scopedEntries = month
    ? entries.filter((entry) => entryMonth(entry.workDate) === month)
    : entries;
  const allowedDays = calculateCmAllowance(contractedCapacityKwp);
  const usedDays = roundDays(
    scopedEntries
      .filter((entry) => entry.status === 'APPROVED')
      .reduce((sum, entry) => sum + calculateCmDays(entry.hours), 0)
  );
  const pendingDays = roundDays(
    scopedEntries
      .filter((entry) => entry.status === 'PENDING')
      .reduce((sum, entry) => sum + calculateCmDays(entry.hours), 0)
  );

  return {
    allowedDays,
    usedDays,
    pendingDays,
    remainingDays: roundDays(allowedDays - usedDays),
  };
}

function entryMonth(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1))
  );
}

function addMonths(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function statusForPercent(percent: number): 'UNDER' | 'WARNING' | 'EXCEEDED' {
  if (percent >= 100) return 'EXCEEDED';
  if (percent >= 80) return 'WARNING';
  return 'UNDER';
}

export function buildCmMonthlyUsage(
  contractedCapacityKwpOrMonthlyCapacities: number | CmMonthlyCapacity[],
  entries: CmEntryForSummary[],
  endMonth: string,
  monthCount = 12,
  monthlyPortfolioCapacities: CmMonthlyPortfolioCapacity[] = []
): CmMonthlyUsageRow[] {
  const monthlyCapacities = Array.isArray(contractedCapacityKwpOrMonthlyCapacities)
    ? new Map(contractedCapacityKwpOrMonthlyCapacities.map((capacity) => [capacity.month, capacity.contractedCapacityKwp]))
    : null;
  const monthlyPortfolioCapacityMap = new Map(
    monthlyPortfolioCapacities.map((capacity) => [`${capacity.month}:${capacity.billingPortfolio}`, capacity.contractedCapacityKwp])
  );
  let cumulativeAllowedDays = 0;
  let cumulativeUsedDays = 0;

  return Array.from({ length: monthCount }, (_, index) => addMonths(endMonth, index - monthCount + 1)).map((month) => {
    const contractedCapacityKwp =
      monthlyCapacities?.get(month) ?? (typeof contractedCapacityKwpOrMonthlyCapacities === 'number' ? contractedCapacityKwpOrMonthlyCapacities : 0);
    const allowedDays = calculateCmAllowance(contractedCapacityKwp);
    const monthEntries = entries.filter((entry) => entryMonth(entry.workDate) === month);
    const usedDays = roundDays(
      monthEntries
        .filter((entry) => entry.status === 'APPROVED')
        .reduce((sum, entry) => sum + calculateCmDays(entry.hours), 0)
    );
    const pendingDays = roundDays(
      monthEntries
        .filter((entry) => entry.status === 'PENDING')
        .reduce((sum, entry) => sum + calculateCmDays(entry.hours), 0)
    );
    const rejectedDays = roundDays(
      monthEntries
        .filter((entry) => entry.status === 'REJECTED')
        .reduce((sum, entry) => sum + calculateCmDays(entry.hours), 0)
    );

    cumulativeAllowedDays = roundDays(cumulativeAllowedDays + allowedDays);
    cumulativeUsedDays = roundDays(cumulativeUsedDays + usedDays);
    const usagePercent = allowedDays > 0 ? (usedDays / allowedDays) * 100 : 0;
    const cumulativeUsagePercent = cumulativeAllowedDays > 0 ? (cumulativeUsedDays / cumulativeAllowedDays) * 100 : 0;

    return {
      month,
      monthLabel: monthLabel(month),
      contractedCapacityKwp,
      allowedDays,
      usedDays,
      pendingDays,
      rejectedDays,
      remainingDays: roundDays(allowedDays - usedDays),
      cumulativeAllowedDays,
      cumulativeUsedDays,
      cumulativeRemainingDays: roundDays(cumulativeAllowedDays - cumulativeUsedDays),
      usagePercent: Math.round(usagePercent * 10) / 10,
      cumulativeUsagePercent: Math.round(cumulativeUsagePercent * 10) / 10,
      status: statusForPercent(usagePercent),
      portfolioAllowances: buildCmAllowanceBreakdown([
        {
          billingPortfolio: 'CORE',
          contractedCapacityKwp: monthlyPortfolioCapacityMap.get(`${month}:CORE`) || 0,
        },
        {
          billingPortfolio: 'EDEN',
          contractedCapacityKwp: monthlyPortfolioCapacityMap.get(`${month}:EDEN`) || 0,
        },
      ]),
    };
  });
}
