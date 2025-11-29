import { NextRequest, NextResponse } from 'next/server';
import { getSites, createSite, getSpvByCode } from '@/lib/db';
import { calculateSiteWithAllTiers } from '@/lib/calculations';
import { Site, SiteFormData } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const spvCode = searchParams.get('spv') || '';
    const contractStatus = searchParams.get('contract') || '';
    const sortBy = searchParams.get('sortBy') || 'name';
    const sortOrder = searchParams.get('sortOrder') || 'asc';
    
    let sites = getSites();
    
    // Apply filters
    if (search) {
      sites = sites.filter(s => 
        s.name.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (spvCode) {
      sites = sites.filter(s => s.spvCode === spvCode);
    }
    
    if (contractStatus) {
      sites = sites.filter(s => s.contractStatus === contractStatus);
    }
    
    // Sort
    sites.sort((a, b) => {
      let aVal: string | number = a[sortBy as keyof Site] as string | number;
      let bVal: string | number = b[sortBy as keyof Site] as string | number;
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    // Calculate all values
    const sitesWithCalcs = sites.map(s => calculateSiteWithAllTiers(s));
    
    return NextResponse.json({
      success: true,
      data: sitesWithCalcs,
    });
  } catch (error) {
    console.error('Error fetching sites:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sites' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SiteFormData = await request.json();
    
    // Validate required fields
    if (!body.name || body.systemSizeKwp === undefined) {
      return NextResponse.json(
        { success: false, error: 'Name and system size are required' },
        { status: 400 }
      );
    }
    
    // Get SPV code if spvId provided
    let spvCode: string | null = null;
    if (body.spvId) {
      const spv = getSpvByCode(body.spvId);
      spvCode = spv?.code || null;
    }
    
    const newSite = createSite({
      name: body.name,
      systemSizeKwp: body.systemSizeKwp,
      siteType: body.siteType || 'Rooftop',
      contractStatus: body.contractStatus || 'No',
      onboardDate: body.onboardDate || null,
      pmCost: body.pmCost || 0,
      cctvCost: body.cctvCost || 0,
      cleaningCost: body.cleaningCost || 0,
      spvId: body.spvId || null,
      spvCode: spvCode,
      sourceSheet: null,
      sourceRow: null,
    });
    
    const siteWithCalcs = calculateSiteWithAllTiers(newSite);
    
    return NextResponse.json({
      success: true,
      data: siteWithCalcs,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating site:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create site' },
      { status: 500 }
    );
  }
}
