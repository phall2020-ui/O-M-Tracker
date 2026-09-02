'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { SiteForm } from '@/components/sites/SiteForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SiteWithCalculations, SPV, SiteFormData } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [site, setSite] = useState<SiteWithCalculations | null>(null);
  const [spvs, setSpvs] = useState<SPV[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSite();
    fetchSpvs();
  }, [params.id]);

  const fetchSite = async () => {
    try {
      const res = await fetch(`/api/sites/${params.id}`);
      const data = await res.json();
      
      if (data.success) {
        setSite(data.data);
      } else {
        setError(data.error || 'Site not found');
      }
    } catch (err) {
      setError('Failed to fetch site');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSpvs = async () => {
    try {
      const res = await fetch('/api/spvs');
      const data = await res.json();
      if (data.success) {
        setSpvs(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch SPVs');
    }
  };

  const handleUpdate = async (formData: SiteFormData) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/sites/${params.id}`, {
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
    } catch (err) {
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
      const res = await fetch(`/api/sites/${params.id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        router.push('/sites');
      } else {
        alert('Failed to delete site');
      }
    } catch (err) {
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
      <div className="p-6">
        <Header title="Site Not Found" />
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">
          {error || 'Site not found'}
        </div>
        <Link href="/sites" className="mt-4 inline-block text-blue-600 hover:underline">
          ← Back to Sites
        </Link>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Edit Site" subtitle={site.name} />
        <div className="flex-1 p-6 flex justify-center">
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

  return (
    <div className="flex flex-col h-full">
      <Header 
        title={site.name}
        subtitle={`${site.siteType} • ${formatNumber(site.systemSizeKwp)} kWp`}
      />
      
      <div className="flex-1 p-6 space-y-6">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <Link href="/sites">
            <Button variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sites
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Site Name</p>
                  <p className="font-medium">{site.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">System Size</p>
                  <p className="font-medium">{formatNumber(site.systemSizeKwp)} kWp</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Site Type</p>
                  <p className="font-medium">{site.siteType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Contract Status</p>
                  <Badge variant={site.contractStatus === 'Yes' ? 'success' : 'default'}>
                    {site.contractStatus}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Onboard Date</p>
                  <p className="font-medium">
                    {site.onboardDate 
                      ? new Date(site.onboardDate).toLocaleDateString('en-GB')
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">SPV</p>
                  <p className="font-medium">{site.spvCode || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Site Fixed Costs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">PM Cost</p>
                  <p className="font-medium">{formatCurrency(site.pmCost)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">CCTV Cost</p>
                  <p className="font-medium">{formatCurrency(site.cctvCost)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Cleaning Cost</p>
                  <p className="font-medium">{formatCurrency(site.cleaningCost)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Site Costs</p>
                  <p className="font-medium text-lg">{formatCurrency(site.siteFixedCosts)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fee Calculations */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Fee Calculations by Portfolio Tier</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4 font-medium text-gray-500">Metric</th>
                      <th className="text-right py-2 px-4 font-medium text-gray-500">&lt;20MW</th>
                      <th className="text-right py-2 px-4 font-medium text-gray-500">20-30MW</th>
                      <th className="text-right py-2 px-4 font-medium text-gray-500">30-40MW</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 px-4">Portfolio Cost</td>
                      <td className="text-right py-2 px-4">{formatCurrency(site.portfolioCost_20MW)}</td>
                      <td className="text-right py-2 px-4">{formatCurrency(site.portfolioCost_30MW)}</td>
                      <td className="text-right py-2 px-4">{formatCurrency(site.portfolioCost_40MW)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-4">Fixed Fee (£)</td>
                      <td className="text-right py-2 px-4 font-medium">{formatCurrency(site.fixedFee_20MW)}</td>
                      <td className="text-right py-2 px-4 font-medium">{formatCurrency(site.fixedFee_30MW)}</td>
                      <td className="text-right py-2 px-4 font-medium">{formatCurrency(site.fixedFee_40MW)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-4">Fee per kWp (£)</td>
                      <td className="text-right py-2 px-4">
                        {site.feePerKwp_20MW > 0 ? formatNumber(site.feePerKwp_20MW) : '—'}
                      </td>
                      <td className="text-right py-2 px-4">
                        {site.feePerKwp_30MW > 0 ? formatNumber(site.feePerKwp_30MW) : '—'}
                      </td>
                      <td className="text-right py-2 px-4">
                        {site.feePerKwp_40MW > 0 ? formatNumber(site.feePerKwp_40MW) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Monthly Fee:</strong> {formatCurrency(site.monthlyFee)}
                  {site.contractStatus === 'No' && (
                    <span className="ml-2 text-gray-500">(Site not contracted)</span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
