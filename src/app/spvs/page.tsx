'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SiteWithCalculations, SPV } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/calculations';

export default function SpvsPage() {
  const [spvs, setSpvs] = useState<SPV[]>([]);
  const [sites, setSites] = useState<SiteWithCalculations[]>([]);

  useEffect(() => {
    Promise.all([fetch('/api/spvs').then((r) => r.json()), fetch('/api/sites').then((r) => r.json())])
      .then(([spvRes, siteRes]) => {
        if (spvRes.success) setSpvs(spvRes.data);
        if (siteRes.success) setSites(siteRes.data);
      })
      .catch(() => undefined);
  }, []);

  const known = new Set(spvs.map((s) => s.code));
  const unassigned = sites.filter((s) => !s.spvCode);
  const unknown = sites.filter((s) => s.spvCode && !known.has(s.spvCode));

  return (
    <div className="flex flex-col h-full">
      <Header title="SPVs" subtitle="Special Purpose Vehicles and the sites they own" />
      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">SPV</th>
                  <th className="py-2">Name</th>
                  <th className="py-2 text-right">Sites</th>
                  <th className="py-2 text-right">Contracted MW</th>
                  <th className="py-2 text-right">Monthly revenue</th>
                </tr>
              </thead>
              <tbody>
                {spvs.map((spv) => {
                  const owned = sites.filter((s) => s.spvCode === spv.code);
                  const contracted = owned.filter((s) => s.contractStatus === 'Yes');
                  return (
                    <tr key={spv.id} className="border-b">
                      <td className="py-2 font-medium">{spv.code}</td>
                      <td className="py-2">{spv.name}</td>
                      <td className="py-2 text-right">{owned.length} ({contracted.length} contracted)</td>
                      <td className="py-2 text-right">{formatNumber(contracted.reduce((n, s) => n + s.systemSizeKwp, 0) / 1000, 2)}</td>
                      <td className="py-2 text-right">{formatCurrency(contracted.reduce((n, s) => n + s.monthlyFee, 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {unknown.length > 0 && (
          <div className="rounded-lg bg-red-50 p-4 text-red-800">
            {unknown.length} site(s) reference unknown SPV codes:{' '}
            {[...new Set(unknown.map((s) => s.spvCode))].join(', ')}
            <ul className="mt-2 text-sm">{unknown.map((s) => <li key={s.id}>{s.name} — {s.spvCode}</li>)}</ul>
          </div>
        )}
        {unassigned.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-4 text-amber-900">
            {unassigned.length} site(s) have no SPV assigned.
            <ul className="mt-2 text-sm">{unassigned.map((s) => <li key={s.id}>{s.name}</li>)}</ul>
          </div>
        )}
        {!unknown.length && !unassigned.length && (
          <div className="rounded-lg bg-green-50 p-4 text-green-800">All sites are assigned to a recognised SPV.</div>
        )}
      </div>
    </div>
  );
}
