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
const DRIVE_FOLDER_SCORECARDS          = '1xWuY9y1lb19zAzlqi9bcSWx5p1wdjHUJ';
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

// Recent saves feed — for the Risk Tracker "wins" panel
app.get('/api/recent-saves', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, outcomes] = await Promise.all([readTab(sheets,'Client_Intake'),readTab(sheets,'Outcomes')]);
    const intakeMap = intakes.reduce((m, r) => { m[r.Evaluation_ID] = r; return m; }, {});
    const days = parseInt(req.query.days || '60', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const saves = outcomes
      .filter(r => r.Outcome === 'Saved' && r.Timestamp >= since)
      .map(r => ({
        client_name: r.Client_Name || intakeMap[r.Evaluation_ID]?.Client_Name || '',
        staff_name: r.Staff_Name || intakeMap[r.Evaluation_ID]?.Staff_Name || '',
        program: r.Program_Offered || '',
        revenue_saved: r.Revenue_Saved || '',
        date: r.Closed_Date || r.Timestamp?.split('T')[0] || '',
        timestamp: r.Timestamp || '',
      }))
      .filter(r => r.client_name)
      .sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
      .slice(0, 20);
    res.json({ saves });
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

app.get('/api/holidays', async (req, res) => {
  try {
    const sheets = await getSheets();
    const rows = await readTab(sheets, 'Holidays').catch(() => []);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/holidays/save', async (req, res) => {
  try {
    const sheets = await getSheets();
    const { rows } = req.body;
    const headers = ['Holiday_Name', 'Date', 'Active'];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Holidays',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers, ...rows.map(r => [r.Holiday_Name ?? '', r.Date ?? '', r.Active ?? 'Yes'])] },
    });
    // Bust risk-scan cache so scoring reloads holiday list next run
    riskScanCache.data = null;
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

// ─── Client Tech History (for Account Audit table) ────────────────────────
// GET /api/client-tech-history?name=<client name>
// Returns per-technician visit breakdown from dispatch board + scorecard data
app.get('/api/client-tech-history', async (req, res) => {
  try {
    const name = (req.query.name || '').trim().toLowerCase();
    if (!name) return res.status(400).json({ error: 'name required' });

    const [dispatchResult, custResult] = await Promise.all([
      cachedDriveCSV(DRIVE_FOLDER_DISPATCH_BOARD),
      cachedDriveCSV(DRIVE_FOLDER_CUSTOMERS),
    ]);

    const dispatchRows = dispatchResult.rows || [];
    const custRows = custResult.rows || [];

    // Match client from customers CSV
    const profile = custRows.find(r => {
      const full = `${r.First || ''} ${r.Last || ''}`.trim().toLowerCase();
      return full === name || full.includes(name) || name.includes(full);
    });

    // Filter dispatch rows for this client
    const clientRows = dispatchRows.filter(r => {
      const customer = (r['Customer'] || '').replace(/\*$/, '').trim().toLowerCase();
      return customer === name || customer.includes(name) || name.includes(customer);
    });

    // Parse allowed vs actual hours if available
    // Dispatch board may have "Allowed" and "Actual" columns
    const byTech = {};
    for (const row of clientRows) {
      const tech = (row['Team'] || row['Technician'] || '').trim();
      if (!tech) continue;
      const scorecard = row['Scorecard'] != null && row['Scorecard'] !== '' ? parseFloat(row['Scorecard']) : null;
      const scheduledStr = row['Scheduled'] || '';
      const datePart = scheduledStr.split(' ')[0];
      const allowed = row['Allowed'] != null && row['Allowed'] !== '' ? parseFloat(row['Allowed']) : null;
      const actual = row['Actual'] != null && row['Actual'] !== '' ? parseFloat(row['Actual']) : null;
      const status = (row['Status'] || '').toLowerCase();
      if (status === 'cancelled' || status === 'client cancelled') continue; // skip cancelled visits

      if (!byTech[tech]) byTech[tech] = { tech, visits: 0, scorecards: [], last_date: null, allowed_total: 0, actual_total: 0, has_hours: false };
      byTech[tech].visits++;
      if (scorecard != null) byTech[tech].scorecards.push(scorecard);
      if (datePart) {
        const d = new Date(datePart);
        if (!byTech[tech].last_date || d > new Date(byTech[tech].last_date)) byTech[tech].last_date = datePart;
      }
      if (allowed != null) { byTech[tech].allowed_total += allowed; byTech[tech].has_hours = true; }
      if (actual != null) { byTech[tech].actual_total += actual; byTech[tech].has_hours = true; }
    }

    const techs = Object.values(byTech).map(t => {
      const avg_scorecard = t.scorecards.length ? (t.scorecards.reduce((s, v) => s + v, 0) / t.scorecards.length) : null;
      const efficiency = t.has_hours && t.allowed_total > 0
        ? Math.round((t.allowed_total / t.actual_total) * 100)
        : null;
      const pct_vs_allowed = t.has_hours && t.allowed_total > 0 && t.actual_total > 0
        ? Math.round(((t.actual_total - t.allowed_total) / t.allowed_total) * 100)
        : null;
      return {
        tech: t.tech,
        visits: t.visits,
        avg_scorecard: avg_scorecard != null ? Math.round(avg_scorecard * 10) / 10 : null,
        last_date: t.last_date,
        efficiency,
        pct_vs_allowed,
        has_hours: t.has_hours,
      };
    }).sort((a, b) => b.visits - a.visits);

    const totalVisits = clientRows.length;
    const allScorecards = clientRows.map(r => r['Scorecard']).filter(v => v != null && v !== '').map(Number);
    const avgOverall = allScorecards.length ? (allScorecards.reduce((s, v) => s + v, 0) / allScorecards.length) : null;

    // Recommendation logic
    let recommendations = [];
    if (techs.length === 0) {
      recommendations.push('No visit history found in dispatch board for this client.');
    } else {
      const primaryTech = techs[0];
      if (primaryTech.avg_scorecard != null && primaryTech.avg_scorecard < 3.0) {
        recommendations.push(`${primaryTech.tech} has an average scorecard of ${primaryTech.avg_scorecard.toFixed(1)} — consider a different technician.`);
      }
      if (primaryTech.pct_vs_allowed != null && primaryTech.pct_vs_allowed > 10) {
        recommendations.push(`${primaryTech.tech} is running ${primaryTech.pct_vs_allowed}% over allowed time — scope or rate review recommended.`);
      } else if (primaryTech.pct_vs_allowed != null && primaryTech.pct_vs_allowed < -10) {
        recommendations.push(`${primaryTech.tech} is finishing ${Math.abs(primaryTech.pct_vs_allowed)}% under allowed time — verify quality or adjust rate.`);
      }
      if (recommendations.length === 0) {
        const within = primaryTech.pct_vs_allowed != null ? ` Recent actual is within ${Math.abs(primaryTech.pct_vs_allowed)}% of allowed.` : '';
        recommendations.push(`No change to hours or rate.${within}`);
      }
    }

    res.json({
      client_name: profile ? `${profile.First || ''} ${profile.Last || ''}`.trim() : req.query.name,
      profile: profile ? {
        area: profile['Area'] || profile['Zone'] || profile['Region'] || null,
        frequency: profile['Frequency'] || null,
        service_type: profile['Scope of Work'] || profile['Service Type'] || null,
        default_team: profile['Default Team(s)'] || profile['Team'] || null,
        base_fee: profile['Base Fee'] || null,
        customer_start: profile['Customer Start'] || null,
        completed_jobs: profile['Completed Jobs'] || null,
      } : null,
      techs,
      total_visits: totalVisits,
      avg_scorecard: avgOverall != null ? Math.round(avgOverall * 100) / 100 : null,
      recommendations,
      has_dispatch_data: clientRows.length > 0,
    });
  } catch (err) { console.error('client-tech-history error:', err.message); res.status(500).json({ error: err.message }); }
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

// ─── Scoring model ────────────────────────────────────────────────────────────
// Score = noSCPart + avgPart + badPart + gapPart, capped at 100
//   noSCPart : 60 if no scorecards in last 90d, else 0
//              (no scorecards alone = High tier, per tier definitions)
//   avgPart  : MAX(0, MIN(40, (4 - avgScore90d) * 10))  — only when scorecard exists
//   badPart  : MIN(20, badStatusCount90d * 10)
//   gapPart  : MIN(20, MAX(0, (daysSinceLastClosedJob - 28) / 2))
// Bad status = Skipped, Lock Out, Cancelled, Moved (non-holiday) — bumps excluded
// Tiers: ≥60 = High, ≥40 = Medium, ≥20 = Low, <20 = Very Low
function scoreClient(cust, scorecardRow, cancelledNames) {
  const signals = [];

  // 1. Scorecard component
  const avgRaw = scorecardRow?.avg_scorecard ?? scorecardRow?.['Avg Scorecard'] ?? null;
  const avg = avgRaw !== null && avgRaw !== '' ? parseFloat(avgRaw) : null;
  const noSC = (avg === null || isNaN(avg));
  const noSCPart = noSC ? 60 : 0;  // 60 so no-scorecard alone = High (≥60)
  const avgPart  = noSC ? 0 : Math.max(0, Math.min(40, (4 - avg) * 10));

  if (noSC) {
    signals.push('No scorecards (90d)');
  } else if (avg < 3) {
    signals.push(`Low score avg (${avg.toFixed(2)})`);
  }

  // 2. Bad status count (comes from Drive CSV export; field name varies)
  const badCount = parseInt(
    cust['Bad Status Count'] || cust['bad_status_count'] || cust['Bad Status'] || '0', 10
  ) || 0;
  const badPart = Math.min(20, badCount * 10);
  if (badCount > 0) signals.push(`${badCount} bad status (90d)`);

  // 3. Days since last closed job (gap component)
  const lastJob = cust['Last Job'] || cust['Last Job Date'] || cust['last_job'] || '';
  const daysJob = daysSince(lastJob);
  const gapPart = daysJob !== null ? Math.min(20, Math.max(0, (daysJob - 28) / 2)) : 0;
  if (daysJob !== null && daysJob >= 35) signals.push(`Long gap (${daysJob} days)`);

  // 4. Previously cancelled — extra context signal (no scoring change, matches sheet)
  if (cancelledNames.has(custFullName(cust).toLowerCase())) {
    signals.push('Previously cancelled');
  }

  const score = Math.min(100, Math.round(noSCPart + avgPart + badPart + gapPart));

  // Tiers
  let tier;
  if      (score >= 60) tier = 'High';
  else if (score >= 40) tier = 'Medium';
  else if (score >= 20) tier = 'Low';
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

    // Build scorecard map: customer name → { avg_scorecard, count_90d }
    // Scorecard CSV has individual survey rows: Customer, Job Date, Response ("4 - We're Thrilled…")
    // We compute the 90-day average per customer here.
    const cutoff90 = new Date();
    cutoff90.setDate(cutoff90.getDate() - 90);
    const scorecardBuckets = {}; // name → [scores]
    for (const row of scorecards) {
      const name = (row['Customer'] || custFullName(row) || '').toLowerCase().trim();
      if (!name) continue;
      const jobDate = parseDateField(row['Job Date'] || '');
      if (!jobDate || jobDate < cutoff90) continue;
      // Response column: "4 - We're Thrilled - Great Work" → parse leading digit
      const responseRaw = row['Response'] || '';
      const scoreMatch = responseRaw.match(/^(\d+)/);
      if (!scoreMatch) continue;
      const scoreVal = parseInt(scoreMatch[1], 10);
      if (isNaN(scoreVal) || scoreVal < 1 || scoreVal > 4) continue;
      if (!scorecardBuckets[name]) scorecardBuckets[name] = [];
      scorecardBuckets[name].push(scoreVal);
    }
    const scorecardMap = {};
    for (const [name, scores] of Object.entries(scorecardBuckets)) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      scorecardMap[name] = { avg_scorecard: avg, count_90d: scores.length };
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
          avg_scorecard: scorecardRow ? scorecardRow.avg_scorecard : null,
          scorecard_count_90d: scorecardRow ? scorecardRow.count_90d : 0,
          risk_score: score,
          risk_tier: tier,
          top_signal,
          signals,  // all risk signals that fired, shown in UI
        };
      })
      .sort((a, b) => a.risk_score - b.risk_score);

    // Tiers (risk-UP scale: higher score = more risk)
    // ≥60 = High, ≥40 = Medium, ≥20 = Low, <20 = Very Low
    const high_risk   = clients.filter(c => c.risk_score >= 60).length;
    const medium_risk = clients.filter(c => c.risk_score >= 40 && c.risk_score < 60).length;
    const low_risk    = clients.filter(c => c.risk_score >= 20 && c.risk_score < 40).length;
    const very_low    = clients.filter(c => c.risk_score < 20).length;

    const result = {
      total_clients: clients.length,
      high_risk,
      medium_risk,
      low_risk,
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

// ─── L2 Ticket endpoints ──────────────────────────────────────────────────
// Google Sheet tab: "L2_Tickets"
// Columns: A=Date, B=Client_Name, C=Risk_Score, D=Tier, E=Risk_Reason, F=Created_By, G=MC_Ticket_ID

const L2_SHEET_NAME = 'L2_Tickets';

async function ensureL2Tab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some(s => s.properties.title === L2_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: L2_SHEET_NAME } } }],
      },
    });
    // Add header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${L2_SHEET_NAME}!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Date', 'Client_Name', 'Risk_Score', 'Tier', 'Risk_Reason', 'Created_By', 'MC_Ticket_ID']] },
    });
  }
}

// GET /api/l2-tickets — list all logged tickets
app.get('/api/l2-tickets', async (req, res) => {
  try {
    const auth   = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEET_ID;
    await ensureL2Tab(sheets, spreadsheetId);
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${L2_SHEET_NAME}!A2:G`,
    });
    const rows = resp.data.values || [];
    const tickets = rows.map(r => ({
      date:        r[0] || '',
      client_name: r[1] || '',
      risk_score:  r[2] || '',
      tier:        r[3] || '',
      risk_reason: r[4] || '',
      created_by:  r[5] || '',
      mc_ticket_id: r[6] || '',
    }));
    res.json({ tickets });
  } catch (err) {
    console.error('l2-tickets GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/l2-tickets — log a new L2 ticket
app.post('/api/l2-tickets', async (req, res) => {
  try {
    const { client_name, risk_score, tier, risk_reason, created_by, mc_ticket_id } = req.body;
    if (!client_name) return res.status(400).json({ error: 'client_name required' });

    const auth   = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEET_ID;
    await ensureL2Tab(sheets, spreadsheetId);

    const date = new Date().toLocaleDateString('en-US');
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${L2_SHEET_NAME}!A:G`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[date, client_name, risk_score || '', tier || '', risk_reason || '', created_by || '', mc_ticket_id || '']],
      },
    });
    res.json({ ok: true, date, client_name });
  } catch (err) {
    console.error('l2-tickets POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/l2-tickets/bulk — seed multiple historical tickets at once
app.post('/api/l2-tickets/bulk', async (req, res) => {
  try {
    const { tickets } = req.body; // array of { date, client_name, risk_score, tier, risk_reason, created_by, mc_ticket_id }
    if (!Array.isArray(tickets) || tickets.length === 0) return res.status(400).json({ error: 'tickets array required' });
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEET_ID;
    await ensureL2Tab(sheets, spreadsheetId);
    const rows = tickets.map(t => [
      t.date || new Date().toLocaleDateString('en-US'),
      t.client_name || '',
      t.risk_score || '',
      t.tier || '',
      t.risk_reason || '',
      t.created_by || 'Historical Import',
      t.mc_ticket_id || '',
    ]);
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: `${L2_SHEET_NAME}!A:G`,
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
    res.json({ ok: true, count: rows.length });
  } catch (err) {
    console.error('l2-tickets bulk POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Care Focus Tracking ──────────────────────────────────────────────────────
// Columns: A=Week_Date, B=Client_Name, C=Risk_Score, D=Tier, E=Risk_Reason,
//          F=Scheduled_Date, G=Completed, H=Completed_Date, I=Notes, J=Created_By

const CF_SHEET_NAME = 'Care_Focus';

async function ensureCFTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some(s => s.properties.title === CF_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: CF_SHEET_NAME } } }] } });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${CF_SHEET_NAME}!A1:J1`, valueInputOption: 'RAW',
      requestBody: { values: [['Week_Date','Client_Name','Risk_Score','Tier','Risk_Reason','Scheduled_Date','Completed','Completed_Date','Notes','Created_By']] },
    });
  }
}

// GET /api/care-focus — list all care focus records
app.get('/api/care-focus', async (req, res) => {
  try {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEET_ID;
    await ensureCFTab(sheets, spreadsheetId);
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${CF_SHEET_NAME}!A2:J` });
    const rows = resp.data.values || [];
    const records = rows.map((r, i) => ({
      row: i + 2,
      week_date:      r[0] || '',
      client_name:    r[1] || '',
      risk_score:     r[2] || '',
      tier:           r[3] || '',
      risk_reason:    r[4] || '',
      scheduled_date: r[5] || '',
      completed:      r[6] === 'Yes',
      completed_date: r[7] || '',
      notes:          r[8] || '',
      created_by:     r[9] || '',
    }));
    res.json({ records });
  } catch (err) {
    console.error('care-focus GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/care-focus — log a new care focus record for a client
app.post('/api/care-focus', async (req, res) => {
  try {
    const { client_name, risk_score, tier, risk_reason, scheduled_date, notes, created_by } = req.body;
    if (!client_name) return res.status(400).json({ error: 'client_name required' });
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEET_ID;
    await ensureCFTab(sheets, spreadsheetId);
    const week_date = new Date().toLocaleDateString('en-US');
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: `${CF_SHEET_NAME}!A:J`,
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[week_date, client_name, risk_score || '', tier || '', risk_reason || '', scheduled_date || '', 'No', '', notes || '', created_by || '']] },
    });
    res.json({ ok: true, week_date, client_name });
  } catch (err) {
    console.error('care-focus POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/care-focus/:clientName — mark completed or update scheduled date
app.patch('/api/care-focus/:clientName', async (req, res) => {
  try {
    const clientName = decodeURIComponent(req.params.clientName).toLowerCase();
    const { completed, completed_date, scheduled_date, notes } = req.body;
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEET_ID;
    await ensureCFTab(sheets, spreadsheetId);
    // Find most recent row for this client
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${CF_SHEET_NAME}!A2:J` });
    const rows = resp.data.values || [];
    let rowIdx = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      if ((rows[i][1] || '').toLowerCase() === clientName) { rowIdx = i + 2; break; }
    }
    if (rowIdx === -1) return res.status(404).json({ error: 'Care focus record not found' });
    const row = rows[rowIdx - 2];
    const updated = [
      row[0] || '', row[1] || '', row[2] || '', row[3] || '', row[4] || '',
      scheduled_date !== undefined ? scheduled_date : (row[5] || ''),
      completed !== undefined ? (completed ? 'Yes' : 'No') : (row[6] || 'No'),
      completed_date !== undefined ? completed_date : (row[7] || ''),
      notes !== undefined ? notes : (row[8] || ''),
      row[9] || '',
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${CF_SHEET_NAME}!A${rowIdx}:J${rowIdx}`,
      valueInputOption: 'RAW', requestBody: { values: [updated] },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('care-focus PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/care-focus/bulk — seed multiple historical care focus records
app.post('/api/care-focus/bulk', async (req, res) => {
  try {
    const { records } = req.body; // array of { week_date, client_name, risk_score, tier, risk_reason, scheduled_date, completed, completed_date, notes, created_by }
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'records array required' });
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEET_ID;
    await ensureCFTab(sheets, spreadsheetId);
    const rows = records.map(r => [
      r.week_date || new Date().toLocaleDateString('en-US'),
      r.client_name || '',
      r.risk_score || '',
      r.tier || '',
      r.risk_reason || '',
      r.scheduled_date || '',
      r.completed || 'No',
      r.completed_date || '',
      r.notes || '',
      r.created_by || 'Historical Import',
    ]);
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: `${CF_SHEET_NAME}!A:J`,
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
    res.json({ ok: true, count: rows.length });
  } catch (err) {
    console.error('care-focus bulk POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Cancellation Drivers ─────────────────────────────────────────────────
// GET /api/cancellation-drivers?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
// Returns breakdown of stated (categorized) vs AI-assessed cancellation reasons

// Normalize free-text stated reasons into clean categories
function categorizeStatedReason(text) {
  if (!text || text.trim() === '') return 'Not stated';
  const t = text.toLowerCase();

  // Contact method artifacts (these are form field values, not reasons)
  if (/^(email|phone|sms|text|call|chat|online|website|app)$/.test(t.trim())) return 'Not stated';
  // Raw data dumps (client stats pasted in)
  if (t.includes('customer start') || t.includes('last cleaning') || t.includes('next cl')) return 'Not stated';

  if (/mov(ing|ed)|relocat|new (home|house|city|state|address)|out of (area|town|state)/.test(t)) return 'Moving / Relocation';
  if (/price|cost|expens|afford|budget|fee|rate|too much|cheaper|money|financial|saving/.test(t)) return 'Price / Cost';
  if (/frequen|every (other|month|week|two)|bi-?weekly|monthly|less often|skip|cut back|reduc/.test(t)) return 'Frequency Change';
  if (/quality|clean|job|dirty|missed|not (happy|satisfied|pleased)|complaint|issue|problem|poor/.test(t)) return 'Quality Concern';
  if (/tech|cleaner|team|staff|specific (person|cleaner)|want.*back|prefer/.test(t)) return 'Technician Issue';
  if (/sold|selling|list(ing)?|foreclos|rental|airbnb|empty|vacant/.test(t)) return 'Property Change';
  if (/do it (my|our)self|self|husband|wife|family|son|daughter|kid/.test(t)) return 'DIY / Family Cleaning';
  if (/travel|vacation|away|not (home|here|around)|snowbird|seasonal|summer|winter/.test(t)) return 'Seasonal / Travel';
  if (/health|sick|hospital|surgery|ill|cancer|medic|pass(ed)?|death|died|elder/.test(t)) return 'Health / Life Event';
  if (/job|work|laid off|unemploy|retire|income|pay cut/.test(t)) return 'Financial Hardship';
  if (/renovati|construc|remodel|repair/.test(t)) return 'Home Renovation';
  if (/pause|hold|temporary|for now|come back|return|maybe later/.test(t)) return 'Temporary Pause';
  if (/no reason|just cancel|not sure|unknown|n\/a|na$/.test(t)) return 'No Reason Given';
  // Fallback: shorten long text to first meaningful phrase
  const cleaned = text.trim().replace(/\s+/g, ' ');
  return cleaned.length > 40 ? cleaned.slice(0, 40) + '…' : cleaned;
}

// Normalize AI drivers into clean categories
function categorizeAIDriver(text) {
  if (!text || text.trim() === '') return null;
  const t = text.toLowerCase();

  if (/reloc|mov(ing|ed)|out of (area|town|state|city)|new home/.test(t)) return 'Moving / Relocation';
  if (/price|cost|expens|afford|budget|fee|too (high|much)|cheaper/.test(t)) return 'Price / Cost';
  if (/frequen|every (other|month|week|two)|bi-?weekly|less often|skip|cut back/.test(t)) return 'Frequency Change';
  if (/quality|clean(ing)? (issue|problem|concern)|dissatisfi|not (happy|pleased)/.test(t)) return 'Quality Concern';
  if (/tech|cleaner|staff|team (issue|problem)|personnel/.test(t)) return 'Technician Issue';
  if (/sold|property|rental|empty|vacant|list(ing)?/.test(t)) return 'Property Change';
  if (/self|diy|family|do it (themselves|ourselves)/.test(t)) return 'DIY / Family Cleaning';
  if (/travel|vacation|seasonal|away|snowbird/.test(t)) return 'Seasonal / Travel';
  if (/health|illness|medical|life (event|circumstance)|personal|death|cancer/.test(t)) return 'Health / Life Event';
  if (/job loss|financial (hardship|strain)|unemploy|income|laid off/.test(t)) return 'Financial Hardship';
  if (/renovati|construc|remodel/.test(t)) return 'Home Renovation';
  if (/scope|mismatch|expectation|service (gap|level)/.test(t)) return 'Service Scope Mismatch';
  if (/commitment|schedule|timing|availability/.test(t)) return 'Scheduling / Commitment';
  // Shorten long AI text
  const cleaned = text.trim().replace(/\s+/g, ' ');
  return cleaned.length > 45 ? cleaned.slice(0, 45) + '…' : cleaned;
}

app.get('/api/cancellation-drivers', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'AI_Analysis'),
      readTab(sheets, 'Outcomes'),
    ]);

    const analysisMap = analyses.reduce((m, a) => { m[a.Evaluation_ID] = a; return m; }, {});
    const outcomeMap = outcomes.reduce((m, o) => { m[o.Evaluation_ID] = o; return m; }, {});

    // Date range filter
    const { date_from, date_to } = req.query;
    const fromDate = date_from ? new Date(date_from) : null;
    const toDate = date_to ? new Date(date_to + 'T23:59:59') : null;

    // Build per-evaluation record
    let records = intakes.map(i => {
      const analysis = analysisMap[i.Evaluation_ID];
      const outcome = outcomeMap[i.Evaluation_ID];
      const rawStated = i.Cancellation_Reason || null;
      const rawAI = analysis?.Primary_Cancellation_Driver || null;
      return {
        evaluation_id: i.Evaluation_ID,
        client_name: i.Client_Name,
        date: i.Created_Date,
        staff_name: i.Staff_Name,
        stated_reason_raw: rawStated,
        stated_reason: categorizeStatedReason(rawStated),
        ai_driver_raw: rawAI,
        ai_driver: categorizeAIDriver(rawAI),
        ai_summary: analysis?.AI_Summary || null,
        root_cause_evidence: analysis?.Root_Cause_Evidence || null,
        outcome: outcome?.Outcome || 'Pending',
        save_score: analysis?.Save_Worthiness_Score ?? null,
        recommended_program: analysis?.Recommended_Program || null,
        recommended_strategy: analysis?.Recommended_Strategy || null,
      };
    }).filter(r => r.stated_reason !== 'Not stated' || r.ai_driver); // only with useful data

    // Apply date range
    if (fromDate || toDate) {
      records = records.filter(r => {
        if (!r.date) return false;
        const d = new Date(r.date);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      });
    }

    // Tally stated reasons (categorized)
    const statedTally = {};
    records.forEach(r => {
      const key = r.stated_reason || 'Not stated';
      if (!statedTally[key]) statedTally[key] = { count: 0, cancelled: 0, saved: 0, pending: 0 };
      statedTally[key].count++;
      if (r.outcome === 'Cancelled') statedTally[key].cancelled++;
      else if (r.outcome === 'Saved') statedTally[key].saved++;
      else statedTally[key].pending++;
    });

    // Tally AI drivers (categorized)
    const aiTally = {};
    records.forEach(r => {
      if (!r.ai_driver) return;
      const key = r.ai_driver;
      if (!aiTally[key]) aiTally[key] = { count: 0, cancelled: 0, saved: 0, pending: 0 };
      aiTally[key].count++;
      if (r.outcome === 'Cancelled') aiTally[key].cancelled++;
      else if (r.outcome === 'Saved') aiTally[key].saved++;
      else aiTally[key].pending++;
    });

    // Monthly trend
    const monthlyMap = {};
    records.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, total: 0, cancelled: 0, saved: 0, top_driver: {} };
      monthlyMap[key].total++;
      if (r.outcome === 'Cancelled') monthlyMap[key].cancelled++;
      else if (r.outcome === 'Saved') monthlyMap[key].saved++;
      if (r.ai_driver) {
        monthlyMap[key].top_driver[r.ai_driver] = (monthlyMap[key].top_driver[r.ai_driver] || 0) + 1;
      }
    });
    const monthly = Object.values(monthlyMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map(m => ({
        ...m,
        top_driver: Object.entries(m.top_driver).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      }));

    res.json({
      total: records.length,
      stated_reasons: Object.entries(statedTally)
        .map(([reason, stats]) => ({ reason, ...stats }))
        .sort((a, b) => b.count - a.count),
      ai_drivers: Object.entries(aiTally)
        .map(([driver, stats]) => ({ driver, ...stats }))
        .sort((a, b) => b.count - a.count),
      monthly_trend: monthly,
      records: records.sort((a, b) => new Date(b.date) - new Date(a.date)),
    });
  } catch (err) {
    console.error('cancellation-drivers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── CT Performance — Dispatch Board Enriched ─────────────────────────────
// GET /api/ct-performance
// Returns technician risk data enriched with last 3 visits per client from dispatch board
app.get('/api/ct-performance', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'AI_Analysis'),
      readTab(sheets, 'Outcomes'),
    ]);

    const analysisMap = analyses.reduce((m, a) => { m[a.Evaluation_ID] = a; return m; }, {});
    const outcomeMap = outcomes.reduce((m, o) => { m[o.Evaluation_ID] = o; return m; }, {});

    // Load dispatch board CSV from Drive
    let dispatchRows = [];
    try {
      const result = await cachedDriveCSV(DRIVE_FOLDER_DISPATCH_BOARD);
      dispatchRows = result.rows || [];
    } catch (e) {
      console.warn('ct-performance: dispatch board load failed:', e.message);
    }

    // Build client visit history from dispatch board
    // Group by Customer name, sorted by Scheduled date desc
    const clientVisits = {};
    for (const row of dispatchRows) {
      const customer = (row['Customer'] || '').replace(/\*$/, '').trim();
      const tech = (row['Team'] || '').trim();
      const scheduled = row['Scheduled'] || '';
      const scorecard = row['Scorecard'] ? parseInt(row['Scorecard']) : null;
      const status = row['Status'] || '';
      const freq = row['Freq.'] || '';
      if (!customer || !tech) continue;

      // Parse date from "9/28/2026 7:00 AM - 9:00 AM"
      const datePart = scheduled.split(' ')[0];
      const visitDate = datePart ? new Date(datePart) : null;

      if (!clientVisits[customer]) clientVisits[customer] = [];
      clientVisits[customer].push({ tech, scorecard, date: visitDate, dateStr: datePart, status, freq });
    }

    // Sort each client's visits by date desc
    for (const name of Object.keys(clientVisits)) {
      clientVisits[name].sort((a, b) => (b.date || 0) - (a.date || 0));
    }

    // Build technician risk map from evaluations (weighted scoring)
    // Weight: last cleaner = 3pts, 2nd to last = 2pts, 3rd = 1pt
    const techMap = {};

    function parseTechHistory(paste) {
      if (!paste) return [];
      const techs = [];
      const lines = paste.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const match =
          line.match(/^(.+?)\s*[-|]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-|]?\s*(?:Score[:\s]*)?(\d+\.?\d*)?/i) ||
          line.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d+\.?\d*)?/i);
        if (match) {
          const name = match[1].trim();
          const date = match[2].trim();
          const score = match[3] ? parseFloat(match[3]) : null;
          if (name && name.length > 1 && name.length < 60) techs.push({ name, date, score });
        }
      }
      return techs;
    }

    for (const intake of intakes) {
      const cancelled = outcomeMap[intake.Evaluation_ID]?.Outcome === 'Cancelled';
      const saved = outcomeMap[intake.Evaluation_ID]?.Outcome === 'Saved';
      const analysis = analysisMap[intake.Evaluation_ID];

      const techLines = parseTechHistory(intake.Technician_History_Paste);
      if (!techLines.length) continue;

      // Get client visit history from dispatch board
      const dispatchHistory = clientVisits[intake.Client_Name] || [];
      const last3Dispatch = dispatchHistory.slice(0, 3);

      // Determine first service date from dispatch (earliest visit)
      const allDates = dispatchHistory.map(v => v.date).filter(Boolean);
      const firstService = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null;
      const clientFreq = dispatchHistory[0]?.freq || null;

      const weights = [3, 2, 1];
      for (let i = 0; i < Math.min(techLines.length, 3); i++) {
        const t = techLines[i];
        if (!t.name) continue;
        if (!techMap[t.name]) {
          techMap[t.name] = {
            name: t.name,
            weighted_risk_score: 0,
            total_appearances: 0,
            as_last_cleaner: 0,
            cancellations_as_last: 0,
            saves_as_last: 0,
            avg_score_sum: 0,
            avg_score_count: 0,
            clients: [],
          };
        }
        const entry = techMap[t.name];
        entry.total_appearances++;
        if (cancelled) entry.weighted_risk_score += weights[i];
        if (t.score != null) { entry.avg_score_sum += t.score; entry.avg_score_count++; }
        if (i === 0) {
          entry.as_last_cleaner++;
          if (cancelled) entry.cancellations_as_last++;
          if (saved) entry.saves_as_last++;
          if (cancelled || saved) {
            entry.clients.push({
              client: intake.Client_Name,
              date: intake.Created_Date,
              outcome: cancelled ? 'Cancelled' : 'Saved',
              stated_reason: intake.Cancellation_Reason || null,
              ai_driver: analysis?.Primary_Cancellation_Driver || null,
              save_score: analysis?.Save_Worthiness_Score ?? null,
              last_3_visits: last3Dispatch.map((v, idx) => ({
                position: idx + 1,
                tech: v.tech,
                date: v.dateStr,
                scorecard: v.scorecard,
                status: v.status,
              })),
              first_service: firstService ? firstService.toLocaleDateString('en-US') : null,
              frequency: clientFreq,
            });
          }
        }
      }
    }

    // Build dispatch-only tech stats (visit counts, avg scorecard)
    const dispatchTechStats = {};
    for (const row of dispatchRows) {
      const tech = (row['Team'] || '').trim();
      const scorecard = row['Scorecard'] ? parseInt(row['Scorecard']) : null;
      const status = row['Status'] || '';
      if (!tech) continue;
      if (!dispatchTechStats[tech]) dispatchTechStats[tech] = { visits: 0, scorecard_sum: 0, scorecard_count: 0, cancelled_visits: 0 };
      dispatchTechStats[tech].visits++;
      if (scorecard) { dispatchTechStats[tech].scorecard_sum += scorecard; dispatchTechStats[tech].scorecard_count++; }
      if (status === 'Cancelled') dispatchTechStats[tech].cancelled_visits++;
    }

    const techs = Object.values(techMap).map(t => ({
      ...t,
      avg_score: t.avg_score_count > 0 ? Math.round((t.avg_score_sum / t.avg_score_count) * 100) / 100 : null,
      cancellation_rate: t.as_last_cleaner > 0 ? Math.round((t.cancellations_as_last / t.as_last_cleaner) * 100) : 0,
      dispatch_stats: dispatchTechStats[t.name] ? {
        total_visits: dispatchTechStats[t.name].visits,
        avg_scorecard: dispatchTechStats[t.name].scorecard_count > 0
          ? Math.round((dispatchTechStats[t.name].scorecard_sum / dispatchTechStats[t.name].scorecard_count) * 100) / 100
          : null,
        cancelled_visits: dispatchTechStats[t.name].cancelled_visits,
      } : null,
    })).sort((a, b) => b.weighted_risk_score - a.weighted_risk_score);

    res.json({
      techs,
      total_evaluations: intakes.length,
      total_cancelled: outcomes.filter(o => o.Outcome === 'Cancelled').length,
      has_dispatch_data: dispatchRows.length > 0,
    });
  } catch (err) {
    console.error('ct-performance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── CRIS vs Data accuracy route ─────────────────────────────────────────
app.get('/api/cris-accuracy', async (req, res) => {
  try {
    const sheets = await getSheets();
    const [intakes, analyses, outcomes] = await Promise.all([
      readTab(sheets, 'Client_Intake'),
      readTab(sheets, 'AI_Analysis'),
      readTab(sheets, 'Outcomes'),
    ]);

    const analysisMap = analyses.reduce((m, a) => { m[a.Evaluation_ID] = a; return m; }, {});
    const outcomeMap = outcomes.reduce((m, o) => { m[o.Evaluation_ID] = o; return m; }, {});

    const now = Date.now();
    const WINDOW_DAYS = 90;

    const records = intakes.map(i => {
      const analysis = analysisMap[i.Evaluation_ID];
      const outcome = outcomeMap[i.Evaluation_ID];
      const program = analysis?.Recommended_Program || null;
      const outcomeVal = outcome?.Outcome || 'Pending';
      const dateStr = i.Created_Date;
      const evalDate = dateStr ? new Date(dateStr) : null;
      const daysSince = evalDate ? Math.floor((now - evalDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
      const past90 = daysSince != null && daysSince >= WINDOW_DAYS;

      // Determine verdict
      let verdict;
      if (outcomeVal === 'Saved' && past90) {
        verdict = 'predicted_correct'; // Saved AND past 90 days = intervention worked
      } else if (outcomeVal === 'Saved' && !past90) {
        verdict = 'saved_active'; // Saved but still in window — tracking
      } else if (outcomeVal === 'Cancelled' && past90) {
        verdict = 'predicted_wrong'; // Still cancelled = intervention failed
      } else {
        verdict = 'pending'; // Still in 90-day window
      }

      return {
        evaluation_id: i.Evaluation_ID,
        client_name: i.Client_Name,
        date: dateStr,
        staff_name: i.Staff_Name,
        program,
        strategy: analysis?.Recommended_Strategy || null,
        ai_risk_level: analysis?.Risk_Level || null,
        ai_summary: analysis?.AI_Summary || null,
        save_score: analysis?.Save_Worthiness_Score ? Number(analysis.Save_Worthiness_Score) : null,
        outcome: outcomeVal,
        days_since: daysSince,
        past_90: past90,
        verdict,
      };
    }).filter(r => r.program || r.outcome !== 'Pending'); // Only show evaluated ones

    const resolved = records.filter(r => r.past_90);
    const correct = records.filter(r => r.verdict === 'predicted_correct');
    const wrong = records.filter(r => r.verdict === 'predicted_wrong');
    const pending = records.filter(r => r.verdict === 'pending');
    const savedActive = records.filter(r => r.verdict === 'saved_active');

    const overall_accuracy = resolved.length > 0 ? Math.round((correct.length / resolved.length) * 100) : 0;

    // By program
    const programMap = {};
    resolved.forEach(r => {
      const prog = r.program || 'No Program';
      if (!programMap[prog]) programMap[prog] = { program: prog, resolved: 0, correct: 0 };
      programMap[prog].resolved++;
      if (r.verdict === 'predicted_correct') programMap[prog].correct++;
    });
    const by_program = Object.values(programMap).sort((a, b) => b.resolved - a.resolved);

    // By month
    const monthMap = {};
    resolved.forEach(r => {
      if (!r.date) return;
      const m = r.date.slice(0, 7);
      if (!monthMap[m]) monthMap[m] = { month: m, total: 0, correct: 0 };
      monthMap[m].total++;
      if (r.verdict === 'predicted_correct') monthMap[m].correct++;
    });
    const by_month = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

    res.json({
      overall_accuracy,
      total_resolved: resolved.length,
      total_correct: correct.length,
      total_wrong: wrong.length,
      total_pending: pending.length,
      total_saved_active: savedActive.length,
      by_program,
      by_month,
      records: records.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    });
  } catch (err) {
    console.error('[cris-accuracy]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── MaidCentral API helpers ──────────────────────────────────────────────
const MC_API_BASE  = process.env.MC_API_BASE_URL   || 'https://api.maidcentral.com';
const MC_USERNAME  = process.env.MC_API_USERNAME;
const MC_PASSWORD  = process.env.MC_API_PASSWORD;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

// ─── Slack alert helper ───────────────────────────────────────────────────
async function sendSlackAlert(message) {
  if (!SLACK_WEBHOOK_URL) return; // silently skip if not configured
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    console.error('[slack-alert] Failed to send Slack alert:', err.message);
  }
}

let _mcToken = null;
let _mcTokenExpiry = 0;

async function getMCToken() {
  if (_mcToken && Date.now() < _mcTokenExpiry - 60_000) return _mcToken;
  if (!MC_USERNAME || !MC_PASSWORD) throw new Error('MC_API_USERNAME / MC_API_PASSWORD env vars not set');

  const params = new URLSearchParams({
    grant_type: 'password',
    username: MC_USERNAME,
    password: MC_PASSWORD,
  });
  const resp = await fetch(`${MC_API_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!resp.ok) throw new Error(`MC /token failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  _mcToken = data.access_token;
  _mcTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return _mcToken;
}

async function createMCNote({ email, subject, content, createTicket = true }) {
  const token = await getMCToken();
  const body = {
    EntityTypeId: 1,             // Customer
    EntityContactInfo: email,    // MC resolves customer by email
    NoteTypeId: 2,               // Note
    CommunicationDirectionId: 0, // InternalNote
    Subject: subject,
    Content: content,
    CreateTicket: createTicket,
  };
  const resp = await fetch(`${MC_API_BASE}/api/Note/Create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`MC Note/Create failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// ─── MC: create note/ticket for at-risk client ───────────────────────────
// POST /api/mc/create-note
// Body: { client_name, level (1|2), reason, details?, create_ticket? }
app.post('/api/mc/create-note', async (req, res) => {
  try {
    const { client_name, level = 1, reason = '', details = '', create_ticket = true } = req.body || {};
    if (!client_name) return res.status(400).json({ error: 'client_name required' });

    // Look up customer email from Drive current-customers CSV
    const { rows: customers } = await cachedDriveCSV(DRIVE_FOLDER_CUSTOMERS);
    const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetName = normalize(client_name);

    // Try full match first, then last-name only as fallback
    let customer = customers.find(c => {
      const full = normalize(`${c['First'] || ''} ${c['Last'] || ''}`);
      return full === targetName;
    });
    if (!customer) {
      const parts = client_name.trim().split(/\s+/);
      const lastName = normalize(parts[parts.length - 1]);
      customer = customers.find(c => normalize(c['Last'] || '') === lastName);
    }

    const email = customer?.['Email'];
    if (!email) {
      const msg = `❌ *CRIS MC Note Failed* — No email found for client *${client_name}* in current-customers CSV`;
      await sendSlackAlert(msg);
      return res.status(404).json({
        error: `No email found for client "${client_name}" in current-customers CSV`,
        tip: 'Customer may not be in the active list, or the CSV may be outdated',
      });
    }

    // 90-day dedup check: skip if same client + ticket type within 90 days
    try {
      const auth = await getGoogleAuth();
      const sheetsApi = google.sheets({ version: 'v4', auth });
      const dedupResp = await sheetsApi.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'MC_Tickets!A:D',
      });
      const dedupRows = (dedupResp.data.values || []).slice(1); // skip header
      const ticketType = Number(level) === 1 ? 'L1' : 'L2';
      const normName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const duplicate = dedupRows.find(r => {
        const [rClient, rType, rDate] = r;
        if (normName(rClient) !== normName(client_name)) return false;
        if (rType !== ticketType) return false;
        const d = new Date(rDate);
        return !isNaN(d) && d >= cutoff90;
      });
      if (duplicate) {
        return res.status(409).json({
          error: `Duplicate ticket: a ${ticketType} ticket for "${client_name}" was already created within the last 90 days (${duplicate[2]}).`,
          duplicate: true,
        });
      }
    } catch (dedupErr) {
      console.warn('[mc/create-note] dedup check failed, proceeding anyway:', dedupErr.message);
    }

    // Build subject and content based on L1 vs L2
    let subject, content;
    if (Number(level) === 1) {
      subject = `Client Care - Level 1: ${reason} - Schedule Care Focus Visit`;
      content = `Schedule care focus for ${client_name} on their next visit.\nReason: ${reason}${details ? '\n' + details : ''}\n\nTicket generated by CRIS: At Risk Clients`;
    } else {
      subject = `Client Care - Level 2: ${reason} - Follow up / Check in`;
      content = `L2: At Risk Client\n${reason}${details ? '\n' + details : ''}\n\nTicket generated by CRIS: At Risk Clients`;
    }

    const result = await createMCNote({ email, subject, content, createTicket: create_ticket });

    // Log to MC_Tickets sheet for dedup tracking
    try {
      const auth = await getGoogleAuth();
      const sheetsApi = google.sheets({ version: 'v4', auth });
      const ticketType = Number(level) === 1 ? 'L1' : 'L2';
      const today = new Date().toISOString().slice(0, 10);
      await sheetsApi.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'MC_Tickets!A:E',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[client_name, ticketType, today, reason, 'CRIS']] },
      });
    } catch (logErr) {
      console.warn('[mc/create-note] Failed to log to MC_Tickets:', logErr.message);
    }

    res.json({ ok: true, email, level, subject, mc_response: result });
  } catch (err) {
    console.error('[mc/create-note]', err);
    await sendSlackAlert(`❌ *CRIS MC Note Failed*\nError: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Auto-close: GET status of last auto-close run ───────────────────────
// Returns recent auto-closed evaluations so the dashboard can show a banner
app.get('/api/auto-close/recent', async (req, res) => {
  try {
    const sheets = await getSheets();
    const outcomes = await readTab(sheets, 'Outcomes');
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recent = outcomes.filter(o =>
      o['Outcome'] === 'Cancelled' &&
      (o['Outcome_Notes'] || '').includes('auto closed by CRIS') &&
      (o['Closed_Date'] || '') >= cutoff
    );
    res.json({ count: recent.length, items: recent });
  } catch (err) {
    console.error('[auto-close/recent]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Auto-close core logic ────────────────────────────────────────────────
async function runAutoClose() {
  console.log('[auto-close] Starting auto-close run at', new Date().toISOString());

  const sheets = await getSheets();

  // 1. Load active cancelled clients from Drive job-status CSV
  const { rows: jobRows, filename } = await getLatestDriveCSV(DRIVE_FOLDER_JOBSTATUS);
  console.log(`[auto-close] Loaded ${jobRows.length} job rows from ${filename}`);

  // Build a Set of customer names whose ALL future jobs are cancelled
  // "Cancelled" status from the job-status report means the service was cancelled
  const cancelledCustomers = new Set();
  const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Group by customer — if a customer appears only with Cancelled status, they're cancelled
  const customerStatuses = {};
  for (const row of jobRows) {
    const name = normalize(row['Customer Name'] || row['Customer'] || '');
    if (!name) continue;
    if (!customerStatuses[name]) customerStatuses[name] = new Set();
    const status = (row['Status'] || '').toLowerCase();
    customerStatuses[name].add(status);
  }

  for (const [name, statuses] of Object.entries(customerStatuses)) {
    const hasNonCancelled = [...statuses].some(s => !['cancelled', 'bumped', 'moved'].includes(s));
    if (!hasNonCancelled) cancelledCustomers.add(name);
  }
  console.log(`[auto-close] ${cancelledCustomers.size} customers fully cancelled in job-status`);

  // 2. Load CRIS Outcomes + Intakes
  const [intakes, outcomes] = await Promise.all([
    readTab(sheets, 'Client_Intake'),
    readTab(sheets, 'Outcomes'),
  ]);

  // Get spreadsheet metadata to find the Outcomes sheet ID and row positions
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const outcomesSheet = meta.data.sheets?.find(s => s.properties.title === 'Outcomes');
  const outcomesSheetId = outcomesSheet?.properties?.sheetId;

  // Build a map of eval_id → row index in Outcomes (1-indexed, row 1 = header)
  const outcomesByEvalId = {};
  outcomes.forEach((row, i) => {
    const id = row['Evaluation_ID'] || row['Eval_ID'];
    if (id) outcomesByEvalId[id] = { row: i + 2, data: row }; // +2 for header
  });

  // Build a map of eval_id → intake row
  const intakeByEvalId = {};
  intakes.forEach(row => {
    const id = row['Eval_ID'] || row['Evaluation_ID'];
    if (id) intakeByEvalId[id] = row;
  });

  const autoCloseNote = 'auto closed by CRIS because all future jobs were cancelled in MaidCentral';
  const closedAt = new Date().toISOString().slice(0, 10);
  const updates = [];

  for (const [evalId, { row, data }] of Object.entries(outcomesByEvalId)) {
    const status = (data['Outcome'] || '').toLowerCase();
    if (status !== 'pending' && status !== 'saved') continue;

    // Find client name from intake
    const intake = intakeByEvalId[evalId];
    const clientName = intake?.['Client_Name'] || data['Client_Name'] || data['client_name'] || '';
    const normalizedClient = normalize(clientName);

    if (!cancelledCustomers.has(normalizedClient)) continue;

    console.log(`[auto-close] Will close eval ${evalId} for client "${clientName}" (row ${row})`);
    updates.push({ evalId, row, clientName, prevStatus: data['Outcome'] });
  }

  if (updates.length === 0) {
    console.log('[auto-close] No evaluations to auto-close today');
    return { closed: 0, skipped: 0, details: [] };
  }

  // 3. Batch-update Outcomes sheet
  // Find column indices for Outcome, Outcome_Notes, Closed_Date
  const outcomesRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Outcomes!1:1' });
  const headers = outcomesRes.data.values?.[0] || [];
  const colIdx = name => headers.indexOf(name); // 0-based
  const outcomeCol = colIdx('Outcome');
  const notesCol   = colIdx('Outcome_Notes');
  const closedCol  = colIdx('Closed_Date');

  const batchData = [];
  for (const u of updates) {
    const colLetter = col => String.fromCharCode(65 + col);
    if (outcomeCol >= 0) {
      batchData.push({ range: `Outcomes!${colLetter(outcomeCol)}${u.row}`, values: [['Cancelled']] });
    }
    if (notesCol >= 0) {
      batchData.push({ range: `Outcomes!${colLetter(notesCol)}${u.row}`, values: [[autoCloseNote]] });
    }
    if (closedCol >= 0) {
      batchData.push({ range: `Outcomes!${colLetter(closedCol)}${u.row}`, values: [[closedAt]] });
    }
  }

  if (batchData.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: batchData },
    });
  }

  console.log(`[auto-close] Closed ${updates.length} evaluations`);
  return { closed: updates.length, skipped: 0, details: updates.map(u => ({ evalId: u.evalId, clientName: u.clientName, prevStatus: u.prevStatus })) };
}

// ─── Auto-close: manual trigger (admin) ──────────────────────────────────
app.post('/api/auto-close/run', async (req, res) => {
  try {
    const result = await runAutoClose();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[auto-close/run]', err);
    await sendSlackAlert(`❌ *CRIS Auto-Close Failed* (manual run)\nError: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Auto-close: daily morning cron (7 AM Pacific) ───────────────────────
// Node built-in: run once on startup if missed, then every day at 7 AM Pacific
function scheduleDailyAutoClose() {
  function msUntilNext7amPacific() {
    // Pacific = UTC-8 (PST) or UTC-7 (PDT); use a fixed offset approximation
    const now = new Date();
    // Get current time in Pacific by computing the offset
    const pacificOffset = -7; // PDT (daylight saving); -8 for PST
    const pacificNow = new Date(now.getTime() + pacificOffset * 60 * 60 * 1000);
    const target = new Date(pacificNow);
    target.setUTCHours(7, 0, 0, 0); // 7 AM Pacific = 7 AM in our shifted time
    if (target <= pacificNow) target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime() - pacificNow.getTime();
  }

  function scheduleNext() {
    const ms = msUntilNext7amPacific();
    const nextRun = new Date(Date.now() + ms);
    console.log(`[auto-close] Next auto-close scheduled for ${nextRun.toISOString()} (in ${Math.round(ms / 60000)} min)`);
    setTimeout(async () => {
      try {
        const result = await runAutoClose();
        console.log('[auto-close] Daily run complete:', result);
        if (result.closed > 0) {
          await sendSlackAlert(`✅ *CRIS Auto-Close* — ${result.closed} evaluation(s) auto-closed this morning.`);
        }
      } catch (err) {
        console.error('[auto-close] Daily run error:', err);
        await sendSlackAlert(`❌ *CRIS Auto-Close Failed* (daily 7 AM run)\nError: ${err.message}`);
      }
      scheduleNext(); // schedule the next day's run
    }, ms);
  }

  scheduleNext();
}

// ─── Serve React frontend (MUST be last) ──────────────────────────────────
app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../build', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CRIS v2 running on port ${PORT}`);
  scheduleDailyAutoClose();
});
