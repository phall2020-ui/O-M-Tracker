import prisma from './prisma';
import { AppSessionUser } from './authz';
import { audit, getPortfolioSummary, getSpvSummaries } from './portfolio-repository';
import { getOfficialCmUsage } from './cm-work-repository';
import {
  buildNotionSummaryPayload,
  renderNotionSummaryMarkdown,
} from './notion-summary';
import { mapNotionBillingPage, NotionBillingSnapshotRow } from './notion-billing-snapshots';
import { resolveContractId } from './contracts';

const NOTION_VERSION = '2022-06-28';

interface NotionProperty {
  type: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  number?: number | null;
  select?: { name: string } | null;
  status?: { name: string } | null;
  date?: { start: string | null } | null;
}

interface NotionPage {
  id: string;
  properties: Record<string, NotionProperty>;
}

export interface NotionImportRow {
  notionPageId: string;
  name: string;
  systemSizeKwp: number;
  siteType: 'Rooftop' | 'Ground Mount';
  contractStatus: 'Contracted' | 'Awaiting Contract' | 'Awaiting PAC';
  onboardDate: string | null;
  pmCost: number;
  cctvCost: number;
  cleaningCost: number;
  spvCode: string | null;
}

export interface NotionImportReport {
  databaseId: string;
  commit: boolean;
  validRows: NotionImportRow[];
  errors: Array<{ notionPageId: string; messages: string[] }>;
  importedCount: number;
}

export interface NotionBillingImportReport {
  databaseId: string;
  commit: boolean;
  validRows: NotionBillingSnapshotRow[];
  errors: Array<{ notionPageId: string; messages: string[] }>;
  importedCount: number;
  skippedExistingCount: number;
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

function plainText(property: NotionProperty | undefined): string | null {
  if (!property) return null;
  if (property.type === 'title') return property.title?.map((item) => item.plain_text).join('').trim() || null;
  if (property.type === 'rich_text') return property.rich_text?.map((item) => item.plain_text).join('').trim() || null;
  if (property.type === 'select') return property.select?.name || null;
  if (property.type === 'status') return property.status?.name || null;
  return null;
}

function numberValue(property: NotionProperty | undefined): number | null {
  return typeof property?.number === 'number' ? property.number : null;
}

function dateValue(property: NotionProperty | undefined): string | null {
  return property?.date?.start || null;
}

function pick(properties: Record<string, NotionProperty>, names: string[]) {
  const entry = Object.entries(properties).find(([name]) =>
    names.some((candidate) => candidate.toLowerCase() === name.toLowerCase())
  );
  return entry?.[1];
}

function mapNotionPage(page: NotionPage): { row?: NotionImportRow; messages: string[] } {
  const props = page.properties;
  const row: NotionImportRow = {
    notionPageId: page.id,
    name: plainText(pick(props, ['Name', 'Site Name', 'Title'])) || '',
    systemSizeKwp: numberValue(
      pick(props, ['System Size (kWp)', 'System Size kWp', 'SystemSizeKwp', 'Capacity kWp', 'Capacity'])
    ) || 0,
    siteType: plainText(pick(props, ['Site Type', 'SiteType'])) === 'Ground Mount' ? 'Ground Mount' : 'Rooftop',
    contractStatus: (() => {
      const raw = (plainText(pick(props, ['Contract Status', 'ContractStatus', 'Contracted'])) || '').trim().toLowerCase();
      if (['yes', 'active', 'contracted'].includes(raw)) return 'Contracted';
      if (raw.includes('contract') && !raw.includes('pac')) return 'Awaiting Contract';
      return 'Awaiting PAC';
    })(),
    onboardDate: dateValue(pick(props, ['Onboard Date', 'OnboardDate'])),
    pmCost: numberValue(pick(props, ['PM Cost', 'PMCost', 'PM Cost (£/yr)'])) || 0,
    cctvCost: numberValue(pick(props, ['CCTV Cost', 'CCTVCost', 'CCTV Cost (£/yr)'])) || 0,
    cleaningCost: numberValue(pick(props, ['Cleaning Cost', 'CleaningCost', 'Cleaning Cost (£/yr)'])) || 0,
    spvCode: plainText(pick(props, ['SPV', 'SPV Code', 'SPVCode'])) || null,
  };

  const messages = [];
  if (!row.name) messages.push('Missing site name');
  if (row.systemSizeKwp <= 0) messages.push('System size must be greater than zero');
  if (row.contractStatus === 'Contracted' && !row.onboardDate) messages.push('Contracted sites require an onboard date or PAC date');

  return messages.length ? { messages } : { row, messages };
}

export async function previewOrImportNotionSites(
  databaseId: string,
  commit: boolean,
  user: AppSessionUser,
  contractIdInput?: string | null
): Promise<NotionImportReport> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const response = await notionFetch(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  const validRows: NotionImportRow[] = [];
  const errors: NotionImportReport['errors'] = [];

  for (const page of pages) {
    const mapped = mapNotionPage(page);
    if (mapped.row) {
      validRows.push(mapped.row);
    } else {
      errors.push({ notionPageId: page.id, messages: mapped.messages });
    }
  }

  let importedCount = 0;

  if (commit && validRows.length > 0) {
    const contractId = await resolveContractId(contractIdInput);
    await prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const spv = row.spvCode
          ? await tx.sPV.findFirst({ where: { contractId, code: row.spvCode } })
          : null;
        const existingMapping = await tx.notionExternalMapping.findUnique({
          where: {
            notionDatabaseId_notionPageId: {
              notionDatabaseId: databaseId,
              notionPageId: row.notionPageId,
            },
          },
        });
        const existingSite = existingMapping?.entityType === 'Site'
          ? await tx.site.findFirst({ where: { id: existingMapping.entityId, contractId } })
          : await tx.site.findFirst({
            where: {
                contractId,
                name: row.name,
                spvId: spv?.id || null,
              },
            });

        const data = {
            name: row.name,
            systemSizeKwp: row.systemSizeKwp,
            siteType: row.siteType === 'Ground Mount' ? 'GROUND_MOUNT' : 'ROOFTOP',
            contractStatus: row.contractStatus,
            onboardDate: row.onboardDate ? new Date(row.onboardDate) : null,
            pmCost: row.pmCost,
            pmDaysOnSite: 0,
            pmVisitsPerAnnum: 0,
            cctvCost: row.cctvCost,
            cleaningCost: row.cleaningCost,
            additionalCostAnnual: 0,
            additionalCostAnnualComment: null,
            additionalCostMonthly: 0,
            additionalCostMonthlyComment: null,
            additionalCostMonthlyStartMonth: null,
            additionalCostMonthlyEndMonth: null,
            billingPortfolio: 'CORE',
            spvId: spv?.id || null,
            sourceSheet: 'Notion',
          };

        const site = existingSite
          ? await tx.site.update({
              where: { id: existingSite.id },
              data,
            })
          : await tx.site.create({ data: { ...data, contractId } });

        await tx.notionExternalMapping.upsert({
          where: {
            notionDatabaseId_notionPageId: {
              notionDatabaseId: databaseId,
              notionPageId: row.notionPageId,
            },
          },
          update: { entityType: 'Site', entityId: site.id, lastImportedAt: new Date() },
          create: {
            notionDatabaseId: databaseId,
            notionPageId: row.notionPageId,
            entityType: 'Site',
            entityId: site.id,
          },
        });
        importedCount++;
      }
    }, { timeout: 30_000 });

    await audit(user, 'IMPORT', 'NotionDatabase', databaseId, null, {
      importedCount,
    });
  }

  return { databaseId, commit, validRows, errors, importedCount };
}

export async function previewOrImportNotionBillingSnapshots(
  databaseId: string,
  commit: boolean,
  user: AppSessionUser,
  contractIdInput?: string | null
): Promise<NotionBillingImportReport> {
  const selectedContractId = await resolveContractId(contractIdInput);
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const response = await notionFetch(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  const validRows: NotionBillingSnapshotRow[] = [];
  const errors: NotionBillingImportReport['errors'] = [];

  for (const page of pages) {
    const mapped = mapNotionBillingPage(page);
    if (mapped.row) {
      const siteMapping = await prisma.notionExternalMapping.findUnique({
        where: {
          notionDatabaseId_notionPageId: {
            notionDatabaseId: process.env.NOTION_SITES_DATABASE_ID || '7dc7ccc45c5a43d7a75b2e97818089dc',
            notionPageId: mapped.row.notionContractPageId,
          },
        },
      });
      if (!siteMapping || siteMapping.entityType !== 'Site') {
        errors.push({
          notionPageId: page.id,
          messages: [`No imported Site mapping for O&M Contract ${mapped.row.notionContractPageId}`],
        });
      } else {
        const site = await prisma.site.findFirst({
          where: { id: siteMapping.entityId, contractId: selectedContractId },
          select: { id: true },
        });
        if (!site) {
          errors.push({
            notionPageId: page.id,
            messages: [`Mapped Site ${siteMapping.entityId} is not in the selected contract`],
          });
        } else {
          validRows.push(mapped.row);
        }
      }
    } else {
      errors.push({ notionPageId: page.id, messages: mapped.messages });
    }
  }

  let importedCount = 0;
  let skippedExistingCount = 0;

  if (commit) {
    for (const row of validRows) {
      const existing = await prisma.billingSnapshot.findUnique({
        where: {
          notionDatabaseId_notionPageId: {
            notionDatabaseId: databaseId,
            notionPageId: row.notionPageId,
          },
        },
      });

      if (existing) {
        skippedExistingCount++;
        continue;
      }

      const mapping = await prisma.notionExternalMapping.findUnique({
        where: {
          notionDatabaseId_notionPageId: {
            notionDatabaseId: process.env.NOTION_SITES_DATABASE_ID || '7dc7ccc45c5a43d7a75b2e97818089dc',
            notionPageId: row.notionContractPageId,
          },
        },
      });

      if (!mapping || mapping.entityType !== 'Site') {
        throw new Error(`Missing Site mapping for O&M Contract ${row.notionContractPageId}`);
      }

      const site = await prisma.site.findUnique({
        where: { id: mapping.entityId },
        include: { spv: true },
      });

      if (!site || site.contractId !== selectedContractId) {
        throw new Error(`Mapped Site ${mapping.entityId} is not in the selected contract`);
      }
      const contractId = site.contractId;

      const siteFixedCostsAnnual = site.pmCost + site.cctvCost + site.cleaningCost;
      const monthlyFee = row.expectedAmount || 0;
      const annualFee = monthlyFee * 12;
      const variableCostAnnual = Math.max(annualFee - siteFixedCostsAnnual, 0);

      await prisma.billingSnapshot.create({
        data: {
          contractId,
          siteId: site.id,
          notionDatabaseId: databaseId,
          notionPageId: row.notionPageId,
          notionContractPageId: row.notionContractPageId,
          billingEntry: row.billingEntry,
          billingPeriod: new Date(row.billingPeriod),
          month: row.month,
          siteName: site.name,
          spvCode: row.spvCode || site.spv?.code || null,
          spvName: site.spv?.name || row.spvCode || null,
          appliedTier: row.appliedTier,
          provider: row.provider,
          paymentStatus: row.paymentStatus,
          expectedAmount: row.expectedAmount,
          invoicedAmount: row.invoicedAmount,
          varianceAmount: row.varianceAmount,
          variancePercent: row.variancePercent,
          varianceFlag: row.varianceFlag,
          proRataFactor: row.proRataFactor,
          invoiceReference: row.invoiceReference,
          notes: row.notes,
          systemSizeKwp: site.systemSizeKwp,
          siteFixedCostsAnnual,
          variableCostAnnual,
          annualFee,
          sourcePayload: JSON.stringify(row),
        },
      });
      importedCount++;
    }

    await audit(user, 'IMPORT', 'NotionBillingSnapshots', databaseId, null, {
      importedCount,
      skippedExistingCount,
    });
  }

  return { databaseId, commit, validRows, errors, importedCount, skippedExistingCount };
}

function markdownToParagraphBlocks(markdown: string) {
  return markdown.split('\n').map((line) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: line
        ? [{ type: 'text', text: { content: line.slice(0, 1900) } }]
        : [],
    },
  }));
}

export async function syncNotionSummary(
  trigger: string,
  user: AppSessionUser | null,
  targetPageId = process.env.NOTION_SUMMARY_PAGE_ID,
  contractIdInput?: string | null
) {
  const contractId = await resolveContractId(contractIdInput);
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  const resolvedTargetPageId = contract?.notionSummaryPageId || targetPageId;

  if (!resolvedTargetPageId) {
    throw new Error('NOTION_SUMMARY_PAGE_ID is not configured');
  }

  const run = await prisma.notionSyncRun.create({
    data: {
      status: 'RUNNING',
      trigger,
      targetPageId: resolvedTargetPageId,
      createdById: user?.id,
    },
  });

  try {
    const [portfolio, cmUsage, spvs] = await Promise.all([
      getPortfolioSummary({ billingPortfolio: 'CORE', contractId }),
      getOfficialCmUsage({ billingPortfolio: 'CORE', contractId }),
      getSpvSummaries({ billingPortfolio: 'CORE', contractId }),
    ]);
    const payload = buildNotionSummaryPayload({ portfolio, cmUsage, spvs });

    await notionFetch(`/blocks/${resolvedTargetPageId}/children`, {
      method: 'PATCH',
      body: JSON.stringify({
        children: markdownToParagraphBlocks(renderNotionSummaryMarkdown(payload)),
      }),
    });

    const completed = await prisma.notionSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCESS',
        payload: JSON.stringify(payload),
        completedAt: new Date(),
      },
    });

    if (user) {
      await audit(user, 'SYNC', 'NotionSummary', resolvedTargetPageId, null, payload);
    }

    return completed;
  } catch (error) {
    await prisma.notionSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown Notion sync error',
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
