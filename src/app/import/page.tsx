'use client';

import { Suspense, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { useContractQuery } from '@/lib/use-contract-query';

function ImportContent() {
  const router = useRouter();
  const { withContract } = useContractQuery();
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

      const res = await fetch(withContract('/api/import'), {
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
    } catch {
      setResult({
        success: false,
        message: 'Failed to upload file',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <span className="eyebrow">Data control</span>
        <h1>Import Data</h1>
        <p>Import sites from Excel spreadsheet</p>
      </div>

      <div className="content">
        <div className="detail-grid">
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h2 className="chart-title">Import from Excel</h2>
                <p className="card-sub" style={{ marginTop: '6px' }}>
                Upload your Clearsol O&M Framework Tracker spreadsheet to import site data.
                The importer will read the &quot;Portfolio Tracker&quot; tab.
                </p>
              </div>
            </div>

              <div
                className="upload-dropzone"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <FileSpreadsheet className="h-12 w-12" style={{ color: 'var(--text-muted)' }} />
                <p style={{ color: 'var(--text-soft)', fontSize: '14px' }}>
                  {selectedFile ? (
                    <span style={{ color: 'var(--green-strong)', fontWeight: 700 }}>{selectedFile.name}</span>
                  ) : (
                    <>
                      <span style={{ color: 'var(--green-strong)', fontWeight: 700 }}>Click to upload</span>
                      {' '}or drag and drop
                    </>
                  )}
                </p>
                <p className="card-sub">
                  Excel files only (.xlsx, .xls)
                </p>
              </div>

              <button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="primary-action"
                style={{ width: '100%', marginTop: '16px' }}
              >
                {isUploading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Sites
                  </>
                )}
              </button>

              {result && (
                <div
                  className="formula-box"
                  style={{ color: result.success ? 'var(--green-strong)' : 'var(--red)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {result.success ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <AlertCircle className="h-5 w-5" />
                    )}
                    <span className="font-medium">{result.message}</span>
                  </div>
                  {result.success && (
                    <div style={{ marginTop: '14px' }}>
                      <button
                        className="secondary-action"
                        onClick={() => router.push(withContract('/sites'))}
                      >
                        View Imported Sites
                      </button>
                    </div>
                  )}
                </div>
              )}
          </div>

          <div className="chart-card">
            <div className="chart-title" style={{ marginBottom: '16px' }}>Import Requirements</div>
              <ul className="check-list">
                <li>
                  The spreadsheet must contain a &quot;Portfolio Tracker&quot; tab
                </li>
                <li>
                  Site data should start from row 5 (rows 1-4 are headers)
                </li>
                <li>
                  Required columns: Site Name (C), System Size (D)
                </li>
                <li>
                  Optional columns: Contract (E), Onboard Date (F), PM Cost (G), CCTV (H), Cleaning (I), SPV (V)
                </li>
                <li>
                  Re-importing updates matching rows and adds new sites
                </li>
              </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense fallback={null}>
      <ImportContent />
    </Suspense>
  );
}
