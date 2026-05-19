import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { AppSessionUser } from './authz';
import {
  APP_GENERATED_BILLING_SOURCE,
  BILLING_SNAPSHOT_STATUS_COMMITTED,
  BillingSnapshotInput,
  billingMonthBounds,
  buildBillingSnapshotInput,
  isEligibleForBilling,
  normalizeBillingMonth,
} from './billing-generation';
import { activeRateTiers, listSites, listSpvs } from './portfolio-repository';
import { isBillingMonthLocked } from './billing-month-controls';
import { currentPortfolioTier } from './calculations';
import { resolveContractId } from './contracts';

const DEFAULT_NOTION_SITES_DATABASE_ID = '7dc7ccc45c5a43d7a75b2e97818089dc';

export interface BillingGenerationReport {
  month: string;
  eligibleSiteCount: number;
  generatedSnapshotCount: number;
  skippedExistingCount: number;
  missingRelationCount: number;
  missingRelationSiteIds: string[];
  source: typeof APP_GENERATED_BILLING_SOURCE;
}

export interface BillingGenerationResult {
  month: string;
  commit: boolean;
  run: { id: string; month: string; status: string; createdAt: Date } | null;
  snapshots: BillingSnapshotInput[];
  report: BillingGenerationReport;
}

interface PreparedBillingGeneration {
  contractId: string;
  contractName: string | null;
  month: string;
  snapshots: BillingSnapshotInput[];
  existingSiteIds: Set<string>;
  missingRelationSiteIds: string[];
  siteContractIds: Map<string, string>;
}

function assertBillingMonth(month: string | null | undefined): string {
  const normalized = normalizeBillingMonth(month);
  if (!normalized) {
    throw new Error('Billing month must use YYYY-MM format');
  }
  return normalized;
}

async function notionContractPageIds(siteIds: string[]): Promise<Map<string, string>> {
  if (siteIds.length === 0) return new Map();

  const preferredDatabaseId = process.env.NOTION_SITES_DATABASE_ID || DEFAULT_NOTION_SITES_DATABASE_ID;
  const mappings = await prisma.notionExternalMapping.findMany({
    where: {
      entityType: 'Site',
      entityId: { in: siteIds },
    },
    orderBy: [{ notionDatabaseId: 'asc' }, { updatedAt: 'desc' }],
  });

  const bySiteId = new Map<string, string>();
  for (const mapping of mappings) {
    if (!bySiteId.has(mapping.entityId) || mapping.notionDatabaseId === preferredDatabaseId) {
      bySiteId.set(mapping.entityId, mapping.notionPageId);
    }
  }
  return bySiteId;
}

async function prepareBillingGeneration(
  monthInput: string | null | undefined,
  contractIdInput?: string | null
): Promise<PreparedBillingGeneration> {
  const month = assertBillingMonth(monthInput);
  const contractId = await resolveContractId(contractIdInput);
  const { end } = billingMonthBounds(month);
  const [contract, sites, spvs, tiers] = await Promise.all([
    prisma.contract.findUnique({ where: { id: contractId }, select: { name: true } }),
    listSites({ monthEnd: end, contractId }),
    listSpvs(contractId),
    activeRateTiers(contractId),
  ]);
  const spvNames = new Map(spvs.map((spv) => [spv.code, spv.name]));
  const eligibleSites = sites.filter((site) => isEligibleForBilling(site, month));
  const combinedCapacityAppliedTier = currentPortfolioTier(sites, tiers, end);
  const eligibleSiteIds = eligibleSites.map((site) => site.id);
  const notionSyncedEligibleSiteIds = eligibleSites
    .filter((site) => site.billingPortfolio !== 'EDEN')
    .map((site) => site.id);

  const [contractPageIds, existingSnapshots, siteContracts] = await Promise.all([
    notionContractPageIds(notionSyncedEligibleSiteIds),
    prisma.billingSnapshot.findMany({
      where: {
        contractId,
        month,
        source: APP_GENERATED_BILLING_SOURCE,
        siteId: { in: eligibleSiteIds },
      },
      select: { siteId: true },
    }),
    prisma.site.findMany({
      where: { contractId, id: { in: eligibleSiteIds } },
      select: { id: true, contractId: true },
    }),
  ]);
  const siteContractIds = new Map(siteContracts.map((site) => [site.id, site.contractId]));

  const existingSiteIds = new Set(
    existingSnapshots
      .map((snapshot) => snapshot.siteId)
      .filter((siteId): siteId is string => Boolean(siteId))
  );
  const missingRelationSiteIds: string[] = [];
  const snapshots = eligibleSites.map((site) => {
    const notionContractPageId = contractPageIds.get(site.id) || '';
    if (!notionContractPageId && site.billingPortfolio !== 'EDEN') {
      missingRelationSiteIds.push(site.id);
    }

    return buildBillingSnapshotInput({
      contractId,
      contractName: contract?.name || null,
      site,
      month,
      spvName: site.spvCode ? spvNames.get(site.spvCode) || site.spvCode : 'Unassigned',
      notionContractPageId,
      appliedTier: combinedCapacityAppliedTier,
    });
  });

  return { contractId, contractName: contract?.name || null, month, snapshots, existingSiteIds, missingRelationSiteIds, siteContractIds };
}

function buildReport(prepared: PreparedBillingGeneration, generatedSnapshotCount: number): BillingGenerationReport {
  return {
    month: prepared.month,
    eligibleSiteCount: prepared.snapshots.length,
    generatedSnapshotCount,
    skippedExistingCount: prepared.existingSiteIds.size,
    missingRelationCount: prepared.missingRelationSiteIds.length,
    missingRelationSiteIds: prepared.missingRelationSiteIds,
    source: APP_GENERATED_BILLING_SOURCE,
  };
}

export async function previewBillingGeneration(month: string | null | undefined, contractId?: string | null): Promise<BillingGenerationResult> {
  const prepared = await prepareBillingGeneration(month, contractId);
  const snapshotsToCreate = prepared.snapshots.filter((snapshot) => !prepared.existingSiteIds.has(snapshot.siteId));

  return {
    month: prepared.month,
    commit: false,
    run: null,
    snapshots: snapshotsToCreate,
    report: buildReport(prepared, snapshotsToCreate.length),
  };
}

export async function commitBillingGeneration(
  month: string | null | undefined,
  user: AppSessionUser,
  contractId?: string | null
): Promise<BillingGenerationResult> {
  const prepared = await prepareBillingGeneration(month, contractId);
  if (await isBillingMonthLocked(prepared.month, prepared.contractId)) {
    throw new Error('This billing month is locked');
  }

  return prisma.$transaction(async (tx) => {
    const latestExisting = await tx.billingSnapshot.findMany({
      where: {
        month: prepared.month,
        contractId: prepared.contractId,
        source: APP_GENERATED_BILLING_SOURCE,
        siteId: { in: prepared.snapshots.map((snapshot) => snapshot.siteId) },
      },
      select: { siteId: true },
    });
    const existingSiteIds = new Set([
      ...prepared.existingSiteIds,
      ...latestExisting
        .map((snapshot) => snapshot.siteId)
        .filter((siteId): siteId is string => Boolean(siteId)),
    ]);
    const snapshotsToCreate = prepared.snapshots.filter((snapshot) => !existingSiteIds.has(snapshot.siteId));
    const report = buildReport({ ...prepared, existingSiteIds }, snapshotsToCreate.length);

    const run = await tx.billingRun.create({
      data: {
        contractId: prepared.contractId,
        month: prepared.month,
        source: APP_GENERATED_BILLING_SOURCE,
        status: BILLING_SNAPSHOT_STATUS_COMMITTED,
        snapshotCount: snapshotsToCreate.length,
        skippedExistingCount: existingSiteIds.size,
        missingRelationCount: prepared.missingRelationSiteIds.length,
        report: JSON.stringify(report),
        createdById: user.id,
        completedAt: new Date(),
      },
    });

    for (const snapshot of snapshotsToCreate) {
      const snapshotData = { ...snapshot };
      delete (snapshotData as Partial<BillingSnapshotInput>).contractName;
      await tx.billingSnapshot.create({
        data: {
          ...snapshotData,
          contractId: prepared.siteContractIds.get(snapshot.siteId) || prepared.contractId,
          source: APP_GENERATED_BILLING_SOURCE,
          status: BILLING_SNAPSHOT_STATUS_COMMITTED,
          billingRunId: run.id,
          createdById: user.id,
          importedAt: new Date(),
        },
      });
    }

    return {
      month: prepared.month,
      commit: true,
      run: { id: run.id, month: run.month, status: run.status, createdAt: run.createdAt },
      snapshots: snapshotsToCreate,
      report,
    };
  });
}

export async function generateBillingSnapshots(params: {
  month: string | null | undefined;
  commit?: boolean;
  user: AppSessionUser;
  contractId?: string | null;
}): Promise<BillingGenerationResult> {
  if (params.commit) {
    return commitBillingGeneration(params.month, params.user, params.contractId);
  }
  return previewBillingGeneration(params.month, params.contractId);
}

export async function listBillingSnapshots(params: {
  month?: string | null;
  source?: string | null;
  status?: string | null;
  contractId?: string | null;
} = {}) {
  const month = params.month ? assertBillingMonth(params.month) : null;
  const contractId = await resolveContractId(params.contractId);
  const where: Prisma.BillingSnapshotWhereInput = {
    contractId,
    ...(month ? { month } : {}),
    ...(params.source ? { source: params.source } : {}),
    ...(params.status ? { status: params.status } : {}),
  };

  const [snapshots, runs, allSnapshots] = await Promise.all([
    prisma.billingSnapshot.findMany({
      where,
      orderBy: [{ month: 'desc' }, { spvCode: 'asc' }, { siteName: 'asc' }],
    }),
    prisma.billingRun.findMany({
      where: {
        contractId,
        ...(month ? { month } : {}),
        ...(params.source ? { source: params.source } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.billingSnapshot.findMany({
      where: {
        contractId,
        ...(month ? { month } : {}),
        ...(params.source ? { source: params.source } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      select: {
        month: true,
        source: true,
        status: true,
        expectedAmount: true,
        invoicedAmount: true,
        systemSizeKwp: true,
        id: true,
      },
    }),
  ]);

  const summaryMap = new Map<string, {
    month: string;
    source: string;
    status: string;
    snapshotCount: number;
    expectedAmount: number;
    invoicedAmount: number;
    systemSizeKwp: number;
  }>();

  for (const snapshot of allSnapshots) {
    const key = `${snapshot.month}:${snapshot.source}:${snapshot.status}`;
    const row = summaryMap.get(key) || {
      month: snapshot.month,
      source: snapshot.source,
      status: snapshot.status,
      snapshotCount: 0,
      expectedAmount: 0,
      invoicedAmount: 0,
      systemSizeKwp: 0,
    };
    row.snapshotCount += 1;
    row.expectedAmount += snapshot.expectedAmount || 0;
    row.invoicedAmount += snapshot.invoicedAmount || 0;
    row.systemSizeKwp += snapshot.systemSizeKwp || 0;
    summaryMap.set(key, row);
  }

  return {
    month,
    summaries: Array.from(summaryMap.values()).sort((a, b) => b.month.localeCompare(a.month) || a.source.localeCompare(b.source)),
    runs,
    snapshots,
  };
}
