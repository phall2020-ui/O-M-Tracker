'use client';

import { Fragment, Suspense, useCallback, useEffect, useState } from 'react';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { SpvMonthlyReport, SpvMonthlyRow } from '@/types';
import { Building, Zap, PoundSterling, FileText, ChevronDown, ChevronRight, Download, CalendarDays, Lock, Pencil, Plus, Trash2, Unlock } from 'lucide-react';
import Link from 'next/link';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { canEditSites, canManageBilling, useCurrentUser } from '@/lib/use-current-user';
import { buildCsv } from '@/lib/csv-export';
import { useContractQuery } from '@/lib/use-contract-query';

interface MonthControls {
  month: string;
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  note: string | null;
  adjustments: Array<{
    id: string;
    scope: 'SITE' | 'PORTFOLIO';
    allocationMode: 'KEEP_PORTFOLIO' | 'SPLIT_BY_SPV_CAPACITY';
    description: string;
    amount: number;
    category: string | null;
    siteName: string | null;
    spvCode: string | null;
  }>;
}

interface SiteOption {
  id: string;
  name: string;
  spvCode: string | null;
}

function SpvsContent() {
  const { user } = useCurrentUser();
  const { withContract } = useContractQuery();
  const [report, setReport] = useState<SpvMonthlyReport | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthControls, setMonthControls] = useState<MonthControls | null>(null);
  const [siteOptions, setSiteOptions] = useState<SiteOption[]>([]);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    scope: 'PORTFOLIO',
    allocationMode: 'KEEP_PORTFOLIO',
    siteId: '',
    description: '',
    amount: '',
    category: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const allowBillingControls = canManageBilling(user?.role);
  const allowSiteEdits = canEditSites(user?.role);

  const fetchMonthlyReport = useCallback(async (month: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(withContract(`/api/spvs/monthly?month=${encodeURIComponent(month)}`));
      const data = await res.json();
      
      if (data.success) {
        setReport(data.data);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to fetch monthly SPV data');
    } finally {
      setIsLoading(false);
    }
  }, [withContract]);

  const fetchMonthControls = useCallback(async (month: string) => {
    try {
      const params = new URLSearchParams({ month });
      const res = await fetch(withContract(`/api/admin/billing/month-controls?${params.toString()}`));
      const data = await res.json();
      if (data.success) setMonthControls(data.data);
    } catch {
      setError('Failed to fetch month controls');
    }
  }, [withContract]);

  const fetchSiteOptions = useCallback(async () => {
    try {
      const res = await fetch(withContract('/api/sites'));
      const data = await res.json();
      if (data.success) {
        setSiteOptions(data.data.map((site: SiteOption) => ({
          id: site.id,
          name: site.name,
          spvCode: site.spvCode,
        })));
      }
    } catch {
      setError('Failed to fetch sites');
    }
  }, [withContract]);

  useEffect(() => {
    fetchMonthlyReport(selectedMonth);
    if (allowBillingControls) {
      fetchMonthControls(selectedMonth);
    } else {
      setMonthControls(null);
      setShowEditPanel(false);
    }
  }, [selectedMonth, allowBillingControls, fetchMonthControls, fetchMonthlyReport]);

  useEffect(() => {
    fetchSiteOptions();
  }, [fetchSiteOptions]);

  const refreshMonth = async () => {
    await Promise.all([
      allowBillingControls ? fetchMonthControls(selectedMonth) : Promise.resolve(),
      fetchMonthlyReport(selectedMonth),
    ]);
  };

  const updateMonthControl = async (body: Record<string, unknown>, successMessage: string) => {
    setIsWorking(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(withContract('/api/admin/billing/month-controls'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to update month controls');
        return;
      }
      setMonthControls(data.data);
      setMessage(successMessage);
      await fetchMonthlyReport(selectedMonth);
    } catch {
      setError('Failed to update month controls');
    } finally {
      setIsWorking(false);
    }
  };

  const addAdjustment = async () => {
    await updateMonthControl(
      {
        action: 'add-adjustment',
        adjustment: {
          month: selectedMonth,
          scope: adjustmentForm.scope,
          allocationMode: adjustmentForm.allocationMode,
          siteId: adjustmentForm.scope === 'SITE' ? adjustmentForm.siteId : null,
          description: adjustmentForm.description,
          amount: Number(adjustmentForm.amount),
          category: adjustmentForm.category || null,
        },
      },
      'Custom cost added.'
    );
    setAdjustmentForm((prev) => ({ ...prev, description: '', amount: '', category: '' }));
  };

  const handleExport = () => {
    if (!report) return;

    const headers = [
      'SPV',
      'SPV Name',
      'Billing Portfolio',
      'Sites',
      'Contracted Sites',
      'Pending Sites',
      'Total Capacity kWp',
      'Contracted Capacity kWp',
      'Site Fixed Costs Annual',
      'Variable Cost Annual',
      'Annual Fee',
      'Base Monthly Fee',
      'Manual Items',
      'Adjusted Monthly Fee',
      'Fee per kWp',
      'CM Days Allowed',
    ];
    const rows = report.rows.map((row) => [
      row.spvCode,
      row.spvName,
      row.billingPortfolioLabel || 'Core',
      row.siteCount,
      row.contractedSiteCount,
      row.pendingSiteCount,
      row.totalCapacityKwp.toFixed(2),
      row.contractedCapacityKwp.toFixed(2),
      row.siteFixedCostsAnnual.toFixed(2),
      row.variableCostAnnual.toFixed(2),
      row.annualFee.toFixed(2),
      row.monthlyFee.toFixed(2),
      (row.adjustmentAmount || 0).toFixed(2),
      (row.adjustedMonthlyFee ?? row.monthlyFee).toFixed(2),
      row.averageFeePerKwp.toFixed(2),
      row.correctiveDaysAllowed.toFixed(1),
    ]);
    const csv = buildCsv([headers, ...rows]);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `spv-monthly-${report.month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const isInformationalSpvRow = (row: { spvCode: string; billingPortfolio?: string }) =>
    row.spvCode === 'UNASSIGNED' || (row.spvCode === 'EDEN' && row.billingPortfolio === 'EDEN');
  const getRowKey = (row: { spvCode: string; billingPortfolio?: string }) => `${row.billingPortfolio || 'CORE'}:${row.spvCode}`;
  const sitesForSpvRow = (row: SpvMonthlyRow) => row.siteLines || [];
  // Carry the selected month and billing portfolio into the invoice so every displayed line
  // comes from the same report row as the SPV and portfolio totals.
  const spvInvoiceHref = (row: SpvMonthlyRow) => {
    const base = withContract(`/spvs/${row.spvCode}`);
    const query = new URLSearchParams({
      portfolio: row.billingPortfolio || 'CORE',
      month: report?.month || selectedMonth,
    });
    return `${base}${base.includes('?') ? '&' : '?'}${query.toString()}`;
  };

  const isLocked = Boolean(monthControls?.isLocked || report?.isLocked);

  if (isLoading) {
    return (
      <div className="main-content flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="main-content">
      {/* Header */}
      <div className="page-header">
        <h1>SPV Portfolio</h1>
        <p>Monthly SPV portfolio breakdown and invoicing summary</p>
      </div>

      <div className="content">
        <div className="monthly-toolbar">
          <div className="month-picker">
            <CalendarDays className="h-4 w-4" />
            <label htmlFor="spv-month">Reporting month</label>
            <select
              id="spv-month"
              value={report?.month || selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            >
              {(report?.availableMonths || [{ value: selectedMonth, label: selectedMonth }]).map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
          <div className="monthly-actions">
            {allowBillingControls && (
              <button type="button" className="secondary-action" onClick={() => setShowEditPanel((value) => !value)}>
                <Pencil className="h-4 w-4" />
                Edit Month
              </button>
            )}
            {allowSiteEdits && (
              <Link href={withContract('/sites/new')} className="secondary-action">
                <Plus className="h-4 w-4" />
                Add Site
              </Link>
            )}
            {allowBillingControls && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => setShowEditPanel(true)}
                disabled={isLocked}
              >
                <Plus className="h-4 w-4" />
                Custom Cost
              </button>
            )}
            {allowBillingControls && (isLocked ? (
              <button
                type="button"
                className="secondary-action"
                onClick={() => updateMonthControl({ action: 'unlock', month: selectedMonth }, `Unlocked ${selectedMonth}.`)}
                disabled={isWorking}
              >
                <Unlock className="h-4 w-4" />
                Unlock Month
              </button>
            ) : (
              <button
                type="button"
                className="secondary-action action-dark"
                onClick={() => updateMonthControl({ action: 'lock', month: selectedMonth, note: 'Locked from SPV portfolio' }, `Locked ${selectedMonth}.`)}
                disabled={isWorking}
              >
                <Lock className="h-4 w-4" />
                Lock Month
              </button>
            ))}
            <button type="button" className="secondary-action" onClick={handleExport} disabled={!report || report.rows.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {message && <div className="formula-box" style={{ marginBottom: '16px' }}>{message}</div>}

        {allowBillingControls && showEditPanel && (
          <div className="chart-card" style={{ marginBottom: '24px' }}>
            <div className="chart-header">
              <div className="chart-title">
                <Pencil className="h-5 w-5" />
                Month Controls
              </div>
              <span className={`status-badge ${isLocked ? 'status-no' : 'status-yes'}`}>
                {isLocked ? 'Locked' : 'Open'}
              </span>
            </div>
            {isLocked && (
              <div className="formula-box" style={{ marginTop: '12px', marginBottom: '16px' }}>
                Locked by {monthControls?.lockedBy || 'admin'}{monthControls?.lockedAt ? ` on ${new Date(monthControls.lockedAt).toLocaleDateString('en-GB')}` : ''}. Unlock the month before changing costs.
              </div>
            )}
            <div className="monthly-edit-grid">
              <select
                value={adjustmentForm.scope}
                onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, scope: event.target.value, siteId: '' }))}
                disabled={isLocked}
              >
                <option value="PORTFOLIO">Portfolio cost</option>
                <option value="SITE">Site cost</option>
              </select>
              {adjustmentForm.scope === 'SITE' ? (
                <select
                  value={adjustmentForm.siteId}
                  onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, siteId: event.target.value }))}
                  disabled={isLocked}
                >
                  <option value="">Select site...</option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}{site.spvCode ? ` (${site.spvCode})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={adjustmentForm.allocationMode}
                  onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, allocationMode: event.target.value }))}
                  disabled={isLocked}
                >
                  <option value="KEEP_PORTFOLIO">Keep as portfolio line</option>
                  <option value="SPLIT_BY_SPV_CAPACITY">Split by SPV capacity</option>
                </select>
              )}
              <input
                value={adjustmentForm.description}
                onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                disabled={isLocked}
              />
              <input
                value={adjustmentForm.amount}
                onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, amount: event.target.value }))}
                placeholder="Amount +/-"
                type="number"
                step="0.01"
                disabled={isLocked}
              />
              <input
                value={adjustmentForm.category}
                onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Category optional"
                disabled={isLocked}
              />
              <button type="button" className="secondary-action action-primary" onClick={addAdjustment} disabled={isWorking || isLocked}>
                <Plus className="h-4 w-4" />
                Add Cost
              </button>
            </div>
            {monthControls?.adjustments?.length ? (
              <div className="table-container" style={{ marginTop: '16px' }}>
                <table>
                  <tbody>
                    {monthControls.adjustments.map((adjustment) => (
                      <tr key={adjustment.id}>
                        <td>
                          <strong>{adjustment.description}</strong>
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                            {adjustment.scope === 'SITE'
                              ? adjustment.siteName
                              : adjustment.allocationMode === 'KEEP_PORTFOLIO'
                                ? 'Portfolio row'
                                : 'Split by SPV capacity'}
                          </div>
                        </td>
                        <td>{adjustment.spvCode || 'Portfolio'}</td>
                        <td style={{ fontWeight: 700 }}>{formatCurrency(adjustment.amount)}</td>
                        <td style={{ width: '56px' }}>
                          <button
                            type="button"
                            className="icon-action"
                            title="Remove cost"
                            disabled={isWorking || isLocked}
                            onClick={() => updateMonthControl({ action: 'delete-adjustment', month: selectedMonth, id: adjustment.id }, 'Custom cost removed.')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <button type="button" className="secondary-action" onClick={refreshMonth} disabled={isWorking} style={{ marginTop: '14px' }}>
              Refresh Month
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="stats-grid three">
          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Total SPVs</span>
              <div className="card-icon blue">
                <Building className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="card-value">{report?.rows.length || 0}</div>
            <div className="card-sub">{report?.totals.siteCount || 0} sites in {report?.monthLabel || 'selected month'}</div>
          </div>

          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">Total Capacity</span>
              <div className="card-icon amber">
                <Zap className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <div className="card-value">{formatNumber((report?.totals.contractedCapacityKwp || 0) / 1000, 1)} MW</div>
            <div className="card-sub">Contracted capacity</div>
          </div>

          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Monthly Revenue</span>
              <div className="card-icon green">
                <PoundSterling className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="card-value">{formatCurrency(report?.totals.adjustedMonthlyFee ?? report?.totals.monthlyFee ?? 0)}</div>
            <div className="card-sub">
              {report?.totals.adjustmentAmount ? `${formatCurrency(report.totals.adjustmentAmount)} manual items` : `${formatCurrency(report?.totals.annualFee || 0)} annual fee`}
            </div>
          </div>
        </div>

        {report?.portfolioBreakdowns && (
          <div className="stats-grid two">
            {report.portfolioBreakdowns.map((portfolio) => (
              <div key={portfolio.billingPortfolio} className="card">
                <div className="card-header">
                  <span className="card-title">{portfolio.billingPortfolioLabel} Billing</span>
                  <span className="badge badge-blue">{formatNumber(portfolio.contractedCapacityKwp / 1000, 2)} MW</span>
                </div>
                <div className="card-value">{formatCurrency(portfolio.monthlyFee)}</div>
                <div className="card-sub">
                  {portfolio.contractedSiteCount} contracted sites · {formatNumber(portfolio.correctiveDaysAllowed, 0)} CM days/month
                </div>
              </div>
            ))}
          </div>
        )}

        {error ? (
          <ErrorPanel
            message={error}
            detail="The monthly SPV report could not be loaded. Retry after checking billing snapshots and database/API configuration."
            onRetry={refreshMonth}
          />
        ) : !report || report.rows.length === 0 ? (
          <div className="chart-card" style={{ textAlign: 'center', padding: '48px' }}>
            <Building className="h-12 w-12 mx-auto" style={{ color: '#d1d5db', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No SPV data for this month</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              Import sites with SPV assignments or choose a later reporting month.
            </p>
          </div>
        ) : (
          <div className="monthly-table-card">
            <div className="monthly-table-header">
              <div>
                <h2>SPV Monthly Table</h2>
                <p>{report.monthLabel} operational portfolio summary</p>
              </div>
              <span className="status-badge status-yes">
                {report.isLocked
                  ? 'Locked'
                  : report.source === 'billing-snapshots'
                    ? `${report.totals.billingSnapshotCount || 0} billing snapshots`
                    : `${report.totals.contractedSiteCount} contracted sites`}
              </span>
            </div>
            <div className="table-container compact-mobile-table">
              <table className="monthly-spv-table">
                <thead>
                  <tr>
                    <th>SPV</th>
                    <th>Portfolio</th>
                    <th className="numeric">Sites</th>
                    <th className="numeric">Contracted</th>
                    <th className="numeric">Capacity</th>
                    <th className="numeric">Site Costs</th>
                    <th className="numeric">Variable Cost</th>
                    <th className="numeric">Annual Fee</th>
                    <th className="numeric">Base Fee</th>
                    <th className="numeric">Manual Items</th>
                    <th className="numeric">Adjusted Fee</th>
                    <th className="numeric">CM Days</th>
                    <th>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => {
                    const rowKey = getRowKey(row);
                    const isExpanded = expandedRowKey === rowKey;
                    const rowSites = sitesForSpvRow(row);
                    return (
                    <Fragment key={rowKey}>
                    <tr
                      className="spv-expand-row"
                      onClick={() => {
                        setExpandedRowKey((current) => current === rowKey ? null : rowKey);
                      }}
                    >
                      <td data-label="SPV">
                        <div className="spv-row-title">
                          <span className="spv-row-toggle">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                          <div className="spv-table-code">{row.spvCode}</div>
                        </div>
                        <div className="spv-table-name">{row.spvName}</div>
                      </td>
                      <td data-label="Portfolio">{row.billingPortfolioLabel || 'Core'}</td>
                      <td data-label="Sites" className="numeric">
                        {row.siteCount}
                        {row.pendingSiteCount > 0 ? <span className="pending-count">+{row.pendingSiteCount} pending</span> : null}
                        {row.billingSnapshotCount ? <span>{row.billingSnapshotCount} snapshots</span> : null}
                      </td>
                      <td data-label="Contracted" className="numeric">{row.contractedSiteCount}</td>
                      <td data-label="Capacity" className="numeric">
                        {formatNumber(row.contractedCapacityKwp / 1000, 2)} MW
                        <span>{formatNumber(row.totalCapacityKwp / 1000, 2)} MW total</span>
                      </td>
                      <td data-label="Site Costs" className="numeric">{formatCurrency(row.siteFixedCostsAnnual)}</td>
                      <td data-label="Variable Cost" className="numeric">{formatCurrency(row.variableCostAnnual)}</td>
                      <td data-label="Annual Fee" className="numeric">{formatCurrency(row.annualFee)}</td>
                      <td data-label="Base Fee" className="numeric">{formatCurrency(row.monthlyFee)}</td>
                      <td data-label="Manual Items" className="numeric">{formatCurrency(row.adjustmentAmount || 0)}</td>
                      <td data-label="Adjusted Fee" className="numeric strong">{formatCurrency(row.adjustedMonthlyFee ?? row.monthlyFee)}</td>
                      <td data-label="CM Days" className="numeric">{formatNumber(row.correctiveDaysAllowed, 0)}</td>
                      <td data-label="Invoice">
                        {isInformationalSpvRow(row) ? (
                          <span className="muted-cell">n/a</span>
                        ) : (
                          <Link href={spvInvoiceHref(row)} onClick={(event) => event.stopPropagation()}>
                            <button className="icon-action" type="button" title={`Open ${row.spvCode} invoice`}>
                              <FileText className="h-4 w-4" />
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </Link>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="spv-expanded-row">
                        <td colSpan={13} data-label="Sites">
                          <div className="spv-site-breakdown">
                            <div className="spv-site-breakdown-header">
                              <div>
                                <strong>{row.spvName} site breakdown</strong>
                                <span>
                                  {`${rowSites.length} ${report.source === 'billing-snapshots' ? 'billing snapshot' : 'calculated site'} lines for ${report.monthLabel}`}
                                </span>
                              </div>
                              <button type="button" className="secondary-action" onClick={() => setExpandedRowKey(null)}>
                                Roll Up
                              </button>
                            </div>
                            {rowSites.length === 0 ? (
                              <p className="spv-site-empty">
                                No billing lines are available for {row.spvCode} / {row.billingPortfolioLabel || 'Core'} in {report.monthLabel}.
                              </p>
                            ) : (
                              <div className="table-container compact-mobile-table">
                                <table className="spv-site-table">
                                  <thead>
                                    <tr>
                                      <th>Site</th>
                                      <th>Status</th>
                                      <th className="numeric">Capacity</th>
                                      <th className="numeric">PM Days / Annum</th>
                                      <th className="numeric">PM Visits</th>
                                      <th className="numeric">Site Costs</th>
                                      <th className="numeric">Monthly Fee</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rowSites.map((site) => (
                                      <tr key={site.id}>
                                        <td data-label="Site">
                                          {site.siteId ? (
                                            <Link href={withContract(`/sites/${site.siteId}`)} className="site-link">
                                              {site.name}
                                            </Link>
                                          ) : site.name}
                                        </td>
                                        <td data-label="Status">
                                          <span className={`status-badge ${site.contractStatus === 'Contracted' || site.contractStatus === 'Yes' ? 'status-yes' : 'status-no'}`}>
                                            {site.contractStatus === 'Contracted' || site.contractStatus === 'Yes' ? 'Contracted' : site.contractStatus === 'No' ? 'Awaiting PAC' : site.contractStatus}
                                          </span>
                                        </td>
                                        <td data-label="Capacity" className="numeric">{formatNumber(site.systemSizeKwp / 1000, 3)} MW</td>
                                        <td data-label="PM Days / Annum" className="numeric">{formatNumber(site.pmDaysOnSite || 0, site.pmDaysOnSite % 1 === 0 ? 0 : 1)}</td>
                                        <td data-label="PM Visits" className="numeric">{site.pmVisitsPerAnnum > 0 ? formatNumber(site.pmVisitsPerAnnum, 2) : '-'}</td>
                                        <td data-label="Site Costs" className="numeric">{formatCurrency(site.siteFixedCosts || 0)}</td>
                                        <td data-label="Monthly Fee" className="numeric strong">{formatCurrency(site.monthlyFee || 0)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td data-label="SPV">Total</td>
                    <td data-label="Portfolio" />
                    <td data-label="Sites" className="numeric">{report.totals.siteCount}</td>
                    <td data-label="Contracted" className="numeric">{report.totals.contractedSiteCount}</td>
                    <td data-label="Capacity" className="numeric">{formatNumber(report.totals.contractedCapacityKwp / 1000, 2)} MW</td>
                    <td data-label="Site Costs" className="numeric">{formatCurrency(report.totals.siteFixedCostsAnnual)}</td>
                    <td data-label="Variable Cost" className="numeric">{formatCurrency(report.totals.variableCostAnnual)}</td>
                    <td data-label="Annual Fee" className="numeric">{formatCurrency(report.totals.annualFee)}</td>
                    <td data-label="Base Fee" className="numeric">{formatCurrency(report.totals.monthlyFee)}</td>
                    <td data-label="Manual Items" className="numeric">{formatCurrency(report.totals.adjustmentAmount || 0)}</td>
                    <td data-label="Adjusted Fee" className="numeric strong">{formatCurrency(report.totals.adjustedMonthlyFee ?? report.totals.monthlyFee)}</td>
                    <td data-label="CM Days" className="numeric">{formatNumber(report.totals.correctiveDaysAllowed, 0)}</td>
                    <td data-label="Invoice" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpvsPage() {
  return (
    <Suspense fallback={null}>
      <SpvsContent />
    </Suspense>
  );
}
