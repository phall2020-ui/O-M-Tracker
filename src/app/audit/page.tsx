'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { AuditEntry } from '@/types';

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    fetch('/api/audit?limit=250')
      .then((r) => r.json())
      .then((d) => { if (d.success) setEntries(d.data); })
      .catch(() => undefined);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Header title="Audit Log" subtitle="Creates, updates, deletes and imports" />
      <div className="flex-1 p-6">
        <Card>
          <CardContent className="pt-6">
            {entries.length === 0 ? (
              <p className="text-gray-500 text-sm">No changes recorded yet. Creating, editing or importing sites will appear here.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2">When</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Action</th>
                    <th className="py-2">Record</th>
                    <th className="py-2">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b align-top">
                      <td className="py-2 whitespace-nowrap">{new Date(e.timestamp).toLocaleString('en-GB')}</td>
                      <td className="py-2">{e.tableName}</td>
                      <td className="py-2">{e.action}</td>
                      <td className="py-2">{e.recordId}</td>
                      <td className="py-2 text-gray-600">
                        {e.action === 'update'
                          ? Object.entries(e.newValues || {}).map(([k, v]) => `${k}: ${JSON.stringify(e.oldValues?.[k])} → ${JSON.stringify(v)}`).join(', ')
                          : e.action === 'import'
                            ? `Imported ${e.newValues?.sitesImported}, replaced ${e.oldValues?.sitesReplaced}`
                            : e.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
