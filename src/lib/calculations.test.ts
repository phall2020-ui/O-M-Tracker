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
  });
});
