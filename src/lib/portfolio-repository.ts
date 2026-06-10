import prisma from './prisma';
import { Prisma } from '@prisma/client';
import {
  contractedCapacityForTier,
  calculatePortfolioSummary,
  calculateSiteWithAllTiers,
  currentPortfolioTier,
  DEFAULT_RATE_TIERS,
  determinePortfolioTier,
} from './calculations';
import { BillingPortfolioCode, RateTier, Site, SiteFormData, SiteWithCalculations } from '@/types';
import { AppSessionUser } from './authz';
import { buildSpvMonthlyReport } from './spv-monthly-report';
import { buildSpvMonthlyReportFromSnapshots } from './spv-monthly-snapshots';
import { normalizeMonth, currentMonth, getMonthBounds } from './month-periods';
import { applyBillingMonthControls } from './billing-month-controls';
import { findMatchingImportedSite } from './import-reconciliation';
import {
  APP_GENERATED_BILLING_DATABASE_ID,
  APP_GENERATED_BILLING_SOURCE,
  billingSnapshotRefreshData,
  buildBillingSnapshotInput,
  isEligibleForBilling,
} from './billing-generation';
import { resolveContractId } from './contracts';

function toBillingPortfolio(value: string | null | undefined): 'CORE' | 'EDEN' {
  return value === 'EDEN' ? 'EDEN' : 'CORE';
}

type SiteWithSpv = Prisma.SiteGetPayload<{ include: { spv: true } }>;

function toUiContractStatus(status: string): 'Contracted' | 'Awaiting Contract' | 'Awaiting PAC' {
  const normalized = status.toUpperCase();
  if (normalized === 'YES' || normalized === 'CONTRACTED') return 'Contracted';
  if (normalized === 'AWAITING_CONTRACT') return 'Awaiting Contract';
  return 'Awaiting PAC';
}

function toPrismaContractStatus(status: string | null | undefined): string {
  if (status === 'Contracted' || status === 'Yes' || status === 'YES' || status === 'CONTRACTED') return 'CONTRACTED';
  if (status === 'Awaiting Contract' || status === 'AWAITING_CONTRACT') return 'AWAITING_CONTRACT';
  return 'AWAITING_PAC';
}

function toUiSiteType(siteType: string): 'Rooftop' | 'Ground Mount' {
  return siteType === 'GROUND_MOUNT' ? 'Ground Mount' : 'Rooftop';
}

function toPrismaSiteType(siteType: string | null | undefined): string {
  return siteType === 'Ground Mount' || siteType === 'GROUND_MOUNT' ? 'GROUND_MOUNT' : 'ROOFTOP';
}

export function mapPrismaSite(site: SiteWithSpv): Site {
  return {
    id: site.id,
    contractId: site.contractId,
    name: site.name,
    systemSizeKwp: site.systemSizeKwp,
    siteType: toUiSiteType(site.siteType),
    contractStatus: toUiContractStatus(site.contractStatus),
    onboardDate: site.onboardDate ? site.onboardDate.toISOString().slice(0, 10) : null,
    forecastPacDate: site.forecastPacDate ? site.forecastPacDate.toISOString().slice(0, 10) : null,
    actualPacDate: site.actualPacDate ? site.actualPacDate.toISOString().slice(0, 10) : null,
    pmCost: site.pmCost,
    pmDaysOnSite: site.pmDaysOnSite,
    pmVisitsPerAnnum: site.pmVisitsPerAnnum,
    cctvCost: site.cctvCost,
    cleaningCost: site.cleaningCost,
    additionalCostAnnual: site.additionalCostAnnual,
    additionalCostAnnualComment: site.additionalCostAnnualComment,
    additionalCostMonthly: site.additionalCostMonthly,
    additionalCostMonthlyComment: site.additionalCostMonthlyComment,
    additionalCostMonthlyStartMonth: site.additionalCostMonthlyStartMonth,
    additionalCostMonthlyEndMonth: site.additionalCostMonthlyEndMonth,
    billingPortfolio: toBillingPortfolio(site.billingPortfolio),
    spvId: site.spvId,
    spvCode: site.spv?.code || null,
    sourceSheet: site.sourceSheet,
    sourceRow: site.sourceRow,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}

export async function activeRateTiers(contractId?: string | null): Promise<RateTier[]> {
  const resolvedContractId = await resolveContractId(contractId);
  const tiers = await prisma.rateTier.findMany({
    where: { contractId: resolvedContractId, isActive: true },
    orderBy: { minCapacityMW: 'asc' },
  });

  if (tiers.length === 0) {
    return DEFAULT_RATE_TIERS.map((tier) => ({ ...tier, contractId: resolvedContractId }));
  }

  return tiers.map((tier) => ({
    id: tier.id,
    contractId: tier.contractId,
    tierName: tier.tierName,
    minCapacityMW: tier.minCapacityMW,
    maxCapacityMW: tier.maxCapacityMW,
    ratePerKwp: tier.ratePerKwp,
  }));
}

export async function listSites(params: {
  search?: string;
  spvCode?: string;
  contractStatus?: string;
  sortBy?: string;
  sortOrder?: string;
  monthEnd?: Date | null;
  contractId?: string | null;
} = {}): Promise<SiteWithCalculations[]> {
  const contractId = await resolveContractId(params.contractId);
  const sites = await prisma.site.findMany({
    where: { contractId, OR: [{ sourceSheet: null }, { sourceSheet: { not: 'CM_DAYS_ONLY_PLACEHOLDER' } }] },
    include: { spv: true },
    orderBy: { name: params.sortOrder === 'desc' ? 'desc' : 'asc' },
  });
  const tiers = await activeRateTiers(contractId);
  const mappedSites = sites.map(mapPrismaSite);
  const appliedTier = currentPortfolioTier(mappedSites, tiers, params.monthEnd);
  const search = params.search?.trim().toLowerCase();
  const mapped = mappedSites
    .filter((site) => {
      if (search && !site.name.toLowerCase().includes(search)) return false;
      if (params.contractStatus && site.contractStatus !== toUiContractStatus(toPrismaContractStatus(params.contractStatus))) return false;
      if (params.spvCode && site.spvCode !== params.spvCode) return false;
      return true;
    })
    .map((site) => calculateSiteWithAllTiers(site, tiers, appliedTier));

  if (params.sortBy && params.sortBy !== 'name') {
    mapped.sort((a, b) => {
      const aValue = a[params.sortBy as keyof SiteWithCalculations] as string | number | null;
      const bValue = b[params.sortBy as keyof SiteWithCalculations] as string | number | null;
      const left = typeof aValue === 'string' ? aValue.toLowerCase() : aValue ?? '';
      const right = typeof bValue === 'string' ? bValue.toLowerCase() : bValue ?? '';
      if (left < right) return params.sortOrder === 'desc' ? 1 : -1;
      if (left > right) return params.sortOrder === 'desc' ? -1 : 1;
      return 0;
    });
  }

  return mapped;
}

export async function getSite(id: string, contractIdInput?: string | null): Promise<SiteWithCalculations | null> {
  const contractId = await resolveContractId(contractIdInput);
  const [site, allSites, tiers] = await Promise.all([
    prisma.site.findFirst({ where: { id, contractId }, include: { spv: true } }),
    prisma.site.findMany({ where: { contractId }, include: { spv: true } }),
    activeRateTiers(contractId),
  ]);
  if (!site) return null;
  const mappedSites = allSites.map(mapPrismaSite);
  const contractedCapacityKwpForTier = contractedCapacityForTier(mappedSites);
  const appliedTier = determinePortfolioTier(contractedCapacityKwpForTier / 1000, tiers);
  return calculateSiteWithAllTiers(mapPrismaSite(site), tiers, appliedTier, null, contractedCapacityKwpForTier);
}

async function refreshUnlockedAppGeneratedSnapshotsForSite(siteId: string) {
  const siteRecord = await prisma.site.findUnique({
    where: { id: siteId },
    select: { contractId: true, contract: { select: { name: true } } },
  });
  if (!siteRecord) return;
  const contractId = siteRecord.contractId;
  const existingSnapshots = await prisma.billingSnapshot.findMany({
    where: {
      contractId,
      siteId,
      source: APP_GENERATED_BILLING_SOURCE,
      notionDatabaseId: APP_GENERATED_BILLING_DATABASE_ID,
      billingRunId: { not: null },
    },
    select: {
      id: true,
      month: true,
      notionContractPageId: true,
    },
  });
  if (existingSnapshots.length === 0) return;

  const lockedMonths = new Set(
    (
      await prisma.billingMonthLock.findMany({
        where: { contractId, month: { in: existingSnapshots.map((snapshot) => snapshot.month) } },
        select: { month: true },
      })
    ).map((lock) => lock.month)
  );
  const refreshableSnapshots = existingSnapshots.filter((snapshot) => !lockedMonths.has(snapshot.month));
  if (refreshableSnapshots.length === 0) return;

  const [spvs, tiers, allSiteRecords] = await Promise.all([
    listSpvs(contractId),
    activeRateTiers(contractId),
    prisma.site.findMany({ where: { contractId }, include: { spv: true } }),
  ]);
  const spvNames = new Map(spvs.map((spv) => [spv.code, spv.name]));
  const allSites = allSiteRecords.map(mapPrismaSite);
  const targetSite = allSites.find((site) => site.id === siteId);
  if (!targetSite) return;

  for (const snapshot of refreshableSnapshots) {
    const { end } = getMonthBounds(snapshot.month);
    const appliedTier = currentPortfolioTier(allSites, tiers, end);
    const calculatedSite = calculateSiteWithAllTiers(
      targetSite,
      tiers,
      appliedTier,
      snapshot.month
    );

    if (!isEligibleForBilling(calculatedSite, snapshot.month)) {
      await prisma.billingSnapshot.delete({ where: { id: snapshot.id } });
      continue;
    }

    const input = buildBillingSnapshotInput({
      contractId,
      contractName: siteRecord.contract.name,
      site: calculatedSite,
      month: snapshot.month,
      spvName: calculatedSite.spvCode ? spvNames.get(calculatedSite.spvCode) || calculatedSite.spvCode : 'Unassigned',
      notionContractPageId: snapshot.notionContractPageId,
      appliedTier,
    });
    await prisma.billingSnapshot.update({
      where: { id: snapshot.id },
      data: billingSnapshotRefreshData(input),
    });
  }
}

async function resolveSpvId(spvCodeOrId: string | null | undefined, contractId: string): Promise<string | null> {
  if (!spvCodeOrId) return null;
  const spv = await prisma.sPV.findFirst({
    where: { contractId, OR: [{ id: spvCodeOrId }, { code: spvCodeOrId }] },
  });
  return spv?.id || null;
}

function siteInput(data: SiteFormData, spvId: string | null, contractId: string) {
  return {
    contractId,
    name: data.name.trim(),
    systemSizeKwp: data.systemSizeKwp,
    siteType: toPrismaSiteType(data.siteType),
    contractStatus: toPrismaContractStatus(data.contractStatus),
    onboardDate: data.onboardDate ? new Date(data.onboardDate) : null,
    forecastPacDate: data.forecastPacDate ? new Date(data.forecastPacDate) : null,
    actualPacDate: data.actualPacDate ? new Date(data.actualPacDate) : null,
    pmCost: data.pmCost || 0,
    pmDaysOnSite: data.pmDaysOnSite || 0,
    pmVisitsPerAnnum: data.pmVisitsPerAnnum || 0,
    cctvCost: data.cctvCost || 0,
    cleaningCost: data.cleaningCost || 0,
    additionalCostAnnual: data.additionalCostAnnual || 0,
    additionalCostAnnualComment: data.additionalCostAnnualComment?.trim() || null,
    additionalCostMonthly: data.additionalCostMonthly || 0,
    additionalCostMonthlyComment: data.additionalCostMonthlyComment?.trim() || null,
    additionalCostMonthlyStartMonth: data.additionalCostMonthlyStartMonth || null,
    additionalCostMonthlyEndMonth: data.additionalCostMonthlyEndMonth || null,
    billingPortfolio: toBillingPortfolio(data.billingPortfolio),
    spvId,
  };
}

export async function createSiteRecord(data: SiteFormData, user: AppSessionUser, contractIdInput?: string | null) {
  const contractId = await resolveContractId(contractIdInput ?? data.contractId);
  const spvId = await resolveSpvId(data.spvId, contractId);
  const created = await prisma.site.create({
    data: siteInput(data, spvId, contractId),
    include: { spv: true },
  });
  await audit(user, 'CREATE', 'Site', created.id, null, mapPrismaSite(created));
  return (await getSite(created.id, contractId)) || calculateSiteWithAllTiers(mapPrismaSite(created), await activeRateTiers(contractId));
}

export async function importSiteRecords(
  sites: Array<SiteFormData & { sourceSheet?: string | null; sourceRow?: number | null }>,
  user: AppSessionUser,
  contractIdInput?: string | null
) {
  const imported = [];
  let createdCount = 0;
  let updatedCount = 0;
  const contractId = await resolveContractId(contractIdInput);
  const existingSites = await prisma.site.findMany({
    where: { contractId },
    select: {
      id: true,
      name: true,
      sourceSheet: true,
      sourceRow: true,
      spvId: true,
    },
  });

  for (const site of sites) {
    const spvId = await resolveSpvId(site.spvId, contractId);
    const input = {
      ...siteInput(site, spvId, contractId),
      sourceSheet: site.sourceSheet || null,
      sourceRow: site.sourceRow || null,
    };
    const match = findMatchingImportedSite(existingSites, {
      name: site.name,
      sourceSheet: site.sourceSheet,
      sourceRow: site.sourceRow,
      spvId,
    });

    const record = match
      ? await prisma.site.update({
          where: { id: match.id },
          data: input,
          include: { spv: true },
        })
      : await prisma.site.create({
          data: input,
          include: { spv: true },
        });

    if (match) {
      updatedCount += 1;
    } else {
      createdCount += 1;
      existingSites.push({
        id: record.id,
        name: record.name,
        sourceSheet: record.sourceSheet,
        sourceRow: record.sourceRow,
        spvId: record.spvId,
      });
    }
    imported.push(record);
  }

  await audit(user, 'IMPORT', 'Site', 'bulk-import', null, {
    count: imported.length,
    createdCount,
    updatedCount,
    source: 'excel',
  });

  const tiers = await activeRateTiers(contractId);
  const mappedSites = (await prisma.site.findMany({ where: { contractId }, include: { spv: true } })).map(mapPrismaSite);
  const appliedTier = currentPortfolioTier(mappedSites, tiers);
  return imported.map(mapPrismaSite).map((site) => calculateSiteWithAllTiers(site, tiers, appliedTier));
}

export async function updateSiteRecord(id: string, data: SiteFormData, user: AppSessionUser, contractIdInput?: string | null) {
  const contractId = await resolveContractId(contractIdInput ?? data.contractId);
  const existing = await prisma.site.findFirst({ where: { id, contractId }, include: { spv: true } });
  if (!existing) return null;

  const spvId = await resolveSpvId(data.spvId, contractId);
  const updated = await prisma.site.update({
    where: { id },
    data: siteInput(data, spvId, contractId),
    include: { spv: true },
  });
  await refreshUnlockedAppGeneratedSnapshotsForSite(updated.id);
  await audit(user, 'UPDATE', 'Site', updated.id, mapPrismaSite(existing), mapPrismaSite(updated));
  return (await getSite(updated.id, contractId)) || calculateSiteWithAllTiers(mapPrismaSite(updated), await activeRateTiers(contractId));
}

export async function deleteSiteRecord(id: string, user: AppSessionUser, contractIdInput?: string | null): Promise<boolean> {
  const contractId = await resolveContractId(contractIdInput);
  const existing = await prisma.site.findFirst({ where: { id, contractId }, include: { spv: true } });
  if (!existing) return false;

  await prisma.$transaction(async (tx) => {
    await tx.cmWorkEntry.deleteMany({ where: { siteId: id } });
    await tx.notionExternalMapping.deleteMany({ where: { entityType: 'Site', entityId: id } });
    await tx.site.delete({ where: { id } });
  });

  await audit(user, 'DELETE', 'Site', id, mapPrismaSite(existing), null);
  return true;
}

export async function listSpvs(contractIdInput?: string | null) {
  const contractId = await resolveContractId(contractIdInput);
  return prisma.sPV.findMany({ where: { contractId }, orderBy: { code: 'asc' } });
}

export async function getSpvSummaries(params: { billingPortfolio?: BillingPortfolioCode; contractId?: string | null } = {}) {
  const contractId = await resolveContractId(params.contractId);
  const [spvs, allSiteRecords, tiers] = await Promise.all([
    prisma.sPV.findMany({
      where: { contractId },
      include: { sites: { where: { contractId }, include: { spv: true } } },
      orderBy: { code: 'asc' },
    }),
    prisma.site.findMany({ where: { contractId }, include: { spv: true } }),
    activeRateTiers(contractId),
  ]);
  const allSites = allSiteRecords.map(mapPrismaSite);
  const appliedTier = currentPortfolioTier(allSites, tiers);

  return spvs
    .map((spv) => {
      const sites = spv.sites
        .map(mapPrismaSite)
        .filter((site) => !params.billingPortfolio || site.billingPortfolio === params.billingPortfolio);
      const contractedSites = sites.filter((site) => site.contractStatus === 'Contracted' || site.contractStatus === 'Yes');
      const monthlyRevenue = contractedSites
        .map((site) => calculateSiteWithAllTiers(site, tiers, appliedTier))
        .reduce((sum, site) => sum + site.monthlyFee, 0);

      return {
        code: spv.code,
        name: spv.name,
        siteCount: sites.length,
        contractedCount: contractedSites.length,
        totalCapacityKwp: sites.reduce((sum, site) => sum + site.systemSizeKwp, 0),
        contractedCapacityKwp: contractedSites.reduce((sum, site) => sum + site.systemSizeKwp, 0),
        monthlyRevenue,
      };
    })
    .filter((summary) => summary.siteCount > 0)
    .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
}

export async function getSpvMonthlyReport(month?: string | null, contractIdInput?: string | null) {
  const contractId = await resolveContractId(contractIdInput);
  const selectedMonth = normalizeMonth(month) || currentMonth();
  const { end } = getMonthBounds(selectedMonth);
  const monthSnapshots = await prisma.billingSnapshot.findMany({
    where: { contractId, month: selectedMonth },
    orderBy: { billingEntry: 'asc' },
  });
  const appGeneratedSnapshots = monthSnapshots.filter(
    (snapshot) =>
      snapshot.source === 'APP_GENERATED' &&
      snapshot.notionDatabaseId === 'APP_GENERATED_MONTHLY_BILLING' &&
      Boolean(snapshot.billingRunId)
  );
  const billingSnapshots = appGeneratedSnapshots.length > 0 ? appGeneratedSnapshots : monthSnapshots;

  if (billingSnapshots.length > 0) {
    const snapshotsForReport = appGeneratedSnapshots.length > 0
      ? billingSnapshots
      : billingSnapshots.filter((snapshot) => Boolean(snapshot.siteId));
    const siteIds = snapshotsForReport
      .map((snapshot) => snapshot.siteId)
      .filter((siteId): siteId is string => Boolean(siteId));
    const linkedSites = await prisma.site.findMany({
      where: { contractId, id: { in: siteIds } },
      include: { spv: true },
    });
    const linkedSitesById = new Map(linkedSites.map((site) => [site.id, mapPrismaSite(site)]));
    const linkedSpvsBySiteId = new Map(
      linkedSites.map((site) => [
        site.id,
        {
          code: site.spv?.code || null,
          name: site.spv?.name || site.spv?.code || null,
        },
      ])
    );
    const eligibleSnapshots = snapshotsForReport.filter((snapshot) => {
      if (appGeneratedSnapshots.length > 0) return true;
      if (!snapshot.siteId) return false;
      const site = linkedSitesById.get(snapshot.siteId);
      const startDate = site?.onboardDate || site?.actualPacDate;
      return Boolean(site && (site.contractStatus === 'Contracted' || site.contractStatus === 'Yes') && (!startDate || new Date(`${startDate}T00:00:00.000Z`) <= end));
    });
    const months = await prisma.billingSnapshot.findMany({
      where: { contractId },
      distinct: ['month'],
      select: { month: true },
      orderBy: { month: 'asc' },
    });
    return applyBillingMonthControls(buildSpvMonthlyReportFromSnapshots(
      eligibleSnapshots.map((snapshot) => ({
        id: snapshot.id,
        siteId: snapshot.siteId || snapshot.id,
        siteName: snapshot.siteName,
        spvCode: (snapshot.siteId ? linkedSpvsBySiteId.get(snapshot.siteId)?.code : null) ?? snapshot.spvCode,
        spvName: (snapshot.siteId ? linkedSpvsBySiteId.get(snapshot.siteId)?.name : null) ?? snapshot.spvName,
        month: snapshot.month,
        systemSizeKwp: snapshot.systemSizeKwp,
        siteFixedCostsAnnual: snapshot.siteFixedCostsAnnual,
        variableCostAnnual: snapshot.variableCostAnnual,
        expectedAmount: snapshot.expectedAmount,
        invoicedAmount: snapshot.invoicedAmount,
        sourcePayload: snapshot.sourcePayload,
      })),
      selectedMonth,
      months.map((item) => item.month)
    ), contractId);
  }

  const [sites, spvs, tiers] = await Promise.all([listSites({ monthEnd: end, contractId }), listSpvs(contractId), activeRateTiers(contractId)]);
  const spvNames = Object.fromEntries(spvs.map((spv) => [spv.code, spv.name]));
  return applyBillingMonthControls({ ...buildSpvMonthlyReport(sites, selectedMonth, spvNames, tiers), source: 'calculated-sites' as const }, contractId);
}

export async function getPortfolioSummary(params: { billingPortfolio?: BillingPortfolioCode; contractId?: string | null } = {}) {
  const contractId = await resolveContractId(params.contractId);
  const [sites, tiers] = await Promise.all([listSites({ contractId }), activeRateTiers(contractId)]);
  const scopedSites = params.billingPortfolio
    ? sites.filter((site) => site.billingPortfolio === params.billingPortfolio)
    : sites;
  return calculatePortfolioSummary(scopedSites, tiers);
}

export async function audit(
  user: AppSessionUser,
  action: string,
  entityType: string,
  entityId: string,
  oldValues: unknown,
  newValues: unknown,
  siteId?: string
) {
  await prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      oldValues: oldValues === null || oldValues === undefined ? null : JSON.stringify(oldValues),
      newValues: newValues === null || newValues === undefined ? null : JSON.stringify(newValues),
      userId: user.id,
      siteId,
    },
  });
}
