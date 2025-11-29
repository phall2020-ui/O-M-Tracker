'use client';

import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DEFAULT_RATE_TIERS } from '@/lib/calculations';
import { formatCurrency } from '@/lib/calculations';

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Settings" 
        subtitle="Configure portfolio settings"
      />
      
      <div className="flex-1 p-6">
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rate Tiers</CardTitle>
              <CardDescription>
                Current portfolio cost rates by capacity tier. 
                Rate management will be available in Phase 3.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-gray-500">Tier</th>
                    <th className="text-left py-2 font-medium text-gray-500">Capacity Range</th>
                    <th className="text-right py-2 font-medium text-gray-500">Rate (£/kWp)</th>
                  </tr>
                </thead>
                <tbody>
                  {DEFAULT_RATE_TIERS.map((tier) => (
                    <tr key={tier.id} className="border-b">
                      <td className="py-3 font-medium">{tier.tierName}</td>
                      <td className="py-3 text-gray-600">
                        {tier.minCapacityMW} - {tier.maxCapacityMW || '∞'} MW
                      </td>
                      <td className="py-3 text-right">
                        {formatCurrency(tier.ratePerKwp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Coming Soon</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• User management and authentication</li>
                <li>• Custom rate tier configuration</li>
                <li>• Audit log viewer</li>
                <li>• Export settings</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
