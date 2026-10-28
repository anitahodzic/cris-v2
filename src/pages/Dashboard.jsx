import React, { useState, useEffect } from 'react';

// ── BAHC brand tokens ─────────────────────────────────────────────────────────
const B = {
  blue:      '#1B5EA0',
  blueMid:   '#2774B8',
  blueLight: '#EBF3FB',
  bluePale:  '#F0F7FF',
  green:     '#2A8C5A',
  greenMid:  '#38A169',
  greenLight:'#EBF7F1',
  greenPale: '#F0FDF4',
  red:       '#DC2626',
  redLight:  '#FEF2F2',
  amber:     '#D97706',
  amberLight:'#FFFBEB',
  slate:     '#0F172A',
  muted:     '#64748B',
  border:    '#E2E8F0',
  bg:        '#F8FAFC',
  white:     '#FFFFFF',
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, icon, loading, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: B.white,
        border: `1px solid ${B.border}`,
        borderTop: `4px solid ${accent}`,
        borderRadius: 16,
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent, marginBottom: 8 }}>{label}</div>
          {loading ? (
            <div style={{ height: 36, width: 80, background: '#f1f5f9', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
          ) : (
            <div style={{ fontSize: 32, fontWeight: 900, color: B.slate, lineHeight: 1 }}>{value ?? '—'}</div>
          )}
          {sub && <div style={{ fontSize: 12, color: B.muted, marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 28, opacity: 0.18, marginLeft: 12, flexShrink: 0 }}>{icon}</div>
      </div>
    </div>
  );
}

// ── Mini stat tile ────────────────────────────────────────────────────────────
function MiniTile({ icon, label, value, accent, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: accent, lineHeight: 1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: B.muted, marginTop: 4, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: B.muted, marginBottom: 12, marginTop: 28 }}>
      {children}
    </div>
  );
}

// ── Quick action button ───────────────────────────────────────────────────────
function QuickBtn({ icon, label, accent, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
        borderRadius: 12, border: `1.5px solid ${hov ? accent : B.border}`,
        background: hov ? accent + '0F' : B.white, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
      }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: 10, background: accent,
        color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: B.slate }}>{label}</span>
    </button>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ done, total, accent }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
      <div style={{ flex: 1, height: 7, background: '#f1f5f9', borderRadius: 99 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent, minWidth: 40 }}>{done}/{total}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard({ setPage, currentUser }) {
  const [stats, setStats] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);
  const [error, setError] = useState('');
  const BASE = process.env.REACT_APP_API_URL || '';

  useEffect(() => {
    fetch(`${BASE}/api/dashboard`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });

    fetch(`${BASE}/api/risk-scan`)
      .then(r => r.json())
      .then(d => { setRiskData(d); setRiskLoading(false); })
      .catch(() => setRiskLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = currentUser?.username?.split(' ')[0] || 'there';

  const saveRate = stats && stats.total_evaluations > 0
    ? Math.round((stats.saved / stats.total_evaluations) * 100)
    : null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 60px' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: B.slate, margin: 0 }}>
            {greeting}, {name} 👋
          </h1>
          <p style={{ color: B.muted, fontSize: 14, marginTop: 4, marginBottom: 0 }}>
            Here's your client retention overview for today.
          </p>
          {error && <p style={{ color: B.red, fontSize: 12, marginTop: 4 }}>{error}</p>}
        </div>
        <img
          src="/mascot-thumbsup.png" alt=""
          style={{ width: 80, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.14))', flexShrink: 0 }}
        />
      </div>

      {/* ── This Month — Cancellation Activity ─────────────────────────────── */}
      <SectionLabel>This Month — Cancellation Activity</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <KpiCard label="Evaluations" value={stats?.total_evaluations} sub="logged this month" accent={B.blue} icon="📋" loading={loading} />
        <KpiCard label="Clients Saved" value={stats?.saved} sub={saveRate != null ? `${saveRate}% save rate` : 'retained this month'} accent={B.green} icon="✓" loading={loading} onClick={() => setPage('search')} />
        <KpiCard label="Cancelled" value={stats?.cancelled} sub="lost this month" accent={B.red} icon="✗" loading={loading} />
        <KpiCard label="Revenue Saved" value={stats?.revenue_saved != null ? `$${Math.round(stats.revenue_saved).toLocaleString()}` : null} sub="protected this month" accent={B.blueMid} icon="💰" loading={loading} />
      </div>

      {/* Pending attention banner */}
      {stats?.pending > 0 && (
        <div style={{
          marginTop: 16, background: B.amberLight, border: `1.5px solid #fde68a`,
          borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 22 }}>⏰</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#92400e', fontSize: 14 }}>
              {stats.pending} cancellation{stats.pending !== 1 ? 's' : ''} need{stats.pending === 1 ? 's' : ''} attention
            </div>
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>Pending follow-up or AI review</div>
          </div>
          <button
            onClick={() => setPage('search')}
            style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: B.amber, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Review →
          </button>
        </div>
      )}

      {/* ── Two-column lower section ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, marginTop: 4, alignItems: 'start' }}>

        {/* Left — Risk tracker */}
        <div>
          <SectionLabel>Proactive Risk Tracker — Weekly Action Plan</SectionLabel>
          <div style={{ background: B.white, border: `1px solid ${B.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

            {/* Section header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${B.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: B.bluePale }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: B.slate }}>⚠️ At-Risk Client Action Plan</div>
                <div style={{ fontSize: 12, color: B.muted, marginTop: 2 }}>
                  {riskData?.scan_date ? `Last scanned: ${new Date(riskData.scan_date).toLocaleString()}` : 'Scanning all active clients…'}
                </div>
              </div>
              <button
                onClick={() => setPage('at-risk')}
                style={{ padding: '8px 16px', borderRadius: 10, border: `1.5px solid ${B.blue}`, background: B.white, color: B.blue, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Open Tracker →
              </button>
            </div>

            {/* KPI tiles */}
            {riskLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: B.muted, fontSize: 14, animation: 'pulse 1.5s infinite' }}>
                Scanning all clients…
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                  {[
                    { icon: '👥', label: 'Active Clients', value: riskData?.total_active_clients, accent: B.blue, bg: B.bluePale },
                    { icon: '🚨', label: 'At Risk This Week', value: riskData?.at_risk_count, accent: B.red, bg: B.redLight },
                    { icon: '📞', label: 'L2 Calls (High)', value: riskData?.high_risk, accent: B.red, bg: B.redLight },
                    { icon: '🌟', label: 'L1 Care Focus', value: riskData?.low_risk, accent: B.green, bg: B.greenLight },
                  ].map((t, i) => (
                    <div key={t.label} style={{
                      padding: '18px 16px', textAlign: 'center', background: t.bg,
                      borderRight: i < 3 ? `1px solid ${B.border}` : 'none',
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: t.accent, lineHeight: 1 }}>{t.value ?? '—'}</div>
                      <div style={{ fontSize: 11, color: B.muted, marginTop: 4, fontWeight: 600 }}>{t.label}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bars */}
                <div style={{ padding: '18px 20px', borderTop: `1px solid ${B.border}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: B.red }}>📞 L2 Phone Calls — Top 10 High-Risk</span>
                      <span style={{ fontSize: 11, color: B.muted }}>Call & create ticket in MaidCentral</span>
                    </div>
                    <ProgressBar done={0} total={10} accent={B.red} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: B.green }}>🌟 L1 Care Focus — Next 15</span>
                      <span style={{ fontSize: 11, color: B.muted }}>Schedule extra attention on next clean</span>
                    </div>
                    <ProgressBar done={0} total={15} accent={B.green} />
                  </div>
                  <button
                    onClick={() => setPage('at-risk')}
                    style={{
                      width: '100%', padding: '11px', borderRadius: 12, border: 'none',
                      background: `linear-gradient(135deg, ${B.blue}, ${B.blueMid})`,
                      color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 4,
                      boxShadow: `0 2px 8px ${B.blue}44`,
                    }}
                  >
                    View Weekly Action Plan →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right — Quick actions + motivational */}
        <div>
          <SectionLabel>Quick Actions</SectionLabel>
          <div style={{ background: B.white, border: `1px solid ${B.border}`, borderRadius: 18, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <QuickBtn icon="+" label="New Cancellation Request" accent={B.blue} onClick={() => setPage('new-evaluation')} />
            <QuickBtn icon="✦" label="Ask CRIS a Question" accent="#7c3aed" onClick={() => setPage('ai-chat')} />
            <QuickBtn icon="⚠" label="At-Risk Clients" accent={B.red} onClick={() => setPage('at-risk')} />
            <QuickBtn icon="🔍" label="Account Audit" accent={B.blueMid} onClick={() => setPage('account-audit')} />
            <QuickBtn icon="↑" label="Monthly Report" accent={B.green} onClick={() => setPage('monthly-report')} />
          </div>

          {/* Mascot card */}
          <div style={{
            marginTop: 16, borderRadius: 18, padding: '20px 16px 16px', textAlign: 'center',
            background: `linear-gradient(160deg, ${B.blueLight}, ${B.greenLight})`,
            border: `1px solid ${B.border}`,
          }}>
            <img src="/mascot-flex.png" alt="" style={{ width: 80, margin: '0 auto 10px', display: 'block', objectFit: 'contain' }} />
            <p style={{ fontSize: 13, color: B.blue, fontWeight: 700, margin: 0, fontStyle: 'italic' }}>
              "Cleaning spaces. Creating happy faces."
            </p>
            <p style={{ fontSize: 12, color: B.muted, marginTop: 6, marginBottom: 0 }}>— BA House Cleaning</p>
          </div>

          {/* Save rate spotlight */}
          {saveRate != null && (
            <div style={{
              marginTop: 16, borderRadius: 18, padding: '18px 20px',
              background: saveRate >= 70 ? B.greenLight : B.amberLight,
              border: `1px solid ${saveRate >= 70 ? '#bbf7d0' : '#fde68a'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: saveRate >= 70 ? B.green : B.amber, marginBottom: 4 }}>
                Save Rate — This Month
              </div>
              <div style={{ fontSize: 38, fontWeight: 900, color: saveRate >= 70 ? B.green : B.amber, lineHeight: 1 }}>
                {saveRate}%
              </div>
              <div style={{ fontSize: 12, color: B.muted, marginTop: 6 }}>
                {stats.saved} saved of {stats.total_evaluations} evaluated
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @media (max-width: 800px) {
          .dash-two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
