'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { CalendarDays, Cloud, Database, FileDown, History, Lock, RefreshCw, Send, ShieldCheck, Trash2, Unlock, UploadCloud } from 'lucide-react';
import { useContractQuery } from '@/lib/use-contract-query';

interface AdminStatus {
  environment: Record<string, boolean>;
  counts: {
    sites: number;
    spvs: number;
    pendingCmWork: number;
    billingSnapshots: number;
  };
  lastSync: {
    status: string;
    trigger: string;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
  } | null;
}

interface ImportReport {
  databaseId: string;
  commit: boolean;
  validRows: unknown[];
  errors: Array<{ notionPageId: string; messages: string[] }>;
  importedCount: number;
}

interface BillingGenerationReport {
  month: string;
  eligibleSiteCount: number;
  generatedSnapshotCount: number;
  skippedExistingCount: number;
  missingRelationCount: number;
  missingRelationSiteIds: string[];
  source: string;
}

interface BillingGenerationResult {
  month: string;
  commit: boolean;
  run: { id: string; month: string; status: string; createdAt: string } | null;
  snapshots: unknown[];
  report: BillingGenerationReport;
}

interface BillingSnapshotSummary {
  month: string;
  source: string;
  status: string;
  snapshotCount: number;
  expectedAmount: number;
  invoicedAmount: number;
}

interface BillingSnapshotList {
  month: string | null;
  summaries: BillingSnapshotSummary[];
  runs: Array<{ id: string; month: string; status: string; snapshotCount: number; skippedExistingCount: number; createdAt: string }>;
  snapshots: Array<{ id: string; siteName: string; spvCode: string | null; expectedAmount: number | null; source: string; status: string; notionSyncStatus?: string }>;
}

interface BillingSyncResult {
  month: string;
  scannedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: Array<{ snapshotId: string; billingEntry: string; error: string }>;
}

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

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: string | null;
  newValues: string | null;
  createdAt: string;
  user: {
    name: string | null;
    email: string | null;
    role: string;
  };
  site: {
    name: string;
    spvCode: string | null;
  } | null;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value || 0);
}

function parseAuditJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'blank';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleDateString('en-GB');
    return value.length > 36 ? `${value.slice(0, 33)}...` : value;
  }
  return 'changed';
}

function auditDetails(log: AuditLogEntry) {
  const oldValues = parseAuditJson(log.oldValues);
  const newValues = parseAuditJson(log.newValues);
  const ignoredFields = new Set(['id', 'createdAt', 'updatedAt', 'sourcePayload']);

  if (log.action === 'CREATE') {
    return `Created ${formatAuditValue(newValues?.name || newValues?.description || newValues?.email || log.entityId)}`;
  }

  if (log.action === 'DELETE') {
    return `Deleted ${formatAuditValue(oldValues?.name || oldValues?.description || oldValues?.email || log.entityId)}`;
  }

  if (log.action === 'IMPORT' || log.action === 'SYNC') {
    const summary = newValues || {};
    const parts = Object.entries(summary)
      .filter(([key]) => !ignoredFields.has(key))
      .slice(0, 4)
      .map(([key, value]) => `${key}: ${formatAuditValue(value)}`);
    return parts.length ? parts.join(' · ') : `${log.action.toLowerCase()} completed`;
  }

  if (oldValues && newValues) {
    const fields = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]))
      .filter((key) => !ignoredFields.has(key))
      .filter((key) => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key]))
      .slice(0, 5)
      .map((key) => `${key}: ${formatAuditValue(oldValues[key])} -> ${formatAuditValue(newValues[key])}`);
    if (fields.length) return fields.join(' · ');
  }

  return 'No field-level detail recorded';
}

function AdminContent() {
  const { withContract } = useContractQuery();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [databaseId, setDatabaseId] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [billingReport, setBillingReport] = useState<ImportReport | null>(null);
  const [billingMonth, setBillingMonth] = useState(currentMonth());
  const [generatedBilling, setGeneratedBilling] = useState<BillingGenerationResult | null>(null);
  const [billingSnapshots, setBillingSnapshots] = useState<BillingSnapshotList | null>(null);
  const [billingSync, setBillingSync] = useState<BillingSyncResult | null>(null);
  const [monthControls, setMonthControls] = useState<MonthControls | null>(null);
  const [siteOptions, setSiteOptions] = useState<SiteOption[]>([]);
  const [adjustmentForm, setAdjustmentForm] = useState({
    scope: 'PORTFOLIO',
    allocationMode: 'KEEP_PORTFOLIO',
    siteId: '',
    description: '',
    amount: '',
    category: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [activeSection, setActiveSection] = useState<'readiness' | 'imports' | 'billing' | 'audit' | 'deployment'>('readiness');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(withContract('/api/admin/status'));
    const json = await res.json();
    if (json.success) setStatus(json.data);
  }, [withContract]);

  const runBillingImport = async (commit: boolean) => {
    setIsWorking(true);
    setMessage(null);
    const res = await fetch(withContract('/api/admin/import/notion-billing'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commit }),
    });
    const json = await res.json();
    if (json.success) {
      setBillingReport(json.data);
      setMessage(commit ? 'Billing snapshots imported.' : 'Billing snapshot preview complete.');
      await fetchStatus();
    } else {
      setMessage(json.error || 'Billing snapshot import failed.');
    }
    setIsWorking(false);
  };

  const fetchBillingSnapshots = useCallback(async (month = billingMonth) => {
    const params = new URLSearchParams({ month });
    const res = await fetch(withContract(`/api/admin/billing/snapshots?${params.toString()}`));
    const json = await res.json();
    if (json.success) {
      setBillingSnapshots(json.data);
    }
  }, [billingMonth, withContract]);

  const fetchMonthControls = useCallback(async (month = billingMonth) => {
    const params = new URLSearchParams({ month });
    const res = await fetch(withContract(`/api/admin/billing/month-controls?${params.toString()}`));
    const json = await res.json();
    if (json.success) setMonthControls(json.data);
  }, [billingMonth, withContract]);

  const fetchSiteOptions = useCallback(async () => {
    const res = await fetch(withContract('/api/sites'));
    const json = await res.json();
    if (json.success) {
      setSiteOptions(json.data.map((site: SiteOption) => ({ id: site.id, name: site.name, spvCode: site.spvCode })));
    }
  }, [withContract]);

  const fetchAuditLogs = useCallback(async () => {
    const res = await fetch(withContract('/api/admin/audit?take=150'));
    const json = await res.json();
    if (json.success) setAuditLogs(json.data);
  }, [withContract]);

  useEffect(() => {
    fetchStatus();
    fetchBillingSnapshots(billingMonth);
    fetchMonthControls(billingMonth);
    fetchSiteOptions();
    fetchAuditLogs();
  }, [billingMonth, fetchAuditLogs, fetchBillingSnapshots, fetchMonthControls, fetchSiteOptions, fetchStatus]);

  const runImport = async (commit: boolean) => {
    setIsWorking(true);
    setMessage(null);
    const res = await fetch(withContract('/api/admin/import/notion'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ databaseId: databaseId || undefined, commit }),
    });
    const json = await res.json();
    if (json.success) {
      setReport(json.data);
      setMessage(commit ? 'Notion import committed.' : 'Import preview complete.');
      await fetchStatus();
    } else {
      setMessage(json.error || 'Notion import failed.');
    }
    setIsWorking(false);
  };

  const syncNow = async () => {
    setIsWorking(true);
    setMessage(null);
    const res = await fetch(withContract('/api/admin/notion-sync'), { method: 'POST' });
    const json = await res.json();
    setMessage(json.success ? 'Notion summary sync completed.' : json.error || 'Notion sync failed.');
    await fetchStatus();
    setIsWorking(false);
  };

  const runBillingGeneration = async (commit: boolean) => {
    setIsWorking(true);
    setMessage(null);
    const res = await fetch(withContract('/api/admin/billing/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: billingMonth, commit }),
    });
    const json = await res.json();
    if (json.success) {
      setGeneratedBilling(json.data);
      setMessage(commit ? `Committed app billing snapshots for ${billingMonth}.` : `Billing preview ready for ${billingMonth}.`);
      await fetchBillingSnapshots(billingMonth);
      await fetchMonthControls(billingMonth);
      await fetchStatus();
    } else {
      setMessage(json.error || 'Billing generation failed.');
    }
    setIsWorking(false);
  };

  const syncBillingToNotion = async () => {
    setIsWorking(true);
    setMessage(null);
    const res = await fetch(withContract('/api/admin/billing/sync-notion'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: billingMonth }),
    });
    const json = await res.json();
    if (json.success) {
      setBillingSync(json.data);
      setMessage(`Notion billing sync scanned ${json.data.scannedCount} snapshots for ${billingMonth}.`);
      await fetchBillingSnapshots(billingMonth);
      await fetchMonthControls(billingMonth);
      await fetchStatus();
    } else {
      setMessage(json.error || 'Notion billing sync failed.');
    }
    setIsWorking(false);
  };

  const updateMonthControl = async (body: Record<string, unknown>, successMessage: string) => {
    setIsWorking(true);
    setMessage(null);
    const res = await fetch(withContract('/api/admin/billing/month-controls'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.success) {
      setMonthControls(json.data);
      setMessage(successMessage);
      await fetchBillingSnapshots(billingMonth);
    } else {
      setMessage(json.error || 'Failed to update billing month controls.');
    }
    setIsWorking(false);
  };

  const addAdjustment = async () => {
    await updateMonthControl(
      {
        action: 'add-adjustment',
        adjustment: {
          month: billingMonth,
          scope: adjustmentForm.scope,
          allocationMode: adjustmentForm.allocationMode,
          siteId: adjustmentForm.scope === 'SITE' ? adjustmentForm.siteId : null,
          description: adjustmentForm.description,
          amount: Number(adjustmentForm.amount),
          category: adjustmentForm.category || null,
        },
      },
      'Billing adjustment added.'
    );
    setAdjustmentForm((prev) => ({ ...prev, description: '', amount: '', category: '' }));
  };

  const envEntries = Object.entries(status?.environment || {});
  const readyCount = envEntries.filter(([, ready]) => ready).length;

  return (
    <div className="main-content">
      <div className="page-header">
        <h1>Admin</h1>
        <p>Azure deployment readiness, Notion bootstrap import, and summary sync</p>
      </div>

      <div className="content">
        <div className="stats-grid">
          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Azure Config</span>
              <div className="card-icon blue"><Cloud className="h-5 w-5 text-blue-600" /></div>
            </div>
            <div className="card-value">{readyCount}/{envEntries.length || 7}</div>
            <div className="card-sub">required app settings present</div>
          </div>
          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Portfolio Data</span>
              <div className="card-icon green"><Database className="h-5 w-5 text-green-600" /></div>
            </div>
            <div className="card-value">{status?.counts.sites || 0}</div>
            <div className="card-sub">{status?.counts.spvs || 0} SPVs · {status?.counts.billingSnapshots || 0} billing snapshots</div>
          </div>
          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">CM Queue</span>
              <div className="card-icon amber"><ShieldCheck className="h-5 w-5 text-amber-600" /></div>
            </div>
            <div className="card-value">{status?.counts.pendingCmWork || 0}</div>
            <div className="card-sub">pending approvals</div>
          </div>
          <div className="card stat-card-purple">
            <div className="card-header">
              <span className="card-title">Last Sync</span>
              <div className="card-icon purple"><RefreshCw className="h-5 w-5 text-purple-600" /></div>
            </div>
            <div className="card-value" style={{ fontSize: '20px' }}>{status?.lastSync?.status || 'Never'}</div>
            <div className="card-sub">{status?.lastSync?.trigger || 'No Notion sync yet'}</div>
          </div>
        </div>

        {message && <div className="formula-box" style={{ marginBottom: '24px' }}>{message}</div>}

        <div className="admin-tabs" role="tablist" aria-label="Admin sections">
          <button type="button" className={activeSection === 'readiness' ? 'active' : ''} onClick={() => setActiveSection('readiness')}>Readiness</button>
          <button type="button" className={activeSection === 'imports' ? 'active' : ''} onClick={() => setActiveSection('imports')}>Imports</button>
          <button type="button" className={activeSection === 'billing' ? 'active' : ''} onClick={() => setActiveSection('billing')}>Billing</button>
          <button type="button" className={activeSection === 'audit' ? 'active' : ''} onClick={() => setActiveSection('audit')}>Change Log</button>
          <button type="button" className={activeSection === 'deployment' ? 'active' : ''} onClick={() => setActiveSection('deployment')}>Deployment</button>
        </div>

        {activeSection === 'readiness' && (
        <div className="bottom-grid">
          <div className="chart-card">
            <div className="chart-title" style={{ marginBottom: '16px' }}>
              <Cloud className="h-5 w-5" />
              Environment Readiness
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Setting</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {envEntries.map(([key, ready]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td><span className={`status-badge ${ready ? 'status-yes' : 'status-no'}`}>{ready ? 'Configured' : 'Missing'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}

        {activeSection === 'imports' && (
        <div className="bottom-grid">
          <div className="chart-card">
            <div className="chart-title" style={{ marginBottom: '16px' }}>
              <UploadCloud className="h-5 w-5" />
              Notion Bootstrap Import
            </div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Notion Sites Database ID</label>
            <input className="form-control" value={databaseId} onChange={(event) => setDatabaseId(event.target.value)} placeholder="Uses NOTION_SITES_DATABASE_ID if blank" style={{ marginBottom: '16px' }} />
            <div className="button-row">
              <button onClick={() => runImport(false)} disabled={isWorking} className="secondary-action">
                <FileDown className="h-4 w-4" />
                Preview
              </button>
              <button onClick={() => runImport(true)} disabled={isWorking || Boolean(report && report.validRows.length === 0)} className="primary-action">
                Commit Import
              </button>
              <button onClick={syncNow} disabled={isWorking} className="success-action">
                Sync Now
              </button>
            </div>

            {report && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                  Valid rows: <strong>{report.validRows.length}</strong> · Errors: <strong>{report.errors.length}</strong> · Imported: <strong>{report.importedCount}</strong>
                </p>
                {report.errors.length > 0 && (
                  <div className="formula-box" style={{ marginTop: '12px', color: 'var(--red)' }}>
                    Invalid Notion rows will be skipped during commit.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="chart-card">
            <div className="chart-title" style={{ marginBottom: '16px' }}>
              <FileDown className="h-5 w-5" />
              Notion Billing Snapshots
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
              Imports the O&M Billing relation as immutable monthly rows. Existing snapshots are skipped, not updated.
            </p>
            <div className="button-row">
              <button onClick={() => runBillingImport(false)} disabled={isWorking} className="secondary-action">
                <FileDown className="h-4 w-4" />
                Preview Billing
              </button>
              <button onClick={() => runBillingImport(true)} disabled={isWorking} className="primary-action">
                Commit Snapshots
              </button>
            </div>

            {billingReport && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                  Valid rows: <strong>{billingReport.validRows.length}</strong> · Errors: <strong>{billingReport.errors.length}</strong> · Imported: <strong>{billingReport.importedCount}</strong>
                </p>
                {billingReport.errors.length > 0 && (
                  <div className="formula-box" style={{ marginTop: '12px', color: 'var(--red)' }}>
                    Rows with errors are skipped; valid linked billing rows can still be committed.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {activeSection === 'billing' && (
        <div className="bottom-grid">
          <div className="chart-card">
            <div className="chart-title" style={{ marginBottom: '16px' }}>
              <CalendarDays className="h-5 w-5" />
              App Monthly Billing
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
              Creates immutable monthly billing snapshots from current site data, then publishes those rows into the Notion Billing database.
            </p>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Billing Month</label>
              <input
              type="month"
              value={billingMonth}
              onChange={(event) => {
                setBillingMonth(event.target.value);
                fetchBillingSnapshots(event.target.value);
                fetchMonthControls(event.target.value);
              }}
              className="form-control"
              style={{ width: '180px', marginBottom: '16px' }}
            />
            <div className="button-row">
              <button onClick={() => runBillingGeneration(false)} disabled={isWorking} className="secondary-action">
                <FileDown className="h-4 w-4" />
                Preview Month
              </button>
              <button onClick={() => runBillingGeneration(true)} disabled={isWorking} className="primary-action">
                Commit Month
              </button>
              <button onClick={syncBillingToNotion} disabled={isWorking} className="success-action">
                <Send className="h-4 w-4" />
                Publish Billing to Notion
              </button>
              {monthControls?.isLocked ? (
                <button onClick={() => updateMonthControl({ action: 'unlock', month: billingMonth }, `Unlocked ${billingMonth}.`)} disabled={isWorking} className="secondary-action">
                  <Unlock className="h-4 w-4" />
                  Unlock Month
                </button>
              ) : (
                <button onClick={() => updateMonthControl({ action: 'lock', month: billingMonth, note: 'Locked from admin' }, `Locked ${billingMonth}.`)} disabled={isWorking} className="secondary-action action-dark">
                  <Lock className="h-4 w-4" />
                  Lock Month
                </button>
              )}
            </div>

            {monthControls?.isLocked && (
              <div className="formula-box" style={{ marginTop: '12px' }}>
                Locked by {monthControls.lockedBy || 'admin'}{monthControls.lockedAt ? ` on ${new Date(monthControls.lockedAt).toLocaleDateString('en-GB')}` : ''}. Adjustments and billing generation are disabled until unlocked.
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', marginTop: '18px', paddingTop: '16px' }}>
              <div className="chart-title" style={{ marginBottom: '12px' }}>Manual Items</div>
              <div className="form-grid admin-manual" style={{ marginBottom: '10px' }}>
                <select className="form-control" value={adjustmentForm.scope} onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, scope: event.target.value, siteId: '' }))} disabled={monthControls?.isLocked}>
                  <option value="PORTFOLIO">Portfolio</option>
                  <option value="SITE">Site</option>
                </select>
                {adjustmentForm.scope === 'SITE' ? (
                  <select className="form-control" value={adjustmentForm.siteId} onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, siteId: event.target.value }))} disabled={monthControls?.isLocked}>
                    <option value="">Select site...</option>
                    {siteOptions.map((site) => <option key={site.id} value={site.id}>{site.name}{site.spvCode ? ` (${site.spvCode})` : ''}</option>)}
                  </select>
                ) : (
                  <select className="form-control" value={adjustmentForm.allocationMode} onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, allocationMode: event.target.value }))} disabled={monthControls?.isLocked}>
                    <option value="KEEP_PORTFOLIO">Keep at portfolio</option>
                    <option value="SPLIT_BY_SPV_CAPACITY">Split by SPV capacity</option>
                  </select>
                )}
                <input className="form-control" value={adjustmentForm.description} onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Description" disabled={monthControls?.isLocked} />
                <input className="form-control" value={adjustmentForm.amount} onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, amount: event.target.value }))} placeholder="Amount +/-" type="number" step="0.01" disabled={monthControls?.isLocked} />
              </div>
              <div className="button-row">
                <input className="form-control" value={adjustmentForm.category} onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="Category optional" disabled={monthControls?.isLocked} style={{ width: '220px' }} />
                <button onClick={addAdjustment} disabled={isWorking || Boolean(monthControls?.isLocked)} className="primary-action">Add Item</button>
              </div>

              {monthControls?.adjustments?.length ? (
                <div className="table-container" style={{ marginTop: '14px' }}>
                  <table>
                    <tbody>
                      {monthControls.adjustments.map((adjustment) => (
                        <tr key={adjustment.id}>
                          <td>{adjustment.description}<div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{adjustment.scope === 'SITE' ? adjustment.siteName : adjustment.allocationMode === 'KEEP_PORTFOLIO' ? 'Portfolio row' : 'Split by SPV capacity'}</div></td>
                          <td>{adjustment.spvCode || 'Portfolio'}</td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(adjustment.amount)}</td>
                          <td>
                            <button onClick={() => updateMonthControl({ action: 'delete-adjustment', month: billingMonth, id: adjustment.id }, 'Billing adjustment removed.')} disabled={isWorking || Boolean(monthControls?.isLocked)} className="icon-action" title="Remove adjustment">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            {generatedBilling && (
              <div style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
                Eligible: <strong>{generatedBilling.report.eligibleSiteCount}</strong> · New snapshots: <strong>{generatedBilling.report.generatedSnapshotCount}</strong> · Existing skipped: <strong>{generatedBilling.report.skippedExistingCount}</strong> · Missing Notion relation: <strong>{generatedBilling.report.missingRelationCount}</strong>
              </div>
            )}

            {billingSync && (
              <div style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                Created: <strong>{billingSync.createdCount}</strong> · Updated: <strong>{billingSync.updatedCount}</strong> · Failed: <strong>{billingSync.failedCount}</strong>
              </div>
            )}

            {billingSnapshots?.summaries?.length ? (
              <div className="table-container" style={{ marginTop: '16px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Source</th>
                      <th>Status</th>
                      <th>Rows</th>
                      <th>Expected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingSnapshots.summaries.map((summary) => (
                      <tr key={`${summary.month}-${summary.source}-${summary.status}`}>
                        <td>{summary.month}</td>
                        <td>{summary.source}</td>
                        <td><span className="status-badge status-yes">{summary.status}</span></td>
                        <td>{summary.snapshotCount}</td>
                        <td>{formatCurrency(summary.expectedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '16px' }}>No billing snapshots for this month yet.</p>
            )}
          </div>
        </div>
        )}

        {activeSection === 'audit' && (
        <div className="chart-card">
          <div className="chart-title" style={{ marginBottom: '16px' }}>
            <History className="h-5 w-5" />
            Change Log
          </div>
          <div className="button-row" style={{ marginBottom: '14px' }}>
            <button onClick={fetchAuditLogs} disabled={isWorking} className="secondary-action">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Item</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      {log.user.name || log.user.email || 'System'}
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{log.user.role}</div>
                    </td>
                    <td><span className="status-badge status-yes">{log.action}</span></td>
                    <td>
                      {log.site ? `${log.site.name}${log.site.spvCode ? ` (${log.site.spvCode})` : ''}` : log.entityType}
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{log.entityType}</div>
                    </td>
                    <td style={{ maxWidth: '520px', whiteSpace: 'normal' }}>{auditDetails(log)}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--text-muted)' }}>No changes have been logged yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {activeSection === 'deployment' && (
        <div className="chart-card">
          <div className="chart-title" style={{ marginBottom: '12px' }}>Azure Deployment Commands</div>
          <pre className="code-block">{`cp azure/main.parameters.example.json azure/main.parameters.json
# fill secure values
RESOURCE_GROUP=clearsol-om-tracker-rg LOCATION=uksouth ./azure/deploy.sh
npx prisma migrate deploy
npm run db:seed`}</pre>
        </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminContent />
    </Suspense>
  );
}
