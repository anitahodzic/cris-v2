import React, { useState, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

function ScoreDot({ score }) {
  if (score == null) return <span className="text-gray-300">—</span>;
  const color = score >= 3.5 ? 'text-green-600' : score >= 2.5 ? 'text-yellow-600' : 'text-red-500';
  return <span className={`font-semibold ${color}`}>{score.toFixed(2)}</span>;
}

function RateBadge({ rate }) {
  const color = rate >= 50 ? 'bg-red-100 text-red-700' : rate >= 25 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{rate}%</span>;
}

export default function TechnicianReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('cancellations_as_last');
  const [expanded, setExpanded] = useState(null);
  const [minJobs, setMinJobs] = useState(1);

  useEffect(() => {
    fetch(`${BASE}/api/technician-report`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Analyzing technician data…</div>;
  if (error) return (
    <div className="p-8 text-center">
      <div className="text-red-500 mb-2">{error}</div>
      <p className="text-sm text-gray-500">This report requires Technician History to be pasted into evaluations. If no evaluations have technician data yet, this report will be empty.</p>
    </div>
  );

  const { techs = [], employee_stats = [], employee_stats_columns = [], total_evaluations = 0, total_cancelled = 0 } = data || {};

  const filtered = techs
    .filter(t => t.as_last_cleaner >= minJobs)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'cancellations_as_last') return b.cancellations_as_last - a.cancellations_as_last;
      if (sort === 'cancellation_rate') return b.cancellation_rate - a.cancellation_rate;
      if (sort === 'appearances') return b.total_appearances - a.total_appearances;
      if (sort === 'score') return (b.avg_score ?? 0) - (a.avg_score ?? 0);
      return 0;
    });

  const topCanceller = filtered[0];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cancellations by Technician</h1>
        <p className="text-sm text-gray-500 mt-1">
          Which technicians appeared most often as the last cleaner before a client cancelled.
          Based on {total_evaluations} evaluations, {total_cancelled} cancelled.
        </p>
      </div>

      {techs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No technician data found</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            This report is built from the "Technician History" field in evaluations.
            Paste MaidCentral's technician history when creating evaluations to populate this report.
          </p>
          {employee_stats.length > 0 && (
            <div className="mt-6 text-left max-w-2xl mx-auto">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Employee Stats from MaidCentral ({employee_stats.length} records)</h4>
              <p className="text-xs text-gray-400 mb-2">Columns found: {employee_stats_columns.join(', ')}</p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-200">
                    {employee_stats_columns.slice(0,8).map(c => <th key={c} className="px-3 py-2 text-left font-medium text-gray-500">{c}</th>)}
                  </tr></thead>
                  <tbody>{employee_stats.slice(0,10).map((row, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {employee_stats_columns.slice(0,8).map(c => <td key={c} className="px-3 py-2 text-gray-700">{row[c] || '—'}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-2xl font-bold text-gray-900">{techs.length}</div>
              <div className="text-sm text-gray-500 mt-0.5">Technicians tracked</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <div className="text-2xl font-bold text-red-600">{topCanceller?.cancellations_as_last || 0}</div>
              <div className="text-sm text-red-500 mt-0.5">Most cancellations (last cleaner)</div>
              {topCanceller && <div className="text-xs text-red-400 mt-0.5 font-medium">{topCanceller.name}</div>}
            </div>
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
              <div className="text-2xl font-bold text-yellow-600">
                {Math.max(...techs.map(t => t.cancellation_rate))}%
              </div>
              <div className="text-sm text-yellow-500 mt-0.5">Highest cancellation rate</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-2xl font-bold text-gray-900">
                {techs.filter(t => t.as_last_cleaner >= 3 && t.cancellation_rate > 40).length}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">High-risk technicians (&gt;40% rate, 3+ jobs)</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <input
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              placeholder="Search technician…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Min jobs as last cleaner:</span>
              {[1, 2, 3, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setMinJobs(n)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${minJobs === n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >{n}+</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Sort:</span>
              {[
                { id: 'cancellations_as_last', label: '# Cancellations' },
                { id: 'cancellation_rate', label: 'Rate %' },
                { id: 'appearances', label: 'Appearances' },
                { id: 'score', label: 'Score' },
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${sort === s.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >{s.label}</button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-3">{filtered.length} technician{filtered.length !== 1 ? 's' : ''}</p>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Technician</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Total appearances</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Times last cleaner</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Cancellations<br/><span className="font-normal text-xs">(as last cleaner)</span></th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Saves<br/><span className="font-normal text-xs">(as last cleaner)</span></th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Pending</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Cancel rate</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Avg scorecard</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No technicians match these filters</td></tr>
                  )}
                  {filtered.map((t, i) => (
                    <React.Fragment key={t.name}>
                      <tr
                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${t.cancellation_rate >= 50 && t.as_last_cleaner >= 3 ? 'bg-red-50/40' : ''}`}
                        onClick={() => setExpanded(expanded === t.name ? null : t.name)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{t.name}</div>
                          {t.cancellation_rate >= 50 && t.as_last_cleaner >= 3 && (
                            <div className="text-xs text-red-500 font-medium">⚠ High cancellation rate</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{t.total_appearances}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{t.as_last_cleaner}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold ${t.cancellations_as_last > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {t.cancellations_as_last}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${t.saves_as_last > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            {t.saves_as_last}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">{t.pending_as_last}</td>
                        <td className="px-4 py-3 text-center">
                          <RateBadge rate={t.cancellation_rate} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ScoreDot score={t.avg_score} />
                        </td>
                        <td className="px-4 py-3 text-center text-gray-400 text-xs">
                          {t.clients.length > 0 ? (expanded === t.name ? '▲' : '▼ clients') : ''}
                        </td>
                      </tr>
                      {expanded === t.name && t.clients.length > 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 pb-4 bg-gray-50">
                            <div className="rounded-lg border border-red-100 overflow-hidden">
                              <div className="px-3 py-2 bg-red-50 text-xs font-semibold text-red-700 border-b border-red-100">
                                Cancellations where {t.name} was the last cleaner
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-red-100 text-left">
                                    <th className="px-3 py-2 font-medium text-gray-500">Client</th>
                                    <th className="px-3 py-2 font-medium text-gray-500">Date</th>
                                    <th className="px-3 py-2 font-medium text-gray-500">Cancellation reason</th>
                                    <th className="px-3 py-2 font-medium text-gray-500">Last score</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-red-50">
                                  {t.clients.map((c, ci) => (
                                    <tr key={ci}>
                                      <td className="px-3 py-2 font-medium text-gray-800">{c.client}</td>
                                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.date ? new Date(c.date).toLocaleDateString() : '—'}</td>
                                      <td className="px-3 py-2 text-gray-600 max-w-xs">{c.reason || '—'}</td>
                                      <td className="px-3 py-2"><ScoreDot score={c.score} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            * "Last cleaner" = first technician listed in the Technician History paste (most recent job).
            This data requires technician history to be pasted into the evaluation form.
            High-risk flag = ≥3 jobs as last cleaner and &gt;40% cancellation rate.
          </p>
        </>
      )}
    </div>
  );
}
