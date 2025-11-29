'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SiteFormData, SPV, SiteWithCalculations } from '@/types';
import { X } from 'lucide-react';

interface SiteFormProps {
  site?: SiteWithCalculations | null;
  spvs: SPV[];
  onSubmit: (data: SiteFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function SiteForm({ site, spvs, onSubmit, onCancel, isLoading }: SiteFormProps) {
  const [formData, setFormData] = useState<SiteFormData>({
    name: '',
    systemSizeKwp: 0,
    siteType: 'Rooftop',
    contractStatus: 'No',
    onboardDate: null,
    pmCost: 0,
    cctvCost: 0,
    cleaningCost: 0,
    spvId: null,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof SiteFormData, string>>>({});

  useEffect(() => {
    if (site) {
      setFormData({
        name: site.name,
        systemSizeKwp: site.systemSizeKwp,
        siteType: site.siteType,
        contractStatus: site.contractStatus,
        onboardDate: site.onboardDate,
        pmCost: site.pmCost,
        cctvCost: site.cctvCost,
        cleaningCost: site.cleaningCost,
        spvId: site.spvCode,
      });
    }
  }, [site]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value || null,
    }));
    
    // Clear error when field is modified
    if (errors[name as keyof SiteFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof SiteFormData, string>> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Site name is required';
    }
    
    if (formData.systemSizeKwp <= 0) {
      newErrors.systemSizeKwp = 'System size must be greater than 0';
    }
    
    if (formData.contractStatus === 'Yes' && !formData.onboardDate) {
      newErrors.onboardDate = 'Onboard date is required for contracted sites';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    await onSubmit(formData);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{site ? 'Edit Site' : 'Add New Site'}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Basic Information</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">Site Name *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.name}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="systemSizeKwp">System Size (kWp) *</Label>
                <Input
                  id="systemSizeKwp"
                  name="systemSizeKwp"
                  type="number"
                  step="0.01"
                  value={formData.systemSizeKwp}
                  onChange={handleChange}
                  className={errors.systemSizeKwp ? 'border-red-500' : ''}
                />
                {errors.systemSizeKwp && (
                  <p className="mt-1 text-sm text-red-500">{errors.systemSizeKwp}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="siteType">Site Type</Label>
                <Select
                  id="siteType"
                  name="siteType"
                  value={formData.siteType}
                  onChange={handleChange}
                >
                  <option value="Rooftop">Rooftop</option>
                  <option value="Ground Mount">Ground Mount</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Contract Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Contract Details</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contractStatus">Contract Status</Label>
                <Select
                  id="contractStatus"
                  name="contractStatus"
                  value={formData.contractStatus}
                  onChange={handleChange}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="onboardDate">Onboard Date</Label>
                <Input
                  id="onboardDate"
                  name="onboardDate"
                  type="date"
                  value={formData.onboardDate || ''}
                  onChange={handleChange}
                  className={errors.onboardDate ? 'border-red-500' : ''}
                />
                {errors.onboardDate && (
                  <p className="mt-1 text-sm text-red-500">{errors.onboardDate}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="spvId">SPV</Label>
                <Select
                  id="spvId"
                  name="spvId"
                  value={formData.spvId || ''}
                  onChange={handleChange}
                >
                  <option value="">Select SPV...</option>
                  {spvs.map((spv) => (
                    <option key={spv.id} value={spv.code}>
                      {spv.code} - {spv.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {/* Costs */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Site Fixed Costs (£)</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="pmCost">PM Cost</Label>
                <Input
                  id="pmCost"
                  name="pmCost"
                  type="number"
                  step="0.01"
                  value={formData.pmCost}
                  onChange={handleChange}
                />
              </div>
              
              <div>
                <Label htmlFor="cctvCost">CCTV Cost</Label>
                <Input
                  id="cctvCost"
                  name="cctvCost"
                  type="number"
                  step="0.01"
                  value={formData.cctvCost}
                  onChange={handleChange}
                />
              </div>
              
              <div>
                <Label htmlFor="cleaningCost">Cleaning Cost</Label>
                <Input
                  id="cleaningCost"
                  name="cleaningCost"
                  type="number"
                  step="0.01"
                  value={formData.cleaningCost}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : site ? 'Update Site' : 'Create Site'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
