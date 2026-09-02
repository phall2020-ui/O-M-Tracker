import { NextResponse } from 'next/server';
import { requireUser, authErrorResponse } from '../../../../lib/authz';
import { activeRateTiers, listSites } from '../../../../lib/portfolio-repository';
import { resolveContractIdForUser } from '../../../../lib/contracts';
import {
  DEFAULT_CUSTOM_EXPORT_FIELDS,
  normalizeCustomExportFields,
  writeClearsolExportBuffer,
  writeCustomSitesExportBuffer,
  writePipelineCostBuildUpBuffer,
} from '../../../../lib/excel-export';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const contractId = await resolveContractIdForUser(url.searchParams.get('contract'), user);
    const [sites, tiers] = await Promise.all([
      listSites({ sortBy: 'systemSizeKwp', sortOrder: 'asc', contractId }),
      activeRateTiers(contractId),
    ]);
    const mode = url.searchParams.get('mode');
    const date = new Date().toISOString().slice(0, 10);
    const requestedFields = url.searchParams.get('fields')?.split(',').map((field) => field.trim()).filter(Boolean) || [];
    const selectedFields = normalizeCustomExportFields(requestedFields);
    const scope = url.searchParams.get('scope');
    const isCustomExport = mode === 'custom' || requestedFields.length > 0;
    const isPipelineCostBuildUpExport = scope === 'pipeline' && mode === 'cost-build-up';
    const buffer = isPipelineCostBuildUpExport
      ? await writePipelineCostBuildUpBuffer(sites)
      : isCustomExport
        ? await writeCustomSitesExportBuffer(sites, selectedFields.length ? selectedFields : DEFAULT_CUSTOM_EXPORT_FIELDS, tiers)
        : await writeClearsolExportBuffer(sites, tiers);
    const filename = isPipelineCostBuildUpExport
      ? `clearsol-pipeline-cost-build-up-${date}.xlsx`
      : isCustomExport
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
