import React, { useState, useEffect, useCallback } from 'react';
import { LoadingRing } from '../components/UI';

const BASE = process.env.REACT_APP_API_URL || '';

const TIER_ORDER = { 'High': 0, 'Medium': 1, 'Low': 2, 'Very Low': 3 };

const RISK_SCAN_STEPS = [
  [600,  12, 'Loading active clients from Drive…'],
  [1200, 28, 'Loading scorecard data…'],
  [2000, 45, 'Loading cancelled client history…'],
  [2800, 60, 'Checking cancellation pipeline…'],
  [3600, 74, 'Scoring clients by risk signals…'],
  [4400, 86, 'Ranking by risk level…'],
  [5200, 94, 'Almost done…'],
];

// BAHC brand tokens
const BAHC_BLUE  = '#1B5EA0';
const BAHC_GREEN = '#2A8C5A';

const TIER_STYLE = {
  High:       { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', dot: '#dc2626' },
  Medium:     { bg: '#fffbeb', color: '#d97706', border: '#fde68a', dot: '#d97706' },
  Low:        { bg: '#EBF7F1', color: BAHC_GREEN, border: '#a7f3d0', dot: BAHC_GREEN },
  'Very Low': { bg: '#EBF3FB', color: BAHC_BLUE,  border: '#bfdbfe', dot: BAHC_BLUE  },
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
  const [mcStatus, setMcStatus] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      if (existing) {
        // Update existing record (no new MC ticket)
        const res = await fetch(`${BASE}/api/care-focus/${encodeURIComponent(client.name)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_date: scheduledDate, notes }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Update failed');
      } else {
        // Create L1 MC ticket automatically
        const reason = client.signals?.[0] || 'At-risk client — schedule care focus';
        try {
          const mcRes = await fetch(`${BASE}/api/mc/create-note`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_name: client.name,
              level: 1,
              reason,
              details: client.signals?.slice(1).join('; ') || '',
              create_ticket: true,
            }),
          });
          const mcData = await mcRes.json();
          if (mcRes.status === 409) setMcStatus('duplicate');
          else if (mcRes.status === 404) setMcStatus('no_email');
          else if (!mcData.ok) setMcStatus('error');
          else setMcStatus('created');
        } catch (mcErr) {
          setMcStatus('error');
          console.warn('[CFModal] MC L1 ticket failed:', mcErr.message);
        }

        // Log to CRIS Care Focus regardless
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
            Scheduling a Care Focus automatically creates an L1 ticket in MaidCentral and logs it in CRIS. The cleaning team gives this client extra attention on their next visit.
          </div>
          {mcStatus === 'duplicate' && (
            <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#713f12' }}>
              ⚠ An L1 ticket for <strong>{client.name}</strong> already exists within 90 days. Care Focus logged in CRIS — no duplicate MC ticket created.
            </div>
          )}
          {mcStatus === 'no_email' && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#7f1d1d' }}>
              ⚠ No email found for <strong>{client.name}</strong> in MaidCentral. Care Focus logged in CRIS — please create the L1 ticket manually.
            </div>
          )}
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
  const [mcStatus, setMcStatus] = useState(null); // null | 'created' | 'duplicate' | 'no_email' | 'error'

  const handleCreate = async () => {
    setSaving(true);
    setErr('');
    try {
      const reason = client.signals?.[0] || client.top_signal || 'At-risk client';

      // 1. Create MC ticket (L2)
      let mcTicketId = '';
      try {
        const mcRes = await fetch(`${BASE}/api/mc/create-note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: client.name,
            level: 2,
            reason,
            details: client.signals?.slice(1).join('; ') || '',
            create_ticket: true,
          }),
        });
        const mcData = await mcRes.json();
        if (mcRes.status === 409) {
          setMcStatus('duplicate');
        } else if (mcRes.status === 404) {
          setMcStatus('no_email');
        } else if (!mcData.ok) {
          setMcStatus('error');
          console.warn('[L2Modal] MC ticket error:', mcData.error);
        } else {
          setMcStatus('created');
          mcTicketId = mcData.mc_response?.Id || '';
        }
      } catch (mcErr) {
        setMcStatus('error');
        console.warn('[L2Modal] MC ticket failed:', mcErr.message);
      }

      // 2. Log to CRIS (always, even if MC had issues)
      const res = await fetch(`${BASE}/api/l2-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: client.name,
          risk_score: client.risk_score,
          tier: client.effective_tier || client.risk_tier,
          risk_reason: reason,
          created_by: currentUser?.username || 'CRIS',
          mc_ticket_id: mcTicketId,
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
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>📞 Create L2 Ticket</h3>
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
          {mcStatus === 'duplicate' && (
            <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#713f12' }}>
              ⚠ An L2 ticket for <strong>{client.name}</strong> was already created in the last 90 days. CRIS will still log this call but won't create a duplicate MC ticket.
            </div>
          )}
          {mcStatus === 'no_email' && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#7f1d1d' }}>
              ⚠ No email found for <strong>{client.name}</strong> in MaidCentral. Logged in CRIS only — please create the MC ticket manually.
            </div>
          )}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#0369a1', lineHeight: 1.6 }}>
            Clicking <em>"Create L2 Ticket"</em> will automatically create a ticket in MaidCentral and log it in CRIS.
          </div>
          {err && <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{err}</p>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748b', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#d97706,#f59e0b)', cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Creating…' : '✓ Create L2 Ticket'}
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
            <span style={{ fontSize: 11, fontWeight: 700, color: BAHC_GREEN, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🌟 L1 Care Focus</span>
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
              style={{ padding: '7px 14px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: `linear-gradient(135deg,${BAHC_GREEN},#38A169)`, color: '#fff', whiteSpace: 'nowrap' }}>
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
            style={{ padding: '6px 14px', background: `linear-gradient(135deg,${BAHC_BLUE},#2774B8)`, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
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

// ─── Journey Tracker Tab ──────────────────────────────────────────────────────
function JourneyTracker() {
  // Default date range: last 30 days
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedClient, setExpandedClient] = useState(null);
  const [outcomeFilter, setOutcomeFilter] = useState('All'); // All | Still At-Risk | Graduated | Cancelled

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE}/api/risk-history?from=${fromDate}&to=${toDate}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const OUTCOME_STYLE = {
    'Still At-Risk': { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '⚠' },
    'Graduated':     { color: BAHC_GREEN, bg: '#f0fdf4', border: '#86efac', icon: '✓' },
    'Cancelled':     { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '✗' },
  };

  const filteredClients = (data?.clients || []).filter(c => {
    if (outcomeFilter === 'All') return true;
    return c.outcome === outcomeFilter;
  });

  const saveRate = data?.save_rate;
  const inf = data?.ticket_influence || {};

  return (
    <div>
      {/* Date range picker */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Date Range</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b' }} />
            <span style={{ fontSize: 13, color: '#94a3b8' }}>→</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b' }} />
          </div>
          {/* Quick range buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: '30d', days: 30 },
              { label: '60d', days: 60 },
              { label: '90d', days: 90 },
            ].map(({ label, days }) => (
              <button key={label} onClick={() => {
                setToDate(today);
                setFromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
              }}
                style={{ padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={load}
          style={{ padding: '8px 18px', background: BAHC_BLUE, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Load
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⟳</div>
          <p style={{ margin: 0, fontSize: 14 }}>Loading journey data…</p>
        </div>
      )}

      {error && <div style={{ padding: '20px 24px', color: '#dc2626', background: '#fef2f2', borderRadius: 12, marginBottom: 20 }}>{error}</div>}

      {data && !loading && (
        <>
          {/* ── Save Rate Banner ── */}
          {saveRate !== null && saveRate !== undefined ? (
            <div style={{
              background: `linear-gradient(135deg, ${BAHC_GREEN}, #38A169)`,
              borderRadius: 16, padding: '20px 24px', marginBottom: 20, color: '#fff',
              display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, marginBottom: 4 }}>Client Save Rate · {fromDate} → {toDate}</div>
                <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1 }}>{saveRate}%</div>
                <div style={{ fontSize: 13, marginTop: 6, opacity: 0.85 }}>
                  {data.graduated_count} graduated · {data.cancelled_count} cancelled · {data.still_at_risk_count} still at-risk
                </div>
              </div>
              {/* Mini progress bar */}
              <div style={{ minWidth: 140 }}>
                <div style={{ height: 10, background: 'rgba(255,255,255,0.3)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${saveRate}%`, height: '100%', background: '#fff', borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8, textAlign: 'right' }}>
                  of {data.graduated_count + data.cancelled_count} resolved
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 14, color: '#64748b' }}>No resolved clients (graduated or cancelled) in this date range yet — save rate will appear once some complete their journey.</div>
            </div>
          )}

          {/* ── Summary Tiles ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Unique Clients', value: data.total_unique, color: BAHC_BLUE, bg: '#EBF3FB', icon: '👥' },
              { label: 'Graduated ✓', value: data.graduated_count, color: BAHC_GREEN, bg: '#f0fdf4', icon: '🎉' },
              { label: 'Cancelled ✗', value: data.cancelled_count, color: '#dc2626', bg: '#fef2f2', icon: '✗' },
              { label: 'Still At-Risk', value: data.still_at_risk_count, color: '#d97706', bg: '#fffbeb', icon: '⚠' },
              { label: 'Chronic (3+ scans)', value: data.chronic_count, color: '#7c3aed', bg: '#f5f3ff', icon: '🔁' },
            ].map(({ label, value, color, bg, icon }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${color}30`, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* ── Ticket Influence ── */}
          {data.graduated_count > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14 }}>Ticket Influence on Graduation Rate</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { key: 'l2_only', label: 'L2 Phone Call Only (High tier)', color: '#dc2626', bg: '#fef2f2' },
                  { key: 'both',    label: 'Both L1 + L2 Tickets',           color: BAHC_BLUE,  bg: '#EBF3FB' },
                  { key: 'l1_only', label: 'L1 Care Focus Only (Low tier)',   color: BAHC_GREEN, bg: '#f0fdf4' },
                ].map(({ key, label, color, bg }) => {
                  const g = inf[key] || { total: 0, graduated: 0, rate: null };
                  if (g.total === 0) return null;
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color }}>
                          {g.rate !== null ? `${g.rate}%` : '—'}
                          <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}> ({g.graduated}/{g.total})</span>
                        </span>
                      </div>
                      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99 }}>
                        <div style={{ width: `${g.rate ?? 0}%`, height: '100%', background: color, borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Client Journey Cards ── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Client Journeys</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['All', 'Still At-Risk', 'Graduated', 'Cancelled'].map(f => (
                <button key={f} onClick={() => setOutcomeFilter(f)}
                  style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: outcomeFilter === f ? '#0f172a' : '#f1f5f9',
                    color: outcomeFilter === f ? '#fff' : '#475569' }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filteredClients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <p style={{ fontSize: 14, margin: 0 }}>No clients found for this filter and date range.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredClients.map(client => {
                const os = OUTCOME_STYLE[client.outcome] || OUTCOME_STYLE['Still At-Risk'];
                const isExpanded = expandedClient === client.name;
                const scoreArr = client.scans.map(s => s.risk_score);
                const minS = Math.min(...scoreArr), maxS = Math.max(...scoreArr);
                const scoreRange = maxS - minS || 1;
                const hadL1 = client.ticket_history.some(t => t.type === 'L1');
                const hadL2 = client.ticket_history.some(t => t.type === 'L2');

                return (
                  <div key={client.name} style={{ background: '#fff', border: `1px solid ${isExpanded ? os.color + '60' : '#e2e8f0'}`, borderRadius: 14, overflow: 'hidden' }}>
                    {/* Card header */}
                    <div style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start' }}
                      onClick={() => setExpandedClient(isExpanded ? null : client.name)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{client.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: os.color, background: os.bg, border: `1px solid ${os.border}`, borderRadius: 20, padding: '2px 9px' }}>
                            {os.icon} {client.outcome}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 20, padding: '2px 9px' }}>
                            {client.week_count}× on at-risk list
                          </span>
                        </div>

                        {/* Ticket pills */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                          {hadL2 && <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 20, padding: '1px 8px' }}>📞 L2 Call</span>}
                          {hadL1 && <span style={{ fontSize: 11, fontWeight: 700, color: BAHC_GREEN, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 20, padding: '1px 8px' }}>🌟 L1 Care Focus</span>}
                          {!hadL1 && !hadL2 && <span style={{ fontSize: 11, color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '1px 8px' }}>No tickets</span>}
                        </div>

                        {/* Mini sparkline */}
                        {scoreArr.length > 1 && (
                          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28, marginBottom: 4 }}>
                            {scoreArr.map((score, i) => {
                              const h = Math.max(4, Math.round(((score - minS) / scoreRange) * 24));
                              const barColor = score >= 60 ? '#dc2626' : score >= 40 ? '#d97706' : BAHC_GREEN;
                              return (
                                <div key={i} title={`${client.scans[i]?.scan_date}: ${score}`}
                                  style={{ width: 6, height: h, background: barColor, borderRadius: 2, flexShrink: 0, opacity: i === scoreArr.length - 1 ? 1 : 0.6 }} />
                              );
                            })}
                            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6, alignSelf: 'center' }}>
                              {client.first_score} → {client.last_score}
                              {client.score_trend < -2 ? ' ↓' : client.score_trend > 2 ? ' ↑' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 14, color: '#94a3b8', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded: scan timeline */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #f1f5f9', padding: '14px 18px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Scan Timeline</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {client.scans.map((scan, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12 }}>
                              <div style={{ width: 80, flexShrink: 0, color: '#64748b', fontWeight: 600 }}>{scan.scan_date}</div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, color: scan.risk_score >= 60 ? '#dc2626' : scan.risk_score >= 40 ? '#d97706' : BAHC_GREEN }}>
                                  Score {scan.risk_score}
                                </span>
                                <TierBadge tier={scan.risk_tier} />
                                {scan.l2_ticket === 'Created' && <span style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '1px 7px', fontWeight: 600 }}>📞 L2 Created</span>}
                                {scan.l2_ticket === 'Skipped' && <span style={{ color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1px 7px' }}>L2 Skipped (90d)</span>}
                                {scan.l1_ticket === 'Created' && <span style={{ color: BAHC_GREEN, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '1px 7px', fontWeight: 600 }}>🌟 L1 Created</span>}
                                {scan.l1_ticket === 'Skipped' && <span style={{ color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1px 7px' }}>L1 Skipped (90d)</span>}
                                {scan.notes && <span style={{ color: '#64748b' }}>· {scan.notes}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Ticket Log Tab ───────────────────────────────────────────────────────────
function TicketLog() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE}/api/risk-history?from=${fromDate}&to=${toDate}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const tickets = (data?.ticket_log || []).filter(t => {
    if (typeFilter !== 'All' && t.type !== typeFilter) return false;
    if (search && !t.client_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Date Range</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b' }} />
          <span style={{ fontSize: 13, color: '#94a3b8' }}>→</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b' }} />
        </div>
        <button onClick={load}
          style={{ padding: '8px 18px', background: BAHC_BLUE, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Load
        </button>
      </div>

      {/* Type + Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
            style={{ paddingLeft: 12, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, color: '#1e293b', outline: 'none', width: 180 }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['All', 'L2', 'L1'].map(f => (
            <button key={f} onClick={() => setTypeFilter(f)}
              style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: typeFilter === f ? '#0f172a' : '#f1f5f9',
                color: typeFilter === f ? '#fff' : '#475569' }}>
              {f === 'L2' ? '📞 L2 Calls' : f === 'L1' ? '🌟 L1 Care Focus' : 'All'}
            </button>
          ))}
        </div>
        {data && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{tickets.length} tickets</span>}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>Loading ticket log…</div>}
      {error && <div style={{ padding: '20px', color: '#dc2626', background: '#fef2f2', borderRadius: 12, marginBottom: 20 }}>{error}</div>}

      {data && !loading && (
        tickets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎫</div>
            <p style={{ fontSize: 14, margin: 0 }}>No tickets found for this range and filter.</p>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 60px 90px 1fr 90px', gap: 0, padding: '10px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <div>Date</div>
              <div>Client</div>
              <div>Type</div>
              <div>Score</div>
              <div>Reason</div>
              <div>Status</div>
            </div>
            {tickets.map((t, i) => {
              const isL2 = t.type === 'L2';
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 60px 90px 1fr 90px', gap: 0, padding: '11px 18px', borderBottom: i < tickets.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems: 'center', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{t.date}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{t.client_name}</div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isL2 ? '#dc2626' : BAHC_GREEN, background: isL2 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${isL2 ? '#fecaca' : '#86efac'}`, borderRadius: 12, padding: '1px 7px' }}>
                      {isL2 ? '📞 L2' : '🌟 L1'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{t.risk_score || '—'}</div>
                  <div style={{ fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.risk_reason}>{t.risk_reason || '—'}</div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600,
                      color: t.status === 'Created' || t.status === 'Completed' ? '#16a34a' : t.status === 'Pending' ? '#d97706' : '#64748b',
                      background: t.status === 'Created' || t.status === 'Completed' ? '#f0fdf4' : t.status === 'Pending' ? '#fffbeb' : '#f8fafc',
                      border: `1px solid ${t.status === 'Created' || t.status === 'Completed' ? '#86efac' : t.status === 'Pending' ? '#fde68a' : '#e2e8f0'}`,
                      borderRadius: 12, padding: '1px 8px' }}>
                      {t.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
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

  // Top-level tab
  const [mainTab, setMainTab] = useState('thisweek'); // 'thisweek' | 'journey' | 'ticketlog'

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

  // Server sends clients sorted by risk_score desc, with risk_tier already set:
  // rank 1-10 = "High" (→ L2 phone call), rank 11+ = "Low" (→ L1 Care Focus)
  // Apply cooldown: skip anyone on 90-day cooldown and fill from the next in line

  const eligibleForL2 = enriched.filter(c => c.risk_tier === 'High' && !hasRecentL2(c.name));
  const eligibleForCf = enriched.filter(c => c.risk_tier === 'Low' && !hasRecentL2(c.name) && !hasRecentCf(c.name));

  const top10 = eligibleForL2.slice(0, 10);   // → L2 phone calls
  const next15 = eligibleForCf.slice(0, 15);  // → L1 Care Focus

  // Weekly action plan progress
  const l2Done = top10.filter(c => hasL2(c.name)).length;
  const cfDone = next15.filter(c => getCfRecord(c.name)?.completed).length;
  const cfScheduled = next15.filter(c => getCfRecord(c.name) && !getCfRecord(c.name).completed).length;

  const TABS = ['High', 'Low', 'All'];
  const countByTier = (tier) => enriched.filter(c => c.risk_tier === tier).length;
  const displayed = enriched.filter(c => {
    if (filter !== 'All' && c.risk_tier !== filter) return false;
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 28 }}>⚠️</span>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', margin: 0 }}>Proactive Risk Tracker</h1>
          </div>
          <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>
            Weekly Top 25 action plan — <strong style={{ color: '#dc2626' }}>L2 calls</strong> for highest risk, <strong style={{ color: BAHC_GREEN }}>Care Focus</strong> for the next tier.
            {scanData?.scan_date && <span style={{ color: '#94a3b8' }}> · Scanned {new Date(scanData.scan_date).toLocaleString()}</span>}
          </p>
        </div>
        {mainTab === 'thisweek' && (
          <button onClick={load} style={{ padding: '9px 16px', border: `1.5px solid ${BAHC_BLUE}`, borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#fff', color: BAHC_BLUE, cursor: 'pointer' }}>
            ↻ Refresh
          </button>
        )}
      </div>

      {/* ── 3-Tab Nav ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: '2px solid #f1f5f9' }}>
        {[
          { id: 'thisweek',  label: '📋 This Week' },
          { id: 'journey',   label: '📈 Journey Tracker' },
          { id: 'ticketlog', label: '🎫 Ticket Log' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setMainTab(tab.id)}
            style={{ padding: '10px 22px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: 'transparent',
              color: mainTab === tab.id ? BAHC_BLUE : '#64748b',
              borderBottom: mainTab === tab.id ? `3px solid ${BAHC_BLUE}` : '3px solid transparent',
              marginBottom: -2, transition: 'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Journey Tracker tab ── */}
      {mainTab === 'journey' && <JourneyTracker />}

      {/* ── Ticket Log tab ── */}
      {mainTab === 'ticketlog' && <TicketLog />}

      {/* ── This Week tab (existing content) ── */}
      {mainTab === 'thisweek' && (
      <>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 1, marginBottom: 24, background: '#f1f5f9', padding: 4, borderRadius: 12, width: 'fit-content' }}>
        {[{ id: 'weekly', label: '📋 Weekly Action Plan' }, { id: 'all', label: '📊 All Clients' }].map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{ padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: view === v.id ? BAHC_BLUE : 'transparent',
              color: view === v.id ? '#fff' : '#64748b',
              boxShadow: view === v.id ? `0 2px 8px ${BAHC_BLUE}44` : 'none' }}>
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
              { label: 'L2 Calls Logged', done: l2Done, total: 10, color: '#dc2626', bg: '#fef2f2', icon: '📞' },
              { label: 'Care Focus Scheduled', done: cfScheduled + cfDone, total: 15, color: BAHC_BLUE, bg: '#EBF3FB', icon: '📅' },
              { label: 'Care Focus Complete', done: cfDone, total: 15, color: BAHC_GREEN, bg: '#EBF7F1', icon: '✓' },
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, background: '#fef2f2', borderRadius: 14, padding: '14px 16px', border: '1px solid #fecaca' }}>
              <div style={{ width: 4, height: 32, background: '#dc2626', borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#dc2626' }}>📞 Top 10 — L2 Phone Calls</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7f1d1d' }}>Highest-risk clients this week. Create an L2 ticket in MaidCentral and call each client.</p>
              </div>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#dc2626', whiteSpace: 'nowrap' }}>
                {l2Done}<span style={{ fontSize: 13, fontWeight: 500, color: '#f87171' }}>/10</span>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, background: '#EBF7F1', borderRadius: 14, padding: '14px 16px', border: `1px solid #a7f3d0` }}>
              <div style={{ width: 4, height: 32, background: BAHC_GREEN, borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: BAHC_GREEN }}>🌟 Next 15 — L1 Care Focus</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#166534' }}>Schedule extra attention on their next cleaning. Log a Care Focus — creates an L1 ticket in MaidCentral.</p>
              </div>
              <span style={{ fontSize: 18, fontWeight: 900, color: BAHC_GREEN, whiteSpace: 'nowrap' }}>
                {cfDone}<span style={{ fontSize: 13, fontWeight: 500, color: '#6ee7b7' }}>/15</span>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
            {[
              { tier: 'High', label: 'High Risk — L2 Call', sub: 'Top 10 scorers → phone call this week' },
              { tier: 'Low',  label: 'Low Risk — L1 Care Focus', sub: 'Next 15 scorers → care focus visit' },
            ].map(({ tier, label, sub }) => {
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
                    <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>
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
      </>
      )} {/* end thisweek tab */}
    </div>
  );
}
