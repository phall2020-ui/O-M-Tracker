import { describe, expect, it } from 'vitest';
import { buildCapacityHistory } from './dashboard-data';

describe('dashboard data', () => {
  it('builds deterministic contracted capacity history from billing snapshot summaries', () => {
    const history = buildCapacityHistory(
      [
        { month: '2026-07', systemSizeKwp: 1200, snapshotCount: 3 },
        { month: '2026-08', systemSizeKwp: 1550, snapshotCount: 4 },
      ],
      '2026-08',
      3
    );

    expect(history).toEqual([
      { month: 'Jun 2026', contractedCapacityKwp: 0, contractedCapacityMw: 0, sites: 0 },
      { month: 'Jul 2026', contractedCapacityKwp: 1200, contractedCapacityMw: 1.2, sites: 3 },
      { month: 'Aug 2026', contractedCapacityKwp: 1550, contractedCapacityMw: 1.55, sites: 4 },
    ]);
  });
});
