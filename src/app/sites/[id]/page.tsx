'use client';

import { Suspense, type ReactNode, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SiteForm } from '@/components/sites/SiteForm';
import { Badge } from '@/components/ui/badge';
import { SiteWithCalculations, SPV, SiteFormData } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import {
  ArrowLeft,
  Building2,
  Calculator,
  FileText,
  Landmark,
  Pencil,
  PoundSterling,
  ShieldCheck,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { canEditSites, useCurrentUser } from '@/lib/use-current-user';
import { useContractQuery } from '@/lib/use-contract-query';

function DetailMetric({
  label,
  value,
  sub,
  tone = 'blue',
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'blue' | 'amber' | 'green' | 'purple';
  icon: ReactNode;
}) {
  const toneClass = {
    blue: 'stat-card-blue',
    amber: 'stat-card-amber',
    green: 'stat-card-green',
    purple: 'stat-card-purple',
  }[tone];

  return (
    <div className={`card ${toneClass}`}>
      <div className="card-header">
        <span className="card-title">{label}</span>
        <div className={`card-icon ${tone}`}>{icon}</div>
      </div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  );
}

function DetailRow({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function PricingVerificationCard({ site }: { site: SiteWithCalculations }) {
  const breakdown = site.pricingBreakdown;
  const statusClass = breakdown.reviewStatus === 'VERIFIED' ? 'pricing-status-verified' : 'pricing-status-review';
  const statusLabel = breakdown.reviewStatus === 'VERIFIED' ? 'Verified' : 'Needs review';

  return (
    <div className="pricing-verification-card">
      <div className="pricing-verification-header">
        <div>
          <div className="chart-title">
            <ShieldCheck className="h-5 w-5" />
            Pricing Verification
          </div>
          <p>{breakdown.reviewReason}</p>
        </div>
        <div className="pricing-verification-actions">
          <span className={statusClass}>{statusLabel}</span>
          <span className="status-badge status-yes">{formatCurrency(breakdown.monthlyFee)}/month</span>
        </div>
      </div>

      <div className="pricing-verification-summary">
        <div>
          <span>Applied tier</span>
          <strong>{breakdown.appliedTierName}</strong>
        </div>
        <div>
          <span>Tier capacity basis</span>
          <strong>{formatNumber(breakdown.contractedCapacityKwpForTier / 1000, 2)} MW</strong>
        </div>
        <div>
          <span>Rate applied</span>
          <strong>{formatCurrency(breakdown.appliedTierRatePerKwp)}/kWp</strong>
        </div>
        <div>
          <span>Annual fee</span>
          <strong>{formatCurrency(breakdown.annualFee)}</strong>
        </div>
      </div>

      <div className="pricing-formula">
        <Calculator className="h-4 w-4" />
        <span>{breakdown.formula}</span>
      </div>

      <div className="pricing-breakdown-table">
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Calculation</th>
              <th className="numeric">Value</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.lines.map((line) => (
              <tr key={line.label}>
                <td data-label="Component">
                  <strong>{line.label}</strong>
                  {line.note ? <small>{line.note}</small> : null}
                </td>
                <td data-label="Calculation">{line.calculation}</td>
                <td data-label="Value" className="numeric strong">{formatCurrency(line.annualValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SiteDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { withContract } = useContractQuery();
  const [site, setSite] = useState<SiteWithCalculations | null>(null);
  const [spvs, setSpvs] = useState<SPV[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useCurrentUser();
  const allowSiteEdits = canEditSites(user?.role);

  const fetchSite = useCallback(async () => {
    try {
      const res = await fetch(withContract(`/api/sites/${params.id}`));
      const data = await res.json();
      
      if (data.success) {
        setSite(data.data);
      } else {
        setError(data.error || 'Site not found');
      }
    } catch {
      setError('Failed to fetch site');
    } finally {
      setIsLoading(false);
    }
  }, [params.id, withContract]);

  const fetchSpvs = useCallback(async () => {
    try {
      const res = await fetch(withContract('/api/spvs'));
      const data = await res.json();
      if (data.success) {
        setSpvs(data.data);
      }
    } catch {
      console.error('Failed to fetch SPVs');
    }
  }, [withContract]);

  useEffect(() => {
    fetchSite();
    fetchSpvs();
  }, [fetchSite, fetchSpvs]);

  const handleUpdate = async (formData: SiteFormData) => {
    setIsSaving(true);
    try {
      const res = await fetch(withContract(`/api/sites/${params.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSite(data.data);
        setIsEditing(false);
      } else {
        alert(data.error || 'Failed to update site');
      }
    } catch {
      alert('Failed to update site');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${site?.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(withContract(`/api/sites/${params.id}`), {
        method: 'DELETE',
      });
      
      if (res.ok) {
        router.push(withContract('/sites'));
      } else {
        alert('Failed to delete site');
      }
    } catch {
      alert('Failed to delete site');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="main-content">
        <div className="page-header">
          <span className="eyebrow">Site record</span>
          <h1>Site Not Found</h1>
          <p>{error || 'Site not found'}</p>
        </div>
        <div className="content">
          <Link href={withContract('/sites')} className="site-link">
            Back to Sites
          </Link>
        </div>
      </div>
    );
  }

  if (isEditing && allowSiteEdits) {
    return (
      <div className="main-content">
        <div className="page-header">
          <span className="eyebrow">Site control</span>
          <h1>Edit Site</h1>
          <p>{site.name}</p>
        </div>
        <div className="content">
          <SiteForm
            site={site}
            spvs={spvs}
            onSubmit={handleUpdate}
            onCancel={() => setIsEditing(false)}
            isLoading={isSaving}
          />
        </div>
      </div>
    );
  }

  const scenarioAdditionalMonthlyAnnual = Math.max(site.fixedFee_20MW - site.siteFixedCosts - site.portfolioCost_20MW, 0);

  return (
    <div className="main-content">
      <div className="page-header">
        <span className="eyebrow">Site control</span>
        <h1>{site.name}</h1>
        <p>{site.siteType} | {formatNumber(site.systemSizeKwp, 0)} kWp | {site.spvCode || 'Unassigned'}</p>
      </div>

      <div className="content">
        <div className="site-detail-toolbar">
          <div>
            <Link href={withContract('/sites')} className="site-detail-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Sites
            </Link>
          </div>
          {allowSiteEdits && (
            <div className="site-detail-actions" aria-label="Site actions">
              <button type="button" className="site-detail-edit-button" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </button>
              <button type="button" className="site-detail-delete-button" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          )}
        </div>

        <div className="stats-grid">
          <DetailMetric
            label="Contract"
            value={site.contractStatus === 'Yes' ? 'Contracted' : site.contractStatus}
            sub={site.onboardDate ? `Onboarded ${new Date(site.onboardDate).toLocaleDateString('en-GB')}` : site.forecastPacDate ? `Forecast PAC ${new Date(site.forecastPacDate).toLocaleDateString('en-GB')}` : 'No PAC date'}
            tone={site.contractStatus === 'Contracted' || site.contractStatus === 'Yes' ? 'green' : 'amber'}
            icon={<FileText className="h-5 w-5" />}
          />
          <DetailMetric
            label="SPV"
            value={site.spvCode || 'Unassigned'}
            sub={site.billingPortfolio === 'EDEN' ? 'Eden billing' : 'Core billing'}
            tone="blue"
            icon={<Landmark className="h-5 w-5" />}
          />
          <DetailMetric
            label="Capacity"
            value={`${formatNumber(site.systemSizeKwp / 1000, 2)} MW`}
            sub={`${formatNumber(site.systemSizeKwp, 0)} kWp`}
            tone="amber"
            icon={<Zap className="h-5 w-5" />}
          />
          <DetailMetric
            label="Monthly Fee"
            value={formatCurrency(site.monthlyFee)}
            sub={`${formatCurrency(site.monthlyFee * 12)} annual`}
            tone="purple"
            icon={<PoundSterling className="h-5 w-5" />}
          />
        </div>

        <PricingVerificationCard site={site} />

        <div className="detail-grid">
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title">
                <Building2 className="h-5 w-5" />
                Site Profile
              </div>
              <Badge variant={site.contractStatus === 'Contracted' || site.contractStatus === 'Yes' ? 'success' : 'warning'}>
                {site.contractStatus === 'Yes' ? 'Contracted' : site.contractStatus}
              </Badge>
            </div>
            <div className="detail-list">
              <DetailRow label="Site name" value={site.name} />
              <DetailRow label="Site type" value={site.siteType} />
              <DetailRow label="SPV" value={site.spvCode || 'Unassigned'} />
              <DetailRow label="Billing portfolio" value={site.billingPortfolio === 'EDEN' ? 'Eden' : 'Core'} />
              <DetailRow
                label="Onboard date"
                value={site.onboardDate ? new Date(site.onboardDate).toLocaleDateString('en-GB') : '-'}
              />
              <DetailRow
                label="Forecast PAC date"
                value={site.forecastPacDate ? new Date(site.forecastPacDate).toLocaleDateString('en-GB') : '-'}
              />
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title">
                <Wrench className="h-5 w-5" />
                Fixed Cost Stack
              </div>
              <span className="badge badge-blue">{formatCurrency(site.siteFixedCosts)}</span>
            </div>
            <div className="detail-list">
              <DetailRow
                label="PM cost"
                value={formatCurrency(site.pmCost)}
                note={`${formatNumber(site.pmDaysOnSite || 0, site.pmDaysOnSite % 1 === 0 ? 0 : 1)} days / annum`}
              />
              <DetailRow label="CCTV cost" value={formatCurrency(site.cctvCost)} />
              <DetailRow label="Cleaning cost" value={formatCurrency(site.cleaningCost)} />
              <DetailRow label="Additional base cost" value={formatCurrency(site.additionalCostAnnual)} note={site.additionalCostAnnualComment} />
              <DetailRow
                label="Additional monthly cost"
                value={formatCurrency(site.additionalCostMonthly)}
                note={
                  site.additionalCostMonthlyStartMonth || site.additionalCostMonthlyEndMonth
                    ? `${site.additionalCostMonthlyStartMonth || 'Start'} to ${site.additionalCostMonthlyEndMonth || 'ongoing'}`
                    : site.additionalCostMonthlyComment
                }
              />
            </div>
          </div>
        </div>

        <div className="monthly-table-card" style={{ marginTop: '24px' }}>
          <div className="monthly-table-header">
            <div>
              <h2>Scenario Pricing by Portfolio Tier</h2>
              <p>Full annual build-up by tier. The applied tier is shown in Pricing Verification above.</p>
            </div>
            <span className="status-badge status-yes">
              {formatCurrency(site.monthlyFee)}/month
            </span>
          </div>
          <div className="table-container compact-mobile-table">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="numeric">&lt;20MW</th>
                  <th className="numeric">20-30MW</th>
                  <th className="numeric">30-40MW</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Metric">PM cost</td>
                  <td data-label="<20MW" className="numeric">{formatCurrency(site.pmCost)}</td>
                  <td data-label="20-30MW" className="numeric">{formatCurrency(site.pmCost)}</td>
                  <td data-label="30-40MW" className="numeric">{formatCurrency(site.pmCost)}</td>
                </tr>
                <tr>
                  <td data-label="Metric">CCTV cost</td>
                  <td data-label="<20MW" className="numeric">{formatCurrency(site.cctvCost)}</td>
                  <td data-label="20-30MW" className="numeric">{formatCurrency(site.cctvCost)}</td>
                  <td data-label="30-40MW" className="numeric">{formatCurrency(site.cctvCost)}</td>
                </tr>
                <tr>
                  <td data-label="Metric">Cleaning cost</td>
                  <td data-label="<20MW" className="numeric">{formatCurrency(site.cleaningCost)}</td>
                  <td data-label="20-30MW" className="numeric">{formatCurrency(site.cleaningCost)}</td>
                  <td data-label="30-40MW" className="numeric">{formatCurrency(site.cleaningCost)}</td>
                </tr>
                <tr>
                  <td data-label="Metric">Additional annual cost</td>
                  <td data-label="<20MW" className="numeric">{formatCurrency(site.additionalCostAnnual)}</td>
                  <td data-label="20-30MW" className="numeric">{formatCurrency(site.additionalCostAnnual)}</td>
                  <td data-label="30-40MW" className="numeric">{formatCurrency(site.additionalCostAnnual)}</td>
                </tr>
                <tr>
                  <td data-label="Metric">Site fixed cost subtotal</td>
                  <td data-label="<20MW" className="numeric strong">{formatCurrency(site.siteFixedCosts)}</td>
                  <td data-label="20-30MW" className="numeric strong">{formatCurrency(site.siteFixedCosts)}</td>
                  <td data-label="30-40MW" className="numeric strong">{formatCurrency(site.siteFixedCosts)}</td>
                </tr>
                <tr>
                  <td data-label="Metric">Portfolio tariff cost</td>
                  <td data-label="<20MW" className="numeric">{formatCurrency(site.portfolioCost_20MW)}</td>
                  <td data-label="20-30MW" className="numeric">{formatCurrency(site.portfolioCost_30MW)}</td>
                  <td data-label="30-40MW" className="numeric">{formatCurrency(site.portfolioCost_40MW)}</td>
                </tr>
                <tr>
                  <td data-label="Metric">Additional monthly cost annualised</td>
                  <td data-label="<20MW" className="numeric">{formatCurrency(scenarioAdditionalMonthlyAnnual)}</td>
                  <td data-label="20-30MW" className="numeric">{formatCurrency(scenarioAdditionalMonthlyAnnual)}</td>
                  <td data-label="30-40MW" className="numeric">{formatCurrency(scenarioAdditionalMonthlyAnnual)}</td>
                </tr>
                <tr>
                  <td data-label="Metric">Total site cost</td>
                  <td data-label="<20MW" className="numeric strong">{formatCurrency(site.fixedFee_20MW)}</td>
                  <td data-label="20-30MW" className="numeric strong">{formatCurrency(site.fixedFee_30MW)}</td>
                  <td data-label="30-40MW" className="numeric strong">{formatCurrency(site.fixedFee_40MW)}</td>
                </tr>
                <tr>
                  <td data-label="Metric">Monthly fee</td>
                  <td data-label="<20MW" className="numeric">{formatCurrency(site.fixedFee_20MW / 12)}</td>
                  <td data-label="20-30MW" className="numeric">{formatCurrency(site.fixedFee_30MW / 12)}</td>
                  <td data-label="30-40MW" className="numeric">{formatCurrency(site.fixedFee_40MW / 12)}</td>
                </tr>
                <tr>
                  <td data-label="Metric">Fee per kWp</td>
                  <td data-label="<20MW" className="numeric">{site.feePerKwp_20MW > 0 ? formatNumber(site.feePerKwp_20MW, 2) : '-'}</td>
                  <td data-label="20-30MW" className="numeric">{site.feePerKwp_30MW > 0 ? formatNumber(site.feePerKwp_30MW, 2) : '-'}</td>
                  <td data-label="30-40MW" className="numeric">{site.feePerKwp_40MW > 0 ? formatNumber(site.feePerKwp_40MW, 2) : '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SiteDetailPage() {
  return (
    <Suspense fallback={null}>
      <SiteDetailContent />
    </Suspense>
  );
}
