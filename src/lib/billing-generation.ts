import { RateTier, SiteWithCalculations } from '@/types';
import { getMonthBounds, normalizeMonth } from './month-periods';
import { calculateAnnualFeeForTierForMonth, DEFAULT_RATE_TIERS } from './calculations';

export const APP_GENERATED_BILLING_SOURCE = 'APP_GENERATED';
export const NOTION_IMPORTED_BILLING_SOURCE = 'NOTION_IMPORTED';
export const BILLING_SNAPSHOT_STATUS_COMMITTED = 'COMMITTED';
export const APP_GENERATED_BILLING_DATABASE_ID = 'APP_GENERATED_MONTHLY_BILLING';
export const BILLING_SNAPSHOT_SYNC_STATUS_NOT_SYNCED = 'NOT_SYNCED';

export interface BillingSnapshotInput {
  contractId: string;
  contractName: string | null;
  siteId: string;
  notionDatabaseId: string;
  notionPageId: string;
  notionContractPageId: string;
  billingEntry: string;
  billingPeriod: Date;
  month: string;
  siteName: string;
  spvCode: string | null;
  spvName: string | null;
  appliedTier: string | null;
  provider: string | null;
  paymentStatus: string | null;
  expectedAmount: number;
  invoicedAmount: number | null;
  varianceAmount: number | null;
  variancePercent: number | null;
  varianceFlag: string | null;
  proRataFactor: number;
  invoiceReference: string | null;
  notes: string | null;
  systemSizeKwp: number;
  siteFixedCostsAnnual: number;
  variableCostAnnual: number;
  annualFee: number;
  sourcePayload: string;
}

export function billingSnapshotRefreshData(snapshot: BillingSnapshotInput) {
  return {
    notionContractPageId: snapshot.notionContractPageId,
    billingEntry: snapshot.billingEntry,
    billingPeriod: snapshot.billingPeriod,
    siteName: snapshot.siteName,
    spvCode: snapshot.spvCode,
    spvName: snapshot.spvName,
    appliedTier: snapshot.appliedTier,
    provider: snapshot.provider,
    paymentStatus: snapshot.paymentStatus,
    expectedAmount: snapshot.expectedAmount,
    invoicedAmount: snapshot.invoicedAmount,
    varianceAmount: snapshot.varianceAmount,
    variancePercent: snapshot.variancePercent,
    varianceFlag: snapshot.varianceFlag,
    proRataFactor: snapshot.proRataFactor,
    invoiceReference: snapshot.invoiceReference,
    notes: snapshot.notes,
    systemSizeKwp: snapshot.systemSizeKwp,
    siteFixedCostsAnnual: snapshot.siteFixedCostsAnnual,
    variableCostAnnual: snapshot.variableCostAnnual,
    annualFee: snapshot.annualFee,
    sourcePayload: snapshot.sourcePayload,
    notionSyncStatus: BILLING_SNAPSHOT_SYNC_STATUS_NOT_SYNCED,
    notionSyncedAt: null,
    notionSyncError: null,
  };
}

export interface BuildBillingSnapshotInputParams {
  contractId: string;
  contractName?: string | null;
  site: SiteWithCalculations;
  month: string;
  spvName?: string | null;
  notionContractPageId?: string | null;
  appliedTier?: RateTier | null;
}

export function normalizeBillingMonth(value: string | null | undefined): string | null {
  return normalizeMonth(value);
}

export function billingMonthBounds(month: string): { start: Date; end: Date } {
  return getMonthBounds(month);
}

function utcDateOnly(value: string | Date | null | undefined): Date | null {
  if (!value) return null;

  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isContracted(status: string): boolean {
  return ['YES', 'CONTRACTED', 'ACTIVE'].includes(status.toUpperCase()) || status === 'Contracted';
}

export function calculateProRataFactor(month: string, onboardDate: string | Date | null | undefined): number {
  const { start, end } = billingMonthBounds(month);
  const onboard = utcDateOnly(onboardDate);
  if (!onboard) return 0;
  if (onboard <= start) return 1;
  if (onboard > end) return 0;

  const daysInMonth = end.getUTCDate();
  const activeDays = daysInMonth - onboard.getUTCDate() + 1;
  return roundTo(activeDays / daysInMonth, 6);
}

function billingStartDate(site: { actualPacDate?: string | null; onboardDate: string | Date | null | undefined }): string | Date | null | undefined {
  return site.onboardDate || site.actualPacDate;
}

export function isEligibleForBilling(site: Pick<SiteWithCalculations, 'acceptedByOm' | 'contractStatus' | 'onboardDate'> & { actualPacDate?: string | null }, month: string): boolean {
  if (!site.acceptedByOm) return false;
  if (!isContracted(site.contractStatus)) return false;

  const pacDate = utcDateOnly(billingStartDate(site));
  if (!pacDate) return false;

  return pacDate <= billingMonthBounds(month).end;
}

export function buildBillingSnapshotInput(params: BuildBillingSnapshotInputParams): BillingSnapshotInput {
  const month = normalizeBillingMonth(params.month);
  if (!month) {
    throw new Error(`Invalid billing month: ${params.month}`);
  }

  const { site } = params;
  const { start } = billingMonthBounds(month);
  const appliedTier = params.appliedTier || DEFAULT_RATE_TIERS[0];
  const proRataFactor = calculateProRataFactor(month, billingStartDate(site));
  const annualFee = calculateAnnualFeeForTierForMonth(site, appliedTier, month);
  const variableCostAnnual = Math.max(annualFee - site.siteFixedCosts, 0);
  const monthlyFee = annualFee / 12;
  const billingPortfolio = site.billingPortfolio === 'EDEN' ? 'EDEN' : 'CORE';

  return {
    contractId: params.contractId,
    contractName: params.contractName || null,
    siteId: site.id,
    notionDatabaseId: APP_GENERATED_BILLING_DATABASE_ID,
    notionPageId: `${APP_GENERATED_BILLING_SOURCE}:${month}:${site.id}`,
    notionContractPageId: params.notionContractPageId || '',
    billingEntry: `${site.name} ${month}`,
    billingPeriod: start,
    month,
    siteName: site.name,
    spvCode: site.spvCode,
    spvName: params.spvName || site.spvCode || null,
    appliedTier: appliedTier.tierName,
    provider: 'O&M Tracker',
    paymentStatus: 'NOT_INVOICED',
    expectedAmount: monthlyFee * proRataFactor,
    invoicedAmount: null,
    varianceAmount: null,
    variancePercent: null,
    varianceFlag: null,
    proRataFactor,
    invoiceReference: null,
    notes: null,
    systemSizeKwp: site.systemSizeKwp,
    siteFixedCostsAnnual: site.siteFixedCosts,
    variableCostAnnual,
    annualFee,
    sourcePayload: JSON.stringify({
      source: APP_GENERATED_BILLING_SOURCE,
      contract: {
        id: params.contractId,
        name: params.contractName || null,
      },
      site: {
        id: site.id,
        name: site.name,
        systemSizeKwp: site.systemSizeKwp,
        contractStatus: site.contractStatus,
        onboardDate: site.onboardDate,
        forecastPacDate: site.forecastPacDate,
        actualPacDate: site.actualPacDate,
        pmCost: site.pmCost,
        pmDaysOnSite: site.pmDaysOnSite,
        pmVisitsPerAnnum: site.pmVisitsPerAnnum,
        cctvCost: site.cctvCost,
        cleaningCost: site.cleaningCost,
        additionalCostAnnual: site.additionalCostAnnual,
        additionalCostAnnualComment: site.additionalCostAnnualComment,
        additionalCostMonthly: site.additionalCostMonthly,
        additionalCostMonthlyComment: site.additionalCostMonthlyComment,
        additionalCostMonthlyStartMonth: site.additionalCostMonthlyStartMonth,
        additionalCostMonthlyEndMonth: site.additionalCostMonthlyEndMonth,
        spvCode: site.spvCode,
        billingPortfolio,
      },
      calculations: {
        siteFixedCosts: site.siteFixedCosts,
        appliedTier: appliedTier.tierName,
        ratePerKwp: appliedTier.ratePerKwp,
        annualFee,
        monthlyFee,
        proRataFactor,
        pricingCapacityBasis: 'COMBINED_CORE_AND_EDEN_CONTRACTED_CAPACITY',
      },
    }),
  };
}
