export interface ExistingImportedSite {
  id: string;
  name: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  spvId: string | null;
}

export interface IncomingImportedSite {
  name: string;
  sourceSheet?: string | null;
  sourceRow?: number | null;
  spvId: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

export function findMatchingImportedSite<T extends ExistingImportedSite>(
  existingSites: T[],
  incoming: IncomingImportedSite
): T | null {
  const sourceSheet = normalizeText(incoming.sourceSheet);
  if (sourceSheet && incoming.sourceRow) {
    const rowMatch = existingSites.find(
      (site) =>
        normalizeText(site.sourceSheet) === sourceSheet &&
        site.sourceRow === incoming.sourceRow
    );
    if (rowMatch) return rowMatch;
  }

  const incomingName = normalizeText(incoming.name);
  return existingSites.find(
    (site) => normalizeText(site.name) === incomingName && site.spvId === incoming.spvId
  ) || null;
}
