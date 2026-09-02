import { AuditEntry, Site, SPV, CMDaysUsage } from '@/types';
import { generateId } from './utils';
import { SiteInput, ValidationError, normaliseSite, validateYearMonth } from './validation';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'src/data/sites.json');
const SPV_FILE = path.join(process.cwd(), 'src/data/spvs.json');
const CM_DAYS_FILE = path.join(process.cwd(), 'src/data/cm-days-usage.json');
const AUDIT_FILE = path.join(process.cwd(), 'src/data/audit-log.json');

// Default SPVs
export const DEFAULT_SPVS: SPV[] = [
  { id: '1', code: 'OS2', name: 'Olympus Solar 2 Ltd' },
  { id: '2', code: 'AD1', name: 'AMPYR Distributed Energy 1 Ltd' },
  { id: '3', code: 'FS', name: 'Fylde Solar Ltd' },
  { id: '4', code: 'ESI8', name: 'Eden Sustainable Investments 8 Ltd' },
  { id: '5', code: 'ESI1', name: 'Eden Sustainable Investments 1 Ltd' },
  { id: '6', code: 'ESI10', name: 'Eden Sustainable Investments 10 Ltd' },
  { id: '7', code: 'UV1', name: 'ULTRAVOLT SPV1 LIMITED' },
  { id: '8', code: 'SKY', name: 'Skylight Energy Ltd' },
];

// In-memory cache
let sitesCache: Site[] | null = null;
let spvsCache: SPV[] | null = null;
let cmDaysUsageCache: CMDaysUsage[] | null = null;
let auditCache: AuditEntry[] | null = null;

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'src/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// SPV Operations
export function getSpvs(): SPV[] {
  if (spvsCache) return spvsCache;
  
  ensureDataDir();
  
  if (fs.existsSync(SPV_FILE)) {
    const data = fs.readFileSync(SPV_FILE, 'utf-8');
    spvsCache = JSON.parse(data);
    return spvsCache!;
  }
  
  // Initialize with defaults
  fs.writeFileSync(SPV_FILE, JSON.stringify(DEFAULT_SPVS, null, 2));
  spvsCache = DEFAULT_SPVS;
  return spvsCache;
}

export function getSpvByCode(code: string): SPV | undefined {
  return getSpvs().find(s => s.code.toLowerCase() === code.toLowerCase());
}

export function getSpvById(id: string): SPV | undefined {
  return getSpvs().find(s => s.id === id);
}

export function getSpvsByCode(): Record<string, SPV> {
  return Object.fromEntries(getSpvs().map((s) => [s.code.toUpperCase(), s]));
}

function writeAudit(
  tableName: string,
  recordId: string,
  action: string,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null
) {
  const entries = getAuditLog();
  entries.unshift({
    id: generateId(),
    tableName,
    recordId,
    action,
    oldValues,
    newValues,
    timestamp: new Date().toISOString(),
  });
  ensureDataDir();
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries.slice(0, 2000), null, 2));
  auditCache = entries.slice(0, 2000);
}

export function getAuditLog(limit = 500, tableName?: string, action?: string): AuditEntry[] {
  if (!auditCache) {
    ensureDataDir();
    auditCache = fs.existsSync(AUDIT_FILE) ? JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8')) : [];
  }
  return (auditCache ?? [])
    .filter((e) => (!tableName || e.tableName === tableName) && (!action || e.action === action))
    .slice(0, limit);
}

/** Resolve an SPV from either its id or its code (the form historically sent either). */
export function resolveSpv(idOrCode: string | null | undefined): SPV | undefined {
  if (!idOrCode) return undefined;
  return getSpvById(idOrCode) || getSpvByCode(idOrCode);
}

// Site Operations
export function getSites(): Site[] {
  if (sitesCache) return sitesCache;
  
  ensureDataDir();
  
  if (fs.existsSync(DATA_FILE)) {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    sitesCache = JSON.parse(data);
    return sitesCache!;
  }
  
  // Initialize empty
  sitesCache = [];
  saveSites(sitesCache);
  return sitesCache;
}

function saveSites(sites: Site[]): void {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(sites, null, 2));
  sitesCache = sites;
}

export function getSiteById(id: string): Site | undefined {
  return getSites().find(s => s.id === id);
}

export function createSite(data: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>): Site {
  const { clean, errors } = normaliseSite(data as SiteInput, getSpvsByCode(), { requirePositiveSize: true });
  if (errors.length) throw new ValidationError(errors);

  const now = new Date().toISOString();
  const newSite: Site = { ...clean, id: generateId(), createdAt: now, updatedAt: now };
  const sites = getSites();
  sites.push(newSite);
  saveSites(sites);
  writeAudit('sites', newSite.id, 'create', null, { ...clean, id: newSite.id });
  return newSite;
}

export function updateSite(id: string, data: Partial<Site>): Site | null {
  const sites = getSites();
  const index = sites.findIndex(s => s.id === id);
  if (index === -1) return null;

  const merged = { ...sites[index], ...data, id };
  const { clean, errors } = normaliseSite(merged as SiteInput, getSpvsByCode());
  if (errors.length) throw new ValidationError(errors);

  const changed: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  (Object.keys(clean) as Array<keyof typeof clean>).forEach((key) => {
    if (clean[key] !== sites[index][key]) {
      changed[key] = clean[key];
      previous[key] = sites[index][key];
    }
  });

  const updatedSite: Site = { ...sites[index], ...clean, id, updatedAt: new Date().toISOString() };
  sites[index] = updatedSite;
  saveSites(sites);
  if (Object.keys(changed).length) writeAudit('sites', id, 'update', previous, changed);
  return updatedSite;
}

export function deleteSite(id: string): boolean {
  const sites = getSites();
  const index = sites.findIndex(s => s.id === id);
  if (index === -1) return false;
  const [removed] = sites.splice(index, 1);
  saveSites(sites);
  writeAudit('sites', id, 'delete', removed as unknown as Record<string, unknown>, null);
  return true;
}

export function importSites(sitesData: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>[]): Site[] {
  const spvs = getSpvsByCode();
  const cleaned: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const errors: string[] = [];
  sitesData.forEach((raw, i) => {
    const { clean, errors: rowErrors } = normaliseSite(raw as SiteInput, spvs);
    if (rowErrors.length) errors.push(`${raw.name || `row ${i + 1}`}: ${rowErrors.join('; ')}`);
    else cleaned.push(clean);
  });
  if (errors.length) throw new ValidationError(errors);

  const now = new Date().toISOString();
  const previous = getSites().length;
  const newSites: Site[] = cleaned.map((data) => ({ ...data, id: generateId(), createdAt: now, updatedAt: now }));
  saveSites(newSites);
  writeAudit('sites', '*', 'import', { sitesReplaced: previous }, { sitesImported: newSites.length });
  return newSites;
}

export function repairSpvLinks(): number {
  const spvs = getSpvsByCode();
  const sites = getSites();
  let fixed = 0;
  sites.forEach((site, index) => {
    if (!site.spvCode) return;
    const code = site.spvCode.trim().toUpperCase();
    const expected = spvs[code];
    const expectedId = expected?.id ?? null;
    if (code !== site.spvCode || expectedId !== site.spvId) {
      writeAudit('sites', site.id, 'update', { spvCode: site.spvCode, spvId: site.spvId }, { spvCode: code, spvId: expectedId });
      sites[index] = { ...site, spvCode: code, spvId: expectedId, updatedAt: new Date().toISOString() };
      fixed += 1;
    }
  });
  if (fixed) saveSites(sites);
  return fixed;
}

export function findSitesByName(name: string, excludeId?: string): Site[] {
  const needle = name.trim().toLowerCase();
  if (!needle) return [];
  return getSites().filter((s) => s.name.trim().toLowerCase() === needle && s.id !== excludeId);
}

// Clear cache (useful for testing)
export function clearCache(): void {
  sitesCache = null;
  spvsCache = null;
  cmDaysUsageCache = null;
  auditCache = null;
}

// CM Days Usage Operations
export function getCMDaysUsage(): CMDaysUsage[] {
  if (cmDaysUsageCache) return cmDaysUsageCache;
  
  ensureDataDir();
  
  if (fs.existsSync(CM_DAYS_FILE)) {
    const data = fs.readFileSync(CM_DAYS_FILE, 'utf-8');
    cmDaysUsageCache = JSON.parse(data);
    return cmDaysUsageCache!;
  }
  
  // Initialize empty
  cmDaysUsageCache = [];
  saveCMDaysUsage(cmDaysUsageCache);
  return cmDaysUsageCache;
}

function saveCMDaysUsage(usage: CMDaysUsage[]): void {
  ensureDataDir();
  fs.writeFileSync(CM_DAYS_FILE, JSON.stringify(usage, null, 2));
  cmDaysUsageCache = usage;
}

export function getCMDaysUsageByMonth(yearMonth: string): CMDaysUsage | undefined {
  return getCMDaysUsage().find(u => u.yearMonth === yearMonth);
}

export function upsertCMDaysUsage(yearMonth: string, daysUsed: number, notes: string | null): CMDaysUsage {
  yearMonth = validateYearMonth(yearMonth);
  if (typeof daysUsed !== 'number' || daysUsed < 0 || Number.isNaN(daysUsed)) {
    throw new ValidationError(['Days used must be a non-negative number']);
  }
  const usageList = getCMDaysUsage();
  const existingIndex = usageList.findIndex(u => u.yearMonth === yearMonth);
  const now = new Date().toISOString();
  
  if (existingIndex !== -1) {
    const previous = usageList[existingIndex];
    usageList[existingIndex] = {
      ...previous,
      daysUsed,
      notes,
      updatedAt: now,
    };
    writeAudit('cm_days_usage', yearMonth, 'update', { daysUsed: previous.daysUsed, notes: previous.notes }, { daysUsed, notes });
    saveCMDaysUsage(usageList);
    return usageList[existingIndex];
  } else {
    // Create new
    const newUsage: CMDaysUsage = {
      id: generateId(),
      yearMonth,
      daysUsed,
      notes,
      createdAt: now,
      updatedAt: now,
    };
    usageList.push(newUsage);
    writeAudit('cm_days_usage', yearMonth, 'create', null, { yearMonth, daysUsed, notes });
    saveCMDaysUsage(usageList);
    return newUsage;
  }
}

export function deleteCMDaysUsage(yearMonth: string): boolean {
  const usageList = getCMDaysUsage();
  const index = usageList.findIndex(u => u.yearMonth === yearMonth);
  
  if (index === -1) return false;
  
  usageList.splice(index, 1);
  saveCMDaysUsage(usageList);
  
  return true;
}
