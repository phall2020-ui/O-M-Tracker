'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { formatNumber } from '@/lib/calculations';
import { Check, Clock, Download, Plus, X } from 'lucide-react';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { CmDaysPositionChart } from '@/components/charts/CmDaysPositionChart';
import { CmMonthlyTrendChart } from '@/components/charts/CmMonthlyTrendChart';
import { useCurrentUser } from '@/lib/use-current-user';
import { canCreateCmWork, canReviewCmWork } from '@/lib/permissions';
import { buildCsv } from '@/lib/csv-export';
import { useContractQuery } from '@/lib/use-contract-query';

interface CmEntry {
  id: string;
  siteId: string;
  workDate: string;
  hours: number;
  days: number;
  description: string | null;
  technician: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  site?: { id: string; name: string; spvCode: string | null };
}

interface SiteOption {
  id: string;
  name: string;
  spvCode: string | null;
}

interface CmSummary {
  allowedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  portfolioAllowances?: CmPortfolioAllowance[];
}

interface CmPortfolioAllowance {
  billingPortfolio: 'CORE' | 'EDEN';
  contractedCapacityKwp: number;
  allowedDays: number;
}

interface CmMonthlyUsageRow {
  month: string;
  monthLabel: string;
  contractedCapacityKwp: number;
  allowedDays: number;
  usedDays: number;
  pendingDays: number;
  rejectedDays: number;
  remainingDays: number;
  cumulativeAllowedDays: number;
  cumulativeUsedDays: number;
  cumulativeRemainingDays: number;
  usagePercent: number;
  cumulativeUsagePercent: number;
  status: 'UNDER' | 'WARNING' | 'EXCEEDED';
  portfolioAllowances?: CmPortfolioAllowance[];
}

function CMDaysContent() {
  const { user } = useCurrentUser();
  const { withContract } = useContractQuery();
  const [entries, setEntries] = useState<CmEntry[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [summary, setSummary] = useState<CmSummary | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<CmMonthlyUsageRow[]>([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [date, setDate] = useState('');
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [technician, setTechnician] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [cmRes, sitesRes] = await Promise.all([
        fetch(withContract('/api/cm-work')),
        fetch(withContract('/api/sites')),
      ]);
      const cmJson = await cmRes.json();
      const sitesJson = await sitesRes.json();

      if (cmJson.success) {
        setEntries(cmJson.data.entries);
        setSummary(cmJson.data.summary);
        setMonthlyUsage(cmJson.data.monthlyUsage || []);
      } else {
        setError(cmJson.error || 'Failed to fetch CM work');
      }
      if (sitesJson.success) {
        setSites(sitesJson.data.map((site: SiteOption) => ({
          id: site.id,
          name: site.name,
          spvCode: site.spvCode,
        })));
      } else {
        setError((previous) => previous || sitesJson.error || 'Failed to fetch sites');
      }
    } catch {
      setError('Failed to fetch CM work and site data');
    }
  }, [withContract]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const submitEntry = async () => {
    setError(null);
    const res = await fetch(withContract('/api/cm-work'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: selectedSite,
        workDate: date,
        hours: Number(hours),
        description,
        technician,
      }),
    });
    const json = await res.json();

    if (!json.success) {
      setError(json.error || 'Failed to log CM work');
      return;
    }

    setSelectedSite('');
    setDate('');
    setHours('');
    setDescription('');
    setTechnician('');
    await fetchData();
  };

  const reviewEntry = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const res = await fetch(withContract(`/api/cm-work/${id}/review`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error || 'Failed to review CM work');
      return;
    }
    await fetchData();
  };

  const exportCmWork = () => {
    const headers = ['Date', 'Site', 'SPV', 'Description', 'Hours', 'Days', 'Technician', 'Status'];
    const rows = entries.map((entry) => [
      new Date(entry.workDate).toLocaleDateString('en-GB'),
      entry.site?.name || entry.siteId,
      entry.site?.spvCode || '',
      entry.description || '',
      entry.hours.toFixed(1),
      entry.days.toFixed(2),
      entry.technician || '',
      entry.status,
    ]);
    const csv = buildCsv([headers, ...rows]);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cm-work-log-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const totalHours = entries.reduce((acc, log) => acc + log.hours, 0);
  const totalDays = totalHours / 8;
  const canSubmitCm = canCreateCmWork(user?.role);
  const canReviewCm = canReviewCmWork(user?.role);
  const latestMonth = monthlyUsage[monthlyUsage.length - 1];
  const cumulativeUsed = latestMonth?.cumulativeUsedDays || 0;
  const cumulativeRemaining = latestMonth?.cumulativeRemainingDays || 0;
  const cumulativePending = monthlyUsage.reduce((sum, row) => sum + row.pendingDays, 0);
  const cmPositionChartData = latestMonth
    ? [
        {
          label: 'MTD',
          allowance: latestMonth.allowedDays,
          approvedUsed: latestMonth.usedDays,
          pendingUsed: latestMonth.pendingDays,
          balance: latestMonth.remainingDays,
        },
        {
          label: 'Overall',
          allowance: latestMonth.cumulativeAllowedDays,
          approvedUsed: latestMonth.cumulativeUsedDays,
          pendingUsed: cumulativePending,
          balance: latestMonth.cumulativeRemainingDays,
        },
      ]
    : [];

  const statusMeta = (status: CmMonthlyUsageRow['status']) => {
    if (status === 'EXCEEDED') return { className: 'status-no', label: 'Exceeded', style: undefined };
    if (status === 'WARNING') return { className: '', label: 'Warning', style: { background: '#fef3c7', color: '#b45309' } };
    return { className: 'status-yes', label: 'Under', style: undefined };
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <h1>Corrective Maintenance Days</h1>
        <p>Track submitted CM work and approve official usage</p>
      </div>

      <div className="content">
        {error && (
          <ErrorPanel
            message={error}
            detail="CM work data could not be loaded or saved. Retry after checking the database/API configuration."
            onRetry={fetchData}
          />
        )}
        <div className="stats-grid">
          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Allowed</span>
              <div className="card-icon green">✓</div>
            </div>
            <div className="card-value" style={{ color: '#16a34a' }}>{summary?.allowedDays.toFixed(0) || '0'}</div>
            <div className="card-sub">days this month</div>
          </div>

          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">Pending</span>
              <div className="card-icon amber">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <div className="card-value" style={{ color: '#d97706' }}>{summary?.pendingDays.toFixed(2) || '0.00'}</div>
            <div className="card-sub">days awaiting approval</div>
          </div>

          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Used</span>
              <div className="card-icon blue">✓</div>
            </div>
            <div className="card-value" style={{ color: '#2563eb' }}>{summary?.usedDays.toFixed(2) || '0.00'}</div>
            <div className="card-sub">approved days</div>
          </div>

          <div className="card stat-card-purple">
            <div className="card-header">
              <span className="card-title">Remaining</span>
              <div className="card-icon purple">↻</div>
            </div>
            <div className="card-value" style={{ color: (summary?.remainingDays || 0) < 0 ? 'var(--red)' : '#7c3aed' }}>{summary?.remainingDays.toFixed(2) || '0.00'}</div>
            <div className="card-sub">official balance</div>
          </div>
        </div>

        <div className="stats-grid three">
          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Cumulative Used</span>
              <div className="card-icon blue">Σ</div>
            </div>
            <div className="card-value" style={{ color: '#2563eb' }}>{cumulativeUsed.toFixed(2)}</div>
            <div className="card-sub">approved days across displayed months</div>
          </div>
          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Cumulative Remaining</span>
              <div className="card-icon green">↻</div>
            </div>
            <div className="card-value" style={{ color: cumulativeRemaining < 0 ? 'var(--red)' : '#16a34a' }}>{cumulativeRemaining.toFixed(2)}</div>
            <div className="card-sub">allowance less approved usage</div>
          </div>
          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">Current Month</span>
              <div className="card-icon amber">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <div className="card-value" style={{ fontSize: '22px' }}>{latestMonth?.monthLabel || 'No data'}</div>
            <div className="card-sub">{latestMonth ? `${latestMonth.cumulativeUsagePercent.toFixed(1)}% cumulative used` : 'No CM history yet'}</div>
          </div>
        </div>

        {summary?.portfolioAllowances && (
          <div className="stats-grid two">
            {summary.portfolioAllowances.map((allowance) => (
              <div key={allowance.billingPortfolio} className="card">
                <div className="card-header">
                  <span className="card-title">
                    {allowance.billingPortfolio === 'EDEN' ? 'Eden CM Allowance' : 'Core CM Allowance'}
                  </span>
                  <span className="badge badge-blue">{formatNumber(allowance.contractedCapacityKwp / 1000, 2)} MW</span>
                </div>
                <div className="card-value">{allowance.allowedDays.toFixed(0)}</div>
                <div className="card-sub">standing days this month</div>
              </div>
            ))}
          </div>
        )}

        <div className="chart-card" style={{ marginBottom: '24px' }}>
          <div className="chart-header">
            <div className="chart-title">CM Days Position</div>
            <span className="badge badge-blue">MTD / Overall</span>
          </div>
          <div style={{ marginTop: '16px' }}>
            {cmPositionChartData.length > 0 ? (
              <CmDaysPositionChart data={cmPositionChartData} />
            ) : (
              <p style={{ color: 'var(--text-muted)', padding: '24px 0' }}>No CM usage data available yet.</p>
            )}
          </div>
        </div>
        <div className="chart-card" style={{ marginBottom: '24px' }}>
          <div className="chart-header">
            <div className="chart-title">Month-on-Month CM Trend</div>
            <span className="badge badge-blue">Rolling 12 months</span>
          </div>
          <div className="cm-trend-legend">
            <span><i style={{ background: '#10b981' }} /> Allowed</span>
            <span><i style={{ background: '#2563eb' }} /> Approved used</span>
            <span><i style={{ background: '#f59e0b' }} /> Pending</span>
            <span><i style={{ background: '#7c3aed' }} /> Remaining</span>
          </div>
          <div style={{ marginTop: '16px' }}>
            {monthlyUsage.length > 0 ? (
              <CmMonthlyTrendChart data={monthlyUsage} />
            ) : (
              <p style={{ color: 'var(--text-muted)', padding: '24px 0' }}>No CM usage data available yet.</p>
            )}
          </div>
        </div>
        <div className="chart-card" style={{ marginBottom: '24px' }}>
          <div className="chart-header">
            <div className="chart-title">Month-on-Month CM Ledger</div>
            <span className="badge badge-blue">Detail</span>
          </div>
          <div className="table-container compact-mobile-table" style={{ marginTop: '16px' }}>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Contracted Capacity</th>
                  <th>Allowed</th>
                  <th>Portfolio Allowance</th>
                  <th>Approved Used</th>
                  <th>Pending</th>
                  <th>Remaining</th>
                  <th>Accum. Allowed</th>
                  <th>Accum. Used</th>
                  <th>Accum. Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {monthlyUsage.map((row) => {
                  const meta = statusMeta(row.status);
                  return (
                    <tr key={row.month}>
                      <td data-label="Month" style={{ fontWeight: 600 }}>{row.monthLabel}</td>
                      <td data-label="Contracted Capacity">{formatNumber(row.contractedCapacityKwp / 1000, 2)} MW</td>
                      <td data-label="Allowed">{row.allowedDays.toFixed(0)} days</td>
                      <td data-label="Portfolio Allowance">
                        {(row.portfolioAllowances || []).map((allowance) => (
                          <div key={allowance.billingPortfolio}>
                            {allowance.billingPortfolio === 'EDEN' ? 'Eden' : 'Core'}: {allowance.allowedDays.toFixed(0)} days
                          </div>
                        ))}
                      </td>
                      <td data-label="Approved Used" style={{ fontWeight: 600 }}>{row.usedDays.toFixed(2)} days</td>
                      <td data-label="Pending">{row.pendingDays.toFixed(2)} days</td>
                      <td data-label="Remaining" style={{ color: row.remainingDays < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                        {row.remainingDays.toFixed(2)} days
                      </td>
                      <td data-label="Accum. Allowed">{row.cumulativeAllowedDays.toFixed(2)} days</td>
                      <td data-label="Accum. Used" style={{ fontWeight: 600 }}>{row.cumulativeUsedDays.toFixed(2)} days</td>
                      <td data-label="Accum. Remaining" style={{ color: row.cumulativeRemainingDays < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                        {row.cumulativeRemainingDays.toFixed(2)} days
                      </td>
                      <td data-label="Status">
                        <span className={`status-badge ${meta.className}`} style={meta.style}>
                          {meta.label}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          {row.usagePercent.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot style={{ background: '#f9fafb' }}>
                <tr>
                  <td data-label="Month" style={{ fontWeight: 700 }}>Displayed total</td>
                  <td data-label="Contracted Capacity" colSpan={6}></td>
                  <td data-label="Accum. Allowed" style={{ fontWeight: 700 }}>{(latestMonth?.cumulativeAllowedDays || 0).toFixed(0)} days</td>
                  <td data-label="Accum. Used" style={{ fontWeight: 700 }}>{cumulativeUsed.toFixed(2)} days</td>
                  <td data-label="Accum. Remaining" style={{ fontWeight: 700 }}>{cumulativeRemaining.toFixed(2)} days</td>
                  <td data-label="Status"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {canSubmitCm && (
        <div className="chart-card" style={{ marginBottom: '24px' }}>
          <div className="chart-title" style={{ marginBottom: '16px' }}>
            <Plus className="h-5 w-5 inline mr-2" />
            Log CM Work
          </div>
          <div className="form-grid cm-log" style={{ alignItems: 'end' }}>
            <div className="form-field">
              <label>Site</label>
              <select value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)}>
                <option value="">Select site...</option>
                {sites.map(site => (
                  <option key={site.id} value={site.id}>{site.spvCode ? `${site.spvCode} - ` : ''}{site.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Hours</label>
              <input type="number" placeholder="0.0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Days</label>
              <input type="text" value={(parseFloat(hours) / 8 || 0).toFixed(2)} disabled />
            </div>
            <div className="form-field">
              <label>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <button onClick={submitEntry} className="primary-action" disabled={!selectedSite || !date || !hours}>
              Add
            </button>
          </div>
          <div className="form-field" style={{ marginTop: '12px', maxWidth: '320px' }}>
            <label>Technician</label>
            <input value={technician} onChange={(e) => setTechnician(e.target.value)} />
          </div>
        </div>
        )}

        <div className="chart-card" style={{ marginBottom: '24px' }}>
          <div className="chart-header">
            <div className="chart-title">CM Work Log</div>
            <button className="secondary-action" onClick={exportCmWork} disabled={entries.length === 0}>
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
          <div className="table-container compact-mobile-table" style={{ marginTop: '16px' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Site</th>
                  <th>Description</th>
                  <th>Hours</th>
                  <th>Days</th>
                  <th>Technician</th>
                  <th>Status</th>
                  {canReviewCm && <th>Review</th>}
                </tr>
              </thead>
              <tbody>
                {entries.map((log) => (
                  <tr key={log.id}>
                    <td data-label="Date">{new Date(log.workDate).toLocaleDateString('en-GB')}</td>
                    <td data-label="Site">{log.site?.name || log.siteId}</td>
                    <td data-label="Description">{log.description || '-'}</td>
                    <td data-label="Hours">{log.hours.toFixed(1)}</td>
                    <td data-label="Days" style={{ fontWeight: 600 }}>{log.days.toFixed(2)}</td>
                    <td data-label="Technician">{log.technician || '-'}</td>
                    <td data-label="Status"><span className={`status-badge ${log.status === 'APPROVED' ? 'status-yes' : log.status === 'REJECTED' ? 'status-no' : ''}`}>{log.status}</span></td>
                    {canReviewCm && (
                    <td data-label="Review">
                      {log.status === 'PENDING' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => reviewEntry(log.id, 'APPROVED')} className="btn-icon" title="Approve"><Check className="h-4 w-4" /></button>
                          <button onClick={() => reviewEntry(log.id, 'REJECTED')} className="btn-icon" title="Reject"><X className="h-4 w-4" /></button>
                        </div>
                      )}
                    </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background: '#f9fafb' }}>
                <tr>
                  <td data-label="Date" colSpan={3} style={{ fontWeight: 600 }}>Total logged</td>
                  <td data-label="Hours" style={{ fontWeight: 600 }}>{totalHours.toFixed(1)} hrs</td>
                  <td data-label="Days" style={{ fontWeight: 700, color: 'var(--amber)' }}>{formatNumber(totalDays, 2)} days</td>
                  <td data-label="Technician" colSpan={canReviewCm ? 3 : 2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CMDaysPage() {
  return (
    <Suspense fallback={null}>
      <CMDaysContent />
    </Suspense>
  );
}
