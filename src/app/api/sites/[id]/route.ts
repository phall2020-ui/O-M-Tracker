import { NextRequest, NextResponse } from 'next/server';
import { getSiteById, updateSite, deleteSite, getSpvByCode } from '@/lib/db';
import { calculateSiteWithAllTiers } from '@/lib/calculations';
import { SiteFormData } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const site = getSiteById(id);
    
    if (!site) {
      return NextResponse.json(
        { success: false, error: 'Site not found' },
        { status: 404 }
      );
    }
    
    const siteWithCalcs = calculateSiteWithAllTiers(site);
    
    return NextResponse.json({
      success: true,
      data: siteWithCalcs,
    });
  } catch (error) {
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
    const { id } = await params;
    const body: Partial<SiteFormData> = await request.json();
    
    const existingSite = getSiteById(id);
    if (!existingSite) {
      return NextResponse.json(
        { success: false, error: 'Site not found' },
        { status: 404 }
      );
    }
    
    // Get SPV code if spvId changed
    let spvCode = existingSite.spvCode;
    if (body.spvId !== undefined) {
      if (body.spvId) {
        const spv = getSpvByCode(body.spvId);
        spvCode = spv?.code || null;
      } else {
        spvCode = null;
      }
    }
    
    const updatedSite = updateSite(id, {
      ...body,
      spvCode,
    });
    
    if (!updatedSite) {
      return NextResponse.json(
        { success: false, error: 'Failed to update site' },
        { status: 500 }
      );
    }
    
    const siteWithCalcs = calculateSiteWithAllTiers(updatedSite);
    
    return NextResponse.json({
      success: true,
      data: siteWithCalcs,
    });
  } catch (error) {
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
    const { id } = await params;
    const success = deleteSite(id);
    
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
    console.error('Error deleting site:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete site' },
      { status: 500 }
    );
  }
}
