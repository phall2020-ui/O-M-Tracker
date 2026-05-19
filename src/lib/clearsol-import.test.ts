import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseClearsolWorkbook } from './clearsol-import';

function workbookWithSheets() {
  const workbook = new ExcelJS.Workbook();

  workbook.addWorksheet('Portfolio Tracker').addRows([
      [
        'Site Name',
        'System Size (kWp)',
        'SPV',
        'Contract Status',
        'Onboard Date',
        'PM Cost (£/yr)',
        'PM Frequency',
        'CCTV Cost (£/yr)',
        'Cleaning Cost (£/yr)',
      ],
      ['Core Site', 500, 'OS2', 'Active', '01/03/2026', '£850', 'Annual', '£0', '£25'],
      ['Ground Site', 9631, 'FS', 'Active', '01/03/2026', '£11200', 'Annual', '£2340', '£0'],
      ['Formula Site', 50, 'AI', 'Active', '01/03/2026', '£283.33', { formula: 'VLOOKUP(A4,Small Sites Framework!A:O,15,0)' }, '£0', '£0'],
  ]);

  workbook.addWorksheet('Rooftop').addRows([
    [
      'Site Name',
      'Installed capacity (kWp)',
      'Number of inverters',
      'Number of panels',
      'Roof Access',
      'MEWP Hire (if required)',
      'Panel clean price (£/panel)',
      'Cleaning (per clean)',
      'Years per visit',
      'PM days on site',
    ],
    ['Core Site', 500, null, null, null, null, null, null, null, 2],
    ['Formula Site', 50, null, null, null, null, null, null, 3, { formula: '1/I3' }],
  ]);

  workbook.addWorksheet('Ground Mount').addRows([
    [
      'Site Name',
      'Installed capacity (kWp)',
      'Number of inverters',
      'Number of panels',
      'Panel clean price (£/panel)',
      'Cleaning (per clean)',
      'PM days on site',
    ],
    ['Ground Site', 9631, null, null, null, null, 14],
  ]);

  workbook.addWorksheet('Small Sites Framework').addRows([
    [
      'Site Name',
      'System Size (kWp)',
      'SPV',
      'Contract Status',
      'Onboard Date',
      'PM Cost (£/yr)',
      'CCTV Cost (£/yr)',
      'Cleaning Cost (£/yr)',
      'Site Fixed Costs (£/yr)',
      'Variable Rate (£/kWp)',
      'Variable Cost (£/yr)',
      'Total Annual Fee (£)',
      'Monthly Fee (£)',
      'Unit Cost (£/kWp)',
      'PM Frequency',
    ],
    ['Formula Site', 50, 'AI', 'Active', '01/03/2026', '£283.33', '£0', '£0', null, null, null, null, null, null, 'Every 3 years'],
  ]);

  workbook.addWorksheet('Eden Sites').addRows([
      [],
      [null, 'SITE DETAILS'],
      [
        null,
        null,
        'Site',
        'Size\n(kWp)',
        'Contract?',
        'Onboard\nDate',
        'PM\n(£/yr)',
        'CCTV\n(£/yr)',
        'Cleaning\n(£/yr)',
        'PM days on site',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        'SPV',
      ],
      [null, null, 'Northwood College', 360, 'Yes', '01/03/2026', '£850', '£0', '£0', 1, null, null, null, null, null, null, null, null, 'CAPEX'],
  ]);

  return workbook;
}

describe('Clearsol workbook import', () => {
  it('marks Portfolio Tracker rows as Core and Eden Sites rows as Eden', () => {
    const parsed = parseClearsolWorkbook(workbookWithSheets());

    expect(parsed.find((site) => site.name === 'Core Site')).toMatchObject({
      billingPortfolio: 'CORE',
      sourceSheet: 'Portfolio Tracker',
      sourceRow: 2,
      systemSizeKwp: 500,
      contractStatus: 'Contracted',
      pmDaysOnSite: 2,
      pmVisitsPerAnnum: 0,
    });
    expect(parsed.find((site) => site.name === 'Northwood College')).toMatchObject({
      billingPortfolio: 'EDEN',
      sourceSheet: 'Eden Sites',
      sourceRow: 4,
      systemSizeKwp: 360,
      contractStatus: 'Contracted',
      spvId: 'CAPEX',
      pmDaysOnSite: 1,
    });
    expect(parsed.find((site) => site.name === 'Ground Site')).toMatchObject({
      name: 'Ground Site',
      billingPortfolio: 'CORE',
      sourceSheet: 'Portfolio Tracker',
      sourceRow: 3,
      siteType: 'Ground Mount',
      systemSizeKwp: 9631,
      pmDaysOnSite: 14,
    });
    expect(parsed.find((site) => site.name === 'Formula Site')).toMatchObject({
      pmDaysOnSite: 1 / 3,
      pmVisitsPerAnnum: 0,
    });
  });
});
