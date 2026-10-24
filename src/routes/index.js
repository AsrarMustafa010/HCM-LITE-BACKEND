const express = require('express');
const router = express.Router();

const setupRoutes = require('./setup.routes');
const authRoutes = require('./auth.routes');
const orgRoutes = require('./org.routes');
const employeeRoutes = require('./employee.routes');
const attendanceRoutes = require('./attendance.routes');
const leaveRoutes = require('./leave.routes');
const payrollRoutes = require('./payroll.routes');
const dashboardRoutes = require('./dashboard.routes');
const aiRoutes = require('./ai.routes');
const commsRoutes = require('./comms.routes');

// Health Check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    system: 'HCM Lite API',
    timestamp: new Date().toISOString()
  });
});

// Interactive API Documentation for Judges & Frontend
router.get('/docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>HCM Lite — API Documentation</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #e2e8f0; padding: 30px; margin: 0; line-height: 1.6; }
        .container { max-width: 1000px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        h1 { color: #38bdf8; border-bottom: 2px solid #334155; padding-bottom: 12px; margin-top: 0; }
        .badge { background: #0284c7; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .tag-post { background: #15803d; color: white; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .tag-get { background: #0369a1; color: white; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .tag-patch { background: #b45309; color: white; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .tag-put { background: #7c3aed; color: white; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .tag-delete { background: #b91c1c; color: white; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 25px; }
        th, td { text-align: left; padding: 10px; border-bottom: 1px solid #334155; }
        th { background: #0f172a; color: #94a3b8; }
        code { background: #0f172a; color: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>HCM Lite — Backend API Reference</h1>
        <p>Built for Saylani Hackathon 2026. Zero pre-loaded data. Real-time RBAC, attendance rules, tax calculations, and dual Gemini + Groq AI assistant tool calling.</p>
        
        <h2>Modules & Core Endpoints</h2>
        <table>
          <thead>
            <tr><th>Module</th><th>Method & Path</th><th>Allowed Roles</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td>M1 Setup</td><td><span class="tag-get">GET</span> <code>/api/setup/status</code></td><td>Public</td><td>Check if first-run setup is required</td></tr>
            <tr><td>M1 Setup</td><td><span class="tag-post">POST</span> <code>/api/setup/init</code></td><td>Public (0 users)</td><td>Initialize company profile & first Admin</td></tr>
            <tr><td>M1 Setup</td><td><span class="tag-post">POST</span> <code>/api/setup/reset-demo</code></td><td>Public</td><td>Wipe all data for clean 5-minute rehearsal</td></tr>
            <tr><td>M1 Auth</td><td><span class="tag-post">POST</span> <code>/api/auth/login</code></td><td>Public</td><td>User login with email & password</td></tr>
            <tr><td>M1 Auth</td><td><span class="tag-post">POST</span> <code>/api/auth/forgot-password</code></td><td>Public</td><td>Send 6-digit OTP for password recovery</td></tr>
            <tr><td>M1 Auth</td><td><span class="tag-post">POST</span> <code>/api/auth/reset-password</code></td><td>Public</td><td>Reset password with OTP</td></tr>
            <tr><td>M2 Org</td><td><span class="tag-get">GET</span> <code>/api/org/settings</code></td><td>All</td><td>Get office hours, grace, and geofence</td></tr>
            <tr><td>M2 Org</td><td><span class="tag-post">POST</span> <code>/api/org/users/hr</code></td><td>ADMIN</td><td>Create HR login with temporary password</td></tr>
            <tr><td>M3 Emp</td><td><span class="tag-post">POST</span> <code>/api/employees</code></td><td>HR</td><td>Register employee & auto-generate login</td></tr>
            <tr><td>M3 Emp</td><td><span class="tag-post">POST</span> <code>/api/employees/csv-import</code></td><td>HR</td><td>CSV import with dry-run validation</td></tr>
            <tr><td>M3 Emp</td><td><span class="tag-get">GET</span> <code>/api/employees/:id/360</code></td><td>Scoped</td><td>Employee 360 view (profile, leaves, payslips)</td></tr>
            <tr><td>M4 Att</td><td><span class="tag-post">POST</span> <code>/api/attendance/check-in</code></td><td>HR, EMPLOYEE</td><td>Check-in (web or camera+GPS geofence) (409 on duplicate)</td></tr>
            <tr><td>M4 Att</td><td><span class="tag-post">POST</span> <code>/api/attendance/check-out</code></td><td>HR, EMPLOYEE</td><td>Check-out (computes worked hours & half-day)</td></tr>
            <tr><td>M5 Leave</td><td><span class="tag-post">POST</span> <code>/api/leaves</code></td><td>HR, EMPLOYEE</td><td>Apply for leave (422 on overlap / over-balance)</td></tr>
            <tr><td>M5 Leave</td><td><span class="tag-patch">PATCH</span> <code>/api/leaves/:id/review</code></td><td>HR</td><td>Approve or reject leave request</td></tr>
            <tr><td>M6 Payroll</td><td><span class="tag-post">POST</span> <code>/api/payroll/runs</code></td><td>HR</td><td>Generate draft monthly payroll with tax slabs</td></tr>
            <tr><td>M6 Payroll</td><td><span class="tag-patch">PATCH</span> <code>/api/payroll/runs/:id/finalize</code></td><td>ADMIN</td><td>Finalize and lock monthly payroll run</td></tr>
            <tr><td>M6 Payroll</td><td><span class="tag-get">GET</span> <code>/api/payroll/payslips/:id/pdf</code></td><td>Scoped</td><td>Stream generated PDF payslip</td></tr>
            <tr><td>M7 Dash</td><td><span class="tag-get">GET</span> <code>/api/dashboard/admin</code></td><td>ADMIN</td><td>Admin KPIs, payroll cost & attrition risk</td></tr>
            <tr><td>M7 Dash</td><td><span class="tag-get">GET</span> <code>/api/dashboard/hr</code></td><td>ADMIN, HR</td><td>HR KPIs, attendance trend, anomaly flags</td></tr>
            <tr><td>M8 AI</td><td><span class="tag-post">POST</span> <code>/api/ai/chat</code></td><td>All</td><td>Tool-calling AI assistant (Gemini + Groq failover)</td></tr>
            <tr><td>M8 AI</td><td><span class="tag-post">POST</span> <code>/api/ai/smart-leave</code></td><td>All</td><td>Smart leave natural language parser</td></tr>
            <tr><td>M8 AI</td><td><span class="tag-post">POST</span> <code>/api/ai/dashboard-summary</code></td><td>ADMIN, HR</td><td>AI summary of dashboard KPI JSON</td></tr>
            <tr><td>M9 Comms</td><td><span class="tag-post">POST</span> <code>/api/announcements</code></td><td>ADMIN, HR</td><td>Post announcement + real-time socket alert</td></tr>
            <tr><td>M9 Audit</td><td><span class="tag-get">GET</span> <code>/api/audit-logs</code></td><td>ADMIN</td><td>Immutable audit trail</td></tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `);
});

// Mount Routes
router.use('/setup', setupRoutes);
router.use('/auth', authRoutes);
router.use('/org', orgRoutes);
router.use('/employees', employeeRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leaveRoutes);
router.use('/payroll', payrollRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/ai', aiRoutes);
router.use('/', commsRoutes);

module.exports = router;
