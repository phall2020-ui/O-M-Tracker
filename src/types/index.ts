// Core Types for Portfolio Tracker

export type ContractStatus = 'Yes' | 'No';
export type SiteType = 'Rooftop' | 'Ground Mount';

export interface SPV {
  id: string;
  code: string;
  name: string;
}

export interface RateTier {
  id: string;
  tierName: string;
  minCapacityMW: number;
  maxCapacityMW: number | null;
  ratePerKwp: number;
}

export interface Site {
  id: string;
  name: string;
  systemSizeKwp: number;
  siteType: SiteType;
  contractStatus: ContractStatus;
  onboardDate: string | null;
  pmCost: number;
  cctvCost: number;
  cleaningCost: number;
  spvId: string | null;
  spvCode: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: string;
  updatedAt: string;
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
}

export interface PortfolioSummary {
  totalSites: number;
  contractedSites: number;
  totalCapacityKwp: number;
  contractedCapacityKwp: number;
  currentTier: string;
  totalMonthlyFee: number;
  correctiveDaysAllowed: number;
  sitesBySpv: Record<string, number>;
}

export interface SiteFormData {
  name: string;
  systemSizeKwp: number;
  siteType: SiteType;
  contractStatus: ContractStatus;
  onboardDate: string | null;
  pmCost: number;
  cctvCost: number;
  cleaningCost: number;
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

// CM Days Tracking types
export interface CMDaysUsage {
  id: string;
  yearMonth: string;  // Format: YYYY-MM
  daysUsed: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CMDaysMonthData {
  yearMonth: string;
  daysAccumulated: number;  // Days allowed/accumulated that month
  daysUsed: number;         // Days used (manually entered)
  daysRemaining: number;    // Accumulated - Used
  cumulativeAccumulated: number;  // Running total of accumulated days
  cumulativeUsed: number;         // Running total of used days
  cumulativeRemaining: number;    // Running total of remaining days
}

export interface CMDaysTrackingSummary {
  portfolioStartDate: string | null;
  monthlyData: CMDaysMonthData[];
  totalAccumulated: number;
  totalUsed: number;
  totalRemaining: number;
}
