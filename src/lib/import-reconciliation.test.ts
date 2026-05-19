import { describe, expect, it } from 'vitest';
import { findMatchingImportedSite } from './import-reconciliation';

describe('import reconciliation', () => {
  const existingSites = [
    {
      id: 'site-row-match',
      name: 'Old Name',
      sourceSheet: 'Portfolio Tracker',
      sourceRow: 12,
      spvId: 'spv-a',
    },
    {
      id: 'site-name-match',
      name: 'Same Site',
      sourceSheet: null,
      sourceRow: null,
      spvId: 'spv-b',
    },
  ];

  it('prefers source sheet and row matches for spreadsheet re-imports', () => {
    const match = findMatchingImportedSite(existingSites, {
      name: 'Renamed Site',
      sourceSheet: 'Portfolio Tracker',
      sourceRow: 12,
      spvId: 'spv-c',
    });

    expect(match?.id).toBe('site-row-match');
  });

  it('falls back to normalized name and resolved SPV when source row is unavailable', () => {
    const match = findMatchingImportedSite(existingSites, {
      name: ' same site ',
      sourceSheet: null,
      sourceRow: null,
      spvId: 'spv-b',
    });

    expect(match?.id).toBe('site-name-match');
  });
});
