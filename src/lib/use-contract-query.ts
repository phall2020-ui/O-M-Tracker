'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { appendContractQuery } from './contract-query';

export function useContractQuery() {
  const searchParams = useSearchParams();
  const contract = searchParams.get('contract') || '';
  const withContract = useCallback((url: string) => appendContractQuery(url, contract), [contract]);

  return {
    contract,
    withContract,
  };
}
