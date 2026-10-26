import React, { useState, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

function StatCard({ label, value, sub, color, icon, loading }) {
  const colors = {
    blue:   { border: '#3b82f6', bg: '#eff6ff', val: '#1d4ed8', lbl: '#3b82f6' },
    red:    { border: '#ef4444', bg: '#fef2f2', val: '#dc2626', lbl: '#ef4444' },
    yellow: { border: '#f59e0b', bg: '#fffbeb', val: '#d97706', lbl: '#f59e0b' },
    green:  { border: '#22c55e', bg: '#f0fdf4', val: '#16a34a', lbl: '#22c55e' },
    purple: { border: '#a855f7', bg: '#faf5ff', val: '#7c3aed', lbl: '#a855f7' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100"
      style={{ background: '#fff', borderTopWidth: 4, borderTopColor: c.border, borderTopStyle: 'solid' }}>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: c.lbl }}>{label}</div>
            {loading ? (
              <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
            ) : (
              <div className="text-3xl font-extrabold" style={{ color: c.val }}>{value ?? '—'}</div>
            )}
            {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
          </div>
          <div className="text-3xl opacity-20">{icon}</div>
        </div>
      </div>
    </div>
  );
}

function RiskTierBadge({ tier }) {
  if (!tier) return null;
  const t = (tier || '').toLowerCase();
  if (t === 'critical' || t === 'high')    return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">🔴 {tier}</span>;
  if (t === 'medium' || t === 'moderate') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">🟡 {tier}</span>;
  if (t === 'low')                         return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">🟢 {tier}</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">{tier}</span>;
}

export default function Dashboard({ setPage, setActiveEvalId, currentUser }) {
  const [stats, setStats] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${BASE}/api/dashboard`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });

    fetch(`${BASE}/api/risk-scan`)
      .then(r => r.json())
      .then(d => { setRiskData(d); setRiskLoading(false); })
      .catch(() => { setRiskLoading(false); });
  }, []);

  const topAtRisk = (riskData?.clients || [])
    .filter(c => c.risk_score <= 65)
    .sort((a, b) => a.risk_score - b.risk_score)
    .slice(0, 8);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = currentUser?.username?.split(' ')[0] || 'there';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-7 flex items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-gray-900">{greeting}, {name} 👋</h1>
          <p className="text-gray-500 text-sm mt-1">Here's your client retention overview for today.</p>
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
        <div className="hidden sm:block">
          <img src="/mascot-thumbsup.png" alt="" className="w-20 object-contain" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.12))' }} />
        </div>
      </div>

      {/* Stat Cards Row 1 — this month's CRIS activity */}
      <div className="mb-3">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">This Month — Evaluation Activity</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Evaluations" value={stats?.total_evaluations} sub="started this month" color="blue" icon="📋" loading={loading} />
          <StatCard label="Clients Saved" value={stats?.saved} sub="retained this month" color="green" icon="✓" loading={loading} />
          <StatCard label="Cancelled" value={stats?.cancelled} sub="lost this month" color="red" icon="✗" loading={loading} />
          <StatCard label="Revenue Saved" value={stats?.revenue_saved != null ? `$${Math.round(stats.revenue_saved).toLocaleString()}` : null} sub="this month" color="purple" icon="💰" loading={loading} />
        </div>
      </div>

      {/* Stat Cards Row 2 — Proactive Risk Scan */}
      <div className="mb-7">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 mt-6">Proactive Risk Scan — All Active Clients</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Clients" value={riskData?.total_clients} sub="active in MaidCentral" color="blue" icon="👥" loading={riskLoading} />
          <StatCard label="High Risk" value={riskData?.high_risk} sub="score ≤ 40" color="red" icon="🚨" loading={riskLoading} />
          <StatCard label="Medium Risk" value={riskData?.medium_risk} sub="score 41–65" color="yellow" icon="⚠️" loading={riskLoading} />
          <StatCard label="Very Low Risk" value={riskData?.very_low_risk} sub="score > 80" color="green" icon="⭐" loading={riskLoading} />
        </div>
      </div>

      {/* Top Action Required Table */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900 text-base">🎯 Top Action Required</h2>
                <p className="text-xs text-gray-400 mt-0.5">Clients at highest cancellation risk — prioritize outreach</p>
              </div>
              <button
                onClick={() => setPage('at-risk')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                View All →
              </button>
            </div>
            {riskLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm animate-pulse">Scanning all clients…</div>
            ) : topAtRisk.length === 0 ? (
              <div className="p-8 text-center">
                <img src="/mascot-thumbsup.png" alt="" className="w-16 mx-auto mb-3 opacity-60" />
                <p className="text-gray-500 text-sm">No high-risk clients right now. Great work!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Top Signal</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {topAtRisk.map((client, i) => (
                      <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900 text-sm">{client.name}</div>
                          {client.frequency && <div className="text-xs text-gray-400">{client.frequency}</div>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block text-lg font-extrabold ${
                            client.risk_score <= 30 ? 'text-red-600' :
                            client.risk_score <= 50 ? 'text-orange-500' :
                            client.risk_score <= 65 ? 'text-yellow-600' : 'text-green-600'
                          }`}>
                            {client.risk_score}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <RiskTierBadge tier={client.risk_tier} />
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <span className="text-xs text-gray-600">{client.top_signal || '—'}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => setPage('at-risk')}
                            className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-all"
                            style={{ background: 'linear-gradient(90deg, #1d4ed8, #2563eb)', boxShadow: '0 1px 4px rgba(37,99,235,0.3)' }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-800 text-sm mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'New Client Evaluation', icon: '+', page: 'new-evaluation', color: '#1d4ed8' },
                { label: 'Ask CRIS a Question', icon: '✦', page: 'ai-chat', color: '#7c3aed' },
                { label: 'View At-Risk Clients', icon: '⚠', page: 'at-risk', color: '#dc2626' },
                { label: 'Monthly Report', icon: '↑', page: 'monthly-report', color: '#16a34a' },
              ].map(action => (
                <button
                  key={action.page}
                  onClick={() => setPage(action.page)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all hover:shadow-sm"
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = action.color; e.currentTarget.style.background = '#f0f7ff'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0"
                    style={{ background: action.color }}>
                    {action.icon}
                  </span>
                  <span className="text-gray-700">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pending Follow-Ups */}
          {stats?.pending > 0 && (
            <div className="rounded-2xl border border-yellow-200 p-4"
              style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-yellow-600">⏰</span>
                <span className="font-bold text-yellow-800 text-sm">Pending Follow-Up</span>
              </div>
              <div className="text-2xl font-extrabold text-yellow-700">{stats.pending}</div>
              <div className="text-xs text-yellow-600 mt-0.5">evaluations need attention</div>
              <button
                onClick={() => setPage('search')}
                className="mt-3 text-xs font-semibold text-yellow-800 hover:text-yellow-900 underline"
              >
                View in Search →
              </button>
            </div>
          )}

          {/* Mascot motivational */}
          <div className="rounded-2xl p-4 text-center" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
            <img src="/mascot-flex.png" alt="" className="w-20 mx-auto mb-2 object-contain" />
            <p className="text-xs text-blue-700 font-medium italic">"Cleaning spaces. Creating happy faces."</p>
            <p className="text-xs text-blue-500 mt-1">— BA House Cleaning</p>
          </div>
        </div>
      </div>
    </div>
  );
}
