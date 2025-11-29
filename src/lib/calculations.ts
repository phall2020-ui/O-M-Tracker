import { Site, SiteWithCalculations, RateTier, PortfolioSummary } from '@/types';

// Default rate tiers matching the spreadsheet
export const DEFAULT_RATE_TIERS: RateTier[] = [
  { id: '1', tierName: '<20MW', minCapacityMW: 0, maxCapacityMW: 20, ratePerKwp: 2.0 },
  { id: '2', tierName: '20-30MW', minCapacityMW: 20, maxCapacityMW: 30, ratePerKwp: 1.8 },
  { id: '3', tierName: '30-40MW', minCapacityMW: 30, maxCapacityMW: 40, ratePerKwp: 1.7 },
];

export function calculateSiteFixedCosts(site: Site): number {
  return site.pmCost + site.cctvCost + site.cleaningCost;
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

export function determinePortfolioTier(totalCapacityMW: number, tiers: RateTier[] = DEFAULT_RATE_TIERS): RateTier {
  // Find the appropriate tier based on total capacity
  for (const tier of tiers) {
    if (tier.maxCapacityMW === null || totalCapacityMW < tier.maxCapacityMW) {
      return tier;
    }
  }
  return tiers[tiers.length - 1];
}

export function calculateSiteWithAllTiers(
  site: Site,
  tiers: RateTier[] = DEFAULT_RATE_TIERS
): SiteWithCalculations {
  const siteFixedCosts = calculateSiteFixedCosts(site);
  const isContracted = site.contractStatus === 'Yes';
  
  // Calculate for each tier
  const tier20MW = tiers.find(t => t.tierName === '<20MW') || tiers[0];
  const tier30MW = tiers.find(t => t.tierName === '20-30MW') || tiers[1];
  const tier40MW = tiers.find(t => t.tierName === '30-40MW') || tiers[2];
  
  const portfolioCost_20MW = calculatePortfolioCost(site.systemSizeKwp, tier20MW.ratePerKwp);
  const portfolioCost_30MW = calculatePortfolioCost(site.systemSizeKwp, tier30MW.ratePerKwp);
  const portfolioCost_40MW = calculatePortfolioCost(site.systemSizeKwp, tier40MW.ratePerKwp);
  
  const fixedFee_20MW = calculateFixedFee(siteFixedCosts, portfolioCost_20MW);
  const fixedFee_30MW = calculateFixedFee(siteFixedCosts, portfolioCost_30MW);
  const fixedFee_40MW = calculateFixedFee(siteFixedCosts, portfolioCost_40MW);
  
  const feePerKwp_20MW = calculateFeePerKwp(fixedFee_20MW, site.systemSizeKwp, isContracted);
  const feePerKwp_30MW = calculateFeePerKwp(fixedFee_30MW, site.systemSizeKwp, isContracted);
  const feePerKwp_40MW = calculateFeePerKwp(fixedFee_40MW, site.systemSizeKwp, isContracted);
  
  // Monthly fee based on <20MW tier (default)
  const monthlyFee = isContracted ? calculateMonthlyFee(fixedFee_20MW) : 0;
  
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

export function calculatePortfolioSummary(sites: Site[]): PortfolioSummary {
  const contractedSites = sites.filter(s => s.contractStatus === 'Yes');
  const totalCapacityKwp = sites.reduce((sum, s) => sum + s.systemSizeKwp, 0);
  const contractedCapacityKwp = contractedSites.reduce((sum, s) => sum + s.systemSizeKwp, 0);
  
  const currentTier = determinePortfolioTier(contractedCapacityKwp / 1000);
  
  // Calculate total monthly fee
  const sitesWithCalcs = contractedSites.map(s => calculateSiteWithAllTiers(s));
  const totalMonthlyFee = sitesWithCalcs.reduce((sum, s) => sum + s.monthlyFee, 0);
  
  // Corrective days calculation
  const correctiveDaysAllowed = Math.round((contractedCapacityKwp / 1000 / 12) * 10) / 10;
  
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
