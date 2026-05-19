export function appendContractQuery(url: string, contractId: string | null | undefined): string {
  if (!contractId) return url;

  const [pathAndQuery, hash = ''] = url.split('#');
  const [path, query = ''] = pathAndQuery.split('?');
  const params = new URLSearchParams(query);
  params.set('contract', contractId);

  return `${path}?${params.toString()}${hash ? `#${hash}` : ''}`;
}
