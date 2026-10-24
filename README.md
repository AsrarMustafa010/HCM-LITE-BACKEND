# HCM Lite — Backend API (Saylani Hackathon 2026)

AI-assisted Human Capital Management Backend for Admin, HR, and Employees.
Built with **Node.js, Express, MongoDB (Mongoose), Socket.io, PDFKit, and Dual AI Tool Calling (Google Gemini + Groq Failover)**.

---

## 🌟 Highlights & Scoring Compliance (100 Points + 10 Bonus Points)

- **Zero Pre-loaded Data:** The system starts completely empty. First-run setup (`/api/setup/init` or `.env` auto-bootstrap) creates the Company and first Admin account.
- **Server-Side RBAC & Scope Guard:** Strict checks on every request. Employees can only access their own attendance, leaves, payslips, and profile.
- **Strict Business Logic:**
  - One check-in per day (second check-in = **`409 Conflict`**).
  - Leave overlap or quota over-balance = **`422 Unprocessable Entity`** (skips weekends and public holidays).
  - Payroll with 5 progressive tax slabs, joiner/leaver proration, and irreversible Admin finalize lock.
- **Dual AI Assistant (Gemini + Groq + Safety Net):**
  - Layer 1: Google Gemini Flash with function calling / tools.
  - Layer 2: Automatic Groq (`llama-3.3-70b-versatile`) failover on rate limits.
  - Layer 3: Deterministic local tool router ensuring live demo questions never fail.
  - Politely refuses when employees ask about colleagues' salaries.
  - Full Roman Urdu question-answering support!
- **+10 Bonus Points Features:**
  - 📷 Camera + GPS Geofence Check-in (`Haversine` formula via `geolib`, accuracy <= 100m, face count verification).
  - ⏱️ Late Penalty Rule (3 lates = 0.5 day salary deduction).
  - 📊 Attrition Risk Score & Absence Anomaly Flags on Dashboards.
  - 🔄 Instant Demo Reset endpoint (`POST /api/setup/reset-demo`) for fresh judging rehearsals.

---

## 🚀 Quick Start (Under 3 Minutes)

### 1. Prerequisites
- Node.js >= 18 (Tested on Node v24)
- MongoDB Atlas Connection URI or local MongoDB (`mongodb://127.0.0.1:27017/hcm_lite`)

### 2. Installation
```bash
cd C:\Users\M.LAPTOP\Desktop\hcm-lite-backend
npm install
```

### 3. Environment Configuration
Create or inspect `.env` in the root folder:
```env
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/hcm_lite
JWT_SECRET=super_secret_hcm_lite_jwt_key_2026_saylani
JWT_EXPIRES_IN=7d

# Free Tier AI Keys (Gemini Primary + Groq Failover)
GEMINI_API_KEY=your_free_gemini_api_key
GROQ_API_KEY=your_free_groq_api_key

# Optional Auto-bootstrap on First Start
ADMIN_EMAIL=admin@hcmlite.com
ADMIN_PASSWORD=Admin@12345
COMPANY_NAME=Saylani HCM Lite
FRONTEND_URL=http://localhost:3000
```

### 4. Run the Server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

Server runs on: **`http://localhost:5000`**  
Interactive API Documentation: **`http://localhost:5000/api/docs`**

---

## 📋 5-Minute Live Demo Script for Judges

1. **First-Run Setup:**
   - Make a `POST /api/setup/init` (or start with `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`).
   - The company rules, office hours (`09:00`, grace `15` min), geofence, and 4 default leave types are initialized.
2. **HR Onboarding:**
   - Admin logs in (`POST /api/auth/login`) and creates an HR user (`POST /api/org/users/hr`).
   - HR logs in, changes temporary password (`POST /api/auth/change-password`).
3. **Register Employee & Check-in:**
   - HR registers employee Ali Khan (`POST /api/employees`).
   - Ali logs in (`POST /api/auth/login`), changes password, and performs Web or Camera Check-In (`POST /api/attendance/check-in`).
   - Attempting a second check-in returns **`409 Conflict`**.
4. **Smart Leave Application & HR Approval:**
   - Ali submits Smart Leave natural language prompt: *"Need next Monday and Tuesday off for my sister's wedding"* (`POST /api/ai/smart-leave`).
   - Ali confirms the pre-filled form (`POST /api/leaves`).
   - HR reviews and approves (`PATCH /api/leaves/:id/review`).
5. **Dashboard, Payroll & AI Assistant:**
   - HR views HR Dashboard (`GET /api/dashboard/hr`) and clicks Summarize (`POST /api/ai/dashboard-summary`).
   - HR asks AI Assistant: *"Who is on leave today?"* (`POST /api/ai/chat`) -> returns 1 employee on leave.
   - HR runs Monthly Payroll Draft (`POST /api/payroll/runs`).
   - Admin finalizes the payroll run (`PATCH /api/payroll/runs/:id/finalize`).
   - Ali downloads his official PDF Payslip (`GET /api/payroll/payslips/:id/pdf`).
   - Ali asks AI: *"What is Ahmed's salary?"* -> AI politely refuses based on RBAC scoping!
   - Admin inspects the immutable Audit Trail (`GET /api/audit-logs`).
6. **Reset for Next Run:**
   - Click/Call `POST /api/setup/reset-demo` to clear all collections back to zero.
