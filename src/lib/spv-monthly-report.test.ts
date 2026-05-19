import { describe, expect, it } from 'vitest';
import { SiteWithCalculations } from '@/types';
import { buildSpvMonthlyReport } from './spv-monthly-report';

function site(overrides: Partial<SiteWithCalculations>): SiteWithCalculations {
  return {
    id: 'site-1',
    contractId: 'contract-1',
    name: 'Example Site',
    systemSizeKwp: 1000,
    siteType: 'Rooftop',
    contractStatus: 'Contracted',
    onboardDate: '2026-01-15',
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

describe('SPV monthly report', () => {
  it('includes contracted sites onboarded by the selected month', () => {
    const report = buildSpvMonthlyReport(
      [
        site({ id: 'current', onboardDate: '2026-05-31', spvCode: 'OS2' }),
        site({ id: 'future', onboardDate: '2026-06-01', spvCode: 'OS2' }),
        site({ id: 'pending', contractStatus: 'Awaiting PAC', onboardDate: '2026-01-01', spvCode: 'OS2' }),
      ],
      '2026-05'
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].siteCount).toBe(2);
    expect(report.rows[0].contractedSiteCount).toBe(1);
    expect(report.rows[0].pendingSiteCount).toBe(1);
    expect(report.rows[0].monthlyFee).toBeCloseTo(183.33, 2);
    expect(report.rows[0].correctiveDaysAllowed).toBe(0);
    expect(report.totals.contractedSiteCount).toBe(1);
  });

  it('rounds CM days allowed down to whole days', () => {
    const report = buildSpvMonthlyReport(
      [site({ id: 'larger', systemSizeKwp: 27_756.23, onboardDate: '2026-05-01', spvCode: 'OS2' })],
      '2026-05'
    );

    expect(report.rows[0].correctiveDaysAllowed).toBe(2);
    expect(report.totals.correctiveDaysAllowed).toBe(2);
  });

  it('prices a month using only contracted capacity visible in that month', () => {
    const report = buildSpvMonthlyReport(
      [
        site({ id: 'a', systemSizeKwp: 10_000, onboardDate: '2026-05-01', spvCode: 'OS2' }),
        site({ id: 'b', systemSizeKwp: 11_000, onboardDate: '2026-05-31', spvCode: 'AD1' }),
        site({ id: 'pending', systemSizeKwp: 30_000, contractStatus: 'Awaiting PAC', onboardDate: '2026-05-01', spvCode: 'AI' }),
        site({ id: 'future', systemSizeKwp: 30_000, onboardDate: '2026-06-01', spvCode: 'AI' }),
      ],
      '2026-05'
    );

    expect(report.totals.contractedCapacityKwp).toBe(21_000);
    expect(report.totals.pendingSiteCount).toBe(1);
    expect(report.totals.variableCostAnnual).toBe(37_800);
    expect(report.totals.monthlyFee).toBeCloseTo(3183.33, 2);
  });

  it('groups sites without an SPV into an unassigned row', () => {
    const report = buildSpvMonthlyReport([site({ spvCode: null, spvId: null })], '2026-05');

    expect(report.rows[0].spvCode).toBe('UNASSIGNED');
    expect(report.rows[0].spvName).toBe('Unassigned');
  });

  it('separates Core and Eden billing while pricing both from combined contracted capacity', () => {
    const report = buildSpvMonthlyReport(
      [
        site({ id: 'core', billingPortfolio: 'CORE', spvCode: 'OS2', systemSizeKwp: 15_000, siteFixedCosts: 200 }),
        site({ id: 'eden', billingPortfolio: 'EDEN', spvCode: null, spvId: null, systemSizeKwp: 6_000, siteFixedCosts: 200 }),
      ],
      '2026-05'
    );

    expect(report.totals.contractedCapacityKwp).toBe(21_000);
    expect(report.portfolioBreakdowns).toEqual([
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

  it('shows Eden sites without a resolved SPV as an informational Eden row', () => {
    const report = buildSpvMonthlyReport(
      [site({ id: 'eden', billingPortfolio: 'EDEN', spvCode: null, spvId: null, systemSizeKwp: 6_000 })],
      '2026-05'
    );

    expect(report.rows[0]).toMatchObject({
      spvCode: 'EDEN',
      spvName: 'Eden Sites',
      billingPortfolio: 'EDEN',
      contractedCapacityKwp: 6_000,
    });
  });

  it('includes additional annual and monthly costs in fees', () => {
    const report = buildSpvMonthlyReport(
      [
        site({
          id: 'custom',
          systemSizeKwp: 1_000,
          siteFixedCosts: 320,
          pmCost: 120,
          cctvCost: 60,
          cleaningCost: 20,
          additionalCostAnnual: 120,
          additionalCostMonthly: 25,
        }),
      ],
      '2026-05'
    );

    expect(report.rows[0].siteFixedCostsAnnual).toBe(320);
    expect(report.rows[0].annualFee).toBe(320 + 1_000 * 2 + 25 * 12);
    expect(report.rows[0].monthlyFee).toBeCloseTo((320 + 1_000 * 2) / 12 + 25, 2);
  });

  it('excludes monthly additional costs outside the configured month range', () => {
    const report = buildSpvMonthlyReport(
      [
        site({
          id: 'custom',
          systemSizeKwp: 1_000,
          additionalCostMonthly: 25,
          additionalCostMonthlyStartMonth: '2026-05',
          additionalCostMonthlyEndMonth: '2026-05',
        }),
      ],
      '2026-06'
    );

    expect(report.rows[0].annualFee).toBe(200 + 1_000 * 2);
    expect(report.rows[0].monthlyFee).toBeCloseTo((200 + 1_000 * 2) / 12, 2);
  });
});
