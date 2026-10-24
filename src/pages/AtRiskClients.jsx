import React, { useState, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

function RiskBadge({ score }) {
  const n = Number(score);
  if (isNaN(n)) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Not Scored</span>;
  if (n >= 70) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">High Save-ability</span>;
  if (n >= 40) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Medium Risk</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">High Risk</span>;
}

function InfoPill({ label, value }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5 text-xs text-gray-600">
      <span className="text-gray-400">{label}</span> <strong>{value}</strong>
    </span>
  );
}

export default function AtRiskClients({ currentUser }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('score_asc');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${BASE}/api/at-risk-enriched`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Analyzing client risk…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  const filtered = data.filter(d =>
    !search || (d.client_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'score_asc') return Number(a.score ?? 50) - Number(b.score ?? 50);
    if (sort === 'score_desc') return Number(b.score ?? 50) - Number(a.score ?? 50);
    if (sort === 'date') return new Date(b.date) - new Date(a.date);
    if (sort === 'revenue') return Number((b.bill_rate||'0').replace(/[^0-9.]/g,'')) - Number((a.bill_rate||'0').replace(/[^0-9.]/g,''));
    return 0;
  });

  const highRisk = data.filter(d => Number(d.score) < 40 && d.score != null).length;
  const mediumRisk = data.filter(d => Number(d.score) >= 40 && Number(d.score) < 70).length;
  const notScored = data.filter(d => d.score == null).length;
  const totalRevAtRisk = data.reduce((s, d) => s + parseFloat((d.bill_rate || '0').replace(/[^0-9.]/g, '') || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">At-Risk Clients</h1>
        <p className="text-sm text-gray-500 mt-1">Evaluations with no outcome recorded — clients that still need follow-up</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-red-600">{highRisk}</div>
          <div className="text-sm text-red-500 mt-0.5">High Risk (&lt;40)</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-yellow-600">{mediumRisk}</div>
          <div className="text-sm text-yellow-500 mt-0.5">Medium Risk (40–69)</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-500">{notScored}</div>
          <div className="text-sm text-gray-400 mt-0.5">Not Yet Scored</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-blue-600">${totalRevAtRisk.toFixed(0)}</div>
          <div className="text-sm text-blue-500 mt-0.5">Revenue at Risk / visit</div>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          placeholder="Search client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-2 items-center">
          <span className="text-sm text-gray-400">Sort:</span>
          {[
            { id: 'score_asc', label: 'Lowest Score' },
            { id: 'score_desc', label: 'Highest Score' },
            { id: 'revenue', label: 'Revenue' },
            { id: 'date', label: 'Most Recent' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                sort === s.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {sorted.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">✓</div>
          <p className="font-medium text-gray-600">{search ? 'No matching clients' : 'No pending clients'}</p>
          <p className="text-sm mt-1">All evaluations have recorded outcomes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((client, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{client.client_name}</h3>
                    <RiskBadge score={client.score} />
                  </div>
                  <div className="text-xs text-gray-400 mb-2">
                    {client.date ? new Date(client.date).toLocaleDateString() : ''} · {client.staff_name || 'Unknown staff'} · <span className="font-mono">{client.evaluation_id}</span>
                  </div>
                  {client.cancellation_reason && (
                    <p className="text-sm text-gray-600 mb-3">{client.cancellation_reason}</p>
                  )}
                  {/* Drive enrichment pills */}
                  <div className="flex flex-wrap gap-1.5">
                    <InfoPill label="Freq" value={client.frequency} />
                    <InfoPill label="Rate" value={client.bill_rate ? `$${client.bill_rate}` : null} />
                    <InfoPill label="Scope" value={client.scope_group} />
                    <InfoPill label="Since" value={client.client_since} />
                    <InfoPill label="Scorecard" value={client.avg_scorecard && client.avg_scorecard !== '-1' ? `${client.avg_scorecard}/4` : null} />
                    <InfoPill label="Lead" value={client.lead_source} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {client.score != null ? (
                    <>
                      <div className={`text-3xl font-bold ${
                        Number(client.score) >= 70 ? 'text-green-600' :
                        Number(client.score) >= 40 ? 'text-yellow-600' : 'text-red-500'
                      }`}>
                        {client.score}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">Save Score</div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-400 italic">Not scored</div>
                  )}
                </div>
              </div>

              {(client.recommended_strategy || client.recommended_program) && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
                  {client.recommended_strategy && <span>Strategy: <strong className="text-gray-700">{client.recommended_strategy}</strong></span>}
                  {client.recommended_program && <span>Program: <strong className="text-gray-700">{client.recommended_program}</strong></span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
