import prisma from './prisma';
import { APP_GENERATED_BILLING_SOURCE, normalizeBillingMonth } from './billing-generation';
import { resolveContractId } from './contracts';

const NOTION_VERSION = '2022-06-28';
const DEFAULT_BILLING_DATABASE_ID = '39212e37c38b4c79b1cd8e54c976f7ea';
const APP_GENERATED_PLACEHOLDER_PREFIX = `${APP_GENERATED_BILLING_SOURCE}:`;
const SYNCED_STATUS = 'SYNCED';
const FAILED_STATUS = 'FAILED';

type BillingSnapshotForNotionPublish = {
  id: string;
  notionDatabaseId: string;
  notionPageId: string;
  notionContractPageId: string | null;
  billingEntry: string;
  billingPeriod: Date;
  month: string;
  siteName: string;
  spvCode: string | null;
  spvName: string | null;
  appliedTier: string | null;
  provider: string | null;
  paymentStatus: string | null;
  expectedAmount: number | null;
  invoicedAmount: number | null;
  varianceAmount: number | null;
  variancePercent: number | null;
  varianceFlag: string | null;
  proRataFactor: number | null;
  invoiceReference: string | null;
  notes: string | null;
  systemSizeKwp: number;
  siteFixedCostsAnnual: number;
  variableCostAnnual: number;
  annualFee: number;
  sourcePayload: string | null;
  billingRunId?: string | null;
};

type NotionRichText = Array<{ type: 'text'; text: { content: string } }>;

type NotionPropertyPayload =
  | { title: NotionRichText }
  | { rich_text: NotionRichText }
  | { date: { start: string } }
  | { select: { name: string } }
  | { status: { name: string } }
  | { number: number }
  | { relation: Array<{ id: string }> };

type BillingSnapshotDelegateForNotionPublish = {
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: Array<Record<string, string>>;
    take?: number;
  }): Promise<BillingSnapshotForNotionPublish[]>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<unknown>;
};

export interface PublishNotionBillingSnapshotsParams {
  month: string | null | undefined;
  limit?: number | null;
  databaseId?: string | null;
  contractId?: string | null;
}

export interface PublishNotionBillingSnapshotError {
  snapshotId: string;
  billingEntry: string;
  error: string;
}

export interface PublishNotionBillingSnapshotsResult {
  month: string;
  databaseId: string;
  scannedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: PublishNotionBillingSnapshotError[];
}

function notionToken() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error('NOTION_TOKEN is not configured');
  }
  return token;
}

async function notionFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion API error ${response.status}: ${error}`);
  }

  return response.json();
}

function billingDatabaseId(input?: string | null, contractDatabaseId?: string | null): string {
  return input || contractDatabaseId || process.env.NOTION_BILLING_DATABASE_ID || DEFAULT_BILLING_DATABASE_ID;
}

function assertBillingMonth(month: string | null | undefined): string {
  const normalized = normalizeBillingMonth(month);
  if (!normalized) {
    throw new Error('Billing month must use YYYY-MM format');
  }
  return normalized;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function conciseError(error: unknown): string {
  return truncate(error instanceof Error ? error.message : 'Unknown Notion billing sync error', 900);
}

function richText(content: string): NotionRichText {
  return [{ type: 'text', text: { content: truncate(content, 1900) } }];
}

function addSelect(
  properties: Record<string, NotionPropertyPayload>,
  name: string,
  value: string | null | undefined
) {
  if (value) {
    properties[name] = { select: { name: value } };
  }
}

function addRichText(
  properties: Record<string, NotionPropertyPayload>,
  name: string,
  value: string | null | undefined
) {
  if (value) {
    properties[name] = { rich_text: richText(value) };
  }
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function money(value: number | null): string {
  if (typeof value !== 'number') return 'not set';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
}

function formatPercent(value: number | null): string {
  if (typeof value !== 'number') return 'not set';
  return `${(value * 100).toFixed(2)}%`;
}

function buildNotes(snapshot: BillingSnapshotForNotionPublish): string {
  const lines = [
    snapshot.notes?.trim() || null,
    'App-generated immutable monthly billing snapshot.',
    `Snapshot ID: ${snapshot.id}`,
    `Source: ${APP_GENERATED_BILLING_SOURCE}`,
    snapshot.billingRunId ? `Billing run: ${snapshot.billingRunId}` : null,
    `Site: ${snapshot.siteName}`,
    `Expected Amount (£): ${money(snapshot.expectedAmount)}`,
    `Invoiced Amount (£): ${money(snapshot.invoicedAmount)}`,
    `Variance Amount (£): ${money(snapshot.varianceAmount)}`,
    `Variance Percent: ${formatPercent(snapshot.variancePercent)}`,
    snapshot.varianceFlag ? `Variance Flag: ${snapshot.varianceFlag}` : null,
    `System Size kWp: ${snapshot.systemSizeKwp}`,
    `Annual Fee: ${money(snapshot.annualFee)}`,
    `Site Fixed Costs Annual: ${money(snapshot.siteFixedCostsAnnual)}`,
    `Variable Cost Annual: ${money(snapshot.variableCostAnnual)}`,
  ];

  if (snapshot.sourcePayload) {
    lines.push(`Source Payload: ${truncate(snapshot.sourcePayload, 500)}`);
  }

  return lines.filter(Boolean).join('\n');
}

export function buildNotionBillingSnapshotProperties(
  snapshot: BillingSnapshotForNotionPublish
): Record<string, NotionPropertyPayload> {
  const properties: Record<string, NotionPropertyPayload> = {
    'Billing Entry': { title: richText(snapshot.billingEntry) },
    'Billing Period': { date: { start: dateOnly(snapshot.billingPeriod) } },
    Notes: { rich_text: richText(buildNotes(snapshot)) },
  };

  if (snapshot.notionContractPageId) {
    properties['O&M Contract'] = { relation: [{ id: snapshot.notionContractPageId }] };
  }

  addSelect(properties, 'SPV', snapshot.spvCode || snapshot.spvName);
  addSelect(properties, 'Applied Tier', snapshot.appliedTier);
  addSelect(properties, 'O&M Provider', snapshot.provider);
  if (snapshot.paymentStatus) {
    properties['Payment Status'] = { status: { name: snapshot.paymentStatus } };
  }
  if (typeof snapshot.proRataFactor === 'number') {
    properties['Pro-rata Factor'] = { number: snapshot.proRataFactor };
  }
  addRichText(properties, 'Invoice Reference', snapshot.invoiceReference);

  return properties;
}

function isAppGeneratedPlaceholder(pageId: string): boolean {
  return pageId.startsWith(APP_GENERATED_PLACEHOLDER_PREFIX);
}

function isLikelyNotionPageId(pageId: string): boolean {
  return /^[0-9a-f]{32}$/i.test(pageId) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pageId);
}

function isEdenBillingSnapshot(snapshot: BillingSnapshotForNotionPublish): boolean {
  if (!snapshot.sourcePayload) return false;
  try {
    const parsed = JSON.parse(snapshot.sourcePayload) as { site?: { billingPortfolio?: string } };
    return parsed.site?.billingPortfolio === 'EDEN';
  } catch {
    return false;
  }
}

async function createNotionPage(databaseId: string, snapshot: BillingSnapshotForNotionPublish): Promise<string> {
  const page = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: buildNotionBillingSnapshotProperties(snapshot),
    }),
  });

  if (!page?.id || typeof page.id !== 'string') {
    throw new Error('Notion page creation did not return a page id');
  }
  return page.id;
}

async function updateNotionPage(pageId: string, snapshot: BillingSnapshotForNotionPublish): Promise<string> {
  const page = await notionFetch(`/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: buildNotionBillingSnapshotProperties(snapshot),
    }),
  });

  return typeof page?.id === 'string' ? page.id : pageId;
}

export async function publishNotionBillingSnapshots(
  params: PublishNotionBillingSnapshotsParams
): Promise<PublishNotionBillingSnapshotsResult> {
  const month = assertBillingMonth(params.month);
  const contractId = await resolveContractId(params.contractId);
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { notionBillingDatabaseId: true } });
  const databaseId = billingDatabaseId(params.databaseId, contract?.notionBillingDatabaseId);
  const take = params.limit && params.limit > 0 ? params.limit : undefined;

  const billingSnapshot = prisma.billingSnapshot as unknown as BillingSnapshotDelegateForNotionPublish;
  const snapshotsForSync: BillingSnapshotForNotionPublish[] = await billingSnapshot.findMany({
    where: {
      contractId,
      month,
      source: APP_GENERATED_BILLING_SOURCE,
      OR: [{ notionSyncStatus: null }, { notionSyncStatus: { not: SYNCED_STATUS } }],
    },
    orderBy: [{ siteName: 'asc' }, { billingEntry: 'asc' }],
  });
  const snapshots = snapshotsForSync.filter((snapshot) => !isEdenBillingSnapshot(snapshot)).slice(0, take);

  const result: PublishNotionBillingSnapshotsResult = {
    month,
    databaseId,
    scannedCount: snapshots.length,
    createdCount: 0,
    updatedCount: 0,
    failedCount: 0,
    errors: [],
  };

  for (const snapshot of snapshots) {
    try {
      const shouldCreate =
        !snapshot.notionPageId ||
        isAppGeneratedPlaceholder(snapshot.notionPageId) ||
        !isLikelyNotionPageId(snapshot.notionPageId);
      const notionPageId = shouldCreate
        ? await createNotionPage(databaseId, snapshot)
        : await updateNotionPage(snapshot.notionPageId, snapshot);

      await billingSnapshot.update({
        where: { id: snapshot.id },
        data: {
          notionDatabaseId: databaseId,
          notionPageId,
          notionSyncStatus: SYNCED_STATUS,
          notionSyncedAt: new Date(),
          notionSyncError: null,
        },
      });

      if (shouldCreate) {
        result.createdCount += 1;
      } else {
        result.updatedCount += 1;
      }
    } catch (error) {
      const message = conciseError(error);
      result.failedCount += 1;
      result.errors.push({
        snapshotId: snapshot.id,
        billingEntry: snapshot.billingEntry,
        error: message,
      });

      await billingSnapshot.update({
        where: { id: snapshot.id },
        data: {
          notionSyncStatus: FAILED_STATUS,
          notionSyncedAt: new Date(),
          notionSyncError: message,
        },
      });
    }
  }

  return result;
}
