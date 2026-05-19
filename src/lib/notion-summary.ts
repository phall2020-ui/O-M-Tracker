import { PortfolioSummary } from '@/types';
import { CmUsageSummary } from './cm-days';

export interface SpvSummaryForNotion {
  code: string;
  name: string;
  siteCount: number;
  contractedCount: number;
  totalCapacityKwp: number;
  contractedCapacityKwp: number;
  monthlyRevenue: number;
}

export interface NotionSummaryInput {
  portfolio: PortfolioSummary;
  cmUsage: CmUsageSummary;
  spvs: SpvSummaryForNotion[];
  generatedAt?: Date;
}

export interface NotionSummaryPayload {
  generatedAt: string;
  portfolio: {
    totalSites: number;
    contractedSites: number;
    totalCapacityKwp: number;
    contractedCapacityKwp: number;
    currentTier: string;
    totalMonthlyFee: number;
    annualRevenue: number;
  };
  cmUsage: CmUsageSummary;
  spvs: SpvSummaryForNotion[];
}

export function buildNotionSummaryPayload(input: NotionSummaryInput): NotionSummaryPayload {
  return {
    generatedAt: (input.generatedAt || new Date()).toISOString(),
    portfolio: {
      totalSites: input.portfolio.totalSites,
      contractedSites: input.portfolio.contractedSites,
      totalCapacityKwp: input.portfolio.totalCapacityKwp,
      contractedCapacityKwp: input.portfolio.contractedCapacityKwp,
      currentTier: input.portfolio.currentTier,
      totalMonthlyFee: input.portfolio.totalMonthlyFee,
      annualRevenue: input.portfolio.totalMonthlyFee * 12,
    },
    cmUsage: input.cmUsage,
    spvs: input.spvs,
  };
}

export function renderNotionSummaryMarkdown(payload: NotionSummaryPayload): string {
  const spvRows = payload.spvs
    .map(
      (spv) =>
        `| ${spv.code} | ${spv.siteCount} | ${spv.contractedCount} | ${(spv.contractedCapacityKwp / 1000).toFixed(2)} MW | £${spv.monthlyRevenue.toFixed(2)} |`
    )
    .join('\n');

  return [
    `## Portfolio sync - ${payload.generatedAt}`,
    '',
    `Total sites: ${payload.portfolio.totalSites}`,
    `Contracted sites: ${payload.portfolio.contractedSites}`,
    `Contracted capacity: ${(payload.portfolio.contractedCapacityKwp / 1000).toFixed(2)} MW`,
    `Current tier: ${payload.portfolio.currentTier}`,
    `Monthly revenue: £${payload.portfolio.totalMonthlyFee.toFixed(2)}`,
    `Annual revenue: £${payload.portfolio.annualRevenue.toFixed(2)}`,
    '',
    `CM allowed: ${payload.cmUsage.allowedDays.toFixed(0)} days`,
    `CM used: ${payload.cmUsage.usedDays.toFixed(2)} days`,
    `CM pending approval: ${payload.cmUsage.pendingDays.toFixed(2)} days`,
    `CM remaining: ${payload.cmUsage.remainingDays.toFixed(2)} days`,
    '',
    '| SPV | Sites | Contracted | Contracted Capacity | Monthly Revenue |',
    '| --- | ---: | ---: | ---: | ---: |',
    spvRows || '| No SPVs | 0 | 0 | 0.00 MW | £0.00 |',
  ].join('\n');
}
