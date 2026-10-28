import React, { useState, useRef } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

async function lookupClient(name) {
  if (!name || name.length < 2) return [];
  try {
    const res = await fetch(`${BASE}/api/client-lookup?q=${encodeURIComponent(name)}`);
    return await res.json();
  } catch { return []; }
}

const AUDIT_REASONS = [
  { id: 'ct_too_long',       label: 'CT says it takes too long' },
  { id: 'client_complained', label: 'Client complained' },
  { id: 'rate_review',       label: 'Rate review' },
  { id: 'churn_risk',        label: 'Churn risk' },
  { id: 'new_ct',            label: 'New CT taking over' },
  { id: 'other',             label: 'Other' },
];

function ScoreStars({ score }) {
  if (score == null) return <span style={{ color: '#9ca3af' }}>—</span>;
  const n = parseFloat(score);
  const color = n >= 3.5 ? '#16a34a' : n >= 2.5 ? '#ca8a04' : '#dc2626';
  return <span style={{ color, fontWeight: 700 }}>{n.toFixed(1)}★</span>;
}

function VsAllowed({ pct }) {
  if (pct == null) return <span style={{ color: '#9ca3af' }}>—</span>;
  const color = Math.abs(pct) <= 5 ? '#16a34a' : pct > 0 ? '#dc2626' : '#ca8a04';
  const sign = pct > 0 ? '+' : '';
  return <span style={{ color, fontWeight: 600 }}>{sign}{pct}%</span>;
}

function Efficiency({ pct }) {
  if (pct == null) return <span style={{ color: '#9ca3af' }}>—</span>;
  const color = pct >= 95 ? '#16a34a' : pct >= 85 ? '#ca8a04' : '#dc2626';
  return <span style={{ color, fontWeight: 600 }}>{pct}%</span>;
}

export default function AccountAudit() {
  const [query, setQuery]       = useState('');
  const [suggs, setSuggs]       = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [driveData, setDriveData] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null);
  const [reasons, setReasons]   = useState([]);
  const [aiAudit, setAiAudit]   = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const timer = useRef(null);

  const toggleReason = (id) =>
    setReasons(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

  const handleChange = (val) => {
    setQuery(val);
    setResult(null);
    setDriveData(null);
    setError('');
    setAiAudit(null);
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
    setLoading(true); setError(''); setResult(null); setAiAudit(null);
    try {
      const res = await fetch(`${BASE}/api/client-tech-history?name=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Audit failed');
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runAiAudit = async () => {
    if (!query.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch(`${BASE}/api/account-audit/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: query.trim(),
          drive_data: driveData || null,
          audit_reasons: reasons,
          tech_history: result || null,  // pass full dispatch history to AI
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI audit failed');
      setAiAudit(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { setShowSugg(false); runAudit(); }
    if (e.key === 'Escape') setShowSugg(false);
  };

  const p = result?.profile || driveData;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 16px' }}>
      <style>{`
        :root { --card-bg: #ffffff; --border: #e5e7eb; --fg: #111827; --fg-muted: #6b7280; --pill-bg: #f3f4f6; }
        @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
          --card-bg: #1f2937; --border: #374151; --fg: #f9fafb; --fg-muted: #9ca3af; --pill-bg: #374151;
        }}
        :root[data-theme="dark"] { --card-bg: #1f2937; --border: #374151; --fg: #f9fafb; --fg-muted: #9ca3af; --pill-bg: #374151; }
        .sugg-row:hover { background: #eff6ff; }
        .run-btn:hover:not(:disabled) { background: #1d4ed8 !important; }
        .ai-btn:hover:not(:disabled) { background: #5b21b6 !important; }
        .reason-chip:hover { border-color: #93c5fd !important; }
        .audit-table { width: 100%; border-collapse: collapse; }
        .audit-table th { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-muted); text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--border); }
        .audit-table td { font-size: 13px; padding: 10px 12px; border-bottom: 1px solid var(--border); color: var(--fg); vertical-align: middle; }
        .audit-table tr:last-child td { border-bottom: none; }
        .audit-table tr:hover td { background: #f9fafb; }
        .visit-row-new td { background: rgba(59,130,246,0.05); }
        .first-visit-badge { display: inline-block; font-size: 10px; font-weight: 700; background: #fef3c7; color: #92400e; border-radius: 4px; padding: 1px 5px; margin-left: 5px; }
        .section-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
        .section-head { padding: 12px 16px 10px; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 700; color: var(--fg); }
        .kv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0; }
        .kv-cell { padding: 11px 16px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .kv-cell:last-child { border-right: none; }
        .kv-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--fg-muted); margin-bottom: 3px; }
        .kv-val { font-size: 15px; font-weight: 800; color: var(--fg); }
        .kv-sub { font-size: 11px; color: var(--fg-muted); margin-top: 1px; }
        .risk-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
        .risk-low    { background: #f0fdf4; color: #166534; }
        .risk-medium { background: #fffbeb; color: #92400e; }
        .risk-high   { background: #fef2f2; color: #991b1b; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--fg)', margin: '0 0 4px' }}>Customer Account Audit</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
          Is it the house, the CT, or the price? Time by technician, scorecard, and service signals — with a recommendation.
        </p>
      </div>

      {/* Input card */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 20px 18px', marginBottom: 24 }}>
        {/* Why running this */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 8 }}>
            Why are you running this? (pick all that apply)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {AUDIT_REASONS.map(r => {
              const active = reasons.includes(r.id);
              return (
                <button key={r.id} className="reason-chip" onClick={() => toggleReason(r.id)} style={{
                  padding: '5px 13px', borderRadius: 20,
                  border: `1.5px solid ${active ? '#3b82f6' : 'var(--border)'}`,
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? '#1d4ed8' : 'var(--fg-muted)',
                  fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
                  transition: 'all 0.12s',
                }}>
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Client search */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 6 }}>
          Client
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              value={query}
              onChange={e => handleChange(e.target.value)}
              onKeyDown={handleKey}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              placeholder="Type client name…"
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1.5px solid var(--border)', borderRadius: 8,
                padding: '9px 12px', fontSize: 14,
                background: 'var(--card-bg)', color: 'var(--fg)', outline: 'none',
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
          <button className="run-btn" onClick={runAudit} disabled={loading || !query.trim()} style={{
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !query.trim() ? 0.55 : 1, whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}>
            {loading ? 'Loading…' : 'Run audit'}
          </button>
          {result && (
            <button className="ai-btn" onClick={runAiAudit} disabled={aiLoading} style={{
              padding: '9px 16px', borderRadius: 8, border: 'none',
              background: '#6d28d9', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: aiLoading ? 'not-allowed' : 'pointer',
              opacity: aiLoading ? 0.55 : 1, whiteSpace: 'nowrap',
              transition: 'background 0.15s',
            }}>
              {aiLoading ? '✦ Thinking…' : '✦ AI Deep Dive'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '12px 16px', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-muted)' }}>
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>⊙</div>
          <p style={{ margin: 0, fontSize: 14 }}>Loading visit history…</p>
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Client header — matches Scheduling Assistant style */}
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--fg)', margin: '0 0 4px' }}>{result.client_name}</h2>
            <div style={{ fontSize: 13, color: '#2563eb', lineHeight: 1.6 }}>
              {[
                p?.area,
                p?.frequency || driveData?.frequency,
                p?.service_type || driveData?.scope,
                p?.default_team ? `default team ${p.default_team}` : null,
                result.total_visits ? `${result.total_visits} completed visits` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>

          {/* Recommendation box */}
          {result.recommendations?.length > 0 && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0369a1', marginBottom: 8 }}>
                Recommendation
              </div>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {result.recommendations.map((rec, i) => (
                  <li key={i} style={{ fontSize: 14, color: '#0c4a6e', lineHeight: 1.55 }}>
                    <strong style={{ fontWeight: 700 }}>{rec.split('.')[0]}.</strong>
                    {rec.includes('.') ? ' ' + rec.split('.').slice(1).join('.').trim() : ''}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Time by Technician table */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Time by technician</div>
            </div>
            {result.techs?.length > 0 ? (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>CT</th>
                        <th style={{ textAlign: 'center' }}>Visits</th>
                        {result.techs.some(t => t.has_hours) && (
                          <>
                            <th style={{ textAlign: 'center' }}>vs allowed</th>
                            <th style={{ textAlign: 'center' }}>Their overall efficiency</th>
                          </>
                        )}
                        <th style={{ textAlign: 'center' }}>Client rating</th>
                        <th>Last</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.techs.map((t, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{t.tech}</td>
                          <td style={{ textAlign: 'center' }}>{t.visits}</td>
                          {result.techs.some(x => x.has_hours) && (
                            <>
                              <td style={{ textAlign: 'center' }}><VsAllowed pct={t.pct_vs_allowed} /></td>
                              <td style={{ textAlign: 'center' }}><Efficiency pct={t.efficiency} /></td>
                            </>
                          )}
                          <td style={{ textAlign: 'center' }}><ScoreStars score={t.avg_scorecard} /></td>
                          <td style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{t.last_date || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--fg-muted)', borderTop: '1px solid var(--border)' }}>
                  {result.techs.some(t => t.has_hours)
                    ? 'Efficiency = allowed ÷ actual; 100% = on time. A CT over here but fine elsewhere points to scope at this house; over everywhere points at the CT.'
                    : 'Hours vs allowed not available — dispatch board does not include hour data for this client.'}
                </div>
              </>
            ) : (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 14 }}>
                <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>📋</div>
                No visit history found in dispatch board for <strong>{result.client_name}</strong>.
                <br /><span style={{ fontSize: 12 }}>This client may not appear in the current dispatch export.</span>
              </div>
            )}
          </div>

          {/* Last N visits table */}
          {result.recent_visits?.length > 0 && (
            <div className="section-card">
              <div className="section-head">Last {result.recent_visits.length} visits</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>CT</th>
                      <th style={{ textAlign: 'center' }}>Actual / allowed</th>
                      <th style={{ textAlign: 'center' }}>Rate</th>
                      <th style={{ textAlign: 'center' }}>Score</th>
                      <th>Start</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.recent_visits.map((v, i) => (
                      <tr key={i} className={i === 0 ? 'visit-row-new' : ''}>
                        <td style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>{v.date}</td>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>
                          {v.tech}
                          {v.is_first_or_second && <span className="first-visit-badge">1st–2nd visit</span>}
                        </td>
                        <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>
                          {v.actual_h != null && v.allowed_h != null
                            ? <><strong>{v.actual_h}h</strong> <span style={{ color: 'var(--fg-muted)' }}>/ {v.allowed_h}h</span></>
                            : v.actual_h != null ? `${v.actual_h}h` : '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 12 }}>
                          {v.rate != null ? `$${v.rate}` : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {v.scorecard != null ? <ScoreStars score={v.scorecard} /> : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{v.start_time || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Money + Satisfaction + Reliability row */}
          {(result.money || result.satisfaction || result.reliability) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>

              {/* Money */}
              {result.money?.current_rate != null && (
                <div className="section-card">
                  <div className="section-head">Money</div>
                  <div className="kv-grid">
                    <div className="kv-cell">
                      <div className="kv-label">Rate</div>
                      <div className="kv-val">${result.money.current_rate}</div>
                      <div className="kv-sub">per visit</div>
                    </div>
                    {result.money.allowed_hours != null && (
                      <div className="kv-cell">
                        <div className="kv-label">Allowed</div>
                        <div className="kv-val">{result.money.allowed_hours}h</div>
                      </div>
                    )}
                    {result.money.dollar_per_allowed_hr != null && (
                      <div className="kv-cell">
                        <div className="kv-label">$/hr at allowed</div>
                        <div className="kv-val" style={{ color: result.money.dollar_per_allowed_hr >= 65 ? '#16a34a' : '#dc2626' }}>
                          ${result.money.dollar_per_allowed_hr}
                        </div>
                      </div>
                    )}
                    {result.money.dollar_per_actual_hr != null && (
                      <div className="kv-cell">
                        <div className="kv-label">$/hr actual</div>
                        <div className="kv-val" style={{ color: result.money.dollar_per_actual_hr >= 65 ? '#16a34a' : result.money.dollar_per_actual_hr >= 55 ? '#ca8a04' : '#dc2626' }}>
                          ${result.money.dollar_per_actual_hr}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Satisfaction */}
              {result.satisfaction && (
                <div className="section-card">
                  <div className="section-head">Satisfaction</div>
                  <div className="kv-grid">
                    <div className="kv-cell">
                      <div className="kv-label">Avg score</div>
                      <div className="kv-val">
                        {result.avg_scorecard != null ? <ScoreStars score={result.avg_scorecard} /> : '—'}
                      </div>
                    </div>
                    <div className="kv-cell">
                      <div className="kv-label">Coverage</div>
                      <div className="kv-val">{result.satisfaction.scorecard_coverage_pct}%</div>
                      <div className="kv-sub">{result.satisfaction.rated_visits} rated</div>
                    </div>
                    {result.satisfaction.low_ratings > 0 && (
                      <div className="kv-cell">
                        <div className="kv-label">Low ratings</div>
                        <div className="kv-val" style={{ color: '#dc2626' }}>{result.satisfaction.low_ratings}</div>
                        <div className="kv-sub">below 3★</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reliability */}
              {result.reliability && (
                <div className="section-card">
                  <div className="section-head">Reliability</div>
                  <div className="kv-grid">
                    <div className="kv-cell">
                      <div className="kv-label">Frequency</div>
                      <div className="kv-val" style={{ fontSize: 13 }}>{result.reliability.frequency || '—'}</div>
                    </div>
                    <div className="kv-cell">
                      <div className="kv-label">Est. skips</div>
                      <div className="kv-val" style={{ color: result.reliability.skipped_estimate > 2 ? '#dc2626' : result.reliability.skipped_estimate > 0 ? '#ca8a04' : '#16a34a' }}>
                        {result.reliability.skipped_estimate}
                      </div>
                      <div className="kv-sub">cycles</div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Client profile pills */}
          {(p || driveData) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                driveData?.address && { label: '📍', value: driveData.address },
                driveData?.phone && { label: '📞', value: driveData.phone },
                (p?.base_fee || driveData?.base_fee) && { label: '$', value: `${p?.base_fee || driveData?.base_fee}/visit` },
                (p?.customer_start || driveData?.customer_start) && { label: 'Since', value: p?.customer_start || driveData?.customer_start },
                (p?.completed_jobs || driveData?.completed_jobs) && { label: 'Jobs', value: p?.completed_jobs || driveData?.completed_jobs },
                driveData?.total_revenue && { label: 'Revenue', value: `$${Number(driveData.total_revenue).toLocaleString()}` },
                result.avg_scorecard && { label: 'Avg Score', value: `${result.avg_scorecard.toFixed(1)}★` },
              ].filter(Boolean).map((pill, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'var(--pill-bg)', border: '1px solid var(--border)',
                  borderRadius: 20, padding: '3px 10px', fontSize: 12, color: 'var(--fg-muted)',
                }}>
                  <span style={{ opacity: 0.6 }}>{pill.label}</span>
                  <strong style={{ color: 'var(--fg)', fontWeight: 600 }}>{pill.value}</strong>
                </span>
              ))}
            </div>
          )}

          {/* AI Deep Dive result */}
          {aiAudit && (
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '18px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7c3aed', marginBottom: 12 }}>
                ✦ AI Deep Dive — {aiAudit.audit?.status}
              </div>
              {aiAudit.audit?.summary && (
                <p style={{ margin: '0 0 12px', fontSize: 14, color: '#1e1b4b', lineHeight: 1.65 }}>{aiAudit.audit.summary}</p>
              )}
              {aiAudit.audit?.signals && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
                  {Object.entries(aiAudit.audit.signals).map(([type, sig]) => sig && (
                    <div key={type} style={{
                      background: '#fff', border: '1px solid #e9d5ff',
                      borderLeft: `4px solid ${type === 'time' ? '#06b6d4' : type === 'quality' ? '#8b5cf6' : type === 'feedback' ? '#14b8a6' : type === 'rate' ? '#10b981' : '#f59e0b'}`,
                      borderRadius: 8, padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7c3aed', marginBottom: 4 }}>
                        {type}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{sig.headline}</div>
                      {sig.detail && <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{sig.detail}</div>}
                    </div>
                  ))}
                </div>
              )}
              {aiAudit.audit?.recommendation?.action && (
                <div style={{ background: '#ede9fe', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#5b21b6', marginBottom: 4 }}>AI Recommendation</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e1b4b' }}>{aiAudit.audit.recommendation.action}</div>
                  {aiAudit.audit.recommendation.why && (
                    <div style={{ fontSize: 12, color: '#6d28d9', marginTop: 4 }}>{aiAudit.audit.recommendation.why}</div>
                  )}
                </div>
              )}
              {aiAudit.audit?.next_step?.action && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#166534', marginBottom: 4 }}>
                    Next Step — {aiAudit.audit.next_step.owner}{aiAudit.audit.next_step.due ? ` · ${aiAudit.audit.next_step.due}` : ''}
                  </div>
                  <div style={{ fontSize: 13, color: '#14532d' }}>{aiAudit.audit.next_step.action}</div>
                </div>
              )}
              {aiAudit.audit?.cancellation_risk && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7c3aed' }}>Cancellation risk:</span>
                  <span className={`risk-badge risk-${(aiAudit.audit.cancellation_risk || '').toLowerCase()}`}>
                    {aiAudit.audit.cancellation_risk}
                  </span>
                  {aiAudit.audit.cancellation_risk_reason && (
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{aiAudit.audit.cancellation_risk_reason}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!result && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--fg-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>⊙</div>
          <p style={{ fontWeight: 700, color: 'var(--fg)', margin: '0 0 4px', fontSize: 15 }}>Search for a client and run an audit</p>
          <p style={{ fontSize: 13, margin: 0 }}>CRIS pulls MaidCentral data automatically — no copy-paste needed</p>
        </div>
      )}
    </div>
  );
}
