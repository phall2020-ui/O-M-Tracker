'use client';

import { type ReactNode, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { SiteFormData, SPV, SiteWithCalculations } from '@/types';
import { Calendar, Landmark, Save, Wrench, X, Zap } from 'lucide-react';

interface SiteFormProps {
  site?: SiteWithCalculations | null;
  spvs: SPV[];
  onSubmit: (data: SiteFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

function FormSection({
  title,
  description,
  icon,
  children,
  className = '',
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`site-form-panel ${className}`}>
      <div className="site-form-panel-header">
        <div className="site-form-panel-icon">{icon}</div>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="site-form-panel-body">{children}</div>
    </section>
  );
}

export function SiteForm({ site, spvs, onSubmit, onCancel, isLoading }: SiteFormProps) {
  const [formData, setFormData] = useState<SiteFormData>({
    name: '',
    systemSizeKwp: 0,
    siteType: 'Rooftop',
    contractStatus: 'Awaiting PAC',
    onboardDate: null,
    forecastPacDate: null,
    actualPacDate: null,
    pmCost: 0,
    pmDaysOnSite: 0,
    pmVisitsPerAnnum: 0,
    cctvCost: 0,
    cleaningCost: 0,
    additionalCostAnnual: 0,
    additionalCostAnnualComment: null,
    additionalCostMonthly: 0,
    additionalCostMonthlyComment: null,
    additionalCostMonthlyStartMonth: null,
    additionalCostMonthlyEndMonth: null,
    billingPortfolio: 'CORE',
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
        forecastPacDate: site.forecastPacDate,
        actualPacDate: site.actualPacDate,
        pmCost: site.pmCost,
        pmDaysOnSite: site.pmDaysOnSite,
        pmVisitsPerAnnum: site.pmVisitsPerAnnum,
        cctvCost: site.cctvCost,
        cleaningCost: site.cleaningCost,
        additionalCostAnnual: site.additionalCostAnnual,
        additionalCostAnnualComment: site.additionalCostAnnualComment,
        additionalCostMonthly: site.additionalCostMonthly,
        additionalCostMonthlyComment: site.additionalCostMonthlyComment,
        additionalCostMonthlyStartMonth: site.additionalCostMonthlyStartMonth,
        additionalCostMonthlyEndMonth: site.additionalCostMonthlyEndMonth,
        billingPortfolio: site.billingPortfolio,
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
    
    if (formData.contractStatus === 'Contracted' && !formData.onboardDate) {
      newErrors.onboardDate = 'Onboard date is required for contracted billing';
    }

    if (
      formData.additionalCostMonthlyStartMonth &&
      formData.additionalCostMonthlyEndMonth &&
      formData.additionalCostMonthlyStartMonth > formData.additionalCostMonthlyEndMonth
    ) {
      newErrors.additionalCostMonthlyEndMonth = 'End month must be after start month';
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
    <form onSubmit={handleSubmit} className="site-form-shell">
      <div className="site-form-header">
        <div>
          <span className="eyebrow">{site ? 'Editing record' : 'Create record'}</span>
          <h2>{site?.name || 'New site'}</h2>
          <p>Maintain the site profile, billing assignment, and cost inputs used for monthly reporting.</p>
        </div>
        <button className="icon-action" type="button" onClick={onCancel} title="Close form">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="site-form-grid">
        <FormSection
          title="Site Identity"
          description="Name, system size, and physical installation type."
          icon={<Zap className="h-5 w-5" />}
        >
            <div className="site-form-fields two-col">
              <div className="site-form-field span-2">
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
              
              <div className="site-form-field">
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
              
              <div className="site-form-field">
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
        </FormSection>

        <FormSection
          title="Contract & SPV"
          description="Controls whether the site contributes to contracted billing."
          icon={<Landmark className="h-5 w-5" />}
        >
            <div className="site-form-fields two-col">
              <div className="site-form-field">
                <Label htmlFor="contractStatus">Contract Status</Label>
                <Select
                  id="contractStatus"
                  name="contractStatus"
                  value={formData.contractStatus}
                  onChange={handleChange}
                >
                  <option value="Awaiting Contract">Awaiting Contract</option>
                  <option value="Awaiting PAC">Awaiting PAC</option>
                  <option value="Contracted">Contracted</option>
                </Select>
              </div>
              
              <div className="site-form-field">
                <Label htmlFor="forecastPacDate">Forecast PAC Date</Label>
                <Input
                  id="forecastPacDate"
                  name="forecastPacDate"
                  type="date"
                  value={formData.forecastPacDate || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="site-form-field">
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
              
              <div className="site-form-field">
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

              <div className="site-form-field">
                <Label htmlFor="billingPortfolio">Billing Portfolio</Label>
                <Select
                  id="billingPortfolio"
                  name="billingPortfolio"
                  value={formData.billingPortfolio || 'CORE'}
                  onChange={handleChange}
                >
                  <option value="CORE">Core</option>
                  <option value="EDEN">Eden</option>
                </Select>
              </div>
            </div>
        </FormSection>

        <FormSection
          title="Fixed Annual Costs"
          description="Annual operating costs that feed the fixed fee calculation."
          icon={<Wrench className="h-5 w-5" />}
          className="site-form-panel-wide"
        >
            <div className="site-form-fields three-col">
              <div className="site-form-field">
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

              <div className="site-form-field">
                <Label htmlFor="pmDaysOnSite">PM Days / Annum</Label>
                <Input
                  id="pmDaysOnSite"
                  name="pmDaysOnSite"
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.pmDaysOnSite}
                  onChange={handleChange}
                />
              </div>

              <div className="site-form-field">
                <Label htmlFor="pmVisitsPerAnnum">PM Visits per Annum</Label>
                <Input
                  id="pmVisitsPerAnnum"
                  name="pmVisitsPerAnnum"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.pmVisitsPerAnnum}
                  onChange={handleChange}
                />
              </div>
              
              <div className="site-form-field">
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
              
              <div className="site-form-field">
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

              <div className="site-form-field">
                <Label htmlFor="additionalCostAnnual">Additional Base Cost</Label>
                <Input
                  id="additionalCostAnnual"
                  name="additionalCostAnnual"
                  type="number"
                  step="0.01"
                  value={formData.additionalCostAnnual}
                  onChange={handleChange}
                />
              </div>

              <div className="site-form-field span-2">
                <Label htmlFor="additionalCostAnnualComment">Additional Base Cost Comment</Label>
                <Input
                  id="additionalCostAnnualComment"
                  name="additionalCostAnnualComment"
                  value={formData.additionalCostAnnualComment || ''}
                  onChange={handleChange}
                />
              </div>
            </div>
        </FormSection>

        <FormSection
          title="Monthly Adjustments"
          description="Temporary monthly cost overrides with optional effective dates."
          icon={<Calendar className="h-5 w-5" />}
          className="site-form-panel-wide"
        >
            <div className="site-form-fields three-col">
              <div className="site-form-field">
                <Label htmlFor="additionalCostMonthly">Additional Monthly Cost</Label>
                <Input
                  id="additionalCostMonthly"
                  name="additionalCostMonthly"
                  type="number"
                  step="0.01"
                  value={formData.additionalCostMonthly}
                  onChange={handleChange}
                />
              </div>
              
              <div className="site-form-field">
                <Label htmlFor="additionalCostMonthlyStartMonth">Monthly Cost From</Label>
                <Input
                  id="additionalCostMonthlyStartMonth"
                  name="additionalCostMonthlyStartMonth"
                  type="month"
                  value={formData.additionalCostMonthlyStartMonth || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="site-form-field">
                <Label htmlFor="additionalCostMonthlyEndMonth">Monthly Cost To</Label>
                <Input
                  id="additionalCostMonthlyEndMonth"
                  name="additionalCostMonthlyEndMonth"
                  type="month"
                  value={formData.additionalCostMonthlyEndMonth || ''}
                  onChange={handleChange}
                  className={errors.additionalCostMonthlyEndMonth ? 'border-red-500' : ''}
                />
                {errors.additionalCostMonthlyEndMonth && (
                  <p className="mt-1 text-sm text-red-500">{errors.additionalCostMonthlyEndMonth}</p>
                )}
              </div>

              <div className="site-form-field span-3">
                <Label htmlFor="additionalCostMonthlyComment">Additional Monthly Cost Comment</Label>
                <Input
                  id="additionalCostMonthlyComment"
                  name="additionalCostMonthlyComment"
                  value={formData.additionalCostMonthlyComment || ''}
                  onChange={handleChange}
                />
              </div>
            </div>
        </FormSection>
      </div>

      <div className="site-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-action" disabled={isLoading}>
          <Save className="h-4 w-4" />
          {isLoading ? 'Saving...' : site ? 'Save Site' : 'Create Site'}
        </button>
      </div>
    </form>
  );
}
