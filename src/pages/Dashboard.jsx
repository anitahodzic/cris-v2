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
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">This Month — Cancellation Activity</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Cancellations" value={stats?.total_evaluations} sub="logged this month" color="blue" icon="📋" loading={loading} />
          <StatCard label="Clients Saved" value={stats?.saved} sub="retained this month" color="green" icon="✓" loading={loading} />
          <StatCard label="Cancelled" value={stats?.cancelled} sub="lost this month" color="red" icon="✗" loading={loading} />
          <StatCard label="Revenue Saved" value={stats?.revenue_saved != null ? `$${Math.round(stats.revenue_saved).toLocaleString()}` : null} sub="this month" color="purple" icon="💰" loading={loading} />
        </div>
      </div>

      {/* Stat Cards Row 2 — Proactive Risk Scan */}
      <div className="mb-7">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 mt-6">Proactive Risk Tracker — Weekly Action Plan</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Clients" value={riskData?.total_active_clients} sub="total in MaidCentral" color="blue" icon="👥" loading={riskLoading} />
          <StatCard label="At Risk This Week" value={riskData?.at_risk_count} sub="max 25 per weekly plan" color="red" icon="🚨" loading={riskLoading} />
          <StatCard label="L2 Calls (High)" value={riskData?.high_risk} sub="top 10 highest risk → phone call" color="red" icon="📞" loading={riskLoading} />
          <StatCard label="L1 Care Focus" value={riskData?.low_risk} sub="next 15 → schedule care focus" color="green" icon="🌟" loading={riskLoading} />
        </div>
      </div>

      {/* Bottom Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          {/* Risk summary card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900 text-base">⚠️ Client Risk Summary</h2>
                <p className="text-xs text-gray-400 mt-0.5">Current risk distribution across all active clients</p>
              </div>
              <button
                onClick={() => setPage('at-risk')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                View At-Risk Clients →
              </button>
            </div>
            {riskLoading ? (
              <div className="text-center text-gray-400 text-sm animate-pulse py-4">Scanning all clients…</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'L2 Calls (High)', value: riskData?.high_risk, color: 'text-red-600', bg: 'bg-red-50', icon: '📞' },
                  { label: 'L1 Care Focus', value: riskData?.low_risk, color: 'text-green-600', bg: 'bg-green-50', icon: '🌟' },
                  { label: 'At Risk Total', value: riskData?.at_risk_count, color: 'text-blue-600', bg: 'bg-blue-50', icon: '⚠️' },
                  { label: 'All Active', value: riskData?.total_active_clients, color: 'text-gray-600', bg: 'bg-gray-50', icon: '👥' },
                ].map(item => (
                  <div key={item.label} className={`${item.bg} rounded-xl p-3 text-center`}>
                    <div className="text-lg mb-1">{item.icon}</div>
                    <div className={`text-2xl font-extrabold ${item.color}`}>{item.value ?? '—'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
                  </div>
                ))}
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
                { label: 'New Cancellation Request', icon: '+', page: 'new-evaluation', color: '#1d4ed8' },
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
              <div className="text-xs text-yellow-600 mt-0.5">cancellations need attention</div>
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
