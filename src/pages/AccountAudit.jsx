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

export default function AccountAudit({ currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch(`${BASE}/api/account-audit`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading audit data…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  const { evaluations = [], summary = {} } = data || {};

  const filtered = evaluations.filter(e => {
    if (filter === 'no-outcome') return !e.outcome;
    if (filter === 'saved') return e.outcome?.Outcome === 'Saved';
    if (filter === 'cancelled') return e.outcome?.Outcome === 'Cancelled';
    if (filter === 'pending') return !e.outcome && e.analysis;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Account Audit</h1>
        <p className="text-sm text-gray-500 mt-1">Full history of all evaluations and their outcomes</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Evaluations', value: summary.total || 0, color: 'blue' },
          { label: 'Saved', value: summary.saved || 0, color: 'green' },
          { label: 'Cancelled', value: summary.cancelled || 0, color: 'red' },
          { label: 'No Outcome', value: summary.no_outcome || 0, color: 'yellow' },
        ].map(card => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-gray-900">{card.value}</div>
            <div className="text-sm text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
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
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Staff</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">AI Score</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Program</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Outcome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Revenue Saved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No records found</td></tr>
              )}
              {filtered.map((e, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {e.Created_Date ? new Date(e.Created_Date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{e.Client_Name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{e.Staff_Name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{e.Cancellation_Reason || '—'}</td>
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
                  <td className="px-4 py-3">{e.outcome?.Program_Offered || e.analysis?.Recommended_Program || '—'}</td>
                  <td className="px-4 py-3">
                    {e.outcome?.Outcome ? (
                      <Badge
                        label={e.outcome.Outcome}
                        color={e.outcome.Outcome === 'Saved' ? 'green' : e.outcome.Outcome === 'Cancelled' ? 'red' : 'gray'}
                      />
                    ) : e.analysis ? (
                      <Badge label="Pending" color="yellow" />
                    ) : (
                      <Badge label="No Analysis" color="gray" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {e.outcome?.Revenue_Saved ? `$${parseFloat(e.outcome.Revenue_Saved.replace(/[^0-9.]/g,'')||0).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
