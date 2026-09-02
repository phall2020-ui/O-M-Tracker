import { ContractStatus, Site, SiteType, SPV } from '@/types';

export class ValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join('; '));
    this.name = 'ValidationError';
  }
}

const TRUTHY = new Set(['yes', 'y', 'true', '1', 'contracted', 'signed', 'live']);
const FALSY = new Set(['no', 'n', 'false', '0', 'not contracted', 'pending', 'tbc', '', 'none', 'nan', '-', '—']);
const SITE_TYPE_ALIASES: Record<string, SiteType> = {
  rooftop: 'Rooftop',
  roof: 'Rooftop',
  'roof top': 'Rooftop',
  'roof-top': 'Rooftop',
  'ground mount': 'Ground Mount',
  'ground-mount': 'Ground Mount',
  groundmount: 'Ground Mount',
  ground: 'Ground Mount',
  gm: 'Ground Mount',
};

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number' && Number.isNaN(value)) return true;
  if (typeof value === 'string' && !value.trim()) return true;
  return false;
}

export function cleanText(value: unknown): string | null {
  if (isBlank(value)) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text || null;
}

export function parseNumber(value: unknown, field = 'value'): number | null {
  if (isBlank(value)) return null;
  if (typeof value === 'boolean') throw new Error(`${field}: expected a number, got a boolean`);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${field}: expected a number, got ${value}`);
    return value;
  }
  let text = String(value).trim().replace(/[£$€,\s]/g, '');
  if (text.startsWith('(') && text.endsWith(')')) text = `-${text.slice(1, -1)}`;
  const parsed = Number(text);
  if (Number.isNaN(parsed)) throw new Error(`${field}: "${value}" is not a number`);
  return parsed;
}

export function parseContractStatus(value: unknown): { status: ContractStatus; warning?: string } {
  if (typeof value === 'boolean') return { status: value ? 'Yes' : 'No' };
  if (typeof value === 'number' && Number.isFinite(value)) return { status: value ? 'Yes' : 'No' };
  const text = isBlank(value) ? '' : String(value).trim().toLowerCase();
  if (TRUTHY.has(text)) return { status: 'Yes' };
  if (FALSY.has(text)) return { status: 'No' };
  return { status: 'No', warning: `Unrecognised contract status "${value}" — treated as "No"` };
}

export function parseSiteType(value: unknown): { siteType: SiteType; warning?: string } {
  if (isBlank(value)) return { siteType: 'Rooftop' };
  const text = String(value).trim().toLowerCase();
  if (SITE_TYPE_ALIASES[text]) return { siteType: SITE_TYPE_ALIASES[text] };
  return { siteType: 'Rooftop', warning: `Unrecognised site type "${value}" — treated as "Rooftop"` };
}

function excelSerialToIso(serial: number): string {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

export function parseDate(value: unknown, field = 'date'): string | null {
  if (isBlank(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && value >= 20000 && value <= 80000) {
    return excelSerialToIso(value);
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (uk) {
    const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${year}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  throw new Error(`${field}: "${value}" is not a recognisable date (use DD/MM/YYYY)`);
}

export function normaliseSpvCode(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text.toUpperCase() : null;
}

export type SiteInput = Partial<Record<keyof Site, unknown>> & Record<string, unknown>;

export function normaliseSite(
  data: SiteInput,
  spvsByCode: Record<string, SPV>,
  options: { requirePositiveSize?: boolean } = {}
): { clean: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = cleanText(data.name);
  if (!name) errors.push('Site name is required');

  let size = 0;
  try {
    size = parseNumber(data.systemSizeKwp ?? data.system_size_kwp, 'System size (kWp)') ?? 0;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  if (size < 0) errors.push('System size (kWp) cannot be negative');
  else if (size === 0) {
    if (options.requirePositiveSize) errors.push('System size (kWp) must be greater than zero');
    else warnings.push('System size is 0 kWp — fees for this site will be zero');
  } else if (size > 100_000) {
    warnings.push(`System size ${size.toLocaleString('en-GB')} kWp looks unusually large — check units`);
  }

  const { siteType, warning: typeWarning } = parseSiteType(data.siteType ?? data.site_type);
  if (typeWarning) warnings.push(typeWarning);
  const { status: contractStatus, warning: contractWarning } = parseContractStatus(
    data.contractStatus ?? data.contract_status
  );
  if (contractWarning) warnings.push(contractWarning);

  let onboardDate: string | null = null;
  try {
    onboardDate = parseDate(data.onboardDate ?? data.onboard_date, 'Onboard date');
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  if (contractStatus === 'Yes' && !onboardDate) {
    warnings.push('Contracted site has no onboard date — it will be excluded from CM Days tracking');
  }
  if (onboardDate && onboardDate > new Date().toISOString().slice(0, 10)) {
    warnings.push(`Onboard date ${onboardDate} is in the future`);
  }

  const costs = { pmCost: 0, cctvCost: 0, cleaningCost: 0 };
  const costFields: Array<[keyof typeof costs, string, unknown]> = [
    ['pmCost', 'PM cost', data.pmCost ?? data.pm_cost],
    ['cctvCost', 'CCTV cost', data.cctvCost ?? data.cctv_cost],
    ['cleaningCost', 'Cleaning cost', data.cleaningCost ?? data.cleaning_cost],
  ];
  for (const [key, label, raw] of costFields) {
    try {
      const amount = parseNumber(raw, label) ?? 0;
      if (amount < 0) errors.push(`${label} cannot be negative`);
      costs[key] = Math.round(amount * 100) / 100;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (contractStatus === 'Yes' && size > 0 && costs.pmCost + costs.cctvCost + costs.cleaningCost === 0) {
    warnings.push('Contracted site has no fixed costs (PM, CCTV, Cleaning all £0)');
  }

  const spvCode = normaliseSpvCode(data.spvCode ?? data.spv_code);
  let spvId: string | null = null;
  if (spvCode) {
    const spv = spvsByCode[spvCode];
    if (spv) spvId = spv.id;
    else warnings.push(`SPV code "${spvCode}" is not a known SPV — site kept but unlinked`);
  } else {
    warnings.push('No SPV assigned');
  }

  let sourceRow: number | null = null;
  const rawRow = data.sourceRow ?? data.source_row;
  if (!isBlank(rawRow)) {
    const asNumber = Number(rawRow);
    sourceRow = Number.isFinite(asNumber) ? asNumber : null;
  }

  return {
    clean: {
      name: name || '',
      systemSizeKwp: Math.round(size * 10000) / 10000,
      siteType,
      contractStatus,
      onboardDate,
      pmCost: costs.pmCost,
      cctvCost: costs.cctvCost,
      cleaningCost: costs.cleaningCost,
      spvId,
      spvCode,
      sourceSheet: cleanText(data.sourceSheet ?? data.source_sheet),
      sourceRow,
    },
    errors,
    warnings,
  };
}

export function validateYearMonth(value: unknown): string {
  const text = cleanText(value) || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
    throw new ValidationError([`"${value}" is not a valid month (expected YYYY-MM)`]);
  }
  return text;
}
