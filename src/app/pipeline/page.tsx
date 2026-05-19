'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, FileText, Plus, Search, Zap } from 'lucide-react';
import { SiteFormData, SiteWithCalculations, SPV } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { canEditSites, useCurrentUser } from '@/lib/use-current-user';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useContractQuery } from '@/lib/use-contract-query';

function PipelineContent() {
  const { withContract } = useContractQuery();
  const [sites, setSites] = useState<SiteWithCalculations[]>([]);
  const [spvs, setSpvs] = useState<SPV[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [inlineEdits, setInlineEdits] = useState<Record<string, Partial<SiteFormData>>>({});
  const [savingSiteId, setSavingSiteId] = useState<string | null>(null);
  const { user } = useCurrentUser();
  const allowSiteEdits = canEditSites(user?.role);

  const fetchPipelineSites = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(withContract('/api/sites?sortBy=name&sortOrder=asc'));
      const data = await res.json();

      if (data.success) {
        setSites(data.data.filter((site: SiteWithCalculations) => site.contractStatus !== 'Contracted' && site.contractStatus !== 'Yes'));
      } else {
        setError(data.error || 'Failed to fetch pipeline sites');
      }
    } catch {
      setError('Failed to fetch pipeline sites');
    } finally {
      setIsLoading(false);
    }
  }, [withContract]);

  const fetchSpvs = useCallback(async () => {
    try {
      const res = await fetch(withContract('/api/spvs'));
      const data = await res.json();
      if (data.success) setSpvs(data.data);
    } catch {
      // Pipeline remains editable for non-SPV fields if this fails.
    }
  }, [withContract]);

  useEffect(() => {
    fetchPipelineSites();
    fetchSpvs();
  }, [fetchPipelineSites, fetchSpvs]);

  const updateVisibleSites = (updatedSite: SiteWithCalculations) => {
    setSites((prev) => {
      if (isContractedStatus(updatedSite.contractStatus)) {
        return prev.filter((site) => site.id !== updatedSite.id);
      }
      return prev.map((site) => site.id === updatedSite.id ? updatedSite : site);
    });
  };

  const inlineValue = <K extends keyof SiteFormData>(
    site: SiteWithCalculations,
    field: K
  ) => {
    const currentValue = field === 'spvId' ? site.spvCode : site[field as keyof SiteWithCalculations];
    return inlineEdits[site.id]?.[field] ?? currentValue ?? '';
  };

  const inlineNumberValue = (
    site: SiteWithCalculations,
    field: keyof Pick<SiteFormData, 'systemSizeKwp' | 'pmVisitsPerAnnum'>,
    decimals: number
  ) => {
    const editValue = inlineEdits[site.id]?.[field];
    if (editValue !== undefined && editValue !== null) return Number(editValue);
    const value = Number(site[field] || 0);
    return Number(value.toFixed(decimals));
  };

  const isContractedStatus = (status: string | null | undefined) => status === 'Contracted' || status === 'Yes';
  const inlineContractStatus = (site: SiteWithCalculations) => String(inlineValue(site, 'contractStatus'));
  const inlineDateField = (site: SiteWithCalculations): 'onboardDate' | 'forecastPacDate' => (
    isContractedStatus(inlineContractStatus(site))
      ? 'onboardDate'
      : 'forecastPacDate'
  );
  const inlinePacOrOnboardDate = (site: SiteWithCalculations) => {
    const primary = inlineValue(site, inlineDateField(site));
    const fallback = inlineDateField(site) === 'onboardDate'
      ? inlineValue(site, 'forecastPacDate')
      : inlineValue(site, 'onboardDate');
    return String(primary || fallback || '');
  };

  const updateInlineEdit = (
    site: SiteWithCalculations,
    field: keyof SiteFormData,
    value: SiteFormData[keyof SiteFormData] | string | number | null
  ) => {
    setInlineEdits((prev) => ({
      ...prev,
      [site.id]: {
        ...(prev[site.id] || {}),
        [field]: value === '' ? null : value,
      },
    }));
  };

  const updateInlinePacOrOnboardDate = (site: SiteWithCalculations, value: string) => {
    updateInlineEdit(site, inlineDateField(site), value);
  };

  const autoSaveInlineEdit = (
    site: SiteWithCalculations,
    field: keyof SiteFormData,
    value: SiteFormData[keyof SiteFormData] | string | number | null
  ) => {
    const normalizedValue = value === '' ? null : value;
    updateInlineEdit(site, field, normalizedValue);
    void saveInlineSite(site, { [field]: normalizedValue } as Partial<SiteFormData>);
  };

  const normalizeDateForInput = (value: string | Date | null | undefined) => {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  };

  const isSiteDirty = (site: SiteWithCalculations) => {
    const edits = inlineEdits[site.id];
    if (!edits) return false;
    return Object.entries(edits).some(([field, value]) => {
      const current = field === 'spvId' ? site.spvCode ?? '' : site[field as keyof SiteWithCalculations] ?? '';
      return (value ?? '') !== current;
    });
  };

  const saveInlineSite = async (
    site: SiteWithCalculations,
    overrideEdits: Partial<SiteFormData> = {}
  ) => {
    const edits = { ...(inlineEdits[site.id] || {}), ...overrideEdits };
    if (!edits) return;

    const contractStatus = (edits.contractStatus || site.contractStatus) as SiteFormData['contractStatus'];
    const isContracted = isContractedStatus(contractStatus);
    const dateValue = isContracted
      ? (edits.onboardDate ?? site.onboardDate ?? edits.forecastPacDate ?? site.forecastPacDate)
      : (edits.forecastPacDate ?? edits.onboardDate ?? site.forecastPacDate ?? site.onboardDate);

    setSavingSiteId(site.id);
    try {
      const payload: SiteFormData = {
        name: edits.name ?? site.name,
        systemSizeKwp: Number(edits.systemSizeKwp ?? site.systemSizeKwp),
        siteType: edits.siteType ?? site.siteType,
        contractStatus,
        onboardDate: isContracted ? dateValue || null : null,
        forecastPacDate: isContracted ? null : dateValue || null,
        actualPacDate: site.actualPacDate,
        pmCost: site.pmCost,
        pmDaysOnSite: site.pmDaysOnSite,
        pmVisitsPerAnnum: Number(edits.pmVisitsPerAnnum ?? site.pmVisitsPerAnnum),
        cctvCost: site.cctvCost,
        cleaningCost: site.cleaningCost,
        additionalCostAnnual: site.additionalCostAnnual,
        additionalCostAnnualComment: site.additionalCostAnnualComment,
        additionalCostMonthly: site.additionalCostMonthly,
        additionalCostMonthlyComment: site.additionalCostMonthlyComment,
        additionalCostMonthlyStartMonth: site.additionalCostMonthlyStartMonth,
        additionalCostMonthlyEndMonth: site.additionalCostMonthlyEndMonth,
        billingPortfolio: edits.billingPortfolio ?? site.billingPortfolio,
        spvId: edits.spvId === undefined ? site.spvCode : edits.spvId,
      };

      const res = await fetch(withContract(`/api/sites/${site.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Failed to update pipeline site');
        return;
      }
      updateVisibleSites(data.data);
      setInlineEdits((prev) => {
        const next = { ...prev };
        delete next[site.id];
        return next;
      });
    } catch {
      alert('Failed to update pipeline site');
    } finally {
      setSavingSiteId(null);
    }
  };

  const handlePipelineStatusChange = async (site: SiteWithCalculations, status: string) => {
    if (!isContractedStatus(status)) {
      await saveInlineSite(site, { contractStatus: status as SiteFormData['contractStatus'] });
      return;
    }

    const suggestedDate = normalizeDateForInput(
      inlineEdits[site.id]?.onboardDate ||
      site.onboardDate ||
      inlineEdits[site.id]?.forecastPacDate ||
      site.forecastPacDate
    );
    const onboardDate = window.prompt(
      'Enter onboard date for this contracted site (YYYY-MM-DD). The forecast PAC date will be cleared.',
      suggestedDate
    );

    if (onboardDate === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(onboardDate) || Number.isNaN(new Date(onboardDate).getTime())) {
      alert('Please enter a valid onboard date in YYYY-MM-DD format before moving this site to Sites.');
      return;
    }

    await saveInlineSite(site, {
      contractStatus: 'Contracted',
      onboardDate,
      forecastPacDate: null,
    });
  };

  const filteredSites = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sites;
    return sites.filter((site) => (
      site.name.toLowerCase().includes(query) ||
      site.spvCode?.toLowerCase().includes(query) ||
      site.siteType?.toLowerCase().includes(query) ||
      site.billingPortfolio.toLowerCase().includes(query)
    ));
  }, [search, sites]);

  const totalCapacityKwp = filteredSites.reduce((sum, site) => sum + (site.systemSizeKwp || 0), 0);
  const annualFixedCost = filteredSites.reduce((sum, site) => sum + (site.siteFixedCosts || 0), 0);
  const assignedCount = filteredSites.filter((site) => Boolean(site.spvCode)).length;
  const portfolioCount = new Set(filteredSites.map((site) => site.billingPortfolio)).size;

  if (isLoading) {
    return (
      <div className="main-content flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="page-header">
        <span className="eyebrow">Portfolio pipeline</span>
        <h1>Pipeline</h1>
        <p>Sites awaiting contract or PAC. These are excluded from contracted billing until the site is onboarded.</p>
      </div>

      <div className="content">
        {error && (
          <ErrorPanel
            message={error}
            detail="Pipeline data could not be loaded. Retry after checking the sites API."
            onRetry={fetchPipelineSites}
          />
        )}

        <div className="stats-grid">
          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">Pipeline Sites</span>
              <div className="card-icon amber"><Clock className="h-5 w-5" /></div>
            </div>
            <div className="card-value">{filteredSites.length}</div>
            <div className="card-sub">awaiting contract or PAC</div>
          </div>

          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Pipeline Capacity</span>
              <div className="card-icon blue"><Zap className="h-5 w-5" /></div>
            </div>
            <div className="card-value">{formatNumber(totalCapacityKwp / 1000, 2)} MW</div>
            <div className="card-sub">{formatNumber(totalCapacityKwp, 0)} kWp in pipeline</div>
          </div>

          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Assigned to SPV</span>
              <div className="card-icon green"><FileText className="h-5 w-5" /></div>
            </div>
            <div className="card-value">{assignedCount}</div>
            <div className="card-sub">{filteredSites.length - assignedCount} unassigned</div>
          </div>

          <div className="card stat-card-purple">
            <div className="card-header">
              <span className="card-title">Known Fixed Costs</span>
            </div>
            <div className="card-value">{formatCurrency(annualFixedCost)}</div>
            <div className="card-sub">{portfolioCount || 0} billing portfolio{portfolioCount === 1 ? '' : 's'}</div>
          </div>
        </div>

        <div className="page-actions">
          <div className="search-box">
            <Search className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search pipeline..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {allowSiteEdits && (
            <Link href={withContract('/sites/new')} className="primary-action">
              <Plus className="h-4 w-4" />
              Add Pipeline Site
            </Link>
          )}
        </div>

        <div className="chart-card sites-edit-card">
          <div className="sites-edit-header">
            <div>
              <h2>Pipeline Sites</h2>
              <p>Pipeline changes auto-save when you leave a field; dropdown changes save immediately.</p>
            </div>
            <span>{allowSiteEdits ? (savingSiteId ? 'Saving' : 'Auto-save') : 'Pipeline'}</span>
          </div>

          <div className="table-container compact-mobile-table sites-edit-table-container">
            <table className="sites-edit-table pipeline-edit-table">
              <colgroup>
                <col className="sites-col-name" />
                <col className="sites-col-status" />
                <col className="sites-col-date" />
                <col className="sites-col-spv" />
                <col className="sites-col-portfolio" />
                <col className="sites-col-type" />
                <col className="sites-col-number" />
                <col className="sites-col-number" />
                <col className="sites-col-money" />
                <col className="sites-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Forecast / Onboard</th>
                  <th>SPV</th>
                  <th>Portfolio</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>PM Visits</th>
                  <th>Fixed Costs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSites.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      {search ? 'No pipeline sites match your search.' : 'No sites are currently awaiting PAC.'}
                    </td>
                  </tr>
                ) : (
                  filteredSites.map((site) => (
                    <tr key={site.id} className={isSiteDirty(site) ? 'site-row-dirty' : undefined}>
                      <td data-label="Site">
                        {allowSiteEdits ? (
                          <input
                            className="inline-table-input inline-table-name"
                            value={String(inlineValue(site, 'name'))}
                            onChange={(event) => updateInlineEdit(site, 'name', event.target.value)}
                            onBlur={(event) => void saveInlineSite(site, { name: event.target.value })}
                          />
                        ) : (
                          <Link href={withContract(`/sites/${site.id}`)} className="site-link">
                            {site.name}
                          </Link>
                        )}
                      </td>
                      <td data-label="Status">
                        {allowSiteEdits ? (
                          <select
                            className="inline-table-select inline-table-status"
                            value={inlineContractStatus(site)}
                            onChange={(event) => handlePipelineStatusChange(site, event.target.value)}
                          >
                            <option value="Awaiting PAC">Awaiting PAC</option>
                            <option value="Awaiting Contract">Awaiting Contract</option>
                            <option value="Contracted">Contracted</option>
                          </select>
                        ) : (
                          <span className="status-badge status-no">{site.contractStatus === 'No' ? 'Awaiting PAC' : site.contractStatus}</span>
                        )}
                      </td>
                      <td data-label="Forecast / Onboard">
                        {allowSiteEdits ? (
                          <input
                            className="inline-table-input inline-table-date"
                            type="date"
                            aria-label={inlineDateField(site) === 'onboardDate' ? 'Onboard Date' : 'Forecast PAC Date'}
                            value={inlinePacOrOnboardDate(site)}
                            onChange={(event) => updateInlinePacOrOnboardDate(site, event.target.value)}
                            onBlur={(event) => void saveInlineSite(site, {
                              [inlineDateField(site)]: event.target.value || null,
                            } as Partial<SiteFormData>)}
                          />
                        ) : (
                          site.onboardDate
                            ? new Date(site.onboardDate).toLocaleDateString('en-GB')
                            : site.forecastPacDate
                              ? new Date(site.forecastPacDate).toLocaleDateString('en-GB')
                              : '-'
                        )}
                      </td>
                      <td data-label="SPV">
                        {allowSiteEdits ? (
                          <select
                            className="inline-table-select inline-table-compact"
                            value={String(inlineValue(site, 'spvId'))}
                            onChange={(event) => autoSaveInlineEdit(site, 'spvId', event.target.value)}
                          >
                            <option value="">None</option>
                            {spvs.map((spv) => (
                              <option key={spv.id} value={spv.code}>{spv.code}</option>
                            ))}
                          </select>
                        ) : site.spvCode ? (
                          <span className="badge badge-blue">{site.spvCode}</span>
                        ) : (
                          <span className="muted-cell">Unassigned</span>
                        )}
                      </td>
                      <td data-label="Portfolio">
                        {allowSiteEdits ? (
                          <select
                            className="inline-table-select inline-table-compact"
                            value={String(inlineValue(site, 'billingPortfolio'))}
                            onChange={(event) => autoSaveInlineEdit(site, 'billingPortfolio', event.target.value)}
                          >
                            <option value="CORE">Core</option>
                            <option value="EDEN">Eden</option>
                          </select>
                        ) : (
                          site.billingPortfolio === 'EDEN' ? 'Eden' : 'Core'
                        )}
                      </td>
                      <td data-label="Type">
                        {allowSiteEdits ? (
                          <select
                            className="inline-table-select inline-table-type"
                            value={String(inlineValue(site, 'siteType'))}
                            onChange={(event) => autoSaveInlineEdit(site, 'siteType', event.target.value)}
                          >
                            <option value="Rooftop">Rooftop</option>
                            <option value="Ground Mount">Ground Mount</option>
                          </select>
                        ) : site.siteType}
                      </td>
                      <td data-label="Capacity">
                        {allowSiteEdits ? (
                          <input
                            className="inline-table-input inline-table-number"
                            type="number"
                            step="0.01"
                            value={inlineNumberValue(site, 'systemSizeKwp', 2)}
                            onChange={(event) => updateInlineEdit(site, 'systemSizeKwp', Number(event.target.value))}
                            onBlur={(event) => void saveInlineSite(site, { systemSizeKwp: Number(event.target.value) })}
                          />
                        ) : (
                          `${formatNumber(site.systemSizeKwp / 1000, 2)} MW`
                        )}
                      </td>
                      <td data-label="PM Visits">
                        {allowSiteEdits ? (
                          <input
                            className="inline-table-input inline-table-number"
                            type="number"
                            step="0.01"
                            value={inlineNumberValue(site, 'pmVisitsPerAnnum', 2)}
                            onChange={(event) => updateInlineEdit(site, 'pmVisitsPerAnnum', Number(event.target.value))}
                            onBlur={(event) => void saveInlineSite(site, { pmVisitsPerAnnum: Number(event.target.value) })}
                          />
                        ) : (
                          formatNumber(site.pmVisitsPerAnnum || 0, 0)
                        )}
                      </td>
                      <td data-label="Fixed Costs" style={{ fontWeight: 600 }}>{formatCurrency(site.siteFixedCosts || 0)}</td>
                      <td data-label="Actions">
                        <div className="button-row sites-edit-actions">
                          <Link href={withContract(`/sites/${site.id}`)} className="secondary-action">
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={null}>
      <PipelineContent />
    </Suspense>
  );
}
