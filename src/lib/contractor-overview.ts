import prisma from './prisma';

interface ContractorOverviewRow {
  id: string;
  code: string;
  name: string;
  slug: string;
  contractCount: number;
  siteCount: number;
  contractedSiteCount: number;
  totalCapacityKwp: number;
  contractedCapacityKwp: number;
  monthlyBillingAmount: number;
  pendingCmWorkCount: number;
}

export interface ContractorOverview {
  totals: {
    contractorCount: number;
    contractCount: number;
    siteCount: number;
    contractedSiteCount: number;
    totalCapacityKwp: number;
    contractedCapacityKwp: number;
    monthlyBillingAmount: number;
    pendingCmWorkCount: number;
  };
  contractors: ContractorOverviewRow[];
}

function isContracted(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === 'YES' || normalized === 'CONTRACTED';
}

export async function getContractorOverview(): Promise<ContractorOverview> {
  const contractors = await prisma.contractor.findMany({
    where: { isActive: true },
    include: {
      contracts: {
        where: { isActive: true },
        include: {
          sites: {
            select: {
              id: true,
              systemSizeKwp: true,
              contractStatus: true,
              _count: { select: { cmWorkEntries: { where: { status: 'PENDING' } } } },
            },
          },
          billingSnapshots: {
            where: { source: 'APP_GENERATED', status: 'COMMITTED' },
            select: { expectedAmount: true },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows = contractors.map((contractor) => {
    const sites = contractor.contracts.flatMap((contract) => contract.sites);
    const contractedSites = sites.filter((site) => isContracted(site.contractStatus));
    return {
      id: contractor.id,
      code: contractor.code,
      name: contractor.name,
      slug: contractor.slug,
      contractCount: contractor.contracts.length,
      siteCount: sites.length,
      contractedSiteCount: contractedSites.length,
      totalCapacityKwp: sites.reduce((sum, site) => sum + site.systemSizeKwp, 0),
      contractedCapacityKwp: contractedSites.reduce((sum, site) => sum + site.systemSizeKwp, 0),
      monthlyBillingAmount: contractor.contracts.reduce(
        (sum, contract) => sum + contract.billingSnapshots.reduce((subtotal, snapshot) => subtotal + (snapshot.expectedAmount || 0), 0),
        0
      ),
      pendingCmWorkCount: sites.reduce((sum, site) => sum + site._count.cmWorkEntries, 0),
    };
  });

  return {
    totals: {
      contractorCount: rows.length,
      contractCount: rows.reduce((sum, row) => sum + row.contractCount, 0),
      siteCount: rows.reduce((sum, row) => sum + row.siteCount, 0),
      contractedSiteCount: rows.reduce((sum, row) => sum + row.contractedSiteCount, 0),
      totalCapacityKwp: rows.reduce((sum, row) => sum + row.totalCapacityKwp, 0),
      contractedCapacityKwp: rows.reduce((sum, row) => sum + row.contractedCapacityKwp, 0),
      monthlyBillingAmount: rows.reduce((sum, row) => sum + row.monthlyBillingAmount, 0),
      pendingCmWorkCount: rows.reduce((sum, row) => sum + row.pendingCmWorkCount, 0),
    },
    contractors: rows,
  };
}
