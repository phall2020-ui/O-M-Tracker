import { describe, expect, it } from 'vitest';
import { mapNotionBillingPage } from './notion-billing-snapshots';

describe('Notion billing snapshot mapping', () => {
  it('maps a Notion Billing row into an immutable monthly snapshot input', () => {
    const mapped = mapNotionBillingPage({
      id: 'billing-page-1',
      properties: {
        'Billing Entry': { type: 'title', title: [{ plain_text: 'Fylde - May 2026' }] },
        'O&M Contract': { type: 'relation', relation: [{ id: 'contract-page-1' }] },
        'Billing Period': { type: 'date', date: { start: '2026-05-01' } },
        SPV: { type: 'select', select: { name: 'FS' } },
        'Applied Tier': { type: 'select', select: { name: 'Tier 2 (20-30MW)' } },
        'O&M Provider': { type: 'select', select: { name: 'ClearSol' } },
        'Payment Status': { type: 'status', status: { name: 'Due' } },
        'Expected Amount (£)': { type: 'formula', formula: { type: 'string', string: '£4,294.79' } },
        'Invoiced Amount (£)': { type: 'number', number: 4294.79 },
        'Variance (%)': { type: 'formula', formula: { type: 'number', number: 0 } },
        'Variance Flag': { type: 'formula', formula: { type: 'string', string: '✅' } },
        'Pro-rata Factor': { type: 'number', number: 1 },
        'Invoice Reference': { type: 'rich_text', rich_text: [{ plain_text: 'INV-001' }] },
        Notes: { type: 'rich_text', rich_text: [{ plain_text: 'Imported from Notion' }] },
      },
    });

    expect(mapped.messages).toEqual([]);
    expect(mapped.row).toMatchObject({
      notionPageId: 'billing-page-1',
      notionContractPageId: 'contract-page-1',
      billingEntry: 'Fylde - May 2026',
      billingPeriod: '2026-05-01',
      month: '2026-05',
      spvCode: 'FS',
      expectedAmount: 4294.79,
      invoicedAmount: 4294.79,
      invoiceReference: 'INV-001',
    });
  });

  it('rejects billing rows without a contract relation or billing period', () => {
    const mapped = mapNotionBillingPage({
      id: 'billing-page-2',
      properties: {
        'Billing Entry': { type: 'title', title: [{ plain_text: 'Broken row' }] },
      },
    });

    expect(mapped.row).toBeUndefined();
    expect(mapped.messages).toContain('Missing O&M Contract relation');
    expect(mapped.messages).toContain('Missing billing period');
  });
});
