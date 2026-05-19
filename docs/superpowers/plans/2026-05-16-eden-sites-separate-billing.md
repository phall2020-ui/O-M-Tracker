# Eden Sites Separate Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include the separate Eden site rows from the local Clearsol spreadsheet, bill and display them separately, give Eden its own standing CM allowance with the same capacity / 12 formula, and include Eden capacity in combined tier pricing for both Eden and non-Eden sites.

**Architecture:** Add a persisted `billingPortfolio` classification on `Site` (`CORE` or `EDEN`). The Excel importer sets `EDEN` only for rows imported from the workbook’s `Eden Sites` sheet, not from `ESI*` SPV codes. Pricing tier selection remains based on combined contracted capacity across all billable portfolios; reporting and CM allowance then group the same priced data into Core vs Eden.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma SQL Server, `xlsx`, Vitest.

---

## Corrected Source Finding

The local workbook inspected at `/Users/peterhall/Documents/ADE/ClearSol/Clearsol_OM_Framework_Tracker_Update for small sites.xlsx` contains a separate `Eden Sites` worksheet.

Relevant workbook structure:

- `Portfolio Tracker`: main site table, headers in row 1.
- `Eden Sites`: separate Eden site table.
- `Eden Sites` headers are on row 3.
- `Eden Sites` data begins on row 4.
- Important columns on `Eden Sites`:
  - `C`: Site
  - `D`: Size (kWp)
  - `E`: Contract?
  - `F`: Onboard Date
  - `G`: PM (£/yr)
  - `H`: CCTV (£/yr)
  - `I`: Cleaning (£/yr)
  - `S`: SPV
  - `T`: Monthly Fee (£) [tier + comm. factor]

Important correction: Eden classification must not be inferred from `ESI8`, `ESI1`, or `ESI10`. The separate Eden sites in this workbook are identified by being on the `Eden Sites` sheet.

## Business Rules

- Import site rows from both `Portfolio Tracker` and `Eden Sites`.
- Persist each site’s billing portfolio:
  - `CORE` for `Portfolio Tracker` rows.
  - `EDEN` for `Eden Sites` rows.
- Eden sites are billed separately from Core sites.
- Eden sites use the same fee formula as Core:
  `site fixed costs + (system size kWp * active tier rate)`.
- The active tier rate is selected using combined contracted capacity from Core plus Eden.
- Core standing CM allowance is calculated from Core contracted capacity only.
- Eden standing CM allowance is calculated from Eden contracted capacity only.
- Combined totals remain available for reconciliation.

---

### Task 1: Persist Billing Portfolio On Sites

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/types/index.ts`
- Modify: `src/lib/portfolio-repository.ts`

- [ ] **Step 1: Add schema field**

In `prisma/schema.prisma`, add to `model Site`:

```prisma
  billingPortfolio String    @default("CORE")
```

Add an index:

```prisma
  @@index([billingPortfolio])
```

- [ ] **Step 2: Add TypeScript types**

In `src/types/index.ts`, add:

```ts
export type BillingPortfolioCode = 'CORE' | 'EDEN';
```

Add to `Site`:

```ts
  billingPortfolio: BillingPortfolioCode;
```

Add to `SiteFormData`:

```ts
  billingPortfolio?: BillingPortfolioCode;
```

Add report breakdown type:

```ts
export interface BillingPortfolioBreakdown {
  billingPortfolio: BillingPortfolioCode;
  billingPortfolioLabel: string;
  siteCount: number;
  contractedSiteCount: number;
  pendingSiteCount: number;
  totalCapacityKwp: number;
  contractedCapacityKwp: number;
  siteFixedCostsAnnual: number;
  variableCostAnnual: number;
  annualFee: number;
  monthlyFee: number;
  correctiveDaysAllowed: number;
}
```

Add to `SpvMonthlyReport`:

```ts
  portfolioBreakdowns?: BillingPortfolioBreakdown[];
```

- [ ] **Step 3: Map Prisma field**

In `src/lib/portfolio-repository.ts`, update `mapPrismaSite`:

```ts
    billingPortfolio: site.billingPortfolio === 'EDEN' ? 'EDEN' : 'CORE',
```

Update `siteInput`:

```ts
    billingPortfolio: data.billingPortfolio === 'EDEN' ? 'EDEN' : 'CORE',
```

- [ ] **Step 4: Generate Prisma client / push schema**

Run:

```bash
npm run db:generate
npm run db:push
```

Expected: Prisma client updates and SQL Server schema accepts the new nullable/default-backed field.

---

### Task 2: Import The `Eden Sites` Sheet

**Files:**
- Modify: `src/app/api/import/route.ts`
- Test: add route-level parser tests if import parsing is extracted; otherwise add a pure helper test.

- [ ] **Step 1: Extract workbook parsing into a helper**

Create a local helper in `src/app/api/import/route.ts` or better `src/lib/clearsol-import.ts`:

```ts
export interface ParsedClearsolSite {
  name: string;
  systemSizeKwp: number;
  siteType: 'Rooftop' | 'Ground Mount';
  contractStatus: 'Yes' | 'No';
  onboardDate: string | null;
  pmCost: number;
  cctvCost: number;
  cleaningCost: number;
  spvId: string | null;
  sourceSheet: string;
  sourceRow: number;
  billingPortfolio: 'CORE' | 'EDEN';
}
```

- [ ] **Step 2: Parse `Portfolio Tracker` as Core**

Update the existing parser so rows from `Portfolio Tracker` produce:

```ts
billingPortfolio: 'CORE',
sourceSheet: 'Portfolio Tracker',
```

Keep the current column mapping for this sheet.

- [ ] **Step 3: Parse `Eden Sites` as Eden**

Add a second parser for `Eden Sites`:

```ts
const edenSheetName = 'Eden Sites';
const edenSheet = workbook.Sheets[edenSheetName];

if (edenSheet) {
  for (let row = 4; row <= 200; row++) {
    const siteName = edenSheet[`C${row}`]?.v;
    if (!siteName || typeof siteName !== 'string') continue;

    const systemSize = parseFloat(String(edenSheet[`D${row}`]?.v ?? '').replace(/,/g, '')) || 0;
    const contractValue = edenSheet[`E${row}`]?.v;
    const onboardDateRaw = edenSheet[`F${row}`]?.v;
    const pmCost = parseCurrency(edenSheet[`G${row}`]?.v);
    const cctvCost = parseCurrency(edenSheet[`H${row}`]?.v);
    const cleaningCost = parseCurrency(edenSheet[`I${row}`]?.v);
    const spvCodeRaw = edenSheet[`S${row}`]?.v;

    sites.push({
      name: siteName,
      systemSizeKwp: systemSize,
      siteType: 'Rooftop',
      contractStatus: contractValue === 'Yes' ? 'Yes' : 'No',
      onboardDate: parseExcelDate(onboardDateRaw),
      pmCost,
      cctvCost,
      cleaningCost,
      spvId: typeof spvCodeRaw === 'string' ? spvCodeRaw : null,
      sourceSheet: edenSheetName,
      sourceRow: row,
      billingPortfolio: 'EDEN',
    });
  }
}
```

Add helper:

```ts
function parseCurrency(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  return parseFloat(value.replace(/[£,]/g, '')) || 0;
}
```

- [ ] **Step 4: Resolve unknown Eden SPVs gracefully**

The inspected Eden rows use `CAPEX` in SPV column `S`. If `CAPEX` is not present in `SPV`, import the site with `spvId: null` but retain:

```ts
sourceSheet: 'Eden Sites',
billingPortfolio: 'EDEN',
```

Do not block Eden import on SPV lookup.

- [ ] **Step 5: Add tests**

Create `src/lib/clearsol-import.test.ts` if parser is extracted. Test:

```ts
expect(parsed.find((site) => site.name === 'Northwood College')).toMatchObject({
  billingPortfolio: 'EDEN',
  sourceSheet: 'Eden Sites',
  sourceRow: 4,
  systemSizeKwp: 360,
  contractStatus: 'Yes',
});
```

Also assert a `Portfolio Tracker` row is `CORE`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run src/lib/clearsol-import.test.ts
```

Expected: PASS.

---

### Task 3: Keep Tier Pricing Combined, But Break Out Billing Totals

**Files:**
- Modify: `src/lib/calculations.ts`
- Test: `src/lib/calculations.test.ts`

- [ ] **Step 1: Add tests**

Add tests showing:

```ts
it('uses combined Core and Eden contracted capacity for tier pricing', () => {
  const core = site({ billingPortfolio: 'CORE', systemSizeKwp: 15_000 });
  const eden = site({ billingPortfolio: 'EDEN', systemSizeKwp: 6_000 });

  expect(currentPortfolioTier([core, eden], DEFAULT_RATE_TIERS).tierName).toBe('20-30MW');
});

it('prices Eden and Core with the same combined tier rate but reports them separately', () => {
  const summary = calculatePortfolioSummary([
    site({ billingPortfolio: 'CORE', systemSizeKwp: 15_000 }),
    site({ billingPortfolio: 'EDEN', systemSizeKwp: 6_000 }),
  ]);

  expect(summary.currentTier).toBe('20-30MW');
  expect(summary.portfolioBreakdowns).toEqual([
    expect.objectContaining({ billingPortfolio: 'CORE', contractedCapacityKwp: 15_000 }),
    expect.objectContaining({ billingPortfolio: 'EDEN', contractedCapacityKwp: 6_000 }),
  ]);
});
```

- [ ] **Step 2: Implement breakdowns**

In `calculatePortfolioSummary`, keep:

```ts
const currentTier = determinePortfolioTier(contractedCapacityKwp / 1000, tiers);
```

Then group fees by `site.billingPortfolio`:

```ts
const portfolioBreakdowns = buildBillingPortfolioBreakdowns(sites, currentTier);
```

Implement `buildBillingPortfolioBreakdowns` so each row computes:

```ts
annualFee = calculateAnnualFeeForTier(site, currentTier)
monthlyFee = annualFee / 12
correctiveDaysAllowed = Math.floor(contractedCapacityKwp / 1000 / 12)
```

Expected: combined tier selection stays unchanged; only the reporting grouping changes.

---

### Task 4: Generate Billing Snapshots With Portfolio Metadata

**Files:**
- Modify: `src/lib/billing-generation.ts`
- Modify: `src/lib/billing-repository.ts`
- Test: `src/lib/billing-generation.test.ts`

- [ ] **Step 1: Add `billingPortfolio` to snapshot source payload**

In `buildBillingSnapshotInput`, add to `sourcePayload.site`:

```ts
billingPortfolio: site.billingPortfolio,
```

Add to `sourcePayload.calculations`:

```ts
pricingCapacityBasis: 'COMBINED_CORE_AND_EDEN_CONTRACTED_CAPACITY',
```

- [ ] **Step 2: Rename tier variable for clarity**

In `src/lib/billing-repository.ts`:

```ts
const combinedCapacityAppliedTier = currentPortfolioTier(sites, tiers, end);
```

Pass that into every snapshot. This makes the “capacity included for tier pricing under both” rule explicit.

- [ ] **Step 3: Test**

Add a test:

```ts
const snapshot = buildBillingSnapshotInput({
  site: site({ billingPortfolio: 'EDEN', systemSizeKwp: 6000 }),
  month: '2026-05',
  appliedTier: { id: '2', tierName: '20-30MW', minCapacityMW: 20, maxCapacityMW: 30, ratePerKwp: 1.8 },
});

expect(snapshot.sourcePayload).toContain('"billingPortfolio":"EDEN"');
expect(snapshot.appliedTier).toBe('20-30MW');
```

---

### Task 5: Split SPV Monthly Display Into Core And Eden

**Files:**
- Modify: `src/lib/spv-monthly-report.ts`
- Modify: `src/lib/spv-monthly-snapshots.ts`
- Modify: `src/app/spvs/page.tsx`
- Tests: existing SPV report tests.

- [ ] **Step 1: Add `portfolioBreakdowns` to calculated report**

In `buildSpvMonthlyReport`, calculate the active tier from all sites as today:

```ts
const tier = currentPortfolioTier(sites, tiers, end);
```

Then group visible contracted rows into `CORE` and `EDEN` using `site.billingPortfolio`.

- [ ] **Step 2: Add `portfolioBreakdowns` to snapshot report**

For app-generated snapshots, read `billingPortfolio` from `sourcePayload.site.billingPortfolio` when present. Fallback to `CORE` for older snapshots.

- [ ] **Step 3: UI**

On `/spvs`, render two summary cards above the table:

- Core Billing: monthly fee, contracted MW, CM days.
- Eden Billing: monthly fee, contracted MW, CM days.

Keep the existing combined total row.

---

### Task 6: Split Standing CM Allowance

**Files:**
- Modify: `src/lib/cm-days.ts`
- Modify: `src/lib/cm-work-repository.ts`
- Modify: `src/app/cmdays/page.tsx`
- Test: `src/lib/cm-days.test.ts`

- [ ] **Step 1: Add CM allowance breakdown type**

In `src/lib/cm-days.ts`:

```ts
export interface CmAllowanceBreakdown {
  billingPortfolio: 'CORE' | 'EDEN';
  contractedCapacityKwp: number;
  allowedDays: number;
}
```

Add helper:

```ts
export function buildCmAllowanceBreakdown(rows: Array<{ billingPortfolio: 'CORE' | 'EDEN'; contractedCapacityKwp: number }>): CmAllowanceBreakdown[] {
  return rows.map((row) => ({
    ...row,
    allowedDays: calculateCmAllowance(row.contractedCapacityKwp),
  }));
}
```

- [ ] **Step 2: Repository**

In `cm-work-repository`, calculate monthly capacity by `site.billingPortfolio`.

Return:

```ts
summary.portfolioAllowances = [
  { billingPortfolio: 'CORE', contractedCapacityKwp, allowedDays },
  { billingPortfolio: 'EDEN', contractedCapacityKwp, allowedDays },
]
```

Keep existing `summary.allowedDays` as combined allowance for backward compatibility.

- [ ] **Step 3: UI**

On `/cmdays`, display:

- Core standing CM allowance.
- Eden standing CM allowance.
- Existing combined allowance.

---

### Task 7: Verification

**Files:**
- No planned code edits.

- [ ] **Step 1: Run tests**

```bash
npm test
```

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Manual import smoke test**

Import:

`/Users/peterhall/Documents/ADE/ClearSol/Clearsol_OM_Framework_Tracker_Update for small sites.xlsx`

Expected:

- Sites from `Eden Sites` are imported.
- `Northwood College`, `Dominos Milton Keynes`, and other `Eden Sites` rows have `billingPortfolio = EDEN`.
- Main `Portfolio Tracker` rows have `billingPortfolio = CORE`.
- Tier pricing uses combined Core + Eden contracted capacity.
- `/spvs` shows Core and Eden billing separately.
- `/cmdays` shows Core and Eden standing CM allowances separately.

## Self-Review

- Corrected the original mistaken SPV-code assumption.
- Eden membership is now tied to the local Clearsol workbook’s separate `Eden Sites` sheet.
- Tier pricing remains combined as requested.
- Billing display and CM allowance are split by persisted site billing portfolio.
