import React, { useState, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

function RiskBadge({ score }) {
  const n = Number(score);
  if (n >= 70) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">High Save-ability</span>;
  if (n >= 40) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Medium Risk</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">High Risk</span>;
}

export default function AtRiskClients({ currentUser }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('score_asc');

  useEffect(() => {
    fetch(`${BASE}/api/at-risk`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Analyzing client risk…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  const sorted = [...data].sort((a, b) => {
    if (sort === 'score_asc') return Number(a.score || 0) - Number(b.score || 0);
    if (sort === 'score_desc') return Number(b.score || 0) - Number(a.score || 0);
    if (sort === 'date') return new Date(b.date) - new Date(a.date);
    return 0;
  });

  const highRisk = data.filter(d => Number(d.score) < 40).length;
  const mediumRisk = data.filter(d => Number(d.score) >= 40 && Number(d.score) < 70).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">At-Risk Clients</h1>
        <p className="text-sm text-gray-500 mt-1">Evaluations with no outcome recorded — clients that still need follow-up</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-red-600">{highRisk}</div>
          <div className="text-sm text-red-500 mt-0.5">High Risk (score &lt; 40)</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-yellow-600">{mediumRisk}</div>
          <div className="text-sm text-yellow-500 mt-0.5">Medium Risk (40–69)</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-800">{data.length}</div>
          <div className="text-sm text-gray-500 mt-0.5">Total Pending Follow-Up</div>
        </div>
      </div>

      {/* Sort */}
      <div className="flex gap-2 mb-4 items-center">
        <span className="text-sm text-gray-500">Sort:</span>
        {[
          { id: 'score_asc', label: 'Lowest Score First' },
          { id: 'score_desc', label: 'Highest Score First' },
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

      {/* Cards */}
      {sorted.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">✓</div>
          <p className="font-medium text-gray-600">No pending clients</p>
          <p className="text-sm mt-1">All evaluations have recorded outcomes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((client, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-gray-900">{client.client_name}</h3>
                    <RiskBadge score={client.score} />
                  </div>
                  <div className="text-sm text-gray-500 mb-2">
                    {client.date ? new Date(client.date).toLocaleDateString() : ''} · {client.staff_name || 'Unknown staff'}
                    {client.evaluation_id && <span className="ml-2 text-xs text-gray-400">{client.evaluation_id}</span>}
                  </div>
                  {client.cancellation_reason && (
                    <p className="text-sm text-gray-600 line-clamp-2">{client.cancellation_reason}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {client.score != null && (
                    <div className={`text-3xl font-bold ${
                      Number(client.score) >= 70 ? 'text-green-600' :
                      Number(client.score) >= 40 ? 'text-yellow-600' : 'text-red-500'
                    }`}>
                      {client.score}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-0.5">Save Score</div>
                </div>
              </div>

              {(client.recommended_strategy || client.recommended_program) && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4 text-xs text-gray-500">
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
