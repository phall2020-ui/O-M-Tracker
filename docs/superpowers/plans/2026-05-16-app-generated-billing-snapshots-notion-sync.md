# App-Generated Billing Snapshots And Notion Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move monthly billing creation into the O&M Tracker app, store immutable Azure SQL billing snapshots, and publish missing snapshot rows one-way into the Notion `O&M Billing` database.

**Architecture:** Azure SQL remains operational truth. Admins/managers edit site data in the app; monthly billing snapshots are generated from the app’s current site data for a selected month, locked once created, and then optionally published to Notion as a reporting surface. Notion Billing rows created by this flow are synced one-way from SQL; existing immutable snapshot values are not overwritten from Notion.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma SQL Server, Notion API `2022-06-28`, Auth.js credentials auth, Vitest, Playwright/browser smoke checks, Azure Container Apps.

---

## Scope

This plan implements the next production phase after the monthly SPV frontend pass:

- Generate monthly site-level billing snapshots in the app.
- Keep snapshots immutable once created.
- Sync generated snapshots to the exact Notion `O&M Billing` database.
- Link Notion Billing pages to the original Notion `O&M Contracts` pages through the `O&M Contract` relation.
- Keep site editing in the app and make the UI role-aware.
- Keep existing Notion Billing import as historical/bootstrap only.

This plan does **not** implement payment collection, invoice PDFs, credit notes, or full accounting approval workflow.

---

## Current State

Already implemented:

- `BillingSnapshot` exists in `prisma/schema.prisma`.
- Existing Notion Billing rows were imported as immutable snapshots.
- `/spvs` uses `BillingSnapshot` rows for months where snapshots exist.
- `/api/spvs/monthly` returns `source: 'billing-snapshots' | 'calculated-sites'`.
- Admin Billing import exists at `/api/admin/import/notion-billing`.
- Site edits are API-protected for `ADMIN` and `MANAGER`.

Gaps this plan closes:

- There is no app-generated monthly billing run.
- There is no app-to-Notion Billing publisher.
- There is no sync status on app-generated snapshots.
- Site edit controls are visible regardless of role even though API protects writes.
- There is no admin UI to generate a month, preview it, lock it, and publish it to Notion.

---

## File Structure

Create:

- `src/lib/billing-generation.ts`  
  Pure functions that convert active site records into immutable billing snapshot inputs for one month.

- `src/lib/billing-generation.test.ts`  
  Tests for month eligibility, pro-rata, expected amount, tier label, and immutability shape.

- `src/lib/billing-repository.ts`  
  Database operations for previewing, creating, listing, and publishing billing snapshots.

- `src/lib/notion-billing-publisher.ts`  
  Notion API publisher that creates missing Notion `O&M Billing` pages from SQL snapshots.

- `src/lib/notion-billing-publisher.test.ts`  
  Tests for Notion payload construction and relation mapping.

- `src/app/api/admin/billing/generate/route.ts`  
  Admin/manager endpoint to preview or commit app-generated monthly billing snapshots.

- `src/app/api/admin/billing/sync-notion/route.ts`  
  Admin endpoint to publish missing SQL snapshots to Notion.

- `src/app/api/admin/billing/snapshots/route.ts`  
  Admin/manager endpoint to inspect snapshot counts and status by month.

- `src/components/admin/BillingGenerationPanel.tsx`  
  Admin UI for month selection, preview, commit, and publish to Notion.

- `src/components/sites/SiteActions.tsx`  
  Role-aware site action controls.

- `src/lib/client-session.ts`  
  Small client helper for reading the current user role where needed.

Modify:

- `prisma/schema.prisma`  
  Add generation/sync metadata to `BillingSnapshot` and add `BillingRun`.

- `src/lib/notion-integration.ts`  
  Keep historical Notion Billing import, but clearly mark it as bootstrap/import-only.

- `src/lib/portfolio-repository.ts`  
  Keep monthly SPV reports snapshot-aware; no broad rewrite.

- `src/app/admin/page.tsx`  
  Add app-generated billing panel.

- `src/app/sites/page.tsx`  
  Hide add/delete actions for users who cannot edit.

- `src/app/sites/[id]/page.tsx`  
  Hide edit/delete buttons for users who cannot edit.

- `src/app/api/admin/status/route.ts`  
  Include billing run/snapshot/sync counts.

- `src/types/index.ts`  
  Add billing run, snapshot preview, and sync result DTOs.

- `azure/deploy-containerapp.sh`  
  Ensure `NOTION_BILLING_DATABASE_ID` is preserved/set.

---

## Data Model Contract

### BillingRun

Add a new model to group a monthly generation event:

```prisma
model BillingRun {
  id                 String   @id @default(cuid())
  month              String
  status             String   @default("COMMITTED")
  source             String   @default("APP_GENERATED")
  snapshotCount      Int
  skippedCount       Int      @default(0)
  totalExpectedAmount Float   @default(0)
  createdBy          User     @relation(fields: [createdById], references: [id])
  createdById        String
  createdAt          DateTime @default(now())

  snapshots          BillingSnapshot[]

  @@index([month])
  @@index([createdAt])
}
```

### BillingSnapshot Metadata

Extend `BillingSnapshot`:

```prisma
  billingRun          BillingRun? @relation(fields: [billingRunId], references: [id])
  billingRunId        String?
  source              String     @default("NOTION_IMPORTED")
  notionSyncStatus    String     @default("NOT_SYNCED")
  notionSyncedAt      DateTime?
  notionSyncError     String?    @db.NVarChar(Max)
  createdById         String?
  createdBy           User?      @relation(fields: [createdById], references: [id], onDelete: SetNull)
```

Keep this unique key:

```prisma
@@unique([notionDatabaseId, notionPageId])
```

Add this key for app-generated immutability:

```prisma
@@unique([siteId, month, source])
```

Interpretation:

- Imported historical Notion rows use `source = 'NOTION_IMPORTED'`.
- App-generated rows use `source = 'APP_GENERATED'`.
- One site can have one app-generated snapshot per month.
- Re-running the same month skips existing app-generated rows.
- Existing snapshots are never recalculated in place.

---

## Billing Generation Rules

For selected `YYYY-MM`:

- Include a site when:
  - `contractStatus === 'Yes'`
  - `onboardDate` exists
  - `onboardDate <= monthEnd`
- Exclude:
  - not contracted sites
  - sites with no onboard date
- Use the app’s current fee fields at generation time:
  - `siteFixedCostsAnnual = pmCost + cctvCost + cleaningCost`
  - `variableCostAnnual = portfolioCost_20MW` initially, matching existing commercial logic
  - `annualFee = fixedFee_20MW`
  - `expectedAmount = annualFee / 12`
- Apply pro-rata only for the first onboard month:
  - if onboard date is within selected month, `proRataFactor = activeDaysInMonth / daysInMonth`
  - otherwise `proRataFactor = 1`
  - `expectedAmount = round((annualFee / 12) * proRataFactor, 2)`
- Snapshot stores copied site/SPV names and costs so later site edits do not mutate historical billing.

---

## Notion Publishing Rules

Target database:

- Default: `NOTION_BILLING_DATABASE_ID`
- Current exact ID: `39212e37c38b4c79b1cd8e54c976f7ea`
- Human title: `O&M Billing`

For each app-generated `BillingSnapshot`:

- Find the original Notion contract page ID using `NotionExternalMapping`:
  - `entityType = 'Site'`
  - `entityId = snapshot.siteId`
  - `notionDatabaseId = NOTION_SITES_DATABASE_ID`
- Create a Notion page in the Billing DB when `snapshot.notionPageId` is absent.
- Set the `O&M Contract` relation to that original contract page.
- Set Notion properties:
  - `Billing Entry`: `${snapshot.siteName} - ${snapshot.monthLabel}`
  - `Billing Period`: first day of month
  - `SPV`: select snapshot SPV code when present
  - `Applied Tier`: snapshot applied tier
  - `O&M Provider`: `ClearSol`
  - `Payment Status`: `Due`
  - `Expected Amount (£)`: snapshot expected amount if the Notion property is editable; if still formula-only, write value into `Notes` instead
  - `Pro-rata Factor`: snapshot pro-rata factor
  - `Notes`: generated by O&M Tracker with snapshot ID and sync timestamp
- On success:
  - store Notion page ID on snapshot `notionPageId`
  - mark `notionSyncStatus = 'SYNCED'`
  - set `notionSyncedAt`
- On failure:
  - mark `notionSyncStatus = 'FAILED'`
  - store concise error in `notionSyncError`

Important: The publisher creates missing Notion rows. It does not update financial fields on an already synced immutable snapshot.

---

## Task 1: Extend Prisma Billing Schema

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Write schema change**

Add `BillingRun` and extend `BillingSnapshot` with generation/sync metadata exactly as described in the Data Model Contract.

- [ ] **Step 2: Generate Prisma client**

Run:

```bash
DATABASE_URL="$(az containerapp show --resource-group rg-application1 --name ca-om-tracker-prod --query "properties.template.containers[0].env[?name=='DATABASE_URL'].value | [0]" --output tsv)" npx prisma generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 3: Push schema to Azure SQL**

Run:

```bash
DATABASE_URL="$(az containerapp show --resource-group rg-application1 --name ca-om-tracker-prod --query "properties.template.containers[0].env[?name=='DATABASE_URL'].value | [0]" --output tsv)" npx prisma db push
```

Expected: database in sync.

- [ ] **Step 4: Verify existing snapshots remain**

Run:

```bash
DATABASE_URL="$(az containerapp show --resource-group rg-application1 --name ca-om-tracker-prod --query "properties.template.containers[0].env[?name=='DATABASE_URL'].value | [0]" --output tsv)" npx tsx -e "import prisma from './src/lib/prisma'; (async()=>{ console.log(await prisma.billingSnapshot.count()); await prisma.$disconnect(); })();"
```

Expected: `665`.

---

## Task 2: Billing Generation Pure Logic

**Files:**

- Create: `src/lib/billing-generation.ts`
- Create: `src/lib/billing-generation.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests covering:

```ts
import { describe, expect, it } from 'vitest';
import { buildBillingSnapshotInputs, calculateProRataFactor } from './billing-generation';

describe('billing generation', () => {
  it('calculates full-month pro-rata for sites already onboarded', () => {
    expect(calculateProRataFactor('2026-05', '2026-04-15')).toBe(1);
  });

  it('calculates first-month pro-rata from onboard date', () => {
    expect(calculateProRataFactor('2026-05', '2026-05-16')).toBeCloseTo(16 / 31, 5);
  });

  it('generates immutable snapshot inputs for contracted onboarded sites only', () => {
    const result = buildBillingSnapshotInputs({
      month: '2026-05',
      sites: [
        {
          id: 'site-1',
          name: 'Active Site',
          systemSizeKwp: 1000,
          contractStatus: 'Yes',
          onboardDate: '2026-04-01',
          spvCode: 'OS2',
          spvId: 'spv-1',
          siteFixedCosts: 200,
          portfolioCost_20MW: 2000,
          fixedFee_20MW: 2200,
        },
        {
          id: 'site-2',
          name: 'Future Site',
          systemSizeKwp: 500,
          contractStatus: 'Yes',
          onboardDate: '2026-06-01',
          spvCode: 'OS2',
          spvId: 'spv-1',
          siteFixedCosts: 100,
          portfolioCost_20MW: 1000,
          fixedFee_20MW: 1100,
        },
      ],
      spvNames: { OS2: 'Olympus Solar 2 Ltd' },
    });

    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toMatchObject({
      siteId: 'site-1',
      siteName: 'Active Site',
      month: '2026-05',
      expectedAmount: 183.33,
      source: 'APP_GENERATED',
    });
    expect(result.skipped).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/lib/billing-generation.test.ts
```

Expected: fails because module does not exist.

- [ ] **Step 3: Implement minimal logic**

Implement:

- `calculateProRataFactor(month, onboardDate)`
- `buildBillingSnapshotInputs({ month, sites, spvNames })`
- `roundMoney(value)`
- `monthLabel(month)`

Use UTC month bounds from `src/lib/month-periods.ts`.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/lib/billing-generation.test.ts
```

Expected: pass.

---

## Task 3: Billing Repository

**Files:**

- Create: `src/lib/billing-repository.ts`
- Modify: `src/lib/portfolio-repository.ts` only if shared site loading helpers are needed.

- [ ] **Step 1: Write repository tests or integration smoke script**

Because this project currently uses live SQL rather than a separate test DB for repository code, use pure unit tests for generation and a smoke script for repository behavior after implementation.

- [ ] **Step 2: Implement `previewBillingGeneration(month)`**

Function contract:

```ts
export async function previewBillingGeneration(month: string) {
  return {
    month,
    snapshotCount: number,
    skippedCount: number,
    totalExpectedAmount: number,
    snapshots: BillingSnapshotPreview[],
    skipped: BillingSkippedSite[],
  };
}
```

- [ ] **Step 3: Implement `commitBillingGeneration(month, user)`**

Behavior:

- require caller has already passed role guard
- load current sites with calculations
- build snapshot inputs
- skip existing `{ siteId, month, source: 'APP_GENERATED' }`
- create one `BillingRun`
- create snapshots with copied site data
- audit `GENERATE` on `BillingRun`

- [ ] **Step 4: Implement `getBillingSnapshotStatus(month?)`**

Return counts by month:

```ts
{
  months: Array<{
    month: string;
    snapshotCount: number;
    appGeneratedCount: number;
    notionImportedCount: number;
    syncedCount: number;
    failedCount: number;
    totalExpectedAmount: number;
  }>
}
```

- [ ] **Step 5: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: pass.

---

## Task 4: Notion Billing Publisher

**Files:**

- Create: `src/lib/notion-billing-publisher.ts`
- Create: `src/lib/notion-billing-publisher.test.ts`

- [ ] **Step 1: Write failing payload tests**

Test `buildNotionBillingPagePayload(snapshot, contractPageId)`:

```ts
expect(payload.parent.database_id).toBe('39212e37c38b4c79b1cd8e54c976f7ea');
expect(payload.properties['O&M Contract'].relation[0].id).toBe('contract-page-id');
expect(payload.properties['Billing Period'].date.start).toBe('2026-05-01');
expect(payload.properties['Payment Status'].status.name).toBe('Due');
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/lib/notion-billing-publisher.test.ts
```

Expected: fail because publisher module does not exist.

- [ ] **Step 3: Implement payload builder**

Include defensive handling for Notion formula properties:

- Do not attempt to write formula properties.
- Put immutable expected amount in `Notes` if `Expected Amount (£)` is formula-only.
- Write `Invoiced Amount (£)` only if needed later; initially leave blank.

- [ ] **Step 4: Implement publisher**

Function contract:

```ts
export async function publishBillingSnapshotsToNotion(input: {
  month?: string;
  user: AppSessionUser;
  databaseId?: string;
}): Promise<{
  attempted: number;
  created: number;
  skippedAlreadySynced: number;
  failed: number;
}>
```

Behavior:

- select `APP_GENERATED` snapshots where `notionSyncStatus != 'SYNCED'`
- if `month` provided, filter by month
- find site Notion mapping
- create Notion page
- update snapshot sync status
- audit `SYNC` on `NotionBilling`

- [ ] **Step 5: Run tests and TypeScript**

Run:

```bash
npm test -- src/lib/notion-billing-publisher.test.ts
npx tsc --noEmit
```

Expected: pass.

---

## Task 5: Admin Billing APIs

**Files:**

- Create: `src/app/api/admin/billing/generate/route.ts`
- Create: `src/app/api/admin/billing/sync-notion/route.ts`
- Create: `src/app/api/admin/billing/snapshots/route.ts`

- [ ] **Step 1: Implement generation endpoint**

Route:

- `POST /api/admin/billing/generate`

Body:

```json
{ "month": "2026-06", "commit": false }
```

Auth:

- `ADMIN`
- `MANAGER`

Behavior:

- preview when `commit: false`
- commit immutable app-generated snapshots when `commit: true`

- [ ] **Step 2: Implement Notion publish endpoint**

Route:

- `POST /api/admin/billing/sync-notion`

Body:

```json
{ "month": "2026-06" }
```

Auth:

- `ADMIN`

Behavior:

- publish missing app-generated snapshots for selected month
- return counts

- [ ] **Step 3: Implement snapshot status endpoint**

Route:

- `GET /api/admin/billing/snapshots`

Auth:

- `ADMIN`
- `MANAGER`

Behavior:

- return status by month for admin UI

- [ ] **Step 4: Manual API smoke test**

Run after deploy/local dev:

```bash
curl -i https://ca-om-tracker-prod.blueground-aa6c330f.uksouth.azurecontainerapps.io/api/admin/billing/snapshots
```

Expected without auth: redirected or unauthorized by middleware.

---

## Task 6: Admin Billing UI

**Files:**

- Create: `src/components/admin/BillingGenerationPanel.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add panel component**

Panel controls:

- month input/select
- `Preview Billing`
- `Commit Snapshots`
- `Publish to Notion`
- status table by month

Display:

- preview count
- skipped count
- expected monthly total
- Notion publish result
- warning that committed snapshots are immutable

- [ ] **Step 2: Wire into admin page**

Place below existing Notion Bootstrap/Billing import panel. Label clearly:

`App-Generated Monthly Billing`

- [ ] **Step 3: Browser smoke test**

Use Playwright:

```bash
export PWCLI="$HOME/.codex/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" open https://ca-om-tracker-prod.blueground-aa6c330f.uksouth.azurecontainerapps.io/admin
"$PWCLI" snapshot
```

Expected:

- panel visible
- month control visible
- preview/commit/publish buttons visible

---

## Task 7: Role-Aware Site Editing UI

**Files:**

- Create: `src/lib/client-session.ts`
- Create: `src/components/sites/SiteActions.tsx`
- Modify: `src/app/sites/page.tsx`
- Modify: `src/app/sites/[id]/page.tsx`

- [ ] **Step 1: Add client role helper**

Use `useSession()` from `next-auth/react` and expose:

```ts
export function canEditSites(role?: string | null) {
  return role === 'ADMIN' || role === 'MANAGER';
}
```

- [ ] **Step 2: Hide edit/delete/add controls for non-editors**

Sites list:

- show `Add Site` only for `ADMIN`/`MANAGER`
- show `Delete` only for `ADMIN`/`MANAGER`
- keep `View` visible

Site detail:

- show `Edit`/`Delete` only for `ADMIN`/`MANAGER`

- [ ] **Step 3: Keep API guards unchanged**

Do not weaken:

- `POST /api/sites`
- `PUT /api/sites/[id]`
- `DELETE /api/sites/[id]`

They must continue to call:

```ts
requireRole(['ADMIN', 'MANAGER'])
```

- [ ] **Step 4: Browser smoke test**

Login as admin and verify:

- Add Site visible
- Edit button visible
- edit form opens

Login as contractor and verify:

- Add Site hidden
- Edit/Delete hidden
- direct API write still 403

---

## Task 8: Scheduled Billing Automation Decision

**Files:**

- Modify: `docs/azure-production.md`
- Optional modify: `azure/deploy-containerapp.sh`

- [ ] **Step 1: Document manual-first operation**

Document this as the initial production workflow:

1. Admin/manager edits site data during month.
2. Admin/manager previews billing generation.
3. Admin/manager commits snapshots.
4. Admin publishes snapshots to Notion.
5. Daily summary sync continues separately.

- [ ] **Step 2: Do not auto-generate monthly snapshots yet**

Reason:

- immutable billing rows should be explicitly reviewed before first production lock.
- scheduled auto-generation can be added once the billing sign-off workflow is accepted.

---

## Task 9: Verification And Deployment

**Files:**

- No new files unless defects are found.

- [ ] **Step 1: Run unit tests**

```bash
npm test -- src/lib/billing-generation.test.ts src/lib/notion-billing-publisher.test.ts src/lib/notion-billing-snapshots.test.ts src/lib/spv-monthly-snapshots.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run TypeScript**

```bash
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 3: Run build**

```bash
DATABASE_URL="$(az containerapp show --resource-group rg-application1 --name ca-om-tracker-prod --query "properties.template.containers[0].env[?name=='DATABASE_URL'].value | [0]" --output tsv)" npm run build
```

Expected: pass.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: no errors. Existing warnings are acceptable only if unrelated.

- [ ] **Step 5: Deploy**

```bash
./azure/deploy-containerapp.sh
```

Expected: new revision active.

- [ ] **Step 6: Live smoke test**

Verify:

- `/admin` shows App-Generated Monthly Billing panel.
- Preview for a future month works.
- Commit creates snapshots.
- Re-commit same month skips existing snapshots.
- Publish to Notion creates missing Notion Billing rows.
- `/spvs?month=YYYY-MM` uses `billing-snapshots` after commit.
- `/sites` and `/sites/[id]` still allow admin edit.

---

## Operational Outcome

After implementation, the monthly process becomes:

1. Site data is edited in the app by admin/manager users.
2. Admin/manager previews monthly billing in the app.
3. Admin/manager commits immutable SQL snapshots.
4. Admin publishes those snapshots to Notion Billing.
5. SPV monthly reporting reads SQL snapshots.
6. Notion remains a board/reporting surface, not operational truth.

---

## Self-Review

Spec coverage:

- App creates monthly billing rows: covered by Tasks 2, 3, 5, 6.
- Immutable monthly snapshots: covered by Data Model Contract and Tasks 1, 3.
- Sync to Notion Billing relation: covered by Notion Publishing Rules and Task 4.
- Site data can be edited: covered by Task 7 while preserving API guards.
- Production/frontend fit: covered by Tasks 6, 7, 9.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified edge-handling placeholders.
- Every route, model, and command is named explicitly.

Type consistency:

- `APP_GENERATED`, `NOTION_IMPORTED`, `NOT_SYNCED`, `SYNCED`, and `FAILED` are used consistently.
- `BillingRun`, `BillingSnapshot`, and `NotionExternalMapping` responsibilities are distinct.

