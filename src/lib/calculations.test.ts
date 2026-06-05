import { describe, expect, it } from 'vitest';
import {
  calculatePortfolioSummary,
  calculateSiteWithAllTiers,
  currentPortfolioTier,
  DEFAULT_RATE_TIERS,
} from './calculations';
import { Site } from '@/types';

function site(overrides: Partial<Site>): Site {
  return {
    id: overrides.id || 'site-1',
    contractId: 'contract-1',
    name: overrides.name || 'Example Site',
    systemSizeKwp: overrides.systemSizeKwp || 1000,
    siteType: 'Rooftop',
    contractStatus: 'Contracted',
    onboardDate: '2026-05-01',
    pmCost: 100,
    pmDaysOnSite: 0,
    pmVisitsPerAnnum: 0,
    cctvCost: 50,
    cleaningCost: 50,
    additionalCostAnnual: 0,
    additionalCostAnnualComment: null,
    additionalCostMonthly: 0,
    additionalCostMonthlyComment: null,
    additionalCostMonthlyStartMonth: null,
    additionalCostMonthlyEndMonth: null,
    billingPortfolio: overrides.billingPortfolio || 'CORE',
    spvId: null,
    spvCode: overrides.spvCode || 'OS2',
    sourceSheet: null,
    sourceRow: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
    forecastPacDate: overrides.forecastPacDate ?? null,
    actualPacDate: overrides.actualPacDate ?? null,
  };
}

describe('portfolio calculations', () => {
  it('uses combined Core and Eden contracted capacity for tier pricing', () => {
    const core = site({ id: 'core', billingPortfolio: 'CORE', systemSizeKwp: 15_000 });
    const eden = site({ id: 'eden', billingPortfolio: 'EDEN', systemSizeKwp: 6_000 });

    expect(currentPortfolioTier([core, eden], DEFAULT_RATE_TIERS).tierName).toBe('20-30MW');
  });

  it('prices Eden and Core with the same combined tier rate but reports them separately', () => {
    const tier = DEFAULT_RATE_TIERS[1];
    const core = calculateSiteWithAllTiers(site({ id: 'core', billingPortfolio: 'CORE', systemSizeKwp: 15_000 }), DEFAULT_RATE_TIERS, tier);
    const eden = calculateSiteWithAllTiers(site({ id: 'eden', billingPortfolio: 'EDEN', systemSizeKwp: 6_000 }), DEFAULT_RATE_TIERS, tier);
    const summary = calculatePortfolioSummary([core, eden]);

    expect(summary.currentTier).toBe('20-30MW');
    expect(core.monthlyFee).toBeCloseTo((200 + 15_000 * 1.8) / 12, 2);
    expect(eden.monthlyFee).toBeCloseTo((200 + 6_000 * 1.8) / 12, 2);
    expect(summary.portfolioBreakdowns).toEqual([
      expect.objectContaining({
        billingPortfolio: 'CORE',
        contractedCapacityKwp: 15_000,
        monthlyFee: (200 + 15_000 * 1.8) / 12,
        correctiveDaysAllowed: 1,
      }),
      expect.objectContaining({
        billingPortfolio: 'EDEN',
        contractedCapacityKwp: 6_000,
        monthlyFee: (200 + 6_000 * 1.8) / 12,
        correctiveDaysAllowed: 0,
      }),
    ]);
  });

  it('includes annual and monthly additional costs in contracted site pricing', () => {
    const calculated = calculateSiteWithAllTiers(
      site({
        systemSizeKwp: 1_000,
        additionalCostAnnual: 120,
        additionalCostMonthly: 25,
      }),
      DEFAULT_RATE_TIERS,
      DEFAULT_RATE_TIERS[0]
    );
    const summary = calculatePortfolioSummary([calculated]);

    expect(calculated.siteFixedCosts).toBe(320);
    expect(calculated.fixedFee_20MW).toBe(320 + 1_000 * 2 + 25 * 12);
    expect(summary.totalMonthlyFee).toBeCloseTo((320 + 1_000 * 2) / 12 + 25, 2);
    expect(summary.portfolioBreakdowns[0]).toMatchObject({
      siteFixedCostsAnnual: 320,
      annualFee: 320 + 1_000 * 2 + 25 * 12,
    });
  });

  it('exposes a verified pricing breakdown for contracted sites', () => {
    const calculated = calculateSiteWithAllTiers(
      site({ systemSizeKwp: 1_000 }),
      DEFAULT_RATE_TIERS,
      DEFAULT_RATE_TIERS[0],
      null,
      12_000
    );

    expect(calculated.pricingBreakdown).toMatchObject({
      isBillable: true,
      reviewStatus: 'VERIFIED',
      reviewReason: 'Contracted site priced using active portfolio tier',
      appliedTierName: '<20MW',
      appliedTierRatePerKwp: 2,
      contractedCapacityKwpForTier: 12_000,
      siteFixedCostsAnnual: 200,
      portfolioCostAnnual: 2_000,
      additionalMonthlyAnnual: 0,
      annualFee: 2_200,
      monthlyFee: 2_200 / 12,
    });
    expect(calculated.pricingBreakdown.lines).toEqual([
      expect.objectContaining({ label: 'PM cost', calculation: '0 PM days/year = £100.00/year', annualValue: 100 }),
      expect.objectContaining({ label: 'CCTV cost', annualValue: 50 }),
      expect.objectContaining({ label: 'Cleaning cost', annualValue: 50 }),
      expect.objectContaining({ label: 'Additional annual cost', annualValue: 0 }),
      expect.objectContaining({ label: 'Portfolio tariff', annualValue: 2_000 }),
      expect.objectContaining({ label: 'Additional monthly cost', annualValue: 0 }),
      expect.objectContaining({ label: 'Annual fee', annualValue: 2_200 }),
      expect.objectContaining({ label: 'Monthly fee', annualValue: 2_200 / 12 }),
    ]);
  });

  it('shows PM cost as a days-per-year build-up in pricing verification', () => {
    const calculated = calculateSiteWithAllTiers(
      site({ systemSizeKwp: 1_000, pmCost: 1450, pmDaysOnSite: 1.5, pmVisitsPerAnnum: 2 }),
      DEFAULT_RATE_TIERS,
      DEFAULT_RATE_TIERS[0]
    );

    expect(calculated.pricingBreakdown.lines.find((line) => line.label === 'PM cost')).toMatchObject({
      calculation: '1.5 PM days/year = £1,450.00/year',
      note: '2 visits/year',
      annualValue: 1450,
    });
  });

  it('explains non-billable site pricing in the breakdown', () => {
    const calculated = calculateSiteWithAllTiers(
      site({ contractStatus: 'Awaiting Contract', systemSizeKwp: 1_000 }),
      DEFAULT_RATE_TIERS,
      DEFAULT_RATE_TIERS[0],
      null,
      12_000
    );

    expect(calculated.monthlyFee).toBe(0);
    expect(calculated.pricingBreakdown).toMatchObject({
      isBillable: false,
      reviewStatus: 'NEEDS_REVIEW',
      reviewReason: 'Not billable while contract status is Awaiting Contract',
      portfolioCostAnnual: 0,
      annualFee: 0,
      monthlyFee: 0,
    });
    expect(calculated.pricingBreakdown.lines.find((line) => line.label === 'Portfolio tariff')).toMatchObject({
      annualValue: 0,
      note: 'Excluded because site is not contracted',
    });
  });

  it('applies additional monthly costs only inside the configured month range', () => {
    const customSite = site({
      systemSizeKwp: 1_000,
      additionalCostMonthly: 25,
      additionalCostMonthlyStartMonth: '2026-05',
      additionalCostMonthlyEndMonth: '2026-06',
    });

    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-04').monthlyFee).toBeCloseTo((200 + 1_000 * 2) / 12, 2);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-05').monthlyFee).toBeCloseTo((200 + 1_000 * 2) / 12 + 25, 2);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-06').monthlyFee).toBeCloseTo((200 + 1_000 * 2) / 12 + 25, 2);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-07').monthlyFee).toBeCloseTo((200 + 1_000 * 2) / 12, 2);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-05').pricingBreakdown.additionalMonthlyAnnual).toBe(300);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-07').pricingBreakdown.additionalMonthlyAnnual).toBe(0);
  });
});
