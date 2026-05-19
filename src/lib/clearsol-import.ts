import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { BillingPortfolioCode, SiteFormData } from '@/types';

export type ParsedClearsolSite = SiteFormData & {
  sourceSheet: string;
  sourceRow: number;
  billingPortfolio: BillingPortfolioCode;
};

type Sheet = ExcelJS.Worksheet;

type DetailSiteInfo = {
  pmDaysOnSite: number;
  siteType: SiteFormData['siteType'];
};

function cellValue(sheet: Sheet, address: string): unknown {
  const value = sheet.getCell(address).value;
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result;
    if ('text' in value) return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part: { text?: string }) => part.text || '').join('');
    }
  }
  return value;
}

export function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  return parseFloat(value.replace(/[£,]/g, '').trim()) || 0;
}

export function parseExcelDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (slash) {
    const [, day, month, rawYear] = slash;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return trimmed;
}

function parseContractStatus(value: unknown): 'Contracted' | 'Awaiting Contract' | 'Awaiting PAC' {
  if (typeof value !== 'string') return 'Awaiting PAC';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'active' || normalized === 'contracted') return 'Contracted';
  if (normalized.includes('contract') && !normalized.includes('pac')) return 'Awaiting Contract';
  return 'Awaiting PAC';
}

function normalizeSiteName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function formulaResult(value: unknown, sheet: Sheet | undefined): unknown {
  if (!value || typeof value !== 'object') return value;
  if ('result' in value && value.result != null) return value.result;
  if (!sheet || !('formula' in value) || typeof value.formula !== 'string') return value;

  const formula = value.formula.replace(/^\s*=/, '').trim();
  const reciprocal = /^1\s*\/\s*([A-Z]+\d+)$/i.exec(formula);
  if (reciprocal) {
    const denominator = parseNumber(sheet.getCell(reciprocal[1]).value);
    return denominator > 0 ? 1 / denominator : 0;
  }

  return value;
}

function parsePmDaysOnSite(value: unknown, sheet?: Sheet): number {
  const numeric = parseNumber(formulaResult(value, sheet));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function columnNumber(name: string): number {
  return name
    .toUpperCase()
    .split('')
    .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function headerMap(sheet: Sheet, row: number): Map<string, number> {
  const headers = new Map<string, number>();
  for (let column = 1; column <= Math.max(sheet.columnCount, 1); column++) {
    const value = text(sheet.getRow(row).getCell(column).value);
    if (value) headers.set(value.replace(/\s+/g, ' ').trim().toLowerCase(), column);
  }
  return headers;
}

function findHeader(headers: Map<string, number>, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const found = headers.get(candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

function parseDetailSiteInfo(sheet: Sheet | undefined, siteType: SiteFormData['siteType']): Map<string, DetailSiteInfo> {
  const details = new Map<string, DetailSiteInfo>();
  if (!sheet) return details;

  const headers = headerMap(sheet, 1);
  const siteColumn = findHeader(headers, ['Site Name']);
  const pmDaysColumn = findHeader(headers, ['PM days on site', 'PM Days on Site']);
  if (!siteColumn || !pmDaysColumn) return details;

  for (let row = 2; row <= sheet.rowCount; row++) {
    const rowValues = sheet.getRow(row);
    const siteName = text(rowValues.getCell(siteColumn).value);
    if (!siteName || /^total|^monthly/i.test(siteName)) continue;

    details.set(normalizeSiteName(siteName), {
      pmDaysOnSite: parsePmDaysOnSite(rowValues.getCell(pmDaysColumn).value, sheet),
      siteType,
    });
  }

  return details;
}

function buildDetailSiteInfo(workbook: ExcelJS.Workbook): Map<string, DetailSiteInfo> {
  return new Map([
    ...parseDetailSiteInfo(workbook.getWorksheet('Rooftop'), 'Rooftop'),
    ...parseDetailSiteInfo(workbook.getWorksheet('Ground Mount'), 'Ground Mount'),
  ]);
}

function parsePortfolioTracker(sheet: Sheet, detailSiteInfo: Map<string, DetailSiteInfo>): ParsedClearsolSite[] {
  const headers = headerMap(sheet, 1);
  const siteColumn = findHeader(headers, ['Site Name']) || columnNumber('C');
  const sizeColumn = findHeader(headers, ['System Size (kWp)', 'Size (kWp)']) || columnNumber('D');
  const spvColumn = findHeader(headers, ['SPV Code', 'SPV']) || columnNumber('V');
  const contractColumn = findHeader(headers, ['Contract Status', 'Contract']) || columnNumber('E');
  const onboardColumn = findHeader(headers, ['Onboard Date']) || columnNumber('F');
  const pmColumn = findHeader(headers, ['PM Cost (£/yr)', 'PM Cost']) || columnNumber('G');
  const cctvColumn = findHeader(headers, ['CCTV Cost (£/yr)', 'CCTV Cost']) || columnNumber('H');
  const cleaningColumn = findHeader(headers, ['Cleaning Cost (£/yr)', 'Cleaning Cost']) || columnNumber('I');
  const startRow = headers.size > 0 ? 2 : 5;
  const endRow = Math.max(sheet.rowCount, 68);
  const rows: ParsedClearsolSite[] = [];

  for (let row = startRow; row <= endRow; row++) {
    const rowValues = sheet.getRow(row);
    const siteName = text(rowValues.getCell(siteColumn).value);
    if (!siteName) continue;
    const systemSizeKwp = parseNumber(rowValues.getCell(sizeColumn).value);
    if (systemSizeKwp <= 0) continue;
    const normalizedSiteName = normalizeSiteName(siteName);
    const detail = detailSiteInfo.get(normalizedSiteName);

    rows.push({
      name: siteName,
      systemSizeKwp,
      siteType: detail?.siteType || 'Rooftop',
      contractStatus: parseContractStatus(rowValues.getCell(contractColumn).value),
      onboardDate: parseExcelDate(rowValues.getCell(onboardColumn).value),
      pmCost: parseNumber(rowValues.getCell(pmColumn).value),
      pmDaysOnSite: detail?.pmDaysOnSite || 0,
      pmVisitsPerAnnum: 0,
      cctvCost: parseNumber(rowValues.getCell(cctvColumn).value),
      cleaningCost: parseNumber(rowValues.getCell(cleaningColumn).value),
      additionalCostAnnual: 0,
      additionalCostAnnualComment: null,
      additionalCostMonthly: 0,
      additionalCostMonthlyComment: null,
      additionalCostMonthlyStartMonth: null,
      additionalCostMonthlyEndMonth: null,
      spvId: text(rowValues.getCell(spvColumn).value),
      sourceSheet: 'Portfolio Tracker',
      sourceRow: row,
      billingPortfolio: 'CORE',
    });
  }

  return rows;
}

function parseEdenSites(sheet: Sheet): ParsedClearsolSite[] {
  const endRow = Math.max(sheet.rowCount, 200);
  const rows: ParsedClearsolSite[] = [];

  for (let row = 4; row <= endRow; row++) {
    const siteName = text(cellValue(sheet, `C${row}`));
    if (!siteName) continue;
    const systemSizeKwp = parseNumber(cellValue(sheet, `D${row}`));
    if (systemSizeKwp <= 0) continue;

    rows.push({
      name: siteName,
      systemSizeKwp,
      siteType: 'Rooftop',
      contractStatus: parseContractStatus(cellValue(sheet, `E${row}`)),
      onboardDate: parseExcelDate(cellValue(sheet, `F${row}`)),
      pmCost: parseNumber(cellValue(sheet, `G${row}`)),
      pmDaysOnSite: parsePmDaysOnSite(cellValue(sheet, `J${row}`)),
      pmVisitsPerAnnum: 0,
      cctvCost: parseNumber(cellValue(sheet, `H${row}`)),
      cleaningCost: parseNumber(cellValue(sheet, `I${row}`)),
      additionalCostAnnual: 0,
      additionalCostAnnualComment: null,
      additionalCostMonthly: 0,
      additionalCostMonthlyComment: null,
      additionalCostMonthlyStartMonth: null,
      additionalCostMonthlyEndMonth: null,
      spvId: text(cellValue(sheet, `S${row}`)),
      sourceSheet: 'Eden Sites',
      sourceRow: row,
      billingPortfolio: 'EDEN',
    });
  }

  return rows;
}

export function parseClearsolWorkbook(workbook: ExcelJS.Workbook): ParsedClearsolSite[] {
  const portfolioSheet = workbook.getWorksheet('Portfolio Tracker');
  if (!portfolioSheet) {
    throw new Error('Portfolio Tracker sheet not found');
  }

  const rows = parsePortfolioTracker(portfolioSheet, buildDetailSiteInfo(workbook));
  const edenSheet = workbook.getWorksheet('Eden Sites');
  if (edenSheet) rows.push(...parseEdenSites(edenSheet));
  return rows;
}

async function stripUnsupportedWorkbookComments(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);

  for (const path of Object.keys(zip.files)) {
    if (/^xl\/comments\/comment\d+\.xml$/i.test(path) || /^xl\/drawings\/commentsDrawing\d+\.vml$/i.test(path)) {
      zip.remove(path);
    }
    if (/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i.test(path)) {
      const rels = await zip.file(path)?.async('string');
      if (!rels) continue;
      const nextRels = rels
        .replace(/<Relationship[^>]+Type="[^"]*\/comments"[^>]*\/>/gi, '')
        .replace(/<Relationship[^>]+Type="[^"]*\/vmlDrawing"[^>]*\/>/gi, '');
      zip.file(path, nextRels);
    }
  }

  const contentTypes = await zip.file('[Content_Types].xml')?.async('string');
  if (contentTypes) {
    zip.file(
      '[Content_Types].xml',
      contentTypes
        .replace(/<Override[^>]+PartName="\/xl\/comments\/comment\d+\.xml"[^>]*\/>/gi, '')
        .replace(/<Override[^>]+PartName="\/xl\/drawings\/commentsDrawing\d+\.vml"[^>]*\/>/gi, '')
    );
  }

  return zip.generateAsync({ type: 'arraybuffer' });
}

export async function loadClearsolWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
    return workbook;
  } catch {
    const sanitizedBuffer = await stripUnsupportedWorkbookComments(buffer);
    const sanitizedWorkbook = new ExcelJS.Workbook();
    await sanitizedWorkbook.xlsx.load(sanitizedBuffer);
    return sanitizedWorkbook;
  }
}
