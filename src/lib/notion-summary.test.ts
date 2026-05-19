import { describe, expect, it } from 'vitest';
import { buildNotionSummaryPayload } from './notion-summary';

describe('Notion summary payload', () => {
  it('publishes portfolio and SPV aggregates without site-level operational rows', () => {
    const payload = buildNotionSummaryPayload({
      portfolio: {
        totalSites: 2,
        contractedSites: 1,
        totalCapacityKwp: 3000,
        contractedCapacityKwp: 2000,
        currentTier: '<20MW',
        totalMonthlyFee: 350,
        correctiveDaysAllowed: 1.67,
        sitesBySpv: { OS2: 1, AD1: 1 },
        portfolioBreakdowns: [],
      },
      cmUsage: {
        allowedDays: 1.67,
        usedDays: 0.5,
        pendingDays: 0.25,
        remainingDays: 1.17,
      },
      spvs: [
        {
          code: 'OS2',
          name: 'Olympus Solar 2 Ltd',
          siteCount: 1,
          contractedCount: 1,
          totalCapacityKwp: 2000,
          contractedCapacityKwp: 2000,
          monthlyRevenue: 350,
        },
      ],
      generatedAt: new Date('2026-05-15T10:00:00.000Z'),
    });

    expect(payload.portfolio.totalSites).toBe(2);
    expect(payload.cmUsage.usedDays).toBe(0.5);
    expect(payload.spvs).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toContain('"sites"');
    expect(payload.generatedAt).toBe('2026-05-15T10:00:00.000Z');
  });
});
