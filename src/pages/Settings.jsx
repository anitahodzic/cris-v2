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

export default function Settings({ currentUser, isAdmin }) {
  const [tab, setTab] = useState('settings');
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
     
