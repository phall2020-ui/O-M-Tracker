import { NextRequest, NextResponse } from 'next/server';
import { getSites, createSite, resolveSpv } from '@/lib/db';
import { calculateSitesAtCurrentTier } from '@/lib/calculations';
import { SiteFormData } from '@/types';
import { ValidationError } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const spvCode = searchParams.get('spv') || '';
    const contractStatus = searchParams.get('contract') || '';

    let sites = getSites();
    if (search) sites = sites.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
    if (spvCode) sites = sites.filter((s) => (s.spvCode || 'Unassigned') === spvCode);
    if (contractStatus) sites = sites.filter((s) => s.contractStatus === contractStatus);

    const { sites: calculated, tier } = calculateSitesAtCurrentTier(sites);
    return NextResponse.json({ success: true, data: calculated, currentTier: tier });
  } catch (error) {
    console.error('Error fetching sites:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch sites' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SiteFormData = await request.json();
    const spv = resolveSpv(body.spvId);
    const newSite = createSite({
      name: body.name,
      systemSizeKwp: body.systemSizeKwp,
      siteType: body.siteType || 'Rooftop',
      contractStatus: body.contractStatus || 'No',
      onboardDate: body.onboardDate || null,
      pmCost: body.pmCost || 0,
      cctvCost: body.cctvCost || 0,
      cleaningCost: body.cleaningCost || 0,
      spvId: spv?.id || null,
      spvCode: spv?.code || null,
      sourceSheet: null,
      sourceRow: null,
    });
    const { sites } = calculateSitesAtCurrentTier([newSite, ...getSites()]);
    return NextResponse.json({ success: true, data: sites.find((s) => s.id === newSite.id) }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.errors.join('; '), errors: error.errors }, { status: 400 });
    }
    console.error('Error creating site:', error);
    return NextResponse.json({ success: false, error: 'Failed to create site' }, { status: 500 });
  }
}
