import React, { useState, useEffect, useCallback } from 'react';
import { LoadingRing } from '../components/UI';

const BASE = process.env.REACT_APP_API_URL || '';

const TIER_ORDER = { 'High': 0, 'Medium': 1, 'Low': 2, 'Very Low': 3 };

const RISK_SCAN_STEPS = [
  [600,  12, 'Loading active clients from Drive…'],
  [1200, 28, 'Loading scorecard data…'],
  [2000, 45, 'Loading cancelled client history…'],
  [2800, 60, 'Checking evaluation pipeline…'],
  [3600, 74, 'Scoring clients by risk signals…'],
  [4400, 86, 'Ranking by risk level…'],
  [5200, 94, 'Almost done…'],
];

const TIER_STYLE = {
  High:       { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', dot: '#dc2626' },
  Medium:     { bg: '#fffbeb', color: '#d97706', border: '#fde68a', dot: '#d97706' },
  Low:        { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', dot: '#16a34a' },
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
  const color = score >= 60 ? '#dc2626' : score >= 40 ? '#d97706' : score >= 20 ? '#16a34a' : '#2563eb';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 99 }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 26, textAlign: 'right' }}>{score}</span>
    </div>
  );
}

// ─── Care Focus Modal ─────────────────────────────────────────────────────────
function CareFocusModal({ client, currentUser, existing, onSave, onClose }) {
  const [scheduledDate, setScheduledDate] = useState(existing?.scheduled_date || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      if (existing) {
        // Update existing record
        const res = await fetch(`${BASE}/api/care-focus/${encodeURIComponent(client.name)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_date: scheduledDate, notes }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Update failed');
      } else {
        // Create new record
        const res = await fetch(`${BASE}/api/care-focus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: client.name,
            risk_score: client.risk_score,
            tier: client.risk_tier,
            risk_reason: (client.signals || []).join(', '),
            scheduled_date: scheduledDate,
            notes,
            created_by: currentUser?.username || 'CRIS',
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Save failed');
      }
      onSave();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f0fdf4' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>🌟 Schedule Care Focus</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{client.name} · Score {client.risk_score}</p>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
            A Care Focus means the cleaning team gives this client extra attention on their next visit — a check-in, a personal note, or a small gesture to show they're valued.
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Scheduled Date <span style={{ fontWeight: 400, color: '#94a3b8' }}>(next cleaning date)</span>
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#1e293b', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Any specific instructions for the team? Anything to mention to the client?"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: '#1e293b', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          {err && <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{err}</p>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748b', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#16a34a,#22c55e)', cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving…' : existing ? 'Update Care Focus' : '✓ Schedule Care Focus'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mark Care Focus Complete Modal ──────────────────────────────────────────
function CareFocusCompleteModal({ client, onSave, onClose }) {
  const [completedDate, setCompletedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/care-focus/${encodeURIComponent(client.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true, completed_date: completedDate, notes }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Update failed');
      onSave();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f0fdf4' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>✓ Mark Care Focus Complete</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{client.name}</p>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Completed Date</label>
            <input type="date" value={completedDate} onChange={e => setCompletedDate(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#1e293b', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>How did it go? (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Client reaction, team notes, follow-up needed?"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: '#1e293b', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          {err && <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{err}</p>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748b', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#16a34a,#22c55e)', cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving…' : '✓ Mark Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── L2 Ticket Modal ─────────────────────────────────────────────────────────
function L2TicketModal({ client, currentUser, onSave, onClose }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const mcUrl = `https://app.maidcentral.com/`;

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/l2-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: client.name,
          risk_score: client.risk_score,
          tier: client.effective_tier || client.risk_tier,
          risk_reason: client.signals?.[0] || client.top_signal || '',
          created_by: currentUser?.username || 'CRIS',
          mc_ticket_id: '',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      onSave();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const tier = client.effective_tier || client.risk_tier;
  const s = TIER_STYLE[tier] || TIER_STYLE.Medium;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#fff7ed' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>📞 Log L2 Phone Call</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            {client.name} · <span style={{ fontWeight: 700, color: s.color }}>{tier} Risk</span> · Score {client.risk_score}
          </p>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {client.signals?.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Risk Signals</div>
              {client.signals.map((sig, i) => (
                <div key={i} style={{ fontSize: 13, color: '#78350f' }}>⚠ {sig}</div>
              ))}
            </div>
          )}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#0369a1', lineHeight: 1.6 }}>
            <strong>Step 1:</strong> Open MaidCentral and create an L2 ticket for <strong>{client.name}</strong>.<br/>
            <strong>Step 2:</strong> Make the call and log the outcome in MaidCentral.<br/>
            <strong>Step 3:</strong> Click <em>"Log in CRIS"</em> below to record this ticket here.
          </div>
          <a href={mcUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', textAlign: 'center', padding: '10px 20px', background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            → Open MaidCentral
          </a>
          {err && <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{err}</p>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748b', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#d97706,#f59e0b)', cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving…' : '✓ Log in CRIS'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Check-In Modal ───────────────────────────────────────────────────────────
function CheckInModal({ client, currentUser, onSave, onClose }) {
  const [form, setForm] = useState({ contact_method: 'Phone Call', notes: '', risk_tier_after: client.risk_tier });
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
      onSave();
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
              Updated Risk Tier <span style={{ fontWeight: 400, color: '#94a3b8' }}>(did this change their risk?)</span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['High', 'Medium', 'Low', 'Very Low'].map(t => (
                <button key={t} onClick={() => set('risk_tier_after')(t)}
                  style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: form.risk_tier_after === t ? `2px solid ${TIER_STYLE[t]?.color}` : '1.5px solid #e2e8f0',
                    background: form.risk_tier_after === t ? TIER_STYLE[t]?.bg : '#fff',
                    color: form.risk_tier_after === t ? TIER_STYLE[t]?.color : '#64748b' }}>
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
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748b', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving…' : 'Log Check-In'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Weekly Action Plan Row ───────────────────────────────────────────────────
function ActionRow({ client, rank, track, hasL2, cfRecord, onL2Click, onCFClick, onCFComplete, onCheckIn }) {
  const tier = client.effective_tier || client.risk_tier;
  const s = TIER_STYLE[tier] || TIER_STYLE.Medium;
  const isL2Track = track === 'l2';
  const trackColor = isL2Track ? '#dc2626' : '#2563eb';
  const trackBg = isL2Track ? '#fef2f2' : '#eff6ff';

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', borderLeft: `4px solid ${trackColor}` }}>
      {/* Rank badge */}
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: trackBg, color: trackColor, fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {rank}
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{client.name}</span>
          <TierBadge tier={tier} />
          <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 20, padding: '1px 8px', border: `1px solid ${s.border}` }}>
            Score {client.risk_score}
          </span>
        </div>
        {client.signals && client.signals.length > 0 && (
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
            {client.signals.join(' · ')}
          </div>
        )}

        {/* Track-specific status */}
        {isL2Track ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📞 L2 Phone Call</span>
            {hasL2 && (
              <span style={{ fontSize: 11, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 20, padding: '1px 8px', fontWeight: 700 }}>
                ✓ Ticket Created
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🌟 Care Focus</span>
            {cfRecord ? (
              cfRecord.completed ? (
                <span style={{ fontSize: 11, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 20, padding: '1px 8px', fontWeight: 700 }}>
                  ✓ Completed {cfRecord.completed_date}
                </span>
              ) : (
                <span style={{ fontSize: 11, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>
                  📅 Scheduled {cfRecord.scheduled_date ? `for ${new Date(cfRecord.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '(no date set)'}
                </span>
              )
            ) : null}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        {isL2Track ? (
          <button
            onClick={onL2Click}
            style={{
              padding: '7px 14px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background: hasL2 ? '#f0fdf4' : 'linear-gradient(135deg,#dc2626,#ef4444)',
              color: hasL2 ? '#16a34a' : '#fff',
              border: hasL2 ? '1px solid #86efac' : 'none',
            }}>
            {hasL2 ? '✓ Logged' : '📞 Log L2'}
          </button>
        ) : (
          cfRecord?.completed ? (
            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, padding: '7px 4px' }}>✓ Done</span>
          ) : cfRecord ? (
            <button onClick={onCFComplete}
              style={{ padding: '7px 14px', border: '1px solid #86efac', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#f0fdf4', color: '#16a34a', whiteSpace: 'nowrap' }}>
              ✓ Mark Done
            </button>
          ) : (
            <button onClick={onCFClick}
              style={{ padding: '7px 14px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', whiteSpace: 'nowrap' }}>
              🌟 Schedule
            </button>
          )
        )}
        <button onClick={onCheckIn}
          style={{ padding: '6px 14px', background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + Note
        </button>
      </div>
    </div>
  );
}

// ─── Full client list row (existing view) ─────────────────────────────────────
function ClientRow({ client, checkIns, onCheckIn, onL2Click, hasL2 }) {
  const [expanded, setExpanded] = useState(false);
  const tier = client.effective_tier;
  const s = TIER_STYLE[tier] || TIER_STYLE.Medium;
  const mine = checkIns.filter(c => c.Client_Name?.toLowerCase() === client.name.toLowerCase())
    .sort((a, b) => new Date(b.Date) - new Date(a.Date));

  return (
    <div style={{ background: '#fff', border: `1px solid ${expanded ? s.color + '60' : '#e2e8f0'}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start' }}
        onClick={() => setExpanded(x => !x)}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 5 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{client.name}</span>
            <TierBadge tier={tier} />
            {client.checkin_count > 0 && (
              <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 20, padding: '1px 8px' }}>
                {client.checkin_count} check-in{client.checkin_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
            {client.frequency && <span>{client.frequency}</span>}
            {client.last_job && <span>Last job: {client.last_job}</span>}
            {client.pending_jobs !== undefined && <span style={{ color: client.pending_jobs === '0' || client.pending_jobs === 0 ? '#dc2626' : '#16a34a' }}>
              {client.pending_jobs === '0' || client.pending_jobs === 0 ? '⚠ No pending jobs' : `${client.pending_jobs} pending`}
            </span>}
          </div>
          {client.signals && client.signals.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {client.signals.map((sig, i) => (
                <span key={i} style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 12, padding: '1px 8px', fontWeight: 600 }}>⚠ {sig}</span>
              ))}
            </div>
          )}
          <ScoreBar score={client.risk_score} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onCheckIn(); }}
            style={{ padding: '6px 14px', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            + Check-In
          </button>
          {(tier === 'High' || tier === 'Medium') && (
            <button onClick={e => { e.stopPropagation(); onL2Click(); }}
              style={{ padding: '6px 14px',
                background: hasL2 ? '#f0fdf4' : 'linear-gradient(135deg,#d97706,#f59e0b)',
                color: hasL2 ? '#16a34a' : '#fff',
                border: hasL2 ? '1px solid #86efac' : 'none',
                borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {hasL2 ? '✓ L2 Created' : '🎫 L2 Ticket'}
            </button>
          )}
        </div>
      </div>
      {expanded && mine.length > 0 && (
        <div style={{ padding: '0 18px 16px 42px', borderTop: '1px solid #f8fafc' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginTop: 12, marginBottom: 8 }}>Check-In History</div>
          {mine.map((ci, i) => {
            const improved = TIER_ORDER[ci.Risk_Tier_After] > TIER_ORDER[ci.Risk_Tier_Before];
            const tierChanged = ci.Risk_Tier_After && ci.Risk_Tier_Before && ci.Risk_Tier_After !== ci.Risk_Tier_Before;
            return (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 2, background: '#e2e8f0', borderRadius: 2, alignSelf: 'stretch', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{ci.Date}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{ci.Contact_Method}</span>
                    {tierChanged && <span style={{ fontSize: 11, fontWeight: 700, color: improved ? '#16a34a' : '#d97706' }}>{ci.Risk_Tier_Before} → {ci.Risk_Tier_After}</span>}
                  </div>
                  {ci.Notes && <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{ci.Notes}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AtRiskClients({ currentUser }) {
  const [scanData, setScanData] = useState(null);
  const [checkIns, setCheckIns] = useState([]);
  const [l2Tickets, setL2Tickets] = useState([]);
  const [cfRecords, setCfRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('weekly'); // 'weekly' | 'all'
  const [filter, setFilter] = useState('High');
  const [search, setSearch] = useState('');

  // Modals
  const [checkInClient, setCheckInClient] = useState(null);
  const [l2Client, setL2Client] = useState(null);
  const [cfClient, setCfClient] = useState(null);
  const [cfCompleteClient, setCfCompleteClient] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scan, ci, l2, cf] = await Promise.all([
        fetch(`${BASE}/api/risk-scan`).then(r => r.json()),
        fetch(`${BASE}/api/check-ins`).then(r => r.json()).catch(() => []),
        fetch(`${BASE}/api/l2-tickets`).then(r => r.json()).catch(() => ({ tickets: [] })),
        fetch(`${BASE}/api/care-focus`).then(r => r.json()).catch(() => ({ records: [] })),
      ]);
      setScanData(scan);
      setCheckIns(Array.isArray(ci) ? ci : []);
      setL2Tickets(l2.tickets || []);
      setCfRecords(cf.records || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clients = scanData?.clients || [];

  const effectiveTier = (client) => {
    const mine = checkIns.filter(c => c.Client_Name?.toLowerCase() === client.name.toLowerCase())
      .sort((a, b) => new Date(b.Date) - new Date(a.Date));
    return mine.find(c => c.Risk_Tier_After)?.Risk_Tier_After || client.risk_tier;
  };

  const enriched = clients
    .map(c => ({
      ...c,
      effective_tier: effectiveTier(c),
      checkin_count: checkIns.filter(ci => ci.Client_Name?.toLowerCase() === c.name.toLowerCase()).length,
    }))
    .sort((a, b) => b.risk_score - a.risk_score); // highest risk first

  const COOLDOWN_DAYS = 90;
  const isWithin90Days = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d)) return false;
    return (Date.now() - d.getTime()) < COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  };

  const hasRecentL2 = (name) => {
    const tickets = l2Tickets.filter(t => t.client_name?.toLowerCase() === name?.toLowerCase());
    return tickets.some(t => isWithin90Days(t.date));
  };
  const hasL2 = (name) => l2Tickets.some(t => t.client_name?.toLowerCase() === name?.toLowerCase());
  const getCfRecord = (name) => {
    const matches = cfRecords.filter(r => r.client_name?.toLowerCase() === name?.toLowerCase());
    return matches.sort((a, b) => new Date(b.week_date) - new Date(a.week_date))[0] || null;
  };
  const hasRecentCf = (name) => {
    const rec = getCfRecord(name);
    if (!rec) return false;
    return isWithin90Days(rec.week_date);
  };

  // Top 25 with cooldown applied — skip clients on 90-day cooldown, fill slots from next in line
  const eligibleForL2 = enriched.filter(c => !hasRecentL2(c.name));
  const eligibleForCf = enriched.filter(c => !hasRecentL2(c.name) && !hasRecentCf(c.name));

  const top10 = eligibleForL2.slice(0, 10);   // → L2 phone calls
  const next15 = eligibleForCf               // → Care Focus (skip anyone already in top10)
    .filter(c => !top10.find(t => t.name === c.name))
    .slice(0, 15);
  const top25 = [...top10, ...next15];

  // Weekly action plan progress
  const l2Done = top10.filter(c => hasL2(c.name)).length;
  const cfDone = next15.filter(c => getCfRecord(c.name)?.completed).length;
  const cfScheduled = next15.filter(c => getCfRecord(c.name) && !getCfRecord(c.name).completed).length;

  const TABS = ['High', 'Medium', 'Low', 'Very Low', 'All'];
  const countByTier = (tier) => enriched.filter(c => c.effective_tier === tier).length;
  const displayed = enriched.filter(c => {
    if (filter !== 'All' && c.effective_tier !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Scanning client risk…</div>
      <LoadingRing steps={RISK_SCAN_STEPS} />
    </div>
  );
  if (error) return <div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0 }}>Proactive Risk Tracker</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>
            Weekly Top 25 action plan — L2 calls for highest risk, Care Focus for the next tier.
            {scanData?.scan_date && <span style={{ color: '#94a3b8' }}> · Last scanned: {new Date(scanData.scan_date).toLocaleString()}</span>}
          </p>
        </div>
        <button onClick={load} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#fff', color: '#374151', cursor: 'pointer' }}>
          ↻ Refresh
        </button>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 1, marginBottom: 24, background: '#f1f5f9', padding: 4, borderRadius: 12, width: 'fit-content' }}>
        {[{ id: 'weekly', label: '📋 Weekly Action Plan' }, { id: 'all', label: '📊 All Clients' }].map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{ padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: view === v.id ? '#fff' : 'transparent',
              color: view === v.id ? '#0f172a' : '#64748b',
              boxShadow: view === v.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── Weekly Action Plan ── */}
      {view === 'weekly' && (
        <>
          {/* Progress summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 28 }}>
            {[
              { label: 'L2 Calls', done: l2Done, total: 10, color: '#dc2626', bg: '#fef2f2', icon: '📞' },
              { label: 'Care Focus Scheduled', done: cfScheduled + cfDone, total: 15, color: '#2563eb', bg: '#eff6ff', icon: '📅' },
              { label: 'Care Focus Complete', done: cfDone, total: 15, color: '#16a34a', bg: '#f0fdf4', icon: '✓' },
            ].map(item => (
              <div key={item.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{item.label}</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: item.color, lineHeight: 1 }}>
                  {item.done}<span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 400 }}>/{item.total}</span>
                </div>
                <div style={{ marginTop: 8, height: 5, background: '#f1f5f9', borderRadius: 99 }}>
                  <div style={{ width: `${(item.done / item.total) * 100}%`, height: '100%', background: item.color, borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Top 10 — L2 Calls */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 4, height: 24, background: '#dc2626', borderRadius: 2, flexShrink: 0 }} />
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Top 10 — L2 Phone Calls</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Highest-risk clients this week. Create an L2 ticket in MaidCentral and make the call.</p>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#dc2626', background: '#fef2f2', borderRadius: 20, padding: '3px 12px', border: '1px solid #fecaca' }}>
                {l2Done}/10 logged
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {top10.map((client, i) => (
                <ActionRow key={client.name} client={client} rank={i + 1} track="l2"
                  hasL2={hasL2(client.name)} cfRecord={null}
                  onL2Click={() => setL2Client(client)}
                  onCFClick={() => {}} onCFComplete={() => {}}
                  onCheckIn={() => setCheckInClient(client)} />
              ))}
            </div>
          </div>

          {/* Next 15 — Care Focus */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 4, height: 24, background: '#2563eb', borderRadius: 2, flexShrink: 0 }} />
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Next 15 — Care Focus</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Schedule a Care Focus on their next cleaning. The team gives extra attention and a personal touch.</p>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#2563eb', background: '#eff6ff', borderRadius: 20, padding: '3px 12px', border: '1px solid #bfdbfe' }}>
                {cfDone}/15 complete
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {next15.map((client, i) => {
                const cfRecord = getCfRecord(client.name);
                return (
                  <ActionRow key={client.name} client={client} rank={i + 11} track="care"
                    hasL2={false} cfRecord={cfRecord}
                    onL2Click={() => {}}
                    onCFClick={() => setCfClient(client)}
                    onCFComplete={() => setCfCompleteClient(client)}
                    onCheckIn={() => setCheckInClient(client)} />
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── All Clients view ── */}
      {view === 'all' && (
        <>
          {/* Tier summary tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
            {['High', 'Medium', 'Low', 'Very Low'].map(tier => {
              const s = TIER_STYLE[tier];
              const count = countByTier(tier);
              return (
                <div key={tier} onClick={() => setFilter(tier)} style={{
                  background: filter === tier ? s.bg : '#fff',
                  border: `1.5px solid ${filter === tier ? s.color + '80' : '#e2e8f0'}`,
                  borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <TierDot tier={tier} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{tier} Risk</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{count}</div>
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
          </div>

          {displayed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
              <p style={{ fontSize: 14 }}>{search ? 'No matching clients' : `No ${filter === 'All' ? '' : filter + ' risk '}clients found`}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayed.map(client => (
                <ClientRow key={client.name} client={client} checkIns={checkIns}
                  hasL2={hasL2(client.name)}
                  onCheckIn={() => setCheckInClient(client)}
                  onL2Click={() => setL2Client(client)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {checkInClient && (
        <CheckInModal client={checkInClient} currentUser={currentUser}
          onSave={() => { setCheckInClient(null); load(); }}
          onClose={() => setCheckInClient(null)} />
      )}
      {l2Client && (
        <L2TicketModal client={l2Client} currentUser={currentUser}
          onSave={() => { setL2Client(null); load(); }}
          onClose={() => setL2Client(null)} />
      )}
      {cfClient && (
        <CareFocusModal client={cfClient} currentUser={currentUser}
          existing={getCfRecord(cfClient.name)}
          onSave={() => { setCfClient(null); load(); }}
          onClose={() => setCfClient(null)} />
      )}
      {cfCompleteClient && (
        <CareFocusCompleteModal client={cfCompleteClient}
          onSave={() => { setCfCompleteClient(null); load(); }}
          onClose={() => setCfCompleteClient(null)} />
      )}
    </div>
  );
}
