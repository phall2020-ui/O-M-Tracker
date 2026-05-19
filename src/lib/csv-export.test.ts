import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv-export';

describe('CSV export', () => {
  it('escapes values so exported rows remain valid CSV', () => {
    expect(buildCsv([
      ['Site', 'Notes', 'Amount'],
      ['Alpha, Beta', 'Needs "review"\nnext month', 12.5],
    ])).toBe('"Site","Notes","Amount"\n"Alpha, Beta","Needs ""review""\nnext month","12.5"');
  });

  it('exports nullish values as empty cells', () => {
    expect(buildCsv([['Name', 'SPV'], ['Missing SPV', null]])).toBe('"Name","SPV"\n"Missing SPV",""');
  });
});
