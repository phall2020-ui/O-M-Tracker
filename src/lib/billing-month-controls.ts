import { BillingAdjustmentSummary, SpvMonthlyReport, SpvMonthlyRow } from '@/types';
import { AppSessionUser } from './authz';
import { resolveContractId } from './contracts';
import { normalizeMonth } from './month-periods';
import prisma from './prisma';

export type BillingAdjustmentScope = 'SITE' | 'PORTFOLIO';
export type BillingAdjustmentAllocationMode = 'KEEP_PORTFOLIO' | 'SPLIT_BY_SPV_CAPACITY';

export interface BillingAdjustmentInput {
  contractId?: string | null;
  month: string;
  scope: BillingAdjustmentScope;
  allocationMode?: BillingAdjustmentAllocationMode;
  description: string;
  amount: number;
  category?: string | null;
  siteId?: string | null;
}

export interface BillingMonthControlState {
  month: string;
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  note: string | null;
  adjustments: BillingAdjustmentSummary[];
}

function assertMonth(value: string | null | undefined): string {
  const month = normalizeMonth(value);
  if (!month) throw new Error('Month must use YYYY-MM format');
  return month;
}

function assertUnlocked(isLocked: boolean) {
  if (isLocked) {
    throw new Error('This billing month is locked');
  }
}

async function audit(
  user: AppSessionUser,
  action: string,
  entityType: string,
  entityId: string,
  oldValues: unknown,
  newValues: unknown
) {
  await prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      oldValues: oldValues === null || oldValues === undefined ? null : JSON.stringify(oldValues),
      newValues: newValues === null || newValues === undefined ? null : JSON.stringify(newValues),
      userId: user.id,
    },
  });
}

function toSummary(adjustment: {
  id: string;
  month: string;
  scope: string;
  allocationMode: string;
  description: string;
  amount: number;
  category: string | null;
  siteId: string | null;
  site?: { name: string; spv?: { code: string; name: string } | null } | null;
  spvCode: string | null;
  spvName: string | null;
  createdAt: Date;
}): BillingAdjustmentSummary {
  return {
    id: adjustment.id,
    month: adjustment.month,
    scope: adjustment.scope as BillingAdjustmentScope,
    allocationMode: adjustment.allocationMode as BillingAdjustmentAllocationMode,
    description: adjustment.description,
    amount: adjustment.amount,
    category: adjustment.category,
    siteId: adjustment.siteId,
    siteName: adjustment.site?.name || null,
    spvCode: adjustment.spvCode || adjustment.site?.spv?.code || null,
    spvName: adjustment.spvName || adjustment.site?.spv?.name || null,
    createdAt: adjustment.createdAt.toISOString(),
  };
}

export async function isBillingMonthLocked(monthInput: string | null | undefined, contractIdInput?: string | null): Promise<boolean> {
  const month = assertMonth(monthInput);
  const contractId = await resolveContractId(contractIdInput);
  const lock = await prisma.billingMonthLock.findUnique({
    where: { contractId_month: { contractId, month } },
    select: { id: true },
  });
  return Boolean(lock);
}

export async function getBillingMonthControls(monthInput: string | null | undefined, contractIdInput?: string | null): Promise<BillingMonthControlState> {
  const month = assertMonth(monthInput);
  const contractId = await resolveContractId(contractIdInput);
  const [lock, adjustments] = await Promise.all([
    prisma.billingMonthLock.findUnique({
      where: { contractId_month: { contractId, month } },
      include: { lockedBy: { select: { name: true } } },
    }),
    prisma.billingAdjustment.findMany({
      where: { contractId, month },
      include: { site: { include: { spv: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    month,
    isLocked: Boolean(lock),
    lockedAt: lock?.lockedAt.toISOString() || null,
    lockedBy: lock?.lockedBy.name || null,
    note: lock?.note || null,
    adjustments: adjustments.map(toSummary),
  };
}

export async function lockBillingMonth(monthInput: string, note: string | null | undefined, user: AppSessionUser, contractIdInput?: string | null) {
  const month = assertMonth(monthInput);
  const contractId = await resolveContractId(contractIdInput);
  const lock = await prisma.billingMonthLock.upsert({
    where: { contractId_month: { contractId, month } },
    create: { contractId, month, note: note || null, lockedById: user.id },
    update: { note: note || null, lockedById: user.id, lockedAt: new Date() },
  });
  await audit(user, 'LOCK', 'BillingMonth', month, null, { month, note: lock.note });
  return lock;
}

export async function unlockBillingMonth(monthInput: string, user: AppSessionUser, contractIdInput?: string | null) {
  const month = assertMonth(monthInput);
  const contractId = await resolveContractId(contractIdInput);
  const existing = await prisma.billingMonthLock.findUnique({ where: { contractId_month: { contractId, month } } });
  if (!existing) return false;
  await prisma.billingMonthLock.delete({ where: { id: existing.id } });
  await audit(user, 'UNLOCK', 'BillingMonth', month, { month, note: existing.note }, null);
  return true;
}

export async function createBillingAdjustment(input: BillingAdjustmentInput, user: AppSessionUser): Promise<BillingAdjustmentSummary> {
  const month = assertMonth(input.month);
  const resolvedContractId = await resolveContractId(input.contractId);

  if (!input.description?.trim()) throw new Error('Description is required');
  if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error('Amount must be a non-zero number');

  const scope = input.scope;
  if (scope !== 'SITE' && scope !== 'PORTFOLIO') throw new Error('Invalid adjustment scope');

  const allocationMode: BillingAdjustmentAllocationMode =
    scope === 'SITE' ? 'KEEP_PORTFOLIO' : input.allocationMode || 'KEEP_PORTFOLIO';

  if (scope === 'PORTFOLIO' && allocationMode !== 'KEEP_PORTFOLIO' && allocationMode !== 'SPLIT_BY_SPV_CAPACITY') {
    throw new Error('Invalid allocation mode');
  }

  let site:
    | { id: string; name: string; contractId: string; spv?: { code: string; name: string } | null }
    | null = null;
  if (scope === 'SITE') {
    if (!input.siteId) throw new Error('Site is required for a site-level adjustment');
    site = await prisma.site.findFirst({
      where: { id: input.siteId, contractId: resolvedContractId },
      include: { spv: true },
    });
    if (!site) throw new Error('Site not found');
  }
  const targetContractId = site?.contractId || resolvedContractId;
  assertUnlocked(await isBillingMonthLocked(month, targetContractId));

  const adjustment = await prisma.billingAdjustment.create({
    data: {
      contractId: targetContractId,
      month,
      scope,
      allocationMode,
      description: input.description.trim(),
      amount: input.amount,
      category: input.category?.trim() || null,
      siteId: site?.id || null,
      spvCode: site?.spv?.code || null,
      spvName: site?.spv?.name || null,
      createdById: user.id,
    },
    include: { site: { include: { spv: true } } },
  });

  await audit(user, 'CREATE', 'BillingAdjustment', adjustment.id, null, toSummary(adjustment));
  return toSummary(adjustment);
}

export async function deleteBillingAdjustment(id: string, user: AppSessionUser, contractIdInput?: string | null): Promise<boolean> {
  const contractId = await resolveContractId(contractIdInput);
  const existing = await prisma.billingAdjustment.findFirst({
    where: { id, contractId },
    include: { site: { include: { spv: true } } },
  });
  if (!existing) return false;
  assertUnlocked(await isBillingMonthLocked(existing.month, existing.contractId));
  await prisma.billingAdjustment.delete({ where: { id } });
  await audit(user, 'DELETE', 'BillingAdjustment', id, toSummary(existing), null);
  return true;
}

function adjustmentRow(spvCode: string, spvName: string): SpvMonthlyRow {
  return {
    spvCode,
    spvName,
    siteCount: 0,
    contractedSiteCount: 0,
    pendingSiteCount: 0,
    totalCapacityKwp: 0,
    contractedCapacityKwp: 0,
    siteFixedCostsAnnual: 0,
    variableCostAnnual: 0,
    annualFee: 0,
    monthlyFee: 0,
    averageFeePerKwp: 0,
    correctiveDaysAllowed: 0,
    billingSnapshotCount: 0,
    invoicedAmount: 0,
    adjustmentAmount: 0,
    adjustedMonthlyFee: 0,
  };
}

function applyAdjustment(row: SpvMonthlyRow, amount: number) {
  row.adjustmentAmount = (row.adjustmentAmount || 0) + amount;
  row.adjustedMonthlyFee = (row.monthlyFee || 0) + (row.adjustmentAmount || 0);
}

function finalizeAdjustmentFields(row: SpvMonthlyRow): SpvMonthlyRow {
  const adjustmentAmount = row.adjustmentAmount || 0;
  return {
    ...row,
    adjustmentAmount,
    adjustedMonthlyFee: row.monthlyFee + adjustmentAmount,
  };
}

// Rows are keyed by billing portfolio as well as SPV code. An SPV that holds both Core and Eden
// sites produces two rows, and keying on the code alone silently dropped one of them, leaving the
// visible rows unable to sum to the printed total.
function rowKey(row: Pick<SpvMonthlyRow, 'spvCode' | 'billingPortfolio'>): string {
  return `${row.billingPortfolio || 'CORE'}:${row.spvCode}`;
}

export async function applyBillingMonthControls(report: SpvMonthlyReport, contractId?: string | null): Promise<SpvMonthlyReport> {
  const controls = await getBillingMonthControls(report.month, contractId);
  const rows = report.rows.map(finalizeAdjustmentFields);
  const rowMap = new Map(rows.map((row) => [rowKey(row), row]));

  // Adjustments carry an SPV code but no billing portfolio, so a code held by both portfolios
  // books against the Core row.
  const findRowByCode = (code: string) =>
    rowMap.get(`CORE:${code}`) || rows.find((row) => row.spvCode === code);

  for (const adjustment of controls.adjustments) {
    if (adjustment.scope === 'SITE') {
      const targetCode = adjustment.spvCode || 'UNASSIGNED';
      const row = findRowByCode(targetCode) || adjustmentRow(targetCode, adjustment.spvName || targetCode);
      applyAdjustment(row, adjustment.amount);
      rowMap.set(rowKey(row), row);
      continue;
    }

    if (adjustment.allocationMode === 'SPLIT_BY_SPV_CAPACITY') {
      const capacityRows = rows.filter((row) => row.spvCode !== 'UNASSIGNED' && row.contractedCapacityKwp > 0);
      const totalCapacity = capacityRows.reduce((sum, row) => sum + row.contractedCapacityKwp, 0);
      if (totalCapacity > 0) {
        for (const row of capacityRows) {
          applyAdjustment(row, adjustment.amount * (row.contractedCapacityKwp / totalCapacity));
        }
        continue;
      }
    }

    const row = findRowByCode('PORTFOLIO') || adjustmentRow('PORTFOLIO', 'Portfolio adjustments');
    applyAdjustment(row, adjustment.amount);
    rowMap.set(rowKey(row), row);
  }

  const adjustedRows = Array.from(rowMap.values())
    .map(finalizeAdjustmentFields)
    .sort((a, b) => b.adjustedMonthlyFee! - a.adjustedMonthlyFee! || a.spvCode.localeCompare(b.spvCode));
  const adjustmentTotal = controls.adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);

  return {
    ...report,
    isLocked: controls.isLocked,
    adjustments: controls.adjustments,
    rows: adjustedRows,
    totals: {
      ...report.totals,
      adjustmentAmount: adjustmentTotal,
      adjustedMonthlyFee: report.totals.monthlyFee + adjustmentTotal,
    },
  };
}
