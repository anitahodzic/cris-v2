require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();

const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({ origin: [allowedOrigin, 'http://localhost:3000'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Drive folder IDs for MC report exports
const DRIVE_FOLDER_CANCELLED = '1ldqOV3sO5yEJ9gjO3jIefdfeSwRI2DsW';
const DRIVE_FOLDER_CUSTOMERS = '1tuYg8KTYYCW6ED1wV8s16tXfVdSi5PPe';

function getAuth(scopes) {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return new google.auth.JWT(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, null, privateKey, scopes || ['https://www.googleapis.com/auth/spreadsheets']);
}

async function getSheets() {
  const auth = getAuth(['https://www.googleapis.com/auth/spreadsheets']);
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

async function getDrive() {
  const auth = getAuth(['https://www.googleapis.com/auth/drive.readonly']);
  await auth.authorize();
  return google.drive({ version: 'v3', auth });
}

// Parse CSV text into array of objects
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return headers.reduce((obj, h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, ''); return obj; }, {});
  });
}

// Fetch the most recent CSV file from a Drive folder
async function getLatestDriveCSV(folderId) {
  const drive = await getDrive();
  const list = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='text/csv' and trashed=false`,
    orderBy: 'modifiedTime desc',
    pageSize: 1,
    fields: 'files(id,name,modifiedTime)',
  });
  const file = list.data.files?.[0];
  if (!file) return [];
  const res = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' });
  return { rows: parseCSV(res.data), date: file.modifiedTime, filename: file.name };
}

// Simple in-memory cache (5 min TTL)
const driveCache = {};
async function cachedDriveCSV(folderId) {
  const now = Date.now();
  if (driveCache[folderId] && now - driveCache[folderId].ts < 5 * 60 * 1000) return driveCache[folderId].data;
  const data = await getLatestDriveCSV(folderId);
  driveCache[folderId] = { ts: now, data };
  return data;
}

async function readTab(sheets, tabName) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: tabName });
  const [headers, ...rows] = res.data.values || [[]];
  if (!headers) return [];
  return rows.map(row => headers.reduce((obj, h, i) => { obj[h] = row[i] ?? ''; return obj; }, {}));
}

async function appendRow(sheets, tabName, rowObj, headers) {
  const values = headers.map(h => rowObj[h] ?? '');
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: tabName, valueInputOption: 'USER_ENTERED', requestBody: { values: [values] } });
}

function generateEvalId() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `CRIS-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${Math.random().toString(36).substr(2,6).toUpperCase()}`;
}

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    const sheets = await getSheets();
    const users = await readTab(sheets, 'Users');
    const match = users.find(u => u.Username?.trim().toLowerCase() === username.trim().toLowerCase() && u.Password?.trim() === password.trim());
    if (!match) return res.status(401).json({ error: 'Invalid username or password.' });
    const role = match.Role?.trim() || 'User';
    return res.json({ username: match.Username.trim(), role });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/intake/save', async (req, res) => {
  try {
    const sheets = await getSheets();
    const data = req.body;
    if (!data.evaluation_id) data.evaluation_id = generateEvalId();
    if (!data.created_date) data.created_date = new Date().toISOString();
    const headers = ['Evaluation_ID','Created_Date','Staff_Name','Client_Name','Customer_ID','Contact_Method','Current_Status','Customer_Overview_Paste','Cancellation_Reason','Scorecards_Paste','Technician_History_Paste','Service_Set_Paste','Technician_Preferences_Paste','Internal_Notes_Paste','Relevant_SMS_Email_Paste','Saved_Timestamp','AI_Analyzed'];
    const existing = await readTab(sheets, 'Client_Intake');
    if (!existing.some(r => r.Evaluation_ID === data.evaluation_id)) {
      await appendRow(sheets, 'Client_Intake', { Evaluation_ID: data.evaluation_id, Created_Date: data.created_date, Staff_Name: data.staff_name, Client_Name: data.client_name, Customer_ID: data.customer_id, Contact_Method: data.contact_method, Current_Status: data.current_status, Customer_Overview_Paste: data.customer_overview_paste, Cancellation_Reason: data.cancellation_reason, Scorecards_Paste: data.scorecards_paste, Technician_History_Paste: data.technician_history_paste, Service_Set_Paste: data.service_set_paste, Technician_Preferences_Paste: data.technician_preferences_paste, Internal_Notes_Paste: data.internal_notes_paste, Relevant_SMS_Email_Paste: data.relevant_sms_email_paste, Saved_Timestamp: new Date().toISOString(), AI_Analyzed: 'No' }, headers);
    }
    res.json({ ok: true, evaluation_id: data.evaluation_id });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const sheets = await getSheets();
    const intake = req.body;
    const [settings, programs, programRules, policies, strategies, strategyMap, frameworks] = await Promise.all([readTab(sheets,'Settings'),readTab(sheets,'Programs'),readTab(sheets,'Program_Rules'),readTab(sheets,'Policies'),readTab(sheets,'Retention_Strategies'),readTab(sheets,'Strategy_Program_Map'),readTab(sheets,'Conversation_Frameworks')]);
    const activePrograms = programs.filter(p => p.Active === 'Yes' || p.Active === 'TRUE' || p.Active === '1');
    const activePolicies = policies.filter(p => p.Active === 'Yes' || p.Active === 'TRUE' || p.Active === '1');
    const settingsObj = settings.reduce((o, s) => { o[s.Setting_Key] = s.Value; return o; }, {});

    const systemPrompt = `You are CRIS — the Client Relationship Intelligence System for BA House Cleaning.\n\nYour job is to analyze a client cancellation case and return a structured JSON decision report.\n\nBUSINESS VALUES: WOW, Integrity, Respect, Accountability, Professionalism.\n\nIMPORTANT PHILOSOPHY:\n- NOT every client should be saved. Poor-fit clients hurt the team and the business.\n- Consider profitability, technician impact, client behavior, and long-term fit.\n- Recommend Respectful Cancellation when client fit is genuinely poor.\n- Do NOT over-recommend discounts.\n- Do NOT recommend Hardship unless hardship is clearly evident.\n- Do NOT recommend Flex unless scheduling flexibility is realistic.\n- Do NOT recommend Essentials unless reduced scope makes sense.\n- Be practical, specific, and direct.\n\nCOMPANY SETTINGS:\n${JSON.stringify(settingsObj, null, 2)}\n\nACTIVE PROGRAMS:\n${JSON.stringify(activePrograms, null, 2)}\n\nPROGRAM RULES:\n${JSON.stringify(programRules, null, 2)}\n\nACTIVE POLICIES:\n${JSON.stringify(activePolicies, null, 2)}\n\nRETENTION STRATEGIES:\n${JSON.stringify(strategies, null, 2)}\n\nSTRATEGY-PROGRAM MAP:\n${JSON.stringify(strategyMap, null, 2)}\n\nCONVERSATION FRAMEWORKS:\n${JSON.stringify(frameworks, null, 2)}\n\nReturn ONLY valid JSON matching this exact schema — no markdown, no explanation:\n{"evaluation_id":"","save_worthiness_score":0,"client_category":"","relationship_score":0,"value_score":0,"operational_fit_score":0,"policy_alignment_score":0,"risk_level":"","primary_cancellation_driver":"","root_cause_evidence":"","recommended_strategy":"","recommended_program":"","backup_program":"","programs_not_recommended":"","programs_not_recommended_reason":"","management_review_required":"","technician_feedback_needed":"","technician_names":"","quality_issue_summary":"","base_hours":"","allowed_hours":"","average_actual_hours":"","hours_difference":"","time_efficiency_analysis":"","revenue_at_risk":"","save_confidence_percent":0,"conversation_objective":"","key_talking_points":"","questions_to_ask":"","what_not_to_say":"","suggested_phone_script":"","follow_up_recommendation":"","ai_summary":""}`;

    const userPrompt = `CLIENT CANCELLATION CASE:\n\nEvaluation ID: ${intake.evaluation_id}\nClient Name: ${intake.client_name}\nCustomer ID: ${intake.customer_id}\nStaff Member: ${intake.staff_name}\nContact Method: ${intake.contact_method}\nDate: ${intake.created_date}\n\nCANCELLATION REASON (exact words):\n${intake.cancellation_reason}\n\nCUSTOMER OVERVIEW FROM MAID CENTRAL:\n${intake.customer_overview_paste}\n\nSCORECARDS:\n${intake.scorecards_paste}\n\nTECHNICIAN HISTORY:\n${intake.technician_history_paste}\n\nSERVICE SET INFORMATION:\n${intake.service_set_paste}\n\nTECHNICIAN PREFERENCES:\n${intake.technician_preferences_paste}\n\nINTERNAL NOTES:\n${intake.internal_notes_paste}\n\nRELEVANT SMS/EMAIL:\n${intake.relevant_sms_email_paste}\n\nAnalyze this case thoroughly and return your JSON decision report.`;

    const message = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4096, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] });
    const rawText = message.content[0].text;
    let analysis;
    try { analysis = JSON.parse(rawText); } catch { const m = rawText.match(/\{[\s\S]*\}/); if (m) analysis = JSON.parse(m[0]); else throw new Error('Claude did not return valid JSON'); }
    analysis.evaluation_id = intake.evaluation_id;
    analysis.analysis_date = new Date().toISOString();

    const aiHeaders = ['Evaluation_ID','Client_Name','Analysis_Date','Save_Worthiness_Score','Client_Category','Relationship_Score','Value_Score','Operational_Fit_Score','Policy_Alignment_Score','Risk_Level','Primary_Cancellation_Driver','Root_Cause_Evidence','Recommended_Strategy','Recommended_Program','Backup_Program','Programs_Not_Recommended','Programs_Not_Recommended_Reason','Management_Review_Required','Technician_Feedback_Needed','Technician_Names','Quality_Issue_Summary','Base_Hours','Allowed_Hours','Average_Actual_Hours','Hours_Difference','Time_Efficiency_Analysis','Revenue_At_Risk','Save_Confidence_Percent','Conversation_Objective','Key_Talking_Points','Questions_To_Ask','What_Not_To_Say','Suggested_Phone_Script','Follow_Up_Recommendation','AI_Summary'];
    await appendRow(sheets, 'AI_Analysis', { Evaluation_ID: analysis.evaluation_id, Client_Name: intake.client_name, Analysis_Date: analysis.analysis_date, Save_Worthiness_Score: analysis.save_worthiness_score, Client_Category: analysis.client_category, Relationship_Score: analysis.relationship_score, Value_Score: analysis.value_score, Operational_Fit_Score: analysis.operational_fit_score, Policy_Alignment_Score: analysis.policy_alignment_score, Risk_Level: analysis.risk_level, Primary_Cancellation_Driver: analysis.primary_cancellation_driver, Root_Cause_Evidence: analysis.root_cause_evidence, Recommended_Strategy: analysis.recommended_strategy, Recommended_Program: analysis.recommended_program, Backup_Program: analysis.backup_program, Programs_Not_Recommended: analysis.programs_not_recommended, Programs_Not_Recommended_Reason: analysis.programs_not_recommended_reason, Management_Review_Required: analysis.management_review_required, Technician_Feedback_Needed: analysis.technician_feedback_needed, Technician_Names: analysis.technician_names, Quality_Issue_Summary: analysis.quality_issue_summary, Base_Hours: analysis.base_hours, Allowed_Hours: analysis.allowed_hours, Average_Actual_Hours: analysis.average_actual_hours, Hours_Difference: analysis.hours_difference, Time_Efficiency_Analysis: analysis.time_efficiency_analysis, Revenue_At_Risk: analysis.revenue_at_risk, Save_Confidence_Percent: analysis.save_confidence_percent, Conversation_Objective: analysis.conversation_objective, Key_Talking_Points: analysis.key_talking_points, Questions_To_Ask: analysis.questions_to_ask, What_Not_To_Say: analysis.what_not_to_say, Suggested_Phone_Script: analysis.suggested_phone_script, Follow_Up_Recommendation: analysis.follow_up_recommendation, AI_Summary: analysis.ai_summary }, aiHeaders);

    const intakeRows = await readTab(sheets, 'Client_Intake');
    const rowIndex = intakeRows.findIndex(r => r.Evaluation_ID === intake.evaluation_id);
    if (rowIndex >= 0) {
      await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `Client_Intake!Q${rowIndex + 2}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [['Yes']] } });
    }
    res.json({ ok: true, analysis });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/outcome/save', async (req, res) => {
  try {
    const sheets = await getSheets();
    const data = req.body;
    const headers = ['Evaluation_ID','Client_Name','Staff_Name','Program_Offered','Save_Attempted','Client_Response','Outcome','Revenue_Saved','Follow_Up_Date','Closed_Date','Outcome_Notes','Timestamp'];
    await appendRow(sheets, 'Outcomes', { Evaluation_ID: data.evaluation_id, Client_Name: data.client_name, Staff_Name: data.staff_name, Program_Offered: data.program_offered, Save_Attempted: data.save_attempted, Client_Response: data.client_response, Outcome: data.outcome, Revenue_Saved: data.revenue_saved, Follow_Up_Date: data.follow_up_date, Closed_Date: data.closed_date, Outcome_Notes: data.outcome_notes, Timestamp: new Date().toISOString() }, headers);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/evaluations', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes] = await Promise.all([readTab(sheets,'Client_Intake'),readTab(sheets,'AI_Analysis'),readTab(sheets,'Outcomes')]);
    const analysisMap = analyses.reduce((m, a) => { m[a.Evaluation_ID] = a; return m; }, {});
    const outcomeMap = outcomes.reduce((m, o) => { m[o.Evaluation_ID] = o; return m; }, {});
    let result = intakes.map(i => ({ ...i, analysis: analysisMap[i.Evaluation_ID] || null, outcome: outcomeMap[i.Evaluation_ID] || null }));
    const { client_name, evaluation_id, staff_name, status, outcome_filter, program, date_from, date_to } = req.query;
    if (client_name) result = result.filter(r => r.Client_Name?.toLowerCase().includes(client_name.toLowerCase()));
    if (evaluation_id) result = result.filter(r => r.Evaluation_ID?.toLowerCase().includes(evaluation_id.toLowerCase()));
    if (staff_name) result = result.filter(r => r.Staff_Name?.toLowerCase().includes(staff_name.toLowerCase()));
    if (status) result = result.filter(r => r.Current_Status === status);
    if (outcome_filter) result = result.filter(r => r.outcome?.Outcome === outcome_filter);
    if (program) result = result.filter(r => r.outcome?.Program_Offered?.toLowerCase().includes(program.toLowerCase()));
    if (date_from) result = result.filter(r => r.Created_Date >= date_from);
    if (date_to) result = result.filter(r => r.Created_Date <= date_to);
    res.json(result.reverse());
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/evaluations/:id', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes] = await Promise.all([readTab(sheets,'Client_Intake'),readTab(sheets,'AI_Analysis'),readTab(sheets,'Outcomes')]);
    const intake = intakes.find(r => r.Evaluation_ID === req.params.id);
    if (!intake) return res.status(404).json({ error: 'Not found' });
    res.json({ intake, analysis: analyses.find(r => r.Evaluation_ID === req.params.id) || null, outcome: outcomes.find(r => r.Evaluation_ID === req.params.id) || null });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, outcomes] = await Promise.all([readTab(sheets,'Client_Intake'),readTab(sheets,'Outcomes')]);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const thisMonthIntakes = intakes.filter(r => r.Created_Date >= monthStart);
    const thisMonthOutcomes = outcomes.filter(r => r.Timestamp >= monthStart);
    res.json({
      total_evaluations: thisMonthIntakes.length,
      saved: thisMonthOutcomes.filter(r => r.Outcome === 'Saved').length,
      cancelled: thisMonthOutcomes.filter(r => r.Outcome === 'Cancelled').length,
      pending: thisMonthIntakes.filter(r => r.Current_Status === 'Pending Follow-Up' || r.Current_Status === 'Pending AI').length,
      revenue_saved: thisMonthOutcomes.filter(r => r.Outcome === 'Saved' && r.Revenue_Saved).reduce((sum, r) => sum + parseFloat(r.Revenue_Saved.replace(/[^0-9.]/g,'') || 0), 0),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/programs', async (req, res) => {
  try { const sheets = await getSheets(); res.json(await readTab(sheets, 'Programs')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/policies', async (req, res) => {
  try { const sheets = await getSheets(); res.json(await readTab(sheets, 'Policies')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings', async (req, res) => {
  try { const sheets = await getSheets(); res.json(await readTab(sheets, 'Settings')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/monthly-report', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, outcomes] = await Promise.all([readTab(sheets,'Client_Intake'),readTab(sheets,'Outcomes')]);
    const targetYear = parseInt(req.query.year) || new Date().getFullYear();
    const targetMonth = parseInt(req.query.month) || new Date().getMonth() + 1;
    const start = new Date(targetYear, targetMonth - 1, 1).toISOString();
    const end = new Date(targetYear, targetMonth, 1).toISOString();
    const monthIntakes = intakes.filter(r => r.Created_Date >= start && r.Created_Date < end);
    const monthOutcomes = outcomes.filter(r => r.Timestamp >= start && r.Timestamp < end);
    const byOutcome = monthOutcomes.reduce((m, r) => { m[r.Outcome] = (m[r.Outcome] || 0) + 1; return m; }, {});
    const byProgram = monthOutcomes.filter(r => r.Program_Offered).reduce((m, r) => { m[r.Program_Offered] = (m[r.Program_Offered] || 0) + 1; return m; }, {});
    const byStaff = monthOutcomes.reduce((m, r) => { if (!r.Staff_Name) return m; if (!m[r.Staff_Name]) m[r.Staff_Name] = { saved: 0, cancelled: 0, total: 0 }; m[r.Staff_Name].total++; if (r.Outcome === 'Saved') m[r.Staff_Name].saved++; if (r.Outcome === 'Cancelled') m[r.Staff_Name].cancelled++; return m; }, {});
    const saved = byOutcome['Saved'] || 0;
    res.json({ total_evaluations: monthIntakes.length, by_outcome: byOutcome, save_rate: monthIntakes.length > 0 ? Math.round((saved / monthIntakes.length) * 100) : 0, revenue_saved: monthOutcomes.filter(r => r.Outcome === 'Saved').reduce((s, r) => s + parseFloat(r.Revenue_Saved?.replace(/[^0-9.]/g,'') || 0), 0), by_program: byProgram, by_staff: byStaff });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── v2 NEW ROUTES ─────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], username } = req.body || {};
    const sheets = await getSheets();
    const [settings, programs, policies] = await Promise.all([readTab(sheets,'Settings'),readTab(sheets,'Programs'),readTab(sheets,'Policies')]);
    const settingsObj = settings.reduce((o, s) => { o[s.Setting_Key] = s.Value; return o; }, {});
    const systemPrompt = `You are CRIS, the Client Relationship Intelligence System for BA House Cleaning — a Diamond Certified, woman-owned residential cleaning company in the East Bay of California.\n\nYou help the team (${username || 'staff'}) understand retention strategy, client situations, and how to handle cancellations.\n\nCOMPANY SETTINGS: ${JSON.stringify(settingsObj)}\nACTIVE PROGRAMS: ${JSON.stringify(programs.filter(p => p.Active === 'Yes' || p.Active === 'TRUE'))}\nACTIVE POLICIES: ${JSON.stringify(policies.filter(p => p.Active === 'Yes' || p.Active === 'TRUE'))}\n\nBe concise, practical, and empathetic. You know the business inside and out.`;
    const reply = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, system: systemPrompt, messages: messages.filter(m => m.role !== 'system').slice(-10) });
    res.json({ reply: reply.content[0].text });
  } catch (err) { console.error('Chat error:', err.message); res.status(500).json({ error: err.message }); }
});

app.get('/api/account-audit', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes] = await Promise.all([readTab(sheets,'Client_Intake'),readTab(sheets,'AI_Analysis'),readTab(sheets,'Outcomes')]);
    const analysisMap = analyses.reduce((m, a) => { m[a.Evaluation_ID] = a; return m; }, {});
    const outcomeMap = outcomes.reduce((m, o) => { m[o.Evaluation_ID] = o; return m; }, {});
    const evaluations = intakes.map(i => ({ ...i, analysis: analysisMap[i.Evaluation_ID] || null, outcome: outcomeMap[i.Evaluation_ID] || null })).reverse();
    res.json({ evaluations, summary: { total: intakes.length, saved: outcomes.filter(o => o.Outcome === 'Saved').length, cancelled: outcomes.filter(o => o.Outcome === 'Cancelled').length, no_outcome: intakes.filter(i => !outcomeMap[i.Evaluation_ID]).length } });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/at-risk', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes] = await Promise.all([readTab(sheets,'Client_Intake'),readTab(sheets,'AI_Analysis'),readTab(sheets,'Outcomes')]);
    const analysisMap = analyses.reduce((m, a) => { m[a.Evaluation_ID] = a; return m; }, {});
    const outcomeSet = new Set(outcomes.map(o => o.Evaluation_ID));
    const atRisk = intakes.filter(i => !outcomeSet.has(i.Evaluation_ID)).map(i => { const analysis = analysisMap[i.Evaluation_ID]; return { evaluation_id: i.Evaluation_ID, client_name: i.Client_Name, staff_name: i.Staff_Name, date: i.Created_Date, cancellation_reason: i.Cancellation_Reason, score: analysis?.Save_Worthiness_Score ?? null, recommended_strategy: analysis?.Recommended_Strategy || null, recommended_program: analysis?.Recommended_Program || null, risk_level: analysis?.Risk_Level || null }; }).sort((a, b) => Number(a.score || 50) - Number(b.score || 50));
    res.json(atRisk);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/save', async (req, res) => {
  try {
    const sheets = await getSheets();
    const { rows } = req.body;
    const headers = Object.keys(rows[0] || {});
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: 'Settings', valueInputOption: 'USER_ENTERED', requestBody: { values: [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))] } });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/programs/save', async (req, res) => {
  try {
    const sheets = await getSheets();
    const { rows } = req.body;
    const headers = Object.keys(rows[0] || {});
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: 'Programs', valueInputOption: 'USER_ENTERED', requestBody: { values: [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))] } });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/policies/save', async (req, res) => {
  try {
    const sheets = await getSheets();
    const { rows } = req.body;
    const headers = Object.keys(rows[0] || {});
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: 'Policies', valueInputOption: 'USER_ENTERED', requestBody: { values: [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))] } });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ─── Drive CSV Routes ──────────────────────────────────────────────────────

// Client lookup: search by name across current-customers and cancelled-service CSVs
app.get('/api/client-lookup', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q || q.length < 2) return res.json([]);
    const [custData, cancelData] = await Promise.all([
      cachedDriveCSV(DRIVE_FOLDER_CUSTOMERS),
      cachedDriveCSV(DRIVE_FOLDER_CANCELLED),
    ]);
    const customers = (custData.rows || []);
    const cancelled = (cancelData.rows || []);

    // Build a map of cancelled clients for enrichment
    const cancelMap = {};
    for (const c of cancelled) {
      const name = (c.Customer || '').toLowerCase();
      if (!cancelMap[name]) cancelMap[name] = c;
    }

    const results = customers
      .filter(c => {
        const full = `${c.First} ${c.Last}`.toLowerCase();
        return full.includes(q) || (c['Company Name'] || '').toLowerCase().includes(q);
      })
      .slice(0, 15)
      .map(c => {
        const full = `${c.First} ${c.Last}`.trim();
        const cancelled = cancelMap[full.toLowerCase()];
        return {
          name: full,
          address: `${c['Address 1']} ${c.City}, ${c.State} ${c.Zip}`.trim(),
          phone: c['Cell Phone'] || c.Phone,
          email: c.Email,
          frequency: c.Frequency,
          base_fee: c['Base Fee'],
          scope: c['Scope of Work'],
          customer_start: c['Customer Start'],
          completed_jobs: c['Completed Jobs'],
          total_revenue: c['Total Revenue'],
          last_job: c['Last Job'],
          last_contact: c['Last Contact'],
          cancelled_date: cancelled?.['Date of Cancellation'] || null,
          cancellation_reason: cancelled?.Reason || null,
          avg_scorecard: cancelled?.['Avg. Scorecard'] || null,
          cancellation_notes: cancelled?.Notes || null,
        };
      });

    res.json(results);
  } catch (err) { console.error('client-lookup error:', err.message); res.status(500).json({ error: err.message }); }
});

// Full current customers list (for search/audit pages)
app.get('/api/drive-customers', async (req, res) => {
  try {
    const data = await cachedDriveCSV(DRIVE_FOLDER_CUSTOMERS);
    const q = (req.query.q || '').toLowerCase();
    let rows = data.rows || [];
    if (q) rows = rows.filter(r => `${r.First} ${r.Last}`.toLowerCase().includes(q) || (r.Email || '').toLowerCase().includes(q));
    res.json({ rows, date: data.date, filename: data.filename });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// Full cancelled service list (enriches at-risk + audit)
app.get('/api/drive-cancelled', async (req, res) => {
  try {
    const data = await cachedDriveCSV(DRIVE_FOLDER_CANCELLED);
    res.json({ rows: data.rows || [], date: data.date, filename: data.filename });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// Enriched at-risk: merges CRIS Sheet data with Drive cancelled CSV
app.get('/api/at-risk-enriched', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes, cancelData] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'AI_Analysis'),
      readTab(sheets, 'Outcomes'),
      cachedDriveCSV(DRIVE_FOLDER_CANCELLED),
    ]);
    const analysisMap = analyses.reduce((m, a) => { m[a.Evaluation_ID] = a; return m; }, {});
    const outcomeSet = new Set(outcomes.map(o => o.Evaluation_ID));

    // Build Drive cancelled map by client name
    const driveMap = {};
    for (const c of (cancelData.rows || [])) {
      const name = (c.Customer || '').toLowerCase().trim();
      if (!driveMap[name]) driveMap[name] = c;
    }

    const atRisk = intakes
      .filter(i => !outcomeSet.has(i.Evaluation_ID))
      .map(i => {
        const analysis = analysisMap[i.Evaluation_ID];
        const driveInfo = driveMap[(i.Client_Name || '').toLowerCase().trim()];
        return {
          evaluation_id: i.Evaluation_ID,
          client_name: i.Client_Name,
          staff_name: i.Staff_Name,
          date: i.Created_Date,
          cancellation_reason: i.Cancellation_Reason,
          score: analysis?.Save_Worthiness_Score ?? null,
          recommended_strategy: analysis?.Recommended_Strategy || null,
          recommended_program: analysis?.Recommended_Program || null,
          risk_level: analysis?.Risk_Level || null,
          // Drive enrichment
          frequency: driveInfo?.Frequency || null,
          bill_rate: driveInfo?.['Bill Rate'] || null,
          avg_scorecard: driveInfo?.['Avg. Scorecard'] || null,
          lead_source: driveInfo?.['Lead Source'] || null,
          client_since: driveInfo?.['Client Since'] || null,
          scope_group: driveInfo?.['Scope Group'] || null,
        };
      })
      .sort((a, b) => Number(a.score || 50) - Number(b.score || 50));

    res.json(atRisk);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// Enriched account audit: merges CRIS Sheet with Drive current-customers
app.get('/api/account-audit-enriched', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes, custData] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'AI_Analysis'),
      readTab(sheets, 'Outcomes'),
      cachedDriveCSV(DRIVE_FOLDER_CUSTOMERS),
    ]);
    const analysisMap = analyses.reduce((m, a) => { m[a.Evaluation_ID] = a; return m; }, {});
    const outcomeMap = outcomes.reduce((m, o) => { m[o.Evaluation_ID] = o; return m; }, {});

    // Build Drive customers map by full name
    const custMap = {};
    for (const c of (custData.rows || [])) {
      const name = `${c.First} ${c.Last}`.toLowerCase().trim();
      custMap[name] = c;
    }

    const evaluations = intakes.map(i => {
      const driveInfo = custMap[(i.Client_Name || '').toLowerCase().trim()];
      return {
        ...i,
        analysis: analysisMap[i.Evaluation_ID] || null,
        outcome: outcomeMap[i.Evaluation_ID] || null,
        drive: driveInfo ? {
          phone: driveInfo['Cell Phone'] || driveInfo.Phone,
          email: driveInfo.Email,
          address: `${driveInfo['Address 1']}, ${driveInfo.City}`,
          frequency: driveInfo.Frequency,
          base_fee: driveInfo['Base Fee'],
          completed_jobs: driveInfo['Completed Jobs'],
          total_revenue: driveInfo['Total Revenue'],
          customer_start: driveInfo['Customer Start'],
          last_job: driveInfo['Last Job'],
        } : null,
      };
    }).reverse();

    res.json({
      evaluations,
      summary: {
        total: intakes.length,
        saved: outcomes.filter(o => o.Outcome === 'Saved').length,
        cancelled: outcomes.filter(o => o.Outcome === 'Cancelled').length,
        no_outcome: intakes.filter(i => !outcomeMap[i.Evaluation_ID]).length,
      },
      drive_date: custData.date,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ─── Technician Cancellation Report ──────────────────────────────────────
// Parses Technician_History_Paste from all evaluations to identify which
// technicians were on cancelled accounts (last cleaner, recent cleans, etc.)
app.get('/api/technician-report', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, outcomes] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'Outcomes'),
    ]);
    const outcomeMap = outcomes.reduce((m, o) => { m[o.Evaluation_ID] = o; return m; }, {});

    // Parse technician lines from MaidCentral paste
    // Lines look like: "Jane Smith - 3/15/2024 - Score: 3.8" or "John Doe | 2024-03-15 | 4.0"
    function parseTechHistory(paste) {
      if (!paste) return [];
      const techs = [];
      const lines = paste.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        // Try common MaidCentral formats
        // Format: "Name - Date - Score X" or "Name | Date | Score X" or "Name  Date  X/4"
        const match =
          line.match(/^(.+?)\s*[-|]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-|]?\s*(?:Score[:\s]*)?(\d+\.?\d*)?/i) ||
          line.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d+\.?\d*)?/i);
        if (match) {
          const name = match[1].trim();
          const date = match[2].trim();
          const score = match[3] ? parseFloat(match[3]) : null;
          if (name && name.length > 1 && name.length < 60) {
            techs.push({ name, date, score });
          }
        }
      }
      return techs;
    }

    // Aggregate by technician
    const techMap = {};

    for (const intake of intakes) {
      const cancelled = !outcomeMap[intake.Evaluation_ID] || outcomeMap[intake.Evaluation_ID]?.Outcome === 'Cancelled';
      const saved = outcomeMap[intake.Evaluation_ID]?.Outcome === 'Saved';
      const pending = !outcomeMap[intake.Evaluation_ID];

      const techLines = parseTechHistory(intake.Technician_History_Paste);
      if (!techLines.length) continue;

      // Last cleaner = first in the list (most recent)
      const lastTech = techLines[0];
      const recentTechs = techLines.slice(0, 5); // last 5 jobs

      // Track each tech that appeared
      const seenInThisEval = new Set();
      for (let i = 0; i < techLines.length; i++) {
        const t = techLines[i];
        if (!t.name) continue;
        if (!techMap[t.name]) {
          techMap[t.name] = {
            name: t.name,
            total_appearances: 0,
            as_last_cleaner: 0,
            cancellations_as_last: 0,
            cancellations_appeared: 0,
            saves_as_last: 0,
            pending_as_last: 0,
            avg_score_sum: 0,
            avg_score_count: 0,
            clients: [],
          };
        }
        const entry = techMap[t.name];
        if (!seenInThisEval.has(t.name)) {
          seenInThisEval.add(t.name);
          entry.total_appearances++;
          if (cancelled) entry.cancellations_appeared++;
        }
        if (t.score != null) {
          entry.avg_score_sum += t.score;
          entry.avg_score_count++;
        }
        // Last cleaner (i === 0)
        if (i === 0) {
          entry.as_last_cleaner++;
          if (cancelled) {
            entry.cancellations_as_last++;
            entry.clients.push({
              client: intake.Client_Name,
              date: intake.Created_Date,
              reason: intake.Cancellation_Reason,
              outcome: 'Cancelled',
              score: t.score,
            });
          } else if (saved) {
            entry.saves_as_last++;
          } else if (pending) {
            entry.pending_as_last++;
          }
        }
      }
    }

    // Convert to sorted array
    const techs = Object.values(techMap).map(t => ({
      ...t,
      avg_score: t.avg_score_count > 0 ? Math.round((t.avg_score_sum / t.avg_score_count) * 100) / 100 : null,
      cancellation_rate: t.as_last_cleaner > 0 ? Math.round((t.cancellations_as_last / t.as_last_cleaner) * 100) : 0,
    })).sort((a, b) => b.cancellations_as_last - a.cancellations_as_last);

    res.json({
      techs,
      total_evaluations: intakes.length,
      total_cancelled: outcomes.filter(o => o.Outcome === 'Cancelled').length,
    });
  } catch (err) {
    console.error('technician-report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve React frontend (MUST be last) ──────────────────────────────────
app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../build', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`CRIS v2 running on port ${PORT}`));
