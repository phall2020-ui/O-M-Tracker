import { BillingPortfolioBreakdown, BillingPortfolioCode, Site, SiteWithCalculations, RateTier, PortfolioSummary } from '@/types';

// Default rate tiers matching the spreadsheet
export const DEFAULT_RATE_TIERS: RateTier[] = [
  { id: '1', contractId: 'DEFAULT', tierName: '<20MW', minCapacityMW: 0, maxCapacityMW: 20, ratePerKwp: 2.0 },
  { id: '2', contractId: 'DEFAULT', tierName: '20-30MW', minCapacityMW: 20, maxCapacityMW: 30, ratePerKwp: 1.8 },
  { id: '3', contractId: 'DEFAULT', tierName: '30-40MW', minCapacityMW: 30, maxCapacityMW: 40, ratePerKwp: 1.7 },
];

export function calculateSiteFixedCosts(site: Site): number {
  return site.pmCost + site.cctvCost + site.cleaningCost + (site.additionalCostAnnual || 0);
}

export function calculatePortfolioCost(systemSizeKwp: number, ratePerKwp: number): number {
  return systemSizeKwp * ratePerKwp;
}

export function calculateFixedFee(siteFixedCosts: number, portfolioCost: number): number {
  return siteFixedCosts + portfolioCost;
}

export function calculateFeePerKwp(fixedFee: number, systemSizeKwp: number, isContracted: boolean): number {
  if (!isContracted || systemSizeKwp === 0) return 0;
  return fixedFee / systemSizeKwp;
}

export function calculateMonthlyFee(fixedFee: number): number {
  return fixedFee / 12;
}

export function billingPortfolioLabel(portfolio: BillingPortfolioCode): string {
  return portfolio === 'EDEN' ? 'Eden' : 'Core';
}

export function determinePortfolioTier(totalCapacityMW: number, tiers: RateTier[] = DEFAULT_RATE_TIERS): RateTier {
  // Find the appropriate tier based on total capacity
  for (const tier of tiers) {
    if (tier.maxCapacityMW === null || totalCapacityMW < tier.maxCapacityMW) {
      return tier;
    }
  }
  return tiers[tiers.length - 1];
}

function tierByName(tiers: RateTier[], name: string, fallbackIndex: number): RateTier {
  return tiers.find(t => t.tierName === name) || tiers[fallbackIndex] || tiers[0];
}

export function isContractedStatus(status: string): boolean {
  return ['Contracted', 'CONTRACTED', 'Yes', 'YES', 'Active', 'ACTIVE'].includes(status);
}

export function siteBillingStartDate(site: { actualPacDate?: string | null; onboardDate: string | null }): string | null {
  return site.onboardDate || site.actualPacDate || null;
}

export function isSiteVisibleByMonthEnd(site: { actualPacDate?: string | null; onboardDate: string | null }, monthEnd?: Date | null): boolean {
  const startDate = siteBillingStartDate(site);
  if (!monthEnd || !startDate) return true;
  return new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`) <= monthEnd;
}

export function contractedCapacityForTier(
  sites: Array<Pick<Site, 'contractStatus' | 'systemSizeKwp' | 'onboardDate'> & { actualPacDate?: string | null }>,
  monthEnd?: Date | null
): number {
  return sites
    .filter((site) => isContractedStatus(site.contractStatus) && isSiteVisibleByMonthEnd(site, monthEnd))
    .reduce((sum, site) => sum + site.systemSizeKwp, 0);
}

export function currentPortfolioTier(
  sites: Array<Pick<Site, 'contractStatus' | 'systemSizeKwp' | 'onboardDate'> & { actualPacDate?: string | null }>,
  tiers: RateTier[] = DEFAULT_RATE_TIERS,
  monthEnd?: Date | null
): RateTier {
  return determinePortfolioTier(contractedCapacityForTier(sites, monthEnd) / 1000, tiers);
}

export function calculateAnnualFeeForTier(site: Site, tier: RateTier): number {
  return calculateAnnualFeeForTierForMonth(site, tier);
}

function isMonthValue(value: string | null | undefined): value is string {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '');
}

export function isAdditionalMonthlyCostActive(site: Site, month?: string | null): boolean {
  if (!site.additionalCostMonthly) return false;
  if (!month) return true;

  const normalizedMonth = isMonthValue(month) ? month : null;
  if (!normalizedMonth) return true;

  const startMonth = isMonthValue(site.additionalCostMonthlyStartMonth) ? site.additionalCostMonthlyStartMonth : null;
  const endMonth = isMonthValue(site.additionalCostMonthlyEndMonth) ? site.additionalCostMonthlyEndMonth : null;

  if (startMonth && normalizedMonth < startMonth) return false;
  if (endMonth && normalizedMonth > endMonth) return false;
  return true;
}

export function calculateAnnualFeeForTierForMonth(site: Site, tier: RateTier, month?: string | null): number {
  if (!isContractedStatus(site.contractStatus)) return 0;
  return calculateFixedFee(calculateSiteFixedCosts(site), calculatePortfolioCost(site.systemSizeKwp, tier.ratePerKwp)) + calculateAdditionalMonthlyAnnual(site, month);
}

function calculateAdditionalMonthlyAnnual(site: Site, month?: string | null): number {
  return isAdditionalMonthlyCostActive(site, month) ? (site.additionalCostMonthly || 0) * 12 : 0;
}

export function calculateSiteWithAllTiers(
  site: Site,
  tiers: RateTier[] = DEFAULT_RATE_TIERS,
  appliedTier?: RateTier,
  month?: string | null
): SiteWithCalculations {
  const siteFixedCosts = calculateSiteFixedCosts(site);
  const isContracted = isContractedStatus(site.contractStatus);
  
  // Calculate for each tier
  const tier20MW = tierByName(tiers, '<20MW', 0);
  const tier30MW = tierByName(tiers, '20-30MW', 1);
  const tier40MW = tierByName(tiers, '30-40MW', 2);
  
  const portfolioCost_20MW = calculatePortfolioCost(site.systemSizeKwp, tier20MW.ratePerKwp);
  const portfolioCost_30MW = calculatePortfolioCost(site.systemSizeKwp, tier30MW.ratePerKwp);
  const portfolioCost_40MW = calculatePortfolioCost(site.systemSizeKwp, tier40MW.ratePerKwp);
  
  const additionalMonthlyAnnual = calculateAdditionalMonthlyAnnual(site, month);
  const fixedFee_20MW = calculateFixedFee(siteFixedCosts, portfolioCost_20MW) + additionalMonthlyAnnual;
  const fixedFee_30MW = calculateFixedFee(siteFixedCosts, portfolioCost_30MW) + additionalMonthlyAnnual;
  const fixedFee_40MW = calculateFixedFee(siteFixedCosts, portfolioCost_40MW) + additionalMonthlyAnnual;
  
  const feePerKwp_20MW = calculateFeePerKwp(fixedFee_20MW, site.systemSizeKwp, isContracted);
  const feePerKwp_30MW = calculateFeePerKwp(fixedFee_30MW, site.systemSizeKwp, isContracted);
  const feePerKwp_40MW = calculateFeePerKwp(fixedFee_40MW, site.systemSizeKwp, isContracted);
  
  // Monthly fee based on the active portfolio tier, which is derived from contracted capacity only.
  const selectedTier = appliedTier || tier20MW;
  const monthlyFee = isContracted ? calculateMonthlyFee(calculateAnnualFeeForTierForMonth(site, selectedTier, month)) : 0;
  
  return {
    ...site,
    siteFixedCosts,
    portfolioCost_20MW,
    portfolioCost_30MW,
    portfolioCost_40MW,
    fixedFee_20MW,
    fixedFee_30MW,
    fixedFee_40MW,
    feePerKwp_20MW,
    feePerKwp_30MW,
    feePerKwp_40MW,
    monthlyFee,
  };
}

function emptyBillingPortfolioBreakdown(billingPortfolio: BillingPortfolioCode): BillingPortfolioBreakdown {
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

function finalizeBillingPortfolioBreakdown(row: BillingPortfolioBreakdown): BillingPortfolioBreakdown {
  return {
    ...row,
    correctiveDaysAllowed: Math.floor(row.contractedCapacityKwp / 1000 / 12),
  };
}

export function buildBillingPortfolioBreakdowns(sites: Site[], tier: RateTier): BillingPortfolioBreakdown[] {
  const breakdowns = new Map<BillingPortfolioCode, BillingPortfolioBreakdown>([
    ['CORE', emptyBillingPortfolioBreakdown('CORE')],
    ['EDEN', emptyBillingPortfolioBreakdown('EDEN')],
  ]);

  for (const site of sites) {
    const billingPortfolio = site.billingPortfolio === 'EDEN' ? 'EDEN' : 'CORE';
    const row = breakdowns.get(billingPortfolio)!;
    row.siteCount += 1;
    row.totalCapacityKwp += site.systemSizeKwp;

    if (isContractedStatus(site.contractStatus)) {
      const siteFixedCosts = calculateSiteFixedCosts(site);
      const annualFee = calculateAnnualFeeForTier(site, tier);
      row.contractedSiteCount += 1;
      row.contractedCapacityKwp += site.systemSizeKwp;
      row.siteFixedCostsAnnual += siteFixedCosts;
      row.variableCostAnnual += Math.max(annualFee - siteFixedCosts, 0);
      row.annualFee += annualFee;
      row.monthlyFee += annualFee / 12;
    } else {
      row.pendingSiteCount += 1;
    }
  }

  return Array.from(breakdowns.values()).map(finalizeBillingPortfolioBreakdown);
}

export function calculatePortfolioSummary(sites: Site[], tiers: RateTier[] = DEFAULT_RATE_TIERS): PortfolioSummary {
  const contractedSites = sites.filter(s => isContractedStatus(s.contractStatus));
  const totalCapacityKwp = sites.reduce((sum, s) => sum + s.systemSizeKwp, 0);
  const contractedCapacityKwp = contractedSites.reduce((sum, s) => sum + s.systemSizeKwp, 0);
  
  const currentTier = determinePortfolioTier(contractedCapacityKwp / 1000, tiers);
  
  // Calculate total monthly fee
  const sitesWithCalcs = contractedSites.map(s => calculateSiteWithAllTiers(s, tiers, currentTier));
  const totalMonthlyFee = sitesWithCalcs.reduce((sum, s) => sum + s.monthlyFee, 0);
  
  // Corrective days calculation
  const correctiveDaysAllowed = Math.floor(contractedCapacityKwp / 1000 / 12);
  
  // Sites by SPV
  const sitesBySpv: Record<string, number> = {};
  sites.forEach(site => {
    const spv = site.spvCode || 'Unassigned';
    sitesBySpv[spv] = (sitesBySpv[spv] || 0) + 1;
  });
  
  return {
    totalSites: sites.length,
    contractedSites: contractedSites.length,
    totalCapacityKwp,
    contractedCapacityKwp,
    currentTier: currentTier.tierName,
    totalMonthlyFee,
    correctiveDaysAllowed,
    sitesBySpv,
    portfolioBreakdowns: buildBillingPortfolioBreakdowns(sites, currentTier),
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
