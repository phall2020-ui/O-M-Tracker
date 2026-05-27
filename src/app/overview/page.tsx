'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, HardHat, PoundSterling, Wrench, Zap } from 'lucide-react';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { formatCurrency, formatNumber } from '@/lib/calculations';

interface ContractorOverviewRow {
  id: string;
  code: string;
  name: string;
  slug: string;
  contractCount: number;
  siteCount: number;
  contractedSiteCount: number;
  totalCapacityKwp: number;
  contractedCapacityKwp: number;
  monthlyBillingAmount: number;
  pendingCmWorkCount: number;
}

interface ContractorOverview {
  totals: {
    contractorCount: number;
    contractCount: number;
    siteCount: number;
    contractedSiteCount: number;
    totalCapacityKwp: number;
    contractedCapacityKwp: number;
    monthlyBillingAmount: number;
    pendingCmWorkCount: number;
  };
  contractors: ContractorOverviewRow[];
}

export default function OverviewPage() {
  const [data, setData] = useState<ContractorOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/overview');
      const body = await response.json();
      if (!body.success) {
        setError(body.error || 'Failed to fetch contractor overview');
        return;
      }
      setData(body.data);
    } catch {
      setError('Failed to fetch contractor overview');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (isLoading) {
    return (
      <div className="main-content flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const totals = data?.totals;

  return (
    <div className="main-content">
      <div className="page-header">
        <span className="eyebrow">Contractor control</span>
        <h1>Overview</h1>
        <p>Cross-contractor portfolio and operational position</p>
      </div>

      <div className="content">
        {error && (
          <ErrorPanel
            message={error}
            detail="The cross-contractor overview could not be loaded. Retry after checking the API and database connection."
            onRetry={fetchOverview}
          />
        )}

        <div className="stats-grid">
          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Contractors</span>
              <div className="card-icon blue">
                <HardHat className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="card-value">{totals?.contractorCount || 0}</div>
            <div className="card-sub">{totals?.contractCount || 0} active contract{totals?.contractCount === 1 ? '' : 's'}</div>
          </div>

          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">Sites</span>
              <div className="card-icon amber">
                <Building2 className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <div className="card-value">{totals?.siteCount || 0}</div>
            <div className="card-sub">{totals?.contractedSiteCount || 0} contracted</div>
          </div>

          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Capacity</span>
              <div className="card-icon green">
                <Zap className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="card-value">{formatNumber((totals?.totalCapacityKwp || 0) / 1000, 1)} MW</div>
            <div className="card-sub">{formatNumber((totals?.contractedCapacityKwp || 0) / 1000, 1)} MW contracted</div>
          </div>

          <div className="card stat-card-purple">
            <div className="card-header">
              <span className="card-title">Monthly Billing</span>
              <div className="card-icon purple">
                <PoundSterling className="h-5 w-5 text-purple-600" />
              </div>
            </div>
            <div className="card-value">{formatCurrency(totals?.monthlyBillingAmount || 0)}</div>
            <div className="card-sub">{totals?.pendingCmWorkCount || 0} pending CM item{totals?.pendingCmWorkCount === 1 ? '' : 's'}</div>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">
              <HardHat className="h-5 w-5" />
              Contractor Portfolio
            </div>
          </div>
          <div className="table-container compact-mobile-table">
            <table>
              <thead>
                <tr>
                  <th>Contractor</th>
                  <th>Contracts</th>
                  <th>Sites</th>
                  <th>Contracted</th>
                  <th>Capacity</th>
                  <th>Monthly billing</th>
                  <th>Pending CM</th>
                </tr>
              </thead>
              <tbody>
                {(data?.contractors || []).map((contractor) => (
                  <tr key={contractor.id}>
                    <td>
                      <strong>{contractor.name}</strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{contractor.code}</div>
                    </td>
                    <td>{contractor.contractCount}</td>
                    <td>{contractor.siteCount}</td>
                    <td>{contractor.contractedSiteCount}</td>
                    <td>{formatNumber(contractor.totalCapacityKwp / 1000, 1)} MW</td>
                    <td>{formatCurrency(contractor.monthlyBillingAmount)}</td>
                    <td>
                      <span className={contractor.pendingCmWorkCount > 0 ? 'badge badge-amber' : 'badge badge-green'}>
                        <Wrench className="h-3 w-3" />
                        {contractor.pendingCmWorkCount}
                      </span>
                    </td>
                  </tr>
                ))}
                {data?.contractors.length === 0 && (
                  <tr>
                    <td colSpan={7}>No active contractors found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
