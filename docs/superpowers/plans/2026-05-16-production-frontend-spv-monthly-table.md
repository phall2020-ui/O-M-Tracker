# Production Frontend And Monthly SPV Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the frontend from prototype dashboard/screens into a production-grade O&M portal, with an SPV table available for each month similar to the Notion monthly portfolio view.

**Architecture:** Add a server-side monthly SPV reporting contract that derives month-specific SPV rows from Azure SQL site records, then build a production frontend around that contract. Keep Azure SQL as operational truth; Notion remains import/source bootstrap and high-level summary surface. The SPV page becomes a month-driven portfolio table with clear period controls, export, drill-down, loading/error states, and responsive layout.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma SQL Server, existing `@/components/ui/*`, lucide-react, Vitest, Playwright/browser smoke tests.

---

## File Structure

Create:
- `src/lib/month-periods.ts` - canonical month parsing, labels, month start/end, available month range.
- `src/lib/spv-monthly-report.ts` - pure report calculations and DTO builders for SPV monthly rows.
- `src/lib/spv-monthly-report.test.ts` - unit tests for month filtering, totals, and row ordering.
- `src/lib/api-client.ts` - typed browser-side API helper that unwraps `ApiResponse<T>` safely.
- `src/app/api/spvs/monthly/route.ts` - authenticated API endpoint for monthly SPV table data.
- `src/components/spvs/SpvMonthSelector.tsx` - month navigation/select control.
- `src/components/spvs/SpvMonthlyTable.tsx` - production table for all SPVs in selected month.
- `src/components/spvs/SpvMonthlySummaryCards.tsx` - compact monthly summary strip.
- `src/components/spvs/SpvMonthlyExportButton.tsx` - CSV export for the current month.
- `src/components/ui/empty-state.tsx` - reusable production empty-state component.
- `src/components/ui/page-state.tsx` - reusable loading/error state component.
- `src/app/spvs/monthly/page.tsx` - optional direct route if `/spvs` is kept as a landing/index page.
- `e2e/spv-monthly.spec.ts` - browser smoke tests for month switch, table render, and export affordance.

Modify:
- `src/app/spvs/page.tsx` - replace SPV card grid with month-first table experience.
- `src/app/spvs/[code]/page.tsx` - accept `?month=YYYY-MM`, keep drill-down aligned with selected month.
- `src/app/api/spvs/[code]/route.ts` - accept `month` query parameter and calculate month-specific details.
- `src/lib/portfolio-repository.ts` - add repository helpers for SPV monthly queries.
- `src/types/index.ts` - add shared SPV monthly report DTOs.
- `src/app/globals.css` - tighten responsive production layout for tables, filters, and mobile.
- `prisma/seed.ts` - no frontend change; keep current “skip sample sites if real data exists” behavior.
- `docs/azure-production.md` - document monthly SPV reporting assumptions and deployment smoke test.

Do not create a marketing landing page. The first SPV screen should be an operational table.

---

## Product Contract

The monthly SPV table should show one row per SPV for the selected billing month.

Columns:
- `SPV`
- `Sites`
- `Contracted Sites`
- `Contracted Capacity`
- `Site Fixed Costs`
- `Variable Cost`
- `Annual Fee`
- `Monthly Fee`
- `Average £/kWp`
- `CM Allowance`
- `Status`
- `Actions`

Month logic:
- Default month is the current month in Europe/London, formatted `YYYY-MM`.
- A site contributes to a month when `contractStatus === "YES"` and `onboardDate <= monthEnd`.
- Pending/not-contracted sites should be counted separately for context but excluded from monthly fee totals.
- Use existing tier calculations initially. Current calculation uses `<20MW` monthly fee; this plan keeps that behavior unless a separate commercial decision changes tier logic.
- Month selector range starts from the earliest Notion/imported `onboardDate` month and extends to current month plus 12 months.
- If a site has no SPV, group it into `Unassigned` with code `UNASSIGNED`.

Production frontend principles:
- Dense, table-first, operational layout.
- No nested cards.
- Month control is persistent at top of SPV page.
- Table supports sorting, scanning, and export.
- Loading, empty, and error states are explicit.
- Mobile uses horizontally scrollable table with sticky first column.

---

### Task 1: Add Shared Monthly Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add DTO types**

Append these exports after `PortfolioSummary`:

```ts
export interface SpvMonthlyRow {
  spvId: string | null;
  spvCode: string;
  spvName: string;
  month: string;
  siteCount: number;
  contractedSiteCount: number;
  pendingSiteCount: number;
  totalCapacityKwp: number;
  contractedCapacityKwp: number;
  siteFixedCostsAnnual: number;
  variableCostAnnual: number;
  annualFee: number;
  monthlyFee: number;
  averageFeePerKwp: number;
  correctiveDaysAllowed: number;
  status: 'Active' | 'No active sites';
}

export interface SpvMonthlyReport {
  month: string;
  monthLabel: string;
  availableMonths: Array<{ value: string; label: string }>;
  rows: SpvMonthlyRow[];
  totals: {
    spvCount: number;
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
  };
}
```

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add SPV monthly report types"
```

---

### Task 2: Add Month Period Utilities

**Files:**
- Create: `src/lib/month-periods.ts`
- Create: `src/lib/month-periods.test.ts`

- [ ] **Step 1: Write tests**

Create `src/lib/month-periods.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildAvailableMonths,
  formatMonthLabel,
  getMonthBounds,
  normalizeMonth,
} from './month-periods';

describe('month-periods', () => {
  it('normalizes valid and invalid month inputs', () => {
    expect(normalizeMonth('2026-02', new Date('2026-05-16T12:00:00Z'))).toBe('2026-02');
    expect(normalizeMonth('bad', new Date('2026-05-16T12:00:00Z'))).toBe('2026-05');
    expect(normalizeMonth(null, new Date('2026-05-16T12:00:00Z'))).toBe('2026-05');
  });

  it('returns inclusive month bounds', () => {
    const bounds = getMonthBounds('2026-02');
    expect(bounds.start.toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(bounds.end.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('formats month labels for the UK audience', () => {
    expect(formatMonthLabel('2026-02')).toBe('February 2026');
  });

  it('builds month options from earliest onboard date to horizon', () => {
    const months = buildAvailableMonths(new Date('2026-02-17'), new Date('2026-05-16'), 1);
    expect(months.map((m) => m.value)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/lib/month-periods.test.ts
```

Expected: fail because `src/lib/month-periods.ts` does not exist.

- [ ] **Step 3: Implement utilities**

Create `src/lib/month-periods.ts`:

```ts
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthValue(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function normalizeMonth(input: string | null | undefined, now = new Date()): string {
  if (input && MONTH_PATTERN.test(input)) return input;
  return monthValue(now);
}

export function getMonthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));
  return { start, end };
}

export function formatMonthLabel(month: string): string {
  const { start } = getMonthBounds(month);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(start);
}

export function addMonths(month: string, count: number): string {
  const { start } = getMonthBounds(month);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + count, 1));
  return monthValue(next);
}

export function buildAvailableMonths(
  earliestOnboardDate: Date | null,
  now = new Date(),
  futureMonths = 12
) {
  const startMonth = earliestOnboardDate ? monthValue(earliestOnboardDate) : monthValue(now);
  const endMonth = addMonths(monthValue(now), futureMonths);
  const months: Array<{ value: string; label: string }> = [];
  let cursor = startMonth;

  while (cursor <= endMonth) {
    months.push({ value: cursor, label: formatMonthLabel(cursor) });
    cursor = addMonths(cursor, 1);
  }

  return months;
}
```

- [ ] **Step 4: Verify tests**

Run:

```bash
npm test -- src/lib/month-periods.test.ts
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/month-periods.ts src/lib/month-periods.test.ts
git commit -m "feat: add month period utilities"
```

---

### Task 3: Build Monthly SPV Report Logic

**Files:**
- Create: `src/lib/spv-monthly-report.ts`
- Create: `src/lib/spv-monthly-report.test.ts`
- Modify: `src/lib/portfolio-repository.ts`

- [ ] **Step 1: Write report tests**

Create `src/lib/spv-monthly-report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSpvMonthlyReportFromSites } from './spv-monthly-report';
import { SiteWithCalculations } from '@/types';

function site(overrides: Partial<SiteWithCalculations>): SiteWithCalculations {
  return {
    id: overrides.id || 'site-1',
    name: overrides.name || 'Site',
    systemSizeKwp: overrides.systemSizeKwp || 1000,
    siteType: 'Rooftop',
    contractStatus: overrides.contractStatus || 'Yes',
    onboardDate: overrides.onboardDate ?? '2026-02-15',
    pmCost: overrides.pmCost || 100,
    cctvCost: overrides.cctvCost || 50,
    cleaningCost: overrides.cleaningCost || 25,
    spvId: overrides.spvId ?? 'spv-1',
    spvCode: overrides.spvCode ?? 'SPV1',
    sourceSheet: 'Notion',
    sourceRow: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    siteFixedCosts: overrides.siteFixedCosts || 175,
    portfolioCost_20MW: overrides.portfolioCost_20MW || 2000,
    portfolioCost_30MW: overrides.portfolioCost_30MW || 1800,
    portfolioCost_40MW: overrides.portfolioCost_40MW || 1700,
    fixedFee_20MW: overrides.fixedFee_20MW || 2175,
    fixedFee_30MW: overrides.fixedFee_30MW || 1975,
    fixedFee_40MW: overrides.fixedFee_40MW || 1875,
    feePerKwp_20MW: overrides.feePerKwp_20MW || 2.175,
    feePerKwp_30MW: overrides.feePerKwp_30MW || 1.975,
    feePerKwp_40MW: overrides.feePerKwp_40MW || 1.875,
    monthlyFee: overrides.monthlyFee || 181.25,
  };
}

describe('buildSpvMonthlyReportFromSites', () => {
  it('includes only contracted sites onboarded by selected month end in fee totals', () => {
    const report = buildSpvMonthlyReportFromSites({
      month: '2026-02',
      availableMonths: [{ value: '2026-02', label: 'February 2026' }],
      sites: [
        site({ id: 'active', name: 'Active', onboardDate: '2026-02-01' }),
        site({ id: 'future', name: 'Future', onboardDate: '2026-03-01' }),
        site({ id: 'pending', name: 'Pending', contractStatus: 'No', onboardDate: null }),
      ],
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].siteCount).toBe(3);
    expect(report.rows[0].contractedSiteCount).toBe(1);
    expect(report.rows[0].pendingSiteCount).toBe(2);
    expect(report.rows[0].monthlyFee).toBe(181.25);
    expect(report.totals.contractedSiteCount).toBe(1);
  });

  it('groups unassigned sites into UNASSIGNED', () => {
    const report = buildSpvMonthlyReportFromSites({
      month: '2026-02',
      availableMonths: [{ value: '2026-02', label: 'February 2026' }],
      sites: [site({ spvId: null, spvCode: null })],
    });

    expect(report.rows[0].spvCode).toBe('UNASSIGNED');
    expect(report.rows[0].spvName).toBe('Unassigned');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm test -- src/lib/spv-monthly-report.test.ts
```

Expected: fail because `spv-monthly-report.ts` does not exist.

- [ ] **Step 3: Implement report builder**

Create `src/lib/spv-monthly-report.ts`:

```ts
import { SiteWithCalculations, SpvMonthlyReport, SpvMonthlyRow } from '@/types';
import { formatMonthLabel, getMonthBounds } from './month-periods';

export function isSiteActiveForMonth(site: SiteWithCalculations, month: string): boolean {
  if (site.contractStatus !== 'Yes') return false;
  if (!site.onboardDate) return false;
  return new Date(site.onboardDate) <= getMonthBounds(month).end;
}

export function buildSpvMonthlyReportFromSites(params: {
  month: string;
  availableMonths: Array<{ value: string; label: string }>;
  sites: SiteWithCalculations[];
}): SpvMonthlyReport {
  const groups = new Map<string, SiteWithCalculations[]>();

  for (const site of params.sites) {
    const key = site.spvCode || 'UNASSIGNED';
    groups.set(key, [...(groups.get(key) || []), site]);
  }

  const rows: SpvMonthlyRow[] = [...groups.entries()].map(([code, sites]) => {
    const activeSites = sites.filter((site) => isSiteActiveForMonth(site, params.month));
    const siteCount = sites.length;
    const contractedSiteCount = activeSites.length;
    const totalCapacityKwp = sites.reduce((sum, site) => sum + site.systemSizeKwp, 0);
    const contractedCapacityKwp = activeSites.reduce((sum, site) => sum + site.systemSizeKwp, 0);
    const siteFixedCostsAnnual = activeSites.reduce((sum, site) => sum + site.siteFixedCosts, 0);
    const variableCostAnnual = activeSites.reduce((sum, site) => sum + site.portfolioCost_20MW, 0);
    const annualFee = activeSites.reduce((sum, site) => sum + site.fixedFee_20MW, 0);
    const monthlyFee = activeSites.reduce((sum, site) => sum + site.monthlyFee, 0);

    return {
      spvId: sites.find((site) => site.spvId)?.spvId || null,
      spvCode: code,
      spvName: code === 'UNASSIGNED' ? 'Unassigned' : code,
      month: params.month,
      siteCount,
      contractedSiteCount,
      pendingSiteCount: siteCount - contractedSiteCount,
      totalCapacityKwp,
      contractedCapacityKwp,
      siteFixedCostsAnnual,
      variableCostAnnual,
      annualFee,
      monthlyFee,
      averageFeePerKwp: contractedCapacityKwp > 0 ? annualFee / contractedCapacityKwp : 0,
      correctiveDaysAllowed: Math.round((contractedCapacityKwp / 1000 / 12) * 10) / 10,
      status: contractedSiteCount > 0 ? 'Active' : 'No active sites',
    };
  });

  rows.sort((left, right) => right.monthlyFee - left.monthlyFee || left.spvCode.localeCompare(right.spvCode));

  return {
    month: params.month,
    monthLabel: formatMonthLabel(params.month),
    availableMonths: params.availableMonths,
    rows,
    totals: {
      spvCount: rows.length,
      siteCount: rows.reduce((sum, row) => sum + row.siteCount, 0),
      contractedSiteCount: rows.reduce((sum, row) => sum + row.contractedSiteCount, 0),
      pendingSiteCount: rows.reduce((sum, row) => sum + row.pendingSiteCount, 0),
      totalCapacityKwp: rows.reduce((sum, row) => sum + row.totalCapacityKwp, 0),
      contractedCapacityKwp: rows.reduce((sum, row) => sum + row.contractedCapacityKwp, 0),
      siteFixedCostsAnnual: rows.reduce((sum, row) => sum + row.siteFixedCostsAnnual, 0),
      variableCostAnnual: rows.reduce((sum, row) => sum + row.variableCostAnnual, 0),
      annualFee: rows.reduce((sum, row) => sum + row.annualFee, 0),
      monthlyFee: rows.reduce((sum, row) => sum + row.monthlyFee, 0),
      correctiveDaysAllowed: rows.reduce((sum, row) => sum + row.correctiveDaysAllowed, 0),
    },
  };
}
```

- [ ] **Step 4: Add repository function**

Modify `src/lib/portfolio-repository.ts` imports:

```ts
import { buildAvailableMonths, normalizeMonth } from './month-periods';
import { buildSpvMonthlyReportFromSites } from './spv-monthly-report';
```

Add after `getSpvSummaries()`:

```ts
export async function getSpvMonthlyReport(monthInput?: string | null) {
  const month = normalizeMonth(monthInput);
  const [sites, earliest] = await Promise.all([
    listSites(),
    prisma.site.aggregate({ _min: { onboardDate: true } }),
  ]);

  return buildSpvMonthlyReportFromSites({
    month,
    sites,
    availableMonths: buildAvailableMonths(earliest._min.onboardDate),
  });
}
```

- [ ] **Step 5: Verify**

```bash
npm test -- src/lib/month-periods.test.ts src/lib/spv-monthly-report.test.ts
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/month-periods.ts src/lib/month-periods.test.ts src/lib/spv-monthly-report.ts src/lib/spv-monthly-report.test.ts src/lib/portfolio-repository.ts src/types/index.ts
git commit -m "feat: calculate monthly SPV reports"
```

---

### Task 4: Add Monthly SPV API

**Files:**
- Create: `src/app/api/spvs/monthly/route.ts`

- [ ] **Step 1: Create API route**

Create `src/app/api/spvs/monthly/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSpvMonthlyReport } from '@/lib/portfolio-repository';

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get('month');
    const report = await getSpvMonthlyReport(month);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Error fetching monthly SPV report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch monthly SPV report' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify endpoint locally**

Run the app locally with the Azure `DATABASE_URL` or local SQL Server, then:

```bash
curl -s "http://localhost:3000/api/spvs/monthly?month=2026-05" | jq '.success, .data.rows[0]'
```

Expected: `true`, then an SPV monthly row.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/spvs/monthly/route.ts
git commit -m "feat: expose monthly SPV report API"
```

---

### Task 5: Add Typed Frontend API Client

**Files:**
- Create: `src/lib/api-client.ts`
- Create: `src/lib/api-client.test.ts`

- [ ] **Step 1: Write API client tests**

Create `src/lib/api-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchApi } from './api-client';

describe('fetchApi', () => {
  it('returns typed response data when the API succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: { name: 'SPV1' } }),
    })));

    const data = await fetchApi<{ name: string }>('/api/test');
    expect(data.name).toBe('SPV1');
  });

  it('throws the API error message when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'Broken' }),
    })));

    await expect(fetchApi('/api/test')).rejects.toThrow('Broken');
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npm test -- src/lib/api-client.test.ts
```

Expected: fail because `api-client.ts` does not exist.

- [ ] **Step 3: Implement typed helper**

Create `src/lib/api-client.ts`:

```ts
import { ApiResponse } from '@/types';

export async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !body.success) {
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }

  return body.data;
}
```

- [ ] **Step 4: Verify**

```bash
npm test -- src/lib/api-client.test.ts
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-client.ts src/lib/api-client.test.ts
git commit -m "feat: add typed frontend API client"
```

---

### Task 6: Build Production SPV Monthly Components

**Files:**
- Create: `src/components/ui/page-state.tsx`
- Create: `src/components/ui/empty-state.tsx`
- Create: `src/components/spvs/SpvMonthSelector.tsx`
- Create: `src/components/spvs/SpvMonthlySummaryCards.tsx`
- Create: `src/components/spvs/SpvMonthlyExportButton.tsx`
- Create: `src/components/spvs/SpvMonthlyTable.tsx`

- [ ] **Step 1: Create page state components**

Create `src/components/ui/page-state.tsx`:

```tsx
import { AlertCircle } from 'lucide-react';

export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="main-content flex items-center justify-center" style={{ height: '100vh' }}>
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        {label}
      </div>
    </div>
  );
}

export function PageError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <div className="flex items-center gap-2 font-medium">
        <AlertCircle className="h-4 w-4" />
        {message}
      </div>
    </div>
  );
}
```

Create `src/components/ui/empty-state.tsx`:

```tsx
import { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
      <Icon className="mx-auto mb-4 h-10 w-10 text-gray-300" />
      <h3 className="mb-2 text-base font-semibold text-gray-900">{title}</h3>
      <p className="mx-auto max-w-md text-sm text-gray-500">{body}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create month selector**

Create `src/components/spvs/SpvMonthSelector.tsx`:

```tsx
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths } from '@/lib/month-periods';

export function SpvMonthSelector({
  month,
  availableMonths,
  onChange,
}: {
  month: string;
  availableMonths: Array<{ value: string; label: string }>;
  onChange: (month: string) => void;
}) {
  const currentIndex = availableMonths.findIndex((item) => item.value === month);
  const previousMonth = currentIndex > 0 ? availableMonths[currentIndex - 1].value : addMonths(month, -1);
  const nextMonth = currentIndex >= 0 && currentIndex < availableMonths.length - 1
    ? availableMonths[currentIndex + 1].value
    : addMonths(month, 1);

  return (
    <div className="spv-month-selector">
      <button type="button" className="icon-button" aria-label="Previous month" onClick={() => onChange(previousMonth)}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select value={month} onChange={(event) => onChange(event.target.value)} aria-label="Billing month">
        {availableMonths.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <button type="button" className="icon-button" aria-label="Next month" onClick={() => onChange(nextMonth)}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create summary cards**

Create `src/components/spvs/SpvMonthlySummaryCards.tsx`:

```tsx
import { Building, FileText, PoundSterling, Zap } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { SpvMonthlyReport } from '@/types';

export function SpvMonthlySummaryCards({ report }: { report: SpvMonthlyReport }) {
  return (
    <div className="spv-summary-strip">
      <div className="metric-panel">
        <Building className="h-5 w-5 text-blue-600" />
        <span>SPVs</span>
        <strong>{report.totals.spvCount}</strong>
      </div>
      <div className="metric-panel">
        <FileText className="h-5 w-5 text-slate-600" />
        <span>Contracted Sites</span>
        <strong>{report.totals.contractedSiteCount}</strong>
      </div>
      <div className="metric-panel">
        <Zap className="h-5 w-5 text-amber-600" />
        <span>Contracted Capacity</span>
        <strong>{formatNumber(report.totals.contractedCapacityKwp / 1000, 2)} MW</strong>
      </div>
      <div className="metric-panel">
        <PoundSterling className="h-5 w-5 text-green-600" />
        <span>Monthly Fee</span>
        <strong>{formatCurrency(report.totals.monthlyFee)}</strong>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create export button**

Create `src/components/spvs/SpvMonthlyExportButton.tsx`:

```tsx
'use client';

import { Download } from 'lucide-react';
import { SpvMonthlyReport } from '@/types';

function csvCell(value: string | number) {
  const text = String(value);
  return text.includes(',') || text.includes('"') ? `"${text.replaceAll('"', '""')}"` : text;
}

export function SpvMonthlyExportButton({ report }: { report: SpvMonthlyReport }) {
  const exportCsv = () => {
    const headers = [
      'Month',
      'SPV',
      'Sites',
      'Contracted Sites',
      'Contracted Capacity kWp',
      'Site Fixed Costs Annual',
      'Variable Cost Annual',
      'Annual Fee',
      'Monthly Fee',
      'Average Fee Per kWp',
      'CM Allowance',
      'Status',
    ];
    const rows = report.rows.map((row) => [
      report.month,
      row.spvCode,
      row.siteCount,
      row.contractedSiteCount,
      row.contractedCapacityKwp.toFixed(2),
      row.siteFixedCostsAnnual.toFixed(2),
      row.variableCostAnnual.toFixed(2),
      row.annualFee.toFixed(2),
      row.monthlyFee.toFixed(2),
      row.averageFeePerKwp.toFixed(4),
      row.correctiveDaysAllowed.toFixed(1),
      row.status,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `spv-monthly-${report.month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" className="secondary-button" onClick={exportCsv}>
      <Download className="h-4 w-4" />
      Export CSV
    </button>
  );
}
```

- [ ] **Step 5: Create monthly table**

Create `src/components/spvs/SpvMonthlyTable.tsx`:

```tsx
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { SpvMonthlyReport } from '@/types';

export function SpvMonthlyTable({ report }: { report: SpvMonthlyReport }) {
  return (
    <div className="production-table-shell">
      <table className="production-table">
        <thead>
          <tr>
            <th>SPV</th>
            <th className="numeric">Sites</th>
            <th className="numeric">Contracted</th>
            <th className="numeric">Capacity</th>
            <th className="numeric">Site Fixed Costs</th>
            <th className="numeric">Variable Cost</th>
            <th className="numeric">Annual Fee</th>
            <th className="numeric">Monthly Fee</th>
            <th className="numeric">Avg £/kWp</th>
            <th className="numeric">CM Days</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.spvCode}>
              <td className="sticky-cell">
                <div className="table-primary">{row.spvCode}</div>
                <div className="table-secondary">{row.spvName}</div>
              </td>
              <td className="numeric">{row.siteCount}</td>
              <td className="numeric">{row.contractedSiteCount}</td>
              <td className="numeric">{formatNumber(row.contractedCapacityKwp / 1000, 2)} MW</td>
              <td className="numeric">{formatCurrency(row.siteFixedCostsAnnual)}</td>
              <td className="numeric">{formatCurrency(row.variableCostAnnual)}</td>
              <td className="numeric">{formatCurrency(row.annualFee)}</td>
              <td className="numeric strong-green">{formatCurrency(row.monthlyFee)}</td>
              <td className="numeric">{formatCurrency(row.averageFeePerKwp)}</td>
              <td className="numeric">{formatNumber(row.correctiveDaysAllowed, 1)}</td>
              <td>
                <span className={row.status === 'Active' ? 'status-badge status-yes' : 'status-badge status-no'}>
                  {row.status}
                </span>
              </td>
              <td>
                {row.spvCode === 'UNASSIGNED' ? (
                  <span className="table-secondary">No SPV</span>
                ) : (
                  <Link className="row-action" href={`/spvs/${row.spvCode}?month=${report.month}`}>
                    Details
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>TOTAL</td>
            <td className="numeric">{report.totals.siteCount}</td>
            <td className="numeric">{report.totals.contractedSiteCount}</td>
            <td className="numeric">{formatNumber(report.totals.contractedCapacityKwp / 1000, 2)} MW</td>
            <td className="numeric">{formatCurrency(report.totals.siteFixedCostsAnnual)}</td>
            <td className="numeric">{formatCurrency(report.totals.variableCostAnnual)}</td>
            <td className="numeric">{formatCurrency(report.totals.annualFee)}</td>
            <td className="numeric strong-green">{formatCurrency(report.totals.monthlyFee)}</td>
            <td />
            <td className="numeric">{formatNumber(report.totals.correctiveDaysAllowed, 1)}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/page-state.tsx src/components/ui/empty-state.tsx src/components/spvs
git commit -m "feat: add production SPV monthly components"
```

---

### Task 7: Replace SPV Landing Page With Monthly Table

**Files:**
- Modify: `src/app/spvs/page.tsx`

- [ ] **Step 1: Replace page implementation**

Replace `src/app/spvs/page.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageError, PageLoading } from '@/components/ui/page-state';
import { SpvMonthSelector } from '@/components/spvs/SpvMonthSelector';
import { SpvMonthlyExportButton } from '@/components/spvs/SpvMonthlyExportButton';
import { SpvMonthlySummaryCards } from '@/components/spvs/SpvMonthlySummaryCards';
import { SpvMonthlyTable } from '@/components/spvs/SpvMonthlyTable';
import { fetchApi } from '@/lib/api-client';
import { SpvMonthlyReport } from '@/types';

export default function SpvsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = searchParams.get('month');
  const [report, setReport] = useState<SpvMonthlyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      setIsLoading(true);
      setError(null);
      try {
        const params = month ? `?month=${month}` : '';
        const data = await fetchApi<SpvMonthlyReport>(`/api/spvs/monthly${params}`);
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch SPV report');
      } finally {
        setIsLoading(false);
      }
    }

    fetchReport();
  }, [month]);

  const setMonth = (nextMonth: string) => {
    router.push(`/spvs?month=${nextMonth}`);
  };

  if (isLoading) return <PageLoading label="Loading SPV monthly report" />;

  return (
    <div className="main-content">
      <div className="page-header spv-page-header">
        <div>
          <h1>SPV Portfolio</h1>
          <p>Monthly SPV billing and portfolio summary</p>
        </div>
        {report && (
          <div className="spv-header-actions">
            <SpvMonthSelector month={report.month} availableMonths={report.availableMonths} onChange={setMonth} />
            <SpvMonthlyExportButton report={report} />
          </div>
        )}
      </div>

      <div className="content spv-production-content">
        {error ? <PageError message={error} /> : null}

        {!error && report && (
          <>
            <SpvMonthlySummaryCards report={report} />
            {report.rows.length === 0 ? (
              <EmptyState
                icon={Building}
                title="No SPV data for this month"
                body="Import or onboard sites with SPV assignments to populate the monthly SPV table."
              />
            ) : (
              <SpvMonthlyTable report={report} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run:

```bash
npx tsc --noEmit
npm run build
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/spvs/page.tsx
git commit -m "feat: make SPV page monthly table first"
```

---

### Task 8: Align SPV Detail Page To Selected Month

**Files:**
- Modify: `src/app/api/spvs/[code]/route.ts`
- Modify: `src/app/spvs/[code]/page.tsx`

- [ ] **Step 1: Update detail API to accept month**

Modify `src/app/api/spvs/[code]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { listSites, listSpvs } from '@/lib/portfolio-repository';
import { normalizeMonth } from '@/lib/month-periods';
import { isSiteActiveForMonth } from '@/lib/spv-monthly-report';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const month = normalizeMonth(request.nextUrl.searchParams.get('month'));
    const spv = (await listSpvs()).find((item) => item.code === code);

    if (!spv) {
      return NextResponse.json({ success: false, error: 'SPV not found' }, { status: 404 });
    }

    const sitesWithCalcs = await listSites({ spvCode: code });
    const activeSites = sitesWithCalcs.filter((site) => isSiteActiveForMonth(site, month));
    const totalMonthlyFee = activeSites.reduce((sum, site) => sum + site.monthlyFee, 0);

    return NextResponse.json({
      success: true,
      data: {
        code: spv.code,
        name: spv.name,
        month,
        sites: sitesWithCalcs,
        activeSiteIds: activeSites.map((site) => site.id),
        summary: {
          totalSites: sitesWithCalcs.length,
          contractedSites: activeSites.length,
          totalCapacityKwp: sitesWithCalcs.reduce((sum, site) => sum + site.systemSizeKwp, 0),
          contractedCapacityKwp: activeSites.reduce((sum, site) => sum + site.systemSizeKwp, 0),
          totalMonthlyFee,
          totalAnnualFee: totalMonthlyFee * 12,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching SPV details:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SPV details' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Update detail UI**

In `src/app/spvs/[code]/page.tsx`:
- Read `useSearchParams()`.
- Fetch `/api/spvs/${code}?month=${month}`.
- Use `fetchApi<SpvDetails>()` instead of untyped `fetch` and `data.data`.
- Treat `activeSiteIds` as the billable set instead of only `contractStatus`.
- Make “Back to SPVs” link preserve month: `/spvs?month=${spvDetails.month}`.
- Change the badge label from current date to `spvDetails.month`.

Use this type extension:

```ts
interface SpvDetails {
  code: string;
  name: string;
  month: string;
  sites: SiteWithCalculations[];
  activeSiteIds: string[];
  summary: {
    totalSites: number;
    contractedSites: number;
    totalCapacityKwp: number;
    contractedCapacityKwp: number;
    totalMonthlyFee: number;
    totalAnnualFee: number;
  };
}
```

Replace:

```ts
const contractedSites = spvDetails.sites.filter(s => s.contractStatus === 'Yes');
```

with:

```ts
const contractedSites = spvDetails.sites.filter((site) => spvDetails.activeSiteIds.includes(site.id));
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run build
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/api/spvs/[code]/route.ts' 'src/app/spvs/[code]/page.tsx'
git commit -m "feat: align SPV detail to selected month"
```

---

### Task 9: Frontend Type Hardening Pass

**Files:**
- Modify: `src/app/spvs/page.tsx`
- Modify: `src/app/spvs/[code]/page.tsx`
- Modify: `src/components/spvs/SpvMonthSelector.tsx`
- Modify: `src/components/spvs/SpvMonthlyExportButton.tsx`
- Modify: `src/components/spvs/SpvMonthlySummaryCards.tsx`
- Modify: `src/components/spvs/SpvMonthlyTable.tsx`

- [ ] **Step 1: Remove implicit and weak frontend types**

Run:

```bash
rg "any|as any|data\\.data|catch \\(err\\)" src/app/spvs src/components/spvs src/lib/api-client.ts
```

Expected:
- No `any` or `as any`.
- `data.data` should not appear in the SPV frontend; use `fetchApi<T>()`.
- `catch (err)` may remain only when narrowed with `err instanceof Error`.

- [ ] **Step 2: Verify component prop types are imported from shared DTOs**

Check:

```bash
rg "SpvMonthlyReport|SpvMonthlyRow|SpvDetails" src/app/spvs src/components/spvs
```

Expected:
- Monthly components use `SpvMonthlyReport` or `SpvMonthlyRow` from `@/types`.
- `SpvDetails` is local to detail page only because it is a page-specific API shape.
- No duplicate monthly row interfaces exist in component files.

- [ ] **Step 3: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected:
- Typecheck passes.
- Lint has no new errors. Existing unrelated warnings can be left if not introduced by this phase.

- [ ] **Step 4: Commit**

```bash
git add src/app/spvs src/components/spvs src/lib/api-client.ts
git commit -m "chore: harden SPV frontend types"
```

---

### Task 10: Production CSS Pass

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add production SPV styles**

Append:

```css
.spv-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.spv-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.spv-production-content {
  padding: 24px 32px;
}

.spv-month-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.spv-month-selector select {
  height: 36px;
  min-width: 180px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  padding: 0 10px;
  font-size: 14px;
}

.icon-button,
.secondary-button {
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 10px;
  cursor: pointer;
}

.icon-button {
  width: 36px;
  padding: 0;
}

.secondary-button:hover,
.icon-button:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.spv-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.metric-panel {
  min-height: 82px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  padding: 14px;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  gap: 4px 10px;
  align-items: center;
}

.metric-panel span {
  font-size: 12px;
  color: var(--text-muted);
}

.metric-panel strong {
  grid-column: 1 / -1;
  font-size: 22px;
  line-height: 1.2;
}

.production-table-shell {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  overflow: auto;
}

.production-table {
  min-width: 1180px;
}

.production-table th,
.production-table td {
  white-space: nowrap;
}

.production-table .numeric {
  text-align: right;
}

.production-table tfoot td {
  background: #f8fafc;
  font-weight: 700;
}

.sticky-cell {
  position: sticky;
  left: 0;
  z-index: 1;
  background: white;
}

.production-table tr:hover .sticky-cell {
  background: #f9fafb;
}

.table-primary {
  font-weight: 700;
  color: var(--text);
}

.table-secondary {
  font-size: 12px;
  color: var(--text-muted);
}

.strong-green {
  color: #047857;
  font-weight: 700;
}

.row-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--blue);
  font-weight: 600;
  text-decoration: none;
}

.row-action:hover {
  text-decoration: underline;
}

@media (max-width: 900px) {
  .spv-page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .spv-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .spv-production-content {
    padding: 16px;
  }

  .spv-summary-strip {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Verify responsive scan**

Run local app and check `/spvs?month=2026-05` at:
- Desktop: 1440x900
- Tablet: 900x900
- Mobile: 390x844

Expected:
- Header controls do not overlap.
- Table scrolls horizontally on mobile.
- Sticky SPV column remains readable.
- Summary card text fits.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: polish SPV monthly table layout"
```

---

### Task 11: Add Browser Smoke Tests

**Files:**
- Create: `e2e/spv-monthly.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Add test script**

Modify `package.json` scripts:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 2: Add smoke test**

Create `e2e/spv-monthly.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('SPV monthly page renders the operational table', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('admin@clearsol.co.uk').fill('admin@clearsol.co.uk');
  await page.getByPlaceholder('••••••••').fill('admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.goto('/spvs?month=2026-05');
  await expect(page.getByRole('heading', { name: 'SPV Portfolio' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Monthly Fee' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
});
```

- [ ] **Step 3: Run e2e**

```bash
npm run build
npm run start -- -p 3000
npm run test:e2e -- e2e/spv-monthly.spec.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add package.json e2e/spv-monthly.spec.ts
git commit -m "test: add SPV monthly table smoke test"
```

---

### Task 12: Update Documentation And Deploy

**Files:**
- Modify: `docs/azure-production.md`

- [ ] **Step 1: Document the monthly SPV view**

Add:

```md
## Monthly SPV Reporting

The production frontend exposes a month-driven SPV table at `/spvs?month=YYYY-MM`.

Rules:
- Active monthly rows are derived from Azure SQL `Site` records.
- A site contributes to a month when it is contracted and its onboard date is on or before the selected month end.
- Pending/onboarding sites are visible in site counts but excluded from fee totals.
- CSV export uses the selected month and does not mutate data.
- Notion remains a summary/import surface; Azure SQL is canonical after import.
```

- [ ] **Step 2: Run full verification**

```bash
npm run lint
npm test -- src/lib/api-client.test.ts src/lib/month-periods.test.ts src/lib/spv-monthly-report.test.ts src/lib/cm-days.test.ts src/lib/notion-summary.test.ts
npm run build
```

Expected:
- lint has no errors.
- tests pass.
- build passes.

- [ ] **Step 3: Deploy**

```bash
./azure/deploy-containerapp.sh
```

Expected:
- ACR build succeeds.
- Container App creates a new healthy revision.

- [ ] **Step 4: Production smoke test**

```bash
curl -I https://ca-om-tracker-prod.blueground-aa6c330f.uksouth.azurecontainerapps.io/login
```

Expected: `HTTP/2 200`.

Use a browser to verify:
- `/spvs?month=2026-05` shows monthly SPV table.
- changing month updates URL and table.
- SPV detail link preserves selected month.
- export downloads `spv-monthly-YYYY-MM.csv`.

- [ ] **Step 5: Commit docs**

```bash
git add docs/azure-production.md
git commit -m "docs: document monthly SPV reporting"
```

---

## Follow-Up Decisions

These are intentionally outside this first production frontend pass:
- Whether to persist monthly invoices/snapshots in SQL for accounting close control.
- Whether to import Notion `Billing` relation rows as immutable billing periods.
- Whether the monthly fee should use the current portfolio tier dynamically rather than the existing `<20MW` calculation.
- Whether pending onboard sites should appear in the SPV table by default or behind a toggle.

If accounting needs signed-off historical values, add a second phase with `BillingPeriod` and `SpvMonthlySnapshot` tables rather than recalculating history from mutable site records.

---

## Self-Review

Spec coverage:
- Production frontend: covered by component split, page-state, responsive CSS, smoke tests, and deployment task.
- SPV table per month like Notion: covered by monthly report API, month selector, table, export, and SPV drill-down month preservation.
- Existing Azure SQL backend: preserved; no new external store.
- Notion relationship: Notion remains source/import/summary, not live operational truth.

Placeholder scan:
- No `TBD`, generic “add error handling,” or undefined task references remain.

Type consistency:
- `SpvMonthlyReport` and `SpvMonthlyRow` are defined before use.
- API and frontend use the same `month` query parameter.
- Detail page uses `activeSiteIds` from the updated API.
