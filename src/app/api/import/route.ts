import { NextRequest, NextResponse } from 'next/server';
import { importSiteRecords } from '@/lib/portfolio-repository';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { loadClearsolWorkbook, parseClearsolWorkbook } from '@/lib/clearsol-import';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const contractId = await resolveContractIdForUser(
      request.nextUrl.searchParams.get('contract') ??
      (formData.get('contract') as string | null) ??
      (formData.get('contractId') as string | null),
      user
    );
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const workbook = await loadClearsolWorkbook(arrayBuffer);
    const sites = parseClearsolWorkbook(workbook);
    
    if (sites.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid sites found in spreadsheet' },
        { status: 400 }
      );
    }
    
    const importedSites = await importSiteRecords(sites, user, contractId);
    
    return NextResponse.json({
      success: true,
      data: {
        count: importedSites.length,
        message: `Successfully reconciled ${importedSites.length} sites`,
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error importing sites:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to import sites' },
      { status: 500 }
    );
  }
}
