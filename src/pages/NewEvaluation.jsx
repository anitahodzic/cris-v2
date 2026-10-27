import React, { useState, useRef, useEffect } from 'react';
import { api } from '../utils/api';
import { Card, CardHeader, CardBody, Btn, TextArea, Input, Select, Alert, Spinner } from '../components/UI';

const BASE = process.env.REACT_APP_API_URL || '';

// Page is now called "Cancellation Request" in the nav

const EMPTY = {
  evaluation_id: '',
  staff_name: '',
  client_name: '',
  customer_id: '',
  contact_method: 'Phone',
  current_status: 'New',
  cancellation_reason: '',
};

async function searchClients(q) {
  if (!q || q.length < 2) return [];
  try {
    const res = await fetch(`${BASE}/api/client-lookup?q=${encodeURIComponent(q)}`);
    return await res.json();
  } catch {
    return [];
  }
}

function ClientAutocomplete({ value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (val) => {
    onChange(val);
    clearTimeout(timer.current);
    if (val.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const results = await searchClients(val.trim());
      setSuggestions(results);
      setOpen(results.length > 0);
      setLoading(false);
    }, 300);
  };

  const handlePick = (client) => {
    onChange(client.name);
    setSuggestions([]);
    setOpen(false);
    onSelect(client);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Input
          value={value}
          onChange={handleChange}
          placeholder="Start typing client name…"
          autoComplete="off"
        />
        {loading && (
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <Spinner size="sm" />
          </span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 1000, left: 0, right: 0, top: '100%',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', margin: 0, padding: 0,
          listStyle: 'none', maxHeight: 280, overflowY: 'auto',
        }}>
          {suggestions.map((c, i) => (
            <li
              key={i}
              onMouseDown={() => handlePick(c)}
              style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{c.name}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {c.frequency && `${c.frequency} · `}{c.address}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DriveProfileCard({ info, loading }) {
  if (loading) return (
    <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-center gap-2 text-sm text-blue-400">
      <Spinner size="sm" /> Looking up MaidCentral profile…
    </div>
  );
  if (!info) return null;

  const fields = [
    ['Phone', info.phone],
    ['Email', info.email],
    ['Address', info.address],
    ['Frequency', info.frequency],
    ['Base Fee', info.base_fee ? `$${info.base_fee}/visit` : null],
    ['Scope', info.scope],
    ['Customer Since', info.customer_start],
    ['Completed Jobs', info.completed_jobs],
    ['Total Revenue', info.total_revenue ? `$${info.total_revenue}` : null],
    ['Last Job', info.last_job],
    ['Last Contact', info.last_contact],
    ['Avg Scorecard', info.avg_scorecard],
  ].filter(([, v]) => v);

  if (!fields.length) return null;

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
      <div className="px-4 py-2.5 bg-blue-600 flex items-center gap-2">
        <span className="text-white text-sm font-semibold">⊙ MaidCentral Profile — {info.name}</span>
        {(info.cancelled_date || info.cancellation_reason) && (
          <span className="ml-auto text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-medium">⚠ Previously Cancelled</span>
        )}
      </div>
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
        {fields.map(([label, val]) => (
          <div key={label} className="text-sm">
            <span className="text-blue-500 text-xs">{label}: </span>
            <span className="text-blue-900 font-medium">{val}</span>
          </div>
        ))}
      </div>
      {info.cancellation_reason && (
        <div className="px-4 pb-3 text-xs text-red-600">
          Prior cancellation reason: {info.cancellation_reason}
          {info.cancellation_notes ? ` — ${info.cancellation_notes}` : ''}
        </div>
      )}
      <div className="px-4 py-2 bg-blue-100 text-xs text-blue-600 border-t border-blue-200">
        ✓ This data will be sent to AI automatically — no copy-paste needed
      </div>
    </div>
  );
}

export default function NewEvaluation({ setPage, setActiveEvalId, setActiveAnalysis, user }) {
  const staffName = user?.username || user?.name || '';
  const [form, setForm] = useState({ ...EMPTY, created_date: new Date().toISOString(), staff_name: staffName });
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [evalId, setEvalId] = useState('');
  const [driveInfo, setDriveInfo] = useState(null);
  const [driveLoading, setDriveLoading] = useState(false);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const handleClientNameChange = (val) => {
    setForm(f => ({ ...f, client_name: val }));
    setDriveInfo(null);
  };

  const handleClientSelect = (client) => {
    setDriveInfo(client);
    setForm(f => ({ ...f, client_name: client.name }));
  };

  const handleSave = async () => {
    if (!form.client_name?.trim()) { setError('Client name is required.'); return; }
    if (!form.cancellation_reason?.trim()) { setError('Cancellation reason is required.'); return; }
    setError(null);
    setSaving(true);
    try {
      const payload = { ...form, drive_data: driveInfo || null };
      const res = await api.saveIntake(payload);
      const id = res.evaluation_id;
      setEvalId(id);
      setForm(f => ({ ...f, evaluation_id: id }));
      setSaved(true);
      setActiveEvalId(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = async () => {
    if (!form.client_name?.trim()) { setError('Client name is required before analyzing.'); return; }
    if (!form.cancellation_reason?.trim()) { setError('Cancellation reason is required before analyzing.'); return; }
    setError(null);
    setAnalyzing(true);
    try {
      let id = evalId || form.evaluation_id;
      if (!id) {
        const res = await api.saveIntake({ ...form, drive_data: driveInfo || null });
        id = res.evaluation_id;
        setEvalId(id);
        setForm(f => ({ ...f, evaluation_id: id }));
        setActiveEvalId(id);
      }
      const intakeData = { ...form, evaluation_id: id, drive_data: driveInfo || null };
      const res = await api.analyze(intakeData);
      setActiveAnalysis({ intake: intakeData, analysis: res.analysis });
      setActiveEvalId(id);
      setPage('report');
    } catch (e) {
      setError(`Analysis failed: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClear = () => {
    if (!window.confirm('Clear the form? Unsaved data will be lost.')) return;
    setForm({ ...EMPTY, created_date: new Date().toISOString() });
    setSaved(false);
    setEvalId('');
    setError(null);
    setDriveInfo(null);
    setDriveLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-32">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Cancellation Request</h1>
        <p className="text-gray-500 mt-1">Enter the client name and cancellation reason — CRIS pulls the rest from MaidCentral automatically.</p>
        {evalId && <p className="text-xs text-blue-600 mt-2 font-mono">Cancellation ID: {evalId}</p>}
      </div>

      {error && <Alert type="error" onClose={() => setError(null)} className="mb-4">{error}</Alert>}
      {saved && !analyzing && <Alert type="success" className="mb-4">Saved — ID: <strong>{evalId}</strong></Alert>}

      {/* Case Info */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="font-bold text-gray-800">Case Information</h2>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Cancellation Date" value={form.created_date?.split('T')[0]} onChange={(v) => setForm(f => ({ ...f, created_date: v }))} type="date" />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Staff Member Name <span className="text-red-500">*</span></label>
              <Input value={form.staff_name} onChange={set('staff_name')} placeholder="Your name" required />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Client Name <span className="text-red-500">*</span></label>
              <ClientAutocomplete
                value={form.client_name}
                onChange={handleClientNameChange}
                onSelect={handleClientSelect}
              />
            </div>
            <Input label="Customer ID (optional)" value={form.customer_id} onChange={set('customer_id')} placeholder="MaidCentral Customer ID" />
            <Select label="Contact Method" value={form.contact_method} onChange={set('contact_method')} options={[
              { value: 'Phone', label: 'Phone' },
              { value: 'SMS', label: 'SMS' },
              { value: 'Email', label: 'Email' },
              { value: 'Other', label: 'Other' },
            ]} />
            <Select label="Current Status" value={form.current_status} onChange={set('current_status')} options={[
              { value: 'New', label: 'New' },
              { value: 'Pending AI', label: 'Pending AI' },
              { value: 'Pending Follow-Up', label: 'Pending Follow-Up' },
              { value: 'Saved', label: 'Saved' },
              { value: 'Cancelled', label: 'Cancelled' },
              { value: 'Closed', label: 'Closed' },
            ]} />
          </div>
        </CardBody>
      </Card>

      {/* MaidCentral profile — auto-loaded */}
      <DriveProfileCard info={driveInfo} loading={driveLoading} />

      {/* Cancellation reason — only manual input needed */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="font-bold text-gray-800">Cancellation Details</h2>
        </CardHeader>
        <CardBody>
          <TextArea
            label="Cancellation Reason"
            instruction="Type exactly what the customer said, even if incomplete."
            value={form.cancellation_reason}
            onChange={set('cancellation_reason')}
            placeholder="e.g. 'We're moving next month' or 'Prices are too high for us right now'"
            rows={5}
            required
          />
        </CardBody>
      </Card>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 px-4 sm:px-6 py-4 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
          <Btn onClick={handleAnalyze} disabled={analyzing || saving} variant="primary" size="lg" className="flex-1 sm:flex-none">
            {analyzing ? <><Spinner size="sm" /> Analyzing with AI...</> : '⊙ Analyze Client'}
          </Btn>
          <Btn onClick={handleSave} disabled={saving || analyzing} variant="secondary" size="lg">
            {saving ? <><Spinner size="sm" /> Saving...</> : 'Save Cancellation'}
          </Btn>
          <Btn onClick={handleClear} variant="ghost" size="lg">Clear Form</Btn>
        </div>
      </div>
    </div>
  );
}
