import React, { useState } from 'react';
import { api } from '../utils/api';
import { Card, CardHeader, CardBody, Btn, TextArea, Input, Select, Alert, Spinner } from '../components/UI';

const EMPTY = {
  evaluation_id: '',
  staff_name: '',
  client_name: '',
  customer_id: '',
  contact_method: 'Phone',
  current_status: 'New',
  customer_overview_paste: '',
  cancellation_reason: '',
  scorecards_paste: '',
  technician_history_paste: '',
  service_set_paste: '',
  technician_preferences_paste: '',
  internal_notes_paste: '',
  relevant_sms_email_paste: '',
};

export default function NewEvaluation({ setPage, setActiveEvalId, setActiveAnalysis }) {
  const [form, setForm] = useState({ ...EMPTY, created_date: new Date().toISOString() });
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [evalId, setEvalId] = useState('');

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.client_name?.trim()) { setError('Client name is required.'); return; }
    if (!form.cancellation_reason?.trim()) { setError('Cancellation reason is required.'); return; }
    setError(null);
    setSaving(true);
    try {
      const res = await api.saveIntake({ ...form });
      const id = res.evaluation_id;
      setEvalId(id);
      setForm(f => ({ ...f, evaluation_id: id }));
      setSaved(true);
      setActiveEvalId(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = async () => {
    let id = evalId || form.evaluation_id;
    if (!id) {
      // Save first
      await handleSave();
      id = evalId;
    }
    if (!form.client_name?.trim()) { setError('Client name is required before analyzing.'); return; }
    setError(null);
    setAnalyzing(true);
    try {
      const intakeData = { ...form, evaluation_id: id || evalId };
      const res = await api.analyze(intakeData);
      setActiveAnalysis({ intake: intakeData, analysis: res.analysis });
      setActiveEvalId(intakeData.evaluation_id);
      setPage('report');
    } catch (e) {
      setError(`Analysis failed: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClear = () => {
    if (!window.confirm('Clear the form? Unsaved data will be lost.')) return;
    setForm({ ...EMPTY, created_date: new Date().toISOString() });
    setSaved(false);
    setEvalId('');
    setError(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-32">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Client Evaluation</h1>
        <p className="text-gray-500 mt-1">Complete all available fields before running AI analysis.</p>
        {evalId && (
          <p className="text-xs text-blue-600 mt-2 font-mono">Evaluation ID: {evalId}</p>
        )}
      </div>

      {error && <Alert type="error" onClose={() => setError(null)} className="mb-4">{error}</Alert>}
      {saved && !analyzing && <Alert type="success" className="mb-4">Evaluation saved. Evaluation ID: <strong>{evalId}</strong></Alert>}

      {/* Case Info */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="font-bold text-gray-800">Case Information</h2>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Evaluation Date" value={form.created_date?.split('T')[0]} onChange={(v) => setForm(f => ({ ...f, created_date: v }))} type="date" />
            <Input label="Staff Member Name" value={form.staff_name} onChange={set('staff_name')} placeholder="Your name" required />
            <Input label="Client Name" value={form.client_name} onChange={set('client_name')} placeholder="Full client name" required />
            <Input label="Customer ID" value={form.customer_id} onChange={set('customer_id')} placeholder="Maid Central Customer ID" />
            <Select label="Contact Method" value={form.contact_method} onChange={set('contact_method')} options={[
              { value: 'Phone', label: 'Phone' },
              { value: 'SMS', label: 'SMS' },
              { value: 'Email', label: 'Email' },
              { value: 'Other', label: 'Other' },
            ]} />
            <Select label="Current Status" value={form.current_status} onChange={set('current_status')} options={[
              { value: 'New', label: 'New' },
              { value: 'Pending AI', label: 'Pending AI' },
              { value: 'Pending Follow-Up', label: 'Pending Follow-Up' },
              { value: 'Saved', label: 'Saved' },
              { value: 'Cancelled', label: 'Cancelled' },
              { value: 'Closed', label: 'Closed' },
            ]} />
          </div>
        </CardBody>
      </Card>

      {/* Cancellation */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="font-bold text-gray-800">Cancellation Details</h2>
        </CardHeader>
        <CardBody className="space-y-5">
          <TextArea
            label="Cancellation Reason"
            instruction="Type exactly what the customer said, even if incomplete."
            value={form.cancellation_reason}
            onChange={set('cancellation_reason')}
            placeholder="e.g. 'We're moving next month' or 'Prices are too high for us right now'"
            rows={4}
            required
          />
          <TextArea
            label="Customer Overview"
            instruction="Paste the Maid Central customer overview section here, including customer since, last cleaning, next cleaning, revenue, revenue last 12 months, scorecard percentage, and customer stats."
            value={form.customer_overview_paste}
            onChange={set('customer_overview_paste')}
            placeholder="Paste from Maid Central..."
            rows={6}
          />
        </CardBody>
      </Card>

      {/* Service Data */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="font-bold text-gray-800">Service & Scorecard Data</h2>
        </CardHeader>
        <CardBody className="space-y-5">
          <TextArea
            label="Scorecards"
            instruction="Paste all available scorecards from Maid Central."
            value={form.scorecards_paste}
            onChange={set('scorecards_paste')}
            placeholder="Paste scorecards..."
            rows={6}
          />
          <TextArea
            label="Technician History"
            instruction="Paste technician history from Maid Central."
            value={form.technician_history_paste}
            onChange={set('technician_history_paste')}
            placeholder="Paste technician history..."
            rows={5}
          />
          <TextArea
            label="Service Set Information"
            instruction="Paste service set information from Maid Central, including frequency, base fee, base hours, allowed hours, preferred day/time, arrival window, default team, special instructions, and tags."
            value={form.service_set_paste}
            onChange={set('service_set_paste')}
            placeholder="Paste service set..."
            rows={6}
          />
          <TextArea
            label="Technician Preferences"
            instruction="Paste technician preferences from Maid Central."
            value={form.technician_preferences_paste}
            onChange={set('technician_preferences_paste')}
            placeholder="Paste technician preferences..."
            rows={4}
          />
        </CardBody>
      </Card>

      {/* Notes */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="font-bold text-gray-800">Notes & Communications</h2>
        </CardHeader>
        <CardBody className="space-y-5">
          <TextArea
            label="Internal Notes"
            instruction="Paste notes related to complaints, credits, refunds, previous save attempts, policy concerns, relationship concerns, positive history, or difficult interactions."
            value={form.internal_notes_paste}
            onChange={set('internal_notes_paste')}
            placeholder="Paste internal notes..."
            rows={6}
          />
          <TextArea
            label="Relevant SMS / Email (Optional)"
            instruction="Paste any relevant client messages that provide context."
            value={form.relevant_sms_email_paste}
            onChange={set('relevant_sms_email_paste')}
            placeholder="Paste messages (optional)..."
            rows={5}
          />
        </CardBody>
      </Card>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 px-4 sm:px-6 py-4 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-3 flex-wrap">
          <Btn onClick={handleAnalyze} disabled={analyzing || saving} variant="primary" size="lg" className="flex-1 sm:flex-none">
            {analyzing ? <><Spinner size="sm" /> Analyzing with AI...</> : '⊙ Analyze Client'}
          </Btn>
          <Btn onClick={handleSave} disabled={saving || analyzing} variant="secondary" size="lg">
            {saving ? <><Spinner size="sm" /> Saving...</> : 'Save Evaluation'}
          </Btn>
          <Btn onClick={handleClear} variant="ghost" size="lg">Clear Form</Btn>
        </div>
      </div>
    </div>
  );
}
