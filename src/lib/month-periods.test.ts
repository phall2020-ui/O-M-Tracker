import { describe, expect, it } from 'vitest';
import {
  buildAvailableMonths,
  formatMonthLabel,
  getMonthBounds,
  normalizeMonth,
} from './month-periods';

describe('month periods', () => {
  it('normalizes valid month strings and rejects invalid values', () => {
    expect(normalizeMonth('2026-05')).toBe('2026-05');
    expect(normalizeMonth('2026-5')).toBeNull();
    expect(normalizeMonth('2026-13')).toBeNull();
    expect(normalizeMonth(null)).toBeNull();
  });

  it('returns inclusive UTC month bounds', () => {
    const bounds = getMonthBounds('2026-02');

    expect(bounds.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });

  it('formats month labels for portfolio reporting', () => {
    expect(formatMonthLabel('2026-05')).toBe('May 2026');
  });

  it('builds options from the earliest onboard month to the selected month', () => {
    const months = buildAvailableMonths(['2026-03-15', null, '2026-01-01'], '2026-04');

    expect(months).toEqual([
      { value: '2026-01', label: 'January 2026' },
      { value: '2026-02', label: 'February 2026' },
      { value: '2026-03', label: 'March 2026' },
      { value: '2026-04', label: 'April 2026' },
    ]);
  });
});
