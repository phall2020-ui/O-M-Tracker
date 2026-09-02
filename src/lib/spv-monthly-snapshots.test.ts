import { describe, expect, it } from 'vitest';
import { BillingSnapshotForReport, buildSpvMonthlyReportFromSnapshots } from './spv-monthly-snapshots';

function snapshot(overrides: Partial<BillingSnapshotForReport>): BillingSnapshotForReport {
  return {
    id: 'snapshot-1',
    siteId: 'site-1',
    siteName: 'Example Site',
    spvCode: 'OS2',
    spvName: 'Olympus Solar 2 Ltd',
    month: '2026-05',
    systemSizeKwp: 1000,
    siteFixedCostsAnnual: 200,
    variableCostAnnual: 2000,
    annualFee: 2200,
    expectedAmount: 183.33,
    invoicedAmount: null,
    sourcePayload: JSON.stringify({ site: { billingPortfolio: 'CORE' } }),
    ...overrides,
  };
}

describe('SPV monthly snapshot report', () => {
  it('uses immutable billing snapshots as the monthly source of truth', () => {
    const report = buildSpvMonthlyReportFromSnapshots(
      [
        snapshot({ id: 'a', spvCode: 'OS2', spvName: 'Olympus Solar 2 Ltd', expectedAmount: 100 }),
        snapshot({ id: 'b', spvCode: 'OS2', spvName: 'Olympus Solar 2 Ltd', siteId: 'site-2', expectedAmount: 50 }),
        snapshot({ id: 'c', spvCode: 'FS', spvName: 'Fylde Solar Ltd', siteId: 'site-3', expectedAmount: 25 }),
      ],
      '2026-05',
      ['2026-05']
    );

    expect(report.source).toBe('billing-snapshots');
    expect(report.rows[0]).toMatchObject({
      spvCode: 'OS2',
      siteCount: 2,
      contractedSiteCount: 2,
      monthlyFee: 150,
      annualFee: 4400,
      billingSnapshotCount: 2,
      correctiveDaysAllowed: 0,
    });
    expect(report.totals.monthlyFee).toBe(175);
  });

  it('exposes snapshot site lines that reconcile exactly to the SPV monthly fee', () => {
    const report = buildSpvMonthlyReportFromSnapshots(
      [
        snapshot({
          id: 'a',
          siteId: 'site-a',
          siteName: 'Alpha',
          expectedAmount: 10.005,
          sourcePayload: JSON.stringify({
            site: { billingPortfolio: 'CORE', pmDaysOnSite: 2, pmVisitsPerAnnum: 1 },
          }),
        }),
        snapshot({
          id: 'b',
          siteId: 'site-b',
          siteName: 'Bravo',
          expectedAmount: 10.005,
          sourcePayload: JSON.stringify({
            site: { billingPortfolio: 'CORE', pmDaysOnSite: 4, pmVisitsPerAnnum: 2 },
          }),
        }),
      ],
      '2026-05',
      ['2026-05']
    );

    expect(report.rows[0].siteLines).toEqual([
      expect.objectContaining({
        id: 'a',
        siteId: 'site-a',
        name: 'Alpha',
        pmDaysOnSite: 2,
        pmVisitsPerAnnum: 1,
        monthlyFee: 10.01,
      }),
      expect.objectContaining({
        id: 'b',
        siteId: 'site-b',
        name: 'Bravo',
        pmDaysOnSite: 4,
        pmVisitsPerAnnum: 2,
        monthlyFee: 10.01,
      }),
    ]);
    expect(report.rows[0].siteLines?.reduce((sum, site) => sum + site.monthlyFee, 0)).toBe(
      report.rows[0].monthlyFee
    );
    expect(report.rows[0].monthlyFee).toBe(20.02);
  });

  it('rounds CM days allowed down to whole days from snapshot capacity', () => {
    const report = buildSpvMonthlyReportFromSnapshots(
      [snapshot({ systemSizeKwp: 27_756.23, expectedAmount: 100 })],
      '2026-05',
      ['2026-05']
    );

    expect(report.rows[0].correctiveDaysAllowed).toBe(2);
    expect(report.totals.correctiveDaysAllowed).toBe(2);
  });

  it('rebuilds separate Core and Eden totals from immutable snapshots', () => {
    const report = buildSpvMonthlyReportFromSnapshots(
      [
        snapshot({ id: 'core', spvCode: 'OS2', systemSizeKwp: 15_000, expectedAmount: (200 + 15_000 * 1.8) / 12 }),
        snapshot({
          id: 'eden',
          spvCode: null,
          systemSizeKwp: 6_000,
          expectedAmount: (200 + 6_000 * 1.8) / 12,
          sourcePayload: JSON.stringify({ site: { billingPortfolio: 'EDEN' } }),
        }),
      ],
      '2026-05',
      ['2026-05']
    );

    expect(report.portfolioBreakdowns).toEqual([
      expect.objectContaining({ billingPortfolio: 'CORE', contractedCapacityKwp: 15_000 }),
      expect.objectContaining({ billingPortfolio: 'EDEN', contractedCapacityKwp: 6_000 }),
    ]);
  });

  it('shows Eden snapshots without a resolved SPV as an informational Eden row', () => {
    const report = buildSpvMonthlyReportFromSnapshots(
      [
        snapshot({
          id: 'eden',
          spvCode: null,
          systemSizeKwp: 6_000,
          sourcePayload: JSON.stringify({ site: { billingPortfolio: 'EDEN' } }),
        }),
      ],
      '2026-05',
      ['2026-05']
    );

    expect(report.rows[0]).toMatchObject({
      spvCode: 'EDEN',
      spvName: 'Eden Sites',
      billingPortfolio: 'EDEN',
      contractedCapacityKwp: 6_000,
    });
  });
});

describe('SPV monthly snapshot report pro-rata handling', () => {
  it('reports the stored annual fee rather than 12x a pro-rated month', () => {
    // Riverside onboards mid-month: expectedAmount carries the pro-rata factor, the stored
    // annual fee does not. Site Costs + Variable Cost must still reconcile to Annual Fee.
    const report = buildSpvMonthlyReportFromSnapshots(
      [snapshot({ siteFixedCostsAnnual: 200, variableCostAnnual: 2000, annualFee: 2200, expectedAmount: 94.62 })],
      '2026-08',
      ['2026-08']
    );

    expect(report.rows[0].annualFee).toBe(2200);
    expect(report.rows[0].siteFixedCostsAnnual + report.rows[0].variableCostAnnual).toBe(2200);
    expect(report.rows[0].monthlyFee).toBeCloseTo(94.62, 2);
    expect(report.rows[0].averageFeePerKwp).toBeCloseTo(2.2, 2);
    expect(report.totals.annualFee).toBe(2200);
  });

  it('classifies a snapshot from the linked site when the payload has no site block', () => {
    // Notion-imported snapshots store the raw Notion row, so the payload cannot classify them.
    const report = buildSpvMonthlyReportFromSnapshots(
      [snapshot({ billingPortfolio: 'EDEN', sourcePayload: JSON.stringify({ 'Applied Tier': 'Standard' }) })],
      '2026-05',
      ['2026-05']
    );

    expect(report.rows[0].billingPortfolio).toBe('EDEN');
    expect(report.portfolioBreakdowns?.find((row) => row.billingPortfolio === 'EDEN')?.contractedCapacityKwp).toBe(1000);
    expect(report.portfolioBreakdowns?.find((row) => row.billingPortfolio === 'CORE')?.contractedCapacityKwp).toBe(0);
  });
});
