import { Site, SPV } from '@/types';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface DataQualityIssue {
  severity: IssueSeverity;
  code: string;
  siteId: string | null;
  siteName: string | null;
  message: string;
  fixable: boolean;
}

const ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

function issue(
  severity: IssueSeverity,
  code: string,
  message: string,
  site?: Site,
  fixable = false
): DataQualityIssue {
  return {
    severity,
    code,
    siteId: site?.id ?? null,
    siteName: site?.name ?? null,
    message,
    fixable,
  };
}

export function checkSites(sites: Site[], spvs: SPV[], today = new Date()): DataQualityIssue[] {
  const known = Object.fromEntries(spvs.map((s) => [s.code.toUpperCase(), s]));
  const issues: DataQualityIssue[] = [];
  const names = new Map<string, Site[]>();

  for (const site of sites) {
    const key = (site.name || '').trim().toLowerCase();
    if (key) names.set(key, [...(names.get(key) || []), site]);
  }

  const todayIso = today.toISOString().slice(0, 10);

  for (const site of sites) {
    const size = site.systemSizeKwp || 0;
    const contracted = site.contractStatus === 'Yes';
    const code = site.spvCode;

    if (size <= 0) issues.push(issue('error', 'zero_size', 'System size is 0 kWp — fees cannot be calculated', site));

    if (code) {
      const upper = code.trim().toUpperCase();
      const spv = known[upper];
      if (!spv) {
        issues.push(issue('error', 'unknown_spv', `SPV code "${code}" does not match any configured SPV`, site));
      } else if (site.spvId !== spv.id || code !== upper) {
        issues.push(issue('warning', 'spv_link', `SPV link out of sync for code "${code}" (auto-fixable)`, site, true));
      }
    } else {
      issues.push(issue('warning', 'no_spv', 'No SPV assigned', site));
    }

    if (contracted && !site.onboardDate) {
      issues.push(issue('warning', 'no_onboard_date', 'Contracted site has no onboard date — excluded from CM Days tracking', site));
    }
    if (site.onboardDate && site.onboardDate.slice(0, 10) > todayIso) {
      issues.push(issue('warning', 'future_onboard', `Onboard date ${site.onboardDate.slice(0, 10)} is in the future`, site));
    }
    if (!contracted && site.onboardDate) {
      issues.push(issue('info', 'date_not_contracted', 'Has an onboard date but is not marked as contracted', site));
    }

    const costs = (site.pmCost || 0) + (site.cctvCost || 0) + (site.cleaningCost || 0);
    if (contracted && size > 0 && costs === 0) {
      issues.push(issue('info', 'zero_costs', 'Contracted site has £0 fixed costs (PM, CCTV, Cleaning)', site));
    }
    if (size > 100_000) {
      issues.push(issue('warning', 'large_size', `System size ${size.toLocaleString('en-GB')} kWp looks unusually large`, site));
    }
  }

  for (const group of names.values()) {
    if (group.length > 1) {
      for (const site of group) {
        issues.push(issue('warning', 'duplicate_name', `Site name appears ${group.length} times`, site));
      }
    }
  }

  return issues.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.siteName || '').localeCompare(b.siteName || ''));
}

export function summariseIssues(issues: DataQualityIssue[]) {
  const counts = { error: 0, warning: 0, info: 0, total: issues.length, fixable: 0, sitesAffected: 0 };
  const sites = new Set<string>();
  for (const issue of issues) {
    counts[issue.severity] += 1;
    if (issue.fixable) counts.fixable += 1;
    if (issue.siteId) sites.add(issue.siteId);
  }
  counts.sitesAffected = sites.size;
  return counts;
}
