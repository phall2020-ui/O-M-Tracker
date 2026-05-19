import { NextRequest, NextResponse } from 'next/server';
import { updateContract } from '@/lib/contracts';
import { authErrorResponse, requireRole } from '@/lib/authz';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['ADMIN']);
    const { id } = await params;
    const body = await request.json();
    const contract = await updateContract(id, {
      name: body.name,
      description: body.description,
      isActive: body.isActive,
      notionSummaryPageId: body.notionSummaryPageId,
      notionBillingDatabaseId: body.notionBillingDatabaseId,
    });

    if (!contract) {
      return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: contract });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update contract' },
      { status: 400 }
    );
  }
}
