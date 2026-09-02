'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PortfolioSummary } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { DataQualityIssue } from '@/lib/data-quality';
import { Building2, Zap, PoundSterling, Calendar } from 'lucide-react';

type DashboardData = PortfolioSummary & {
  issues: DataQualityIssue[];
  issueCounts: { error: number; warning: number; info: number; total: number; fixable: number; sitesAffected: number };
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/portfolio');
      const data = await res.json();
      if (data.success) setSummary(data.data);
      else setError(data.error);
    } catch {
      setError('Failed to fetch portfolio summary');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const repair = async () => {
    setRepairing(true);
    await fetch('/api/quality', { method: 'POST' });
    await load();
    setRepairing(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Header title="Dashboard" subtitle="Portfolio Overview" />
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">{error}</div>
      </div>
    );
  }

  const counts = summary?.issueCounts;

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" subtitle="Portfolio Overview" />
      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Total Sites</CardTitle>
              <Building2 className="h-5 w-5 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary?.totalSites || 0}</div>
              <p className="text-sm text-gray-500 mt-1">{summary?.contractedSites || 0} contracted</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Total Capacity</CardTitle>
              <Zap className="h-5 w-5 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatNumber((summary?.totalCapacityKwp || 0) / 1000, 1)} MW</div>
              <p className="text-sm text-gray-500 mt-1">{formatNumber((summary?.contractedCapacityKwp || 0) / 1000, 1)} MW contracted</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Monthly Revenue</CardTitle>
              <PoundSterling className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(summary?.totalMonthlyFee || 0)}</div>
              <p className="text-sm text-gray-500 mt-1">
                {formatCurrency(summary?.totalAnnualFee || 0)} / year at {summary?.currentTier} (£{summary?.currentRatePerKwp?.toFixed(2)}/kWp)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Current Tier</CardTitle>
              <Calendar className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary?.currentTier || 'N/A'}</div>
              <p className="text-sm text-gray-500 mt-1">{formatNumber(summary?.correctiveDaysAllowed || 0, 1)} CM days / month</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            {summary?.nextTierName ? (
              <p className="text-sm text-gray-700 mb-2">
                <strong>Tier progress</strong> — {formatNumber((summary.contractedCapacityKwp || 0) / 1000, 2)} MW contracted.
                {' '}<strong>{formatNumber(summary.mwToNextTier, 2)} MW</strong> more reaches <strong>{summary.nextTierName}</strong>.
              </p>
            ) : (
              <p className="text-sm text-gray-700 mb-2">Portfolio is in the top tier ({summary?.currentTier}).</p>
            )}
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full bg-blue-600" style={{ width: `${Math.round((summary?.tierProgress || 0) * 100)}%` }} />
            </div>
          </CardContent>
        </Card>

        {counts && counts.total > 0 ? (
          <div className={`rounded-lg p-4 ${counts.error ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
            <p className="font-medium">
              Data quality: {counts.error} error(s), {counts.warning} warning(s), {counts.info} note(s) across {counts.sitesAffected} site(s).
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {summary?.issues.slice(0, 8).map((issue, i) => (
                <li key={`${issue.siteId}-${issue.code}-${i}`}>
                  <span className="font-semibold">{issue.severity}:</span> {issue.siteName || '—'} — {issue.message}
                </li>
              ))}
            </ul>
            {counts.fixable > 0 && (
              <Button className="mt-3" variant="outline" onClick={repair} disabled={repairing}>
                {repairing ? 'Repairing…' : `Repair ${counts.fixable} SPV link(s)`}
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-green-50 p-4 text-green-800 font-medium">Data quality: no issues detected.</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Capacity by SPV</CardTitle></CardHeader>
            <CardContent>
              {summary?.capacityBySpv && Object.keys(summary.capacityBySpv).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(summary.capacityBySpv)
                    .sort((a, b) => b[1] - a[1])
                    .map(([spv, kwp]) => (
                      <div key={spv} className="flex items-center justify-between gap-3">
                        <Badge variant={spv === 'Unassigned' || spv === 'XYZ' ? 'warning' : 'info'}>{spv}</Badge>
                        <div className="flex-1 h-2 rounded bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${Math.min(100, (kwp / (summary.totalCapacityKwp || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-24 text-right">{formatNumber(kwp / 1000, 2)} MW</span>
                        <span className="text-sm text-gray-500 w-16 text-right">{summary.sitesBySpv[spv]} sites</span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No sites yet. Import data or add a site to get started.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Link href="/sites" className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                <div className="font-medium">View all sites</div>
                <p className="text-sm text-gray-500">Filter, sort, export and edit</p>
              </Link>
              <Link href="/sites/new" className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                <div className="font-medium">Add a new site</div>
                <p className="text-sm text-gray-500">Validated manual entry</p>
              </Link>
              <Link href="/import" className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                <div className="font-medium">Import from Excel</div>
                <p className="text-sm text-gray-500">Preview errors before replacing data</p>
              </Link>
              <Link href="/cm-days" className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                <div className="font-medium">CM Days tracker</div>
                <p className="text-sm text-gray-500">Accrual vs usage since portfolio start</p>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
