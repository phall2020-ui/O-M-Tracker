import { NextResponse } from 'next/server';
import { requireUser, authErrorResponse } from '../../../../lib/authz';
import { listSites } from '../../../../lib/portfolio-repository';
import { resolveContractIdForUser } from '../../../../lib/contracts';
import {
  DEFAULT_CUSTOM_EXPORT_FIELDS,
  normalizeCustomExportFields,
  writeClearsolExportBuffer,
  writeCustomSitesExportBuffer,
} from '../../../../lib/excel-export';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const contractId = await resolveContractIdForUser(url.searchParams.get('contract'), user);
    const sites = await listSites({ sortBy: 'systemSizeKwp', sortOrder: 'asc', contractId });
    const mode = url.searchParams.get('mode');
    const date = new Date().toISOString().slice(0, 10);
    const requestedFields = url.searchParams.get('fields')?.split(',').map((field) => field.trim()).filter(Boolean) || [];
    const selectedFields = normalizeCustomExportFields(requestedFields);
    const isCustomExport = mode === 'custom' || requestedFields.length > 0;
    const buffer = isCustomExport
      ? await writeCustomSitesExportBuffer(sites, selectedFields.length ? selectedFields : DEFAULT_CUSTOM_EXPORT_FIELDS)
      : await writeClearsolExportBuffer(sites);
    const filename = isCustomExport
      ? `clearsol-sites-custom-export-${date}.xlsx`
      : `clearsol-om-framework-tracker-${date}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error exporting Excel workbook:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export Excel workbook' },
      { status: 500 }
    );
  }
}
