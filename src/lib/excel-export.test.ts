import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { SiteWithCalculations } from '@/types';
import { writeClearsolExportBuffer, writeCustomSitesExportBuffer } from './excel-export';

function site(overrides: Partial<SiteWithCalculations>): SiteWithCalculations {
  const base = {
    id: 'site-1',
    contractId: 'contract-1',
    name: 'Example Site',
    systemSizeKwp: 100,
    siteType: 'Rooftop',
    contractStatus: 'Contracted',
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
  async function readExportedWorkbook(sites: SiteWithCalculations[]) {
    const buffer = await writeClearsolExportBuffer(sites);
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
      'PM Cost (£/yr)',
      'PM Days / Annum',
      'PM Visits per Annum',
      'CCTV Cost (£/yr)',
      'Cleaning Cost (£/yr)',
      'Additional Base Cost (£/yr)',
      'Additional Monthly Cost (£/mo)',
      'Site Fixed Costs (£/yr)',
      'Variable Rate (£/kWp)',
      'Variable Cost (£/yr)',
      'Total Annual Fee (£)',
      'Monthly Fee (£)',
      'Unit Cost (£/kWp)',
      'PM Frequency',
      'Monitored By',
      'Notes',
    ]);
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
    expect(row[16]).toBe(770);
    expect(row[17]).toBeCloseTo(64.17, 2);
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
      'Monthly Fee (£)',
    ]);
    expect(rowValues(workbook, 'Custom Site Export', 2)).toEqual([
      'Custom Export Site',
      'AD1',
      3,
      '',
      29.17,
    ]);
  });
});
