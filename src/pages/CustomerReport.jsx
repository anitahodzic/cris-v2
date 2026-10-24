import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Card, CardHeader, CardBody, Badge, Btn, Input, Spinner, Alert, SectionTitle, categoryColor, statusColor, ScoreBar } from '../components/UI';

const BASE = process.env.REACT_APP_API_URL || '';

async function lookupClient(name) {
  if (!name || name.length < 2) return null;
  try {
    const res = await fetch(`${BASE}/api/client-lookup?q=${encodeURIComponent(name)}`);
    const data = await res.json();
    // Return best match (first result whose name closely matches)
    const lower = name.toLowerCase();
    return data.find(d => d.name?.toLowerCase() === lower) || data[0] || null;
  } catch {
    return null;
  }
}

function DriveCard({ info }) {
  if (!info) return null;
  const rows = [
    ['Phone', info.phone],
    ['Email', info.email],
    ['Address', info.address],
    ['Frequency', info.frequency],
    ['Base Fee', info.base_fee ? `$${info.base_fee}/visit` : null],
    ['Scope', info.scope],
    ['Customer Since', info.customer_start],
    ['Completed Jobs', info.completed_jobs],
    ['Total Revenue', info.total_revenue ? `$${info.total_revenue}` : null],
    ['Last Job', info.last_job],
    ['Last Contact', info.last_contact],
  ].filter(([, v]) => v);

  const cancelRows = [
    ['Cancelled', info.cancelled_date],
    ['Cancel Reason', info.cancellation_reason],
    ['Cancel Notes', info.cancellation_notes],
    ['Avg Scorecard', info.avg_scorecard],
  ].filter(([, v]) => v);

  if (!rows.length) return null;

  return (
    <Card>
      <CardBody>
        <SectionTitle>MaidCentral Data</SectionTitle>
        <div className="space-y-1.5 text-sm">
          {rows.map(([label, val]) => (
            <div key={label} className="flex gap-2">
              <span className="text-gray-500 w-32 flex-shrink-0">{label}:</span>
              <span className="text-gray-800 font-medium">{val}</span>
            </div>
          ))}
        </div>
        {cancelRows.length > 0 && (
          <>
            <div className="border-t border-gray-100 mt-3 pt-3">
              <div className="text-xs font-semibold text-red-600 uppercase mb-2">Cancellation History</div>
              <div className="space-y-1.5 text-sm">
                {cancelRows.map(([label, val]) => (
                  <div key={label} className="flex gap-2">
                    <span className="text-gray-500 w-32 flex-shrink-0">{label}:</span>
                    <span className="text-gray-800">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customer Report</h1>
        <p className="text-gray-500 mt-1">Search for a client to view their full evaluation history and MaidCentral profile.</p>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: search + list */}
        <div className="lg:col-span-1">
          <Input value={search} onChange={handleSearch} placeholder="Search client name or ID..." />
          <div className="mt-3 space-y-2 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center">No clients found.</div>
            ) : (
              filtered.map(row => (
                <button
                  key={row.Evaluation_ID}
                  onClick={() => handleSelect(row)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors text-sm
                    ${selected?.Evaluation_ID === row.Evaluation_ID
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                >
                  <div className="font-semibold text-gray-900 truncate">{row.Client_Name}</div>
                  <div className="text-xs text-gray-500 flex gap-2 mt-1 flex-wrap">
                    <Badge color={statusColor(row.Current_Status)}>{row.Current_Status}</Badge>
                    <span>{row.Created_Date ? new Date(row.Created_Date).toLocaleDateString() : ''}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">⊙</div>
              <p>Select a client to view their report</p>
            </div>
          ) : detailLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : detail ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{detail.intake?.Client_Name}</h2>
                  <p className="text-xs font-mono text-blue-600">{detail.intake?.Evaluation_ID}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {detail.intake?.Staff_Name} · {detail.intake?.Created_Date ? new Date(detail.intake.Created_Date).toLocaleDateString() : ''}
                  </p>
                </div>
                {detail.analysis && (
                  <Btn variant="primary" size="sm" onClick={handleViewFullReport}>View Full Report →</Btn>
                )}
              </div>

              {/* MaidCentral Drive data */}
              <DriveCard info={driveInfo} />

              {/* Summary */}
              <Card>
                <CardBody>
                  <SectionTitle>Cancellation Reason</SectionTitle>
                  <p className="text-sm text-gray-800">{detail.intake?.Cancellation_Reason || 'Not recorded'}</p>
                </CardBody>
              </Card>

              {detail.analysis ? (
                <>
                  <Card>
                    <CardBody>
                      <SectionTitle>AI Assessment</SectionTitle>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="text-center bg-gray-50 rounded-lg p-3">
                          <div className="text-3xl font-bold text-gray-800">{detail.analysis.Save_Worthiness_Score}</div>
                          <div className="text-xs text-gray-500">Save Score</div>
                        </div>
                        <div className="text-center bg-gray-50 rounded-lg p-3">
                          <div className="text-3xl font-bold text-gray-800">{detail.analysis.Save_Confidence_Percent}%</div>
                          <div className="text-xs text-gray-500">Confidence</div>
                        </div>
                      </div>
                      <Badge color={categoryColor(detail.analysis.Client_Category)} className="mb-3">{detail.analysis.Client_Category}</Badge>
                      {detail.analysis.AI_Summary && (
                        <p className="text-sm text-gray-700 mt-3 leading-relaxed">{detail.analysis.AI_Summary}</p>
                      )}
                    </CardBody>
                  </Card>

                  <Card>
                    <CardBody>
                      <SectionTitle>Recommendation</SectionTitle>
                      <div className="space-y-1 text-sm">
                        <div><span className="text-gray-500">Strategy:</span> <strong>{detail.analysis.Recommended_Strategy}</strong></div>
                        <div><span className="text-gray-500">Program:</span> <strong>{detail.analysis.Recommended_Program}</strong></div>
                        <div><span className="text-gray-500">Backup:</span> {detail.analysis.Backup_Program}</div>
                      </div>
                      {detail.analysis.Suggested_Phone_Script && (
                        <div className="mt-4 bg-gray-50 rounded-lg p-3">
                          <div className="text-xs font-bold text-gray-500 uppercase mb-2">Phone Script</div>
                          <p className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{detail.analysis.Suggested_Phone_Script}</p>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardBody className="text-center py-6">
                    <p className="text-gray-500 text-sm mb-3">No AI analysis yet for this evaluation.</p>
                  </CardBody>
                </Card>
              )}

              {/* Outcome */}
              {detail.outcome && (
                <Card>
                  <CardBody>
                    <SectionTitle>Outcome</SectionTitle>
                    <div className="flex gap-3 mb-2">
                      <Badge color={detail.outcome.Outcome === 'Saved' ? 'green' : detail.outcome.Outcome === 'Cancelled' ? 'red' : 'gray'}>
                        {detail.outcome.Outcome}
                      </Badge>
                      {detail.outcome.Program_Offered && <Badge color="blue">{detail.outcome.Program_Offered}</Badge>}
                    </div>
                    <div className="text-sm space-y-1">
                      {detail.outcome.Revenue_Saved && <div><span className="text-gray-500">Revenue Saved:</span> {detail.outcome.Revenue_Saved}</div>}
                      {detail.outcome.Follow_Up_Date && <div><span className="text-gray-500">Follow-Up:</span> {detail.outcome.Follow_Up_Date}</div>}
                      {detail.outcome.Outcome_Notes && <div className="text-gray-700 mt-2">{detail.outcome.Outcome_Notes}</div>}
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
