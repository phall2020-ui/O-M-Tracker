import ExcelJS from 'exceljs';
import { SiteWithCalculations } from '@/types';
import { determinePortfolioTier } from './calculations';

const PORTFOLIO_HEADERS = [
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
];

const SMALL_HEADERS = [
  ...PORTFOLIO_HEADERS.slice(0, 18),
  'Response SLA - Electrical',
  'Response SLA - Comms',
  'Last PM Date',
  'Next PM Due',
  'Assigned To',
  'Notes',
];

const STANDARD_HEADERS = [
  ...PORTFOLIO_HEADERS.slice(0, 18),
  'Last PM Date',
  'Next PM Due',
  'Notes',
];

type ExportRow = {
  site: SiteWithCalculations;
  siteFixedCosts: number;
  variableRate: number;
  variableCost: number;
  annualFee: number;
  monthlyFee: number;
  unitCost: number;
  pmFrequency: string;
  monitoredBy: string;
};

export type CustomExportFieldKey =
  | 'name'
  | 'systemSizeKwp'
  | 'spvCode'
  | 'siteType'
  | 'contractStatus'
  | 'billingPortfolio'
  | 'forecastPacDate'
  | 'onboardDate'
  | 'pmCost'
  | 'pmDaysOnSite'
  | 'pmVisitsPerAnnum'
  | 'cctvCost'
  | 'cleaningCost'
  | 'additionalCostAnnual'
  | 'additionalCostAnnualComment'
  | 'additionalCostMonthly'
  | 'additionalCostMonthlyComment'
  | 'additionalCostMonthlyStartMonth'
  | 'additionalCostMonthlyEndMonth'
  | 'siteFixedCosts'
  | 'variableRate'
  | 'variableCost'
  | 'annualFee'
  | 'monthlyFee'
  | 'unitCost'
  | 'pmFrequency'
  | 'monitoredBy'
  | 'sourceSheet'
  | 'sourceRow'
  | 'createdAt'
  | 'updatedAt';

type CustomExportField = {
  key: CustomExportFieldKey;
  label: string;
  width: number;
  format?: 'money' | 'date' | 'number';
  value: (row: ExportRow) => unknown;
};

export const CUSTOM_EXPORT_FIELDS: CustomExportField[] = [
  { key: 'name', label: 'Site Name', width: 30, value: (row) => row.site.name },
  { key: 'systemSizeKwp', label: 'System Size (kWp)', width: 18, format: 'number', value: (row) => row.site.systemSizeKwp },
  { key: 'spvCode', label: 'SPV', width: 12, value: (row) => row.site.spvCode || '' },
  { key: 'siteType', label: 'Site Type', width: 16, value: (row) => row.site.siteType },
  { key: 'contractStatus', label: 'Contract Status', width: 18, value: (row) => statusValue(row.site.contractStatus) },
  { key: 'billingPortfolio', label: 'Billing Portfolio', width: 18, value: (row) => row.site.billingPortfolio === 'EDEN' ? 'Eden' : 'Core' },
  { key: 'forecastPacDate', label: 'Forecast PAC Date', width: 18, format: 'date', value: (row) => dateValue(row.site.forecastPacDate) },
  { key: 'onboardDate', label: 'Onboard Date', width: 15, format: 'date', value: (row) => dateValue(row.site.onboardDate) },
  { key: 'pmCost', label: 'PM Cost (£/yr)', width: 16, format: 'money', value: (row) => money(row.site.pmCost) },
  { key: 'pmDaysOnSite', label: 'PM Days / Annum', width: 18, format: 'number', value: (row) => row.site.pmDaysOnSite || 0 },
  { key: 'pmVisitsPerAnnum', label: 'PM Visits per Annum', width: 20, format: 'number', value: (row) => row.site.pmVisitsPerAnnum || '' },
  { key: 'cctvCost', label: 'CCTV Cost (£/yr)', width: 18, format: 'money', value: (row) => money(row.site.cctvCost) },
  { key: 'cleaningCost', label: 'Cleaning Cost (£/yr)', width: 20, format: 'money', value: (row) => money(row.site.cleaningCost) },
  { key: 'additionalCostAnnual', label: 'Additional Base Cost (£/yr)', width: 26, format: 'money', value: (row) => money(row.site.additionalCostAnnual || 0) },
  { key: 'additionalCostAnnualComment', label: 'Additional Base Cost Comment', width: 32, value: (row) => row.site.additionalCostAnnualComment || '' },
  { key: 'additionalCostMonthly', label: 'Additional Monthly Cost (£/mo)', width: 28, format: 'money', value: (row) => money(row.site.additionalCostMonthly || 0) },
  { key: 'additionalCostMonthlyComment', label: 'Additional Monthly Cost Comment', width: 34, value: (row) => row.site.additionalCostMonthlyComment || '' },
  { key: 'additionalCostMonthlyStartMonth', label: 'Monthly Cost From', width: 18, value: (row) => row.site.additionalCostMonthlyStartMonth || '' },
  { key: 'additionalCostMonthlyEndMonth', label: 'Monthly Cost To', width: 18, value: (row) => row.site.additionalCostMonthlyEndMonth || '' },
  { key: 'siteFixedCosts', label: 'Site Fixed Costs (£/yr)', width: 22, format: 'money', value: (row) => money(row.siteFixedCosts) },
  { key: 'variableRate', label: 'Variable Rate (£/kWp)', width: 22, format: 'number', value: (row) => row.variableRate },
  { key: 'variableCost', label: 'Variable Cost (£/yr)', width: 22, format: 'money', value: (row) => money(row.variableCost) },
  { key: 'annualFee', label: 'Total Annual Fee (£)', width: 20, format: 'money', value: (row) => money(row.annualFee) },
  { key: 'monthlyFee', label: 'Monthly Fee (£)', width: 18, format: 'money', value: (row) => money(row.monthlyFee) },
  { key: 'unitCost', label: 'Unit Cost (£/kWp)', width: 20, format: 'money', value: (row) => money(row.unitCost) },
  { key: 'pmFrequency', label: 'PM Frequency', width: 18, value: (row) => row.pmFrequency },
  { key: 'monitoredBy', label: 'Monitored By', width: 18, value: (row) => row.monitoredBy },
  { key: 'sourceSheet', label: 'Source Sheet', width: 18, value: (row) => row.site.sourceSheet || '' },
  { key: 'sourceRow', label: 'Source Row', width: 12, format: 'number', value: (row) => row.site.sourceRow || '' },
  { key: 'createdAt', label: 'Created At', width: 22, format: 'date', value: (row) => dateValue(row.site.createdAt) },
  { key: 'updatedAt', label: 'Updated At', width: 22, format: 'date', value: (row) => dateValue(row.site.updatedAt) },
];

export const DEFAULT_CUSTOM_EXPORT_FIELDS: CustomExportFieldKey[] = [
  'name',
  'spvCode',
  'systemSizeKwp',
  'contractStatus',
  'billingPortfolio',
  'pmDaysOnSite',
  'pmVisitsPerAnnum',
  'siteFixedCosts',
  'annualFee',
  'monthlyFee',
];

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateValue(value: string | null): Date | null {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : null;
}

function statusValue(status: string): string {
  if (['Yes', 'YES', 'Active', 'CONTRACTED', 'Contracted'].includes(status)) return 'Contracted';
  if (status === 'AWAITING_CONTRACT') return 'Awaiting Contract';
  return status === 'No' || status === 'NO' ? 'Awaiting PAC' : status;
}

function monitoredBy(site: SiteWithCalculations): string {
  if ((site.spvCode || '').toUpperCase() === 'AI' && site.systemSizeKwp < 290) return 'ADE';
  return 'ClearSol';
}

function pmFrequency(site: SiteWithCalculations): string {
  const visits = site.pmVisitsPerAnnum || 0;
  if (visits <= 0) return '';
  if (Math.abs(visits - 1) < 0.001) return 'Annual';
  if (visits < 1) {
    const years = Math.round(1 / visits);
    return years > 1 ? `Every ${years} years` : 'Annual';
  }
  return `${visits} visits/year`;
}

function buildRows(sites: SiteWithCalculations[]): ExportRow[] {
  const contractedCapacityKwp = sites
    .filter((site) => site.contractStatus === 'Contracted' || site.contractStatus === 'Yes')
    .reduce((sum, site) => sum + site.systemSizeKwp, 0);
  const tier = determinePortfolioTier(contractedCapacityKwp / 1000);

  return sites
    .slice()
    .sort((a, b) => a.systemSizeKwp - b.systemSizeKwp || a.name.localeCompare(b.name))
    .map((site) => {
      const isActive = site.contractStatus === 'Contracted' || site.contractStatus === 'Yes';
      const siteFixedCosts = site.pmCost + site.cctvCost + site.cleaningCost + (site.additionalCostAnnual || 0);
      const variableCost = isActive ? site.systemSizeKwp * tier.ratePerKwp : 0;
      const annualFee = isActive ? siteFixedCosts + variableCost + ((site.additionalCostMonthly || 0) * 12) : 0;
      const monthlyFee = annualFee / 12;
      const unitCost = site.systemSizeKwp > 0 ? annualFee / site.systemSizeKwp : 0;

      return {
        site,
        siteFixedCosts,
        variableRate: isActive ? tier.ratePerKwp : 0,
        variableCost,
        annualFee,
        monthlyFee,
        unitCost,
        pmFrequency: pmFrequency(site),
        monitoredBy: monitoredBy(site),
      };
    });
}

function portfolioRow(row: ExportRow): unknown[] {
  return [
    row.site.name,
    row.site.systemSizeKwp,
    row.site.spvCode || '',
    statusValue(row.site.contractStatus),
    dateValue(row.site.forecastPacDate),
    dateValue(row.site.onboardDate),
    money(row.site.pmCost),
    row.site.pmDaysOnSite || 0,
    row.site.pmVisitsPerAnnum || '',
    money(row.site.cctvCost),
    money(row.site.cleaningCost),
    money(row.site.additionalCostAnnual || 0),
    money(row.site.additionalCostMonthly || 0),
    money(row.siteFixedCosts),
    row.variableRate,
    money(row.variableCost),
    money(row.annualFee),
    money(row.monthlyFee),
    money(row.unitCost),
    row.pmFrequency,
    row.monitoredBy,
    '',
  ];
}

function smallRow(row: ExportRow): unknown[] {
  return [
    ...portfolioRow(row).slice(0, 18),
    '5 working days',
    '10 working days',
    '',
    '',
    '',
    '',
  ];
}

function standardRow(row: ExportRow): unknown[] {
  return [...portfolioRow(row).slice(0, 18), '', '', ''];
}

function addSheet(workbook: ExcelJS.Workbook, name: string, rows: unknown[][], widths: number[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRows(rows);
  sheet.columns = widths.map((width) => ({ width }));
}

function setSheetFormats(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  rowCount: number,
  moneyColumns: string[],
  dateColumns: string[],
  numericColumns: string[] = ['B', 'L', 'P']
) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return;
  for (let row = 2; row <= rowCount; row += 1) {
    for (const column of numericColumns) {
      sheet.getCell(`${column}${row}`).numFmt = '#,##0.00';
    }
    for (const column of moneyColumns) {
      sheet.getCell(`${column}${row}`).numFmt = '£#,##0.00';
    }
    for (const column of dateColumns) {
      sheet.getCell(`${column}${row}`).numFmt = 'yyyy-mm-dd';
    }
  }
}

export function buildClearsolExportWorkbook(sites: SiteWithCalculations[]): ExcelJS.Workbook {
  const exportRows = buildRows(sites);
  const smallRows = exportRows.filter((row) => row.site.systemSizeKwp < 200);
  const standardRows = exportRows.filter((row) => row.site.systemSizeKwp >= 200);
  const totalAnnual = exportRows.reduce((sum, row) => sum + row.annualFee, 0);
  const totalCapacity = exportRows.reduce((sum, row) => sum + row.site.systemSizeKwp, 0);
  const smallCapacity = smallRows.reduce((sum, row) => sum + row.site.systemSizeKwp, 0);
  const standardCapacity = standardRows.reduce((sum, row) => sum + row.site.systemSizeKwp, 0);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Clearsol O&M Portfolio Tracker';
  workbook.created = new Date();

  addSheet(
    workbook,
    'Overview',
    [
      ['', 'ClearSol O&M Framework Tracker', '', 'Date:', new Date()],
      ['', 'Portfolio Overview'],
      [],
      ['', 'Portfolio Summary'],
      [],
      ['', 'Total Sites', exportRows.length],
      ['', 'Small Sites (<200 kWp)', smallRows.length],
      ['', 'Standard Sites (>=200 kWp)', standardRows.length],
      ['', 'Total Portfolio Capacity (kWp)', money(totalCapacity)],
      ['', 'Small Sites Capacity (kWp)', money(smallCapacity)],
      ['', 'Standard Sites Capacity (kWp)', money(standardCapacity)],
      [],
      ['', 'Total Annual O&M Cost (£)', money(totalAnnual)],
      ['', 'Average Unit Cost (£/kWp)', totalCapacity > 0 ? money(totalAnnual / totalCapacity) : 0],
    ],
    [8, 35, 18, 18, 22]
  );

  addSheet(workbook, 'Portfolio Tracker', [PORTFOLIO_HEADERS, ...exportRows.map(portfolioRow)], [
    28, 20, 12, 18, 15, 17, 19, 23, 26, 24, 23, 23, 18, 23, 16, 15, 30,
  ]);
  addSheet(workbook, 'Small Sites Framework', [SMALL_HEADERS, ...smallRows.map(smallRow)], [
    28, 20, 12, 18, 15, 17, 19, 23, 26, 24, 23, 23, 18, 23, 16, 15, 28, 23, 15, 14, 14, 30,
  ]);
  addSheet(workbook, 'Standard Sites', [STANDARD_HEADERS, ...standardRows.map(standardRow)], [
    22, 20, 12, 18, 15, 17, 19, 23, 26, 24, 23, 23, 18, 23, 15, 15, 15, 14, 30,
  ]);

  setSheetFormats(workbook, 'Overview', 14, ['C'], ['E'], []);
  setSheetFormats(workbook, 'Portfolio Tracker', exportRows.length + 1, ['F', 'G', 'H', 'I', 'J', 'K', 'M', 'N', 'O'], ['E']);
  setSheetFormats(workbook, 'Small Sites Framework', smallRows.length + 1, ['F', 'G', 'H', 'I', 'J', 'K', 'M', 'N', 'O'], ['E', 'S', 'T']);
  setSheetFormats(workbook, 'Standard Sites', standardRows.length + 1, ['F', 'G', 'H', 'I', 'J', 'K', 'M', 'N', 'O'], ['E', 'Q', 'R']);

  return workbook;
}

export async function writeClearsolExportBuffer(sites: SiteWithCalculations[]): Promise<Buffer> {
  const buffer = await buildClearsolExportWorkbook(sites).xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function normalizeCustomExportFields(fields: string[]): CustomExportFieldKey[] {
  const allowed = new Set(CUSTOM_EXPORT_FIELDS.map((field) => field.key));
  const unique = fields.filter((field, index) => fields.indexOf(field) === index);
  return unique.filter((field): field is CustomExportFieldKey => allowed.has(field as CustomExportFieldKey));
}

export function buildCustomSitesExportWorkbook(
  sites: SiteWithCalculations[],
  selectedFieldKeys: CustomExportFieldKey[]
): ExcelJS.Workbook {
  const exportRows = buildRows(sites);
  const selected = selectedFieldKeys
    .map((key) => CUSTOM_EXPORT_FIELDS.find((field) => field.key === key))
    .filter((field): field is CustomExportField => Boolean(field));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Clearsol O&M Portfolio Tracker';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Custom Site Export');
  sheet.addRow(selected.map((field) => field.label));
  exportRows.forEach((row) => {
    sheet.addRow(selected.map((field) => field.value(row)));
  });
  sheet.columns = selected.map((field) => ({ width: field.width }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF7F7F7' },
  };

  selected.forEach((field, index) => {
    const column = sheet.getColumn(index + 1);
    if (field.format === 'money') column.numFmt = '£#,##0.00';
    if (field.format === 'number') column.numFmt = '#,##0.00';
    if (field.format === 'date') column.numFmt = 'yyyy-mm-dd';
  });

  return workbook;
}

export async function writeCustomSitesExportBuffer(
  sites: SiteWithCalculations[],
  selectedFieldKeys: CustomExportFieldKey[]
): Promise<Buffer> {
  const buffer = await buildCustomSitesExportWorkbook(sites, selectedFieldKeys).xlsx.writeBuffer();
  return Buffer.from(buffer);
}
