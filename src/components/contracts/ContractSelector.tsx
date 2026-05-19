'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { Contract } from '@/types';

export function ContractSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const selected = searchParams.get('contract') || '';

  useEffect(() => {
    fetch('/api/contracts')
      .then((response) => response.json())
      .then((body) => setContracts(body.success ? body.data : []))
      .catch(() => setContracts([]));
  }, []);

  const value = useMemo(() => {
    const selectedContract = contracts.find((contract) => contract.id === selected || contract.code === selected);
    if (selectedContract) return selectedContract.id;
    return contracts.find((contract) => contract.isDefault)?.id || contracts[0]?.id || '';
  }, [contracts, selected]);

  function changeContract(contractId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('contract', contractId);
    router.push(`${pathname}?${next.toString()}`);
  }

  if (contracts.length <= 1) return null;

  return (
    <label className="contract-selector">
      <Building2 className="h-4 w-4" />
      <select value={value} onChange={(event) => changeContract(event.target.value)} aria-label="Contract">
        {contracts.map((contract) => (
          <option key={contract.id} value={contract.id}>
            {contract.name}
          </option>
        ))}
      </select>
    </label>
  );
}
