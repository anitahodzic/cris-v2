import React, { useState, useEffect, useCallback } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

const TIER_ORDER = { 'High': 0, 'Medium': 1, 'Low': 2, 'Very Low': 3 };
const TIER_STYLE = {
  High:     { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', dot: '#dc2626' },
  Medium:   { bg: '#fffbeb', color: '#d97706', border: '#fde68a', dot: '#d97706' },
  Low:      { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', dot: '#16a34a' },
  'Very Low': { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', dot: '#2563eb' },
};

function TierBadge({ tier, size = 'sm' }) {
  const s = TIER_STYLE[tier] || { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 20, padding: size === 'lg' ? '4px 12px' : '2px 9px',
      fontSize: size === 'lg' ? 13 : 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{tier || 'Unknown'}</span>
  );
}

function TierDot({ tier }) {
  const s = TIER_STYLE[tier] || { dot: '#94a3b8' };
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, display: 'inline-block', flexShrink: 0 }} />;
}

function ScoreBar({ score }) {
  const color = score <= 40 ? '#dc2626' : score <= 65 ? '#d97706' : score <= 80 ? '#16a34a' : '#2563eb';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 99 }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 26, textAlign: 'right' }}>{score}</span>
    </div>
  );
}

function CheckInModal({ client, currentUser, onSave, onClose }) {
  const [form, setForm] = useState({
    contact_method: 'Phone Call',
    notes: '',
    risk_tier_after: client.risk_tier,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.notes.trim()) { setErr('Please add some notes about the check-in.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/check-ins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: client.name,
          staff_name: currentUser?.username || '',
          contact_method: form.contact_method,
          notes: form.notes,
          risk_tier_before: client.risk_tier,
          risk_tier_after: form.risk_tier_after,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      onSave({ ...form, risk_tier_before: client.risk_tier });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const tierChanged = form.risk_tier_after !== client.risk_tier;
  const tierImproved = TIER_ORDER[form.risk_tier_after] > TIER_ORDER[client.risk_tier];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Log Check-In</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{client.name}</p>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Contact Method</label>
            <select value={form.contact_method} onChange={e => set('contact_method')(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#1e293b', background: '#fff' }}>
              {['Phone Call', 'Text Message', 'Email', 'In Person', 'Other'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes')(e.target.value)} rows={4}
              placeholder="What did you discuss? How did the client respond? Any commitments made?"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: '#1e293b', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Updated Risk Tier <span style={{ fontWeight: 400, color: '#94a3b8' }}>(did this check-in change their risk?)</span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['High', 'Medium', 'Low', 'Very Low'].map(t => (
                <button key={t} onClick={() => set('risk_tier_after')(t)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: form.risk_tier_after === t ? `2px solid ${TIER_STYLE[t]?.color}` : '1.5px solid #e2e8f0',
                    background: form.risk_tier_after === t ? TIER_STYLE[t]?.bg : '#fff',
                    color: form.risk_tier_after === t ? TIER_STYLE[t]?.color : '#64748b',
                  }}>
                  {t}
                </button>
              ))}
            </div>
            {tierChanged && (
              <p style={{ fontSize: 12, marginTop: 8, color: tierImproved ? '#16a34a' : '#d97706' }}>
                {tierImproved ? '✓ Risk improved: ' : '⚠ Risk increased: '}
                <strong>{client.risk_tier}</strong> → <strong>{form.risk_tier_after}</strong>
              </p>
            )}
          </div>
          {err && <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{err}</p>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748b', background: '#fff', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving…' : 'Log Check-In'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckInHistory({ client, checkIns }) {
  const mine = checkIns.filter(c => c.Client_Name?.toLowerCase() === client.name.toLowerCase())
    .sort((a, b) => new Date(b.Date) - new Date(a.Date));
  if (!mine.length) return <p style={{ fontSize: 12, color: '#94a3b8', margin: '8px 0 0' }}>No check-ins logged yet.</p>;
  return (
    <div style={{ marginTop: 10 }}>
      {mine.map((ci, i) => {
        const improved = TIER_ORDER[ci.Risk_Tier_After] > TIER_ORDER[ci.Risk_Tier_Before];
        const tierChanged = ci.Risk_Tier_After && ci.Risk_Tier_Before && ci.Risk_Tier_After !== ci.Risk_Tier_Before;
        return (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 2, background: '#e2e8f0', borderRadius: 2, alignSelf: 'stretch', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{ci.Date}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{ci.Contact_Method}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{ci.Staff_Name}</span>
                {tierChanged && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: improved ? '#16a34a' : '#d97706' }}>
                    {ci.Risk_Tier_Before} → {ci.Risk_Tier_After} {improved ? '↑' : '↓'}
                  </span>
                )}
              </div>
              {ci.Notes && <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{ci.Notes}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AtRiskClients({ currentUser }) {
  const [scanData, setScanData] = useState(null);
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('High');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [modalClient, setModalClient] = useState(null);
  const [localCheckIns, setLocalCheckIns] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scan, ci] = await Promise.all([
        fetch(`${BASE}/api/risk-scan`).then(r => r.json()),
        fetch(`${BASE}/api/check-ins`).then(r => r.json()).catch(() => []),
      ]);
      setScanData(scan);
      setCheckIns(Array.isArray(ci) ? ci : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clients = scanData?.clients || [];

  // Build effective tier: last check-in's risk_tier_after overrides the scan tier
  const effectiveTier = (client) => {
    const mine = checkIns.filter(c => c.Client_Name?.toLowerCase() === client.name.toLowerCase())
      .sort((a, b) => new Date(b.Date) - new Date(a.Date));
    const latest = mine.find(c => c.Risk_Tier_After);
    return latest?.Risk_Tier_After || client.risk_tier;
  };

  // Apply effective tiers and check-in counts
  const enriched = clients.map(c => ({
    ...c,
    effective_tier: effectiveTier(c),
    checkin_count: checkIns.filter(ci => ci.Client_Name?.toLowerCase() === c.name.toLowerCase()).length,
    last_checkin: checkIns.filter(ci => ci.Client_Name?.toLowerCase() === c.name.toLowerCase())
      .sort((a, b) => new Date(b.Date) - new Date(a.Date))[0]?.Date || null,
  }));

  const TABS = ['High', 'Medium', 'Low', 'Very Low', 'All'];

  const displayed = enriched.filter(c => {
    if (filter !== 'All' && c.effective_tier !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const countByTier = (tier) => enriched.filter(c => c.effective_tier === tier).length;

  const handleCheckInSaved = (client, saved) => {
    setLocalCheckIns(prev => ({ ...prev, [client.name]: true }));
    setModalClient(null);
    load(); // reload to get new data
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Scanning client risk…</div>;
  if (error) return <div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0 }}>Proactive Risk Tracker</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>
          Track check-ins with at-risk clients and measure tier movement over time.
          {scanData?.excluded_in_pipeline ? ` (${scanData.excluded_in_pipeline} clients already in evaluation pipeline excluded)` : ''}
        </p>
        {scanData?.scan_date && (
          <p style={{ color: '#94a3b8', margin: '3px 0 0', fontSize: 12 }}>
            Last scanned: {new Date(scanData.scan_date).toLocaleString()}
          </p>
        )}
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
        {['High', 'Medium', 'Low', 'Very Low'].map(tier => {
          const s = TIER_STYLE[tier];
          const count = countByTier(tier);
          const withCheckIn = enriched.filter(c => c.effective_tier === tier && c.checkin_count > 0).length;
          return (
            <div key={tier} onClick={() => setFilter(tier)} style={{
              background: filter === tier ? s.bg : '#fff',
              border: `1.5px solid ${filter === tier ? s.color + '80' : '#e2e8f0'}`,
              borderRadius: 14, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <TierDot tier={tier} />
                <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{tier} Risk</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{count}</div>
              {withCheckIn > 0 && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{withCheckIn} contacted</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
            style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, color: '#1e293b', outline: 'none', width: 180 }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: filter === t ? '#0f172a' : '#f1f5f9', color: filter === t ? '#fff' : '#475569' }}>
              {t}{t !== 'All' ? ` (${countByTier(t)})` : ` (${enriched.length})`}
            </button>
          ))}
        </div>
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', cursor: 'pointer' }}>
          ↻ Refresh
        </button>
      </div>

      {/* Client list */}
      {displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
          <p style={{ fontSize: 14 }}>{search ? 'No matching clients' : `No ${filter === 'All' ? '' : filter + ' risk '}clients found`}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayed.map(client => {
            const isExpanded = expanded === client.name;
            const tier = client.effective_tier;
            const s = TIER_STYLE[tier] || TIER_STYLE.Medium;
            const scanTierChanged = client.effective_tier !== client.risk_tier;
            const improved = TIER_ORDER[client.effective_tier] > TIER_ORDER[client.risk_tier];

            return (
              <div key={client.name} style={{ background: '#fff', border: `1px solid ${isExpanded ? s.color + '60' : '#e2e8f0'}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                <div style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start' }}
                  onClick={() => setExpanded(isExpanded ? null : client.name)}>
                  {/* Left: tier dot + name */}
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{client.name}</span>
                      <TierBadge tier={tier} />
                      {scanTierChanged && (
                        <span style={{ fontSize: 11, color: improved ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                          {improved ? '↑ improved' : '↓ worsened'} from {client.risk_tier}
                        </span>
                      )}
                      {client.checkin_count > 0 && (
                        <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 20, padding: '1px 8px' }}>
                          {client.checkin_count} check-in{client.checkin_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                      {client.frequency && <span>{client.frequency}</span>}
                      {client.last_job && <span>Last job: {client.last_job}</span>}
                      {client.last_checkin && <span>Last contact: {client.last_checkin}</span>}
                      {client.top_signal && <span style={{ color: '#d97706' }}>⚠ {client.top_signal}</span>}
                    </div>
                    <ScoreBar score={client.risk_score} />
                  </div>
                  {/* Right: action */}
                  <button
                    onClick={e => { e.stopPropagation(); setModalClient(client); }}
                    style={{ padding: '6px 14px', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    + Check-In
                  </button>
                </div>

                {/* Expanded: check-in history */}
                {isExpanded && (
                  <div style={{ padding: '0 18px 16px 42px', borderTop: '1px solid #f8fafc' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginTop: 12, marginBottom: 6 }}>Check-In History</div>
                    <CheckInHistory client={client} checkIns={checkIns} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Check-in modal */}
      {modalClient && (
        <CheckInModal
          client={modalClient}
          currentUser={currentUser}
          onSave={(saved) => handleCheckInSaved(modalClient, saved)}
          onClose={() => setModalClient(null)}
        />
      )}
    </div>
  );
}
