import React, { useState, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

function Badge({ label, color }) {
  const colors = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.gray}`}>
      {label}
    </span>
  );
}

function ClientDetail({ drive }) {
  if (!drive) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
      {drive.phone && <span>📞 {drive.phone}</span>}
      {drive.email && <span>✉ {drive.email}</span>}
      {drive.address && <span>📍 {drive.address}</span>}
      {drive.frequency && <span>🔄 {drive.frequency}</span>}
      {drive.base_fee && <span>💰 {drive.base_fee}/visit</span>}
      {drive.completed_jobs && <span>✅ {drive.completed_jobs} jobs</span>}
      {drive.customer_start && <span>📅 Since {drive.customer_start}</span>}
    </div>
  );
}

export default function AccountAudit({ currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [view, setView] = useState('table'); // 'table' | 'cards'

  useEffect(() => {
    fetch(`${BASE}/api/account-audit-enriched`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading audit data…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  const { evaluations = [], summary = {}, drive_date } = data || {};

  const filtered = evaluations.filter(e => {
    if (search && !(e.Client_Name || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'no-outcome') return !e.outcome;
    if (filter === 'saved') return e.outcome?.Outcome === 'Saved';
    if (filter === 'cancelled') return e.outcome?.Outcome === 'Cancelled';
    if (filter === 'pending') return !e.outcome && e.analysis;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Audit</h1>
          <p className="text-sm text-gray-500 mt-1">
            Full history of all evaluations and outcomes
            {drive_date && <span className="ml-2 text-xs text-gray-400">· MC data as of {new Date(drive_date).toLocaleDateString()}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view==='table' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Table</button>
          <button onClick={() => setView('cards')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view==='cards' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Cards</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Evaluations', value: summary.total || 0 },
          { label: 'Saved', value: summary.saved || 0 },
          { label: 'Cancelled', value: summary.cancelled || 0 },
          { label: 'No Outcome', value: summary.no_outcome || 0 },
        ].map(card => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-gray-900">{card.value}</div>
            <div className="text-sm text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filter + Search */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          placeholder="Search client name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'all', label: 'All' },
            { id: 'saved', label: 'Saved' },
            { id: 'cancelled', label: 'Cancelled' },
            { id: 'pending', label: 'Pending Decision' },
            { id: 'no-outcome', label: 'No Outcome' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>

      {view === 'table' ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Staff</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Reason</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Score</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Rate</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Program</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Outcome</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Revenue Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No records found</td></tr>
                )}
                {filtered.map((e, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {e.Created_Date ? new Date(e.Created_Date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{e.Client_Name || '—'}</div>
                      {e.drive?.frequency && <div className="text-xs text-gray-400">{e.drive.frequency}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {e.drive?.phone && <div>{e.drive.phone}</div>}
                      {e.drive?.email && <div className="truncate max-w-[120px]">{e.drive.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{e.Staff_Name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate text-xs">{e.Cancellation_Reason || '—'}</td>
                    <td className="px-4 py-3">
                      {e.analysis?.Save_Worthiness_Score != null ? (
                        <span className={`font-semibold ${
                          Number(e.analysis.Save_Worthiness_Score) >= 70 ? 'text-green-600' :
                          Number(e.analysis.Save_Worthiness_Score) >= 40 ? 'text-yellow-600' : 'text-red-500'
                        }`}>
                          {e.analysis.Save_Worthiness_Score}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {e.drive?.base_fee || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">{e.outcome?.Program_Offered || e.analysis?.Recommended_Program || '—'}</td>
                    <td className="px-4 py-3">
                      {e.outcome?.Outcome ? (
                        <Badge label={e.outcome.Outcome} color={e.outcome.Outcome === 'Saved' ? 'green' : e.outcome.Outcome === 'Cancelled' ? 'red' : 'gray'} />
                      ) : e.analysis ? (
                        <Badge label="Pending" color="yellow" />
                      ) : (
                        <Badge label="No Analysis" color="gray" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {e.outcome?.Revenue_Saved ? `$${parseFloat(e.outcome.Revenue_Saved.replace(/[^0-9.]/g,'')||0).toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">No records found</div>
          )}
          {filtered.map((e, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="font-semibold text-gray-900">{e.Client_Name || '—'}</span>
                    {e.outcome?.Outcome ? (
                      <Badge label={e.outcome.Outcome} color={e.outcome.Outcome === 'Saved' ? 'green' : e.outcome.Outcome === 'Cancelled' ? 'red' : 'gray'} />
                    ) : e.analysis ? (
                      <Badge label="Pending" color="yellow" />
                    ) : (
                      <Badge label="No Analysis" color="gray" />
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">
                    {e.Created_Date ? new Date(e.Created_Date).toLocaleDateString() : ''} · {e.Staff_Name} · <span className="font-mono">{e.Evaluation_ID}</span>
                  </div>
                  <ClientDetail drive={e.drive} />
                  {e.Cancellation_Reason && (
                    <p className="text-sm text-gray-600 mt-2">{e.Cancellation_Reason}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {e.analysis?.Save_Worthiness_Score != null && (
                    <div className={`text-2xl font-bold ${Number(e.analysis.Save_Worthiness_Score) >= 70 ? 'text-green-600' : Number(e.analysis.Save_Worthiness_Score) >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {e.analysis.Save_Worthiness_Score}
                    </div>
                  )}
                  {e.outcome?.Revenue_Saved && (
                    <div className="text-sm font-semibold text-green-600 mt-1">
                      ${parseFloat(e.outcome.Revenue_Saved.replace(/[^0-9.]/g,'')||0).toLocaleString()} saved
                    </div>
                  )}
                </div>
              </div>
              {(e.analysis?.Recommended_Program || e.outcome?.Program_Offered) && (
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                  Program: <strong className="text-gray-700">{e.outcome?.Program_Offered || e.analysis?.Recommended_Program}</strong>
                  {e.analysis?.Recommended_Strategy && <span className="ml-3">Strategy: <strong className="text-gray-700">{e.analysis.Recommended_Strategy}</strong></span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
