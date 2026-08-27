import { BillingPortfolioBreakdown, BillingPortfolioCode, RateTier, SiteWithCalculations, SpvMonthlyReport, SpvMonthlyRow } from '@/types';
import { buildAvailableMonths, formatMonthLabel, getMonthBounds, normalizeMonth, currentMonth } from './month-periods';
import { billingPortfolioLabel, calculateAnnualFeeForTierForMonth, currentPortfolioTier, DEFAULT_RATE_TIERS } from './calculations';
import { roundCurrency } from './currency';

function emptyTotals(): Omit<SpvMonthlyRow, 'spvCode' | 'spvName'> {
  return {
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
  };
}

function emptyPortfolioBreakdown(billingPortfolio: BillingPortfolioCode): BillingPortfolioBreakdown {
  return {
    billingPortfolio,
    billingPortfolioLabel: billingPortfolioLabel(billingPortfolio),
    ...emptyTotals(),
  };
}

function isVisibleInMonth(site: SiteWithCalculations, monthEnd: Date): boolean {
  const startDate = site.onboardDate || site.actualPacDate;
  if (!startDate) return true;
  return new Date(`${startDate}T00:00:00.000Z`) <= monthEnd;
}

function isContractedInMonth(site: SiteWithCalculations, monthEnd: Date): boolean {
  return (site.contractStatus === 'Contracted' || site.contractStatus === 'Yes') && isVisibleInMonth(site, monthEnd);
}

function finalizeRow(row: SpvMonthlyRow): SpvMonthlyRow {
  return {
    ...row,
    averageFeePerKwp: row.contractedCapacityKwp > 0 ? row.annualFee / row.contractedCapacityKwp : 0,
    correctiveDaysAllowed: Math.floor(row.contractedCapacityKwp / 1000 / 12),
  };
}

function finalizePortfolioBreakdown(row: BillingPortfolioBreakdown): BillingPortfolioBreakdown {
  return {
    ...row,
    correctiveDaysAllowed: Math.floor(row.contractedCapacityKwp / 1000 / 12),
  };
}

function displaySpvForSite(site: SiteWithCalculations, billingPortfolio: BillingPortfolioCode): { code: string; name: string } {
  if (site.spvCode) {
    return { code: site.spvCode, name: site.spvCode };
  }
  if (billingPortfolio === 'EDEN') {
    return { code: 'EDEN', name: 'Eden Sites' };
  }
  return { code: 'UNASSIGNED', name: 'Unassigned' };
}

export function buildSpvMonthlyReport(
  sites: SiteWithCalculations[],
  requestedMonth: string | null | undefined,
  spvNames: Record<string, string> = {},
  tiers: RateTier[] = DEFAULT_RATE_TIERS
): SpvMonthlyReport {
  const month = normalizeMonth(requestedMonth) || currentMonth();
  const { end } = getMonthBounds(month);
  const groups = new Map<string, SpvMonthlyRow>();
  const portfolioGroups = new Map<BillingPortfolioCode, BillingPortfolioBreakdown>([
    ['CORE', emptyPortfolioBreakdown('CORE')],
    ['EDEN', emptyPortfolioBreakdown('EDEN')],
  ]);
  const tier = currentPortfolioTier(sites, tiers, end);

  for (const site of sites.filter((candidate) => isVisibleInMonth(candidate, end))) {
    const billingPortfolio = site.billingPortfolio === 'EDEN' ? 'EDEN' : 'CORE';
    const displaySpv = displaySpvForSite(site, billingPortfolio);
    const spvCode = displaySpv.code;
    const groupKey = `${billingPortfolio}:${spvCode}`;
    const row =
      groups.get(groupKey) ||
      ({
        spvCode,
        spvName: site.spvCode ? spvNames[site.spvCode] || site.spvCode : displaySpv.name,
        billingPortfolio,
        billingPortfolioLabel: billingPortfolioLabel(billingPortfolio),
        siteLines: [],
        ...emptyTotals(),
      } satisfies SpvMonthlyRow);
    const portfolioRow = portfolioGroups.get(billingPortfolio)!;
    const isContracted = isContractedInMonth(site, end);
    const annualFee = isContracted ? calculateAnnualFeeForTierForMonth(site, tier, month) : 0;
    const variableCostAnnual = isContracted ? Math.max(annualFee - site.siteFixedCosts, 0) : 0;
    const monthlyFee = isContracted ? roundCurrency(annualFee / 12) : 0;

    row.siteCount += 1;
    row.totalCapacityKwp += site.systemSizeKwp;
    portfolioRow.siteCount += 1;
    portfolioRow.totalCapacityKwp += site.systemSizeKwp;

    if (isContracted) {
      row.contractedSiteCount += 1;
      row.contractedCapacityKwp += site.systemSizeKwp;
      row.siteFixedCostsAnnual += site.siteFixedCosts;
      row.variableCostAnnual += variableCostAnnual;
      row.annualFee += annualFee;
      row.monthlyFee += monthlyFee;
      portfolioRow.contractedSiteCount += 1;
      portfolioRow.contractedCapacityKwp += site.systemSizeKwp;
      portfolioRow.siteFixedCostsAnnual += site.siteFixedCosts;
      portfolioRow.variableCostAnnual += variableCostAnnual;
      portfolioRow.annualFee += annualFee;
      portfolioRow.monthlyFee += monthlyFee;
    } else {
      row.pendingSiteCount += 1;
      portfolioRow.pendingSiteCount += 1;
    }

    row.siteLines?.push({
      id: site.id,
      siteId: site.id,
      name: site.name,
      contractStatus: site.contractStatus,
      systemSizeKwp: site.systemSizeKwp,
      pmDaysOnSite: site.pmDaysOnSite,
      pmVisitsPerAnnum: site.pmVisitsPerAnnum,
      siteFixedCosts: site.siteFixedCosts,
      variableCostAnnual,
      annualFee,
      monthlyFee,
      billingPortfolio,
      spvCode: site.spvCode,
    });

    groups.set(groupKey, row);
  }

  const rows = Array.from(groups.values())
    .map(finalizeRow)
    .sort((a, b) => b.monthlyFee - a.monthlyFee || a.spvCode.localeCompare(b.spvCode));

  const totals = finalizeRow(
    rows.reduce<SpvMonthlyRow>(
      (sum, row) => ({
        spvCode: 'TOTAL',
        spvName: 'Total',
        siteCount: sum.siteCount + row.siteCount,
        contractedSiteCount: sum.contractedSiteCount + row.contractedSiteCount,
        pendingSiteCount: sum.pendingSiteCount + row.pendingSiteCount,
        totalCapacityKwp: sum.totalCapacityKwp + row.totalCapacityKwp,
        contractedCapacityKwp: sum.contractedCapacityKwp + row.contractedCapacityKwp,
        siteFixedCostsAnnual: sum.siteFixedCostsAnnual + row.siteFixedCostsAnnual,
        variableCostAnnual: sum.variableCostAnnual + row.variableCostAnnual,
        annualFee: sum.annualFee + row.annualFee,
        monthlyFee: sum.monthlyFee + row.monthlyFee,
        averageFeePerKwp: 0,
        correctiveDaysAllowed: 0,
      }),
      { spvCode: 'TOTAL', spvName: 'Total', ...emptyTotals() }
    )
  );

  return {
    month,
    monthLabel: formatMonthLabel(month),
    availableMonths: buildAvailableMonths(sites.map((site) => site.onboardDate), month),
    rows,
    totals,
    portfolioBreakdowns: Array.from(portfolioGroups.values()).map(finalizePortfolioBreakdown),
  };
}
