import { NextRequest, NextResponse } from 'next/server';
import { createSiteRecord, listSites } from '@/lib/portfolio-repository';
import { SiteFormData } from '@/types';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { ALL_ROLES } from '@/lib/permissions';

type ContractScopedSiteBody = SiteFormData & { contract?: string | null };

export async function GET(request: NextRequest) {
  try {
    await requireRole(ALL_ROLES);
    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') || '';
    const spvCode = searchParams.get('spv') || '';
    const contractId = searchParams.get('contract');
    const contractStatus = searchParams.get('contractStatus') || searchParams.get('status') || '';
    const sortBy = searchParams.get('sortBy') || 'name';
    const sortOrder = searchParams.get('sortOrder') || 'asc';
    
    const sitesWithCalcs = await listSites({ search, spvCode, contractStatus, sortBy, sortOrder, contractId });
    
    return NextResponse.json({
      success: true,
      data: sitesWithCalcs,
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching sites:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sites' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const body: ContractScopedSiteBody = await request.json();
    const contractId = request.nextUrl.searchParams.get('contract') ?? body.contract ?? body.contractId;
    
    // Validate required fields
    if (!body.name || body.systemSizeKwp === undefined) {
      return NextResponse.json(
        { success: false, error: 'Name and system size are required' },
        { status: 400 }
      );
    }
    
    const siteWithCalcs = await createSiteRecord(body, user, contractId);
    
    return NextResponse.json({
      success: true,
      data: siteWithCalcs,
    }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error creating site:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create site' },
      { status: 500 }
    );
  }
}
