import { describe, expect, it } from 'vitest';
import { appendContractQuery } from './contract-query';

describe('contract query helpers', () => {
  it('appends the selected contract to an API URL without existing params', () => {
    expect(appendContractQuery('/api/dashboard', 'contract-1')).toBe('/api/dashboard?contract=contract-1');
  });

  it('preserves existing query params when adding the selected contract', () => {
    expect(appendContractQuery('/api/sites?sortBy=name&sortOrder=asc', 'contract 1')).toBe(
      '/api/sites?sortBy=name&sortOrder=asc&contract=contract+1'
    );
  });

  it('leaves URLs unchanged when no contract is selected', () => {
    expect(appendContractQuery('/api/sites?sortBy=name', '')).toBe('/api/sites?sortBy=name');
  });
});
