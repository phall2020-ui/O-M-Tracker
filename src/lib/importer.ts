import * as XLSX from 'xlsx';
import { Site, SPV } from '@/types';
import { cleanText, normaliseSite } from './validation';

export const SHEET_NAME = 'Portfolio Tracker';
const SUMMARY = new Set(['total', 'totals', 'sum', 'subtotal', 'grand total', 'portfolio total']);

export interface ImportRow {
  sourceRow: number;
  clean: Omit<Site, 'id' | 'createdAt' | 'updatedAt'> | null;
  errors: string[];
  warnings: string[];
  status: 'OK' | 'Warning' | 'Error';
}

export interface ImportPreview {
  rows: ImportRow[];
  fileErrors: string[];
  validSites: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>[];
}

export function parseWorkbook(buffer: ArrayBuffer, spvsByCode: Record<string, SPV>): ImportPreview {
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    return {
      rows: [],
      fileErrors: [`Sheet "${SHEET_NAME}" not found. Available: ${workbook.SheetNames.join(', ')}`],
      validSites: [],
    };
  }

  const sheet = workbook.Sheets[SHEET_NAME];
  const rows: ImportRow[] = [];
  let blankRun = 0;

  for (let row = 5; row <= 200; row++) {
    const rawName = sheet[`C${row}`]?.v;
    const name = cleanText(rawName);
    if (!name) {
      blankRun += 1;
      if (blankRun >= 10) break;
      continue;
    }
    blankRun = 0;
    if (SUMMARY.has(name.toLowerCase()) || typeof rawName !== 'string') continue;

    const onboardRaw = sheet[`F${row}`]?.v;
    let onboardDate: unknown = onboardRaw ?? null;
    if (typeof onboardRaw === 'number') {
      const date = XLSX.SSF.parse_date_code(onboardRaw);
      onboardDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }

    const { clean, errors, warnings } = normaliseSite(
      {
        name,
        systemSizeKwp: sheet[`D${row}`]?.v,
        contractStatus: sheet[`E${row}`]?.v,
        onboardDate,
        pmCost: sheet[`G${row}`]?.v,
        cctvCost: sheet[`H${row}`]?.v,
        cleaningCost: sheet[`I${row}`]?.v,
        spvCode: sheet[`V${row}`]?.v,
        siteType: 'Rooftop',
        sourceSheet: SHEET_NAME,
        sourceRow: row,
      },
      spvsByCode
    );

    rows.push({
      sourceRow: row,
      clean: errors.length ? null : clean,
      errors,
      warnings,
      status: errors.length ? 'Error' : warnings.length ? 'Warning' : 'OK',
    });
  }

  const names = new Map<string, ImportRow[]>();
  for (const row of rows) {
    if (row.clean?.name) {
      const key = row.clean.name.toLowerCase();
      names.set(key, [...(names.get(key) || []), row]);
    }
  }
  for (const group of names.values()) {
    if (group.length > 1) {
      const numbers = group.map((r) => r.sourceRow).join(', ');
      for (const row of group) row.warnings.push(`Duplicate site name (also on rows ${numbers})`);
      if (group[0].status === 'OK') group.forEach((r) => { if (r.status === 'OK') r.status = 'Warning'; });
    }
  }

  return {
    rows,
    fileErrors: [],
    validSites: rows.filter((r) => r.clean).map((r) => r.clean!),
  };
}
