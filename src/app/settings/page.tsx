'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DEFAULT_RATE_TIERS, formatCurrency } from '@/lib/calculations';

export default function SettingsPage() {
  const [currentTier, setCurrentTier] = useState<string>('');
  const [contractedMw, setContractedMw] = useState(0);

  useEffect(() => {
    fetch('/api/portfolio')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setCurrentTier(d.data.currentTier);
          setContractedMw(d.data.contractedCapacityKwp / 1000);
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" subtitle="Portfolio rate tiers and formulas" />
      <div className="flex-1 p-6">
        <div className="max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rate Tiers</CardTitle>
              <CardDescription>
                Currently {contractedMw.toFixed(2)} MW contracted → tier <strong>{currentTier || '—'}</strong>.
                Monthly fees follow this tier, not a hardcoded &lt;20MW column.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-gray-500">Tier</th>
                    <th className="text-left py-2 font-medium text-gray-500">Capacity range</th>
                    <th className="text-right py-2 font-medium text-gray-500">Rate (£/kWp)</th>
                    <th className="text-left py-2 font-medium text-gray-500 pl-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {DEFAULT_RATE_TIERS.map((tier) => (
                    <tr key={tier.id} className={`border-b ${tier.tierName === currentTier ? 'bg-blue-50' : ''}`}>
                      <td className="py-3 font-medium">{tier.tierName}</td>
                      <td className="py-3 text-gray-600">{tier.minCapacityMW} – {tier.maxCapacityMW ?? '∞'} MW</td>
                      <td className="py-3 text-right">{formatCurrency(tier.ratePerKwp)}</td>
                      <td className="py-3 pl-4 text-sm text-blue-700">{tier.tierName === currentTier ? '◀ current' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Formula reference</CardTitle></CardHeader>
            <CardContent className="text-sm text-gray-700 space-y-2">
              <p><strong>Site fixed costs</strong> = PM + CCTV + Cleaning</p>
              <p><strong>Portfolio cost</strong> = System size (kWp) × rate for the portfolio&apos;s current tier</p>
              <p><strong>Fixed fee</strong> = Site fixed costs + Portfolio cost</p>
              <p><strong>Monthly fee</strong> = Fixed fee ÷ 12 (contracted sites only)</p>
              <p><strong>CM days / month</strong> = Contracted capacity (MW) ÷ 12, rounded to 0.1</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
