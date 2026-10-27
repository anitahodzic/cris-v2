import React, { useState, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

// ── Helpers ──────────────────────────────────────────────────────────────────
function scorecardColor(score) {
  if (score == null) return '#9ca3af';
  if (score >= 3.5) return '#16a34a';
  if (score >= 2.5) return '#ca8a04';
  return '#dc2626';
}

function ScoreDot({ score }) {
  if (score == null) return <span className="text-gray-300 text-xs">—</span>;
  const color = score >= 3.5 ? 'text-green-600' : score >= 2.5 ? 'text-yellow-600' : 'text-red-500';
  return <span className={`font-bold text-sm ${color}`}>{Number(score).toFixed(1)}</span>;
}

function ScoreBar({ score, max = 4 }) {
  if (score == null) return null;
  const pct = Math.round((score / max) * 100);
  const color = score >= 3.5 ? '#16a34a' : score >= 2.5 ? '#ca8a04' : '#dc2626';
  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function RiskBadge({ score }) {
  if (score == null) return null;
  const tier = score >= 8 ? { label: 'High Risk', cls: 'bg-red-100 text-red-700 border-red-200' }
    : score >= 4 ? { label: 'Medium', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
    : { label: 'Low', cls: 'bg-green-50 text-green-700 border-green-200' };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${tier.cls}`}>
      {tier.label}
    </span>
  );
}

function FreqTag({ freq }) {
  if (!freq) return null;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium">
      {freq}
    </span>
  );
}

function TenureTag({ since }) {
  if (!since) return null;
  const months = Math.round((Date.now() - new Date(since).getTime()) / (1000 * 60 * 60 * 24 * 30));
  const label = months < 6 ? `${months}mo` : months < 24 ? `${Math.floor(months / 6) * 6}mo` : `${Math.floor(months / 12)}yr`;
  const cls = months >= 24 ? 'bg-purple-50 text-purple-700 border-purple-100'
    : months >= 12 ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
    : 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {label} client
    </span>
  );
}

function VisitCard({ visit, position }) {
  const posLabel = position === 1 ? 'Last' : position === 2 ? '2nd last' : '3rd last';
  const posColor = position === 1 ? 'bg-red-50 border-red-200 text-red-700'
    : position === 2 ? 'bg-orange-50 border-orange-200 text-orange-700'
    : 'bg-yellow-50 border-yellow-200 text-yellow-700';
  const scoreColor = scorecardColor(visit.scorecard);
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${posColor}`}>{posLabel}</span>
        <span className="text-xs text-gray-400">{visit.dateStr || visit.date || '—'}</span>
      </div>
      <div className="text-sm font-semibold text-gray-800 truncate">{visit.tech || '—'}</div>
      <div className="flex items-center gap-2">
        {visit.scorecard != null ? (
          <>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4].map(n => (
                <div
                  key={n}
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ background: n <= visit.scorecard ? scoreColor : '#e5e7eb' }}
                />
              ))}
            </div>
            <span className="text-xs font-bold" style={{ color: scoreColor }}>{visit.scorecard}/4</span>
          </>
        ) : (
          <span className="text-xs text-gray-300">No scorecard</span>
        )}
        {visit.status && visit.status !== 'Complete' && (
          <span className="text-xs text-gray-400">· {visit.status}</span>
        )}
      </div>
    </div>
  );
}

function ClientCard({ client }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${open ? 'border-blue-200 shadow-sm' : 'border-gray-100'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50/80 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate">{client.client_name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${client.outcome === 'Cancelled' ? 'bg-red-100 text-red-600' : client.outcome === 'Saved' ? 'bg-green-100 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
              {client.outcome}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {client.frequency && <FreqTag freq={client.frequency} />}
            {client.first_service && <TenureTag since={client.first_service} />}
            {client.last_3_visits?.[0]?.scorecard != null && (
              <span className="text-xs text-gray-400">Last score: <ScoreDot score={client.last_3_visits[0].scorecard} /></span>
            )}
          </div>
        </div>
        <span className="text-gray-300 text-xs mt-1">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-gray-50 bg-gray-50/30">
          <div className="mt-2.5">
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Last 3 Cleaning Technicians</div>
            {client.last_3_visits?.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {client.last_3_visits.map((v, i) => (
                  <VisitCard key={i} visit={v} position={i + 1} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No dispatch history found for this client</p>
            )}
            {client.ai_summary && (
              <div className="mt-2 bg-blue-50/60 rounded-lg p-2.5 border border-blue-100">
                <div className="text-xs font-semibold text-blue-600 mb-1">CRIS Note</div>
                <p className="text-xs text-gray-600 leading-relaxed">{client.ai_summary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CTPerformance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('weighted_risk');
  const [expanded, setExpanded] = useState(null);
  const [minClients, setMinClients] = useState(1);

  useEffect(() => {
    fetch(`${BASE}/api/ct-performance`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Analyzing cleaning technician risk…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-8 text-center">
      <div className="text-red-500 mb-2 font-medium">{error}</div>
      <p className="text-sm text-gray-400">Could not load CT performance data.</p>
    </div>
  );

  const { techs = [], total_evaluations = 0, total_cancelled = 0, has_dispatch_data = false } = data || {};

  const filtered = techs
    .filter(t => t.total_clients >= minClients)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'weighted_risk') return (b.weighted_risk_score || 0) - (a.weighted_risk_score || 0);
      if (sort === 'cancel_rate') return (b.cancellation_rate || 0) - (a.cancellation_rate || 0);
      if (sort === 'clients') return b.total_clients - a.total_clients;
      if (sort === 'avg_score') return (a.avg_scorecard ?? 5) - (b.avg_scorecard ?? 5);
      return 0;
    });

  const maxRisk = filtered[0]?.weighted_risk_score || 1;
  const highRisk = techs.filter(t => t.weighted_risk_score >= 8 && t.total_clients >= 3);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CT Performance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Which cleaning technicians are causing the most client risk
            {has_dispatch_data && ' · Dispatch board data included'}
          </p>
        </div>
        {!has_dispatch_data && (
          <div className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-100 rounded-lg px-3 py-2">
            ⚠ Dispatch board data not available — scorecard history limited
          </div>
        )}
      </div>

      {/* Scoring legend */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Risk Scoring Method</div>
        <div className="flex flex-wrap gap-4 text-xs text-blue-700">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-red-200 text-red-800 font-bold flex items-center justify-center text-xs">3</span>
            Last cleaner before cancellation = 3 pts
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-orange-200 text-orange-800 font-bold flex items-center justify-center text-xs">2</span>
            2nd-to-last cleaner = 2 pts
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-yellow-200 text-yellow-800 font-bold flex items-center justify-center text-xs">1</span>
            3rd-to-last cleaner = 1 pt
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'CTs Tracked', value: techs.length, color: 'text-gray-800', sub: 'from evaluations' },
          { label: 'High Risk', value: highRisk.length, color: 'text-red-600', sub: '≥8 pts · 3+ clients' },
          { label: 'Total Cancelled', value: total_cancelled, color: 'text-red-500', sub: `of ${total_evaluations} evals` },
          { label: 'Dispatch Data', value: has_dispatch_data ? '✓' : '✗', color: has_dispatch_data ? 'text-green-600' : 'text-gray-400', sub: 'visit history' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs font-semibold text-gray-500 mt-0.5 uppercase tracking-wide">{c.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search technician…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[160px]"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400">Min clients:</span>
          {[1, 2, 3, 5].map(n => (
            <button
              key={n}
              onClick={() => setMinClients(n)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${minClients === n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >{n}+</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400">Sort:</span>
          {[
            { id: 'weighted_risk', label: 'Risk Score' },
            { id: 'cancel_rate', label: 'Cancel Rate' },
            { id: 'clients', label: 'Clients' },
            { id: 'avg_score', label: 'Scorecard' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sort === s.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >{s.label}</button>
          ))}
        </div>
      </div>

      {/* Tech List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <div className="text-3xl mb-3">👷</div>
            <p className="text-gray-500 text-sm">No technicians match your filters</p>
          </div>
        )}
        {filtered.map((tech, idx) => {
          const isExpanded = expanded === tech.name;
          const riskPct = Math.round(((tech.weighted_risk_score || 0) / maxRisk) * 100);
          const cancelRate = tech.cancellation_rate || 0;
          const isHighRisk = (tech.weighted_risk_score >= 8) && tech.total_clients >= 3;

          return (
            <div key={tech.name} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isHighRisk ? 'border-red-200' : 'border-gray-100'}`}>
              {/* Tech header row */}
              <button
                onClick={() => setExpanded(isExpanded ? null : tech.name)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50/60 transition-colors"
              >
                {/* Rank */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${idx === 0 ? 'bg-red-100 text-red-700' : idx === 1 ? 'bg-orange-100 text-orange-700' : idx === 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                  {idx + 1}
                </div>

                {/* Name + risk badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 text-sm">{tech.name}</span>
                    <RiskBadge score={tech.weighted_risk_score} />
                    {isHighRisk && <span className="text-xs text-red-600 font-medium">⚠ High risk CT</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                    <span>{tech.total_clients} client{tech.total_clients !== 1 ? 's' : ''}</span>
                    <span>{tech.cancelled_clients || 0} cancelled</span>
                    <span>{tech.saved_clients || 0} saved</span>
                    {tech.avg_scorecard != null && (
                      <span className="flex items-center gap-1">
                        Avg score: <ScoreDot score={tech.avg_scorecard} />
                      </span>
                    )}
                  </div>
                  {/* Risk bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${riskPct}%`,
                          background: isHighRisk ? '#ef4444' : cancelRate >= 40 ? '#f59e0b' : '#3b82f6',
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-600 shrink-0">{tech.weighted_risk_score || 0} pts</span>
                  </div>
                </div>

                {/* Cancel rate */}
                <div className="text-right shrink-0">
                  <div className={`text-xl font-bold ${cancelRate >= 50 ? 'text-red-600' : cancelRate >= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {cancelRate}%
                  </div>
                  <div className="text-xs text-gray-400">cancel rate</div>
                </div>

                <span className="text-gray-300 text-sm">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {/* Expanded: client cards */}
              {isExpanded && (
                <div className="border-t border-gray-50 bg-gray-50/30 p-4">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                    Clients ({tech.clients?.length || 0}) — Last 3 techs + client snapshot
                  </div>
                  {tech.clients?.length > 0 ? (
                    <div className="space-y-2">
                      {tech.clients.map((c, i) => (
                        <ClientCard key={i} client={c} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No client data</p>
                  )}

                  {/* Dispatch stats */}
                  {tech.dispatch_stats && (
                    <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                      <div className="text-center">
                        <div className="text-lg font-bold text-gray-800">{tech.dispatch_stats.total_visits || 0}</div>
                        <div className="text-xs text-gray-400">Total visits</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-gray-800">
                          {tech.dispatch_stats.avg_scorecard != null ? Number(tech.dispatch_stats.avg_scorecard).toFixed(1) : '—'}
                        </div>
                        <div className="text-xs text-gray-400">Avg scorecard</div>
                        {tech.dispatch_stats.avg_scorecard != null && (
                          <ScoreBar score={tech.dispatch_stats.avg_scorecard} />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-red-500">{tech.dispatch_stats.cancelled_visits || 0}</div>
                        <div className="text-xs text-gray-400">At cancelled clients</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 pb-4">
        Risk score = sum of weighted positions across all evaluations where this CT appeared (last cleaner = 3 pts, 2nd = 2 pts, 3rd = 1 pt).
        Cancel rate = percentage of clients where this CT appeared who cancelled.
        Scores from dispatch board reflect all-time client history, not just cancellations.
      </p>
    </div>
  );
}
