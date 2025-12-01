import { Site, SiteWithCalculations, RateTier, PortfolioSummary, CMDaysUsage, CMDaysMonthData, CMDaysTrackingSummary } from '@/types';

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
  const correctiveDaysAllowed = calculateMonthlyCorrectiveDays(contractedCapacityKwp / 1000);
  
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

// CM Days calculation functions

/**
 * Calculate the corrective maintenance days allowed for a given capacity (in MW)
 * Formula: 1 CM day per MW per year = capacityMW / 12 per month
 */
export function calculateMonthlyCorrectiveDays(capacityMW: number): number {
  return Math.round((capacityMW / 12) * 10) / 10;
}

/**
 * Get the portfolio start date (earliest onboard date of any contracted site)
 */
export function getPortfolioStartDate(sites: Site[]): string | null {
  const contractedSites = sites.filter(s => s.contractStatus === 'Yes' && s.onboardDate);
  if (contractedSites.length === 0) return null;
  
  const sortedDates = contractedSites
    .map(s => s.onboardDate!)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  
  return sortedDates[0];
}

/**
 * Get all months from start date to current date in YYYY-MM format
 */
export function getMonthsFromStart(startDate: string): string[] {
  const months: string[] = [];
  const start = new Date(startDate);
  const now = new Date();
  
  // Normalize to first of month
  start.setDate(1);
  now.setDate(1);
  
  while (start <= now) {
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    start.setMonth(start.getMonth() + 1);
  }
  
  return months;
}

/**
 * Calculate contracted capacity in kWp for a specific month
 * (sum of system sizes for sites onboarded on or before the end of that month)
 */
export function getContractedCapacityKwpForMonth(sites: Site[], yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  const endOfMonth = new Date(year, month, 0); // Last day of the month
  
  return sites
    .filter(s => {
      if (s.contractStatus !== 'Yes' || !s.onboardDate) return false;
      const onboardDate = new Date(s.onboardDate);
      return onboardDate <= endOfMonth;
    })
    .reduce((sum, s) => sum + s.systemSizeKwp, 0);
}

/**
 * Calculate CM Days tracking data for all months since portfolio start
 */
export function calculateCMDaysTracking(
  sites: Site[],
  cmDaysUsage: CMDaysUsage[]
): CMDaysTrackingSummary {
  const portfolioStartDate = getPortfolioStartDate(sites);
  
  if (!portfolioStartDate) {
    return {
      portfolioStartDate: null,
      monthlyData: [],
      totalAccumulated: 0,
      totalUsed: 0,
      totalRemaining: 0,
    };
  }
  
  const months = getMonthsFromStart(portfolioStartDate);
  const usageMap = new Map(cmDaysUsage.map(u => [u.yearMonth, u.daysUsed]));
  
  let cumulativeAccumulated = 0;
  let cumulativeUsed = 0;
  
  const monthlyData: CMDaysMonthData[] = months.map(yearMonth => {
    const capacityMW = getContractedCapacityKwpForMonth(sites, yearMonth) / 1000;
    const daysAccumulated = calculateMonthlyCorrectiveDays(capacityMW);
    const daysUsed = usageMap.get(yearMonth) || 0;
    const daysRemaining = daysAccumulated - daysUsed;
    
    cumulativeAccumulated += daysAccumulated;
    cumulativeUsed += daysUsed;
    const cumulativeRemaining = cumulativeAccumulated - cumulativeUsed;
    
    return {
      yearMonth,
      daysAccumulated: Math.round(daysAccumulated * 10) / 10,
      daysUsed,
      daysRemaining: Math.round(daysRemaining * 10) / 10,
      cumulativeAccumulated: Math.round(cumulativeAccumulated * 10) / 10,
      cumulativeUsed: Math.round(cumulativeUsed * 10) / 10,
      cumulativeRemaining: Math.round(cumulativeRemaining * 10) / 10,
    };
  });
  
  return {
    portfolioStartDate,
    monthlyData,
    totalAccumulated: Math.round(cumulativeAccumulated * 10) / 10,
    totalUsed: Math.round(cumulativeUsed * 10) / 10,
    totalRemaining: Math.round((cumulativeAccumulated - cumulativeUsed) * 10) / 10,
  };
}

/**
 * Format year-month string to display format (e.g., "Jan 2024")
 */
export function formatYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
