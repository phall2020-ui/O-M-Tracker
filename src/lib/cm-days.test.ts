import { describe, expect, it } from 'vitest';
import {
  buildCmAllowanceBreakdown,
  buildCmMonthlyUsage,
  calculateCmAllowance,
  calculateCmDays,
  summarizeCmUsage,
} from './cm-days';

describe('CM day calculations', () => {
  it('calculates monthly allowance from contracted capacity in MW', () => {
    expect(calculateCmAllowance(19_200)).toBe(1);
  });

  it('rounds monthly allowance down to whole days', () => {
    expect(calculateCmAllowance(27_756.23)).toBe(2);
  });

  it('converts work hours into day units', () => {
    expect(calculateCmDays(6)).toBe(0.75);
  });

  it('only counts approved CM entries in official usage', () => {
    const summary = summarizeCmUsage(19_200, [
      { status: 'APPROVED', hours: 4, workDate: new Date('2026-05-01') },
      { status: 'PENDING', hours: 8, workDate: new Date('2026-05-02') },
      { status: 'REJECTED', hours: 8, workDate: new Date('2026-05-03') },
    ]);

    expect(summary.allowedDays).toBe(1);
    expect(summary.usedDays).toBe(0.5);
    expect(summary.pendingDays).toBe(1);
    expect(summary.remainingDays).toBe(0.5);
  });

  it('can scope official usage to a single month', () => {
    const summary = summarizeCmUsage(19_200, [
      { status: 'APPROVED', hours: 8, workDate: new Date('2026-04-01') },
      { status: 'APPROVED', hours: 4, workDate: new Date('2026-05-01') },
    ], '2026-05');

    expect(summary.usedDays).toBe(0.5);
    expect(summary.remainingDays).toBe(0.5);
  });

  it('keeps negative remaining days when approved usage exceeds allowance', () => {
    const summary = summarizeCmUsage(12_000, [
      { status: 'APPROVED', hours: 16, workDate: new Date('2026-05-01') },
    ], '2026-05');

    expect(summary.allowedDays).toBe(1);
    expect(summary.usedDays).toBe(2);
    expect(summary.remainingDays).toBe(-1);
  });

  it('builds month-on-month cumulative CM usage', () => {
    const rows = buildCmMonthlyUsage(19_200, [
      { status: 'APPROVED', hours: 8, workDate: new Date('2026-04-01') },
      { status: 'APPROVED', hours: 4, workDate: new Date('2026-05-01') },
      { status: 'PENDING', hours: 8, workDate: new Date('2026-05-02') },
    ], '2026-05', 2);

    expect(rows.map((row) => row.month)).toEqual(['2026-04', '2026-05']);
    expect(rows[0]).toMatchObject({
      allowedDays: 1,
      usedDays: 1,
      cumulativeUsedDays: 1,
      cumulativeRemainingDays: 0,
    });
    expect(rows[1]).toMatchObject({
      usedDays: 0.5,
      pendingDays: 1,
      cumulativeAllowedDays: 2,
      cumulativeUsedDays: 1.5,
      cumulativeRemainingDays: 0.5,
    });
  });

  it('accrues month-on-month allowance from each month capacity', () => {
    const rows = buildCmMonthlyUsage([
      { month: '2026-04', contractedCapacityKwp: 12_000 },
      { month: '2026-05', contractedCapacityKwp: 24_000 },
    ], [
      { status: 'APPROVED', hours: 4, workDate: new Date('2026-04-01') },
      { status: 'APPROVED', hours: 8, workDate: new Date('2026-05-01') },
    ], '2026-05', 2);

    expect(rows[0]).toMatchObject({
      month: '2026-04',
      contractedCapacityKwp: 12_000,
      allowedDays: 1,
      usedDays: 0.5,
      cumulativeAllowedDays: 1,
      cumulativeRemainingDays: 0.5,
    });
    expect(rows[1]).toMatchObject({
      month: '2026-05',
      contractedCapacityKwp: 24_000,
      allowedDays: 2,
      usedDays: 1,
      cumulativeAllowedDays: 3,
      cumulativeUsedDays: 1.5,
      cumulativeRemainingDays: 1.5,
    });
  });

  it('keeps negative cumulative remaining days in monthly usage rows', () => {
    const rows = buildCmMonthlyUsage(12_000, [
      { status: 'APPROVED', hours: 16, workDate: new Date('2026-05-01') },
    ], '2026-05', 1);

    expect(rows[0]).toMatchObject({
      allowedDays: 1,
      usedDays: 2,
      remainingDays: -1,
      cumulativeAllowedDays: 1,
      cumulativeUsedDays: 2,
      cumulativeRemainingDays: -1,
      status: 'EXCEEDED',
    });
  });

  it('builds separate standing CM allowances for Core and Eden capacities', () => {
    const rows = buildCmAllowanceBreakdown([
      { billingPortfolio: 'CORE', contractedCapacityKwp: 24_000 },
      { billingPortfolio: 'EDEN', contractedCapacityKwp: 12_000 },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({ billingPortfolio: 'CORE', allowedDays: 2 }),
      expect.objectContaining({ billingPortfolio: 'EDEN', allowedDays: 1 }),
    ]);
  });

  it('attaches portfolio allowances to monthly CM rows when provided', () => {
    const rows = buildCmMonthlyUsage(
      [{ month: '2026-05', contractedCapacityKwp: 36_000 }],
      [],
      '2026-05',
      1,
      [
        { month: '2026-05', billingPortfolio: 'CORE', contractedCapacityKwp: 24_000 },
        { month: '2026-05', billingPortfolio: 'EDEN', contractedCapacityKwp: 12_000 },
      ]
    );

    expect(rows[0].portfolioAllowances).toEqual([
      expect.objectContaining({ billingPortfolio: 'CORE', allowedDays: 2 }),
      expect.objectContaining({ billingPortfolio: 'EDEN', allowedDays: 1 }),
    ]);
  });
});
