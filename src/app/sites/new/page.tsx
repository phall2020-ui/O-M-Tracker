'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { SiteForm } from '@/components/sites/SiteForm';
import { SPV, SiteFormData } from '@/types';

export default function NewSitePage() {
  const router = useRouter();
  const [spvs, setSpvs] = useState<SPV[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSpvs();
  }, []);

  const fetchSpvs = async () => {
    try {
      const res = await fetch('/api/spvs');
      const data = await res.json();
      if (data.success) {
        setSpvs(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch SPVs');
    }
  };

  const handleSubmit = async (formData: SiteFormData) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      
      if (data.success) {
        router.push(`/sites/${data.data.id}`);
      } else {
        alert(data.error || 'Failed to create site');
      }
    } catch (err) {
      alert('Failed to create site');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Add New Site" 
        subtitle="Create a new site entry"
      />
      
      <div className="flex-1 p-6 flex justify-center">
        <SiteForm
          spvs={spvs}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/sites')}
          isLoading={isSaving}
        />
      </div>
    </div>
  );
}
