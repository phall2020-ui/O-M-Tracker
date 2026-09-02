import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { RateTier, SiteWithCalculations } from '@/types';
import { buildPipelineCostBuildUpWorkbook, writeClearsolExportBuffer, writeCustomSitesExportBuffer } from './excel-export';

function site(overrides: Partial<SiteWithCalculations>): SiteWithCalculations {
  const base = {
    id: 'site-1',
    contractId: 'contract-1',
    name: 'Example Site',
    systemSizeKwp: 100,
    siteType: 'Rooftop',
    contractStatus: 'Contracted',
    acceptedByOm: true,
    forecastPacDate: null,
    actualPacDate: null,
    onboardDate: '2026-01-01',
    pmCost: 100,
    pmDaysOnSite: 0,
    pmVisitsPerAnnum: 0,
    cctvCost: 20,
    cleaningCost: 30,
    additionalCostAnnual: 0,
    additionalCostAnnualComment: null,
    additionalCostMonthly: 0,
    additionalCostMonthlyComment: null,
    additionalCostMonthlyStartMonth: null,
    additionalCostMonthlyEndMonth: null,
    billingPortfolio: 'CORE',
    spvId: 'spv-1',
    spvCode: 'AI',
    sourceSheet: null,
    sourceRow: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    siteFixedCosts: 150,
    portfolioCost_20MW: 200,
    portfolioCost_30MW: 180,
    portfolioCost_40MW: 170,
    fixedFee_20MW: 350,
    fixedFee_30MW: 330,
    fixedFee_40MW: 320,
    feePerKwp_20MW: 3.5,
    feePerKwp_30MW: 3.3,
    feePerKwp_40MW: 3.2,
    monthlyFee: 29.166666666666668,
  } satisfies SiteWithCalculations;

  return {
    ...base,
    ...overrides,
    forecastPacDate: overrides.forecastPacDate ?? null,
    actualPacDate: overrides.actualPacDate ?? null,
  };
}

describe('Clearsol Excel export', () => {
  async function readExportedWorkbook(sites: SiteWithCalculations[], tiers?: RateTier[], month?: string) {
    const buffer = await writeClearsolExportBuffer(sites, tiers, month);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    return workbook;
  }

  function rowValues(workbook: ExcelJS.Workbook, sheetName: string, rowNumber: number): unknown[] {
    const row = workbook.getWorksheet(sheetName)?.getRow(rowNumber);
    return Array.isArray(row?.values) ? row.values.slice(1) : [];
  }

  it('creates workbook tabs matching the Clearsol tracker format', async () => {
    const workbook = await readExportedWorkbook([
      site({ id: 'small', name: 'Small Site', systemSizeKwp: 100 }),
      site({ id: 'standard', name: 'Standard Site', systemSizeKwp: 300, spvCode: 'OS2' }),
    ]);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Overview',
      'Portfolio Tracker',
      'Small Sites Framework',
      'Standard Sites',
    ]);
    expect(rowValues(workbook, 'Portfolio Tracker', 1)).toEqual([
      'Site Name',
      'System Size (kWp)',
      'SPV',
      'Contract Status',
      'Forecast PAC Date',
      'Onboard Date',
      'PM Cost (GBP/year)',
      'PM Days / Annum',
      'PM Visits per Annum',
      'CCTV Cost (GBP/year)',
      'Cleaning Cost (GBP/year)',
      'Additional Base Cost (GBP/year)',
      'Additional Monthly Cost (GBP/month)',
      'Site Fixed Costs (GBP/year)',
      'Variable Rate (GBP/kWp)',
      'Variable Cost (GBP/year)',
      'Total Annual Fee (GBP/year)',
      'Monthly Fee (GBP/month)',
      'Unit Cost (GBP/kWp/year)',
      'PM Frequency',
      'Monitored By',
      'Notes',
    ]);
  });

  it('formats GBP fields with currency number formats', async () => {
    const workbook = await readExportedWorkbook([
      site({ id: 'standard', name: 'Standard Site', systemSizeKwp: 300, spvCode: 'OS2' }),
    ]);
    const tracker = workbook.getWorksheet('Portfolio Tracker');

    expect(tracker?.getCell('G2').numFmt).toBe('£#,##0.00');
    expect(tracker?.getCell('O2').numFmt).toBe('£#,##0.00');
    expect(tracker?.getCell('Q2').numFmt).toBe('£#,##0.00');
    expect(tracker?.getCell('R2').numFmt).toBe('£#,##0.00');
    expect(tracker?.getCell('B2').numFmt).toBe('#,##0.00');
    expect(tracker?.getCell('H2').numFmt).toBe('#,##0.00');
  });

  it('exports custom additional base and monthly costs', async () => {
    const workbook = await readExportedWorkbook([
      site({
        additionalCostAnnual: 120,
        additionalCostMonthly: 25,
      }),
    ]);
    const row = rowValues(workbook, 'Portfolio Tracker', 2);

    expect(row[11]).toBe(120);
    expect(row[12]).toBe(25);
    expect(row[13]).toBe(270);
    expect(row[16]).toBe(740);
    expect(row[17]).toBeCloseTo(61.67, 2);
  });

  it('respects the additional monthly cost window, matching the monthly SPV report', async () => {
    const workbook = await readExportedWorkbook(
      [
        site({
          additionalCostMonthly: 200,
          additionalCostMonthlyStartMonth: '2026-01',
          additionalCostMonthlyEndMonth: '2026-03',
        }),
      ],
      undefined,
      '2026-08'
    );
    const row = rowValues(workbook, 'Portfolio Tracker', 2);

    // Fixed costs 150 + 100 kWp x GBP 1.70 = GBP 320; the GBP 2,400 extra ended in March.
    expect(row[16]).toBe(320);
  });

  it('splits small and standard sites into the framework tabs', async () => {
    const workbook = await readExportedWorkbook([
      site({ id: 'small', name: 'Small Site', systemSizeKwp: 100 }),
      site({ id: 'standard', name: 'Standard Site', systemSizeKwp: 300, spvCode: 'OS2' }),
    ]);
    const small = workbook.getWorksheet('Small Sites Framework');
    const standard = workbook.getWorksheet('Standard Sites');

    expect(rowValues(workbook, 'Small Sites Framework', 2)[0]).toBe('Small Site');
    expect(small?.actualRowCount).toBe(2);
    expect(rowValues(workbook, 'Standard Sites', 2)[0]).toBe('Standard Site');
    expect(standard?.actualRowCount).toBe(2);
  });

  it('creates a custom workbook with only selected fields', async () => {
    const buffer = await writeCustomSitesExportBuffer(
      [
        site({
          name: 'Custom Export Site',
          spvCode: 'AD1',
          pmDaysOnSite: 3,
          pmVisitsPerAnnum: 0,
        }),
      ],
      ['name', 'spvCode', 'pmDaysOnSite', 'pmVisitsPerAnnum', 'monthlyFee']
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Custom Site Export']);
    expect(rowValues(workbook, 'Custom Site Export', 1)).toEqual([
      'Site Name',
      'SPV',
      'PM Days / Annum',
      'PM Visits per Annum',
      'Monthly Fee (GBP/month)',
    ]);
    expect(rowValues(workbook, 'Custom Site Export', 2)).toEqual([
      'Custom Export Site',
      'AD1',
      3,
      '',
      26.67,
    ]);
  });

  it('creates a pipeline cost build-up workbook with tier scenario costs', () => {
    const workbook = buildPipelineCostBuildUpWorkbook([
      site({
        name: 'Pipeline Export Site',
        contractStatus: 'Awaiting PAC',
        forecastPacDate: '2026-08-14',
        onboardDate: null,
        systemSizeKwp: 300,
        pmCost: 100,
        cctvCost: 25,
        cleaningCost: 50,
        additionalCostAnnual: 10,
        additionalCostMonthly: 5,
        siteFixedCosts: 185,
        portfolioCost_20MW: 600,
        fixedFee_20MW: 845,
        portfolioCost_30MW: 540,
        fixedFee_30MW: 785,
        portfolioCost_40MW: 510,
        fixedFee_40MW: 755,
      }),
      site({
        id: 'awaiting-om',
        name: 'Contracted Awaiting O&M',
        contractStatus: 'Contracted',
        acceptedByOm: false,
        onboardDate: '2026-08-01',
      }),
    ]);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Pipeline Cost Build-up']);
    expect(rowValues(workbook, 'Pipeline Cost Build-up', 1)).toContain('<20MW Total Site Cost (GBP/year)');
    expect(rowValues(workbook, 'Pipeline Cost Build-up', 1)).toContain('20-30MW Fee (GBP/kWp/year)');
    const rows = [
      rowValues(workbook, 'Pipeline Cost Build-up', 2),
      rowValues(workbook, 'Pipeline Cost Build-up', 3),
    ];
    expect(rows.find((row) => row[0] === 'Pipeline Export Site')).toEqual([
      'Pipeline Export Site',
      'Awaiting PAC',
      new Date('2026-08-14T00:00:00.000Z'),
      'AI',
      'Core',
      'Rooftop',
      300,
      0,
      100,
      25,
      50,
      10,
      185,
      5,
      60,
      600,
      845,
      70.42,
      2.82,
      540,
      785,
      65.42,
      2.62,
      510,
      755,
      62.92,
      2.52,
    ]);
    expect(rows.map((row) => row[0])).toContain('Contracted Awaiting O&M');
  });
});
