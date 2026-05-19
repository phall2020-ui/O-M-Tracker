const CURRENCY_PATTERN = /-?\d+(?:,\d{3})*(?:\.\d+)?/;

interface NotionProperty {
  type: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  number?: number | null;
  select?: { name: string } | null;
  status?: { name: string } | null;
  date?: { start: string | null } | null;
  relation?: Array<{ id: string }>;
  formula?: {
    type: string;
    string?: string | null;
    number?: number | null;
    boolean?: boolean | null;
  };
}

export interface NotionBillingPage {
  id: string;
  properties: Record<string, NotionProperty>;
}

export interface NotionBillingSnapshotRow {
  notionPageId: string;
  notionContractPageId: string;
  billingEntry: string;
  billingPeriod: string;
  month: string;
  spvCode: string | null;
  appliedTier: string | null;
  provider: string | null;
  paymentStatus: string | null;
  expectedAmount: number | null;
  invoicedAmount: number | null;
  varianceAmount: number | null;
  variancePercent: number | null;
  varianceFlag: string | null;
  proRataFactor: number | null;
  invoiceReference: string | null;
  notes: string | null;
}

function textValue(property: NotionProperty | undefined): string | null {
  if (!property) return null;
  if (property.type === 'title') return property.title?.map((item) => item.plain_text).join('').trim() || null;
  if (property.type === 'rich_text') return property.rich_text?.map((item) => item.plain_text).join('').trim() || null;
  if (property.type === 'select') return property.select?.name || null;
  if (property.type === 'status') return property.status?.name || null;
  if (property.type === 'formula') {
    if (typeof property.formula?.string === 'string') return property.formula.string;
    if (typeof property.formula?.number === 'number') return String(property.formula.number);
  }
  return null;
}

function numberValue(property: NotionProperty | undefined): number | null {
  if (typeof property?.number === 'number') return property.number;
  if (property?.type === 'formula' && typeof property.formula?.number === 'number') return property.formula.number;
  if (property?.type === 'formula' && typeof property.formula?.string === 'string') {
    return parseCurrency(property.formula.string);
  }
  return null;
}

function dateValue(property: NotionProperty | undefined): string | null {
  return property?.date?.start || null;
}

function relationId(property: NotionProperty | undefined): string | null {
  return property?.relation?.[0]?.id || null;
}

function pick(properties: Record<string, NotionProperty>, names: string[]) {
  const entry = Object.entries(properties).find(([name]) =>
    names.some((candidate) => candidate.toLowerCase() === name.toLowerCase())
  );
  return entry?.[1];
}

export function parseCurrency(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, '').match(CURRENCY_PATTERN);
  return match ? Number(match[0]) : null;
}

export function mapNotionBillingPage(page: NotionBillingPage): {
  row?: NotionBillingSnapshotRow;
  messages: string[];
} {
  const props = page.properties;
  const billingPeriod = dateValue(pick(props, ['Billing Period']));
  const notionContractPageId = relationId(pick(props, ['O&M Contract', 'O&M Contracts', 'Contract']));
  const row: NotionBillingSnapshotRow = {
    notionPageId: page.id,
    notionContractPageId: notionContractPageId || '',
    billingEntry: textValue(pick(props, ['Billing Entry', 'Name', 'Title'])) || '',
    billingPeriod: billingPeriod || '',
    month: billingPeriod ? billingPeriod.slice(0, 7) : '',
    spvCode: textValue(pick(props, ['SPV', 'SPV Code', 'SPVCode'])),
    appliedTier: textValue(pick(props, ['Applied Tier'])),
    provider: textValue(pick(props, ['O&M Provider', 'Provider'])),
    paymentStatus: textValue(pick(props, ['Payment Status'])),
    expectedAmount: numberValue(pick(props, ['Expected Amount (£)', 'Expected Amount'])),
    invoicedAmount: numberValue(pick(props, ['Invoiced Amount (£)', 'Invoiced Amount'])),
    varianceAmount: numberValue(pick(props, ['Variance (£)', 'Variance Amount'])),
    variancePercent: numberValue(pick(props, ['Variance (%)', 'Variance Percent'])),
    varianceFlag: textValue(pick(props, ['Variance Flag'])),
    proRataFactor: numberValue(pick(props, ['Pro-rata Factor', 'Pro Rata Factor'])),
    invoiceReference: textValue(pick(props, ['Invoice Reference'])),
    notes: textValue(pick(props, ['Notes'])),
  };

  const messages: string[] = [];
  if (!row.notionContractPageId) messages.push('Missing O&M Contract relation');
  if (!row.billingPeriod) messages.push('Missing billing period');
  if (!row.billingEntry) messages.push('Missing billing entry title');

  return messages.length ? { messages } : { row, messages };
}
