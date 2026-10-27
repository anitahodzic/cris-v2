import React, { useState, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

// ── Helpers ──────────────────────────────────────────────────────────────────
function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function OutcomePill({ outcome }) {
  const map = {
    Cancelled: 'bg-red-100 text-red-700 border border-red-200',
    Saved:     'bg-green-100 text-green-700 border border-green-200',
    Pending:   'bg-yellow-50 text-yellow-700 border border-yellow-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[outcome] || 'bg-gray-100 text-gray-600'}`}>
      {outcome}
    </span>
  );
}

function MiniBar({ value, max, color = '#2563eb' }) {
  const w = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-24">
      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

function StackBar({ cancelled, saved, pending, total }) {
  const cp = pct(cancelled, total);
  const sp = pct(saved, total);
  const pp = pct(pending, total);
  return (
    <div className="flex h-2 rounded-full overflow-hidden w-full bg-gray-100">
      {cp > 0 && <div style={{ width: `${cp}%`, background: '#ef4444' }} title={`Cancelled ${cp}%`} />}
      {sp > 0 && <div style={{ width: `${sp}%`, background: '#22c55e' }} title={`Saved ${sp}%`} />}
      {pp > 0 && <div style={{ width: `${pp}%`, background: '#f59e0b' }} title={`Pending ${pp}%`} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ReasonRow({ item, max, labelKey, isAI }) {
  const label = item[labelKey];
  const saveRate = item.count > 0 ? pct(item.saved, item.count) : 0;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800 truncate">{label}</span>
          {isAI && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium shrink-0">AI</span>
          )}
        </div>
        <div className="mt-1.5">
          <StackBar cancelled={item.cancelled} saved={item.saved} pending={item.pending} total={item.count} />
        </div>
        <div className="flex gap-3 mt-1 text-xs text-gray-400">
          <span className="text-red-500">{item.cancelled} cancelled</span>
          <span className="text-green-600">{item.saved} saved</span>
          {item.pending > 0 && <span className="text-yellow-600">{item.pending} pending</span>}
          {item.saved > 0 && <span className="font-medium text-gray-500">{saveRate}% save rate</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg font-bold text-gray-800">{item.count}</div>
        <MiniBar value={item.count} max={max} color={isAI ? '#2563eb' : '#6366f1'} />
      </div>
    </div>
  );
}

function MonthlyChart({ monthly }) {
  if (!monthly?.length) return null;
  const maxTotal = Math.max(...monthly.map(m => m.total), 1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {monthly.map(m => {
        const h = Math.round((m.total / maxTotal) * 80);
        const cp = pct(m.cancelled, m.total);
        return (
          <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-t cursor-default transition-opacity"
              style={{ height: `${h}px`, background: `linear-gradient(to top, #ef4444 ${cp}%, #22c55e ${cp}%)` }}
            />
            <span className="text-xs text-gray-400 rotate-[-45deg] origin-top-left translate-y-1 whitespace-nowrap" style={{ fontSize: 9 }}>
              {m.month.slice(5)}
            </span>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 flex-col gap-0.5">
              <span className="font-semibold">{m.month}</span>
              <span>{m.total} evaluations</span>
              <span className="text-red-300">{m.cancelled} cancelled</span>
              <span className="text-green-300">{m.saved} saved</span>
              {m.top_driver && <span className="text-blue-300">Top: {m.top_driver}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecordRow({ r, expanded, onToggle }) {
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">{r.client_name}</span>
            <OutcomePill outcome={r.outcome} />
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{r.date} · {r.staff_name}</div>
        </div>
        <div className="text-right shrink-0 text-xs space-y-0.5">
          {r.stated_reason && (
            <div className="text-purple-600 font-medium truncate max-w-[120px]">{r.stated_reason}</div>
          )}
          {r.ai_driver && (
            <div className="text-blue-600 truncate max-w-[120px]">{r.ai_driver}</div>
          )}
        </div>
        <span className="text-gray-300 ml-1">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50 bg-gray-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div className="bg-white rounded-lg p-3 border border-purple-100">
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Stated Reason</div>
              <p className="text-sm text-gray-700">{r.stated_reason || <span className="italic text-gray-400">Not provided</span>}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-100">
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">AI-Assessed Driver</div>
              <p className="text-sm text-gray-700">{r.ai_driver || <span className="italic text-gray-400">Not analyzed</span>}</p>
            </div>
          </div>
          {r.root_cause_evidence && (
            <div className="mt-3 bg-white rounded-lg p-3 border border-gray-100">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Root Cause Evidence</div>
              <p className="text-sm text-gray-600 leading-relaxed">{r.root_cause_evidence}</p>
            </div>
          )}
          {r.recommended_program && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-400">Recommended:</span>
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{r.recommended_program}</span>
              {r.recommended_strategy && (
                <span className="text-xs text-gray-500">via {r.recommended_strategy}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CancellationDrivers() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview'); // overview | records
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch(`${BASE}/api/cancellation-drivers`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Analyzing cancellation patterns…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-8 text-center">
      <div className="text-red-500 mb-2 font-medium">{error}</div>
      <p className="text-sm text-gray-400">Could not load cancellation data.</p>
    </div>
  );

  const { stated_reasons = [], ai_drivers = [], monthly_trend = [], records = [], total = 0 } = data || {};

  const maxStated = stated_reasons[0]?.count || 1;
  const maxAI = ai_drivers[0]?.count || 1;
  const totalCancelled = records.filter(r => r.outcome === 'Cancelled').length;
  const totalSaved = records.filter(r => r.outcome === 'Saved').length;
  const saveRate = total > 0 ? pct(totalSaved, total) : 0;

  // Match/mismatch rate
  const withBoth = records.filter(r => r.stated_reason && r.stated_reason !== 'Not stated' && r.ai_driver);
  const mismatched = withBoth.filter(r =>
    !r.ai_driver?.toLowerCase().includes(r.stated_reason?.toLowerCase().split(' ')[0]) &&
    !r.stated_reason?.toLowerCase().includes(r.ai_driver?.toLowerCase().split(' ')[0])
  );

  const filteredRecords = records
    .filter(r => outcomeFilter === 'all' || r.outcome === outcomeFilter)
    .filter(r => !search || r.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.stated_reason?.toLowerCase().includes(search.toLowerCase()) ||
      r.ai_driver?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cancellation Drivers</h1>
          <p className="text-sm text-gray-500 mt-1">Why clients cancel — stated reason vs. what CRIS actually found</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {['overview', 'records'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'overview' ? 'Overview' : `All Records (${total})`}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Evaluations', value: total, color: 'text-gray-800', sub: 'with reason data' },
          { label: 'Cancelled', value: totalCancelled, color: 'text-red-600', sub: `${pct(totalCancelled, total)}% of evals` },
          { label: 'Saved', value: totalSaved, color: 'text-green-600', sub: `${saveRate}% save rate` },
          { label: 'Reason Mismatch', value: mismatched.length, color: 'text-purple-600', sub: 'stated ≠ AI finding' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs font-semibold text-gray-500 mt-0.5 uppercase tracking-wide">{c.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Monthly Trend */}
          {monthly_trend.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Monthly Trend</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Last 12 months — <span className="text-red-400">■ cancelled</span> <span className="text-green-500">■ saved</span></p>
                </div>
              </div>
              <MonthlyChart monthly={monthly_trend} />
            </div>
          )}

          {/* Side-by-side reasons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Stated Reasons */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Stated by Client</h2>
              </div>
              <p className="text-xs text-gray-400 mb-4">What they told us when requesting cancellation</p>
              <div className="divide-y divide-gray-50">
                {stated_reasons.slice(0, 10).map(item => (
                  <ReasonRow key={item.reason} item={item} max={maxStated} labelKey="reason" isAI={false} />
                ))}
                {stated_reasons.length === 0 && (
                  <p className="text-sm text-gray-400 py-4 text-center">No stated reasons recorded yet</p>
                )}
              </div>
            </div>

            {/* AI Drivers */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">AI-Assessed Root Cause</h2>
              </div>
              <p className="text-xs text-gray-400 mb-4">What CRIS actually determined was driving the cancellation</p>
              <div className="divide-y divide-gray-50">
                {ai_drivers.slice(0, 10).map(item => (
                  <ReasonRow key={item.driver} item={item} max={maxAI} labelKey="driver" isAI={true} />
                ))}
                {ai_drivers.length === 0 && (
                  <p className="text-sm text-gray-400 py-4 text-center">No AI analysis data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Mismatch callout */}
          {mismatched.length > 0 && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-purple-500 text-lg mt-0.5">⚡</span>
                <div>
                  <div className="text-sm font-semibold text-purple-800">
                    {mismatched.length} evaluation{mismatched.length !== 1 ? 's' : ''} where stated reason didn't match AI finding
                  </div>
                  <p className="text-xs text-purple-600 mt-1">
                    These clients may not have shared the real reason. Review them in All Records to identify hidden patterns.
                  </p>
                  <button
                    onClick={() => setTab('records')}
                    className="mt-2 text-xs font-semibold text-purple-700 underline hover:text-purple-900"
                  >
                    View all records →
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'records' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search client, reason…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={outcomeFilter}
              onChange={e => setOutcomeFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Outcomes</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Saved">Saved</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400 pb-1 border-b border-gray-50">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> Stated reason</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> AI driver</span>
          </div>

          {/* Record list */}
          <div className="space-y-2">
            {filteredRecords.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">No records match your filters</p>
            )}
            {filteredRecords.map(r => (
              <RecordRow
                key={r.evaluation_id}
                r={r}
                expanded={expanded === r.evaluation_id}
                onToggle={() => setExpanded(expanded === r.evaluation_id ? null : r.evaluation_id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
