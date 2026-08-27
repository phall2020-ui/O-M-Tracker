import { describe, expect, it } from 'vitest';
import {
  calculatePortfolioSummary,
  calculateSiteWithAllTiers,
  currentPortfolioTier,
  DEFAULT_RATE_TIERS,
  isLegacyTierName,
  STANDARD_RATE_PER_KWP,
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
  it('prices every portfolio at the standard rate regardless of contracted capacity', () => {
    const small = site({ id: 'small', systemSizeKwp: 1_000 });
    const core = site({ id: 'core', billingPortfolio: 'CORE', systemSizeKwp: 15_000 });
    const eden = site({ id: 'eden', billingPortfolio: 'EDEN', systemSizeKwp: 6_000 });

    expect(currentPortfolioTier([small], DEFAULT_RATE_TIERS)).toMatchObject({ tierName: 'Standard', ratePerKwp: STANDARD_RATE_PER_KWP });
    expect(currentPortfolioTier([core, eden], DEFAULT_RATE_TIERS)).toMatchObject({ tierName: 'Standard', ratePerKwp: STANDARD_RATE_PER_KWP });
  });

  it('keeps the superseded capacity bands available for scenario comparison', () => {
    const calculated = calculateSiteWithAllTiers(site({ systemSizeKwp: 1_000 }), DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0]);

    expect(calculated.portfolioCost_20MW).toBe(1_000 * 2);
    expect(calculated.portfolioCost_30MW).toBe(1_000 * 1.8);
    expect(calculated.portfolioCost_40MW).toBe(1_000 * 1.7);
    expect(isLegacyTierName('<20MW')).toBe(true);
    expect(isLegacyTierName('Standard')).toBe(false);
  });

  it('reports Core and Eden separately while pricing both at the standard rate', () => {
    const tier = DEFAULT_RATE_TIERS[0];
    const core = calculateSiteWithAllTiers(site({ id: 'core', billingPortfolio: 'CORE', systemSizeKwp: 15_000 }), DEFAULT_RATE_TIERS, tier);
    const eden = calculateSiteWithAllTiers(site({ id: 'eden', billingPortfolio: 'EDEN', systemSizeKwp: 6_000 }), DEFAULT_RATE_TIERS, tier);
    const summary = calculatePortfolioSummary([core, eden]);

    expect(summary.currentTier).toBe('Standard');
    expect(core.monthlyFee).toBeCloseTo((200 + 15_000 * 1.7) / 12, 2);
    expect(eden.monthlyFee).toBeCloseTo((200 + 6_000 * 1.7) / 12, 2);
    expect(summary.portfolioBreakdowns).toEqual([
      expect.objectContaining({
        billingPortfolio: 'CORE',
        contractedCapacityKwp: 15_000,
        monthlyFee: (200 + 15_000 * 1.7) / 12,
        correctiveDaysAllowed: 1,
      }),
      expect.objectContaining({
        billingPortfolio: 'EDEN',
        contractedCapacityKwp: 6_000,
        monthlyFee: (200 + 6_000 * 1.7) / 12,
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
    expect(summary.totalMonthlyFee).toBeCloseTo((320 + 1_000 * 1.7) / 12 + 25, 2);
    expect(summary.portfolioBreakdowns[0]).toMatchObject({
      siteFixedCostsAnnual: 320,
      annualFee: 320 + 1_000 * 1.7 + 25 * 12,
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
      appliedTierName: 'Standard',
      appliedTierRatePerKwp: STANDARD_RATE_PER_KWP,
      contractedCapacityKwpForTier: 12_000,
      siteFixedCostsAnnual: 200,
      portfolioCostAnnual: 1_700,
      additionalMonthlyAnnual: 0,
      annualFee: 1_900,
      monthlyFee: 1_900 / 12,
    });
    expect(calculated.pricingBreakdown.lines).toEqual([
      expect.objectContaining({ label: 'PM cost', calculation: '0 PM days/year = £100.00/year', annualValue: 100 }),
      expect.objectContaining({ label: 'CCTV cost', annualValue: 50 }),
      expect.objectContaining({ label: 'Cleaning cost', annualValue: 50 }),
      expect.objectContaining({ label: 'Additional annual cost', annualValue: 0 }),
      expect.objectContaining({ label: 'Portfolio tariff', annualValue: 1_700 }),
      expect.objectContaining({ label: 'Additional monthly cost', annualValue: 0 }),
      expect.objectContaining({ label: 'Annual fee', annualValue: 1_900 }),
      expect.objectContaining({ label: 'Monthly fee', annualValue: 1_900 / 12 }),
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

    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-04').monthlyFee).toBeCloseTo((200 + 1_000 * 1.7) / 12, 2);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-05').monthlyFee).toBeCloseTo((200 + 1_000 * 1.7) / 12 + 25, 2);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-06').monthlyFee).toBeCloseTo((200 + 1_000 * 1.7) / 12 + 25, 2);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-07').monthlyFee).toBeCloseTo((200 + 1_000 * 1.7) / 12, 2);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-05').pricingBreakdown.additionalMonthlyAnnual).toBe(300);
    expect(calculateSiteWithAllTiers(customSite, DEFAULT_RATE_TIERS, DEFAULT_RATE_TIERS[0], '2026-07').pricingBreakdown.additionalMonthlyAnnual).toBe(0);
  });
});
