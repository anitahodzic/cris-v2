import React, { useState, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function AccuracyRing({ rate }) {
  const r = 36, cx = 44, cy = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (rate / 100) * circ;
  const color = rate >= 70 ? '#16a34a' : rate >= 50 ? '#ca8a04' : '#dc2626';
  return (
    <svg width={88} height={88} className="rotate-[-90deg]">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={8} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        className="rotate-90" fill={color}
        style={{ fontSize: 16, fontWeight: 700, transform: `rotate(90deg) translate(0px, -${cx * 2}px)` }}>
      </text>
    </svg>
  );
}

function StatusPill({ status }) {
  const map = {
    predicted_correct: 'bg-green-100 text-green-700 border border-green-200',
    predicted_wrong: 'bg-red-100 text-red-700 border border-red-200',
    pending: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    saved_active: 'bg-blue-50 text-blue-700 border border-blue-200',
  };
  const labels = {
    predicted_correct: '✓ Prediction correct',
    predicted_wrong: '✗ Prediction wrong',
    pending: '⏳ Pending (< 90 days)',
    saved_active: '★ Saved — still active',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${map[status] || 'bg-gray-100 text-gray-500'}`}>
      {labels[status] || status}
    </span>
  );
}

function ConfidenceBar({ score }) {
  if (score == null) return null;
  const pctW = Math.round((score / 10) * 100);
  const color = score >= 7 ? '#16a34a' : score >= 4 ? '#ca8a04' : '#9ca3af';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pctW}%`, background: color }} />
      </div>
      <span className="text-xs text-gray-500">{score}/10</span>
    </div>
  );
}

function MonthlyAccuracyChart({ months }) {
  if (!months?.length) return null;
  const maxTotal = Math.max(...months.map(m => m.total || 0), 1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {months.map(m => {
        const h = Math.round(((m.total || 0) / maxTotal) * 80);
        const accuracyPct = m.total > 0 ? pct(m.correct, m.total) : 0;
        const color = accuracyPct >= 70 ? '#16a34a' : accuracyPct >= 50 ? '#ca8a04' : '#ef4444';
        return (
          <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-t cursor-default"
              style={{ height: `${Math.max(h, 4)}px`, background: color, opacity: 0.8 }}
            />
            <span className="text-gray-400 whitespace-nowrap" style={{ fontSize: 9 }}>
              {m.month?.slice(5)}
            </span>
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 flex-col gap-0.5">
              <span className="font-semibold">{m.month}</span>
              <span>{m.total} cancellations resolved</span>
              <span className="text-green-300">{m.correct} correct predictions</span>
              <span className="font-bold">{accuracyPct}% accuracy</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CRISvsData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch(`${BASE}/api/cris-accuracy`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Calculating CRIS accuracy…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-8 text-center">
      <div className="text-red-500 mb-2 font-medium">{error}</div>
    </div>
  );

  const {
    overall_accuracy = 0,
    total_resolved = 0,
    total_correct = 0,
    total_wrong = 0,
    total_pending = 0,
    total_saved_active = 0,
    by_program = [],
    by_month = [],
    records = [],
  } = data || {};

  const filtered = records
    .filter(r => filter === 'all' || r.verdict === filter)
    .filter(r => !search || r.client_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">CRIS vs Data</h1>
        <p className="text-sm text-gray-500 mt-1">
          Prediction accuracy — did CRIS interventions actually prevent cancellations?
          <span className="ml-2 text-blue-500 font-medium">90-day window</span>
        </p>
      </div>

      {/* Accuracy ring + summary */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Ring */}
          <div className="relative shrink-0">
            <AccuracyRing rate={overall_accuracy} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-xl font-bold ${overall_accuracy >= 70 ? 'text-green-600' : overall_accuracy >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                  {overall_accuracy}%
                </div>
                <div className="text-xs text-gray-400 leading-tight">accurate</div>
              </div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Resolved', value: total_resolved, color: 'text-gray-800', sub: 'past 90-day window' },
              { label: 'Correct', value: total_correct, color: 'text-green-600', sub: `${pct(total_correct, total_resolved)}% of resolved` },
              { label: 'Wrong', value: total_wrong, color: 'text-red-500', sub: `cancelled despite intervention` },
              { label: 'Pending', value: total_pending, color: 'text-yellow-600', sub: 'still in 90-day window' },
            ].map(c => (
              <div key={c.label}>
                <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{c.label}</div>
                <div className="text-xs text-gray-400">{c.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {total_saved_active > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-lg">★</span>
              <span className="text-sm text-blue-700 font-semibold">{total_saved_active} clients saved and still active</span>
              <span className="text-xs text-gray-400">— marked Saved in CRIS and no cancellation within 90 days</span>
            </div>
          </div>
        )}
      </div>

      {/* Monthly chart */}
      {by_month.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">Monthly Accuracy Trend</h2>
          <p className="text-xs text-gray-400 mb-4">
            <span className="text-green-500">■ high accuracy</span>
            {' · '}
            <span className="text-yellow-500">■ moderate</span>
            {' · '}
            <span className="text-red-400">■ low</span>
            {' (resolved evals only)'}
          </p>
          <MonthlyAccuracyChart months={by_month} />
        </div>
      )}

      {/* By program */}
      {by_program.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Accuracy by Intervention Program</h2>
          <div className="space-y-3">
            {by_program.map(prog => {
              const acc = pct(prog.correct, prog.resolved);
              const color = acc >= 70 ? '#16a34a' : acc >= 50 ? '#ca8a04' : '#ef4444';
              return (
                <div key={prog.program} className="flex items-center gap-3">
                  <div className="w-28 text-sm font-medium text-gray-700 truncate shrink-0">{prog.program}</div>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${acc}%`, background: color }} />
                  </div>
                  <div className="text-xs font-bold shrink-0" style={{ color }}>{acc}%</div>
                  <div className="text-xs text-gray-400 shrink-0">{prog.correct}/{prog.resolved}</div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">% = correct predictions among resolved cancellations per program</p>
        </div>
      )}

      {/* Record table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'predicted_correct', label: 'Correct' },
              { id: 'predicted_wrong', label: 'Wrong' },
              { id: 'pending', label: 'Pending' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filter === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">No records match your filters</p>
          )}
          {filtered.map(r => (
            <div key={r.evaluation_id} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === r.evaluation_id ? null : r.evaluation_id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{r.client_name}</span>
                    <StatusPill status={r.verdict} />
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {r.program || 'No program'} · {r.date} · {r.days_since != null ? `${r.days_since} days ago` : ''}
                  </div>
                </div>
                {r.save_score != null && (
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-400">CRIS score</div>
                    <ConfidenceBar score={r.save_score} />
                  </div>
                )}
                <span className="text-gray-300 text-xs">{expanded === r.evaluation_id ? '▲' : '▼'}</span>
              </button>

              {expanded === r.evaluation_id && (
                <div className="px-4 pb-4 border-t border-gray-50 bg-gray-50/50 space-y-3 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Prediction</div>
                      <p className="text-sm text-gray-700">{r.ai_risk_level || '—'}</p>
                      {r.save_score != null && (
                        <div className="mt-2">
                          <div className="text-xs text-gray-400 mb-1">Save worthiness: {r.save_score}/10</div>
                          <ConfidenceBar score={r.save_score} />
                        </div>
                      )}
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Intervention</div>
                      <p className="text-sm text-gray-700">{r.program || 'None'}</p>
                      {r.strategy && <p className="text-xs text-gray-400 mt-0.5">via {r.strategy}</p>}
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Outcome</div>
                      <StatusPill status={r.verdict} />
                      {r.outcome && <p className="text-xs text-gray-400 mt-1">{r.outcome}</p>}
                      {r.days_since != null && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {r.days_since < 90 ? `${90 - r.days_since} days remaining in window` : `${r.days_since} days since cancellation`}
                        </p>
                      )}
                    </div>
                  </div>
                  {r.ai_summary && (
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <div className="text-xs font-semibold text-blue-600 mb-1">CRIS Assessment</div>
                      <p className="text-xs text-gray-600 leading-relaxed">{r.ai_summary}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 pb-4">
        A prediction is considered <strong>correct</strong> if the client remains active 90 days after an L2 ticket or Care Focus intervention.
        <strong> Wrong</strong> = client cancelled within 90 days despite intervention.
        <strong> Pending</strong> = less than 90 days have elapsed since the cancellation was logged.
      </p>
    </div>
  );
}
