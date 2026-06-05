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
  { key: 'pmCost', label: 'PM Cost (GBP/year)', width: 20, format: 'money', value: (row) => money(row.site.pmCost) },
  { key: 'pmDaysOnSite', label: 'PM Days / Annum', width: 18, format: 'number', value: (row) => row.site.pmDaysOnSite || 0 },
  { key: 'pmVisitsPerAnnum', label: 'PM Visits per Annum', width: 20, format: 'number', value: (row) => row.site.pmVisitsPerAnnum || '' },
  { key: 'cctvCost', label: 'CCTV Cost (GBP/year)', width: 22, format: 'money', value: (row) => money(row.site.cctvCost) },
  { key: 'cleaningCost', label: 'Cleaning Cost (GBP/year)', width: 24, format: 'money', value: (row) => money(row.site.cleaningCost) },
  { key: 'additionalCostAnnual', label: 'Additional Base Cost (GBP/year)', width: 32, format: 'money', value: (row) => money(row.site.additionalCostAnnual || 0) },
  { key: 'additionalCostAnnualComment', label: 'Additional Base Cost Comment', width: 32, value: (row) => row.site.additionalCostAnnualComment || '' },
  { key: 'additionalCostMonthly', label: 'Additional Monthly Cost (GBP/month)', width: 36, format: 'money', value: (row) => money(row.site.additionalCostMonthly || 0) },
  { key: 'additionalCostMonthlyComment', label: 'Additional Monthly Cost Comment', width: 34, value: (row) => row.site.additionalCostMonthlyComment || '' },
  { key: 'additionalCostMonthlyStartMonth', label: 'Monthly Cost From', width: 18, value: (row) => row.site.additionalCostMonthlyStartMonth || '' },
  { key: 'additionalCostMonthlyEndMonth', label: 'Monthly Cost To', width: 18, value: (row) => row.site.additionalCostMonthlyEndMonth || '' },
  { key: 'siteFixedCosts', label: 'Site Fixed Costs (GBP/year)', width: 28, format: 'money', value: (row) => money(row.siteFixedCosts) },
  { key: 'variableRate', label: 'Variable Rate (GBP/kWp)', width: 26, format: 'money', value: (row) => row.variableRate },
  { key: 'variableCost', label: 'Variable Cost (GBP/year)', width: 28, format: 'money', value: (row) => money(row.variableCost) },
  { key: 'annualFee', label: 'Total Annual Fee (GBP/year)', width: 30, format: 'money', value: (row) => money(row.annualFee) },
  { key: 'monthlyFee', label: 'Monthly Fee (GBP/month)', width: 28, format: 'money', value: (row) => money(row.monthlyFee) },
  { key: 'unitCost', label: 'Unit Cost (GBP/kWp/year)', width: 30, format: 'money', value: (row) => money(row.unitCost) },
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

const PIPELINE_BUILD_UP_HEADERS = [
  'Site Name',
  'Contract Status',
  'Forecast PAC Date',
  'SPV',
  'Billing Portfolio',
  'Site Type',
  'System Size (kWp)',
  'PM Days / Year',
  'PM Cost (GBP/year)',
  'CCTV Cost (GBP/year)',
  'Cleaning Cost (GBP/year)',
  'Additional Base Cost (GBP/year)',
  'Site Fixed Costs (GBP/year)',
  'Additional Monthly Cost (GBP/month)',
  'Additional Monthly Cost Annualised (GBP/year)',
  '<20MW Portfolio Tariff Cost (GBP/year)',
  '<20MW Total Site Cost (GBP/year)',
  '<20MW Monthly Fee (GBP/month)',
  '<20MW Fee (GBP/kWp/year)',
  '20-30MW Portfolio Tariff Cost (GBP/year)',
  '20-30MW Total Site Cost (GBP/year)',
  '20-30MW Monthly Fee (GBP/month)',
  '20-30MW Fee (GBP/kWp/year)',
  '30-40MW Portfolio Tariff Cost (GBP/year)',
  '30-40MW Total Site Cost (GBP/year)',
  '30-40MW Monthly Fee (GBP/month)',
  '30-40MW Fee (GBP/kWp/year)',
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

function feePerKwp(annualFee: number, systemSizeKwp: number): number {
  return systemSizeKwp > 0 ? annualFee / systemSizeKwp : 0;
}

function pipelineBuildUpRow(site: SiteWithCalculations): unknown[] {
  const additionalMonthlyAnnual = Math.max(site.fixedFee_20MW - site.siteFixedCosts - site.portfolioCost_20MW, 0);

  return [
    site.name,
    statusValue(site.contractStatus),
    dateValue(site.forecastPacDate),
    site.spvCode || '',
    site.billingPortfolio === 'EDEN' ? 'Eden' : 'Core',
    site.siteType,
    site.systemSizeKwp,
    site.pmDaysOnSite || 0,
    money(site.pmCost),
    money(site.cctvCost),
    money(site.cleaningCost),
    money(site.additionalCostAnnual || 0),
    money(site.siteFixedCosts),
    money(site.additionalCostMonthly || 0),
    money(additionalMonthlyAnnual),
    money(site.portfolioCost_20MW),
    money(site.fixedFee_20MW),
    money(site.fixedFee_20MW / 12),
    money(feePerKwp(site.fixedFee_20MW, site.systemSizeKwp)),
    money(site.portfolioCost_30MW),
    money(site.fixedFee_30MW),
    money(site.fixedFee_30MW / 12),
    money(feePerKwp(site.fixedFee_30MW, site.systemSizeKwp)),
    money(site.portfolioCost_40MW),
    money(site.fixedFee_40MW),
    money(site.fixedFee_40MW / 12),
    money(feePerKwp(site.fixedFee_40MW, site.systemSizeKwp)),
  ];
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
      ['', 'Total Annual O&M Cost (GBP/year)', money(totalAnnual)],
      ['', 'Average Unit Cost (GBP/kWp/year)', totalCapacity > 0 ? money(totalAnnual / totalCapacity) : 0],
    ],
    [8, 35, 18, 18, 22]
  );

  addSheet(workbook, 'Portfolio Tracker', [PORTFOLIO_HEADERS, ...exportRows.map(portfolioRow)], [
    30, 18, 12, 18, 18, 15, 20, 18, 20, 22, 24, 32, 36, 28, 26, 28, 30, 28, 30, 18, 18, 30,
  ]);
  addSheet(workbook, 'Small Sites Framework', [SMALL_HEADERS, ...smallRows.map(smallRow)], [
    30, 18, 12, 18, 18, 15, 20, 18, 20, 22, 24, 32, 36, 28, 26, 28, 30, 28, 24, 22, 16, 16, 18, 30,
  ]);
  addSheet(workbook, 'Standard Sites', [STANDARD_HEADERS, ...standardRows.map(standardRow)], [
    30, 18, 12, 18, 18, 15, 20, 18, 20, 22, 24, 32, 36, 28, 26, 28, 30, 28, 16, 16, 30,
  ]);

  setSheetFormats(workbook, 'Overview', 14, ['C'], ['E'], []);
  setSheetFormats(workbook, 'Portfolio Tracker', exportRows.length + 1, ['G', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S'], ['E', 'F'], ['B', 'H', 'I']);
  setSheetFormats(workbook, 'Small Sites Framework', smallRows.length + 1, ['G', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'], ['E', 'F', 'U', 'V'], ['B', 'H', 'I']);
  setSheetFormats(workbook, 'Standard Sites', standardRows.length + 1, ['G', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'], ['E', 'F', 'S', 'T'], ['B', 'H', 'I']);

  return workbook;
}

export async function writeClearsolExportBuffer(sites: SiteWithCalculations[]): Promise<Buffer> {
  const buffer = await buildClearsolExportWorkbook(sites).xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildPipelineCostBuildUpWorkbook(sites: SiteWithCalculations[]): ExcelJS.Workbook {
  const pipelineSites = sites
    .filter((site) => site.contractStatus !== 'Contracted' && site.contractStatus !== 'Yes')
    .slice()
    .sort((a, b) => a.forecastPacDate?.localeCompare(b.forecastPacDate || '') || a.name.localeCompare(b.name));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Clearsol O&M Portfolio Tracker';
  workbook.created = new Date();

  addSheet(
    workbook,
    'Pipeline Cost Build-up',
    [
      PIPELINE_BUILD_UP_HEADERS,
      ...pipelineSites.map(pipelineBuildUpRow),
    ],
    [
      32, 20, 18, 12, 18, 16, 18, 18, 22, 24, 26, 34, 30, 34, 42,
      38, 34, 32, 30, 42, 36, 34, 32, 42, 36, 34, 32,
    ]
  );
  setSheetFormats(
    workbook,
    'Pipeline Cost Build-up',
    pipelineSites.length + 1,
    ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA'],
    ['C'],
    ['G', 'H']
  );

  return workbook;
}

export async function writePipelineCostBuildUpBuffer(sites: SiteWithCalculations[]): Promise<Buffer> {
  const buffer = await buildPipelineCostBuildUpWorkbook(sites).xlsx.writeBuffer();
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
