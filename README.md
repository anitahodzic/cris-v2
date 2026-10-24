# CRIS — Client Relationship Intelligence System
## BA House Cleaning · V1

---

## Overview

CRIS is a cancellation-response and save-decision app. It is used **only after a client has said they want to cancel, reduce, or stop service**. It is not a retention prediction tool.

**Workflow:**
1. Staff opens CRIS and creates a New Client Evaluation
2. Staff pastes client data from Maid Central
3. CRIS saves intake to Google Sheets
4. CRIS sends the case to Claude AI with all reference data
5. Claude returns a full Cancellation Decision Report
6. Staff records the outcome
7. CRIS saves the outcome to Google Sheets

---

## Project Structure

```
cris/
├── server/              ← Express API server (Node.js)
│   ├── index.js         ← All API routes
│   ├── package.json
│   └── .env.example     ← Copy to .env and fill in
│
├── src/                 ← React frontend
│   ├── App.jsx          ← Page router
│   ├── index.js
│   ├── index.css
│   ├── utils/
│   │   └── api.js       ← Frontend API calls
│   ├── components/
│   │   ├── UI.jsx       ← Shared components
│   │   └── Layout.jsx   ← Nav + sidebar
│   └── pages/
│       ├── Dashboard.jsx
│       ├── NewEvaluation.jsx
│       ├── Report.jsx
│       ├── SearchEvaluations.jsx
│       ├── CustomerReport.jsx
│       ├── Programs.jsx
│       ├── Policies.jsx
│       ├── Settings.jsx
│       └── MonthlyReport.jsx
│
├── package.json         ← React app dependencies
└── tailwind.config.js
```

---

## Step 1: Google Sheets Setup

### 1A. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it: **CRIS Database**
3. Create exactly these 12 tabs (rename Sheet1, add more):

```
Settings
Programs
Program_Rules
Policies
Retention_Strategies
Strategy_Program_Map
Conversation_Frameworks
Client_Intake
AI_Analysis
Outcomes
Customer_Report
Monthly_Report
```

### 1B. Add Headers to Each Tab

Copy and paste these headers into Row 1 of each tab:

**Settings**
```
Setting_Key | Setting_Name | Value | Notes
```
Sample rows:
```
company_name | Company Name | BA House Cleaning |
save_target | Monthly Save Target | 70% |
revenue_threshold | Minimum Revenue to Consider Saving | $500 |
```

**Programs**
```
Program_ID | Program_Name | Active | Category | Purpose | When_To_Use | Discount_Or_Offer | Duration | Approval_Required | Notes | Priority
```
Sample rows:
```
P001 | Loyalty Discount | Yes | Discount | Retain long-term clients who cite cost | Client has 12+ months and good scorecard | 10% off for 3 months | 3 months | No | For clients with clean history | 1
P002 | Frequency Flex | Yes | Scheduling | Retain clients who need less frequent cleaning | Client requests reduced frequency | Move to monthly or every-6-weeks | Ongoing | No | Keep on recurring, just less often | 2
P003 | Essentials Clean | Yes | Scope Reduction | Retain clients who need lower cost via reduced scope | Budget concern, large home | Reduce to priority rooms only | Ongoing | No | Requires service set update | 3
P004 | Hardship Hold | Yes | Pause | Retain client experiencing genuine hardship | Verified financial/medical hardship | Pause service for 4-8 weeks | 4-8 weeks | Yes | Management approval required | 4
P005 | Respectful Cancellation | Yes | Cancellation | Process cancellation graciously | Client is not a good fit | None | Final | No | End relationship positively | 5
```

**Program_Rules**
```
Rule_ID | Program_ID | Rule_Type | Rule_Value
```
Sample rows:
```
R001 | P001 | Minimum_Tenure_Months | 6
R002 | P001 | Minimum_Scorecard_Pct | 70
R003 | P004 | Requires_Manager_Approval | Yes
R004 | P005 | Use_When_Score_Below | 35
```

**Policies**
```
Policy_ID | Policy | Purpose | Description | AI_Guidance | Customer_Explanation_Coaching_Guidance | Core_Principle | Escalation_Trigger | Related_Programs | Examples_Common_Scenarios | Active
```
Sample rows:
```
POL001 | Late Cancellation Fee | Protect technician pay and scheduling | Clients who cancel within 24 hours of service may be charged a late cancellation fee | Apply this policy when client has multiple late cancellations. Explain impact on technician income. | Our technicians rely on their scheduled jobs for income. When a cleaning is cancelled last minute, they lose that pay. The fee helps us compensate them fairly and keep our team stable. | Respect for technician livelihood | 3+ late cancellations in 6 months | P005 | Client cancels same morning citing forgot | Yes
POL002 | Arrival Window | Set realistic scheduling expectations | We provide a 1-2 hour arrival window, not an exact time | When client complains about timing, explain that windows allow for traffic, prior job overruns, and team safety. Exact times are not guaranteed. | Arrival windows let our teams handle real-world scheduling. We aim to hit the start of the window and always communicate delays when they occur. | Professionalism and transparency | Client demands exact arrival time, refuses window | P002 | Client upset team arrived at end of window | Yes
```

**Retention_Strategies**
```
Strategy_ID | Strategy_Name | Description
```
Sample rows:
```
S001 | Empathy First | Acknowledge the concern, validate the client, then offer a solution
S002 | Value Reinforcement | Remind client of their history, results, and what they'd lose
S003 | Practical Problem Solving | Understand the real barrier and offer a practical solution
S004 | Graceful Exit | Process cancellation professionally with a positive close
```

**Strategy_Program_Map**
```
Strategy_ID | Program_ID
```
Sample rows:
```
S001 | P001
S001 | P004
S002 | P001
S003 | P002
S003 | P003
S004 | P005
```

**Conversation_Frameworks**
```
Framework_ID | Situation | Objective | Must_Cover | Must_Avoid | Success_Goal
```
Sample rows:
```
CF001 | Client citing cost | Understand real barrier, offer value or program | Ask what's changed financially. Reference their service history. Offer concrete options. | Discounting immediately. Sounding desperate. | Client stays on recurring service at same or modified frequency
CF002 | Client citing dissatisfaction with cleaning | Understand specifics, own the problem, offer resolution | Ask for specific room/issue. Acknowledge. Explain what will change. Offer re-clean if warranted. | Being defensive. Blaming the technician. | Client agrees to give service another chance with correction plan
CF003 | Client moving | Confirm move date. Offer to serve new address if applicable. | Ask if they're moving locally. Mention we serve their new area if applicable. Offer a move-out clean. | Trying to retain someone who is genuinely leaving the area | Friendly close, referral opportunity, move-out clean upsell
```

**Client_Intake** (CRIS writes here — add headers only):
```
Evaluation_ID | Created_Date | Staff_Name | Client_Name | Customer_ID | Contact_Method | Current_Status | Customer_Overview_Paste | Cancellation_Reason | Scorecards_Paste | Technician_History_Paste | Service_Set_Paste | Technician_Preferences_Paste | Internal_Notes_Paste | Relevant_SMS_Email_Paste | Saved_Timestamp | AI_Analyzed
```

**AI_Analysis** (CRIS writes here — add headers only):
```
Evaluation_ID | Client_Name | Analysis_Date | Save_Worthiness_Score | Client_Category | Relationship_Score | Value_Score | Operational_Fit_Score | Policy_Alignment_Score | Risk_Level | Primary_Cancellation_Driver | Root_Cause_Evidence | Recommended_Strategy | Recommended_Program | Backup_Program | Programs_Not_Recommended | Programs_Not_Recommended_Reason | Management_Review_Required | Technician_Feedback_Needed | Technician_Names | Quality_Issue_Summary | Base_Hours | Allowed_Hours | Average_Actual_Hours | Hours_Difference | Time_Efficiency_Analysis | Revenue_At_Risk | Save_Confidence_Percent | Conversation_Objective | Key_Talking_Points | Questions_To_Ask | What_Not_To_Say | Suggested_Phone_Script | Follow_Up_Recommendation | AI_Summary
```

**Outcomes** (CRIS writes here — add headers only):
```
Evaluation_ID | Client_Name | Staff_Name | Program_Offered | Save_Attempted | Client_Response | Outcome | Revenue_Saved | Follow_Up_Date | Closed_Date | Outcome_Notes | Timestamp
```

**Customer_Report** and **Monthly_Report** — Leave empty for now. CRIS uses API queries to build these dynamically.

### 1C. Get the Sheet ID

Your Sheet ID is in the URL:
```
https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit
```
Copy everything between `/d/` and `/edit`.

---

## Step 2: Google Service Account Setup

### 2A. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → name it `cris-ba-cleaning` → Create
3. Select the project

### 2B. Enable Google Sheets API

1. Go to **APIs & Services → Library**
2. Search for **Google Sheets API**
3. Click **Enable**

### 2C. Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Name it: `cris-sheets-writer`
4. Click **Create and Continue**
5. Role: **Editor** (or create a custom role with Sheets access)
6. Click **Done**

### 2D. Download the JSON Key

1. Click on your new service account
2. Go to **Keys** tab
3. Click **Add Key → Create New Key → JSON**
4. Download the file — keep it safe, don't commit to git

From the JSON file, you need:
- `client_email` → your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → your `GOOGLE_PRIVATE_KEY`

### 2E. Share the Sheet with the Service Account

1. Open your CRIS Database Google Sheet
2. Click **Share**
3. Paste your service account email (e.g. `cris-sheets-writer@your-project.iam.gserviceaccount.com`)
4. Give it **Editor** access
5. Uncheck "Notify people"
6. Click **Share**

---

## Step 3: Environment Variables

### Server (.env file)

In the `server/` folder, copy `.env.example` to `.env`:

```bash
cp server/.env.example server/.env
```

Fill in:
```env
GOOGLE_SHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz123456789
GOOGLE_SERVICE_ACCOUNT_EMAIL=cris-sheets-writer@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----\n"
ANTHROPIC_API_KEY=sk-ant-api03-...
PORT=3001
```

**Important for GOOGLE_PRIVATE_KEY:**
- Wrap the entire key in double quotes
- Replace actual newlines with `\n`
- Keep the `-----BEGIN` and `-----END` lines

One way to format it correctly:
```bash
# From the JSON key file, extract private_key value and run:
cat your-key.json | python3 -c "import json,sys; print(json.load(sys.stdin)['private_key'])"
```

---

## Step 4: Install Dependencies

```bash
# Install React frontend dependencies
cd cris
npm install

# Install server dependencies
cd server
npm install
```

---

## Step 5: Run the App

You need **two terminals**:

**Terminal 1 — Start the API server:**
```bash
cd cris/server
npm start
# Server runs on http://localhost:3001
```

**Terminal 2 — Start the React app:**
```bash
cd cris
npm start
# App runs on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000)

---

## Step 6: Test with Sample Intake

### Test Google Sheets Connection

In your browser, visit:
```
http://localhost:3001/api/health
```
Should return: `{"ok":true}`

```
http://localhost:3001/api/programs
```
Should return your Programs data from Sheets.

### Test a Full Evaluation

1. Open CRIS at `http://localhost:3000`
2. Click **New Evaluation**
3. Fill in:
   - Staff Name: `Test Staff`
   - Client Name: `Jane Doe (Test)`
   - Customer ID: `TEST-001`
   - Cancellation Reason: `She said prices are too high and she wants to cancel.`
   - Customer Overview: Paste or type sample data
4. Click **Save Evaluation** — check your `Client_Intake` tab in Google Sheets
5. Click **Analyze Client** — wait 15-30 seconds
6. The Cancellation Decision Report should appear
7. Check your `AI_Analysis` tab in Google Sheets — row should appear
8. Click an outcome button and fill out the outcome form
9. Check your `Outcomes` tab in Google Sheets

---

## Step 7: Deploy to Production

### Option A: Deploy to Render (Recommended for small team)

1. Push code to a GitHub repo
2. Go to [render.com](https://render.com)
3. Create a **Web Service** for the server:
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `npm start`
   - Add environment variables from your `.env`
4. Create a **Static Site** for the frontend:
   - Root directory: `.` (root)
   - Build command: `npm install && npm run build`
   - Publish directory: `build`
   - Add env: `REACT_APP_API_URL=https://your-server.onrender.com`

### Option B: Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy server
cd server
railway init
railway up

# Set env vars via Railway dashboard
```

### Option C: VPS / DigitalOcean

```bash
# On server:
cd /var/www/cris/server
npm install
npm install -g pm2
pm2 start index.js --name cris-api

# Build React:
cd /var/www/cris
npm install
npm run build
# Serve build/ with nginx
```

---

## Step 8: Troubleshoot Google Sheets Connection

**Error: "invalid_grant" or auth failure**
- Check your `GOOGLE_PRIVATE_KEY` — make sure `\n` are literal backslash-n in the env var, not actual newlines
- Verify service account email is correct
- Make sure the sheet is shared with the service account

**Error: "The caller does not have permission"**
- Re-share the Google Sheet with the service account email
- Make sure it has **Editor** (not Viewer) access

**Error: "Unable to parse range"**
- Tab names in Google Sheets must exactly match: `Client_Intake`, `AI_Analysis`, `Programs`, etc.
- Check for trailing spaces in tab names

**Error: "Requested entity was not found"**
- Double-check `GOOGLE_SHEET_ID` in `.env`
- Make sure the sheet exists and the service account has access

**Error: Headers row not found / data looks wrong**
- Make sure Row 1 of each tab is the header row
- Headers are case-sensitive — match them exactly as listed in this README

**To debug:**
```bash
# Add this to server/index.js temporarily to print raw sheet data:
app.get('/api/debug/:tab', async (req, res) => {
  const sheets = await getSheets();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: req.params.tab,
  });
  res.json(result.data);
});
```
Then visit `http://localhost:3001/api/debug/Programs`

---

## Step 9: Update Programs, Policies, Rules, and Settings Without Changing Code

CRIS reads all reference data from Google Sheets **before every AI analysis**. You never need to change code to update business logic.

### To add a new program:
1. Open the **Programs** tab in CRIS Database
2. Add a new row with all columns filled
3. Set `Active` to `Yes`
4. That's it — CRIS picks it up on the next analysis

### To deactivate a program:
1. Find the row in the **Programs** tab
2. Change `Active` to `No`
3. Claude will not recommend that program

### To update a policy:
1. Find the row in the **Policies** tab
2. Edit any column — `Customer_Explanation_Coaching_Guidance`, `AI_Guidance`, etc.
3. Changes apply immediately to the next analysis

### To add a new policy:
1. Add a new row in the **Policies** tab
2. Set `Active` to `Yes`
3. Fill in all columns — the more detail, the better Claude's guidance

### To change a setting:
1. Find the row in the **Settings** tab by `Setting_Key`
2. Edit the `Value` column
3. Claude reads all settings before each analysis

### To add a conversation framework:
1. Add a row in the **Conversation_Frameworks** tab
2. Fill in `Situation`, `Objective`, `Must_Cover`, `Must_Avoid`, `Success_Goal`

### To update Program Rules:
1. Find the relevant `Program_ID` in the **Program_Rules** tab
2. Edit or add rows
3. `Rule_Type` examples: `Minimum_Tenure_Months`, `Minimum_Scorecard_Pct`, `Requires_Manager_Approval`, `Max_Discount_Pct`

---

## AI Philosophy Notes

Claude is instructed to:
- **NOT recommend saving every client** — poor-fit clients are flagged
- Recommend **Respectful Cancellation** when client fit is genuinely poor
- Consider profitability, technician impact, scorecard history, behavioral patterns
- NOT over-recommend discounts
- NOT recommend Hardship program unless hardship is clearly present
- NOT recommend Flex unless scheduling flexibility is realistic
- Explain policies in terms of technician livelihood and business health
- Be practical and specific — not generic

The `Save_Worthiness_Score` (0–100) and `Client_Category` are the primary decision outputs:
- **Strong Save Candidate** (70–100): High value, good relationship, clear fixable reason
- **Save If Reasonable** (50–69): Worth attempting with the right offer
- **Conditional Save / Management Review** (35–49): Needs careful consideration or escalation
- **Not Ideal to Save** (0–34): Recommend Respectful Cancellation

---

## Data Privacy

- All client data is stored in **your** Google Sheet — not in CRIS servers
- Claude API receives intake data for analysis but does not store it per Anthropic's API policy
- No client data is stored in the React frontend beyond the current session
- Evaluation IDs are random and not guessable

---

## Support

For Google Sheets API issues: https://developers.google.com/sheets/api
For Anthropic API issues: https://docs.anthropic.com
For CRIS app questions: contact your implementation team
