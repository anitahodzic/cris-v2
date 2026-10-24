require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: [allowedOrigin, 'http://localhost:3000'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ─── Password Protection ───────────────────────────────────────────────────
// All /api routes require a valid password header or query param.
// Set CRIS_PASSWORD in your .env file.
const CRIS_PASSWORD = process.env.CRIS_PASSWORD;

function requirePassword(req, res, next) {
  // Skip health check so Render's health monitor works
  if (req.path === '/api/health') return next();
  // Skip login — handled separately with its own auth
  if (req.path === '/api/login') return next();

  if (!CRIS_PASSWORD) {
    // No password set — warn in logs but allow through (dev mode)
    console.warn('WARNING: CRIS_PASSWORD is not set. All requests are allowed.');
    return next();
  }

  // Accept password from Authorization header: "Bearer yourpassword"
  // or from x-cris-password header
  const authHeader = req.headers['authorization'];
  const headerPassword = req.headers['x-cris-password'];

  const provided =
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null) ||
    headerPassword ||
    null;

  if (provided === CRIS_PASSWORD) return next();

  return res.status(401).json({ error: 'Unauthorized. Invalid or missing password.' });
}

// ─── Login endpoint (public — no password required) ──────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const sheets = await getSheets();
    const users = await readTab(sheets, 'Users');
    const match = users.find(
      u =>
        u.Username?.trim().toLowerCase() === username.trim().toLowerCase() &&
        u.Password?.trim() === password.trim()
    );
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const role = match.Role?.trim() || 'User';
    console.log(`Login: ${match.Username} (${role})`);
    return res.json({ username: match.Username.trim(), role });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});
// Serve React frontend
const path = require('path');
app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`CRIS server running on port ${PORT}`));
app.use(requirePassword);

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Google Sheets Auth ────────────────────────────────────────────────────
function getAuth() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

async function getSheets() {
  const auth = getAuth();
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

async function readTab(sheets, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tabName,
  });
  const [headers, ...rows] = res.data.values || [[]];
  if (!headers) return [];
  return rows.map(row =>
    headers.reduce((obj, h, i) => {
      obj[h] = row[i] ?? '';
      return obj;
    }, {})
  );
}

async function appendRow(sheets, tabName, rowObj, headers) {
  const values = headers.map(h => rowObj[h] ?? '');
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: tabName,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

// ─── Generate Evaluation ID ────────────────────────────────────────────────
function generateEvalId() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `CRIS-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${Math.random().toString(36).substr(2,6).toUpperCase()}`;
}

// ─── Routes ────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Save intake
app.post('/api/intake/save', async (req, res) => {
  try {
    const sheets = await getSheets();
    const data = req.body;
    if (!data.evaluation_id) data.evaluation_id = generateEvalId();
    if (!data.created_date) data.created_date = new Date().toISOString();
    data.ai_analyzed = data.ai_analyzed || 'No';

    const headers = [
      'Evaluation_ID','Created_Date','Staff_Name','Client_Name','Customer_ID',
      'Contact_Method','Current_Status','Customer_Overview_Paste','Cancellation_Reason',
      'Scorecards_Paste','Technician_History_Paste','Service_Set_Paste',
      'Technician_Preferences_Paste','Internal_Notes_Paste','Relevant_SMS_Email_Paste',
      'Saved_Timestamp','AI_Analyzed'
    ];

    // Check if row already exists
    const existing = await readTab(sheets, 'Client_Intake');
    const exists = existing.some(r => r.Evaluation_ID === data.evaluation_id);
    if (!exists) {
      await appendRow(sheets, 'Client_Intake', {
        Evaluation_ID: data.evaluation_id,
        Created_Date: data.created_date,
        Staff_Name: data.staff_name,
        Client_Name: data.client_name,
        Customer_ID: data.customer_id,
        Contact_Method: data.contact_method,
        Current_Status: data.current_status,
        Customer_Overview_Paste: data.customer_overview_paste,
        Cancellation_Reason: data.cancellation_reason,
        Scorecards_Paste: data.scorecards_paste,
        Technician_History_Paste: data.technician_history_paste,
        Service_Set_Paste: data.service_set_paste,
        Technician_Preferences_Paste: data.technician_preferences_paste,
        Internal_Notes_Paste: data.internal_notes_paste,
        Relevant_SMS_Email_Paste: data.relevant_sms_email_paste,
        Saved_Timestamp: new Date().toISOString(),
        AI_Analyzed: 'No',
      }, headers);
    }
    res.json({ ok: true, evaluation_id: data.evaluation_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Analyze client
app.post('/api/analyze', async (req, res) => {
  try {
    const sheets = await getSheets();
    const intake = req.body;

    // Read all reference data
    const [settings, programs, programRules, policies, strategies, strategyMap, frameworks] = await Promise.all([
      readTab(sheets, 'Settings'),
      readTab(sheets, 'Programs'),
      readTab(sheets, 'Program_Rules'),
      readTab(sheets, 'Policies'),
      readTab(sheets, 'Retention_Strategies'),
      readTab(sheets, 'Strategy_Program_Map'),
      readTab(sheets, 'Conversation_Frameworks'),
    ]);

    const activePrograms = programs.filter(p => p.Active === 'Yes' || p.Active === 'TRUE' || p.Active === '1');
    const activePolicies = policies.filter(p => p.Active === 'Yes' || p.Active === 'TRUE' || p.Active === '1');
    const settingsObj = settings.reduce((o, s) => { o[s.Setting_Key] = s.Value; return o; }, {});

    const systemPrompt = `You are CRIS — the Client Relationship Intelligence System for BA House Cleaning.

Your job is to analyze a client cancellation case and return a structured JSON decision report. 

BUSINESS VALUES: WOW, Integrity, Respect, Accountability, Professionalism.

IMPORTANT PHILOSOPHY:
- NOT every client should be saved. Poor-fit clients hurt the team and the business.
- Consider profitability, technician impact, client behavior, and long-term fit.
- Recommend Respectful Cancellation when client fit is genuinely poor.
- Do NOT over-recommend discounts.
- Do NOT recommend Hardship unless hardship is clearly evident.
- Do NOT recommend Flex unless scheduling flexibility is realistic.
- Do NOT recommend Essentials unless reduced scope makes sense.
- Be practical, specific, and direct.

COMPANY SETTINGS:
${JSON.stringify(settingsObj, null, 2)}

ACTIVE PROGRAMS:
${JSON.stringify(activePrograms, null, 2)}

PROGRAM RULES:
${JSON.stringify(programRules, null, 2)}

ACTIVE POLICIES:
${JSON.stringify(activePolicies, null, 2)}

RETENTION STRATEGIES:
${JSON.stringify(strategies, null, 2)}

STRATEGY-PROGRAM MAP:
${JSON.stringify(strategyMap, null, 2)}

CONVERSATION FRAMEWORKS:
${JSON.stringify(frameworks, null, 2)}

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "evaluation_id": "",
  "save_worthiness_score": 0,
  "client_category": "",
  "relationship_score": 0,
  "value_score": 0,
  "operational_fit_score": 0,
  "policy_alignment_score": 0,
  "risk_level": "",
  "primary_cancellation_driver": "",
  "root_cause_evidence": "",
  "recommended_strategy": "",
  "recommended_program": "",
  "backup_program": "",
  "programs_not_recommended": "",
  "programs_not_recommended_reason": "",
  "management_review_required": "",
  "technician_feedback_needed": "",
  "technician_names": "",
  "quality_issue_summary": "",
  "base_hours": "",
  "allowed_hours": "",
  "average_actual_hours": "",
  "hours_difference": "",
  "time_efficiency_analysis": "",
  "revenue_at_risk": "",
  "save_confidence_percent": 0,
  "conversation_objective": "",
  "key_talking_points": "",
  "questions_to_ask": "",
  "what_not_to_say": "",
  "suggested_phone_script": "",
  "follow_up_recommendation": "",
  "ai_summary": ""
}`;

    const userPrompt = `CLIENT CANCELLATION CASE:

Evaluation ID: ${intake.evaluation_id}
Client Name: ${intake.client_name}
Customer ID: ${intake.customer_id}
Staff Member: ${intake.staff_name}
Contact Method: ${intake.contact_method}
Date: ${intake.created_date}

CANCELLATION REASON (exact words):
${intake.cancellation_reason}

CUSTOMER OVERVIEW FROM MAID CENTRAL:
${intake.customer_overview_paste}

SCORECARDS:
${intake.scorecards_paste}

TECHNICIAN HISTORY:
${intake.technician_history_paste}

SERVICE SET INFORMATION:
${intake.service_set_paste}

TECHNICIAN PREFERENCES:
${intake.technician_preferences_paste}

INTERNAL NOTES:
${intake.internal_notes_paste}

RELEVANT SMS/EMAIL:
${intake.relevant_sms_email_paste}

Analyze this case thoroughly and return your JSON decision report.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = message.content[0].text;
    let analysis;
    try {
      analysis = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) analysis = JSON.parse(match[0]);
      else throw new Error('Claude did not return valid JSON');
    }

    analysis.evaluation_id = intake.evaluation_id;
    analysis.analysis_date = new Date().toISOString();

    // Write to AI_Analysis
    const aiHeaders = [
      'Evaluation_ID','Client_Name','Analysis_Date','Save_Worthiness_Score','Client_Category',
      'Relationship_Score','Value_Score','Operational_Fit_Score','Policy_Alignment_Score',
      'Risk_Level','Primary_Cancellation_Driver','Root_Cause_Evidence','Recommended_Strategy',
      'Recommended_Program','Backup_Program','Programs_Not_Recommended','Programs_Not_Recommended_Reason',
      'Management_Review_Required','Technician_Feedback_Needed','Technician_Names','Quality_Issue_Summary',
      'Base_Hours','Allowed_Hours','Average_Actual_Hours','Hours_Difference','Time_Efficiency_Analysis',
      'Revenue_At_Risk','Save_Confidence_Percent','Conversation_Objective','Key_Talking_Points',
      'Questions_To_Ask','What_Not_To_Say','Suggested_Phone_Script','Follow_Up_Recommendation','AI_Summary'
    ];

    await appendRow(sheets, 'AI_Analysis', {
      Evaluation_ID: analysis.evaluation_id,
      Client_Name: intake.client_name,
      Analysis_Date: analysis.analysis_date,
      Save_Worthiness_Score: analysis.save_worthiness_score,
      Client_Category: analysis.client_category,
      Relationship_Score: analysis.relationship_score,
      Value_Score: analysis.value_score,
      Operational_Fit_Score: analysis.operational_fit_score,
      Policy_Alignment_Score: analysis.policy_alignment_score,
      Risk_Level: analysis.risk_level,
      Primary_Cancellation_Driver: analysis.primary_cancellation_driver,
      Root_Cause_Evidence: analysis.root_cause_evidence,
      Recommended_Strategy: analysis.recommended_strategy,
      Recommended_Program: analysis.recommended_program,
      Backup_Program: analysis.backup_program,
      Programs_Not_Recommended: analysis.programs_not_recommended,
      Programs_Not_Recommended_Reason: analysis.programs_not_recommended_reason,
      Management_Review_Required: analysis.management_review_required,
      Technician_Feedback_Needed: analysis.technician_feedback_needed,
      Technician_Names: analysis.technician_names,
      Quality_Issue_Summary: analysis.quality_issue_summary,
      Base_Hours: analysis.base_hours,
      Allowed_Hours: analysis.allowed_hours,
      Average_Actual_Hours: analysis.average_actual_hours,
      Hours_Difference: analysis.hours_difference,
      Time_Efficiency_Analysis: analysis.time_efficiency_analysis,
      Revenue_At_Risk: analysis.revenue_at_risk,
      Save_Confidence_Percent: analysis.save_confidence_percent,
      Conversation_Objective: analysis.conversation_objective,
      Key_Talking_Points: analysis.key_talking_points,
      Questions_To_Ask: analysis.questions_to_ask,
      What_Not_To_Say: analysis.what_not_to_say,
      Suggested_Phone_Script: analysis.suggested_phone_script,
      Follow_Up_Recommendation: analysis.follow_up_recommendation,
      AI_Summary: analysis.ai_summary,
    }, aiHeaders);

    // Mark intake as analyzed
    const intakeRows = await readTab(sheets, 'Client_Intake');
    const rowIndex = intakeRows.findIndex(r => r.Evaluation_ID === intake.evaluation_id);
    if (rowIndex >= 0) {
      const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-based
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Client_Intake!Q${sheetRow}`, // AI_Analyzed column
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Yes']] },
      });
    }

    res.json({ ok: true, analysis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Save outcome
app.post('/api/outcome/save', async (req, res) => {
  try {
    const sheets = await getSheets();
    const data = req.body;
    const headers = [
      'Evaluation_ID','Client_Name','Staff_Name','Program_Offered','Save_Attempted',
      'Client_Response','Outcome','Revenue_Saved','Follow_Up_Date','Closed_Date',
      'Outcome_Notes','Timestamp'
    ];
    await appendRow(sheets, 'Outcomes', {
      Evaluation_ID: data.evaluation_id,
      Client_Name: data.client_name,
      Staff_Name: data.staff_name,
      Program_Offered: data.program_offered,
      Save_Attempted: data.save_attempted,
      Client_Response: data.client_response,
      Outcome: data.outcome,
      Revenue_Saved: data.revenue_saved,
      Follow_Up_Date: data.follow_up_date,
      Closed_Date: data.closed_date,
      Outcome_Notes: data.outcome_notes,
      Timestamp: new Date().toISOString(),
    }, headers);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Search evaluations
app.get('/api/evaluations', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'AI_Analysis'),
      readTab(sheets, 'Outcomes'),
    ]);

    const analysisMap = analyses.reduce((m, a) => { m[a.Evaluation_ID] = a; return m; }, {});
    const outcomeMap = outcomes.reduce((m, o) => { m[o.Evaluation_ID] = o; return m; }, {});

    const combined = intakes.map(i => ({
      ...i,
      analysis: analysisMap[i.Evaluation_ID] || null,
      outcome: outcomeMap[i.Evaluation_ID] || null,
    }));

    // Filter
    const { client_name, evaluation_id, staff_name, status, outcome_filter, program, date_from, date_to } = req.query;
    let result = combined;
    if (client_name) result = result.filter(r => r.Client_Name?.toLowerCase().includes(client_name.toLowerCase()));
    if (evaluation_id) result = result.filter(r => r.Evaluation_ID?.toLowerCase().includes(evaluation_id.toLowerCase()));
    if (staff_name) result = result.filter(r => r.Staff_Name?.toLowerCase().includes(staff_name.toLowerCase()));
    if (status) result = result.filter(r => r.Current_Status === status);
    if (outcome_filter) result = result.filter(r => r.outcome?.Outcome === outcome_filter);
    if (program) result = result.filter(r => r.outcome?.Program_Offered?.toLowerCase().includes(program.toLowerCase()));
    if (date_from) result = result.filter(r => r.Created_Date >= date_from);
    if (date_to) result = result.filter(r => r.Created_Date <= date_to);

    res.json(result.reverse()); // newest first
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get single evaluation
app.get('/api/evaluations/:id', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'AI_Analysis'),
      readTab(sheets, 'Outcomes'),
    ]);
    const intake = intakes.find(r => r.Evaluation_ID === req.params.id);
    if (!intake) return res.status(404).json({ error: 'Not found' });
    const analysis = analyses.find(r => r.Evaluation_ID === req.params.id) || null;
    const outcome = outcomes.find(r => r.Evaluation_ID === req.params.id) || null;
    res.json({ intake, analysis, outcome });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Dashboard stats
app.get('/api/dashboard', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, outcomes] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'Outcomes'),
    ]);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const thisMonthIntakes = intakes.filter(r => r.Created_Date >= monthStart);
    const thisMonthOutcomes = outcomes.filter(r => r.Timestamp >= monthStart);

    const saved = thisMonthOutcomes.filter(r => r.Outcome === 'Saved').length;
    const cancelled = thisMonthOutcomes.filter(r => r.Outcome === 'Cancelled').length;
    const pending = thisMonthIntakes.filter(r =>
      r.Current_Status === 'Pending Follow-Up' || r.Current_Status === 'Pending AI'
    ).length;
    const revenueSaved = thisMonthOutcomes
      .filter(r => r.Outcome === 'Saved' && r.Revenue_Saved)
      .reduce((sum, r) => sum + parseFloat(r.Revenue_Saved.replace(/[^0-9.]/g,'') || 0), 0);

    res.json({
      total_evaluations: thisMonthIntakes.length,
      saved,
      cancelled,
      pending,
      revenue_saved: revenueSaved,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Reference data endpoints
app.get('/api/programs', async (req, res) => {
  try {
    const sheets = await getSheets();
    const data = await readTab(sheets, 'Programs');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/policies', async (req, res) => {
  try {
    const sheets = await getSheets();
    const data = await readTab(sheets, 'Policies');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings', async (req, res) => {
  try {
    const sheets = await getSheets();
    const data = await readTab(sheets, 'Settings');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/monthly-report', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, outcomes] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'Outcomes'),
    ]);

    const { month, year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    const start = new Date(targetYear, targetMonth - 1, 1).toISOString();
    const end = new Date(targetYear, targetMonth, 1).toISOString();

    const monthIntakes = intakes.filter(r => r.Created_Date >= start && r.Created_Date < end);
    const monthOutcomes = outcomes.filter(r => r.Timestamp >= start && r.Timestamp < end);

    const byOutcome = monthOutcomes.reduce((m, r) => {
      m[r.Outcome] = (m[r.Outcome] || 0) + 1; return m;
    }, {});

    const byProgram = monthOutcomes
      .filter(r => r.Program_Offered)
      .reduce((m, r) => {
        m[r.Program_Offered] = (m[r.Program_Offered] || 0) + 1; return m;
      }, {});

    const byStaff = monthOutcomes.reduce((m, r) => {
      if (!r.Staff_Name) return m;
      if (!m[r.Staff_Name]) m[r.Staff_Name] = { saved: 0, cancelled: 0, total: 0 };
      m[r.Staff_Name].total++;
      if (r.Outcome === 'Saved') m[r.Staff_Name].saved++;
      if (r.Outcome === 'Cancelled') m[r.Staff_Name].cancelled++;
      return m;
    }, {});

    const revenueSaved = monthOutcomes
      .filter(r => r.Outcome === 'Saved')
      .reduce((s, r) => s + parseFloat(r.Revenue_Saved?.replace(/[^0-9.]/g,'') || 0), 0);

    const total = monthIntakes.length;
    const saved = byOutcome['Saved'] || 0;
    const saveRate = total > 0 ? Math.round((saved / total) * 100) : 0;

    res.json({
      total_evaluations: total,
      by_outcome: byOutcome,
      save_rate: saveRate,
      revenue_saved: revenueSaved,
      by_program: byProgram,
      by_staff: byStaff,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


