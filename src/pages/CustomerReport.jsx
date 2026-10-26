import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { Spinner, Alert, Badge, categoryColor, statusColor, LoadingRing } from '../components/UI';

const BASE = process.env.REACT_APP_API_URL || '';

async function lookupClient(name) {
  if (!name || name.length < 2) return null;
  try {
    const res = await fetch(`${BASE}/api/client-lookup?q=${encodeURIComponent(name)}`);
    const data = await res.json();
    const lower = name.toLowerCase();
    return data.find(d => d.name?.toLowerCase() === lower) || data[0] || null;
  } catch { return null; }
}

function DataRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13, marginBottom: 6 }}>
      <span style={{ color: '#94a3b8', minWidth: 120, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#1e293b', fontWeight: 500, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function ScoreRing({ score }) {
  const color = score >= 7 ? '#16a34a' : score >= 4 ? '#d97706' : '#dc2626';
  const pct = (score / 10) * 100;
  const r = 30;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={80} height={80} style={{ display: 'block', margin: '0 auto' }}>
        <circle cx={40} cy={40} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
        <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${(pct / 100) * circ} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 40 40)" />
        <text x={40} y={44} textAnchor="middle" fontSize={18} fontWeight={800} fill={color}>{score}</text>
      </svg>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Save Score</div>
    </div>
  );
}


export default function CustomerReport({ setPage, setActiveAnalysis, setActiveEvalId }) {
  const [search, setSearch] = useState('');
  const [allEvals, setAllEvals] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [driveInfo, setDriveInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getEvaluations()
      .then(data => { setAllEvals(data); setFiltered(data); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = (val) => {
    setSearch(val);
    if (!val.trim()) { setFiltered(allEvals); return; }
    setFiltered(allEvals.filter(r =>
      r.Client_Name?.toLowerCase().includes(val.toLowerCase()) ||
      r.Customer_ID?.toLowerCase().includes(val.toLowerCase())
    ));
  };

  const handleSelect = async (row) => {
    setSelected(row);
    setDetailLoading(true);
    setDriveInfo(null);
    setAuditReasons([]);
    try {
      const [data, drive] = await Promise.all([
        api.getEvaluation(row.Evaluation_ID),
        lookupClient(row.Client_Name),
      ]);
      setDetail(data);
      setDriveInfo(drive);
    } catch (e) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewFullReport = () => {
    if (detail?.analysis) {
      setActiveAnalysis({ intake: detail.intake, analysis: detail.analysis });
      setActiveEvalId(detail.intake.Evaluation_ID);
      setPage('report');
    }
  };

  const analysis = detail?.analysis;
  const intake = detail?.intake;
  const outcome = detail?.outcome;
  const saveScore = analysis?.Save_Worthiness_Score;
  const confPct = analysis?.Save_Confidence_Percent;
  const scoreColor = confPct >= 60 ? '#16a34a' : confPct >= 40 ? '#d97706' : '#dc2626';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        {/* Search */}
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width={15} height={15} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Search clients…"
              style={{ width: '100%', paddingLeft: 32, paddingRight: 10, paddingTop: 8, paddingBottom: 8, fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>{filtered.length} evaluation{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '24px 8px' }}>No clients found.</p>
          ) : (
            filtered.map(row => {
              const isActive = selected?.Evaluation_ID === row.Evaluation_ID;
              return (
                <button key={row.Evaluation_ID} onClick={() => handleSelect(row)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 4,
                    borderRadius: 10, border: isActive ? '1.5px solid #2563eb' : '1px solid transparent',
                    background: isActive ? '#eff6ff' : 'transparent', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.Client_Name}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge color={statusColor(row.Current_Status)}>{row.Current_Status}</Badge>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {row.Created_Date ? new Date(row.Created_Date).toLocaleDateString() : ''}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main detail */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 40px' }}>
        {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}

        {!selected ? (
          <div style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#cbd5e1' }}>
              <svg width={32} height={32} fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.5, flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Select a client from the left to view their account details</p>
            </div>
          </div>
        ) : detailLoading ? (
          <LoadingRing label="Loading client data…" />
        ) : detail ? (
          <div style={{ maxWidth: 700 }}>
            {/* Client header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{intake?.Client_Name}</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 11, color: '#2563eb', background: '#eff6ff', padding: '2px 7px', borderRadius: 6 }}>{intake?.Evaluation_ID}</code>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{intake?.Staff_Name}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{intake?.Created_Date ? new Date(intake.Created_Date).toLocaleDateString() : ''}</span>
                  {outcome?.Outcome && (
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: outcome.Outcome === 'Saved' ? '#f0fdf4' : outcome.Outcome === 'Cancelled' ? '#fef2f2' : '#f8fafc',
                      color: outcome.Outcome === 'Saved' ? '#15803d' : outcome.Outcome === 'Cancelled' ? '#b91c1c' : '#475569' }}>
                      {outcome.Outcome}
                    </span>
                  )}
                </div>
              </div>
              {analysis && (
                <button onClick={handleViewFullReport}
                  style={{ padding: '9px 18px', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Full Report →
                </button>
              )}
            </div>


            {/* MaidCentral data */}
            {driveInfo && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>MaidCentral Profile</span>
                </div>
                <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 24px' }}>
                  <DataRow label="Phone" value={driveInfo.phone} />
                  <DataRow label="Email" value={driveInfo.email} />
                  <DataRow label="Address" value={driveInfo.address} />
                  <DataRow label="Frequency" value={driveInfo.frequency} />
                  <DataRow label="Base Fee" value={driveInfo.base_fee ? `$${driveInfo.base_fee}/visit` : null} />
                  <DataRow label="Customer Since" value={driveInfo.customer_start} />
                  <DataRow label="Completed Jobs" value={driveInfo.completed_jobs} />
                  <DataRow label="Total Revenue" value={driveInfo.total_revenue ? `$${driveInfo.total_revenue}` : null} />
                  <DataRow label="Last Job" value={driveInfo.last_job} />
                  <DataRow label="Last Contact" value={driveInfo.last_contact} />
                  <DataRow label="Avg Scorecard" value={driveInfo.avg_scorecard} />
                  {driveInfo.cancelled_date && <DataRow label="Cancelled" value={driveInfo.cancelled_date} />}
                </div>
              </div>
            )}

            {/* Cancellation reason */}
            {intake?.Cancellation_Reason && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#c2410c' }}>Cancellation Reason</span>
                </div>
                <div style={{ padding: '14px 18px', fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                  {intake.Cancellation_Reason}
                </div>
              </div>
            )}

            {/* AI Assessment */}
            {analysis ? (
              <>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>AI Assessment</span>
                  </div>
                  <div style={{ padding: '18px' }}>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
                      {saveScore != null && <ScoreRing score={saveScore} />}
                      <div style={{ flex: 1 }}>
                        {analysis.Client_Category && (
                          <div style={{ marginBottom: 10 }}>
                            <Badge color={categoryColor(analysis.Client_Category)}>{analysis.Client_Category}</Badge>
                          </div>
                        )}
                        {confPct != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 99 }}>
                              <div style={{ height: '100%', background: scoreColor, borderRadius: 99, width: `${confPct}%` }} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor, minWidth: 36 }}>{confPct}%</span>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>save confidence</span>
                          </div>
                        )}
                        {analysis.AI_Summary && (
                          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, margin: 0 }}>{analysis.AI_Summary}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Recommendation</span>
                  </div>
                  <div style={{ padding: '14px 18px' }}>
                    <DataRow label="Strategy" value={analysis.Recommended_Strategy} />
                    <DataRow label="Program" value={analysis.Recommended_Program} />
                    <DataRow label="Backup" value={analysis.Backup_Program} />
                    {analysis.Suggested_Phone_Script && (
                      <div style={{ marginTop: 14, background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Phone Script</div>
                        <pre style={{ fontSize: 12, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', margin: 0 }}>
                          {analysis.Suggested_Phone_Script}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 14, padding: '24px', textAlign: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No AI analysis yet for this evaluation.</p>
              </div>
            )}

            {/* Outcome */}
            {outcome && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', background: outcome.Outcome === 'Saved' ? '#f0fdf4' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: outcome.Outcome === 'Saved' ? '#15803d' : '#1e293b' }}>
                    {outcome.Outcome === 'Saved' ? '✓ ' : ''}Outcome
                  </span>
                </div>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <Badge color={outcome.Outcome === 'Saved' ? 'green' : outcome.Outcome === 'Cancelled' ? 'red' : 'gray'}>{outcome.Outcome}</Badge>
                    {outcome.Program_Offered && <Badge color="blue">{outcome.Program_Offered}</Badge>}
                  </div>
                  <DataRow label="Revenue Saved" value={outcome.Revenue_Saved} />
                  <DataRow label="Follow-Up" value={outcome.Follow_Up_Date} />
                  {outcome.Outcome_Notes && <p style={{ fontSize: 13, color: '#374151', marginTop: 8, marginBottom: 0 }}>{outcome.Outcome_Notes}</p>}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
