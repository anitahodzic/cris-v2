import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Spinner, Alert, LoadingRing } from '../components/UI';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEARS = [2024, 2025, 2026, 2027];

function fmt(n) { return n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${Number(n || 0).toFixed(0)}`; }

function Tile({ label, value, sub, accent = '#1d4ed8', light = '#eff6ff', icon }) {
  return (
    <div style={{ background: light, borderRadius: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {icon && <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>}
      <div style={{ fontSize: 32, fontWeight: 800, color: accent, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent, opacity: 0.85 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ProgressRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const COLORS = { Saved: '#16a34a', Cancelled: '#dc2626', Pending: '#d97706', 'Follow-Up Needed': '#7c3aed', Escalated: '#ea580c' };
  const bar = COLORS[label] || color || '#94a3b8';
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{label}</span>
        <span style={{ fontSize: 13, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{count} <span style={{ opacity: 0.6 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: bar, borderRadius: 99, width: `${pct}%`, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function Section({ title, children, action }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        {action}
      </div>
      <div style={{ padding: '18px 22px' }}>{children}</div>
    </div>
  );
}

export default function MonthlyReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getMonthlyReport(month, year)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [month, year]);

  const saveRate = data?.save_rate || 0;
  const rateColor = saveRate >= 60 ? '#16a34a' : saveRate >= 40 ? '#d97706' : '#dc2626';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0 }}>Monthly Report</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>Performance summary for {MONTH_NAMES[month - 1]} {year}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            style={{ padding: '8px 12px', fontSize: 14, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#1e293b', cursor: 'pointer' }}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ padding: '8px 12px', fontSize: 14, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#1e293b', cursor: 'pointer' }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {loading ? (
        <LoadingRing label="Building monthly report…" />
      ) : !data ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* KPI tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Tile icon="📋" label="Total Cancellations" value={data.total_evaluations || 0} accent="#1d4ed8" light="#eff6ff" />
            <Tile icon="✅" label="Clients Saved" value={data.by_outcome?.Saved || 0} accent="#16a34a" light="#f0fdf4" />
            <Tile icon="❌" label="Cancelled" value={data.by_outcome?.Cancelled || 0} accent="#dc2626" light="#fef2f2" />
            <Tile icon="📈" label="Save Rate" value={`${saveRate}%`} accent={rateColor} light={saveRate >= 60 ? '#f0fdf4' : saveRate >= 40 ? '#fffbeb' : '#fef2f2'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Tile icon="💰" label="Revenue Saved" value={fmt(data.revenue_saved)} accent="#0891b2" light="#ecfeff"
              sub={data.by_outcome?.Saved ? `across ${data.by_outcome.Saved} saves` : null} />
            <Tile icon="⏳" label="Pending / Follow-Up"
              value={(data.by_outcome?.Pending || 0) + (data.by_outcome?.['Follow-Up Needed'] || 0)}
              accent="#7c3aed" light="#f5f3ff" sub="need follow-up action" />
          </div>

          {/* Outcomes */}
          <Section title="Outcome Breakdown">
            {Object.keys(data.by_outcome || {}).length === 0 ? (
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No outcomes recorded this month.</p>
            ) : (
              Object.entries(data.by_outcome).map(([outcome, count]) => (
                <ProgressRow key={outcome} label={outcome} count={count} total={data.total_evaluations} />
              ))
            )}
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {/* Program performance */}
            <Section title="Programs Offered">
              {Object.keys(data.by_program || {}).length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No programs offered this month.</p>
              ) : (
                <div>
                  {Object.entries(data.by_program).sort(([, a], [, b]) => b - a).map(([prog, count]) => (
                    <div key={prog} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f8fafc' }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>{prog}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', background: '#f1f5f9', borderRadius: 20, padding: '2px 10px' }}>{count}×</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Staff performance */}
            <Section title="Staff Performance">
              {Object.keys(data.by_staff || {}).length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No staff data this month.</p>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px 48px 56px', gap: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9', marginBottom: 4 }}>
                    {['Staff', 'Total', 'Saved', 'Rate'].map(h => (
                      <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: h === 'Staff' ? 'left' : 'center' }}>{h}</span>
                    ))}
                  </div>
                  {Object.entries(data.by_staff).sort(([, a], [, b]) => b.total - a.total).map(([name, s]) => {
                    const rate = s.total > 0 ? Math.round((s.saved / s.total) * 100) : 0;
                    const rateCol = rate >= 60 ? '#16a34a' : rate >= 40 ? '#d97706' : '#dc2626';
                    return (
                      <div key={name} style={{ display: 'grid', gridTemplateColumns: '1fr 48px 48px 56px', gap: 8, padding: '9px 0', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{name}</span>
                        <span style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>{s.total}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#16a34a', textAlign: 'center' }}>{s.saved}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: rateCol, textAlign: 'center', background: `${rateCol}18`, borderRadius: 20, padding: '2px 6px' }}>{rate}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
