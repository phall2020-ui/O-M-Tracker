'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { PortfolioSummary } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { ContractedCapacityTrendChart } from '@/components/charts/ContractedCapacityTrendChart';
import { CapacityChart } from '@/components/charts/CapacityChart';
import { ContractStatusChart } from '@/components/charts/ContractStatusChart';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { Building2, Zap, PoundSterling, Calendar, TrendingUp, Award, Wrench } from 'lucide-react';
import Link from 'next/link';
import { canEditSites, useCurrentUser } from '@/lib/use-current-user';
import { canCreateCmWork, canManageImports } from '@/lib/permissions';
import { useContractQuery } from '@/lib/use-contract-query';

interface DashboardData {
  summary: PortfolioSummary;
  capacityHistory: { month: string; contractedCapacityKwp: number; contractedCapacityMw: number; sites: number }[];
  capacityBySpv: { spv: string; capacity: number; contracted: number }[];
  topSites: { id: string; name: string; spv: string; capacity: number; monthlyFee: number }[];
  siteTypeBreakdown: { rooftop: number; groundMount: number };
  contractStatus: { contracted: number; nonContracted: number };
  cmUsage?: { allowedDays: number; usedDays: number; pendingDays: number; remainingDays: number };
  cmMonthlyUsage?: Array<{
    month: string;
    monthLabel: string;
    allowedDays: number;
    usedDays: number;
    pendingDays: number;
    remainingDays: number;
    usagePercent: number;
    status: 'UNDER' | 'WARNING' | 'EXCEEDED';
  }>;
}

function DashboardContent() {
  const { user } = useCurrentUser();
  const { withContract } = useContractQuery();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(withContract('/api/dashboard'));
      const result = await res.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch {
      setError('Failed to fetch dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, [withContract]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Calculate CM Days
  const contractedCapacityMW = (data?.summary?.contractedCapacityKwp || 0) / 1000;
  const cmAllowed = data?.cmUsage?.allowedDays ?? contractedCapacityMW / 12;
  const cmUsed = data?.cmUsage?.usedDays ?? 0;
  const cmRemaining = data?.cmUsage?.remainingDays ?? Math.max(0, cmAllowed - cmUsed);
  const cmPercent = cmAllowed > 0 ? (cmUsed / cmAllowed) * 100 : 0;
  const cmHistory = data?.cmMonthlyUsage?.slice(-6) || [];
  const latestCmMonth = cmHistory[cmHistory.length - 1];
  const siteActionDescription = canEditSites(user?.role)
    ? 'Browse and manage your portfolio sites'
    : 'Browse portfolio site records';
  const cmActionDescription = canCreateCmWork(user?.role)
    ? 'Log and track corrective maintenance'
    : 'Review corrective maintenance usage';

  if (isLoading) {
    return (
      <div className="main-content flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="main-content">
      {/* Header */}
      <div className="page-header">
        <span className="eyebrow">Portfolio control</span>
        <h1>Dashboard</h1>
        <p>Portfolio Overview - {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="content">
        {/* Stats Grid */}
        {error && (
          <ErrorPanel
            message={error}
            detail="Dashboard metrics could not be loaded. Retry after checking the database/API configuration."
            onRetry={fetchDashboard}
          />
        )}
        <div className="stats-grid">
          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Total Sites</span>
              <div className="card-icon blue">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="card-value">{summary?.totalSites || 0}</div>
            <div className="card-sub">
              <span>{summary?.contractedSites || 0}</span> contracted
            </div>
          </div>

          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">Total Capacity</span>
              <div className="card-icon amber">
                <Zap className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <div className="card-value">{formatNumber((summary?.totalCapacityKwp || 0) / 1000, 1)} MW</div>
            <div className="card-sub">
              <span>{formatNumber((summary?.contractedCapacityKwp || 0) / 1000, 1)} MW</span> contracted
            </div>
          </div>

          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Monthly Revenue</span>
              <div className="card-icon green">
                <PoundSterling className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="card-value">{formatCurrency(summary?.totalMonthlyFee || 0)}</div>
            <div className="card-sub">
              <span>{formatCurrency((summary?.totalMonthlyFee || 0) * 12)}</span> annually
            </div>
          </div>

          <div className="card stat-card-purple">
            <div className="card-header">
              <span className="card-title">Current Tier</span>
              <div className="card-icon purple">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
            </div>
            <div className="card-value">{summary?.currentTier || '20-30MW'}</div>
            <div className="card-sub">
              <span>£1.80</span>/kWp rate
            </div>
          </div>
        </div>

        {/* CM Days Tracker */}
        <div className="chart-card" style={{ marginBottom: '24px' }}>
          <div className="chart-header">
            <div className="chart-title">
              <Wrench className="h-5 w-5" />
              Corrective Maintenance Days
            </div>
            <span className="badge badge-blue">{latestCmMonth?.monthLabel || 'Current month'}</span>
          </div>
          
          <div className="cm-tracker">
            <div className="cm-stat cm-stat-allowed">
              <div className="cm-stat-label">ALLOWED / MONTH</div>
              <div className="cm-stat-value">{cmAllowed.toFixed(0)}</div>
              <div className="cm-stat-unit">days</div>
            </div>
            <div className="cm-stat cm-stat-used">
              <div className="cm-stat-label">USED THIS MONTH</div>
              <div className="cm-stat-value">{cmUsed.toFixed(2)}</div>
              <div className="cm-stat-unit">days</div>
            </div>
            <div className="cm-stat cm-stat-remaining">
              <div className="cm-stat-label">REMAINING</div>
              <div className="cm-stat-value">{cmRemaining.toFixed(2)}</div>
              <div className="cm-stat-unit">days</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="progress-bar-container">
            <div className="progress-bar-header">
              <span style={{ color: 'var(--text-muted)' }}>Usage Progress</span>
              <span style={{ fontWeight: 600 }}>{cmPercent.toFixed(1)}% used</span>
            </div>
            <div className="progress-bar">
              <div 
                className={`progress-bar-fill ${cmPercent >= 100 ? 'exceeded' : cmPercent >= 80 ? 'warning' : 'under'}`}
                style={{ width: `${Math.min(cmPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Formula */}
          <div className="formula-box">
            <strong>Formula:</strong> CM Days Allowed = rounded down Contracted Capacity (MW) ÷ 12 = {contractedCapacityMW.toFixed(1)} MW ÷ 12 = {cmAllowed.toFixed(0)} days/month
          </div>
        </div>

        {/* CM Days History */}
        <div className="chart-card" style={{ marginBottom: '24px' }}>
          <div className="chart-header">
            <div className="chart-title">📊 CM Days History</div>
            <span className="badge badge-green">Last {cmHistory.length || 0} months</span>
          </div>
          <div className="table-container compact-mobile-table" style={{ marginTop: '16px' }}>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Allowed</th>
                  <th>Used</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cmHistory.map((row) => {
                  const percent = row.usagePercent;
                  let statusClass = 'status-yes';
                  let statusText = 'Under';
                  let statusStyle = {};
                  
                  if (row.status === 'EXCEEDED') {
                    statusClass = 'status-no';
                    statusText = 'Exceeded';
                  } else if (row.status === 'WARNING') {
                    statusStyle = { background: '#fef3c7', color: '#b45309' };
                    statusText = 'Warning';
                  }
                  
                  return (
                    <tr key={row.month}>
                      <td data-label="Month" style={{ fontWeight: 500 }}>{row.monthLabel}</td>
                      <td data-label="Allowed">{row.allowedDays.toFixed(2)} days</td>
                      <td data-label="Used">{row.usedDays.toFixed(2)} days</td>
                      <td data-label="Remaining" style={{ color: row.remainingDays > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                        {row.remainingDays.toFixed(2)} days
                      </td>
                      <td data-label="Status">
                        <span className={`status-badge ${statusClass}`} style={statusStyle}>
                          {statusText}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          ({percent.toFixed(0)}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="charts-grid">
          {/* Contracted Capacity Trend */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Contracted Capacity Trend
              </div>
              <span className="badge badge-blue">Last 12 months</span>
            </div>
            {data?.capacityHistory && data.capacityHistory.length > 0 ? (
              <ContractedCapacityTrendChart data={data.capacityHistory} />
            ) : (
              <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Generate billing snapshots to see contracted capacity trends
              </div>
            )}
          </div>

          {/* Contract Status */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title">Contract Status</div>
            </div>
            {data?.contractStatus ? (
              <ContractStatusChart 
                contracted={data.contractStatus.contracted}
                nonContracted={data.contractStatus.nonContracted}
              />
            ) : (
              <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                No data available
              </div>
            )}
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Contracted</span>
                <span style={{ fontWeight: 500 }}>{data?.contractStatus?.contracted || 0} sites</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Awaiting PAC</span>
                <span style={{ fontWeight: 500 }}>{data?.contractStatus?.nonContracted || 0} sites</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Grid */}
        <div className="bottom-grid">
          {/* Contracted Capacity by SPV */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title">Contracted Capacity by SPV</div>
              <Link href={withContract('/spvs')} className="site-link">View all →</Link>
            </div>
            {data?.capacityBySpv && data.capacityBySpv.length > 0 ? (
              <CapacityChart data={data.capacityBySpv} />
            ) : (
              <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Import data with SPV assignments to see breakdown
              </div>
            )}
          </div>

          {/* Top Earning Sites */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title">
                <Award className="h-5 w-5 text-amber-500" />
                Top Earning Sites
              </div>
              <Link href={withContract('/sites')} className="site-link">View all →</Link>
            </div>
            {data?.topSites && data.topSites.length > 0 ? (
              <div style={{ marginTop: '8px' }}>
                {data.topSites.map((site, index) => (
                  <Link 
                    key={site.id}
                    href={withContract(`/sites/${site.id}`)}
                    className="top-site"
                  >
                    <div className="top-site-info">
                      <div className={`top-site-rank ${index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'rank-default'}`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="top-site-name">{site.name}</div>
                        <div className="top-site-meta">{site.spv || 'No SPV'} • {formatNumber(site.capacity, 0)} kWp</div>
                      </div>
                    </div>
                    <div className="top-site-fee">
                      {formatCurrency(site.monthlyFee)}
                      <span>/mo</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No contracted sites yet
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="chart-card">
          <div className="chart-title" style={{ marginBottom: '16px' }}>Quick Actions</div>
          <div className="actions-grid">
            <Link href={withContract('/sites')} className="action-card">
              <div className="action-icon">🏢</div>
              <div className="action-title">View All Sites</div>
              <div className="action-desc">{siteActionDescription}</div>
            </Link>
            <Link href={withContract('/cmdays')} className="action-card">
              <div className="action-icon">🔧</div>
              <div className="action-title">CM Days Tracker</div>
              <div className="action-desc">{cmActionDescription}</div>
            </Link>
            {canManageImports(user?.role) && (
              <Link href={withContract('/import')} className="action-card">
                <div className="action-icon">📥</div>
                <div className="action-title">Import from Excel</div>
                <div className="action-desc">Bulk import sites from spreadsheet</div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
