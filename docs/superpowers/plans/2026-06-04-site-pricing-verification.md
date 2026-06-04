# Site Pricing Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make O&M pricing fully transparent on each site detail page by showing the applied tariff tier, all cost inputs, formula build-up, annual fee, monthly fee, and verification status in one auditable panel.

**Architecture:** Keep the commercial calculation in `src/lib/calculations.ts` and expose a typed `pricingBreakdown` on `SiteWithCalculations`. The site detail page should render the breakdown from API data rather than recomputing pricing in React. The existing fixed cost stack and tier table remain, but the new pricing verification panel becomes the primary O&M review surface.

**Tech Stack:** Next.js app router, React, TypeScript, Vitest, existing CSS in `src/app/globals.css`, existing Prisma-backed repository in `src/lib/portfolio-repository.ts`.

---

## Proposed User Experience

When the user opens a site, show a new full-width card directly below the four summary metric cards and above `Site Profile` / `Fixed Cost Stack`.

Card title: `Pricing Verification`

Header content:
- Left: site status and contract/tier basis.
- Right: monthly fee badge and a `Verified` / `Needs review` state.

The card should show:
- Contract status: whether the site is billable.
- Applied portfolio tier: e.g. `20-30MW`.
- Contracted portfolio capacity used for tiering: e.g. `21.00 MW`.
- Rate applied: e.g. `£1.80/kWp`.
- Formula: `(site fixed costs + capacity x rate + active monthly extras x 12) / 12`.
- Annual fee and monthly fee.
- Explicit non-billable explanation where relevant, e.g. `Not priced because site is Awaiting Contract`.

Below that, show a compact line-by-line build-up:

| Component | Calculation | Annual value |
|---|---:|---:|
| PM cost | imported fixed cost | £850.00 |
| CCTV cost | imported fixed cost | £0.00 |
| Cleaning cost | imported fixed cost | £0.00 |
| Additional annual cost | imported fixed cost | £0.00 |
| Portfolio tariff | `320 kWp x £1.80/kWp` | £576.00 |
| Additional monthly cost | `£0.00 x 12` | £0.00 |
| Annual fee | sum above | £1,426.00 |
| Monthly fee | `£1,426.00 / 12` | £118.83 |

Keep the existing `Fixed Cost Stack` card because it is useful for operational inputs, but rename the lower table from `Fee Calculations by Portfolio Tier` to `Scenario Pricing by Portfolio Tier` so it is clear that only one tier is applied.

## Files

- Modify: `src/types/index.ts`
  - Add typed pricing breakdown fields.
- Modify: `src/lib/calculations.ts`
  - Add a pure `buildSitePricingBreakdown()` helper.
  - Attach `pricingBreakdown` to `calculateSiteWithAllTiers()`.
- Modify: `src/lib/calculations.test.ts`
  - Cover contracted, awaiting contract, and monthly-extra date range cases.
- Modify: `src/lib/portfolio-repository.ts`
  - Ensure `getSite()` passes the applied tier and tier capacity metadata into the breakdown.
- Modify: `src/app/sites/[id]/page.tsx`
  - Render the pricing verification panel.
  - Rename the scenario table title.
- Modify: `src/app/globals.css`
  - Add compact pricing breakdown styles, responsive handling, and verification badge styles.

## Success Criteria

- O&M can click into any site and see exactly how the monthly fee is calculated.
- The panel identifies the applied tier, rate per kWp, portfolio capacity basis, and whether the site is billable.
- Awaiting-contract / awaiting-PAC sites show `£0.00` with a reason, not a silent blank calculation.
- Monthly extras show whether they are active for the selected/default pricing month.
- Existing site edit/delete flows remain unchanged.
- `npm test -- src/lib/calculations.test.ts` passes.
- `npm run lint` passes.

---

### Task 1: Add Pricing Breakdown Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add these interfaces above `SiteWithCalculations`**

```ts
export interface SitePricingBreakdownLine {
  label: string;
  calculation: string;
  annualValue: number;
  note?: string | null;
}

export interface SitePricingBreakdown {
  isBillable: boolean;
  reviewStatus: 'VERIFIED' | 'NEEDS_REVIEW';
  reviewReason: string;
  appliedTierName: string;
  appliedTierRatePerKwp: number;
  contractedCapacityKwpForTier: number;
  siteFixedCostsAnnual: number;
  portfolioCostAnnual: number;
  additionalMonthlyAnnual: number;
  annualFee: number;
  monthlyFee: number;
  formula: string;
  lines: SitePricingBreakdownLine[];
}
```

- [ ] **Step 2: Add this property to `SiteWithCalculations`**

```ts
pricingBreakdown: SitePricingBreakdown;
```

- [ ] **Step 3: Run type-aware tests**

Run: `npm test -- src/lib/calculations.test.ts`

Expected: failing TypeScript/test output until calculation helper is implemented.

---

### Task 2: Build Pure Pricing Breakdown Helper

**Files:**
- Modify: `src/lib/calculations.ts`
- Modify: `src/lib/calculations.test.ts`

- [ ] **Step 1: Add calculation tests**

Add tests covering:
- contracted site uses applied tier rate and returns verified status;
- awaiting contract returns zero fee and reason;
- monthly additional cost is included only when active for the passed month.

Test expectations should use existing fixture helper values:

```ts
expect(calculated.pricingBreakdown).toMatchObject({
  isBillable: true,
  reviewStatus: 'VERIFIED',
  appliedTierName: '<20MW',
  appliedTierRatePerKwp: 2,
  siteFixedCostsAnnual: 200,
  portfolioCostAnnual: 2_000,
  annualFee: 2_200,
  monthlyFee: 2_200 / 12,
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/calculations.test.ts`

Expected: FAIL because `pricingBreakdown` does not exist yet.

- [ ] **Step 3: Implement `buildSitePricingBreakdown()`**

Add a helper that accepts:
- `site`
- `appliedTier`
- `contractedCapacityKwpForTier`
- optional `month`

The helper should use the existing calculation functions:
- `calculateSiteFixedCosts(site)`
- `calculatePortfolioCost(site.systemSizeKwp, appliedTier.ratePerKwp)`
- `isAdditionalMonthlyCostActive(site, month)`
- `calculateAnnualFeeForTierForMonth(site, appliedTier, month)`
- `calculateMonthlyFee(annualFee)`

For non-contracted sites:
- `isBillable: false`
- `reviewStatus: 'NEEDS_REVIEW'`
- `reviewReason: 'Not billable while contract status is <status>'`
- annual and monthly fee values are `0`
- lines still show source inputs, but portfolio tariff and total fee are zeroed.

- [ ] **Step 4: Attach the breakdown in `calculateSiteWithAllTiers()`**

Add a new optional parameter after `month`:

```ts
contractedCapacityKwpForTier?: number
```

Return:

```ts
pricingBreakdown: buildSitePricingBreakdown(site, selectedTier, contractedCapacityKwpForTier ?? 0, month),
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/lib/calculations.test.ts`

Expected: PASS.

---

### Task 3: Pass Tier Capacity Metadata from Repository

**Files:**
- Modify: `src/lib/portfolio-repository.ts`

- [ ] **Step 1: Update `getSite()`**

In `getSite()`, calculate:

```ts
const contractedCapacityKwpForTier = contractedCapacityForTier(mappedSites);
const appliedTier = determinePortfolioTier(contractedCapacityKwpForTier / 1000, tiers);
```

Then call:

```ts
return calculateSiteWithAllTiers(
  mapPrismaSite(site),
  tiers,
  appliedTier,
  null,
  contractedCapacityKwpForTier
);
```

Import `contractedCapacityForTier` and `determinePortfolioTier` from `src/lib/calculations.ts`.

- [ ] **Step 2: Update other calls only where required by TypeScript**

Existing calls can continue without the final parameter. Do not modify unrelated repository behaviour.

- [ ] **Step 3: Run repository-adjacent tests**

Run: `npm test -- src/lib/calculations.test.ts src/lib/portfolio-repository.test.ts`

Expected: PASS.

---

### Task 4: Render the Site Pricing Verification Panel

**Files:**
- Modify: `src/app/sites/[id]/page.tsx`

- [ ] **Step 1: Import an icon**

Add `Calculator` or `ShieldCheck` from `lucide-react`.

- [ ] **Step 2: Add a component above `SiteDetailContent()`**

Create `PricingVerificationCard({ site }: { site: SiteWithCalculations })` that:
- reads `site.pricingBreakdown`;
- shows applied tier and rate;
- shows contracted capacity basis;
- renders each `lines` row;
- uses `formatCurrency()` and `formatNumber()`;
- displays `Verified` for billable contracted sites and `Needs review` for non-billable sites.

- [ ] **Step 3: Insert the panel after `stats-grid`**

Place:

```tsx
<PricingVerificationCard site={site} />
```

directly after the four summary metrics.

- [ ] **Step 4: Rename existing lower table**

Change:

```tsx
<h2>Fee Calculations by Portfolio Tier</h2>
<p>Annual portfolio cost, fixed fee, and unit rate for this site.</p>
```

to:

```tsx
<h2>Scenario Pricing by Portfolio Tier</h2>
<p>Comparison view only. The applied tier is shown in Pricing Verification above.</p>
```

- [ ] **Step 5: Run lint**

Run: `npm run lint`

Expected: PASS.

---

### Task 5: Add Responsive Styling

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add pricing panel classes near the existing detail/card styles**

Add classes for:
- `.pricing-verification-card`
- `.pricing-verification-header`
- `.pricing-verification-summary`
- `.pricing-formula`
- `.pricing-breakdown-table`
- `.pricing-status-verified`
- `.pricing-status-review`

Use the existing card styling, 6px radius, restrained colours, and compact row spacing.

- [ ] **Step 2: Add mobile rules near existing responsive detail-row rules**

On narrow screens:
- stack header content;
- convert the breakdown table to readable rows;
- avoid horizontal overflow.

- [ ] **Step 3: Visually verify**

Run: `npm run dev`

Open a site detail page and verify:
- desktop layout matches the screenshot style;
- mobile layout does not overlap or overflow;
- the monthly fee badge matches the card total.

---

### Task 6: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/lib/calculations.test.ts src/lib/portfolio-repository.test.ts`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Manual O&M acceptance check**

For at least three sites:
- one contracted site;
- one awaiting contract site;
- one site with additional monthly cost if available.

Confirm the visible calculation can be reconciled manually from the displayed inputs without opening the edit form or source spreadsheet.

