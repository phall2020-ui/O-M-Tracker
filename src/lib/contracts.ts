import prisma from './prisma';
import type { AppSessionUser } from './authz';

export const DEFAULT_CONTRACT_CODE = 'CLEARSOL_O_M';
export const DEFAULT_CONTRACT_NAME = 'Clearsol O&M';
export const DEFAULT_CONTRACTOR_SLUG = 'clearsol-o-m';

export interface ContractOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  notionSummaryPageId: string | null;
  notionBillingDatabaseId: string | null;
  contractorId: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface CreateContractInput {
  name: string;
  description?: string | null;
  notionSummaryPageId?: string | null;
  notionBillingDatabaseId?: string | null;
}

export interface UpdateContractInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  notionSummaryPageId?: string | null;
  notionBillingDatabaseId?: string | null;
}

export function normalizeContractCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function slugifyContractor(value: string): string {
  return normalizeContractCode(value).toLowerCase().replace(/_/g, '-');
}

export function selectedContractWhere(contractId: string): { contractId: string } {
  return { contractId };
}

function isGlobalContractRole(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

function visibleContractWhere(user?: Pick<AppSessionUser, 'role' | 'contractorIds'> | null) {
  if (!user || isGlobalContractRole(user.role)) {
    return { isActive: true };
  }

  return {
    isActive: true,
    contractorId: { in: user.contractorIds || [] },
  };
}

function mapContractOption(row: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  notionSummaryPageId: string | null;
  notionBillingDatabaseId: string | null;
  contractorId: string | null;
  isDefault: boolean;
  isActive: boolean;
}): ContractOption {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    notionSummaryPageId: row.notionSummaryPageId,
    notionBillingDatabaseId: row.notionBillingDatabaseId,
    contractorId: row.contractorId,
    isDefault: row.isDefault,
    isActive: row.isActive,
  };
}

export async function ensureDefaultContract() {
  const defaultContractor = await prisma.contractor.upsert({
    where: { code: DEFAULT_CONTRACT_CODE },
    update: { name: DEFAULT_CONTRACT_NAME, slug: DEFAULT_CONTRACTOR_SLUG, isActive: true },
    create: {
      code: DEFAULT_CONTRACT_CODE,
      name: DEFAULT_CONTRACT_NAME,
      slug: DEFAULT_CONTRACTOR_SLUG,
      isActive: true,
    },
  });

  const [, defaultContract] = await prisma.$transaction([
    prisma.contract.updateMany({
      where: { code: { not: DEFAULT_CONTRACT_CODE }, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.contract.upsert({
      where: { code: DEFAULT_CONTRACT_CODE },
      update: { name: DEFAULT_CONTRACT_NAME, isDefault: true, isActive: true, contractorId: defaultContractor.id },
      create: {
        code: DEFAULT_CONTRACT_CODE,
        name: DEFAULT_CONTRACT_NAME,
        isDefault: true,
        isActive: true,
        contractorId: defaultContractor.id,
      },
    }),
  ]);

  return defaultContract;
}

export async function listContracts(): Promise<ContractOption[]> {
  return listContractsForUser(null);
}

export async function listContractsForUser(user: Pick<AppSessionUser, 'role' | 'contractorIds'> | null): Promise<ContractOption[]> {
  const rows = await prisma.contract.findMany({
    where: visibleContractWhere(user),
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return rows.map(mapContractOption);
}

function normalizeNullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed || null;
}

export async function createContract(input: CreateContractInput): Promise<ContractOption> {
  const name = input.name?.trim();
  if (!name) throw new Error('Contract name is required');

  const code = normalizeContractCode(name);
  const existing = await prisma.contract.findUnique({ where: { code } });
  if (existing) throw new Error('Contract code already exists');
  const contractor = await prisma.contractor.upsert({
    where: { code },
    update: { name, slug: slugifyContractor(name), isActive: true },
    create: { code, name, slug: slugifyContractor(name), isActive: true },
  });

  const contract = await prisma.contract.create({
    data: {
      code,
      name,
      description: normalizeNullableText(input.description) ?? null,
      notionSummaryPageId: normalizeNullableText(input.notionSummaryPageId) ?? null,
      notionBillingDatabaseId: normalizeNullableText(input.notionBillingDatabaseId) ?? null,
      contractorId: contractor.id,
      isActive: true,
      isDefault: false,
    },
  });

  return {
    id: contract.id,
    code: contract.code,
    name: contract.name,
    description: contract.description,
    notionSummaryPageId: contract.notionSummaryPageId,
    notionBillingDatabaseId: contract.notionBillingDatabaseId,
    contractorId: contract.contractorId,
    isDefault: contract.isDefault,
    isActive: contract.isActive,
  };
}

export async function updateContract(id: string, input: UpdateContractInput): Promise<ContractOption | null> {
  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing) return null;

  const data: UpdateContractInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Contract name is required');
    data.name = name;
  }
  if (input.description !== undefined) data.description = normalizeNullableText(input.description) ?? null;
  if (input.notionSummaryPageId !== undefined) data.notionSummaryPageId = normalizeNullableText(input.notionSummaryPageId) ?? null;
  if (input.notionBillingDatabaseId !== undefined) data.notionBillingDatabaseId = normalizeNullableText(input.notionBillingDatabaseId) ?? null;
  if (input.isActive !== undefined) {
    if (existing.isDefault && input.isActive === false) {
      throw new Error('Default contract cannot be deactivated');
    }
    data.isActive = input.isActive;
  }

  const contract = await prisma.contract.update({
    where: { id },
    data,
  });

  return {
    id: contract.id,
    code: contract.code,
    name: contract.name,
    description: contract.description,
    notionSummaryPageId: contract.notionSummaryPageId,
    notionBillingDatabaseId: contract.notionBillingDatabaseId,
    contractorId: contract.contractorId,
    isDefault: contract.isDefault,
    isActive: contract.isActive,
  };
}

export async function resolveContractId(contractIdOrCode?: string | null): Promise<string> {
  return resolveContractIdForUser(contractIdOrCode, null);
}

export async function resolveContractIdForUser(
  contractIdOrCode: string | null | undefined,
  user: Pick<AppSessionUser, 'role' | 'contractorIds'> | null
): Promise<string> {
  const selectedInput = contractIdOrCode?.trim();
  if (selectedInput) {
    const selected = await prisma.contract.findFirst({
      where: {
        ...visibleContractWhere(user),
        OR: [{ id: selectedInput }, { code: normalizeContractCode(selectedInput) }],
      },
    });
    if (selected) return selected.id;
    throw new Error(`Contract not found: ${selectedInput}`);
  }

  const contracts = await listContractsForUser(user);
  const defaultVisible = contracts.find((contract) => contract.isDefault) || contracts[0];
  if (defaultVisible) return defaultVisible.id;

  if (!user || isGlobalContractRole(user.role)) {
    return (await ensureDefaultContract()).id;
  }

  throw new Error('No accessible contracts');
}
