import { NextRequest, NextResponse } from 'next/server';
import { previewOrImportNotionSites } from '@/lib/notion-integration';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN']);
    const body = await request.json();
    const databaseId = body.databaseId || process.env.NOTION_SITES_DATABASE_ID;
    const contractId = await resolveContractIdForUser(request.nextUrl.searchParams.get('contract') ?? body.contract ?? body.contractId, user);

    if (!databaseId) {
      return NextResponse.json(
        { success: false, error: 'Notion database ID is required' },
        { status: 400 }
      );
    }

    const report = await previewOrImportNotionSites(databaseId, body.commit === true, user, contractId);
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error importing from Notion:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to import from Notion' },
      { status: 500 }
    );
  }
}
