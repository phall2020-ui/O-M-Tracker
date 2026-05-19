'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_RATE_TIERS, formatCurrency } from '@/lib/calculations';
import { Contract } from '@/types';

function emptyContractForm() {
  return {
    name: '',
    description: '',
    notionSummaryPageId: '',
    notionBillingDatabaseId: '',
  };
}

export default function SettingsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [createForm, setCreateForm] = useState(emptyContractForm());
  const [editForms, setEditForms] = useState<Record<string, ReturnType<typeof emptyContractForm>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  async function loadContracts() {
    const response = await fetch('/api/contracts');
    const body = await response.json();
    if (body.success) {
      setContracts(body.data);
      setEditForms(Object.fromEntries(body.data.map((contract: Contract) => [
        contract.id,
        {
          name: contract.name,
          description: contract.description || '',
          notionSummaryPageId: contract.notionSummaryPageId || '',
          notionBillingDatabaseId: contract.notionBillingDatabaseId || '',
        },
      ])));
    }
  }

  useEffect(() => {
    loadContracts().catch(() => setMessage('Unable to load contracts.'));
  }, []);

  async function createContract() {
    setIsWorking(true);
    setMessage(null);
    const response = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    });
    const body = await response.json();
    if (body.success) {
      setCreateForm(emptyContractForm());
      setMessage('Contract created.');
      await loadContracts();
    } else {
      setMessage(body.error || 'Failed to create contract.');
    }
    setIsWorking(false);
  }

  async function updateContract(contractId: string, isActive?: boolean) {
    setIsWorking(true);
    setMessage(null);
    const form = editForms[contractId];
    const response = await fetch(`/api/contracts/${contractId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...(isActive === undefined ? {} : { isActive }) }),
    });
    const body = await response.json();
    if (body.success) {
      setMessage(isActive === false ? 'Contract deactivated.' : 'Contract updated.');
      await loadContracts();
    } else {
      setMessage(body.error || 'Failed to update contract.');
    }
    setIsWorking(false);
  }

  return (
    <div className="main-content">
      <div className="page-header">
        <span className="eyebrow">System control</span>
        <h1>Settings</h1>
        <p>Configure portfolio settings</p>
      </div>

      <div className="content">
        {message && <div className="formula-box" style={{ marginBottom: '20px' }}>{message}</div>}

        <div className="bottom-grid">
          <div className="monthly-table-card">
            <div className="monthly-table-header">
              <div>
                <h2>Contracts</h2>
                <p>Create and maintain contract contexts for the portal. Deactivation preserves historical data.</p>
              </div>
            </div>

            <div className="form-grid admin-manual" style={{ marginBottom: '18px' }}>
              <input
                className="form-control"
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="New contract name"
              />
              <input
                className="form-control"
                value={createForm.description}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
              />
              <input
                className="form-control"
                value={createForm.notionSummaryPageId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, notionSummaryPageId: event.target.value }))}
                placeholder="Notion summary page ID"
              />
              <input
                className="form-control"
                value={createForm.notionBillingDatabaseId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, notionBillingDatabaseId: event.target.value }))}
                placeholder="Notion billing database ID"
              />
            </div>
            <button className="primary-action" type="button" onClick={createContract} disabled={isWorking || !createForm.name.trim()}>
              Create Contract
            </button>

            <div className="table-container compact-mobile-table" style={{ marginTop: '20px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Notion Summary</th>
                    <th>Notion Billing</th>
                    <th>Status</th>
                    <th className="numeric">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((contract) => {
                    const form = editForms[contract.id] || emptyContractForm();
                    return (
                      <tr key={contract.id}>
                        <td data-label="Contract">
                          <input
                            className="form-control"
                            value={form.name}
                            onChange={(event) => setEditForms((prev) => ({
                              ...prev,
                              [contract.id]: { ...form, name: event.target.value },
                            }))}
                          />
                          <input
                            className="form-control"
                            style={{ marginTop: '8px' }}
                            value={form.description}
                            onChange={(event) => setEditForms((prev) => ({
                              ...prev,
                              [contract.id]: { ...form, description: event.target.value },
                            }))}
                            placeholder="Description"
                          />
                        </td>
                        <td data-label="Notion Summary">
                          <input
                            className="form-control"
                            value={form.notionSummaryPageId}
                            onChange={(event) => setEditForms((prev) => ({
                              ...prev,
                              [contract.id]: { ...form, notionSummaryPageId: event.target.value },
                            }))}
                          />
                        </td>
                        <td data-label="Notion Billing">
                          <input
                            className="form-control"
                            value={form.notionBillingDatabaseId}
                            onChange={(event) => setEditForms((prev) => ({
                              ...prev,
                              [contract.id]: { ...form, notionBillingDatabaseId: event.target.value },
                            }))}
                          />
                        </td>
                        <td data-label="Status">
                          <span className={`status-badge ${contract.isActive ? 'status-yes' : 'status-no'}`}>
                            {contract.isDefault ? 'Default' : contract.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td data-label="Actions" className="numeric">
                          <div className="button-row" style={{ justifyContent: 'flex-end' }}>
                            <button className="secondary-action" type="button" onClick={() => updateContract(contract.id)} disabled={isWorking}>
                              Save
                            </button>
                            {!contract.isDefault && contract.isActive && (
                              <button className="danger-action" type="button" onClick={() => updateContract(contract.id, false)} disabled={isWorking}>
                                Deactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="monthly-table-card">
            <div className="monthly-table-header">
              <div>
                <h2>Rate Tiers</h2>
                <p>Current fallback portfolio cost rates by capacity tier.</p>
              </div>
            </div>
            <div className="table-container compact-mobile-table">
              <table>
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Capacity Range</th>
                    <th className="numeric">Rate (£/kWp)</th>
                  </tr>
                </thead>
                <tbody>
                  {DEFAULT_RATE_TIERS.map((tier) => (
                    <tr key={tier.id}>
                      <td data-label="Tier" className="strong">{tier.tierName}</td>
                      <td data-label="Capacity Range">{tier.minCapacityMW} - {tier.maxCapacityMW || 'open'} MW</td>
                      <td data-label="Rate" className="numeric">{formatCurrency(tier.ratePerKwp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
