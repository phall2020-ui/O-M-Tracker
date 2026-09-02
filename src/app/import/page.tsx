'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { ImportRow } from '@/lib/importer';

interface Preview {
  rows: ImportRow[];
  fileErrors: string[];
  validSites: unknown[];
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const send = async (method: 'PUT' | 'POST') => {
    if (!selectedFile) return;
    setIsWorking(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch('/api/import', { method, body: formData });
      const data = await res.json();
      if (method === 'PUT') {
        if (data.success) setPreview(data.data);
        else setResult({ success: false, message: data.error || 'Preview failed' });
      } else if (data.success) {
        setResult({ success: true, message: data.data.message });
      } else {
        setResult({ success: false, message: data.error || 'Import failed' });
      }
    } catch {
      setResult({ success: false, message: 'Failed to upload file' });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Import Data" subtitle="Preview and import the Portfolio Tracker spreadsheet" />
      <div className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import from Excel</CardTitle>
              <CardDescription>
                Preview every row (errors and warnings) before replacing existing sites. Import is all-or-nothing for valid rows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] || null);
                  setPreview(null);
                  setResult(null);
                }} />
                <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-4 text-sm text-gray-600">
                  {selectedFile ? <span className="font-medium text-blue-600">{selectedFile.name}</span> : <><span className="font-medium text-blue-600">Click to upload</span> or choose a file</>}
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" disabled={!selectedFile || isWorking} onClick={() => send('PUT')}>Preview</Button>
                <Button disabled={!selectedFile || isWorking || !preview?.validSites.length} onClick={() => send('POST')}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {preview ? `${preview.validSites.length} valid sites` : 'sites'}
                </Button>
              </div>
              {result && (
                <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  <div className="flex items-center gap-2">
                    {result.success ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    <span className="font-medium">{result.message}</span>
                  </div>
                  {result.success && (
                    <Button variant="outline" className="mt-3" onClick={() => router.push('/sites')}>View imported sites</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  {preview.validSites.length} ready · {preview.rows.filter((r) => r.status === 'Error').length} errors · {preview.rows.filter((r) => r.status === 'Warning').length} warnings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {preview.fileErrors.map((e) => <p key={e} className="text-red-700 text-sm">{e}</p>)}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2">Row</th><th>Status</th><th>Site</th><th>Size</th><th>Contract</th><th>SPV</th><th>Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr key={row.sourceRow} className="border-b">
                          <td className="py-2">{row.sourceRow}</td>
                          <td>{row.status}</td>
                          <td>{row.clean?.name}</td>
                          <td>{row.clean?.systemSizeKwp}</td>
                          <td>{row.clean?.contractStatus}</td>
                          <td>{row.clean?.spvCode}</td>
                          <td className="text-amber-800">{[...row.errors, ...row.warnings].join(' · ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Spreadsheet layout</CardTitle></CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-1">
              <p>Sheet name must be <strong>Portfolio Tracker</strong>. Sites start at row 5; the importer scans until the block ends (not a hard stop at row 68).</p>
              <p>Required: Site Name (C), System Size (D). Optional: Contract (E), Onboard Date (F), PM (G), CCTV (H), Cleaning (I), SPV (V).</p>
              <p className="text-yellow-700">Importing replaces all existing site data. Download a CSV from Sites first if you need a backup.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
