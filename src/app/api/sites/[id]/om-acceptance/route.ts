import { NextRequest, NextResponse } from 'next/server';
import { updateSiteOmAcceptance } from '@/lib/portfolio-repository';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER', 'CONTRACTOR']);
    const { id } = await params;
    const body = await request.json() as { acceptedByOm?: unknown; contract?: string | null; contractId?: string | null };

    if (typeof body.acceptedByOm !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'acceptedByOm must be a boolean' },
        { status: 400 }
      );
    }

    const contractId = await resolveContractIdForUser(
      request.nextUrl.searchParams.get('contract') ?? body.contract ?? body.contractId,
      user
    );
    const updatedSite = await updateSiteOmAcceptance(id, body.acceptedByOm, user, contractId);

    if (!updatedSite) {
      return NextResponse.json(
        { success: false, error: 'Site not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedSite,
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error updating O&M acceptance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update O&M acceptance' },
      { status: 500 }
    );
  }
}
