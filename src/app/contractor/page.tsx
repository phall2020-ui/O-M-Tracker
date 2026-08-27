'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, HardHat, Send, Wrench } from 'lucide-react';
import { formatNumber } from '@/lib/calculations';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useContractQuery } from '@/lib/use-contract-query';

interface SiteOption {
  id: string;
  name: string;
  spvCode: string | null;
  contractStatus?: string;
  acceptedByOm?: boolean;
  onboardDate?: string | null;
}

interface CmEntry {
  id: string;
  workDate: string;
  hours: number;
  days: number;
  description: string | null;
  technician: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  site?: { name: string; spvCode: string | null };
}

interface CmSummary {
  allowedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
}

interface CmMonthlyUsageRow {
  cumulativeRemainingDays: number;
}

function ContractorPortalContent() {
  const { withContract } = useContractQuery();
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [entries, setEntries] = useState<CmEntry[]>([]);
  const [summary, setSummary] = useState<CmSummary | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<CmMonthlyUsageRow[]>([]);
  const [siteId, setSiteId] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [hours, setHours] = useState('');
  const [technician, setTechnician] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPortalData = useCallback(async () => {
    setError(null);
    try {
      const [sitesRes, cmRes] = await Promise.all([
        fetch(withContract('/api/sites')),
        fetch(withContract('/api/cm-work')),
      ]);
      const [sitesJson, cmJson] = await Promise.all([sitesRes.json(), cmRes.json()]);

      if (sitesJson.success) {
        const activeSites = sitesJson.data.filter((site: SiteOption) => (
          site.acceptedByOm === true &&
          Boolean(site.onboardDate) &&
          (site.contractStatus === 'Contracted' || site.contractStatus === 'Yes')
        ));

        setSites(activeSites.map((site: SiteOption) => ({
          id: site.id,
          name: site.name,
          spvCode: site.spvCode,
        })));
      } else {
        setError(sitesJson.error || 'Failed to fetch sites');
      }

      if (cmJson.success) {
        setEntries(cmJson.data.entries);
        setSummary(cmJson.data.summary);
        setMonthlyUsage(cmJson.data.monthlyUsage || []);
      } else {
        setError((previous) => previous || cmJson.error || 'Failed to fetch CM work');
      }
    } catch {
      setError('Failed to fetch contractor portal data');
    }
  }, [withContract]);

  useEffect(() => {
    fetchPortalData();
  }, [fetchPortalData]);

  const submitWork = async () => {
    setIsSubmitting(true);
    setMessage(null);

    const res = await fetch(withContract('/api/cm-work'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId,
        workDate,
        hours: Number(hours),
        technician,
        description,
      }),
    });
    const json = await res.json();

    if (json.success) {
      setMessage('Submitted for manager approval.');
      setSiteId('');
      setWorkDate('');
      setHours('');
      setTechnician('');
      setDescription('');
      await fetchPortalData();
    } else {
      setMessage(json.error || 'Could not submit CM work.');
    }

    setIsSubmitting(false);
  };

  const pendingEntries = entries.filter((entry) => entry.status === 'PENDING');
  const approvedEntries = entries.filter((entry) => entry.status === 'APPROVED');
  const latestMonth = monthlyUsage[monthlyUsage.length - 1];
  const officialRemaining = latestMonth?.cumulativeRemainingDays ?? summary?.remainingDays ?? 0;

  return (
    <div className="main-content">
      <div className="page-header">
        <h1>Contractor Portal</h1>
        <p>Submit corrective maintenance work and track approval status</p>
      </div>

      <div className="content">
        {error && (
          <ErrorPanel
            message={error}
            detail="Contractor portal data could not be loaded. Retry after checking the database/API configuration."
            onRetry={fetchPortalData}
          />
        )}
        <div className="stats-grid">
          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Available Sites</span>
              <div className="card-icon blue"><HardHat className="h-5 w-5 text-blue-600" /></div>
            </div>
            <div className="card-value">{sites.length}</div>
            <div className="card-sub">open for CM logging</div>
          </div>
          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">Pending</span>
              <div className="card-icon amber"><Clock className="h-5 w-5 text-amber-600" /></div>
            </div>
            <div className="card-value">{formatNumber(summary?.pendingDays || 0, 2)}</div>
            <div className="card-sub">{pendingEntries.length} submitted entries</div>
          </div>
          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Approved</span>
              <div className="card-icon green"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
            </div>
            <div className="card-value">{formatNumber(summary?.usedDays || 0, 2)}</div>
            <div className="card-sub">{approvedEntries.length} accepted entries</div>
          </div>
          <div className="card stat-card-purple">
            <div className="card-header">
              <span className="card-title">Remaining</span>
              <div className="card-icon purple"><Wrench className="h-5 w-5 text-purple-600" /></div>
            </div>
            <div className="card-value">{formatNumber(officialRemaining, 2)}</div>
            <div className="card-sub">cumulative official CM days</div>
          </div>
        </div>

        <div className="chart-card" style={{ marginBottom: '24px' }}>
          <div className="chart-title" style={{ marginBottom: '16px' }}>
            <Send className="h-5 w-5" />
            Submit CM Work
          </div>

          {message && <div className="formula-box" style={{ marginBottom: '16px' }}>{message}</div>}
          {sites.length === 0 && (
            <div className="formula-box" style={{ marginBottom: '16px' }}>
              No sites are available for CM logging yet. Ask a manager to import or add contracted sites.
            </div>
          )}

          <div className="form-grid contractor-primary" style={{ marginBottom: '12px' }}>
            <div className="form-field">
              <label>Site</label>
              <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                <option value="">Select site...</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>{site.spvCode ? `${site.spvCode} - ` : ''}{site.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Work Date</label>
              <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
            </div>
            <div className="form-field">
              <label>Hours</label>
              <input type="number" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} />
            </div>
            <div className="form-field">
              <label>Days</label>
              <input disabled value={(Number(hours || 0) / 8).toFixed(2)} />
            </div>
          </div>

          <div className="form-grid contractor-secondary">
            <div className="form-field">
              <label>Technician</label>
              <input value={technician} onChange={(event) => setTechnician(event.target.value)} />
            </div>
            <div className="form-field">
              <label>Description</label>
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <button onClick={submitWork} disabled={isSubmitting || !siteId || !workDate || !hours} className="primary-action">
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">My Submitted Work</div>
            <span className="badge badge-blue">{entries.length} entries</span>
          </div>
          <div className="table-container compact-mobile-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Site</th>
                  <th>Description</th>
                  <th>Hours</th>
                  <th>Days</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Date">{new Date(entry.workDate).toLocaleDateString('en-GB')}</td>
                    <td data-label="Site">{entry.site?.name || '-'}</td>
                    <td data-label="Description">{entry.description || '-'}</td>
                    <td data-label="Hours">{entry.hours.toFixed(2)}</td>
                    <td data-label="Days">{entry.days.toFixed(2)}</td>
                    <td data-label="Status"><span className={`status-badge ${entry.status === 'APPROVED' ? 'status-yes' : entry.status === 'REJECTED' ? 'status-no' : ''}`}>{entry.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContractorPortalPage() {
  return (
    <Suspense fallback={null}>
      <ContractorPortalContent />
    </Suspense>
  );
}
