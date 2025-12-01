import { Site, SPV, CMDaysUsage } from '@/types';
import { generateId } from './utils';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'src/data/sites.json');
const SPV_FILE = path.join(process.cwd(), 'src/data/spvs.json');
const CM_DAYS_FILE = path.join(process.cwd(), 'src/data/cm-days-usage.json');

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
  return getSpvs().find(s => s.code === code);
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
  const sites = getSites();
  const now = new Date().toISOString();
  
  const newSite: Site = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  
  sites.push(newSite);
  saveSites(sites);
  
  return newSite;
}

export function updateSite(id: string, data: Partial<Site>): Site | null {
  const sites = getSites();
  const index = sites.findIndex(s => s.id === id);
  
  if (index === -1) return null;
  
  const updatedSite: Site = {
    ...sites[index],
    ...data,
    id, // Ensure ID doesn't change
    updatedAt: new Date().toISOString(),
  };
  
  sites[index] = updatedSite;
  saveSites(sites);
  
  return updatedSite;
}

export function deleteSite(id: string): boolean {
  const sites = getSites();
  const index = sites.findIndex(s => s.id === id);
  
  if (index === -1) return false;
  
  sites.splice(index, 1);
  saveSites(sites);
  
  return true;
}

// Bulk import
export function importSites(sitesData: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>[]): Site[] {
  const now = new Date().toISOString();
  
  const newSites: Site[] = sitesData.map(data => ({
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  }));
  
  saveSites(newSites);
  return newSites;
}

// Clear cache (useful for testing)
export function clearCache(): void {
  sitesCache = null;
  spvsCache = null;
  cmDaysUsageCache = null;
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
  const usageList = getCMDaysUsage();
  const existingIndex = usageList.findIndex(u => u.yearMonth === yearMonth);
  const now = new Date().toISOString();
  
  if (existingIndex !== -1) {
    // Update existing
    usageList[existingIndex] = {
      ...usageList[existingIndex],
      daysUsed,
      notes,
      updatedAt: now,
    };
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
