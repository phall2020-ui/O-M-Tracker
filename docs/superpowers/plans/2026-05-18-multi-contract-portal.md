# Multi-Contract Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one deployed portal support the same O&M workflows for more than one contract, with contract-specific sites, SPVs, rate tiers, billing, CM allowances, imports, and reporting.

**Architecture:** Introduce a first-class `Contract` model and scope commercial data by `contractId`. Keep `billingPortfolio` as a reporting split inside a contract, so existing Core/Eden behavior continues. Add a contract selector/context that drives API queries and server-side calculations, with a seeded default contract for backwards compatibility.

**Tech Stack:** Next.js App Router, React 19, Prisma 7 with SQL Server, NextAuth, Vitest, ExcelJS.

---

## Assumptions And Boundaries

- "Different contract" means the same app instance can switch between contracts such as the current Clearsol contract and a new contract with different rate tiers, sites, SPVs, CM allowance rules, and external Notion targets.
- This plan does not create separate deployments or separate databases per contract.
- Users are initially allowed to see all contracts unless later restricted. Contract-level user access can be added after this plan by introducing a `UserContractAccess` join table.
- Existing data is migrated into one default contract named `Clearsol O&M`.
- Existing `billingPortfolio` values `CORE` and `EDEN` remain valid and are not promoted into contracts.

## File Structure

- Modify `prisma/schema.prisma`: add `Contract`, add `contractId` foreign keys to scoped models, and make rate tiers contract-specific.
- Modify `prisma/seed.ts`: seed the default contract and attach seeded sites, SPVs, rate tiers, users, snapshots, and adjustments where needed.
- Create `src/lib/contracts.ts`: central contract helpers, default contract creation, contract normalization, and selected-contract validation.
- Modify `src/types/index.ts`: add `Contract`, `ContractContext`, and contract fields on site/SPV/rate tier types.
- Modify `src/lib/portfolio-repository.ts`: scope site/SPV/rate-tier queries and writes by selected contract.
- Modify `src/lib/calculations.ts`: keep pure calculations unchanged where possible, but ensure tier selection receives contract-scoped sites and tiers.
- Modify `src/lib/billing-generation.ts`, `src/lib/billing-repository.ts`, `src/lib/spv-monthly-report.ts`, `src/lib/spv-monthly-snapshots.ts`: carry contract metadata into generated snapshots and reports.
- Modify `src/lib/cm-work-repository.ts`, `src/lib/cm-days.ts`: compute CM usage and allowance within the selected contract.
- Modify API routes under `src/app/api/**/route.ts`: read `contract` query/header and pass `contractId` into repositories.
- Modify UI pages under `src/app/**/page.tsx`: preserve selected contract in fetches, navigation links, and mutations.
- Modify `src/components/layout/Sidebar.tsx` or `src/components/layout/Header.tsx`: add contract selector in the shell.
- Create `src/components/contracts/ContractSelector.tsx`: selector component.
- Create tests: `src/lib/contracts.test.ts`, plus focused updates to existing repository/calculation/billing tests.

---

## Task 1: Add Contract Schema And Migration Path

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Create: `src/lib/contracts.ts`
- Test: `src/lib/contracts.test.ts`

- [ ] **Step 1: Add failing tests for contract normalization**

Create `src/lib/contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeContractCode, selectedContractWhere } from './contracts';

describe('contract helpers', () => {
  it('normalizes readable contract names into stable uppercase codes', () => {
    expect(normalizeContractCode('Clearsol O&M')).toBe('CLEARSOL_O_M');
    expect(normalizeContractCode('  Eden 2 Contract  ')).toBe('EDEN_2_CONTRACT');
  });

  it('builds a Prisma where clause for selected contract ids', () => {
    expect(selectedContractWhere('contract-1')).toEqual({ contractId: 'contract-1' });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- src/lib/contracts.test.ts`

Expected: FAIL because `src/lib/contracts.ts` does not exist.

- [ ] **Step 3: Add the `Contract` model and contract foreign keys**

In `prisma/schema.prisma`, add:

```prisma
model Contract {
  id                        String              @id @default(cuid())
  code                      String              @unique
  name                      String
  description               String?             @db.NVarChar(Max)
  isDefault                 Boolean             @default(false)
  isActive                  Boolean             @default(true)
  notionSummaryPageId       String?
  notionBillingDatabaseId   String?
  createdAt                 DateTime            @default(now())
  updatedAt                 DateTime            @updatedAt

  sites                     Site[]
  spvs                      SPV[]
  rateTiers                 RateTier[]
  billingRuns               BillingRun[]
  billingSnapshots          BillingSnapshot[]
  billingMonthLocks         BillingMonthLock[]
  billingAdjustments        BillingAdjustment[]

  @@index([isActive])
  @@index([isDefault])
}
```

Update these models with required `contractId` fields:

```prisma
model SPV {
  id         String   @id @default(cuid())
  code       String
  name       String
  contract   Contract @relation(fields: [contractId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  contractId String
  sites      Site[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([contractId, code])
  @@index([contractId])
}
```

Apply the same required `contractId` relation pattern to `Site`, `RateTier`, `BillingRun`, `BillingSnapshot`, `BillingMonthLock`, and `BillingAdjustment`. For `BillingMonthLock`, replace `@unique([month])` behavior with `@@unique([contractId, month])`.

- [ ] **Step 4: Add contract helper implementation**

Create `src/lib/contracts.ts`:

```ts
import prisma from './prisma';

export const DEFAULT_CONTRACT_CODE = 'CLEARSOL_O_M';
export const DEFAULT_CONTRACT_NAME = 'Clearsol O&M';

export interface ContractOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export function normalizeContractCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function selectedContractWhere(contractId: string): { contractId: string } {
  return { contractId };
}

export async function ensureDefaultContract() {
  const existingDefault = await prisma.contract.findFirst({ where: { isDefault: true } });
  if (existingDefault) return existingDefault;

  return prisma.contract.upsert({
    where: { code: DEFAULT_CONTRACT_CODE },
    update: { isDefault: true, isActive: true },
    create: {
      code: DEFAULT_CONTRACT_CODE,
      name: DEFAULT_CONTRACT_NAME,
      isDefault: true,
      isActive: true,
    },
  });
}

export async function listContracts(): Promise<ContractOption[]> {
  const rows = await prisma.contract.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    isActive: row.isActive,
  }));
}

export async function resolveContractId(contractIdOrCode?: string | null): Promise<string> {
  if (contractIdOrCode) {
    const selected = await prisma.contract.findFirst({
      where: {
        isActive: true,
        OR: [{ id: contractIdOrCode }, { code: normalizeContractCode(contractIdOrCode) }],
      },
    });
    if (selected) return selected.id;
  }

  return (await ensureDefaultContract()).id;
}
```

- [ ] **Step 5: Update seed data**

In `prisma/seed.ts`, create the default contract before SPVs/sites/rate tiers:

```ts
const contract = await prisma.contract.upsert({
  where: { code: 'CLEARSOL_O_M' },
  update: { name: 'Clearsol O&M', isDefault: true, isActive: true },
  create: { code: 'CLEARSOL_O_M', name: 'Clearsol O&M', isDefault: true, isActive: true },
});
```

Attach `contractId: contract.id` to every seeded SPV, site, and rate tier.

- [ ] **Step 6: Run schema and helper verification**

Run:

```bash
npm run db:generate
npm test -- src/lib/contracts.test.ts
```

Expected: Prisma client generation succeeds and contract helper tests pass.

---

## Task 2: Scope Core Repository Queries By Contract

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/portfolio-repository.ts`
- Modify: `src/app/api/sites/route.ts`
- Modify: `src/app/api/sites/[id]/route.ts`
- Modify: `src/app/api/spvs/route.ts`
- Modify: `src/app/api/spvs/summary/route.ts`
- Test: existing API/repository tests if present, otherwise add targeted pure-helper tests.

- [ ] **Step 1: Add contract fields to shared types**

In `src/types/index.ts`, add:

```ts
export interface Contract {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface ContractScopedParams {
  contractId?: string | null;
}
```

Add `contractId: string` to `Site`, `SPV`, and `RateTier`.

- [ ] **Step 2: Map Prisma contract fields**

In `src/lib/portfolio-repository.ts`, update `mapPrismaSite` to include:

```ts
contractId: site.contractId,
```

Update the local `SiteWithSpv` type so it includes the new field naturally from Prisma.

- [ ] **Step 3: Thread `contractId` through site reads**

Update `listSites` params:

```ts
contractId?: string | null;
```

Resolve the contract at the top:

```ts
const contractId = await resolveContractId(params.contractId);
```

Change site queries to:

```ts
const sites = await prisma.site.findMany({
  where: { contractId },
  include: { spv: true },
  orderBy: { name: params.sortOrder === 'desc' ? 'desc' : 'asc' },
});
```

Use the same `contractId` in `getSite`, `createSiteRecord`, `importSiteRecords`, `updateSiteRecord`, `listSpvs`, `getSpvSummaries`, `getSpvMonthlyReport`, and `getPortfolioSummary`.

- [ ] **Step 4: Make SPV resolution contract-specific**

Change:

```ts
async function resolveSpvId(spvCodeOrId: string | null | undefined): Promise<string | null>
```

to:

```ts
async function resolveSpvId(spvCodeOrId: string | null | undefined, contractId: string): Promise<string | null>
```

Query:

```ts
const spv = await prisma.sPV.findFirst({
  where: {
    contractId,
    OR: [{ id: spvCodeOrId }, { code: spvCodeOrId }],
  },
});
```

- [ ] **Step 5: Make rate tiers contract-specific**

Change `activeRateTiers()` to accept a contract:

```ts
export async function activeRateTiers(contractId?: string | null): Promise<RateTier[]> {
  const resolvedContractId = await resolveContractId(contractId);
  const tiers = await prisma.rateTier.findMany({
    where: { contractId: resolvedContractId, isActive: true },
    orderBy: { minCapacityMW: 'asc' },
  });
  ...
}
```

When falling back to `DEFAULT_RATE_TIERS`, add `contractId: resolvedContractId` to mapped tiers.

- [ ] **Step 6: Update API routes to pass selected contract**

In each route, read:

```ts
const contractId = request.nextUrl.searchParams.get('contract');
```

Pass `contractId` into repository calls:

```ts
const sitesWithCalcs = await listSites({ search, spvCode, contractStatus, sortBy, sortOrder, contractId });
```

For POST/PUT routes, accept `contractId` from query string first and request body second.

- [ ] **Step 7: Run verification**

Run:

```bash
npm test
npm run lint
```

Expected: all tests pass, lint passes, and TypeScript catches no missing `contractId` fields.

---

## Task 3: Add Contract Listing API And UI Selector

**Files:**
- Create: `src/app/api/contracts/route.ts`
- Create: `src/components/contracts/ContractSelector.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/Header.tsx` if selector fits better there
- Modify: `src/lib/navigation.ts`

- [ ] **Step 1: Add contracts API**

Create `src/app/api/contracts/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { listContracts } from '@/lib/contracts';

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listContracts() });
  } catch (error) {
    console.error('Error listing contracts:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list contracts' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Add selector component**

Create `src/components/contracts/ContractSelector.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { Contract } from '@/types';

export function ContractSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const selected = searchParams.get('contract') || '';

  useEffect(() => {
    fetch('/api/contracts')
      .then((response) => response.json())
      .then((body) => setContracts(body.success ? body.data : []))
      .catch(() => setContracts([]));
  }, []);

  const value = useMemo(() => {
    if (selected) return selected;
    return contracts.find((contract) => contract.isDefault)?.id || contracts[0]?.id || '';
  }, [contracts, selected]);

  function changeContract(contractId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('contract', contractId);
    router.push(`${pathname}?${next.toString()}`);
  }

  if (contracts.length <= 1) return null;

  return (
    <label className="contract-selector">
      <Building2 className="h-4 w-4" />
      <select value={value} onChange={(event) => changeContract(event.target.value)} aria-label="Contract">
        {contracts.map((contract) => (
          <option key={contract.id} value={contract.id}>
            {contract.name}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 3: Render selector in the app shell**

In `Sidebar.tsx`, import and render `ContractSelector` under the logo:

```tsx
import { ContractSelector } from '@/components/contracts/ContractSelector';
```

```tsx
<ContractSelector />
```

- [ ] **Step 4: Preserve contract query in navigation**

In `Sidebar.tsx`, derive the current contract query:

```tsx
const searchParams = useSearchParams();
const contractQuery = searchParams.get('contract');
const href = contractQuery ? `${item.href}?contract=${encodeURIComponent(contractQuery)}` : item.href;
```

Use `href` in the `Link`.

- [ ] **Step 5: Add compact CSS**

In `src/app/globals.css`, add:

```css
.contract-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px 8px;
  color: var(--text-muted);
}

.contract-selector select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-primary);
  font-size: 0.875rem;
  padding: 6px 8px;
}
```

- [ ] **Step 6: Run UI verification**

Run:

```bash
npm run lint
npm run dev
```

Open the app and verify the selector appears only when more than one active contract exists.

---

## Task 4: Scope Billing Snapshots, Month Locks, And Reports

**Files:**
- Modify: `src/lib/billing-generation.ts`
- Modify: `src/lib/billing-repository.ts`
- Modify: `src/lib/spv-monthly-report.ts`
- Modify: `src/lib/spv-monthly-snapshots.ts`
- Modify: `src/app/api/admin/billing/generate/route.ts`
- Modify: `src/app/api/admin/billing/snapshots/route.ts`
- Modify: `src/app/api/admin/billing/month-controls/route.ts`
- Modify: `src/app/api/spvs/monthly/route.ts`
- Test: `src/lib/billing-generation.test.ts`, `src/lib/spv-monthly-snapshots.test.ts`, `src/lib/spv-monthly-report.test.ts`

- [ ] **Step 1: Add contract metadata to generated snapshot inputs**

In `BillingSnapshotInput`, add:

```ts
contractId: string;
contractName: string | null;
```

In `BuildBillingSnapshotInputParams`, add:

```ts
contractId: string;
contractName?: string | null;
```

Include in return value and `sourcePayload`:

```ts
contract: {
  id: params.contractId,
  name: params.contractName || null,
},
```

- [ ] **Step 2: Update billing generation tests**

In `src/lib/billing-generation.test.ts`, pass `contractId: 'contract-1'` to every `buildBillingSnapshotInput` call and assert:

```ts
expect(snapshot.contractId).toBe('contract-1');
expect(snapshot.sourcePayload).toContain('"contract":{"id":"contract-1"');
```

- [ ] **Step 3: Scope snapshot queries**

In `billing-repository.ts`, every `billingSnapshot.findMany`, `billingSnapshot.create`, `billingRun.create`, `billingMonthLock.findMany`, and `billingAdjustment.findMany` call must include the resolved `contractId`.

Example:

```ts
where: {
  contractId,
  month: selectedMonth,
}
```

- [ ] **Step 4: Ensure app-generated snapshot uniqueness remains per contract**

Because `notionPageId` includes month and site id, it remains unique enough for app-generated data. For imported Notion data, retain `@@unique([notionDatabaseId, notionPageId])` unless multiple contracts can import from the same Notion database. If that is possible, change it to `@@unique([contractId, notionDatabaseId, notionPageId])`.

- [ ] **Step 5: Scope monthly reports**

Update `getSpvMonthlyReport(month, contractId)` to:

```ts
const resolvedContractId = await resolveContractId(contractId);
const monthSnapshots = await prisma.billingSnapshot.findMany({
  where: { contractId: resolvedContractId, month: selectedMonth },
  orderBy: { billingEntry: 'asc' },
});
```

Also pass `contractId` into fallback `listSites`, `listSpvs`, and `activeRateTiers`.

- [ ] **Step 6: Run billing tests**

Run:

```bash
npm test -- src/lib/billing-generation.test.ts src/lib/spv-monthly-report.test.ts src/lib/spv-monthly-snapshots.test.ts
```

Expected: tests pass and snapshots from one contract never contribute to another contract's monthly report.

---

## Task 5: Scope Dashboard, CM Work, Imports, And Exports

**Files:**
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/app/api/cm-work/route.ts`
- Modify: `src/app/api/cm-work/[id]/review/route.ts`
- Modify: `src/lib/cm-work-repository.ts`
- Modify: `src/lib/cm-days.ts`
- Modify: `src/app/api/import/route.ts`
- Modify: `src/lib/clearsol-import.ts`
- Modify: `src/app/api/export/excel/route.ts`
- Modify: `src/lib/excel-export.ts`
- Test: `src/lib/cm-days.test.ts`, `src/lib/clearsol-import.test.ts`, `src/app/api/export/excel/route.test.ts`

- [ ] **Step 1: Scope dashboard data**

In `src/app/api/dashboard/route.ts`, read the selected contract:

```ts
const contractId = request.nextUrl.searchParams.get('contract');
```

Pass it to `listSites`, `getPortfolioSummary`, `getSpvSummaries`, `getOfficialCmUsage`, `getCmMonthlyUsage`, and `listBillingSnapshots`.

- [ ] **Step 2: Scope CM work creation and review**

In `cm-work-repository.ts`, validate that the target site belongs to the selected contract before creating CM work:

```ts
const site = await prisma.site.findFirst({ where: { id: data.siteId, contractId } });
if (!site) throw new Error('Site not found for selected contract');
```

For review by entry id, include the site relation and reject entries whose `site.contractId` does not match the selected contract.

- [ ] **Step 3: Scope CM allowance and usage queries**

Every CM aggregate must join through site and filter:

```ts
where: {
  site: { contractId },
}
```

This keeps used days, pending days, and monthly trends from crossing contracts.

- [ ] **Step 4: Scope imports**

In `src/app/api/import/route.ts`, pass selected `contractId` into `importSiteRecords`. The import parser can stay contract-agnostic; repository persistence attaches the selected contract.

- [ ] **Step 5: Scope Excel export**

In `src/app/api/export/excel/route.ts`, read `contract` and pass it to the data loaders used for export. Add an assertion to `src/app/api/export/excel/route.test.ts` that exported rows contain only the selected contract's sites.

- [ ] **Step 6: Run operational tests**

Run:

```bash
npm test -- src/lib/cm-days.test.ts src/lib/clearsol-import.test.ts src/app/api/export/excel/route.test.ts
npm test
```

Expected: CM usage, imports, exports, and dashboard summaries are contract-scoped.

---

## Task 6: Add Minimal Contract Management For Admins

**Files:**
- Create: `src/app/api/contracts/[id]/route.ts`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/lib/permissions.ts`
- Test: manual admin workflow and targeted tests if settings helpers are extracted.

- [ ] **Step 1: Add admin-only contract update endpoint**

Create `src/app/api/contracts/[id]/route.ts` with `PATCH` support for:

```ts
{
  name?: string;
  description?: string | null;
  isActive?: boolean;
  notionSummaryPageId?: string | null;
  notionBillingDatabaseId?: string | null;
}
```

Guard with existing admin permission checks.

- [ ] **Step 2: Add contract creation endpoint**

In `src/app/api/contracts/route.ts`, add `POST`:

```ts
{
  name: string;
  description?: string | null;
}
```

Create `code` using `normalizeContractCode(name)`. If there is a collision, return HTTP 409 with `Contract code already exists`.

- [ ] **Step 3: Add a settings panel**

In `src/app/settings/page.tsx`, add an Admin-only "Contracts" section that lists active contracts and supports:

- Create contract.
- Rename contract.
- Deactivate contract.
- Configure Notion summary page id.
- Configure Notion billing database id.

- [ ] **Step 4: Keep destructive behavior explicit**

Do not delete contracts in this task. Deactivation is enough and preserves historical billing snapshots.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open `/settings`, create a second contract, switch to it, and confirm dashboard/site/SPV pages are empty until data is imported or created for that contract.

---

## Task 7: Backfill Existing Data And Verify End To End

**Files:**
- Create: `prisma/backfill-default-contract.ts` or add a documented one-off script under `scripts/`
- Modify: `README.md`
- Modify: `docs/azure-production.md`

- [ ] **Step 1: Add one-off backfill script**

Create `prisma/backfill-default-contract.ts`:

```ts
import prisma from '../src/lib/prisma';
import { ensureDefaultContract } from '../src/lib/contracts';

async function main() {
  const contract = await ensureDefaultContract();

  await prisma.sPV.updateMany({ where: { contractId: { equals: null as never } }, data: { contractId: contract.id } });
  await prisma.site.updateMany({ where: { contractId: { equals: null as never } }, data: { contractId: contract.id } });
  await prisma.rateTier.updateMany({ where: { contractId: { equals: null as never } }, data: { contractId: contract.id } });
  await prisma.billingRun.updateMany({ where: { contractId: { equals: null as never } }, data: { contractId: contract.id } });
  await prisma.billingSnapshot.updateMany({ where: { contractId: { equals: null as never } }, data: { contractId: contract.id } });
  await prisma.billingMonthLock.updateMany({ where: { contractId: { equals: null as never } }, data: { contractId: contract.id } });
  await prisma.billingAdjustment.updateMany({ where: { contractId: { equals: null as never } }, data: { contractId: contract.id } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

If Prisma rejects nullable checks after schema hardening, run this script before making `contractId` required or implement it as SQL migration steps.

- [ ] **Step 2: Document migration order**

In `README.md`, add:

```md
### Multi-contract setup

Existing installations should:

1. Deploy the schema with nullable `contractId` fields.
2. Run `npx tsx prisma/backfill-default-contract.ts`.
3. Deploy the schema with required `contractId` fields and contract-scoped unique indexes.
4. Create additional contracts from `/settings`.
```

- [ ] **Step 3: End-to-end manual test**

Run:

```bash
npm run db:generate
npm run db:push
npm test
npm run lint
npm run dev
```

Verify:

- Default contract shows existing dashboard totals.
- New contract starts empty.
- Creating/importing a site under the new contract does not change the default contract dashboard.
- Rate tiers selected for one contract do not affect the other.
- Billing generation for one contract creates snapshots with that `contractId`.
- CM work logged for one contract does not appear in the other.

---

## Self-Review

- Spec coverage: The plan covers schema, data migration, contract selector, repository scoping, billing snapshots, CM workflows, imports, exports, admin management, and docs.
- Placeholder scan: No task relies on "TBD" or undefined future work; every task names concrete files and commands.
- Type consistency: The plan consistently uses `contractId`, `Contract`, `ContractOption`, and existing `billingPortfolio` as separate concepts.
