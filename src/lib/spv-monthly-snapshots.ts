import { BillingPortfolioBreakdown, BillingPortfolioCode, MonthOption, SpvMonthlyReport, SpvMonthlyRow } from '@/types';
import { formatMonthLabel } from './month-periods';
import { billingPortfolioLabel } from './calculations';

export interface BillingSnapshotForReport {
  id: string;
  siteId: string;
  siteName: string;
  spvCode: string | null;
  spvName: string | null;
  month: string;
  systemSizeKwp: number;
  siteFixedCostsAnnual: number;
  variableCostAnnual: number;
  annualFee: number;
  expectedAmount: number | null;
  invoicedAmount: number | null;
  // Taken from the linked Site where the caller has it. Notion-imported payloads carry the raw
  // Notion row and no site block, so the payload alone cannot classify them.
  billingPortfolio?: BillingPortfolioCode | null;
  sourcePayload?: string | null;
}

function emptyRow(spvCode: string, spvName: string): SpvMonthlyRow {
  return {
    spvCode,
    spvName,
    siteCount: 0,
    contractedSiteCount: 0,
    pendingSiteCount: 0,
    totalCapacityKwp: 0,
    contractedCapacityKwp: 0,
    siteFixedCostsAnnual: 0,
    variableCostAnnual: 0,
    annualFee: 0,
    monthlyFee: 0,
    averageFeePerKwp: 0,
    correctiveDaysAllowed: 0,
    billingSnapshotCount: 0,
    invoicedAmount: 0,
  };
}

function emptyPortfolioBreakdown(billingPortfolio: BillingPortfolioCode): BillingPortfolioBreakdown {
  return {
    billingPortfolio,
    billingPortfolioLabel: billingPortfolioLabel(billingPortfolio),
    siteCount: 0,
    contractedSiteCount: 0,
    pendingSiteCount: 0,
    totalCapacityKwp: 0,
    contractedCapacityKwp: 0,
    siteFixedCostsAnnual: 0,
    variableCostAnnual: 0,
    annualFee: 0,
    monthlyFee: 0,
    correctiveDaysAllowed: 0,
  };
}

function billingPortfolioFromSnapshot(snapshot: BillingSnapshotForReport): BillingPortfolioCode {
  if (snapshot.billingPortfolio) return snapshot.billingPortfolio === 'EDEN' ? 'EDEN' : 'CORE';
  if (!snapshot.sourcePayload) return 'CORE';
  try {
    const parsed = JSON.parse(snapshot.sourcePayload) as { site?: { billingPortfolio?: string } };
    return parsed.site?.billingPortfolio === 'EDEN' ? 'EDEN' : 'CORE';
  } catch {
    return 'CORE';
  }
}

function displaySpvForSnapshot(snapshot: BillingSnapshotForReport, billingPortfolio: BillingPortfolioCode): { code: string; name: string } {
  if (snapshot.spvCode) {
    return { code: snapshot.spvCode, name: snapshot.spvName || snapshot.spvCode };
  }
  if (billingPortfolio === 'EDEN') {
    return { code: 'EDEN', name: 'Eden Sites' };
  }
  return { code: 'UNASSIGNED', name: 'Unassigned' };
}

// annualFee is the sum of the stored full-year fees. It is deliberately not derived from
// monthlyFee, which carries each snapshot's pro-rata factor and would understate a month
// containing a mid-month start while Site Costs and Variable Cost stayed un-prorated.
function finalize(row: SpvMonthlyRow): SpvMonthlyRow {
  return {
    ...row,
    averageFeePerKwp: row.contractedCapacityKwp > 0 ? row.annualFee / row.contractedCapacityKwp : 0,
    correctiveDaysAllowed: Math.floor(row.contractedCapacityKwp / 1000 / 12),
  };
}

export function buildSpvMonthlyReportFromSnapshots(
  snapshots: BillingSnapshotForReport[],
  month: string,
  availableMonths: string[]
): SpvMonthlyReport {
  const groups = new Map<string, SpvMonthlyRow>();
  const portfolioGroups = new Map<BillingPortfolioCode, BillingPortfolioBreakdown>([
    ['CORE', emptyPortfolioBreakdown('CORE')],
    ['EDEN', emptyPortfolioBreakdown('EDEN')],
  ]);

  for (const snapshot of snapshots) {
    const billingPortfolio = billingPortfolioFromSnapshot(snapshot);
    const displaySpv = displaySpvForSnapshot(snapshot, billingPortfolio);
    const spvCode = displaySpv.code;
    const groupKey = `${billingPortfolio}:${spvCode}`;
    const row = groups.get(groupKey) || {
      ...emptyRow(spvCode, displaySpv.name),
      billingPortfolio,
      billingPortfolioLabel: billingPortfolioLabel(billingPortfolio),
    };
    const portfolioRow = portfolioGroups.get(billingPortfolio)!;
    row.siteCount += 1;
    row.contractedSiteCount += 1;
    row.totalCapacityKwp += snapshot.systemSizeKwp;
    row.contractedCapacityKwp += snapshot.systemSizeKwp;
    row.siteFixedCostsAnnual += snapshot.siteFixedCostsAnnual;
    row.variableCostAnnual += snapshot.variableCostAnnual;
    row.annualFee += snapshot.annualFee;
    row.monthlyFee += snapshot.expectedAmount || 0;
    row.billingSnapshotCount = (row.billingSnapshotCount || 0) + 1;
    row.invoicedAmount = (row.invoicedAmount || 0) + (snapshot.invoicedAmount || 0);
    portfolioRow.siteCount += 1;
    portfolioRow.contractedSiteCount += 1;
    portfolioRow.totalCapacityKwp += snapshot.systemSizeKwp;
    portfolioRow.contractedCapacityKwp += snapshot.systemSizeKwp;
    portfolioRow.siteFixedCostsAnnual += snapshot.siteFixedCostsAnnual;
    portfolioRow.variableCostAnnual += snapshot.variableCostAnnual;
    portfolioRow.annualFee += snapshot.annualFee;
    portfolioRow.monthlyFee += snapshot.expectedAmount || 0;
    groups.set(groupKey, row);
  }

  const rows = Array.from(groups.values())
    .map(finalize)
    .sort((a, b) => b.monthlyFee - a.monthlyFee || a.spvCode.localeCompare(b.spvCode));
  const totals = finalize(
    rows.reduce<SpvMonthlyRow>(
      (sum, row) => ({
        spvCode: 'TOTAL',
        spvName: 'Total',
        siteCount: sum.siteCount + row.siteCount,
        contractedSiteCount: sum.contractedSiteCount + row.contractedSiteCount,
        pendingSiteCount: 0,
        totalCapacityKwp: sum.totalCapacityKwp + row.totalCapacityKwp,
        contractedCapacityKwp: sum.contractedCapacityKwp + row.contractedCapacityKwp,
        siteFixedCostsAnnual: sum.siteFixedCostsAnnual + row.siteFixedCostsAnnual,
        variableCostAnnual: sum.variableCostAnnual + row.variableCostAnnual,
        annualFee: sum.annualFee + row.annualFee,
        monthlyFee: sum.monthlyFee + row.monthlyFee,
        averageFeePerKwp: 0,
        correctiveDaysAllowed: 0,
        billingSnapshotCount: (sum.billingSnapshotCount || 0) + (row.billingSnapshotCount || 0),
        invoicedAmount: (sum.invoicedAmount || 0) + (row.invoicedAmount || 0),
      }),
      emptyRow('TOTAL', 'Total')
    )
  );
  const monthOptions: MonthOption[] = availableMonths.map((value) => ({ value, label: formatMonthLabel(value) }));
  const portfolioBreakdowns = Array.from(portfolioGroups.values()).map((row) => ({
    ...row,
    correctiveDaysAllowed: Math.floor(row.contractedCapacityKwp / 1000 / 12),
  }));

  return {
    month,
    monthLabel: formatMonthLabel(month),
    source: 'billing-snapshots',
    availableMonths: monthOptions,
    rows,
    totals,
    portfolioBreakdowns,
  };
}
