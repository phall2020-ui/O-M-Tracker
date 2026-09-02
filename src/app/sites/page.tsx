'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { SitesTable } from '@/components/sites/SitesTable';
import { Button } from '@/components/ui/button';
import { SiteWithCalculations } from '@/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default function SitesPage() {
  const [sites, setSites] = useState<SiteWithCalculations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tierName, setTierName] = useState<string>('');
  const [contractFilter, setContractFilter] = useState('');
  const [spvFilter, setSpvFilter] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [issueIds, setIssueIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSites();
    fetch('/api/quality')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setIssueIds(new Set(d.data.issues.filter((i: { severity: string; siteId: string | null }) =>
            (i.severity === 'error' || i.severity === 'warning') && i.siteId
          ).map((i: { siteId: string }) => i.siteId)));
        }
      })
      .catch(() => undefined);
  }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/sites');
      const data = await res.json();
      
      if (data.success) {
        setSites(data.data);
        setTierName(data.currentTier?.tierName || '');
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to fetch sites');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (site: SiteWithCalculations) => {
    if (!confirm(`Are you sure you want to delete "${site.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setSites((prev) => prev.filter((s) => s.id !== site.id));
      } else {
        alert('Failed to delete site');
      }
    } catch {
      alert('Failed to delete site');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Sites" 
        subtitle={`${sites.length} sites in portfolio`}
      />
      
      <div className="flex-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Fees shown at current tier {tierName || '—'}. Click a column header to sort.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const rows = sites.map((s) => ({
                  name: s.name,
                  spv: s.spvCode,
                  sizeKwp: s.systemSizeKwp,
                  contract: s.contractStatus,
                  onboardDate: s.onboardDate,
                  monthlyFee: s.monthlyFee,
                  applicableTier: s.applicableTier,
                }));
                const header = Object.keys(rows[0] || { name: '' }).join(',');
                const csv = [header, ...rows.map((r) => Object.values(r).join(','))].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'clearsol-sites.csv';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </Button>
            <Link href="/sites/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Site
              </Button>
            </Link>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <select
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={contractFilter}
            onChange={(e) => setContractFilter(e.target.value)}
          >
            <option value="">All contracts</option>
            <option value="Yes">Contracted</option>
            <option value="No">Not contracted</option>
          </select>
          <select
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={spvFilter}
            onChange={(e) => setSpvFilter(e.target.value)}
          >
            <option value="">All SPVs</option>
            {[...new Set(sites.map((s) => s.spvCode || 'Unassigned'))].sort().map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
            Only sites with issues
          </label>
        </div>

        {error ? (
          <div className="rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        ) : (
          <SitesTable
            data={sites.filter((s) => {
              if (contractFilter && s.contractStatus !== contractFilter) return false;
              if (spvFilter && (s.spvCode || 'Unassigned') !== spvFilter) return false;
              if (onlyIssues && !issueIds.has(s.id)) return false;
              return true;
            })}
            isLoading={isLoading}
            onDelete={handleDelete}
            issueSiteIds={issueIds}
            currentTierName={tierName}
          />
        )}
      </div>
    </div>
  );
}
