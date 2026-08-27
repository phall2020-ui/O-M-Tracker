// Core Types for Portfolio Tracker

export type ContractStatus = 'Contracted' | 'Awaiting Contract' | 'Awaiting PAC' | 'Yes' | 'No';
export type SiteType = 'Rooftop' | 'Ground Mount';
export type BillingPortfolioCode = 'CORE' | 'EDEN';

export interface Contract {
  id: string;
  code: string;
  name: string;
  description: string | null;
  notionSummaryPageId?: string | null;
  notionBillingDatabaseId?: string | null;
  contractorId?: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface ContractScopedParams {
  contractId?: string | null;
}

export interface SPV {
  id: string;
  contractId: string;
  code: string;
  name: string;
}

export interface RateTier {
  id: string;
  contractId: string;
  tierName: string;
  minCapacityMW: number;
  maxCapacityMW: number | null;
  ratePerKwp: number;
}

export interface Site {
  id: string;
  contractId: string;
  name: string;
  systemSizeKwp: number;
  siteType: SiteType;
  contractStatus: ContractStatus;
  onboardDate: string | null;
  forecastPacDate: string | null;
  actualPacDate: string | null;
  pmCost: number;
  pmDaysOnSite: number;
  pmVisitsPerAnnum: number;
  cctvCost: number;
  cleaningCost: number;
  additionalCostAnnual: number;
  additionalCostAnnualComment: string | null;
  additionalCostMonthly: number;
  additionalCostMonthlyComment: string | null;
  additionalCostMonthlyStartMonth: string | null;
  additionalCostMonthlyEndMonth: string | null;
  billingPortfolio: BillingPortfolioCode;
  spvId: string | null;
  spvCode: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SitePricingBreakdownLine {
  label: string;
  calculation: string;
  annualValue: number;
  note?: string | null;
}

export interface SitePricingBreakdown {
  isBillable: boolean;
  reviewStatus: 'VERIFIED' | 'NEEDS_REVIEW';
  reviewReason: string;
  appliedTierName: string;
  appliedTierRatePerKwp: number;
  contractedCapacityKwpForTier: number;
  siteFixedCostsAnnual: number;
  portfolioCostAnnual: number;
  additionalMonthlyAnnual: number;
  annualFee: number;
  monthlyFee: number;
  formula: string;
  lines: SitePricingBreakdownLine[];
}

export interface SiteWithCalculations extends Site {
  // Site fixed costs
  siteFixedCosts: number;
  
  // Portfolio costs by tier
  portfolioCost_20MW: number;
  portfolioCost_30MW: number;
  portfolioCost_40MW: number;
  
  // Fixed fees by tier
  fixedFee_20MW: number;
  fixedFee_30MW: number;
  fixedFee_40MW: number;
  
  // Fee per kWp by tier
  feePerKwp_20MW: number;
  feePerKwp_30MW: number;
  feePerKwp_40MW: number;
  
  // Monthly fee (based on current portfolio tier)
  monthlyFee: number;

  // Transparent O&M pricing verification build-up
  pricingBreakdown: SitePricingBreakdown;
}

export interface PortfolioSummary {
  totalSites: number;
  contractedSites: number;
  totalCapacityKwp: number;
  contractedCapacityKwp: number;
  currentTier: string;
  currentTierRatePerKwp: number;
  totalMonthlyFee: number;
  correctiveDaysAllowed: number;
  sitesBySpv: Record<string, number>;
  portfolioBreakdowns: BillingPortfolioBreakdown[];
}

export interface BillingPortfolioBreakdown {
  billingPortfolio: BillingPortfolioCode;
  billingPortfolioLabel: string;
  siteCount: number;
  contractedSiteCount: number;
  pendingSiteCount: number;
  totalCapacityKwp: number;
  contractedCapacityKwp: number;
  siteFixedCostsAnnual: number;
  variableCostAnnual: number;
  annualFee: number;
  monthlyFee: number;
  correctiveDaysAllowed: number;
}

export interface MonthOption {
  value: string;
  label: string;
}

export interface SpvMonthlySiteLine {
  id: string;
  siteId: string | null;
  name: string;
  contractStatus: ContractStatus;
  systemSizeKwp: number;
  pmDaysOnSite: number;
  pmVisitsPerAnnum: number;
  siteFixedCosts: number;
  variableCostAnnual: number;
  annualFee: number;
  monthlyFee: number;
  billingPortfolio: BillingPortfolioCode;
  spvCode: string | null;
}

export interface SpvMonthlyRow {
  spvCode: string;
  spvName: string;
  billingPortfolio?: BillingPortfolioCode;
  billingPortfolioLabel?: string;
  siteCount: number;
  contractedSiteCount: number;
  pendingSiteCount: number;
  totalCapacityKwp: number;
  contractedCapacityKwp: number;
  siteFixedCostsAnnual: number;
  variableCostAnnual: number;
  annualFee: number;
  monthlyFee: number;
  averageFeePerKwp: number;
  correctiveDaysAllowed: number;
  billingSnapshotCount?: number;
  invoicedAmount?: number;
  adjustmentAmount?: number;
  adjustedMonthlyFee?: number;
  siteLines?: SpvMonthlySiteLine[];
}

export interface SpvMonthlyReport {
  month: string;
  monthLabel: string;
  source?: 'calculated-sites' | 'billing-snapshots';
  isLocked?: boolean;
  availableMonths: MonthOption[];
  rows: SpvMonthlyRow[];
  totals: Omit<SpvMonthlyRow, 'spvCode' | 'spvName'>;
  portfolioBreakdowns?: BillingPortfolioBreakdown[];
  adjustments?: BillingAdjustmentSummary[];
}

export interface BillingAdjustmentSummary {
  id: string;
  month: string;
  scope: 'SITE' | 'PORTFOLIO';
  allocationMode: 'KEEP_PORTFOLIO' | 'SPLIT_BY_SPV_CAPACITY';
  description: string;
  amount: number;
  category: string | null;
  siteId: string | null;
  siteName: string | null;
  spvCode: string | null;
  spvName: string | null;
  createdAt: string;
}

export interface SiteFormData {
  contractId?: string | null;
  name: string;
  systemSizeKwp: number;
  siteType: SiteType;
  contractStatus: ContractStatus;
  onboardDate: string | null;
  forecastPacDate?: string | null;
  actualPacDate?: string | null;
  pmCost: number;
  pmDaysOnSite: number;
  pmVisitsPerAnnum: number;
  cctvCost: number;
  cleaningCost: number;
  additionalCostAnnual: number;
  additionalCostAnnualComment: string | null;
  additionalCostMonthly: number;
  additionalCostMonthlyComment: string | null;
  additionalCostMonthlyStartMonth: string | null;
  additionalCostMonthlyEndMonth: string | null;
  billingPortfolio?: BillingPortfolioCode;
  spvId: string | null;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
