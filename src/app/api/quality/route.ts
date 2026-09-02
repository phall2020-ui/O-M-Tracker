import { NextResponse } from 'next/server';
import { getSites, getSpvs, repairSpvLinks } from '@/lib/db';
import { checkSites, summariseIssues } from '@/lib/data-quality';

export async function GET() {
  const sites = getSites();
  const issues = checkSites(sites, getSpvs());
  return NextResponse.json({ success: true, data: { issues, counts: summariseIssues(issues) } });
}

export async function POST() {
  const fixed = repairSpvLinks();
  const issues = checkSites(getSites(), getSpvs());
  return NextResponse.json({ success: true, data: { fixed, issues, counts: summariseIssues(issues) } });
}
