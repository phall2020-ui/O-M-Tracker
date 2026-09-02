'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    count?: number;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setResult({
          success: true,
          message: data.data.message,
          count: data.data.count,
        });
      } else {
        setResult({
          success: false,
          message: data.error || 'Import failed',
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: 'Failed to upload file',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Import Data" 
        subtitle="Import sites from Excel spreadsheet"
      />
      
      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import from Excel</CardTitle>
              <CardDescription>
                Upload your Clearsol O&M Framework Tracker spreadsheet to import site data.
                The importer will read the &quot;Portfolio Tracker&quot; tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* File Drop Zone */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-4 text-sm text-gray-600">
                  {selectedFile ? (
                    <span className="font-medium text-blue-600">{selectedFile.name}</span>
                  ) : (
                    <>
                      <span className="font-medium text-blue-600">Click to upload</span>
                      {' '}or drag and drop
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Excel files only (.xlsx, .xls)
                </p>
              </div>

              {/* Upload Button */}
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Sites
                  </>
                )}
              </Button>

              {/* Result */}
              {result && (
                <div
                  className={`p-4 rounded-lg ${
                    result.success
                      ? 'bg-green-50 text-green-800'
                      : 'bg-red-50 text-red-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <AlertCircle className="h-5 w-5" />
                    )}
                    <span className="font-medium">{result.message}</span>
                  </div>
                  {result.success && (
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        onClick={() => router.push('/sites')}
                      >
                        View Imported Sites
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Import Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  The spreadsheet must contain a &quot;Portfolio Tracker&quot; tab
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  Site data should start from row 5 (rows 1-4 are headers)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  Required columns: Site Name (C), System Size (D)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  Optional columns: Contract (E), Onboard Date (F), PM Cost (G), CCTV (H), Cleaning (I), SPV (V)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-500 font-bold">⚠</span>
                  <span className="text-yellow-700">
                    Importing will replace all existing site data
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
