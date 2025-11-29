'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { SitesTable } from '@/components/sites/SitesTable';
import { Button } from '@/components/ui/button';
import { SiteWithCalculations } from '@/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default function SitesPage() {
  const router = useRouter();
  const [sites, setSites] = useState<SiteWithCalculations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/sites');
      const data = await res.json();
      
      if (data.success) {
        setSites(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch sites');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (site: SiteWithCalculations) => {
    if (!confirm(`Are you sure you want to delete "${site.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setSites((prev) => prev.filter((s) => s.id !== site.id));
      } else {
        alert('Failed to delete site');
      }
    } catch (err) {
      alert('Failed to delete site');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Sites" 
        subtitle={`${sites.length} sites in portfolio`}
      />
      
      <div className="flex-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">
              View and manage all sites in your portfolio
            </p>
          </div>
          <Link href="/sites/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Site
            </Button>
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        ) : (
          <SitesTable
            data={sites}
            isLoading={isLoading}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}
