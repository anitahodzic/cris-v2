import React, { useState } from 'react';
import { api } from '../utils/api';
import {
  Card, CardHeader, CardBody, Badge, Btn, ScoreBar,
  SectionTitle, categoryColor, Alert, Spinner, Input, Select
} from '../components/UI';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs font-semibold text-gray-500 w-40 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 flex-1 whitespace-pre-wrap">{value}</span>
    </div>
  );
}

function ScoreRow({ label, score }) {
  if (score === undefined || score === null || score === '') return null;
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
      </div>
      <ScoreBar score={Number(score)} />
    </div>
  );
}

function OutcomeFormInline({ intake, analysis, initialAction, setPage }) {
  const outcomeDefault =
    initialAction === 'cancel' ? 'Cancelled' :
    initialAction === 'pending' ? 'Pending' :
    initialAction === 'escalate' ? 'Escalated' : 'Saved';

  const [form, setForm] = useState({
    program_offered: analysis?.recommended_program || '',
    save_attempted: 'Yes',
    client_response: '',
    outcome: outcomeDefault,
    revenue_saved: '',
    follow_up_date: '',
    closed_date: '',
    outcome_notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.saveOutcome({
        evaluation_id: intake.evaluation_id,
        client_name: intake.client_name,
        staff_name: intake.staff_name,
        ...form,
      });
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <Card className="border-green-200">
        <CardBody className="text-center py-8">
          <div className="text-4xl mb-3">✓</div>
          <div className="font-bold text-green-700 text-lg mb-2">Outcome Saved</div>
          <p className="text-gray-500 text-sm mb-4">Result recorded for {intake.client_name}</p>
          <Btn onClick={() => setPage('dashboard')} variant="secondary">Return to Dashboard</Btn>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200">
      <CardHeader className="bg-blue-50"><SectionTitle>Record Outcome</SectionTitle></CardHeader>
      <CardBody className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Program Offered" value={form.program_offered} onChange={set('program_offered')} placeholder="Program name" />
          <Select label="Save Attempted" value={form.save_attempted} onChange={set('save_attempted')} options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
          <Select label="Outcome" value={form.outcome} onChange={set('outcome')} options={[
            { value: 'Saved', label: 'Saved' },
            { value: 'Cancelled', label: 'Cancelled' },
            { value: 'Pending', label: 'Pending' },
            { value: 'Follow-Up Needed', label: 'Follow-Up Needed' },
            { value: 'Escalated', label: 'Escalated' },
          ]} />
          <Input label="Revenue Saved" value={form.revenue_saved} onChange={set('revenue_saved')} placeholder="e.g. $1200" />
          <Input label="Follow-Up Date" value={form.follow_up_date} onChange={set('follow_up_date')} type="date" />
          <Input label="Closed Date" value={form.closed_date} onChange={set('closed_date')} type="date" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-gray-800">Client Response</label>
          <textarea value={form.client_response} onChange={e => set('client_response')(e.target.value)} rows={3}
            placeholder="What did the client say?" className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-gray-800">Outcome Notes</label>
          <textarea value={form.outcome_notes} onChange={e => set('outcome_notes')(e.target.value)} rows={3}
            placeholder="Additional notes..." className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y" />
        </div>
        <Btn onClick={handleSave} disabled={saving} variant="primary">
          {saving ? <><Spinner size="sm" /> Saving...</> : 'Save Outcome'}
        </Btn>
      </CardBody>
    </Card>
  );
}

export default function Report({ activeAnalysis, setPage }) {
  const [showOutcomeForm, setShowOutcomeForm] = useState(false);
  const [outcomeAction, setOutcomeAction] = useState('');

  if (!activeAnalysis) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-4">⊙</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">No Report Loaded</h2>
        <p className="text-gray-500 mb-6">Run an AI analysis from the New Evaluation page to see the Cancellation Decision Report.</p>
        <Btn onClick={() => setPage('new-evaluation')} variant="primary">Start New Evaluation</Btn>
      </div>
    );
  }

  const { intake, analysis: a } = activeAnalysis;
  const score = Number(a.save_worthiness_score) || 0;
  const worthSaving = score >= 50;

  function handleAction(action) {
    setOutcomeAction(action);
    setShowOutcomeForm(true);
    setTimeout(() => document.getElementById('outcome-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-10">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cancellation Decision Report</h1>
          <p className="text-gray-500 text-sm mt-1">{intake.client_name} · {intake.staff_name} · {new Date(intake.created_date).toLocaleDateString()}</p>
          <p className="text-xs font-mono text-blue-600 mt-1">{intake.evaluation_id}</p>
        </div>
        <Badge color={categoryColor(a.client_category)}>{a.client_category}</Badge>
      </div>

      <Card className={`mb-5 border-2 ${worthSaving ? 'border-green-400' : 'border-red-400'}`}>
        <CardBody>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Save Decision</div>
              <div className={`text-2xl font-bold ${worthSaving ? 'text-green-700' : 'text-red-700'}`}>
                {worthSaving ? '✓ Worth Saving' : '✗ Not Recommended to Save'}
              </div>
              <div className="text-sm text-gray-600 mt-1">{a.client_category}</div>
              {a.management_review_required === 'Yes' && (
                <div className="mt-2"><Badge color="orange">⚠ Management Review Required</Badge></div>
              )}
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-gray-800">{a.save_worthiness_score}</div>
              <div className="text-xs text-gray-500">Save Worthiness Score</div>
              <div className="text-sm font-semibold text-gray-600 mt-1">{a.save_confidence_percent}% confidence</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader><SectionTitle>Case Summary</SectionTitle></CardHeader>
        <CardBody className="divide-y divide-gray-50">
          <InfoRow label="Client" value={intake.client_name} />
          <InfoRow label="Cancellation Reason" value={intake.cancellation_reason} />
          <InfoRow label="Primary Driver" value={a.primary_cancellation_driver} />
          <InfoRow label="Risk Level" value={a.risk_level} />
          <InfoRow label="AI Evidence" value={a.root_cause_evidence} />
        </CardBody>
      </Card>

      {a.ai_summary && (
        <Card className="mb-5 bg-blue-50 border-blue-100">
          <CardBody>
            <SectionTitle>AI Summary</SectionTitle>
            <p className="text-sm text-blue-900 leading-relaxed whitespace-pre-wrap">{a.ai_summary}</p>
          </CardBody>
        </Card>
      )}

      <Card className="mb-5">
        <CardHeader><SectionTitle>Client Value & Time Analysis</SectionTitle></CardHeader>
        <CardBody className="divide-y divide-gray-50">
          <InfoRow label="Revenue at Risk" value={a.revenue_at_risk} />
          <InfoRow label="Base Hours" value={a.base_hours} />
          <InfoRow label="Allowed Hours" value={a.allowed_hours} />
          <InfoRow label="Avg Actual Hours" value={a.average_actual_hours} />
          <InfoRow label="Hours Difference" value={a.hours_difference} />
          <InfoRow label="Time Efficiency" value={a.time_efficiency_analysis} />
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader><SectionTitle>Relationship & Operational Scores</SectionTitle></CardHeader>
        <CardBody>
          <ScoreRow label="Relationship Score" score={a.relationship_score} />
          <ScoreRow label="Value Score" score={a.value_score} />
          <ScoreRow label="Operational Fit Score" score={a.operational_fit_score} />
          <ScoreRow label="Policy Alignment Score" score={a.policy_alignment_score} />
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader><SectionTitle>Recommended Strategy & Programs</SectionTitle></CardHeader>
        <CardBody className="divide-y divide-gray-50">
          <InfoRow label="Strategy" value={a.recommended_strategy} />
          <InfoRow label="Recommended Program" value={a.recommended_program} />
          <InfoRow label="Backup Program" value={a.backup_program} />
          <InfoRow label="Not Recommended" value={a.programs_not_recommended} />
          <InfoRow label="Why Not" value={a.programs_not_recommended_reason} />
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader><SectionTitle>Conversation Guide</SectionTitle></CardHeader>
        <CardBody className="space-y-4">
          {a.conversation_objective && (
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Objective</div>
              <p className="text-sm text-gray-800">{a.conversation_objective}</p>
            </div>
          )}
          {a.key_talking_points && (
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Key Talking Points</div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.key_talking_points}</p>
            </div>
          )}
          {a.questions_to_ask && (
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Questions to Ask</div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.questions_to_ask}</p>
            </div>
          )}
          {a.what_not_to_say && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-4">
              <div className="text-xs font-bold text-red-600 uppercase mb-1">⚠ What NOT to Say</div>
              <p className="text-sm text-red-800 whitespace-pre-wrap">{a.what_not_to_say}</p>
            </div>
          )}
          {a.suggested_phone_script && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-xs font-bold text-gray-600 uppercase mb-2">Suggested Phone Script</div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">{a.suggested_phone_script}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {(a.technician_feedback_needed === 'Yes' || a.technician_names || a.quality_issue_summary) && (
        <Card className="mb-5 border-amber-200">
          <CardHeader className="bg-amber-50"><SectionTitle>Technician Follow-Up Needed</SectionTitle></CardHeader>
          <CardBody className="divide-y divide-gray-50">
            <InfoRow label="Feedback Needed" value={a.technician_feedback_needed} />
            <InfoRow label="Technician(s)" value={a.technician_names} />
            <InfoRow label="Quality Summary" value={a.quality_issue_summary} />
          </CardBody>
        </Card>
      )}

      {a.follow_up_recommendation && (
        <Card className="mb-6">
          <CardHeader><SectionTitle>Follow-Up Recommendation</SectionTitle></CardHeader>
          <CardBody>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.follow_up_recommendation}</p>
          </CardBody>
        </Card>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="text-sm font-bold text-gray-700 mb-3">Record Outcome</div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="success" onClick={() => handleAction('offer_recommended')}>Offer Recommended Program</Btn>
          <Btn variant="secondary" onClick={() => handleAction('offer_backup')}>Offer Backup Program</Btn>
          <Btn variant="warning" onClick={() => handleAction('escalate')}>Escalate to Management</Btn>
          <Btn variant="danger" onClick={() => handleAction('cancel')}>Process Cancellation</Btn>
          <Btn variant="secondary" onClick={() => handleAction('pending')}>Save as Pending</Btn>
          <Btn variant="ghost" onClick={() => handleAction('more_info')}>Need More Information</Btn>
        </div>
      </div>

      {showOutcomeForm && (
        <div id="outcome-form">
          <OutcomeFormInline intake={intake} analysis={a} initialAction={outcomeAction} setPage={setPage} />
        </div>
      )}
    </div>
  );
}
