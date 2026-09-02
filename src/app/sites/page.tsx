'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { SiteFormData, SiteWithCalculations, SPV } from '@/types';
import { formatCurrency, formatNumber, isOperationalPortfolioSite } from '@/lib/calculations';
import { CheckSquare, Download, Plus, Search, Settings2, Square } from 'lucide-react';
import Link from 'next/link';
import { canEditSites, useCurrentUser } from '@/lib/use-current-user';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useContractQuery } from '@/lib/use-contract-query';

const EXPORT_FIELD_GROUPS = [
  {
    label: 'Site Profile',
    fields: [
      ['name', 'Site Name'],
      ['systemSizeKwp', 'System Size (kWp)'],
      ['spvCode', 'SPV'],
      ['siteType', 'Site Type'],
      ['contractStatus', 'Contract Status'],
      ['billingPortfolio', 'Billing Portfolio'],
      ['forecastPacDate', 'Forecast PAC Date'],
      ['onboardDate', 'Onboard Date'],
    ],
  },
  {
    label: 'Operating Costs',
    fields: [
      ['pmCost', 'PM Cost (GBP/year)'],
      ['pmDaysOnSite', 'PM Days / Annum'],
      ['pmVisitsPerAnnum', 'PM Visits per Annum'],
      ['cctvCost', 'CCTV Cost (GBP/year)'],
      ['cleaningCost', 'Cleaning Cost (GBP/year)'],
      ['additionalCostAnnual', 'Additional Base Cost (GBP/year)'],
      ['additionalCostAnnualComment', 'Additional Base Cost Comment'],
      ['additionalCostMonthly', 'Additional Monthly Cost (GBP/month)'],
      ['additionalCostMonthlyComment', 'Additional Monthly Cost Comment'],
      ['additionalCostMonthlyStartMonth', 'Monthly Cost From'],
      ['additionalCostMonthlyEndMonth', 'Monthly Cost To'],
    ],
  },
  {
    label: 'Billing Outputs',
    fields: [
      ['siteFixedCosts', 'Site Fixed Costs (GBP/year)'],
      ['variableRate', 'Variable Rate (GBP/kWp)'],
      ['variableCost', 'Variable Cost (GBP/year)'],
      ['annualFee', 'Annual Fee (GBP/year)'],
      ['monthlyFee', 'Monthly Fee (GBP/month)'],
      ['unitCost', 'Unit Cost (GBP/kWp/year)'],
      ['pmFrequency', 'PM Frequency'],
      ['monitoredBy', 'Monitored By'],
    ],
  },
  {
    label: 'Source Metadata',
    fields: [
      ['sourceSheet', 'Source Sheet'],
      ['sourceRow', 'Source Row'],
      ['createdAt', 'Created At'],
      ['updatedAt', 'Updated At'],
    ],
  },
] as const;

const DEFAULT_EXPORT_FIELDS = [
  'name',
  'spvCode',
  'systemSizeKwp',
  'contractStatus',
  'billingPortfolio',
  'pmDaysOnSite',
  'pmVisitsPerAnnum',
  'siteFixedCosts',
  'annualFee',
  'monthlyFee',
];

const ALL_EXPORT_FIELDS = EXPORT_FIELD_GROUPS.flatMap((group) => group.fields.map(([key]) => key));

function SitesContent() {
  const { withContract } = useContractQuery();
  const [sites, setSites] = useState<SiteWithCalculations[]>([]);
  const [spvs, setSpvs] = useState<SPV[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [portfolioTab, setPortfolioTab] = useState<'ALL' | 'CORE' | 'EDEN'>('CORE');
  const [contractFilter, setContractFilter] = useState<'ALL' | 'Contracted' | 'Awaiting PAC' | 'Awaiting Contract'>('ALL');
  const [spvFilter, setSpvFilter] = useState('ALL');
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(DEFAULT_EXPORT_FIELDS);
  const [inlineEdits, setInlineEdits] = useState<Record<string, Partial<SiteFormData>>>({});
  const [savingSiteId, setSavingSiteId] = useState<string | null>(null);
  const { user } = useCurrentUser();
  const allowSiteEdits = canEditSites(user?.role);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(withContract('/api/sites'));
      const data = await res.json();
      
      if (data.success) {
        setSites(data.data);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to fetch sites');
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
      // Non-blocking: users can still edit non-SPV fields if SPVs fail to load.
    }
  }, [withContract]);

  useEffect(() => {
    fetchSites();
    fetchSpvs();
  }, [fetchSites, fetchSpvs]);

  const handleDelete = async (site: SiteWithCalculations) => {
    if (!confirm(`Are you sure you want to delete "${site.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(withContract(`/api/sites/${site.id}`), {
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

  const inlineValue = <K extends keyof SiteFormData>(
    site: SiteWithCalculations,
    field: K
  ) => {
    const currentValue = field === 'spvId' ? site.spvCode : site[field as keyof SiteWithCalculations];
    return inlineEdits[site.id]?.[field] ?? currentValue ?? '';
  };

  const inlineNumberValue = (
    site: SiteWithCalculations,
    field: keyof Pick<SiteFormData, 'systemSizeKwp' | 'pmDaysOnSite' | 'pmVisitsPerAnnum'>,
    decimals: number
  ) => {
    const editValue = inlineEdits[site.id]?.[field];
    if (editValue !== undefined && editValue !== null) return Number(editValue);
    const value = Number(site[field] || 0);
    return Number(value.toFixed(decimals));
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

  const isSiteDirty = (site: SiteWithCalculations) => {
    const edits = inlineEdits[site.id];
    if (!edits) return false;
    return Object.entries(edits).some(([field, value]) => {
      const current = field === 'spvId' ? site.spvCode ?? '' : site[field as keyof SiteWithCalculations] ?? '';
      return (value ?? '') !== current;
    });
  };

  const saveInlineSite = async (site: SiteWithCalculations, overrideEdits: Partial<SiteFormData> = {}) => {
    const edits = { ...(inlineEdits[site.id] || {}), ...overrideEdits };
    if (Object.keys(edits).length === 0) return;
    const contractStatus = (edits.contractStatus || site.contractStatus) as SiteFormData['contractStatus'];
    const movesToPipeline = contractStatus !== 'Contracted' && contractStatus !== 'Yes';

    setSavingSiteId(site.id);
    try {
      const payload: SiteFormData = {
        name: edits.name ?? site.name,
        systemSizeKwp: Number(edits.systemSizeKwp ?? site.systemSizeKwp),
        siteType: edits.siteType ?? site.siteType,
        contractStatus,
        onboardDate: edits.onboardDate ?? site.onboardDate,
        forecastPacDate: (edits.forecastPacDate ?? site.forecastPacDate ?? (movesToPipeline ? site.onboardDate : null)) || null,
        actualPacDate: (edits.actualPacDate ?? site.actualPacDate) || null,
        pmCost: Number(edits.pmCost ?? site.pmCost),
        pmDaysOnSite: Number(edits.pmDaysOnSite ?? site.pmDaysOnSite),
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
        alert(data.error || 'Failed to update site');
        return;
      }
      setSites((prev) => (
        movesToPipeline
          ? prev.filter((item) => item.id !== site.id)
          : prev.map((item) => item.id === site.id ? data.data : item)
      ));
      setInlineEdits((prev) => {
        const next = { ...prev };
        delete next[site.id];
        return next;
      });
    } catch {
      alert('Failed to update site');
    } finally {
      setSavingSiteId(null);
    }
  };

  const handleInlineStatusChange = (site: SiteWithCalculations, status: SiteFormData['contractStatus']) => {
    if (status === 'Contracted' || status === 'Yes') {
      void saveInlineSite(site, { contractStatus: status });
      return;
    }
    void saveInlineSite(site, { contractStatus: status, forecastPacDate: site.forecastPacDate || site.onboardDate });
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

  const exportExcel = () => {
    window.location.href = withContract('/api/export/excel');
  };

  const exportCustomExcel = () => {
    const params = new URLSearchParams({
      mode: 'custom',
      fields: selectedExportFields.join(','),
    });
    window.location.href = withContract(`/api/export/excel?${params.toString()}`);
  };

  const toggleExportField = (field: string) => {
    setSelectedExportFields((prev) => (
      prev.includes(field)
        ? prev.filter((item) => item !== field)
        : [...prev, field]
    ));
  };

  const selectExportGroup = (fields: readonly (readonly [string, string])[]) => {
    const keys = fields.map(([key]) => key);
    setSelectedExportFields((prev) => Array.from(new Set([...prev, ...keys])));
  };

  const activeSites = useMemo(
    () => sites.filter(isOperationalPortfolioSite),
    [sites]
  );

  const availableSpvs = useMemo(() => {
    return Array.from(new Set(activeSites.map((site) => site.spvCode).filter(Boolean) as string[])).sort();
  }, [activeSites]);

  const portfolioCounts = useMemo(() => ({
    ALL: activeSites.length,
    CORE: activeSites.filter((site) => site.billingPortfolio !== 'EDEN').length,
    EDEN: activeSites.filter((site) => site.billingPortfolio === 'EDEN').length,
  }), [activeSites]);

  // Eden runs as its own contract. The Core/Eden tabs only mean something for a contract that
  // still holds both, so a single-portfolio contract shows its sites without the split.
  const hasMixedPortfolios = portfolioCounts.CORE > 0 && portfolioCounts.EDEN > 0;

  const filteredSites = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeSites.filter((site) => {
      const matchesSearch = !term ||
        site.name.toLowerCase().includes(term) ||
        site.spvCode?.toLowerCase().includes(term) ||
        site.siteType?.toLowerCase().includes(term) ||
        site.billingPortfolio.toLowerCase().includes(term);
      const matchesPortfolio =
        !hasMixedPortfolios ||
        portfolioTab === 'ALL' ||
        (portfolioTab === 'EDEN' ? site.billingPortfolio === 'EDEN' : site.billingPortfolio !== 'EDEN');
      const matchesContract =
        contractFilter === 'ALL' ||
        contractFilter === site.contractStatus;
      const matchesSpv = spvFilter === 'ALL' || site.spvCode === spvFilter;
      return matchesSearch && matchesPortfolio && matchesContract && matchesSpv;
    });
  }, [activeSites, contractFilter, hasMixedPortfolios, portfolioTab, search, spvFilter]);

  // Calculate totals
  const totalCapacity = filteredSites.reduce((sum, s) => sum + (s.systemSizeKwp || 0), 0);
  const totalMonthlyFee = filteredSites.reduce((sum, s) => sum + (s.monthlyFee || 0), 0);
  const contractedCount = filteredSites.filter(s => s.contractStatus === 'Contracted' || s.contractStatus === 'Yes').length;

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
        <h1>Sites</h1>
        <p>{activeSites.length} contracted sites with onboard dates</p>
      </div>

      <div className="content">
        {/* Summary Stats */}
        {error && (
          <ErrorPanel
            message={error}
            detail="Site data could not be loaded. Retry after checking the database/API configuration."
            onRetry={fetchSites}
          />
        )}
        <div className="stats-grid">
          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Total Sites</span>
            </div>
            <div className="card-value">{filteredSites.length}</div>
            <div className="card-sub"><span>{contractedCount}</span> contracted</div>
          </div>
          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">Total Capacity</span>
            </div>
            <div className="card-value">{formatNumber(totalCapacity / 1000, 1)} MW</div>
            <div className="card-sub">{formatNumber(totalCapacity, 0)} kWp</div>
          </div>
          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Monthly Revenue</span>
            </div>
            <div className="card-value">{formatCurrency(totalMonthlyFee)}</div>
            <div className="card-sub"><span>{formatCurrency(totalMonthlyFee * 12)}</span> annually</div>
          </div>
          <div className="card stat-card-purple">
            <div className="card-header">
              <span className="card-title">Avg Fee/kWp</span>
            </div>
            <div className="card-value">£{totalCapacity > 0 ? (totalMonthlyFee / totalCapacity * 12).toFixed(2) : '0.00'}</div>
            <div className="card-sub">per year</div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="page-actions">
          <div className="search-box">
            <Search className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search sites..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="button-row">
            <button onClick={() => setShowExportPanel((value) => !value)} className="secondary-action">
              <Settings2 className="h-4 w-4" />
              Bespoke Export
            </button>
            <button onClick={exportExcel} className="secondary-action">
              <Download className="h-4 w-4" />
              Standard Export
            </button>
            {allowSiteEdits && (
              <Link href={withContract('/sites/new')} className="primary-action">
                  <Plus className="h-4 w-4" />
                  Add Site
              </Link>
            )}
          </div>
        </div>

        {hasMixedPortfolios && (
        <div className="portfolio-tabs" role="tablist" aria-label="Site portfolio">
          {[
            ['CORE', 'ADE Portfolio'],
            ['EDEN', 'Eden'],
            ['ALL', 'All Sites'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={portfolioTab === value}
              className={portfolioTab === value ? 'active' : ''}
              onClick={() => setPortfolioTab(value as 'ALL' | 'CORE' | 'EDEN')}
            >
              <span>{label}</span>
              <strong>{portfolioCounts[value as keyof typeof portfolioCounts]}</strong>
            </button>
          ))}
        </div>
        )}

        <div className="filter-strip">
          <div className="filter-strip-title">
            <Settings2 className="h-4 w-4" />
            <span>Filters</span>
          </div>
          <label className="filter-field">
            <span>Contract Status</span>
            <select value={contractFilter} onChange={(event) => setContractFilter(event.target.value as 'ALL' | 'Contracted' | 'Awaiting PAC' | 'Awaiting Contract')}>
              <option value="ALL">All statuses</option>
              <option value="Contracted">Contracted</option>
              <option value="Awaiting PAC">Awaiting PAC</option>
              <option value="Awaiting Contract">Awaiting Contract</option>
            </select>
          </label>
          <label className="filter-field">
            <span>SPV</span>
            <select value={spvFilter} onChange={(event) => setSpvFilter(event.target.value)}>
              <option value="ALL">All SPVs</option>
              {availableSpvs.map((spv) => (
                <option key={spv} value={spv}>{spv}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="filter-clear-button"
            onClick={() => {
              setSearch('');
              setPortfolioTab('ALL');
              setContractFilter('ALL');
              setSpvFilter('ALL');
            }}
          >
            Clear
          </button>
        </div>

        {showExportPanel && (
          <div className="export-panel">
            <div className="export-panel-header">
              <div>
                <h2>Bespoke Site Export</h2>
                <p>Select the fields to include in a custom Excel workbook.</p>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-action" onClick={() => setSelectedExportFields(ALL_EXPORT_FIELDS)}>
                  Select All
                </button>
                <button type="button" className="secondary-action" onClick={() => setSelectedExportFields(DEFAULT_EXPORT_FIELDS)}>
                  Default
                </button>
                <button type="button" className="secondary-action" onClick={() => setSelectedExportFields([])}>
                  Clear
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={exportCustomExcel}
                  disabled={selectedExportFields.length === 0}
                >
                  <Download className="h-4 w-4" />
                  Export {selectedExportFields.length} Fields
                </button>
              </div>
            </div>
            <div className="export-field-grid">
              {EXPORT_FIELD_GROUPS.map((group) => (
                <div className="export-field-group" key={group.label}>
                  <div className="export-field-group-header">
                    <h3>{group.label}</h3>
                    <button type="button" onClick={() => selectExportGroup(group.fields)}>
                      Add group
                    </button>
                  </div>
                  <div className="export-field-list">
                    {group.fields.map(([key, label]) => {
                      const checked = selectedExportFields.includes(key);
                      return (
                        <label className="export-field-option" key={key}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleExportField(key)}
                          />
                          {checked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sites Table */}
        <div className="chart-card sites-edit-card">
          <div className="sites-edit-header">
            <div>
              <h2>Editable site register</h2>
              <p>Changes auto-save when you leave a field; dropdown changes save immediately.</p>
            </div>
            {allowSiteEdits && <span>{savingSiteId ? 'Saving' : 'Auto-save'}</span>}
          </div>
          <div className="table-container compact-mobile-table sites-edit-table-container">
            <table className="sites-edit-table">
              <colgroup>
                <col className="sites-col-name" />
                <col className="sites-col-status" />
                <col className="sites-col-date" />
                <col className="sites-col-spv" />
                <col className="sites-col-portfolio" />
                <col className="sites-col-type" />
                <col className="sites-col-number" />
                <col className="sites-col-number" />
                <col className="sites-col-number" />
                <col className="sites-col-money" />
                <col className="sites-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>Site Name</th>
                  <th>Status</th>
                  <th>Onboard Date</th>
                  <th>SPV</th>
                  <th>Portfolio</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>PM Days / Annum</th>
                  <th>PM Visits</th>
                  <th>Monthly Fee</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSites.length === 0 ? (
                  <tr>
                    <td data-label="Sites" colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      {search || portfolioTab !== 'ALL' || contractFilter !== 'ALL' || spvFilter !== 'ALL'
                        ? 'No sites match the current filters'
                        : 'No onboarded sites yet. Pipeline sites will appear here once they have an onboard date.'}
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
                          <Link href={withContract(`/sites/${site.id}`)} className="site-link" style={{ fontWeight: 500 }}>
                            {site.name}
                          </Link>
                        )}
                      </td>
                      <td data-label="Status">
                        {allowSiteEdits ? (
                          <select
                            className="inline-table-select inline-table-status"
                            value={String(inlineValue(site, 'contractStatus'))}
                            onChange={(event) => handleInlineStatusChange(site, event.target.value as SiteFormData['contractStatus'])}
                          >
                            <option value="Contracted">Contracted</option>
                            <option value="Awaiting PAC">Awaiting PAC</option>
                            <option value="Awaiting Contract">Awaiting Contract</option>
                          </select>
                        ) : (
                          <span className={`status-badge ${site.contractStatus === 'Contracted' || site.contractStatus === 'Yes' ? 'status-yes' : 'status-no'}`}>
                            {site.contractStatus === 'Yes' ? 'Contracted' : site.contractStatus}
                          </span>
                        )}
                      </td>
                      <td data-label="Onboard Date">
                        {allowSiteEdits ? (
                          <input
                            className="inline-table-input inline-table-date"
                            type="date"
                            aria-label="Onboard Date"
                            value={String(inlineValue(site, 'onboardDate'))}
                            onChange={(event) => updateInlineEdit(site, 'onboardDate', event.target.value)}
                            onBlur={(event) => void saveInlineSite(site, { onboardDate: event.target.value || null })}
                          />
                        ) : (
                          site.onboardDate
                            ? new Date(site.onboardDate).toLocaleDateString('en-GB')
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
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td data-label="Portfolio">
                        {allowSiteEdits ? (
                          <select
                            className="inline-table-select inline-table-compact"
                            value={String(inlineValue(site, 'billingPortfolio'))}
                            onChange={(event) => autoSaveInlineEdit(site, 'billingPortfolio', event.target.value)}
                          >
                            <option value="CORE">ADE Portfolio</option>
                            <option value="EDEN">Eden</option>
                          </select>
                        ) : (
                          <span className={`status-badge ${site.billingPortfolio === 'EDEN' ? '' : 'status-yes'}`} style={site.billingPortfolio === 'EDEN' ? { background: '#ede9fe', color: '#6d28d9' } : undefined}>
                            {site.billingPortfolio === 'EDEN' ? 'Eden' : 'ADE Portfolio'}
                          </span>
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
                        ) : site.siteType || '—'}
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
                          `${formatNumber(site.systemSizeKwp || 0, 0)} kWp`
                        )}
                      </td>
                      <td data-label="PM Days / Annum">
                        {allowSiteEdits ? (
                          <input
                            className="inline-table-input inline-table-number"
                            type="number"
                            step="0.1"
                            value={inlineNumberValue(site, 'pmDaysOnSite', 2)}
                            onChange={(event) => updateInlineEdit(site, 'pmDaysOnSite', Number(event.target.value))}
                            onBlur={(event) => void saveInlineSite(site, { pmDaysOnSite: Number(event.target.value) })}
                          />
                        ) : (
                          formatNumber(site.pmDaysOnSite || 0, site.pmDaysOnSite % 1 === 0 ? 0 : 1)
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
                          site.pmVisitsPerAnnum > 0 ? formatNumber(site.pmVisitsPerAnnum, 2) : ''
                        )}
                      </td>
                      <td data-label="Monthly Fee" style={{ fontWeight: 600, color: 'var(--green)' }}>
                        {formatCurrency(site.monthlyFee || 0)}
                      </td>
                      <td data-label="Actions">
                        <div className="button-row sites-edit-actions">
                          <Link href={withContract(`/sites/${site.id}`)} className="secondary-action">
                              View
                          </Link>
                          {allowSiteEdits && (
                            <button
                              onClick={() => handleDelete(site)}
                              className="secondary-action"
                              style={{ color: 'var(--red)' }}
                            >
                              Delete
                            </button>
                          )}
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

export default function SitesPage() {
  return (
    <Suspense fallback={null}>
      <SitesContent />
    </Suspense>
  );
}
