import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { Card, CardBody, Badge, Btn, Input, Select, Spinner, Alert, categoryColor, statusColor } from '../components/UI';

const BASE = process.env.REACT_APP_API_URL || '';

// Lazy Drive enrichment — fetches the full Drive CSV once, then matches locally
let driveCache = null;
let driveCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getDriveMap() {
  if (driveCache && Date.now() - driveCacheTime < CACHE_TTL) return driveCache;
  try {
    const [currRes, cancRes] = await Promise.all([
      fetch(`${BASE}/api/drive-customers`).then(r => r.json()),
      fetch(`${BASE}/api/drive-cancelled`).then(r => r.json()),
    ]);
    const curr = currRes.rows || (Array.isArray(currRes) ? currRes : []);
    const canc = cancRes.rows || (Array.isArray(cancRes) ? cancRes : []);
    const map = {};
    for (const c of curr) {
      const key = `${c.First || c.first || ''} ${c.Last || c.last || ''}`.trim().toLowerCase();
      if (key) map[key] = { ...c, _type: 'current' };
    }
    for (const c of canc) {
      const key = (c.Customer || c.customer || '').trim().toLowerCase();
      if (key) {
        map[key] = { ...(map[key] || {}), ...c, _type: map[key] ? 'both' : 'cancelled' };
      }
    }
    driveCache = map;
    driveCacheTime = Date.now();
    return map;
  } catch {
    return {};
  }
}

function matchDrive(map, name) {
  if (!name || !map) return null;
  const lower = name.trim().toLowerCase();
  if (map[lower]) return map[lower];
  for (const [k, v] of Object.entries(map)) {
    if (k.includes(lower) || lower.includes(k)) return v;
  }
  return null;
}

function DrivePills({ info }) {
  if (!info) return null;
  const phone = info['Cell Phone'] || info.phone;
  const frequency = info.Frequency || info.frequency;
  const baseFee = info['Base Fee'] || info.base_fee;
  const scope = info['Scope of Work'] || info.scope;
  const jobs = info['Completed Jobs'] || info.completed_jobs;

  const pills = [
    phone && { label: phone, color: 'text-gray-600' },
    frequency && { label: frequency, color: 'text-blue-600' },
    baseFee && { label: `$${baseFee}/visit`, color: 'text-green-700' },
    scope && { label: scope.length > 20 ? scope.slice(0, 20) + '…' : scope, color: 'text-gray-500' },
    jobs && { label: `${jobs} jobs`, color: 'text-gray-500' },
  ].filter(Boolean);

  const wasCancelled = info._type === 'cancelled' || info._type === 'both' || info['Date of Cancellation'] || info['date of cancellation'];

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
      {wasCancelled && (
        <span className="text-xs font-semibold text-red-500">⚠ MC Cancelled</span>
      )}
      {pills.map((p, i) => (
        <span key={i} className={`text-xs ${p.color}`}>{p.label}</span>
      ))}
    </div>
  );
}

// ── Client autocomplete (same as NewEvaluation) ──────────────────────────────
async function searchClients(q) {
  if (!q || q.length < 2) return [];
  try {
    const res = await fetch(`${BASE}/api/client-lookup?q=${encodeURIComponent(q)}`);
    return await res.json();
  } catch {
    return [];
  }
}

function ClientAutocomplete({ value, onChange }) {
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
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Input
          label="Client Name"
          value={value}
          onChange={handleChange}
          placeholder="Start typing client name…"
          autoComplete="off"
        />
        {loading && (
          <span style={{ position: 'absolute', right: 10, top: '65%', transform: 'translateY(-50%)' }}>
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
            <li key={i}
              onMouseDown={() => handlePick(c)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{c.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {[c.frequency, c.address].filter(Boolean).join(' · ')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SearchEvaluations({ setPage, setActiveAnalysis, setActiveEvalId, currentUser }) {
  const [filters, setFilters] = useState({
    client_name: '', evaluation_id: '', staff_name: currentUser?.username || '',
    status: '', outcome_filter: '', program: '',
    date_from: '', date_to: '',
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [driveMap, setDriveMap] = useState(null);
  const driveLoaded = useRef(false);

  // Keep staff_name in sync if currentUser loads after mount
  useEffect(() => {
    if (currentUser?.username && !filters.staff_name) {
      setFilters(f => ({ ...f, staff_name: currentUser.username }));
    }
  }, [currentUser]);

  const set = k => v => setFilters(f => ({ ...f, [k]: v }));

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const data = await api.getEvaluations(clean);
      setResults(data);
      setSearched(true);
      if (!driveLoaded.current) {
        driveLoaded.current = true;
        getDriveMap().then(setDriveMap);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { handleSearch(); }, []);

  const handleView = async (row) => {
    try {
      const data = await api.getEvaluation(row.Evaluation_ID);
      if (data.analysis) {
        setActiveAnalysis({ intake: data.intake, analysis: data.analysis });
        setActiveEvalId(row.Evaluation_ID);
        setPage('report');
      } else {
        setActiveEvalId(row.Evaluation_ID);
        alert('This cancellation has not been analyzed yet. Open in New Cancellation Request to run analysis.');
      }
    } catch (e) {
      alert('Error loading evaluation: ' + e.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Search Cancellation Requests</h1>
        <p className="text-gray-500 mt-1">Find cancellation requests by client, staff, status, or date range.</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Client Name with autocomplete dropdown */}
            <ClientAutocomplete
              value={filters.client_name}
              onChange={set('client_name')}
            />
            <Input label="Cancellation ID" value={filters.evaluation_id} onChange={set('evaluation_id')} placeholder="CRIS-..." />
            {/* Staff Member — pre-filled from logged-in user, still editable */}
            <div>
              <Input
                label="Staff Member"
                value={filters.staff_name}
                onChange={set('staff_name')}
                placeholder="Staff name..."
              />
              {currentUser?.username && filters.staff_name === currentUser.username && (
                <p className="text-xs text-blue-500 mt-1">Showing your cancellations · <button className="underline" onClick={() => set('staff_name')('')}>Clear to see all</button></p>
              )}
            </div>
            <Select label="Status" value={filters.status} onChange={set('status')} options={[
              { value: '', label: 'All Statuses' },
              { value: 'New', label: 'New' },
              { value: 'Pending AI', label: 'Pending AI' },
              { value: 'Pending Follow-Up', label: 'Pending Follow-Up' },
              { value: 'Saved', label: 'Saved' },
              { value: 'Cancelled', label: 'Cancelled' },
              { value: 'Closed', label: 'Closed' },
            ]} />
            <Select label="Outcome" value={filters.outcome_filter} onChange={set('outcome_filter')} options={[
              { value: '', label: 'All Outcomes' },
              { value: 'Saved', label: 'Saved' },
              { value: 'Cancelled', label: 'Cancelled' },
              { value: 'Pending', label: 'Pending' },
              { value: 'Follow-Up Needed', label: 'Follow-Up Needed' },
              { value: 'Escalated', label: 'Escalated' },
            ]} />
            <Input label="Program Offered" value={filters.program} onChange={set('program')} placeholder="Program name..." />
            <Input label="Date From" value={filters.date_from} onChange={set('date_from')} type="date" />
            <Input label="Date To" value={filters.date_to} onChange={set('date_to')} type="date" />
          </div>
          <Btn onClick={handleSearch} disabled={loading} variant="primary">
            {loading ? <><Spinner size="sm" /> Searching...</> : '⌕ Search'}
          </Btn>
        </CardBody>
      </Card>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : searched && results.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No cancellations found matching your criteria.</div>
      ) : (
        <div className="space-y-3">
          {results.map(row => {
            const drive = driveMap ? matchDrive(driveMap, row.Client_Name) : null;
            return (
              <Card key={row.Evaluation_ID} className="hover:shadow-md transition-shadow">
                <CardBody className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="font-bold text-gray-900">{row.Client_Name || '(No name)'}</span>
                      <Badge color={statusColor(row.Current_Status)}>{row.Current_Status}</Badge>
                      {row.analysis?.Client_Category && (
                        <Badge color={categoryColor(row.analysis.Client_Category)}>{row.analysis.Client_Category}</Badge>
                      )}
                      {row.outcome?.Outcome && (
                        <Badge color={row.outcome.Outcome === 'Saved' ? 'green' : row.outcome.Outcome === 'Cancelled' ? 'red' : 'gray'}>
                          {row.outcome.Outcome}
                        </Badge>
                      )}
                    </div>
                    <DrivePills info={drive} />
                    <div className="text-xs text-gray-500 space-y-0.5 mt-1.5">
                      <div><span className="font-mono">{row.Evaluation_ID}</span> · {row.Staff_Name} · {row.Created_Date ? new Date(row.Created_Date).toLocaleDateString() : ''}</div>
                      {row.Cancellation_Reason && (
                        <div className="text-gray-600 truncate max-w-md">"{row.Cancellation_Reason}"</div>
                      )}
                      {row.analysis?.Save_Worthiness_Score && (
                        <div>Score: <strong>{row.analysis.Save_Worthiness_Score}</strong> · {row.analysis.Recommended_Program || 'No program'}</div>
                      )}
                    </div>
                  </div>
                  <Btn variant="secondary" size="sm" onClick={() => handleView(row)}>View →</Btn>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
