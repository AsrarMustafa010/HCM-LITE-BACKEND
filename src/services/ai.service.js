const { GoogleGenerativeAI } = require('@google/generative-ai');
const AiLog = require('../models/AiLog.model');
const Employee = require('../models/Employee.model');
const Attendance = require('../models/Attendance.model');
const LeaveRequest = require('../models/LeaveRequest.model');
const LeaveType = require('../models/LeaveType.model');
const PayrollRun = require('../models/PayrollRun.model');
const Payslip = require('../models/Payslip.model');
const Department = require('../models/Department.model');
const CompanySettings = require('../models/CompanySettings.model');
const { getCurrentDateString, formatDate } = require('../utils/date.util');

// 15-second timeout wrapper (Section 4 Guardrail)
const withTimeout = (promise, ms = 15000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms)
    )
  ]);
};

// ==================== SYSTEM PROMPT & POLICY RULES ====================
const SYSTEM_POLICY_PROMPT = `
You are the AI Assistant for HCM Lite, an AI-assisted Human Capital Management system.
You answer questions ONLY from real company data accessed via your tools and the official business policies below.

POLICIES & BUSINESS RULES (Section 3):
- M1 Auth: Roles are Admin, HR, and Employee. Every employee can only view their own private data and salary.
- M2 Setup: Office start 09:00, grace 15 min (late after 09:15), half day under 5 hours, weekend Saturday-Sunday, office location + radius (e.g. 150m).
- M3 Employees: HR registers employees; employees can edit own phone and address.
- M4 Attendance: One check-in per day (second check-in = 409 Conflict). Late if after 09:15. Half day if worked hours < 5. Absent if no check-in and no approved leave. Missing checkout if checked in without checking out.
- M5 Leave: Quotas: Annual 14, Sick 8, Casual 10, Unpaid unlimited. Weekends and public holidays are skipped. Overlap or over-balance is rejected with 422.
- M6 Payroll: Gross = 1.5 * Basic (HRA 40%, Medical 10%). Per day = Gross / Working Days. Deductions for absent, unpaid leave, half day (0.5), and late penalty (3 lates = 0.5 day deduction). Tax slabs on annual gross: 0 to 600k (0%), 600k-1.2M (5%), 1.2M-2.4M (30k+15%), 2.4M-3.6M (210k+25%), >3.6M (510k+35%). Finalized payroll runs are permanently locked.

STRICT ACCESS CONTROL:
- If a user with role 'EMPLOYEE' asks about another colleague's salary, pay, or private data, you MUST politely refuse:
  "I'm sorry, you only have permission to view your own salary and payroll information."
- You understand and can respond in English as well as Roman Urdu (e.g. 'Aaj kon chutti par hai?', 'Meri kitni sick leaves baki hain?') naturally.
- Always provide concise, helpful answers based strictly on the tool output numbers. If a policy question is outside Section 3 rules, state that you do not know.
`;

// Check if an EMPLOYEE is asking for a colleague's salary/private data
const isColleagueSalaryQuery = (prompt, user) => {
  if (user.role !== 'EMPLOYEE') return false;
  const p = prompt.toLowerCase();
  const salaryKeywords = ['salary', 'pay', 'payslip', 'income', 'package', 'gross', 'net pay', 'tankhwah', 'kamata', 'earn'];
  const hasSalaryKeyword = salaryKeywords.some(k => p.includes(k));
  if (!hasSalaryKeyword) return false;

  const ownKeywords = ['my salary', 'my pay', 'my payslip', 'meri salary', 'meri tankhwah', 'what do i earn', 'how much do i'];
  if (ownKeywords.some(k => p.includes(k))) return false;

  // Contains possessive "'s" or "of " or "ki salary" / "ka salary" or colleague
  if (
    p.includes("'s") ||
    p.includes("’s") ||
    p.includes('colleague') ||
    p.includes('salary of ') ||
    p.includes(' ki salary') ||
    p.includes(' ki tankhwah') ||
    p.includes('what is ')
  ) {
    return true;
  }
  return false;
};

// ==================== 7 TOOL IMPLEMENTATIONS (ROLE-SCOPED) ====================
const executeTool = async (name, args = {}, user) => {
  const todayStr = getCurrentDateString();

  switch (name) {
    case 'get_headcount': {
      const filter = { employmentStatus: { $in: ['ACTIVE', 'PROBATION'] } };
      if (args.departmentName) {
        const dept = await Department.findOne({
          $or: [{ name: new RegExp(args.departmentName, 'i') }, { code: new RegExp(args.departmentName, 'i') }]
        });
        if (dept) filter.departmentId = dept._id;
      }
      const count = await Employee.countDocuments(filter);
      return { totalHeadcount: count, department: args.departmentName || 'All' };
    }

    case 'get_attendance_summary': {
      if (user.role === 'EMPLOYEE') {
        const records = await Attendance.find({ employeeId: user.employeeId });
        return {
          employee: user.name,
          totalDaysRecorded: records.length,
          present: records.filter(r => r.status === 'present').length,
          late: records.filter(r => r.isLate).length,
          halfDay: records.filter(r => r.status === 'half_day').length
        };
      }

      const dateStr = args.startDate || args.date || todayStr;
      const totalActive = await Employee.countDocuments({ employmentStatus: { $in: ['ACTIVE', 'PROBATION'] } });
      const records = await Attendance.find({ date: dateStr });
      const present = records.filter(r => ['present', 'late', 'missing_checkout'].includes(r.status)).length;
      const late = records.filter(r => r.isLate).length;
      const halfDay = records.filter(r => r.status === 'half_day').length;
      const onLeave = records.filter(r => r.status === 'on_leave').length;
      const eligible = Math.max(1, totalActive - onLeave);
      const attendanceRate = Number((((present + 0.5 * halfDay) / eligible) * 100).toFixed(1));

      return {
        date: dateStr,
        totalEmployees: totalActive,
        presentToday: present + halfDay,
        lateToday: late,
        halfDay,
        onLeaveToday: onLeave,
        attendanceRatePercent: attendanceRate
      };
    }

    case 'get_late_comers': {
      if (user.role === 'EMPLOYEE') {
        const count = await Attendance.countDocuments({ employeeId: user.employeeId, isLate: true });
        return { message: `You have arrived late ${count} time(s).` };
      }

      const limit = Number(args.limit) || 5;
      const attendances = await Attendance.find({ isLate: true })
        .populate('employeeId', 'employeeCode fullName email')
        .sort({ date: -1 });

      const map = {};
      attendances.forEach(a => {
        if (a.employeeId) {
          const id = String(a.employeeId._id);
          if (!map[id]) {
            map[id] = {
              name: a.employeeId.fullName,
              code: a.employeeId.employeeCode,
              lateCount: 0,
              totalMinutesLate: 0
            };
          }
          map[id].lateCount++;
          map[id].totalMinutesLate += a.minutesLate || 0;
        }
      });

      const ranked = Object.values(map).sort((a, b) => b.lateCount - a.lateCount).slice(0, limit);
      return { lateComers: ranked };
    }

    case 'get_leave_summary': {
      const targetDate = args.date || todayStr;
      const leaves = await LeaveRequest.find({
        status: 'APPROVED',
        startDate: { $lte: targetDate },
        endDate: { $gte: targetDate }
      }).populate('employeeId', 'fullName employeeCode').populate('leaveTypeId', 'name code');

      const onLeaveCount = leaves.length;
      const breakdown = {};
      leaves.forEach(l => {
        const type = l.leaveTypeId?.name || l.leaveTypeCode;
        breakdown[type] = (breakdown[type] || 0) + 1;
      });

      return {
        date: targetDate,
        totalOnLeave: onLeaveCount,
        breakdown,
        employeesOnLeave: user.role === 'EMPLOYEE' ? [] : leaves.map(l => ({
          name: l.employeeId?.fullName,
          leaveType: l.leaveTypeId?.name || l.leaveTypeCode
        }))
      };
    }

    case 'get_my_leave_balance': {
      if (!user.employeeId) {
        return { message: 'No employee record linked to this account.' };
      }

      const leaveTypes = await LeaveType.find({ isActive: true });
      const currentYear = Number(args.year) || new Date().getFullYear();
      const approved = await LeaveRequest.find({
        employeeId: user.employeeId,
        status: 'APPROVED',
        startDate: { $gte: `${currentYear}-01-01` }
      });

      const balances = leaveTypes.map(lt => {
        const used = approved
          .filter(l => String(l.leaveTypeId) === String(lt._id))
          .reduce((sum, l) => sum + (l.workingDays || 0), 0);
        return {
          leaveType: lt.name,
          code: lt.code,
          quota: lt.yearlyQuota,
          used,
          remaining: lt.isUnlimited ? 'Unlimited' : Math.max(0, lt.yearlyQuota - used)
        };
      });

      return { balances };
    }

    case 'get_payroll_summary': {
      if (user.role === 'EMPLOYEE') {
        const lastPayslip = await Payslip.findOne({ employeeId: user.employeeId })
          .sort({ year: -1, month: -1 });
        if (!lastPayslip) {
          const emp = await Employee.findById(user.employeeId);
          return {
            message: 'Your own salary structure',
            basic: emp?.salaryStructure?.basic || 0,
            gross: emp?.salaryStructure?.gross || 0
          };
        }
        return {
          month: lastPayslip.month,
          year: lastPayslip.year,
          netPay: `PKR ${lastPayslip.netPay.toLocaleString()}`,
          grossPay: `PKR ${lastPayslip.proratedGross.toLocaleString()}`
        };
      }

      const latestRun = await PayrollRun.findOne().sort({ year: -1, month: -1 });
      if (!latestRun) {
        return { message: 'No payroll runs found yet.' };
      }
      return {
        month: latestRun.month,
        year: latestRun.year,
        status: latestRun.status,
        totalEmployees: latestRun.totalEmployees,
        totalNetPay: `PKR ${latestRun.totalNetPay.toLocaleString()}`,
        totalGross: `PKR ${latestRun.totalGross.toLocaleString()}`
      };
    }

    case 'search_employees': {
      if (user.role === 'EMPLOYEE') {
        return { message: 'Forbidden: Employees only have permission to view their own profile and salary.' };
      }

      const query = args.query ? new RegExp(args.query.trim(), 'i') : /.*/;
      const list = await Employee.find({
        $or: [{ fullName: query }, { employeeCode: query }, { email: query }]
      }).populate('departmentId', 'name code').limit(5);

      return {
        results: list.map(e => ({
          code: e.employeeCode,
          name: e.fullName,
          department: e.departmentId?.name,
          designation: e.designationTitle,
          status: e.employmentStatus
        }))
      };
    }

    default:
      return { error: `Tool ${name} not recognized` };
  }
};

// Tool schemas for Gemini & Groq (All OBJECT parameters have at least 1 property to satisfy Gemini API validation)
const TOOL_DEFINITIONS = [
  {
    name: 'get_headcount',
    description: 'Get total number of active employees, optionally filtered by department name or code',
    parameters: {
      type: 'OBJECT',
      properties: { departmentName: { type: 'STRING', description: 'Optional department name or code' } }
    }
  },
  {
    name: 'get_attendance_summary',
    description: "Get attendance summary and attendance rate (present, late, on leave counts)",
    parameters: {
      type: 'OBJECT',
      properties: {
        startDate: { type: 'STRING', description: 'Optional start date YYYY-MM-DD' },
        endDate: { type: 'STRING', description: 'Optional end date YYYY-MM-DD' },
        departmentName: { type: 'STRING', description: 'Optional department name' }
      }
    }
  },
  {
    name: 'get_late_comers',
    description: 'Get ranked list of employees who came late most often',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'NUMBER', description: 'Optional month (1-12)' },
        year: { type: 'NUMBER', description: 'Optional year' },
        limit: { type: 'NUMBER', description: 'Max number of late comers to return' }
      }
    }
  },
  {
    name: 'get_leave_summary',
    description: 'Get summary of who is on leave on a given date and breakdown by leave type',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'Optional date YYYY-MM-DD (defaults to today)' },
        departmentName: { type: 'STRING', description: 'Optional department name' }
      }
    }
  },
  {
    name: 'get_my_leave_balance',
    description: 'Get the logged-in user leave balance for Annual, Sick, Casual, and Unpaid leaves',
    parameters: {
      type: 'OBJECT',
      properties: {
        year: { type: 'NUMBER', description: 'Optional calendar year (e.g. 2026)' }
      }
    }
  },
  {
    name: 'get_payroll_summary',
    description: 'Get monthly payroll run summary (or logged-in employee own payslip)',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'NUMBER', description: 'Optional month (1-12)' },
        year: { type: 'NUMBER', description: 'Optional year' }
      }
    }
  },
  {
    name: 'search_employees',
    description: 'Search employees by name, code, or email (HR and Admin only)',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search keyword' },
        departmentName: { type: 'STRING', description: 'Optional department filter' }
      },
      required: ['query']
    }
  }
];

// ==================== LAYER 3: DETERMINISTIC SAFETY NET ====================
const deterministicFallbackAnswer = async (prompt, user) => {
  const p = prompt.toLowerCase();

  // 1. Employee asks for colleague's salary check
  if (isColleagueSalaryQuery(prompt, user)) {
    return {
      text: "I'm sorry, you only have permission to view your own salary and payroll information.",
      toolsCalled: [],
      status: 'REFUSED'
    };
  }

  // 2. Who is on leave today / chutti par kon hai
  if ((p.includes('leave') || p.includes('chutti')) && (p.includes('today') || p.includes('who') || p.includes('kon') || p.includes('aaj') || p.includes('summary'))) {
    const data = await executeTool('get_leave_summary', {}, user);
    if (data.totalOnLeave === 0) {
      return { text: '0 employees are on leave today.', toolsCalled: ['get_leave_summary'], status: 'SUCCESS' };
    }
    const breakdownText = Object.entries(data.breakdown || {})
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');
    const names = data.employeesOnLeave?.length
      ? ` (${data.employeesOnLeave.map(e => e.name).join(', ')})`
      : '';
    return {
      text: `${data.totalOnLeave} employee(s) on leave today: ${breakdownText}${names}.`,
      toolsCalled: ['get_leave_summary'],
      status: 'SUCCESS'
    };
  }

  // 3. Leave balance / Sick leaves left
  if (p.includes('leave') || p.includes('sick') || p.includes('casual') || p.includes('annual') || p.includes('chuttiyan') || p.includes('balance')) {
    const data = await executeTool('get_my_leave_balance', {}, user);
    if (data.balances) {
      if (p.includes('sick')) {
        const sick = data.balances.find(b => b.code === 'SICK');
        if (sick) {
          return {
            text: `You have ${sick.remaining} Sick Leave(s) left this year (Quota: ${sick.quota}, Used: ${sick.used}).`,
            toolsCalled: ['get_my_leave_balance'],
            status: 'SUCCESS'
          };
        }
      }
      const summary = data.balances.map(b => `${b.leaveType}: ${b.remaining} left (used ${b.used}/${b.quota})`).join(' · ');
      return {
        text: `Your current leave balances: ${summary}.`,
        toolsCalled: ['get_my_leave_balance'],
        status: 'SUCCESS'
      };
    }
  }

  // 4. Headcount / Active employees
  if (p.includes('headcount') || p.includes('how many') || p.includes('active employees') || p.includes('kitne employee')) {
    const deptMatch = p.match(/in\s+([a-z0-9\s]+?)(\?|$)/i);
    const deptName = deptMatch ? deptMatch[1].trim() : undefined;
    const data = await executeTool('get_headcount', { departmentName: deptName }, user);
    return {
      text: `There are ${data.totalHeadcount} active employee(s) in ${data.department === 'All' ? 'the company' : data.department}.`,
      toolsCalled: ['get_headcount'],
      status: 'SUCCESS'
    };
  }

  // 5. Attendance rate
  if (p.includes('attendance rate') || p.includes('present today') || p.includes('hazri')) {
    const data = await executeTool('get_attendance_summary', {}, user);
    if (user.role === 'EMPLOYEE') {
      return {
        text: `Your attendance summary: ${data.present} days present, ${data.late} late arrivals, ${data.halfDay} half days.`,
        toolsCalled: ['get_attendance_summary'],
        status: 'SUCCESS'
      };
    }
    return {
      text: `Today's attendance rate is ${data.attendanceRatePercent}% (${data.presentToday} present, ${data.lateToday} late, ${data.onLeaveToday} on leave out of ${data.totalEmployees} active employees).`,
      toolsCalled: ['get_attendance_summary'],
      status: 'SUCCESS'
    };
  }

  // 6. Late comers
  if (p.includes('late') || p.includes('deri')) {
    const data = await executeTool('get_late_comers', { limit: 5 }, user);
    if (data.lateComers && data.lateComers.length > 0) {
      const names = data.lateComers.map(l => `${l.name} (${l.lateCount} late(s), ${l.totalMinutesLate}m total)`).join(', ');
      return {
        text: `Most frequent late-comers: ${names}.`,
        toolsCalled: ['get_late_comers'],
        status: 'SUCCESS'
      };
    }
    return { text: 'No late arrivals recorded for this period.', toolsCalled: ['get_late_comers'], status: 'SUCCESS' };
  }

  // 7. Payroll summary
  if (p.includes('payroll') || p.includes('salary')) {
    const data = await executeTool('get_payroll_summary', {}, user);
    return {
      text: JSON.stringify(data),
      toolsCalled: ['get_payroll_summary'],
      status: 'SUCCESS'
    };
  }

  // 8. Policy Questions (Section 3 Rules)
  if (p.includes('grace') || p.includes('timing') || p.includes('office hour') || p.includes('half day')) {
    return {
      text: 'Official office hours start at 09:00 with a 15-minute grace period (marked late after 09:15). Working under 5 hours is marked as a half day. Weekends are Saturday and Sunday.',
      toolsCalled: [],
      status: 'SUCCESS'
    };
  }

  if (p.includes('tax') || p.includes('slab')) {
    return {
      text: 'Tax is calculated on annualized gross (Gross × 12): 0 to 600k (0%), 600k–1.2M (5%), 1.2M–2.4M (30k + 15%), 2.4M–3.6M (210k + 25%), and above 3.6M (510k + 35%).',
      toolsCalled: [],
      status: 'SUCCESS'
    };
  }

  return {
    text: 'I am the HCM Lite AI Assistant. I can help you with live headcount, attendance rates, late-comers, leave balances, payroll summaries, and company HR policies.',
    toolsCalled: [],
    status: 'SUCCESS'
  };
};

// ==================== LAYER 2: GROQ FREE API CALL ====================
const callGroq = async (prompt, user) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const groqTools = TOOL_DEFINITIONS.map(t => {
    const normalizedProps = {};
    for (const [k, v] of Object.entries(t.parameters.properties || {})) {
      normalizedProps[k] = {
        ...v,
        type: String(v.type || 'string').toLowerCase()
      };
    }
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: normalizedProps,
          required: t.parameters.required || []
        }
      }
    };
  });

  const messages = [
    { role: 'system', content: SYSTEM_POLICY_PROMPT },
    { role: 'user', content: `[User Role: ${user.role}, Name: ${user.name}] Question: ${prompt}` }
  ];

  const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  const response = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: groqModel,
        messages,
        tools: groqTools,
        tool_choice: 'auto',
        max_tokens: 500
      })
    }),
    12000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  const choice = json.choices[0];

  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    const toolName = toolCall.function.name;
    const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

    const toolResult = await executeTool(toolName, toolArgs, user);

    const followUp = await withTimeout(
      fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            ...messages,
            choice.message,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolName,
              content: JSON.stringify(toolResult)
            }
          ],
          max_tokens: 500
        })
      }),
      12000
    );

    const followUpJson = await followUp.json();
    return {
      text: followUpJson.choices[0].message.content,
      toolsCalled: [toolName]
    };
  }

  return {
    text: choice.message.content,
    toolsCalled: []
  };
};

// ==================== LAYER 1: GEMINI FREE API CALL ====================
const callGemini = async (prompt, user) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const genAI = new GoogleGenerativeAI(apiKey);

  const functionDeclarations = TOOL_DEFINITIONS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }));

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    systemInstruction: SYSTEM_POLICY_PROMPT,
    tools: [{ functionDeclarations }]
  });

  const chat = model.startChat();
  const result = await withTimeout(
    chat.sendMessage(`[User Role: ${user.role}, Name: ${user.name}] Question: ${prompt}`),
    10000
  );

  const call = result.response.functionCalls();
  const toolsCalled = [];

  if (call && call.length > 0) {
    const tool = call[0];
    toolsCalled.push(tool.name);
    const toolOutput = await executeTool(tool.name, tool.args, user);

    const result2 = await withTimeout(
      chat.sendMessage([
        {
          functionResponse: {
            name: tool.name,
            response: { result: toolOutput }
          }
        }
      ]),
      10000
    );

    return {
      text: result2.response.text(),
      toolsCalled
    };
  }

  return {
    text: result.response.text(),
    toolsCalled
  };
};

// ==================== MAIN CHAT DISPATCHER (3-LAYER FAILOVER) ====================
const chatAssistant = async (prompt, user, feature = 'CHAT') => {
  const startTime = Date.now();
  let providerUsed = 'gemini';
  let responseText = '';
  let toolsCalled = [];
  let status = 'SUCCESS';

  // Hard Guardrail: Immediately refuse if an EMPLOYEE asks for a colleague's salary
  if (feature === 'CHAT' && isColleagueSalaryQuery(prompt, user)) {
    responseText = "I'm sorry, you only have permission to view your own salary and payroll information.";
    providerUsed = 'fallback';
    status = 'REFUSED';
  } else {
    try {
      const geminiRes = await callGemini(prompt, user);
      responseText = geminiRes.text;
      toolsCalled = geminiRes.toolsCalled;
      providerUsed = 'gemini';
    } catch (geminiError) {
      console.warn(`[AI Warning] Gemini API unavailable (${geminiError.message}). Switching to Groq failover...`);

      try {
        const groqRes = await callGroq(prompt, user);
        responseText = groqRes.text;
        toolsCalled = groqRes.toolsCalled;
        providerUsed = 'groq';
      } catch (groqError) {
        console.warn(`[AI Warning] Groq API unavailable (${groqError.message}). Using local deterministic tool router...`);
        const fallbackRes = await deterministicFallbackAnswer(prompt, user);
        responseText = fallbackRes.text;
        toolsCalled = fallbackRes.toolsCalled || [];
        status = fallbackRes.status || 'SUCCESS';
        providerUsed = 'fallback';
      }
    }
  }

  const durationMs = Date.now() - startTime;

  try {
    await AiLog.create({
      userId: user.userId,
      role: user.role,
      feature,
      prompt,
      toolsCalled,
      response: responseText,
      providerUsed,
      durationMs,
      status
    });
  } catch (err) {
    console.error(`[AiLog Error] ${err.message}`);
  }

  return {
    reply: responseText,
    answer: responseText,
    response: responseText,
    providerUsed,
    toolsCalled,
    status,
    isAiGenerated: true,
    label: 'AI-generated'
  };
};

// ==================== DASHBOARD SUMMARY ====================
const generateDashboardSummary = async (kpis, user) => {
  const prompt = `Given the following HR dashboard metrics: ${JSON.stringify(kpis)}.
Provide 3 to 5 concise, actionable insight bullets using ONLY these numbers.
Return ONLY a valid JSON array of strings: ["bullet 1", "bullet 2", "bullet 3"].`;

  try {
    const res = await chatAssistant(prompt, user, 'SUMMARY');
    const text = res.response;
    const match = text.match(/\[.*\]/s);
    if (match) {
      const bullets = JSON.parse(match[0]);
      if (Array.isArray(bullets) && bullets.length >= 3) {
        return { bullets: bullets.slice(0, 5), isAiGenerated: true, label: 'AI-generated' };
      }
    }
  } catch (err) {
    // Fallback below
  }

  const bullets = [
    `Active headcount is currently ${kpis.headcount ?? kpis.totalEmployees ?? 0} employee(s).`,
    kpis.presentToday !== undefined
      ? `Today's attendance: ${kpis.presentToday} present, ${kpis.onLeaveToday || 0} on leave, and ${kpis.lateToday || 0} late arrival(s) (${kpis.attendanceRate ?? 0}% attendance rate).`
      : `Total monthly payroll cost is PKR ${(kpis.totalPayrollCost || 0).toLocaleString()} with an average gross salary of PKR ${(kpis.averageSalary || 0).toLocaleString()}.`,
    kpis.pendingApprovals !== undefined
      ? `There are ${kpis.pendingApprovals} pending leave or attendance correction request(s) awaiting HR review.`
      : `Year-to-date attrition rate stands at ${kpis.attritionRateYTD || 0}%.`
  ];

  return {
    bullets,
    isAiGenerated: true,
    label: 'AI-generated'
  };
};

// Helper: Resolve weekday names ("next Monday and Tuesday", "tomorrow", "peer", "mangal") relative to today
const parseNaturalDatesFallback = (text) => {
  const lower = text.toLowerCase();
  const now = new Date();

  const dayMap = {
    sunday: 0, itwar: 0,
    monday: 1, peer: 1, pir: 1,
    tuesday: 2, mangal: 2,
    wednesday: 3, budh: 3,
    thursday: 4, jumerat: 4,
    friday: 5, jumma: 5,
    saturday: 6, hafta: 6
  };

  let leaveCode = 'CASUAL';
  if (lower.includes('sick') || lower.includes('fever') || lower.includes('doctor') || lower.includes('medical') || lower.includes('bimar') || lower.includes('tabiyat')) {
    leaveCode = 'SICK';
  } else if (lower.includes('annual') || lower.includes('vacation') || lower.includes('trip') || lower.includes('holiday')) {
    leaveCode = 'ANNUAL';
  } else if (lower.includes('unpaid')) {
    leaveCode = 'UNPAID';
  }

  // Check explicit YYYY-MM-DD dates in text
  const isoMatches = text.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoMatches && isoMatches.length >= 1) {
    return {
      leaveTypeCode: leaveCode,
      startDate: isoMatches[0],
      endDate: isoMatches[1] || isoMatches[0]
    };
  }

  // Check "tomorrow" / "kal"
  if (lower.includes('tomorrow') || lower.includes('kal ')) {
    const tmrw = new Date(now);
    tmrw.setDate(now.getDate() + 1);
    const dStr = formatDate(tmrw);
    return { leaveTypeCode: leaveCode, startDate: dStr, endDate: dStr };
  }

  // Check weekday names mentioned in order
  const matchedWeekdays = [];
  for (const [word, dayIdx] of Object.entries(dayMap)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) {
      matchedWeekdays.push(dayIdx);
    }
  }

  if (matchedWeekdays.length > 0) {
    const firstTarget = matchedWeekdays[0];
    const startObj = new Date(now);
    let daysUntilStart = (firstTarget - startObj.getDay() + 7) % 7;
    if (daysUntilStart === 0) daysUntilStart = 7; // next occurrence
    startObj.setDate(startObj.getDate() + daysUntilStart);

    const endObj = new Date(startObj);
    if (matchedWeekdays.length > 1) {
      const lastTarget = matchedWeekdays[matchedWeekdays.length - 1];
      const span = (lastTarget - firstTarget + 7) % 7;
      endObj.setDate(startObj.getDate() + span);
    }

    return {
      leaveTypeCode: leaveCode,
      startDate: formatDate(startObj),
      endDate: formatDate(endObj)
    };
  }

  // Default: next working Monday
  const nextMon = new Date(now);
  const diffToMon = (1 - nextMon.getDay() + 7) % 7 || 7;
  nextMon.setDate(now.getDate() + diffToMon);
  const monStr = formatDate(nextMon);
  return {
    leaveTypeCode: leaveCode,
    startDate: monStr,
    endDate: monStr
  };
};

// ==================== SMART LEAVE ====================
const parseSmartLeave = async (text, user) => {
  const todayStr = getCurrentDateString();
  const fallbackDates = parseNaturalDatesFallback(text);

  const prompt = `Today is ${todayStr} (${new Date().toLocaleDateString('en-US', { weekday: 'long' })}). A user says: "${text}".
Extract the leave request details and return ONLY valid JSON in this exact format:
{
  "leaveTypeCode": "CASUAL" | "SICK" | "ANNUAL" | "UNPAID",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "reason": "clean concise reason"
}`;

  let parsed = null;

  // Try up to 2 times (1 retry on invalid JSON as required by Section 4 Guardrails)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await chatAssistant(prompt, user, 'SMART_LEAVE');
      const match = res.response.match(/\{[\s\S]*\}/);
      if (match) {
        const candidate = JSON.parse(match[0]);
        if (candidate.startDate && /^\d{4}-\d{2}-\d{2}$/.test(candidate.startDate)) {
          parsed = candidate;
          break;
        }
      }
    } catch (err) {
      // retry once
    }
  }

  const finalCode = (parsed?.leaveTypeCode || fallbackDates.leaveTypeCode || 'CASUAL').toUpperCase();
  const finalStart = parsed?.startDate || fallbackDates.startDate;
  const finalEnd = parsed?.endDate || fallbackDates.endDate;
  const finalReason = parsed?.reason || text.trim();

  const lt = (await LeaveType.findOne({ code: finalCode })) || (await LeaveType.findOne({ code: 'CASUAL' })) || (await LeaveType.findOne());

  return {
    // Standard Section 4 brief keys: { type, start, end, reason }
    type: lt?.code || finalCode,
    leaveType: lt?.code || finalCode,
    start: finalStart,
    end: finalEnd,
    reason: finalReason,
    // Extended keys for direct form binding
    leaveTypeId: lt?._id || null,
    leaveTypeCode: lt?.code || finalCode,
    leaveTypeName: lt?.name || 'Casual Leave',
    startDate: finalStart,
    endDate: finalEnd,
    fromDate: finalStart,
    toDate: finalEnd,
    isAiGenerated: true,
    label: 'AI-generated'
  };
};

module.exports = {
  chatAssistant,
  generateDashboardSummary,
  parseSmartLeave
};
