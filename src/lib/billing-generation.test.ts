import { describe, expect, it } from 'vitest';
import {
  billingSnapshotRefreshData,
  billingMonthBounds,
  buildBillingSnapshotInput,
  calculateProRataFactor,
  isEligibleForBilling,
  normalizeBillingMonth,
} from './billing-generation';
import { SiteWithCalculations } from '@/types';

function site(overrides: Partial<SiteWithCalculations>): SiteWithCalculations {
  return {
    id: 'site-1',
    contractId: 'contract-1',
    name: 'Example Site',
    systemSizeKwp: 1000,
    siteType: 'Rooftop',
    contractStatus: 'Contracted',
    onboardDate: '2026-05-01',
    pmCost: 120,
    pmDaysOnSite: 0,
    pmVisitsPerAnnum: 0,
    cctvCost: 60,
    cleaningCost: 20,
    additionalCostAnnual: 0,
    additionalCostAnnualComment: null,
    additionalCostMonthly: 0,
    additionalCostMonthlyComment: null,
    additionalCostMonthlyStartMonth: null,
    additionalCostMonthlyEndMonth: null,
    billingPortfolio: 'CORE',
    spvId: 'spv-1',
    spvCode: 'OS2',
    sourceSheet: null,
    sourceRow: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    siteFixedCosts: 200,
    portfolioCost_20MW: 2000,
    portfolioCost_30MW: 1800,
    portfolioCost_40MW: 1700,
    fixedFee_20MW: 2200,
    fixedFee_30MW: 2000,
    fixedFee_40MW: 1900,
    feePerKwp_20MW: 2.2,
    feePerKwp_30MW: 2,
    feePerKwp_40MW: 1.9,
    monthlyFee: 183.33333333333334,
    ...overrides,
    forecastPacDate: overrides.forecastPacDate ?? null,
    actualPacDate: overrides.actualPacDate ?? null,
  };
}

describe('billing generation', () => {
  it('normalizes valid billing months and rejects malformed months', () => {
    expect(normalizeBillingMonth('2026-05')).toBe('2026-05');
    expect(normalizeBillingMonth('2026-5')).toBeNull();
    expect(normalizeBillingMonth('2026-13')).toBeNull();
    expect(normalizeBillingMonth(null)).toBeNull();
  });

  it('calculates UTC billing month bounds', () => {
    const bounds = billingMonthBounds('2026-02');

    expect(bounds.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });

  it('calculates inclusive pro-rata factors for onboarding inside the month', () => {
    expect(calculateProRataFactor('2026-05', '2026-04-30')).toBe(1);
    expect(calculateProRataFactor('2026-05', '2026-05-16')).toBeCloseTo(16 / 31, 6);
    expect(calculateProRataFactor('2026-05', '2026-05-31')).toBeCloseTo(1 / 31, 6);
    expect(calculateProRataFactor('2026-05', '2026-06-01')).toBe(0);
  });

  it('only bills contracted sites onboarded by the end of the month', () => {
    expect(isEligibleForBilling(site({ contractStatus: 'Contracted', onboardDate: '2026-05-31' }), '2026-05')).toBe(true);
    expect(isEligibleForBilling(site({ contractStatus: 'Awaiting PAC', onboardDate: '2026-05-01' }), '2026-05')).toBe(false);
    expect(isEligibleForBilling(site({ contractStatus: 'Contracted', onboardDate: null }), '2026-05')).toBe(false);
    expect(isEligibleForBilling(site({ contractStatus: 'Contracted', onboardDate: '2026-06-01' }), '2026-05')).toBe(false);
  });

  it('freezes calculated site values into immutable snapshot input', () => {
    const snapshot = buildBillingSnapshotInput({
      contractId: 'contract-1',
      site: site({ onboardDate: '2026-05-16' }),
      month: '2026-05',
      spvName: 'Olympus Solar 2 Ltd',
      notionContractPageId: 'notion-contract-1',
      appliedTier: { id: '2', contractId: 'contract-1', tierName: '20-30MW', minCapacityMW: 20, maxCapacityMW: 30, ratePerKwp: 1.8 },
    });

    expect(snapshot.contractId).toBe('contract-1');
    expect(snapshot).toMatchObject({
      siteId: 'site-1',
      month: '2026-05',
      siteName: 'Example Site',
      spvCode: 'OS2',
      spvName: 'Olympus Solar 2 Ltd',
      notionContractPageId: 'notion-contract-1',
      systemSizeKwp: 1000,
      siteFixedCostsAnnual: 200,
      variableCostAnnual: 1800,
      annualFee: 2000,
      proRataFactor: 0.516129,
    });
    expect(snapshot.appliedTier).toBe('20-30MW');
    expect(snapshot.expectedAmount).toBeCloseTo(86.0215, 4);
    expect(snapshot.sourcePayload).toContain('"contract":{"id":"contract-1"');
    expect(snapshot.sourcePayload).toContain('"monthlyFee":166.66666666666666');
  });

  it('freezes Eden billing portfolio metadata while using the supplied combined tier', () => {
    const snapshot = buildBillingSnapshotInput({
      contractId: 'contract-1',
      site: site({ billingPortfolio: 'EDEN', systemSizeKwp: 6000 }),
      month: '2026-05',
      appliedTier: { id: '2', contractId: 'contract-1', tierName: '20-30MW', minCapacityMW: 20, maxCapacityMW: 30, ratePerKwp: 1.8 },
    });

    expect(snapshot.contractId).toBe('contract-1');
    expect(snapshot.sourcePayload).toContain('"contract":{"id":"contract-1"');
    expect(snapshot.appliedTier).toBe('20-30MW');
    expect(snapshot.sourcePayload).toContain('"billingPortfolio":"EDEN"');
    expect(snapshot.sourcePayload).toContain('"pricingCapacityBasis":"COMBINED_CORE_AND_EDEN_CONTRACTED_CAPACITY"');
    expect(snapshot.annualFee).toBe(6000 * 1.8 + 200);
  });

  it('only includes monthly additional costs in snapshots for configured months', () => {
    const base = site({
      additionalCostMonthly: 25,
      additionalCostMonthlyComment: 'Temporary monitoring',
      additionalCostMonthlyStartMonth: '2026-05',
      additionalCostMonthlyEndMonth: '2026-05',
    });

    const may = buildBillingSnapshotInput({ contractId: 'contract-1', site: base, month: '2026-05' });
    const june = buildBillingSnapshotInput({ contractId: 'contract-1', site: base, month: '2026-06' });

    expect(may.contractId).toBe('contract-1');
    expect(may.sourcePayload).toContain('"contract":{"id":"contract-1"');
    expect(may.annualFee).toBe(200 + 1000 * 2 + 25 * 12);
    expect(may.expectedAmount).toBeCloseTo((200 + 1000 * 2) / 12 + 25, 2);
    expect(may.sourcePayload).toContain('"additionalCostMonthlyComment":"Temporary monitoring"');
    expect(june.annualFee).toBe(200 + 1000 * 2);
    expect(june.expectedAmount).toBeCloseTo((200 + 1000 * 2) / 12, 2);
  });

  it('builds refresh data for unlocked app-generated snapshots', () => {
    const snapshot = buildBillingSnapshotInput({
      contractId: 'contract-1',
      site: site({ spvCode: 'FS', spvId: 'spv-2' }),
      month: '2026-05',
      spvName: 'Fylde Solar Ltd',
      notionContractPageId: 'notion-contract-1',
      appliedTier: { id: '2', contractId: 'contract-1', tierName: '20-30MW', minCapacityMW: 20, maxCapacityMW: 30, ratePerKwp: 1.8 },
    });

    expect(snapshot.contractId).toBe('contract-1');
    expect(snapshot.sourcePayload).toContain('"contract":{"id":"contract-1"');
    expect(billingSnapshotRefreshData(snapshot)).toMatchObject({
      siteName: 'Example Site',
      spvCode: 'FS',
      spvName: 'Fylde Solar Ltd',
      expectedAmount: snapshot.expectedAmount,
      notionSyncStatus: 'NOT_SYNCED',
      notionSyncedAt: null,
      notionSyncError: null,
    });
  });
});
