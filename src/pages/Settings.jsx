import React, { useState, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

async function apiGet(path) {
  const res = await fetch(`${BASE}/api${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function Section({ title, description, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function Settings({ currentUser, isAdmin, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'settings');
  const [settings, setSettings] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      apiGet('/settings'),
      apiGet('/programs'),
      apiGet('/policies'),
    ]).then(([s, p, pol]) => {
      setSettings(s);
      setPrograms(p);
      setPolicies(pol);
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Access Restricted</h2>
          <p className="text-gray-500 text-sm">Settings are only available to Administrators.</p>
        </div>
      </div>
    );
  }

  const handleSettingChange = (idx, field, value) => {
    setSettings(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleProgramChange = (idx, field, value) => {
    setPrograms(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const handlePolicyChange = (idx, field, value) => {
    setPolicies(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const saveAll = async () => {
    setSaving(true);
    setError('');
    try {
      if (tab === 'settings') await apiPost('/settings/save', { rows: settings });
      if (tab === 'programs') await apiPost('/programs/save', { rows: programs });
      if (tab === 'policies') await apiPost('/policies/save', { rows: policies });
      setSaved('Saved!');
      setTimeout(() => setSaved(''), 3000);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const tabs = [
    { id: 'settings', label: 'Settings' },
    { id: 'programs', label: 'Programs' },
    { id: 'policies', label: 'Policies' },
  ];

  if (loading) return (
    <div className="p-8 text-center text-gray-400">Loading settings…</div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Edit CRIS configuration. Changes save directly to Google Sheets.</p>
        </div>
        <button
          onClick={saveAll}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : saved || 'Save Changes'}
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' && (
        <Section title="System Settings" description="Core values used by the AI to score and recommend programs.">
          <div className="space-y-3">
            {settings.map((row, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-3 items-start">
                <div className="col-span-1">
                  <div className="text-sm font-medium text-gray-700">{row.Setting_Key}</div>
                  {row.Description && <div className="text-xs text-gray-400 mt-0.5">{row.Description}</div>}
                </div>
                <input
                  className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={row.Value || ''}
                  onChange={e => handleSettingChange(idx, 'Value', e.target.value)}
                />
              </div>
            ))}
          </div>
        </Section>
      )}

      {tab === 'programs' && (
        <Section title="Retention Programs" description="Programs the AI can recommend. Toggle Active to enable/disable.">
          <div className="space-y-4">
            {programs.map((p, idx) => (
              <div key={idx} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-gray-800">{p.Program_Name || p.Name || `Program ${idx + 1}`}</div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-sm text-gray-500">Active</span>
                    <input
                      type="checkbox"
                      checked={p.Active === 'Yes' || p.Active === 'TRUE' || p.Active === '1' || p.Active === true}
                      onChange={e => handleProgramChange(idx, 'Active', e.target.checked ? 'Yes' : 'No')}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(p).filter(([k]) => k !== 'Active').map(([key, val]) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{key.replace(/_/g, ' ')}</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={val || ''}
                        onChange={e => handleProgramChange(idx, key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {tab === 'policies' && (
        <Section title="Policies" description="Business policies the AI references when making recommendations.">
          <div className="space-y-4">
            {policies.map((p, idx) => (
              <div key={idx} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-gray-800">{p.Policy_Name || p.Name || `Policy ${idx + 1}`}</div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-sm text-gray-500">Active</span>
                    <input
                      type="checkbox"
                      checked={p.Active === 'Yes' || p.Active === 'TRUE' || p.Active === '1' || p.Active === true}
                      onChange={e => handlePolicyChange(idx, 'Active', e.target.checked ? 'Yes' : 'No')}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(p).filter(([k]) => k !== 'Active').map(([key, val]) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{key.replace(/_/g, ' ')}</label>
                      <textarea
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        rows={val && val.length > 80 ? 3 : 1}
                        value={val || ''}
                        onChange={e => handlePolicyChange(idx, key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
