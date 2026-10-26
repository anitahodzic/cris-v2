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
    const [curr, canc] = await Promise.all([
      fetch(`${BASE}/api/drive-customers`).then(r => r.json()),
      fetch(`${BASE}/api/drive-cancelled`).then(r => r.json()),
    ]);
    const map = {};
    for (const c of (curr || [])) {
      const key = `${c.first || ''} ${c.last || ''}`.trim().toLowerCase();
      if (key) map[key] = { ...c, _type: 'current' };
    }
    for (const c of (canc || [])) {
      const key = (c.customer || '').trim().toLowerCase();
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
  // Partial match — find first key that starts with or contains the name
  for (const [k, v] of Object.entries(map)) {
    if (k.includes(lower) || lower.includes(k)) return v;
  }
  return null;
}

function DrivePills({ info }) {
  if (!info) return null;
  const pills = [
    info.phone && { label: info.phone, color: 'text-gray-600' },
    info.frequency && { label: info.frequency, color: 'text-blue-600' },
    (info.base_fee || info['base fee']) && { label: `$${info.base_fee || info['base fee']}/visit`, color: 'text-green-700' },
    info.scope && { label: info.scope.length > 20 ? info.scope.slice(0, 20) + '…' : info.scope, color: 'text-gray-500' },
    info.completed_jobs && { label: `${info.completed_jobs} jobs`, color: 'text-gray-500' },
  ].filter(Boolean);

  const wasCancelled = info._type === 'cancelled' || info._type === 'both' || info['date of cancellation'];

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

export default function SearchEvaluations({ setPage, setActiveAnalysis, setActiveEvalId }) {
  const [filters, setFilters] = useState({
    client_name: '', evaluation_id: '', staff_name: '',
    status: '', outcome_filter: '', program: '',
    date_from: '', date_to: '',
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [driveMap, setDriveMap] = useState(null);
  const driveLoaded = useRef(false);

  const set = k => v => setFilters(f => ({ ...f, [k]: v }));

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const data = await api.getEvaluations(clean);
      setResults(data);
      setSearched(true);
      // Load Drive data in background after results render
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
        alert('This evaluation has not been analyzed yet. Open in New Evaluation to run analysis.');
      }
    } catch (e) {
      alert('Error loading evaluation: ' + e.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Search Evaluations</h1>
        <p className="text-gray-500 mt-1">Find evaluations by client, staff, status, or date range.</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <Input label="Client Name" value={filters.client_name} onChange={set('client_name')} placeholder="Search by name..." />
            <Input label="Evaluation ID" value={filters.evaluation_id} onChange={set('evaluation_id')} placeholder="CRIS-..." />
            <Input label="Staff Member" value={filters.staff_name} onChange={set('staff_name')} placeholder="Staff name..." />
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
        <div className="text-center py-12 text-gray-500">No evaluations found matching your criteria.</div>
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
                    {/* Drive pills — appear once Drive data loads */}
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
