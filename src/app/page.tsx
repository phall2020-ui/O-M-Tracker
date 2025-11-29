'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PortfolioSummary } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { Building2, Zap, PoundSterling, Calendar } from 'lucide-react';

export default function DashboardPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/portfolio');
      const data = await res.json();
      
      if (data.success) {
        setSummary(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch portfolio summary');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Header title="Dashboard" subtitle="Portfolio Overview" />
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Dashboard" 
        subtitle="Portfolio Overview" 
      />
      
      <div className="flex-1 p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Total Sites
              </CardTitle>
              <Building2 className="h-5 w-5 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary?.totalSites || 0}</div>
              <p className="text-sm text-gray-500 mt-1">
                {summary?.contractedSites || 0} contracted
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Total Capacity
              </CardTitle>
              <Zap className="h-5 w-5 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatNumber((summary?.totalCapacityKwp || 0) / 1000, 1)} MW
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {formatNumber((summary?.contractedCapacityKwp || 0) / 1000, 1)} MW contracted
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Monthly Revenue
              </CardTitle>
              <PoundSterling className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatCurrency(summary?.totalMonthlyFee || 0)}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                From contracted sites
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Current Tier
              </CardTitle>
              <Calendar className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary?.currentTier || 'N/A'}</div>
              <p className="text-sm text-gray-500 mt-1">
                {formatNumber(summary?.correctiveDaysAllowed || 0, 1)} corrective days/mo
              </p>
            </CardContent>
          </Card>
        </div>

        {/* SPV Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Sites by SPV</CardTitle>
            </CardHeader>
            <CardContent>
              {summary?.sitesBySpv && Object.keys(summary.sitesBySpv).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(summary.sitesBySpv)
                    .sort((a, b) => b[1] - a[1])
                    .map(([spv, count]) => (
                      <div key={spv} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="info">{spv}</Badge>
                        </div>
                        <span className="font-medium">{count} sites</span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  No sites imported yet. Go to Import Data to get started.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <a
                  href="/sites"
                  className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium">View All Sites</div>
                  <p className="text-sm text-gray-500">
                    Browse and manage your portfolio sites
                  </p>
                </a>
                <a
                  href="/sites/new"
                  className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium">Add New Site</div>
                  <p className="text-sm text-gray-500">
                    Create a new site entry manually
                  </p>
                </a>
                <a
                  href="/import"
                  className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium">Import from Excel</div>
                  <p className="text-sm text-gray-500">
                    Bulk import sites from your spreadsheet
                  </p>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
