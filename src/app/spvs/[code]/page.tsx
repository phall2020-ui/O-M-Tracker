'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { SiteWithCalculations } from '@/types';
import { 
  ArrowLeft, 
  Download, 
  FileText, 
  Building, 
  Zap, 
  PoundSterling,
  Calendar
} from 'lucide-react';
import Link from 'next/link';
import { useContractQuery } from '@/lib/use-contract-query';

interface SpvDetails {
  code: string;
  name: string;
  sites: SiteWithCalculations[];
  summary: {
    totalSites: number;
    contractedSites: number;
    totalCapacityKwp: number;
    contractedCapacityKwp: number;
    totalMonthlyFee: number;
    totalAnnualFee: number;
  };
}

function SpvDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const portfolio = searchParams.get('portfolio');
  const router = useRouter();
  const { withContract } = useContractQuery();
  const code = params.code as string;
  
  const [spvDetails, setSpvDetails] = useState<SpvDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSpvDetails = useCallback(async () => {
    try {
      const base = withContract(`/api/spvs/${code}`);
      const url = portfolio ? `${base}${base.includes('?') ? '&' : '?'}portfolio=${portfolio}` : base;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.success) {
        setSpvDetails(data.data);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to fetch SPV details');
    } finally {
      setIsLoading(false);
    }
  }, [code, portfolio, withContract]);

  useEffect(() => {
    if (code) {
      fetchSpvDetails();
    }
  }, [code, fetchSpvDetails]);

  const handleExportInvoice = () => {
    // Create CSV for invoice
    if (!spvDetails) return;
    
    const headers = ['Site Name', 'System Size (kWp)', 'Contract Status', 'Site Costs', 'Portfolio Cost', 'Fixed Fee', 'Monthly Fee'];
    const rows = spvDetails.sites
      .filter(s => s.contractStatus === 'Contracted' || s.contractStatus === 'Yes')
      .map(site => [
        site.name,
        site.systemSizeKwp.toFixed(2),
        site.contractStatus,
        site.siteFixedCosts.toFixed(2),
        site.portfolioCost_20MW.toFixed(2),
        site.fixedFee_20MW.toFixed(2),
        site.monthlyFee.toFixed(2),
      ]);
    
    // Add totals row
    rows.push([
      'TOTAL',
      spvDetails.summary.contractedCapacityKwp.toFixed(2),
      '',
      '',
      '',
      '',
      spvDetails.summary.totalMonthlyFee.toFixed(2),
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${code}_invoice_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !spvDetails) {
    return (
      <div className="main-content">
        <div className="page-header">
          <span className="eyebrow">SPV portfolio</span>
          <h1>SPV Details</h1>
          <p>Error loading data</p>
        </div>
        <div className="content">
          <div className="chart-card">
          {error || 'SPV not found'}
          </div>
          <Button onClick={() => router.back()} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const contractedSites = spvDetails.sites.filter(s => s.contractStatus === 'Contracted' || s.contractStatus === 'Yes');

  return (
    <div className="main-content">
      <div className="page-header">
        <span className="eyebrow">SPV portfolio</span>
        <h1>{spvDetails.name}</h1>
        <p>SPV Code: {spvDetails.code}</p>
      </div>

      <div className="content">
        <div className="detail-action-bar">
          <Link href={withContract('/spvs')} className="secondary-action">
            <ArrowLeft className="h-4 w-4" />
            Back to SPVs
          </Link>
          <Button onClick={handleExportInvoice}>
            <Download className="mr-2 h-4 w-4" />
            Export Invoice (CSV)
          </Button>
        </div>

        <div className="stats-grid">
          <div className="card stat-card-blue">
            <div className="card-header">
              <span className="card-title">Sites</span>
              <div className="card-icon blue"><Building className="h-5 w-5" /></div>
            </div>
            <div className="card-value">{spvDetails.summary.totalSites}</div>
            <div className="card-sub">{spvDetails.summary.contractedSites} contracted</div>
          </div>

          <div className="card stat-card-amber">
            <div className="card-header">
              <span className="card-title">Capacity</span>
              <div className="card-icon amber"><Zap className="h-5 w-5" /></div>
            </div>
            <div className="card-value">{formatNumber(spvDetails.summary.totalCapacityKwp / 1000, 2)} MW</div>
            <div className="card-sub">{formatNumber(spvDetails.summary.contractedCapacityKwp / 1000, 2)} MW contracted</div>
          </div>

          <div className="card stat-card-green">
            <div className="card-header">
              <span className="card-title">Monthly Fee</span>
              <div className="card-icon green"><PoundSterling className="h-5 w-5" /></div>
            </div>
            <div className="card-value">{formatCurrency(spvDetails.summary.totalMonthlyFee)}</div>
            <div className="card-sub">From contracted sites</div>
          </div>

          <div className="card stat-card-purple">
            <div className="card-header">
              <span className="card-title">Annual Fee</span>
              <div className="card-icon purple"><Calendar className="h-5 w-5" /></div>
            </div>
            <div className="card-value">{formatCurrency(spvDetails.summary.totalAnnualFee)}</div>
            <div className="card-sub">{formatCurrency(spvDetails.summary.totalMonthlyFee)} x 12</div>
          </div>
        </div>

        <div className="monthly-table-card">
          <div className="monthly-table-header">
            <div>
              <h2 className="chart-title">
                <FileText className="h-5 w-5" />
                Invoice Breakdown
              </h2>
              <p>Site-level annual and monthly billing detail for this SPV.</p>
            </div>
            <span className="badge badge-blue">
              {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="table-container compact-mobile-table">
              <table>
                <thead>
                  <tr>
                    <th>Site Name</th>
                    <th className="numeric">Size (kWp)</th>
                    <th>Status</th>
                    <th className="numeric">Site Costs</th>
                    <th className="numeric">Portfolio Cost</th>
                    <th className="numeric">Fixed Fee (Annual)</th>
                    <th className="numeric">Monthly Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {spvDetails.sites.map((site) => (
                    <tr key={site.id} className={site.contractStatus !== 'Contracted' && site.contractStatus !== 'Yes' ? 'muted-row' : ''}>
                      <td data-label="Site">
                        <Link 
                          href={withContract(`/sites/${site.id}`)}
                          className="site-link"
                        >
                          {site.name}
                        </Link>
                      </td>
                      <td data-label="Size" className="numeric">
                        {formatNumber(site.systemSizeKwp, 2)}
                      </td>
                      <td data-label="Status">
                        <span className={site.contractStatus === 'Contracted' || site.contractStatus === 'Yes' ? 'status-badge status-yes' : 'status-badge status-no'}>
                          {site.contractStatus === 'Contracted' || site.contractStatus === 'Yes' ? 'Contracted' : site.contractStatus === 'No' ? 'Awaiting PAC' : site.contractStatus}
                        </span>
                      </td>
                      <td data-label="Site Costs" className="numeric">
                        {formatCurrency(site.siteFixedCosts)}
                      </td>
                      <td data-label="Portfolio Cost" className="numeric">
                        {formatCurrency(site.pricingBreakdown.portfolioCostAnnual)}
                      </td>
                      <td data-label="Fixed Fee" className="numeric">
                        {site.contractStatus === 'Contracted' || site.contractStatus === 'Yes' 
                          ? formatCurrency(site.pricingBreakdown.annualFee)
                          : <span className="muted-cell">-</span>
                        }
                      </td>
                      <td data-label="Monthly Fee" className="numeric strong">
                        {site.contractStatus === 'Contracted' || site.contractStatus === 'Yes' 
                          ? formatCurrency(site.monthlyFee)
                          : <span className="muted-cell">-</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td data-label="Site">
                      TOTAL ({contractedSites.length} contracted sites)
                    </td>
                    <td data-label="Size" className="numeric">
                      {formatNumber(spvDetails.summary.contractedCapacityKwp, 2)}
                    </td>
                    <td data-label="Status"></td>
                    <td data-label="Site Costs" className="numeric">
                      {formatCurrency(contractedSites.reduce((s, site) => s + site.siteFixedCosts, 0))}
                    </td>
                    <td data-label="Portfolio Cost" className="numeric">
                      {formatCurrency(contractedSites.reduce((s, site) => s + site.pricingBreakdown.portfolioCostAnnual, 0))}
                    </td>
                    <td data-label="Fixed Fee" className="numeric">
                      {formatCurrency(spvDetails.summary.totalAnnualFee)}
                    </td>
                    <td data-label="Monthly Fee" className="numeric strong">
                      {formatCurrency(spvDetails.summary.totalMonthlyFee)}
                    </td>
                  </tr>
                </tfoot>
              </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SpvDetailPage() {
  return (
    <Suspense fallback={null}>
      <SpvDetailContent />
    </Suspense>
  );
}
