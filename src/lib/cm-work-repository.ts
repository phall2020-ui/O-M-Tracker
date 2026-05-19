import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { AppSessionUser } from './authz';
import {
  buildCmAllowanceBreakdown,
  buildCmMonthlyUsage,
  calculateCmDays,
  CmMonthlyCapacity,
  CmMonthlyPortfolioCapacity,
  summarizeCmUsage,
} from './cm-days';
import { audit, mapPrismaSite } from './portfolio-repository';
import { getMonthBounds } from './month-periods';
import { BillingPortfolioCode } from '@/types';
import { resolveContractId } from './contracts';

export interface CreateCmWorkInput {
  siteId: string;
  workDate: string;
  hours: number;
  description?: string | null;
  technician?: string | null;
}

export async function listCmWork(status?: string, contractIdInput?: string | null) {
  const contractId = await resolveContractId(contractIdInput);
  return prisma.cmWorkEntry.findMany({
    where: {
      ...(status ? { status } : {}),
      site: { contractId },
    },
    include: {
      site: { include: { spv: true } },
      author: { select: { id: true, name: true, email: true, role: true } },
      reviewer: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { workDate: 'desc' },
  });
}

export async function createCmWork(input: CreateCmWorkInput & { contractId?: string | null; contract?: string | null }, user: AppSessionUser) {
  if (!input.siteId || !input.workDate || input.hours <= 0) {
    throw new Error('Site, work date, and positive hours are required');
  }
  const contractId = await resolveContractId(input.contract ?? input.contractId);
  const site = await prisma.site.findFirst({ where: { id: input.siteId, contractId }, select: { id: true } });
  if (!site) {
    throw new Error('Site not found for selected contract');
  }

  const entry = await prisma.cmWorkEntry.create({
    data: {
      siteId: input.siteId,
      workDate: new Date(input.workDate),
      hours: input.hours,
      days: calculateCmDays(input.hours),
      description: input.description || null,
      technician: input.technician || user.name || user.email || null,
      status: 'PENDING',
      authorId: user.id,
    },
    include: { site: { include: { spv: true } } },
  });

  await audit(user, 'CREATE', 'CmWorkEntry', entry.id, null, entry, entry.siteId);
  return entry;
}

export async function reviewCmWork(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  reviewNote: string | null,
  user: AppSessionUser,
  contractIdInput?: string | null
) {
  const contractId = await resolveContractId(contractIdInput);
  const existing = await prisma.cmWorkEntry.findFirst({ where: { id, site: { contractId } } });
  if (!existing) return null;

  const updated = await prisma.cmWorkEntry.update({
    where: { id },
    data: {
      status,
      reviewerId: user.id,
      reviewedAt: new Date(),
      reviewNote,
    },
    include: { site: { include: { spv: true } } },
  });

  await audit(
    user,
    status === 'APPROVED' ? 'APPROVE' : 'REJECT',
    'CmWorkEntry',
    id,
    existing,
    updated,
    updated.siteId
  );

  return updated;
}

export async function getOfficialCmUsage(params: { billingPortfolio?: BillingPortfolioCode; contractId?: string | null } = {}) {
  const contractId = await resolveContractId(params.contractId);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [monthlyCapacity, monthlyPortfolioCapacities, entries] = await Promise.all([
    getCmMonthlyCapacities(currentMonth, 1, contractId),
    getCmMonthlyPortfolioCapacities(currentMonth, 1, contractId),
    prisma.cmWorkEntry.findMany({
      where: { site: { contractId } },
      select: { status: true, hours: true, workDate: true, site: { select: { billingPortfolio: true } } },
    }),
  ]);
  const scopedMonthlyPortfolioCapacities = params.billingPortfolio
    ? monthlyPortfolioCapacities.filter((capacity) => capacity.billingPortfolio === params.billingPortfolio)
    : monthlyPortfolioCapacities;
  const scopedContractedCapacityKwp = params.billingPortfolio
    ? scopedMonthlyPortfolioCapacities.reduce((sum, capacity) => sum + capacity.contractedCapacityKwp, 0)
    : monthlyCapacity[0]?.contractedCapacityKwp ?? 0;
  const scopedEntries = params.billingPortfolio
    ? entries.filter((entry) => entry.site.billingPortfolio === params.billingPortfolio)
    : entries;

  const summary = summarizeCmUsage(
    scopedContractedCapacityKwp,
    scopedEntries.map((entry) => ({
      status: entry.status as 'PENDING' | 'APPROVED' | 'REJECTED',
      hours: entry.hours,
      workDate: entry.workDate,
    })),
    currentMonth
  );
  return {
    ...summary,
    portfolioAllowances: buildCmAllowanceBreakdown(scopedMonthlyPortfolioCapacities),
  };
}

export async function getCmMonthlyUsage(monthCount = 12, contractIdInput?: string | null) {
  const contractId = await resolveContractId(contractIdInput);
  const endMonth = new Date().toISOString().slice(0, 7);
  const [monthlyCapacities, monthlyPortfolioCapacities, entries] = await Promise.all([
    getCmMonthlyCapacities(endMonth, monthCount, contractId),
    getCmMonthlyPortfolioCapacities(endMonth, monthCount, contractId),
    prisma.cmWorkEntry.findMany({
      where: { site: { contractId } },
      select: { status: true, hours: true, workDate: true },
    }),
  ]);

  return buildCmMonthlyUsage(
    monthlyCapacities,
    entries.map((entry) => ({
      status: entry.status as 'PENDING' | 'APPROVED' | 'REJECTED',
      hours: entry.hours,
      workDate: entry.workDate,
    })),
    endMonth,
    monthCount,
    monthlyPortfolioCapacities
  );
}

function addMonths(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

function monthsEndingAt(endMonth: string, monthCount: number): string[] {
  return Array.from({ length: monthCount }, (_, index) => addMonths(endMonth, index - monthCount + 1));
}

function isAppGeneratedBillingSnapshot(snapshot: { source: string; notionDatabaseId: string; billingRunId: string | null }): boolean {
  return (
    snapshot.source === 'APP_GENERATED' &&
    snapshot.notionDatabaseId === 'APP_GENERATED_MONTHLY_BILLING' &&
    Boolean(snapshot.billingRunId)
  );
}

function billingPortfolioFromPayload(sourcePayload: string | null | undefined): BillingPortfolioCode {
  if (!sourcePayload) return 'CORE';
  try {
    const parsed = JSON.parse(sourcePayload) as { site?: { billingPortfolio?: string } };
    return parsed.site?.billingPortfolio === 'EDEN' ? 'EDEN' : 'CORE';
  } catch {
    return 'CORE';
  }
}

async function getCmMonthlyCapacities(endMonth: string, monthCount: number, contractId: string): Promise<CmMonthlyCapacity[]> {
  const months = monthsEndingAt(endMonth, monthCount);
  const [snapshots, sites] = await Promise.all([
    prisma.billingSnapshot.findMany({
      where: { contractId, month: { in: months } },
      select: {
        month: true,
        systemSizeKwp: true,
        source: true,
        notionDatabaseId: true,
        billingRunId: true,
      },
    }),
    prisma.site.findMany({
      where: { contractId },
      select: {
        systemSizeKwp: true,
        contractStatus: true,
        onboardDate: true,
        actualPacDate: true,
        billingPortfolio: true,
      },
    }),
  ]);

  return months.map((month) => {
    const monthSnapshots = snapshots.filter((snapshot) => snapshot.month === month);
    const appGeneratedSnapshots = monthSnapshots.filter(isAppGeneratedBillingSnapshot);
    const authoritativeSnapshots = appGeneratedSnapshots.length > 0 ? appGeneratedSnapshots : monthSnapshots;
    const snapshotCapacityKwp = authoritativeSnapshots.reduce((sum, snapshot) => sum + snapshot.systemSizeKwp, 0);

    if (authoritativeSnapshots.length > 0) {
      return { month, contractedCapacityKwp: snapshotCapacityKwp };
    }

    const { end } = getMonthBounds(month);
    const siteCapacityKwp = sites
      .filter((site) => {
        if (!['YES', 'CONTRACTED'].includes(site.contractStatus)) return false;
        const startDate = site.onboardDate || site.actualPacDate;
        if (!startDate) return true;
        return startDate <= end;
      })
      .reduce((sum, site) => sum + site.systemSizeKwp, 0);

    return { month, contractedCapacityKwp: siteCapacityKwp };
  });
}

async function getCmMonthlyPortfolioCapacities(endMonth: string, monthCount: number, contractId: string): Promise<CmMonthlyPortfolioCapacity[]> {
  const months = monthsEndingAt(endMonth, monthCount);
  const [snapshots, sites] = await Promise.all([
    prisma.billingSnapshot.findMany({
      where: { contractId, month: { in: months } },
      select: {
        month: true,
        systemSizeKwp: true,
        source: true,
        notionDatabaseId: true,
        billingRunId: true,
        sourcePayload: true,
      },
    }),
    prisma.site.findMany({
      where: { contractId },
      select: {
        systemSizeKwp: true,
        contractStatus: true,
        onboardDate: true,
        actualPacDate: true,
        billingPortfolio: true,
      },
    }),
  ]);

  return months.flatMap((month) => {
    const capacities: Record<BillingPortfolioCode, number> = { CORE: 0, EDEN: 0 };
    const monthSnapshots = snapshots.filter((snapshot) => snapshot.month === month);
    const appGeneratedSnapshots = monthSnapshots.filter(isAppGeneratedBillingSnapshot);
    const authoritativeSnapshots = appGeneratedSnapshots.length > 0 ? appGeneratedSnapshots : monthSnapshots;

    if (authoritativeSnapshots.length > 0) {
      for (const snapshot of authoritativeSnapshots) {
        capacities[billingPortfolioFromPayload(snapshot.sourcePayload)] += snapshot.systemSizeKwp;
      }
    } else {
      const { end } = getMonthBounds(month);
      for (const site of sites) {
        if (!['YES', 'CONTRACTED'].includes(site.contractStatus)) continue;
        const startDate = site.onboardDate || site.actualPacDate;
        if (startDate && startDate > end) continue;
        const portfolio = site.billingPortfolio === 'EDEN' ? 'EDEN' : 'CORE';
        capacities[portfolio] += site.systemSizeKwp;
      }
    }

    return [
      { month, billingPortfolio: 'CORE' as const, contractedCapacityKwp: capacities.CORE },
      { month, billingPortfolio: 'EDEN' as const, contractedCapacityKwp: capacities.EDEN },
    ];
  });
}

type CmWorkWithRelations = Prisma.CmWorkEntryGetPayload<{
  include: {
    site: { include: { spv: true } };
  };
}> & {
  author?: { id: string; name: string; email: string; role: string };
  reviewer?: { id: string; name: string; email: string; role: string } | null;
};

export function serializeCmWork(entry: CmWorkWithRelations) {
  return {
    ...entry,
    workDate: entry.workDate?.toISOString?.() || entry.workDate,
    reviewedAt: entry.reviewedAt?.toISOString?.() || entry.reviewedAt,
    createdAt: entry.createdAt?.toISOString?.() || entry.createdAt,
    updatedAt: entry.updatedAt?.toISOString?.() || entry.updatedAt,
    site: entry.site ? mapPrismaSite(entry.site) : undefined,
  };
}
