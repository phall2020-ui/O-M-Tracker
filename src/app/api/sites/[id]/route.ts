import { NextRequest, NextResponse } from 'next/server';
import { deleteSiteRecord, getSite, updateSiteRecord } from '@/lib/portfolio-repository';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { ALL_ROLES } from '@/lib/permissions';
import { SiteFormData } from '@/types';

type ContractScopedSiteBody = SiteFormData & { contract?: string | null };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(ALL_ROLES);
    const { id } = await params;
    const contractId = request.nextUrl.searchParams.get('contract');
    const site = await getSite(id, contractId);
    
    if (!site) {
      return NextResponse.json(
        { success: false, error: 'Site not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: site,
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching site:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch site' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const { id } = await params;
    const body: ContractScopedSiteBody = await request.json();
    const contractId = request.nextUrl.searchParams.get('contract') ?? body.contract ?? body.contractId;
    const updatedSite = await updateSiteRecord(id, body, user, contractId);
    
    if (!updatedSite) {
      return NextResponse.json(
        { success: false, error: 'Failed to update site' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: updatedSite,
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error updating site:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update site' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const { id } = await params;
    const contractId = request.nextUrl.searchParams.get('contract');
    const success = await deleteSiteRecord(id, user, contractId);
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Site not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Site deleted successfully',
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error deleting site:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete site' },
      { status: 500 }
    );
  }
}
