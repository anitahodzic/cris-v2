import React, { useState, useRef } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

async function lookupClient(name) {
  if (!name || name.length < 2) return [];
  try {
    const res = await fetch(`${BASE}/api/client-lookup?q=${encodeURIComponent(name)}`);
    return await res.json();
  } catch { return []; }
}

function StatusBadge({ status, reason }) {
  const map = {
    'On Track':        { bg: '#f0fdf4', border: '#86efac', text: '#15803d', icon: '✓' },
    'Needs Attention': { bg: '#fefce8', border: '#fde047', text: '#854d0e', icon: '⚠' },
    'Urgent':          { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', icon: '!' },
  };
  const s = map[status] || map['Needs Attention'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 8,
      background: s.bg, border: `1px solid ${s.border}`, color: s.text,
      fontSize: 13, fontWeight: 600,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', background: s.text, color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, flexShrink: 0,
      }}>{s.icon}</span>
      {status}
      {reason && <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.75 }}>— {reason}</span>}
    </span>
  );
}

function SignalCard({ type, headline, detail }) {
  const borders = { time: '#06b6d4', quality: '#8b5cf6', feedback: '#14b8a6', tech: '#f59e0b' };
  const labels  = { time: 'Time', quality: 'Quality', feedback: 'Client Feedback', tech: 'Technician' };
  const colors  = { time: '#0891b2', quality: '#7c3aed', feedback: '#0d9488', tech: '#d97706' };
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--border)',
      borderLeft: `4px solid ${borders[type]}`, borderRadius: 8,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors[type], marginBottom: 6 }}>
        {labels[type]}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.3, marginBottom: headline && detail ? 4 : 0 }}>
        {headline}
      </div>
      {detail && <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{detail}</div>}
    </div>
  );
}

function Pill({ label, value }) {
  if (!value) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'var(--pill-bg)', border: '1px solid var(--border)',
      borderRadius: 20, padding: '2px 10px', fontSize: 12, color: 'var(--fg-muted)',
    }}>
      {label && <span style={{ opacity: 0.6 }}>{label}</span>}
      <strong style={{ color: 'var(--fg)', fontWeight: 600 }}>{value}</strong>
    </span>
  );
}

export default function AccountAudit() {
  const [query, setQuery]       = useState('');
  const [suggs, setSuggs]       = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [driveData, setDriveData] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null);
  const timer = useRef(null);

  const handleChange = (val) => {
    setQuery(val);
    setResult(null);
    setDriveData(null);
    setError('');
    clearTimeout(timer.current);
    if (val.trim().length < 2) { setSuggs([]); setShowSugg(false); return; }
    timer.current = setTimeout(async () => {
      const r = await lookupClient(val.trim());
      setSuggs(r);
      setShowSugg(r.length > 0);
    }, 350);
  };

  const pick = (c) => {
    setQuery(c.name);
    setDriveData(c);
    setSuggs([]);
    setShowSugg(false);
  };

  const runAudit = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${BASE}/api/account-audit/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: query.trim(), drive_data: driveData || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Audit failed');
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { setShowSugg(false); runAudit(); }
    if (e.key === 'Escape') setShowSugg(false);
  };

  const { audit, profile, cancellation, client_name } = result || {};

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
      <style>{`
        :root { --card-bg: #ffffff; --border: #e5e7eb; --fg: #111827; --fg-muted: #6b7280; --pill-bg: #f3f4f6; --sugg-hover: #eff6ff; }
        @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
          --card-bg: #1f2937; --border: #374151; --fg: #f9fafb; --fg-muted: #9ca3af; --pill-bg: #374151; --sugg-hover: #1e3a5f;
        }}
        :root[data-theme="dark"] { --card-bg: #1f2937; --border: #374151; --fg: #f9fafb; --fg-muted: #9ca3af; --pill-bg: #374151; --sugg-hover: #1e3a5f; }
        .audit-btn:hover:not(:disabled) { background: #1d4ed8 !important; }
        .sugg-row:hover { background: var(--sugg-hover); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        .skeleton { animation: pulse 1.5s ease-in-out infinite; background: var(--pill-bg); border-radius: 6px; }
      `}</style>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Customer Account Audit</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4, marginBottom: 0 }}>
          AI-powered account review from MaidCentral data — time, quality, and service signals in seconds.
        </p>
      </div>

      {/* Search row */}
      <div style={{ marginBottom: 32 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 6 }}>
          Client Name
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              value={query}
              onChange={e => handleChange(e.target.value)}
              onKeyDown={handleKey}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              placeholder="Type to search clients…"
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '10px 12px', fontSize: 14,
                background: 'var(--card-bg)', color: 'var(--fg)',
                outline: 'none',
              }}
              autoComplete="off"
            />
            {showSugg && suggs.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                background: 'var(--card-bg)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 50, maxHeight: 200, overflowY: 'auto',
              }}>
                {suggs.map((s, i) => (
                  <button key={i} className="sugg-row" onMouseDown={() => pick(s)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', textAlign: 'left', padding: '9px 12px',
                    border: 'none', background: 'none', cursor: 'pointer',
                    borderBottom: i < suggs.length - 1 ? '1px solid var(--border)' : 'none',
                    color: 'var(--fg)',
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                      {s.frequency}{s.base_fee ? ` · $${s.base_fee}/visit` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="audit-btn"
            onClick={runAudit}
            disabled={loading || !query.trim()}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !query.trim() ? 0.5 : 1,
              whiteSpace: 'nowrap', transition: 'background 0.15s',
            }}
          >
            {loading ? 'Running…' : '⊙ Run Audit'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '12px 16px', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ height: 28, width: 200 }} />
          <div className="skeleton" style={{ height: 16, width: '100%' }} />
          <div className="skeleton" style={{ height: 16, width: '80%' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
          </div>
        </div>
      )}

      {result && audit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Client header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', margin: '0 0 8px' }}>{client_name}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {profile?.address && <Pill label="📍" value={profile.address} />}
                {profile?.phone && <Pill label="📞" value={profile.phone} />}
                {profile?.frequency && <Pill value={profile.frequency} />}
                {profile?.base_fee && <Pill label="$" value={`${profile.base_fee}/visit`} />}
                {profile?.customer_start && <Pill label="Since" value={profile.customer_start} />}
                {profile?.completed_jobs && <Pill label="Jobs" value={profile.completed_jobs} />}
                {profile?.total_revenue && <Pill label="Revenue" value={`$${Number(profile.total_revenue).toLocaleString()}`} />}
                {profile?.avg_scorecard && <Pill label="Avg Score" value={profile.avg_scorecard} />}
                {profile?.last_job && <Pill label="Last Job" value={profile.last_job} />}
              </div>
              {cancellation && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
                  ⚠ Previously cancelled{cancellation.date ? ` — ${cancellation.date}` : ''}
                  {cancellation.reason ? ` · ${cancellation.reason}` : ''}
                </div>
              )}
            </div>
            <StatusBadge status={audit.status} reason={audit.status_reason} />
          </div>

          {/* Summary */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '14px 16px' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#1e3a5f', lineHeight: 1.65 }}>{audit.summary}</p>
            {audit.review_window && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>{audit.review_window}</p>
            )}
          </div>

          {/* Signal grid */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 10 }}>Key Signals</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {['time','quality','feedback','tech'].map(type => {
                const sig = audit.signals?.[type];
                if (!sig) return null;
                return <SignalCard key={type} type={type} headline={sig.headline} detail={sig.detail} />;
              })}
            </div>
          </div>

          {/* Recommendation + Next step */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {audit.recommendation && (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 8 }}>Recommendation</div>
                <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.4 }}>
                  {audit.recommendation.action}
                </p>
                {audit.recommendation.why && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
                    <strong style={{ color: 'var(--fg)' }}>Why: </strong>{audit.recommendation.why}
                    {audit.recommendation.evidence_count && (
                      <span style={{ color: 'var(--fg-muted)', marginLeft: 4 }}>({audit.recommendation.evidence_count})</span>
                    )}
                  </p>
                )}
              </div>
            )}
            {audit.next_step && (
              <div style={{ background: 'var(--pill-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 8 }}>Next Step</div>
                <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--fg)', lineHeight: 1.4 }}>{audit.next_step.action}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {audit.next_step.owner && <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Owner: <strong style={{ color: 'var(--fg)' }}>{audit.next_step.owner}</strong></div>}
                  {audit.next_step.due && <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Due: <strong style={{ color: 'var(--fg)' }}>{audit.next_step.due}</strong></div>}
                  {audit.next_step.review_point && <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Review: <strong style={{ color: 'var(--fg)' }}>{audit.next_step.review_point}</strong></div>}
                </div>
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, color: 'var(--fg-muted)', textAlign: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            Audit generated from MaidCentral Drive export · Aggregate data only · Per-visit detail not available
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--fg-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>⊙</div>
          <p style={{ fontWeight: 600, color: 'var(--fg)', margin: '0 0 4px' }}>Search for a client and run an audit</p>
          <p style={{ fontSize: 13, margin: 0 }}>CRIS pulls MaidCentral data automatically — no copy-paste needed</p>
        </div>
      )}
    </div>
  );
}
