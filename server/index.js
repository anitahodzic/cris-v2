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

// Drive folder IDs — all point to automated-reports subfolders inside BAHC MC Reports (scripts)
// current-customers/automated-reports  (was showing wrong parent)
const DRIVE_FOLDER_CUSTOMERS    = '1tuYg8KTYYCW6ED1wV8s16tXfVdSi5PPe'; // current-customers automated-reports
// cancelled-service/automated-reports
const DRIVE_FOLDER_CANCELLED    = '1ldqOV3sO5yEJ9gjO3jIefdfeSwRI2DsW'; // cancelled-service automated-reports

// Additional report folders (for future use / other CRIS features)
const DRIVE_FOLDER_AVAILABILITY_HOURS  = '1WXuFKhIl7Pa3Ok4cjG8rgaI2qOFCZb20';
const DRIVE_FOLDER_CONTACT_TICKETS     = '1FKLze6cGeas1NTWfqBi3dU15caNLIM6U';
const DRIVE_FOLDER_CONTACT_TICKETS_HIST= '1wOR6N9ML2pNkoJm0Vee3Fg2sIpvkF62H';
const DRIVE_FOLDER_DISPATCH_BOARD      = '1LLvaTq5Ecfr8ZxI3wD56-g21Dj7fgeby';
const DRIVE_FOLDER_DISPATCH_BOARD_HIST = '1J0HGjHsZQPBOSJlay7mN8ZJ8kzS8iXSd';
const DRIVE_FOLDER_EFFICIENCY_MAP      = '1PWB6w_DmZwWvKcNlQMOySSRFBCIlzcgT';
const DRIVE_FOLDER_EMPLOYEE_LIST       = '1h6ZHlxBzpN7L8iKzukfzmuG3UCP6En5x';
const DRIVE_FOLDER_EMPLOYEE_STATS      = '1-TmXhQ0jCWnVVxyfq32F2p0shkUrgySL';
const DRIVE_FOLDER_JOBSTATUS           = '1wyRb22hbuNG16Is8qqs6Evexe_Wu5Y-V';
const DRIVE_FOLDER_JOBSTATUS_HIST      = '1e4yTfJOP4XL5wO8foWNAx48eY5kEK6uU';
const DRIVE_FOLDER_PTO                 = '1cU-wNPWLlHlhsLrwNmynxojRGFvgwCFs';
const DRIVE_FOLDER_SCORECARDS          = '1xWuY9y1lb19zAzIqi9bcSWx5p1wdjHUJ';
const DRIVE_FOLDER_SCORECARDS_HIST     = '15sr5ToKyp2rTzvkvAPOlwvZJF8m8cMJA';

function getAuth(scopes) {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return new google.auth.JWT(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, null, privateKey, scopes || ['https://www.googleapis.com/auth/spreadsheets']);
}

// OAuth2 auth using cs@bahouse refresh token (for Drive access)
function getOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

async function getSheets() {
  const auth = getAuth(['https://www.googleapis.com/auth/spreadsheets']);
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

async function getDrive() {
  // Prefer OAuth2 (cs@bahouse owns the folders) over service account
  const oauth2 = getOAuth2Client();
  if (oauth2) {
    console.log('getDrive: using OAuth2 (cs@bahouse)');
    return google.drive({ version: 'v3', auth: oauth2 });
  }
  console.log('getDrive: using service account (no OAuth2 creds found)');
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
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const file = list.data.files?.[0];
  if (!file) {
    console.warn(`getLatestDriveCSV: no CSV found in folder ${folderId}`);
    return { rows: [], date: null, filename: null };
  }
  console.log(`getLatestDriveCSV: reading ${file.name} from folder ${folderId}`);
  const res = await drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
  const rows = parseCSV(res.data);
  console.log(`getLatestDriveCSV: parsed ${rows.length} rows from ${file.name}`);
  return { rows, date: file.modifiedTime, filename: file.name };
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

// Debug: test Drive folder access and CSV reading
app.get('/api/debug/drive', async (req, res) => {
  try {
    const drive = await getDrive();
    const results = {};

    // Also do a drive-wide search for any CSV files the service account can see
    try {
      const wide = await drive.files.list({
        q: `mimeType='text/csv' and trashed=false`,
        orderBy: 'modifiedTime desc',
        pageSize: 20,
        fields: 'files(id,name,mimeType,modifiedTime,parents)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: 'allDrives',
      });
      results._wide_csv_search = (wide.data.files || []).map(f => ({ name: f.name, id: f.id, parents: f.parents }));
    } catch (e) {
      results._wide_csv_search = { error: e.message };
    }

    for (const [label, folderId] of [['customers', DRIVE_FOLDER_CUSTOMERS], ['cancelled', DRIVE_FOLDER_CANCELLED], ['scorecards', DRIVE_FOLDER_SCORECARDS], ['employee_stats', DRIVE_FOLDER_EMPLOYEE_STATS]]) {
      try {
        const list = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          orderBy: 'modifiedTime desc',
          pageSize: 5,
          fields: 'files(id,name,mimeType,modifiedTime)',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        });
        const files = list.data.files || [];
        const csvFile = files.find(f => f.mimeType === 'text/csv');
        let rowCount = null;
        if (csvFile) {
          const content = await drive.files.get({ fileId: csvFile.id, alt: 'media' }, { responseType: 'text' });
          rowCount = parseCSV(content.data).length;
        }
        results[label] = { folderId, fileCount: files.length, files: files.map(f => ({ name: f.name, mimeType: f.mimeType })), csvFile: csvFile?.name || null, rowCount };
      } catch (e) {
        results[label] = { folderId, error: e.message };
      }
    }
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Debug: list all sheet tab names
app.get('/api/debug/sheets', async (req, res) => {
  try {
    const sheets = await getSheets();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties.title' });
    const tabs = meta.data.sheets.map(s => s.properties.title);
    // Count rows and check technician data presence
    let intakeCount = 0;
    let intakeHeaders = [];
    let techDataCount = 0;
    let sampleRow = null;
    try {
      const rows = await readTab(sheets, 'Client_Intake');
      intakeCount = rows.length;
      if (rows.length > 0) {
        intakeHeaders = Object.keys(rows[0]);
        techDataCount = rows.filter(r => r.Technician_History_Paste?.trim()).length;
        // Find a row with tech data to show as sample
        sampleRow = rows.find(r => r.Technician_History_Paste?.trim()) || null;
        if (sampleRow) sampleRow = { Evaluation_ID: sampleRow.Evaluation_ID, Client_Name: sampleRow.Client_Name, tech_preview: sampleRow.Technician_History_Paste?.slice(0, 200) };
      }
    } catch (e) { intakeHeaders = ['error: ' + e.message]; }
    res.json({ tabs, intakeCount, intakeHeaders, techDataCount, sampleRow });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

    // Server-side Drive lookup — build context from CSV data, no copy-paste needed
    let driveContext = '';
    try {
      const driveData = intake.drive_data; // passed from frontend if already looked up
      let curr = null, canc = null;
      if (driveData) {
        // Frontend already did the lookup — use it
        curr = driveData._type !== 'cancelled' ? driveData : null;
        canc = (driveData._type === 'cancelled' || driveData._type === 'both') ? driveData : null;
      } else {
        // Server-side fallback: search Drive CSVs by client name
        const [currData, cancData] = await Promise.all([
          cachedDriveCSV(DRIVE_FOLDER_CUSTOMERS),
          cachedDriveCSV(DRIVE_FOLDER_CANCELLED),
        ]);
        const currList = currData.rows || [];
        const cancList = cancData.rows || [];
        const lower = (intake.client_name || '').trim().toLowerCase();
        curr = currList.find(r => {
          const n = `${r.First || ''} ${r.Last || ''}`.trim().toLowerCase();
          return n === lower || n.includes(lower) || lower.includes(n);
        }) || null;
        canc = cancList.find(r => {
          const n = (r.Customer || '').trim().toLowerCase();
          return n === lower || n.includes(lower) || lower.includes(n);
        }) || null;
      }

      const lines = [];
      if (curr) {
        lines.push('MAIDCENTRAL PROFILE (from current customers export):');
        if (curr.phone || curr['Phone']) lines.push(`  Phone: ${curr.phone || curr['Phone']}`);
        if (curr.email || curr['Email']) lines.push(`  Email: ${curr.email || curr['Email']}`);
        const addr = [curr['Address 1'] || curr.address, curr['City'] || curr.city, curr['State'] || curr.state].filter(Boolean).join(', ');
        if (addr) lines.push(`  Address: ${addr}`);
        if (curr.frequency || curr['Frequency']) lines.push(`  Frequency: ${curr.frequency || curr['Frequency']}`);
        if (curr.base_fee || curr['Base Fee']) lines.push(`  Base Fee: $${curr.base_fee || curr['Base Fee']}/visit`);
        if (curr.scope || curr['Scope of Work']) lines.push(`  Scope: ${curr.scope || curr['Scope of Work']}`);
        if (curr.customer_start || curr['Customer Start']) lines.push(`  Customer Since: ${curr.customer_start || curr['Customer Start']}`);
        if (curr.completed_jobs || curr['Completed Jobs']) lines.push(`  Completed Jobs: ${curr.completed_jobs || curr['Completed Jobs']}`);
        if (curr.total_revenue || curr['Total Revenue']) lines.push(`  Total Revenue: $${curr.total_revenue || curr['Total Revenue']}`);
        if (curr.last_12_revenue || curr['Last 12 Revenue']) lines.push(`  Last 12 Mo Revenue: $${curr.last_12_revenue || curr['Last 12 Revenue']}`);
        if (curr.last_job || curr['Last Job']) lines.push(`  Last Job: ${curr.last_job || curr['Last Job']}`);
        if (curr.pending_jobs || curr['Pending Jobs']) lines.push(`  Pending Jobs: ${curr.pending_jobs || curr['Pending Jobs']}`);
        if (curr.last_contact || curr['Last Contact']) lines.push(`  Last Contact: ${curr.last_contact || curr['Last Contact']}`);
      }
      if (canc) {
        lines.push('');
        lines.push('CANCELLATION HISTORY (from cancelled-service export):');
        if (canc['Date of Cancellation'] || canc.cancellation_date) lines.push(`  Date Cancelled: ${canc['Date of Cancellation'] || canc.cancellation_date}`);
        if (canc['Reason'] || canc.reason) lines.push(`  Prior Cancel Reason: ${canc['Reason'] || canc.reason}`);
        if (canc['Avg. Scorecard'] || canc.avg_scorecard) lines.push(`  Avg Scorecard: ${canc['Avg. Scorecard'] || canc.avg_scorecard}`);
        if (canc['Last Scorecard'] || canc.last_scorecard) lines.push(`  Last Scorecard: ${canc['Last Scorecard'] || canc.last_scorecard}`);
        if (canc['Cancelled within 60'] || canc.cancelled_within_60) lines.push(`  Cancelled Within 60 Days: ${canc['Cancelled within 60'] || canc.cancelled_within_60}`);
        if (canc['Default Team(s)'] || canc.default_teams) lines.push(`  Default Team: ${canc['Default Team(s)'] || canc.default_teams}`);
        if (canc['Notes'] || canc.cancellation_notes) lines.push(`  Notes: ${canc['Notes'] || canc.cancellation_notes}`);
      }
      if (!curr && !canc) {
        lines.push('MAIDCENTRAL PROFILE: Not found in Drive export (name may not match exactly).');
      }
      driveContext = lines.join('\n');
    } catch (driveErr) {
      console.warn('Drive lookup failed during analyze:', driveErr.message);
      driveContext = 'MAIDCENTRAL PROFILE: Drive lookup unavailable.';
    }

    const userPrompt = `CLIENT CANCELLATION CASE:\n\nEvaluation ID: ${intake.evaluation_id}\nClient Name: ${intake.client_name}\nCustomer ID: ${intake.customer_id || 'N/A'}\nStaff Member: ${intake.staff_name}\nContact Method: ${intake.contact_method}\nDate: ${intake.created_date}\n\nCANCELLATION REASON (exact words from client):\n${intake.cancellation_reason}\n\n${driveContext}\n\nAnalyze this case thoroughly and return your JSON decision report.`;

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
// Also pulls employee stats from Drive if available.
app.get('/api/technician-report', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, outcomes, empStatsResult] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'Outcomes'),
      cachedDriveCSV(DRIVE_FOLDER_EMPLOYEE_STATS).catch(e => { console.warn('employee_stats Drive load failed:', e.message); return { rows: [] }; }),
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

    // Merge with employee stats from Drive if available
    const empStats = empStatsResult.rows || [];
    const empMap = {};
    for (const row of empStats) {
      // Employee stats CSV columns may vary — try common field names
      const name = (row['Employee Name'] || row['Technician'] || row['Name'] || row['name'] || '').trim();
      if (name) empMap[name.toLowerCase()] = row;
    }
    // Annotate each tech with Drive employee stats if found
    const enrichedTechs = techs.map(t => {
      const emp = empMap[t.name.toLowerCase()];
      return emp ? { ...t, emp_stats: emp } : t;
    });

    res.json({
      techs: enrichedTechs,
      employee_stats: empStats,       // raw Drive data (columns vary by MaidCentral export)
      employee_stats_columns: empStats.length > 0 ? Object.keys(empStats[0]) : [],
      total_evaluations: intakes.length,
      total_cancelled: outcomes.filter(o => o.Outcome === 'Cancelled').length,
    });
  } catch (err) {
    console.error('technician-report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Customer Account Audit (AI-powered) ──────────────────────────────────
// POST /api/account-audit/run
// Body: { client_name, drive_data? }
// Looks up Drive CSV data for the client, then asks Claude to produce a
// structured audit report as JSON.
app.post('/api/account-audit/run', async (req, res) => {
  try {
    const { client_name, drive_data } = req.body || {};
    if (!client_name || !client_name.trim()) return res.status(400).json({ error: 'client_name is required' });

    // 1. Resolve Drive profile — prefer pre-fetched drive_data from frontend
    let profile = null;
    let cancellation = null;

    if (drive_data) {
      profile = drive_data;
      if (drive_data._type === 'cancelled' || drive_data._type === 'both') cancellation = drive_data;
    } else {
      const [custData, cancData] = await Promise.all([
        cachedDriveCSV(DRIVE_FOLDER_CUSTOMERS),
        cachedDriveCSV(DRIVE_FOLDER_CANCELLED),
      ]);
      const lower = client_name.trim().toLowerCase();
      profile = (custData.rows || []).find(r => {
        const n = `${r.First || ''} ${r.Last || ''}`.trim().toLowerCase();
        return n === lower || n.includes(lower) || lower.includes(n);
      }) || null;
      cancellation = (cancData.rows || []).find(r => {
        const n = (r.Customer || '').trim().toLowerCase();
        return n === lower || n.includes(lower) || lower.includes(n);
      }) || null;
    }

    // 2. Build a structured context block for the prompt
    const lines = [];
    lines.push(`CLIENT: ${client_name.trim()}`);
    lines.push(`AUDIT DATE: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
    lines.push('');

    if (profile) {
      lines.push('MAIDCENTRAL PROFILE (current customers export):');
      const addr = [profile['Address 1'] || profile.address, profile['City'] || profile.city, profile['State'] || profile.state, profile['Zip'] || profile.zip].filter(Boolean).join(', ');
      if (addr) lines.push(`  Address: ${addr}`);
      if (profile['Cell Phone'] || profile.phone) lines.push(`  Phone: ${profile['Cell Phone'] || profile.phone}`);
      if (profile.Email || profile.email) lines.push(`  Email: ${profile.Email || profile.email}`);
      if (profile.Frequency || profile.frequency) lines.push(`  Frequency: ${profile.Frequency || profile.frequency}`);
      if (profile['Base Fee'] || profile.base_fee) lines.push(`  Base Fee per Visit: $${profile['Base Fee'] || profile.base_fee}`);
      if (profile['Scope of Work'] || profile.scope) lines.push(`  Scope of Work: ${profile['Scope of Work'] || profile.scope}`);
      if (profile['Customer Start'] || profile.customer_start) lines.push(`  Customer Since: ${profile['Customer Start'] || profile.customer_start}`);
      if (profile['Completed Jobs'] || profile.completed_jobs) lines.push(`  Completed Jobs: ${profile['Completed Jobs'] || profile.completed_jobs}`);
      if (profile['Total Revenue'] || profile.total_revenue) lines.push(`  Total Lifetime Revenue: $${profile['Total Revenue'] || profile.total_revenue}`);
      if (profile['Last 12 Revenue'] || profile.last_12_revenue) lines.push(`  Last 12 Months Revenue: $${profile['Last 12 Revenue'] || profile.last_12_revenue}`);
      if (profile['Last Job'] || profile.last_job) lines.push(`  Last Job Date: ${profile['Last Job'] || profile.last_job}`);
      if (profile['Pending Jobs'] || profile.pending_jobs) lines.push(`  Pending Jobs: ${profile['Pending Jobs'] || profile.pending_jobs}`);
      if (profile['Last Contact'] || profile.last_contact) lines.push(`  Last Contact: ${profile['Last Contact'] || profile.last_contact}`);
    } else {
      lines.push('MAIDCENTRAL PROFILE: Not found in current-customers export.');
    }

    if (cancellation) {
      lines.push('');
      lines.push('CANCELLATION HISTORY (cancelled-service export):');
      if (cancellation['Date of Cancellation']) lines.push(`  Date Cancelled: ${cancellation['Date of Cancellation']}`);
      if (cancellation.Reason || cancellation.reason) lines.push(`  Cancellation Reason: ${cancellation.Reason || cancellation.reason}`);
      if (cancellation['Avg. Scorecard'] || cancellation.avg_scorecard) lines.push(`  Avg Scorecard at Cancellation: ${cancellation['Avg. Scorecard'] || cancellation.avg_scorecard}`);
      if (cancellation['Last Scorecard'] || cancellation.last_scorecard) lines.push(`  Last Scorecard: ${cancellation['Last Scorecard'] || cancellation.last_scorecard}`);
      if (cancellation['Cancelled within 60'] || cancellation.cancelled_within_60) lines.push(`  Cancelled Within 60 Days of Start: ${cancellation['Cancelled within 60'] || cancellation.cancelled_within_60}`);
      if (cancellation['Default Team(s)'] || cancellation.default_teams) lines.push(`  Default Team: ${cancellation['Default Team(s)'] || cancellation.default_teams}`);
      if (cancellation['Lead Source'] || cancellation.lead_source) lines.push(`  Lead Source: ${cancellation['Lead Source'] || cancellation.lead_source}`);
      if (cancellation.Notes || cancellation.cancellation_notes) lines.push(`  Notes: ${cancellation.Notes || cancellation.cancellation_notes}`);
    }

    const dataBlock = lines.join('\n');

    // 3. Prompt Claude for a structured audit
    const systemPrompt = `You are CRIS — the Client Relationship Intelligence System for BA House Cleaning, a Diamond Certified residential cleaning company in the East Bay, California.

You are generating a Customer Account Audit. This is NOT a cancellation evaluation — the client may be active and in good standing. Your job is to assess the health of this account based on the MaidCentral data available and return a structured JSON report that helps the team understand whether action is needed.

BA House Cleaning's core values: WOW, Integrity, Respect, Accountability, Professionalism.

DATA AVAILABLE: You have aggregate MaidCentral data (lifetime totals, last job date, revenue, scorecard averages). You do NOT have per-visit detail rows — synthesize from what is available and be transparent about uncertainty.

You MUST return ONLY valid JSON matching this exact schema, with no markdown fencing or explanation:
{
  "status": "On Track" | "Needs Attention" | "Urgent",
  "status_reason": "one short phrase (≤10 words) explaining the status",
  "summary": "2-3 sentences synthesizing the account health signals",
  "review_window": "describe what data was available and any caveats",
  "signals": {
    "time": {
      "headline": "short headline",
      "detail": "what we know about time/frequency patterns"
    },
    "quality": {
      "headline": "short headline (score or N/A)",
      "detail": "what we know about quality signals"
    },
    "feedback": {
      "headline": "short headline",
      "detail": "what we know about client feedback or contact history"
    },
    "tech": {
      "headline": "short headline",
      "detail": "any technician-related observations (use 'No concerns noted' if none)"
    }
  },
  "recommendation": {
    "action": "specific recommended action (1-2 sentences)",
    "why": "evidence-based reason for this recommendation",
    "evidence_count": "how many data signals support this"
  },
  "next_step": {
    "action": "specific next step (1-2 sentences)",
    "owner": "who should do this (Team Lead / Office / Staff / etc.)",
    "due": "when",
    "review_point": "when to follow up"
  }
}`;

    const userPrompt = `Run a Customer Account Audit for the following client:\n\n${dataBlock}\n\nAssess account health, identify any signals worth attention, and return the structured JSON audit report.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = message.content[0].text;
    let audit;
    try {
      audit = JSON.parse(rawText);
    } catch {
      const m = rawText.match(/\{[\s\S]*\}/);
      if (m) audit = JSON.parse(m[0]);
      else throw new Error('Claude did not return valid JSON');
    }

    res.json({
      ok: true,
      client_name: client_name.trim(),
      profile: profile ? {
        address: [profile['Address 1'] || profile.address, profile['City'] || profile.city, profile['State'] || profile.state].filter(Boolean).join(', '),
        phone: profile['Cell Phone'] || profile.phone || null,
        email: profile.Email || profile.email || null,
        frequency: profile.Frequency || profile.frequency || null,
        base_fee: profile['Base Fee'] || profile.base_fee || null,
        scope: profile['Scope of Work'] || profile.scope || null,
        customer_start: profile['Customer Start'] || profile.customer_start || null,
        completed_jobs: profile['Completed Jobs'] || profile.completed_jobs || null,
        total_revenue: profile['Total Revenue'] || profile.total_revenue || null,
        last_12_revenue: profile['Last 12 Revenue'] || profile.last_12_revenue || null,
        last_job: profile['Last Job'] || profile.last_job || null,
        pending_jobs: profile['Pending Jobs'] || profile.pending_jobs || null,
        last_contact: profile['Last Contact'] || profile.last_contact || null,
      } : null,
      cancellation: cancellation ? {
        date: cancellation['Date of Cancellation'] || null,
        reason: cancellation.Reason || cancellation.reason || null,
        avg_scorecard: cancellation['Avg. Scorecard'] || cancellation.avg_scorecard || null,
        last_scorecard: cancellation['Last Scorecard'] || cancellation.last_scorecard || null,
        notes: cancellation.Notes || cancellation.cancellation_notes || null,
      } : null,
      audit,
    });
  } catch (err) {
    console.error('account-audit/run error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Risk Scan — proactive scoring of ALL Drive customers ─────────────────
const riskScanCache = { ts: 0, data: null };

function parseDateField(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  if (!s) return null;

  // M/D/YYYY or MM/DD/YYYY (MaidCentral export format)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const d = new Date(parseInt(mdy[3]), parseInt(mdy[1]) - 1, parseInt(mdy[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const d = new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  // Fall back to native parse (handles ISO 8601, etc.)
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function daysSince(dateStr) {
  const d = parseDateField(dateStr);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// Build full name from a Drive CSV row — handles both combined "Customer Name" and split "First"/"Last" columns
function custFullName(cust) {
  if (cust['Customer Name'] && cust['Customer Name'].trim()) return cust['Customer Name'].trim();
  if (cust['name'] && cust['name'].trim()) return cust['name'].trim();
  const first = (cust['First'] || '').trim();
  const last  = (cust['Last']  || '').trim();
  return [first, last].filter(Boolean).join(' ');
}

function scoreClient(cust, scorecardRow, cancelledNames) {
  let score = 100;
  const signals = [];

  // 1. Scorecard average (0-4 scale) — lower avg = higher risk
  const avg = parseFloat(scorecardRow?.avg_scorecard || scorecardRow?.['Avg Scorecard'] || -1);
  if (avg >= 0) {
    if (avg < 2.5)      { score -= 30; signals.push(`Low scorecard avg (${avg.toFixed(1)}/4)`); }
    else if (avg < 3.0) { score -= 18; signals.push(`Below-avg scorecard (${avg.toFixed(1)}/4)`); }
    else if (avg < 3.5) { score -= 8;  }
  }

  // 2. Days since last job — MaidCentral exports this as "Last Job"
  const lastJob = cust['Last Job'] || cust['Last Job Date'] || cust['last_job'];
  const daysJob = daysSince(lastJob);
  if (daysJob !== null) {
    if (daysJob > 90)       { score -= 25; signals.push(`No job in ${daysJob} days`); }
    else if (daysJob > 45)  { score -= 12; signals.push(`No job in ${daysJob} days`); }
    else if (daysJob > 21)  { score -= 5;  }
  }

  // 3. Days since last contact — MaidCentral exports as "Last Contact"
  const lastContact = cust['Last Contact'] || cust['Last Contact Date'] || cust['last_contact'];
  const daysContact = daysSince(lastContact);
  if (daysContact !== null) {
    if (daysContact > 60)      { score -= 20; signals.push(`No contact in ${daysContact} days`); }
    else if (daysContact > 30) { score -= 10; }
  }

  // 4. Frequency — monthly/every-4-weeks clients are more at-risk than weekly
  const freq = (cust['Frequency'] || cust['frequency'] || '').toLowerCase();
  if (freq.includes('month') || freq.includes('one-time') || freq.includes('every 4')) { score -= 8; }
  else if (freq.includes('bi') || freq.includes('every 3')) { score -= 3; }

  // 5. Revenue drop signal — Last 12 Revenue much lower than Total Revenue avg suggests declining service
  const total12 = parseFloat((cust['Last 12 Revenue'] || '').toString().replace(/[^0-9.]/g, ''));
  const completedJobs = parseInt(cust['Completed Jobs'] || '0', 10);
  const baseFee = parseFloat((cust['Base Fee'] || '').toString().replace(/[^0-9.]/g, ''));
  if (!isNaN(total12) && !isNaN(baseFee) && baseFee > 0 && completedJobs > 0) {
    const expectedAnnual = baseFee * 26; // assume every-2-weeks baseline
    if (total12 < expectedAnnual * 0.5) { score -= 10; signals.push('Revenue well below expected'); }
  }

  // 6. Pending jobs = 0 and last job was recent — may have paused or cancelled quietly
  const pending = parseInt(cust['Pending Jobs'] || '0', 10);
  if (!isNaN(pending) && pending === 0 && daysJob !== null && daysJob > 14) {
    score -= 12;
    if (!signals.find(s => s.includes('job'))) signals.push('No pending jobs scheduled');
  }

  // 7. Previously cancelled (in cancelled CSV)
  if (cancelledNames.has(custFullName(cust).toLowerCase())) {
    score -= 15;
    signals.push('Previously cancelled');
  }

  // Clamp
  score = Math.max(5, Math.min(100, Math.round(score)));

  // Tier
  let tier;
  if (score <= 40)      tier = 'High';
  else if (score <= 65) tier = 'Medium';
  else if (score <= 80) tier = 'Low';
  else                  tier = 'Very Low';

  return { score, tier, top_signal: signals[0] || null, signals };
}

app.get('/api/risk-scan', async (req, res) => {
  try {
    const now = Date.now();
    if (riskScanCache.data && now - riskScanCache.ts < 5 * 60 * 1000) {
      return res.json(riskScanCache.data);
    }

    // Load Drive + Sheets data in parallel — each independently so one failure doesn't break the scan
    const [custResult2, cancelledResult2, scorecardResult2, sheetsData] = await Promise.allSettled([
      cachedDriveCSV(DRIVE_FOLDER_CUSTOMERS),
      cachedDriveCSV(DRIVE_FOLDER_CANCELLED),
      cachedDriveCSV(DRIVE_FOLDER_SCORECARDS),
      // Load active evaluations from Sheets to build the exclusion list
      getSheets().then(sheets => Promise.all([
        readTab(sheets, 'Client_Intake'),
        readTab(sheets, 'Outcomes'),
      ])).catch(e => { console.warn('risk-scan: sheets load failed (non-fatal):', e.message); return [[], []]; }),
    ]);

    if (custResult2.status === 'rejected') {
      console.error('risk-scan: customers folder failed:', custResult2.reason?.message);
      return res.status(503).json({ error: 'Could not load customer data from Drive: ' + custResult2.reason?.message });
    }
    if (cancelledResult2.status === 'rejected') console.warn('risk-scan: cancelled folder failed (non-fatal):', cancelledResult2.reason?.message);
    if (scorecardResult2.status === 'rejected') console.warn('risk-scan: scorecards folder failed (non-fatal):', scorecardResult2.reason?.message);

    const customers = custResult2.value.rows || [];
    const cancelled = cancelledResult2.status === 'fulfilled' ? (cancelledResult2.value.rows || []) : [];
    const scorecards = scorecardResult2.status === 'fulfilled' ? (scorecardResult2.value.rows || []) : [];

    // Build exclusion sets from Sheets:
    // - Clients already in Client_Intake with NO outcome = active/open evaluations (these are "reactive" pipeline)
    // - Clients already in Client_Intake with an outcome = already handled, still exclude from proactive scan
    const [intakeRows, outcomeRows] = sheetsData.status === 'fulfilled' ? sheetsData.value : [[], []];
    const intakeClientNames = new Set(intakeRows.map(r => (r.Client_Name || '').trim().toLowerCase()).filter(Boolean));
    const outcomeClientIds = new Set(outcomeRows.map(r => (r.Evaluation_ID || '').trim()).filter(Boolean));
    // Active (open) evaluations = in intake but no matching outcome
    const openEvalNames = new Set(
      intakeRows
        .filter(r => !outcomeClientIds.has((r.Evaluation_ID || '').trim()))
        .map(r => (r.Client_Name || '').trim().toLowerCase())
        .filter(Boolean)
    );

    // Build cancelled name set for quick lookup
    const cancelledNames = new Set(
      cancelled.map(r => custFullName(r).toLowerCase()).filter(Boolean)
    );

    // Build scorecard map: customer name → row
    const scorecardMap = {};
    for (const row of scorecards) {
      const name = custFullName(row).toLowerCase();
      if (name) scorecardMap[name] = row;
    }

    // Score every customer — exclude those already in the CRIS evaluation pipeline
    const clients = customers
      .filter(c => {
        const name = custFullName(c);
        if (!name) return false;
        // Only exclude if there's a real name match against open evaluations
        if (name.length > 0 && openEvalNames.has(name.toLowerCase())) return false;
        return true;
      })
      .map(cust => {
        const name = custFullName(cust);
        const nameLow = name.toLowerCase();
        const scorecardRow = scorecardMap[nameLow] || null;
        const { score, tier, top_signal, signals } = scoreClient(cust, scorecardRow, cancelledNames);
        return {
          name,
          frequency: cust['Frequency'] || cust['frequency'] || '',
          last_job: cust['Last Job'] || cust['Last Job Date'] || cust['last_job'] || '',
          last_contact: cust['Last Contact'] || cust['Last Contact Date'] || cust['last_contact'] || '',
          pending_jobs: cust['Pending Jobs'] || '0',
          base_fee: cust['Base Fee'] || '',
          last_12_revenue: cust['Last 12 Revenue'] || '',
          avg_scorecard: scorecardRow ? (scorecardRow['avg_scorecard'] || scorecardRow['Avg Scorecard'] || null) : null,
          risk_score: score,
          risk_tier: tier,
          top_signal,
          signals,  // all risk signals that fired, shown in UI
        };
      })
      .sort((a, b) => a.risk_score - b.risk_score);

    const high_risk   = clients.filter(c => c.risk_score <= 40).length;
    const medium_risk = clients.filter(c => c.risk_score > 40 && c.risk_score <= 65).length;
    const very_low    = clients.filter(c => c.risk_score > 80).length;

    const result = {
      total_clients: clients.length,
      high_risk,
      medium_risk,
      very_low_risk: very_low,
      scan_date: new Date().toISOString(),
      excluded_in_pipeline: openEvalNames.size,
      clients,
    };

    riskScanCache.ts   = now;
    riskScanCache.data = result;

    res.json(result);
  } catch (err) {
    console.error('risk-scan error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Check-in log — track proactive outreach to at-risk clients ──────────
// Stored in a Check_Ins sheet tab: Checkin_ID, Client_Name, Date, Staff_Name,
// Contact_Method, Notes, Risk_Tier_Before, Risk_Tier_After

const CHECKIN_HEADERS = ['Checkin_ID','Client_Name','Date','Staff_Name','Contact_Method','Notes','Risk_Tier_Before','Risk_Tier_After'];

async function ensureCheckInTab(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties.title' });
  const tabs = meta.data.sheets.map(s => s.properties.title);
  if (!tabs.includes('Check_Ins')) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: 'Check_Ins' } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: 'Check_Ins!A1', valueInputOption: 'RAW', requestBody: { values: [CHECKIN_HEADERS] } });
  }
}

// Get all check-ins (optionally filtered by client name)
app.get('/api/check-ins', async (req, res) => {
  try {
    const sheets = await getSheets();
    await ensureCheckInTab(sheets);
    const rows = await readTab(sheets, 'Check_Ins');
    const { client } = req.query;
    const filtered = client
      ? rows.filter(r => (r.Client_Name || '').toLowerCase() === client.toLowerCase())
      : rows;
    res.json(filtered);
  } catch (err) {
    console.error('check-ins GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Log a new check-in
app.post('/api/check-ins', async (req, res) => {
  try {
    const { client_name, staff_name, contact_method, notes, risk_tier_before, risk_tier_after } = req.body;
    if (!client_name) return res.status(400).json({ error: 'client_name required' });

    const sheets = await getSheets();
    await ensureCheckInTab(sheets);

    const checkin_id = `CI-${Date.now()}`;
    const date = new Date().toISOString().split('T')[0];
    const row = {
      Checkin_ID: checkin_id, Client_Name: client_name, Date: date,
      Staff_Name: staff_name || '', Contact_Method: contact_method || '',
      Notes: notes || '', Risk_Tier_Before: risk_tier_before || '',
      Risk_Tier_After: risk_tier_after || '',
    };
    await appendRow(sheets, 'Check_Ins', row, CHECKIN_HEADERS);
    // Invalidate risk scan cache so the page refreshes
    riskScanCache.ts = 0;
    res.json({ ok: true, checkin_id });
  } catch (err) {
    console.error('check-ins POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Ask CRIS — AI chat with real Drive + Sheets context ─────────────────
app.post('/api/ask-cris', async (req, res) => {
  try {
    const { messages = [], question } = req.body;

    // Load Drive data for context (use cache) — load each independently so one failure doesn't kill all
    let contextBlocks = [];
    const [custResult, cancelledResult, scorecardResult] = await Promise.allSettled([
      cachedDriveCSV(DRIVE_FOLDER_CUSTOMERS),
      cachedDriveCSV(DRIVE_FOLDER_CANCELLED),
      cachedDriveCSV(DRIVE_FOLDER_SCORECARDS),
    ]);

    if (custResult.status === 'fulfilled') {
      const customers = (custResult.value.rows || []).slice(0, 400);
      if (customers.length) contextBlocks.push(`## Current Customers (${customers.length} rows)\n${JSON.stringify(customers, null, 0).slice(0, 40000)}`);
      else console.warn('ask-cris: customers folder returned 0 rows');
    } else {
      console.error('ask-cris: customers Drive load failed:', custResult.reason?.message);
    }
    if (cancelledResult.status === 'fulfilled') {
      const cancelled = (cancelledResult.value.rows || []).slice(0, 200);
      if (cancelled.length) contextBlocks.push(`## Cancelled Customers (${cancelled.length} rows)\n${JSON.stringify(cancelled, null, 0).slice(0, 20000)}`);
    } else {
      console.error('ask-cris: cancelled Drive load failed:', cancelledResult.reason?.message);
    }
    if (scorecardResult.status === 'fulfilled') {
      const scorecards = (scorecardResult.value.rows || []).slice(0, 400);
      if (scorecards.length) contextBlocks.push(`## Scorecard Averages (${scorecards.length} rows)\n${JSON.stringify(scorecards, null, 0).slice(0, 20000)}`);
    } else {
      console.warn('ask-cris: scorecards Drive load failed (non-critical):', scorecardResult.reason?.message);
    }

    if (contextBlocks.length === 0) {
      contextBlocks.push('## Note\nLive Drive data could not be loaded. Please answer from any available Sheets data below and general knowledge about BA House Cleaning.');
    }

    // Also pull Sheets data (Programs, Policies, Settings) if available
    try {
      const sheets = await getSheets();
      const [programs, policies] = await Promise.all([
        readTab(sheets, 'Programs').catch(() => []),
        readTab(sheets, 'Policies').catch(() => []),
      ]);
      if (programs.length) contextBlocks.push(`## Programs\n${JSON.stringify(programs, null, 0)}`);
      if (policies.length) contextBlocks.push(`## Retention Policies\n${JSON.stringify(policies, null, 0)}`);
    } catch (_) { /* Sheets optional */ }

    const systemPrompt = `You are CRIS — Client Retention Intelligence System — the AI assistant for BA House Cleaning (BAHC). You have access to real, live client data pulled directly from MaidCentral via Google Drive. Answer questions about clients, cancellation trends, revenue, risk, and retention strategies.

Be concise, specific, and actionable. When citing data, reference client names and numbers directly. Format answers with clear structure (short paragraphs, bullet points for lists). If asked about a specific client, pull their exact data. If asked about trends, compute counts/averages from the data.

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

--- LIVE DATA CONTEXT ---
${contextBlocks.join('\n\n')}
--- END DATA ---`;

    // Build message history for Claude (last 10 turns for context)
    const history = (messages || []).slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Add current question if not already in history
    const lastMsg = history[history.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') {
      history.push({ role: 'user', content: question || 'Hello' });
    }

    const completion = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages: history,
    });

    const reply = completion.content?.[0]?.text || 'I couldn\'t generate a response.';
    res.json({ reply });
  } catch (err) {
    console.error('ask-cris error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve React frontend (MUST be last) ──────────────────────────────────
app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../build', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`CRIS v2 running on port ${PORT}`));
