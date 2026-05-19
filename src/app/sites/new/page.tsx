'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SiteForm } from '@/components/sites/SiteForm';
import { SPV, SiteFormData } from '@/types';
import { canEditSites, useCurrentUser } from '@/lib/use-current-user';
import { useContractQuery } from '@/lib/use-contract-query';

function NewSiteContent() {
  const router = useRouter();
  const { withContract } = useContractQuery();
  const [spvs, setSpvs] = useState<SPV[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const allowSiteEdits = canEditSites(user?.role);

  const fetchSpvs = useCallback(async () => {
    try {
      const res = await fetch(withContract('/api/spvs'));
      const data = await res.json();
      if (data.success) {
        setSpvs(data.data);
      }
    } catch {
      console.error('Failed to fetch SPVs');
    }
  }, [withContract]);

  useEffect(() => {
    fetchSpvs();
  }, [fetchSpvs]);

  const handleSubmit = async (formData: SiteFormData) => {
    setIsSaving(true);
    try {
      const res = await fetch(withContract('/api/sites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      
      if (data.success) {
        router.push(withContract(`/sites/${data.data.id}`));
      } else {
        alert(data.error || 'Failed to create site');
      }
    } catch {
      alert('Failed to create site');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isUserLoading && !allowSiteEdits) {
    return (
      <div className="main-content">
        <div className="page-header">
          <span className="eyebrow">Site control</span>
          <h1>Add New Site</h1>
          <p>Manager access required</p>
        </div>
        <div className="content">
          <div className="chart-card">
            Site creation is available to admins and managers only.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="page-header">
        <span className="eyebrow">Site control</span>
        <h1>Add New Site</h1>
        <p>Create a new site entry with billing, SPV, and operational cost details.</p>
      </div>

      <div className="content">
        <SiteForm
          spvs={spvs}
          onSubmit={handleSubmit}
          onCancel={() => router.push(withContract('/sites'))}
          isLoading={isSaving}
        />
      </div>
    </div>
  );
}

export default function NewSitePage() {
  return (
    <Suspense fallback={null}>
      <NewSiteContent />
    </Suspense>
  );
}
