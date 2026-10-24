const PDFDocument = require('pdfkit');
const PayrollRun = require('../models/PayrollRun.model');
const Payslip = require('../models/Payslip.model');
const Employee = require('../models/Employee.model');
const Attendance = require('../models/Attendance.model');
const LeaveRequest = require('../models/LeaveRequest.model');
const Holiday = require('../models/Holiday.model');
const CompanySettings = require('../models/CompanySettings.model');
const { getWorkingDaysInMonth, calculateEligibleWorkingDays, getCurrentDateString } = require('../utils/date.util');
const { calculateMonthlyTax } = require('../utils/tax.util');
const { logAudit } = require('../utils/audit.util');
const { createNotification } = require('../utils/notify.util');

const getSettings = async () => {
  let settings = await CompanySettings.findOne();
  if (!settings) {
    return new CompanySettings({
      companyName: 'HCM Lite',
      officeStartTime: '09:00',
      officeEndTime: '17:00',
      graceMinutes: 15,
      halfDayHoursThreshold: 5,
      weekendDays: [0, 6],
      officeLocation: { lat: 24.8607, lng: 67.0011, radiusMeters: 150, address: 'Zaitoon Ashraf IT Park' }
    });
  }
  return settings;
};

// Generate or recalculate monthly payroll draft (HR only)
const generatePayrollDraft = async (month, year, preparedByUserId, req = null) => {
  const m = Number(month);
  const y = Number(year);

  if (!m || !y || m < 1 || m > 12) {
    const error = new Error('Valid month (1-12) and year are required');
    error.statusCode = 400;
    throw error;
  }

  // Check if finalized payroll already exists (cannot modify finalized run)
  const existingFinalized = await PayrollRun.findOne({ month: m, year: y, status: 'FINALIZED' });
  if (existingFinalized) {
    const error = new Error(`Payroll for ${m}/${y} is already FINALIZED and locked. Edits are strictly forbidden.`);
    error.statusCode = 403;
    throw error;
  }

  const settings = await getSettings();
  const holidays = (await Holiday.find()).map(h => h.date);

  // 1. Get total working days in the month
  const { count: workingDaysInMonth, dates: allWorkingDates } = getWorkingDaysInMonth(
    y,
    m,
    settings.weekendDays,
    holidays
  );

  if (workingDaysInMonth === 0) {
    const error = new Error('No working days found in the specified month.');
    error.statusCode = 400;
    throw error;
  }

  // 2. Fetch all employees active at some point during the month
  const monthStartStr = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEndStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const employees = await Employee.find({
    joiningDate: { $lte: monthEndStr },
    $or: [
      { exitDate: null },
      { exitDate: { $gte: monthStartStr } }
    ]
  }).populate('departmentId', 'name code').populate('designationId', 'title');

  if (employees.length === 0) {
    const error = new Error('No eligible employees found for this payroll period.');
    error.statusCode = 404;
    throw error;
  }

  // 3. Upsert PayrollRun in DRAFT status
  let payrollRun = await PayrollRun.findOne({ month: m, year: y });
  if (!payrollRun) {
    payrollRun = new PayrollRun({
      month: m,
      year: y,
      workingDaysInMonth,
      status: 'DRAFT',
      preparedBy: preparedByUserId
    });
  } else {
    payrollRun.workingDaysInMonth = workingDaysInMonth;
    payrollRun.status = 'DRAFT';
    payrollRun.preparedBy = preparedByUserId;
    // Clear out existing draft payslips to recompute
    await Payslip.deleteMany({ payrollRunId: payrollRun._id });
  }

  const todayStr = getCurrentDateString();
  let totalGross = 0;
  let totalDeductions = 0;
  let totalTax = 0;
  let totalNetPay = 0;
  const payslips = [];

  for (const emp of employees) {
    // A. Prorate for joiners/leavers
    const { count: rawEligibleDays, dates: eligibleWorkingDates } = calculateEligibleWorkingDays(
      emp.joiningDate,
      emp.exitDate,
      y,
      m,
      settings.weekendDays,
      holidays
    );

    const eligibleDays = Math.max(1, rawEligibleDays);
    const fullGross = emp.salaryStructure.gross;
    const basic = emp.salaryStructure.basic;
    const hra = emp.salaryStructure.hra;
    const medical = emp.salaryStructure.medical;

    const perDayRate = Number((fullGross / workingDaysInMonth).toFixed(2));
    const proratedGross = Number((perDayRate * eligibleDays).toFixed(2));

    // B. Attendance records in the month (including weekend demo check-ins)
    const attendanceRecords = await Attendance.find({
      employeeId: emp._id,
      date: { $gte: monthStartStr, $lte: monthEndStr }
    });

    const attMap = {};
    attendanceRecords.forEach(a => { attMap[a.date] = a; });

    let presentDays = 0;
    let lateCount = 0;
    let halfDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let absentDays = 0;

    // Count actual attendance records recorded in the month
    attendanceRecords.forEach(att => {
      if (att.status === 'present') presentDays++;
      else if (att.status === 'late') { presentDays++; lateCount++; }
      else if (att.status === 'half_day') { halfDays++; if (att.isLate) lateCount++; }
      else if (att.status === 'missing_checkout') { presentDays++; if (att.isLate) lateCount++; }
    });

    // Approved leaves in this month
    const approvedLeaves = await LeaveRequest.find({
      employeeId: emp._id,
      status: 'APPROVED',
      startDate: { $lte: monthEndStr },
      endDate: { $gte: monthStartStr }
    });

    for (const dStr of eligibleWorkingDates) {
      const att = attMap[dStr];
      const matchingLeave = approvedLeaves.find(l => l.startDate <= dStr && l.endDate >= dStr);

      if (matchingLeave) {
        if (matchingLeave.leaveTypeCode === 'UNPAID') {
          unpaidLeaveDays++;
        } else {
          paidLeaveDays++;
        }
      } else if (!att && dStr < todayStr) {
        // Only completed past working days without attendance or approved leave count as absent
        absentDays++;
      }
    }

    // C. Bonus Late Penalty Rule: 3 lates = 0.5 day salary deduction
    let latePenaltyDays = 0;
    if (settings.latePenaltyRule && settings.latePenaltyRule.enabled) {
      const penaltyUnits = Math.floor(lateCount / (settings.latePenaltyRule.latesPerHalfDay || 3));
      latePenaltyDays = penaltyUnits * 0.5;
    }

    // D. Deductions & Net Pay
    const deductibleDays = absentDays + unpaidLeaveDays + (0.5 * halfDays) + latePenaltyDays;
    const attendanceDeduction = Math.round(deductibleDays * perDayRate);
    const incomeTax = calculateMonthlyTax(fullGross);
    const employeeTotalDeductions = attendanceDeduction + incomeTax;
    const netPay = Math.max(0, Math.round(proratedGross - employeeTotalDeductions));

    totalGross += proratedGross;
    totalDeductions += employeeTotalDeductions;
    totalTax += incomeTax;
    totalNetPay += netPay;

    payslips.push({
      payrollRunId: payrollRun._id,
      employeeId: emp._id,
      month: m,
      year: y,
      workingDaysInMonth,
      eligibleWorkingDays: eligibleDays,
      presentDays,
      lateCount,
      halfDays,
      paidLeaveDays,
      unpaidLeaveDays,
      absentDays,
      latePenaltyDays,
      basic,
      hra,
      medical,
      fullGross,
      proratedGross,
      perDayRate,
      attendanceDeduction,
      incomeTax,
      totalDeductions: employeeTotalDeductions,
      netPay,
      status: 'DRAFT'
    });
  }

  payrollRun.totalEmployees = employees.length;
  payrollRun.totalGross = Math.round(totalGross);
  payrollRun.totalDeductions = Math.round(totalDeductions);
  payrollRun.totalTax = Math.round(totalTax);
  payrollRun.totalNetPay = Math.round(totalNetPay);
  await payrollRun.save();

  await Payslip.insertMany(payslips);
  const createdPayslips = await Payslip.find({ payrollRunId: payrollRun._id })
    .populate({
      path: 'employeeId',
      select: 'employeeCode fullName email departmentId designationTitle',
      populate: { path: 'departmentId', select: 'name code' }
    });

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'PAYROLL_DRAFT_GENERATED',
    entity: 'PayrollRun',
    entityId: payrollRun._id,
    after: { month: m, year: y, totalEmployees: employees.length, totalNetPay },
    req
  });

  return {
    success: true,
    message: `Payroll draft generated for ${m}/${y} with ${employees.length} employees.`,
    payrollRun,
    payslips: createdPayslips,
    data: payrollRun
  };
};

// Finalize Payroll Run (Admin Only - Locks Month)
const finalizePayroll = async (payrollRunId, adminUserId, req = null) => {
  const payrollRun = await PayrollRun.findById(payrollRunId);
  if (!payrollRun) {
    const error = new Error('Payroll run not found');
    error.statusCode = 404;
    throw error;
  }

  if (payrollRun.status === 'FINALIZED') {
    const error = new Error('This payroll run is already finalized and locked.');
    error.statusCode = 400;
    throw error;
  }

  payrollRun.status = 'FINALIZED';
  payrollRun.finalizedBy = adminUserId;
  payrollRun.finalizedAt = new Date();
  await payrollRun.save();

  // Mark all payslips for this run as FINALIZED
  await Payslip.updateMany(
    { payrollRunId: payrollRun._id },
    { status: 'FINALIZED' }
  );

  // Notify all employees that payslips are ready
  const payslips = await Payslip.find({ payrollRunId: payrollRun._id }).populate('employeeId');
  for (const ps of payslips) {
    if (ps.employeeId && ps.employeeId.userId) {
      await createNotification({
        userId: ps.employeeId.userId,
        title: 'Payslip Ready',
        message: `Your payslip for ${payrollRun.month}/${payrollRun.year} has been finalized. Net Pay: PKR ${ps.netPay.toLocaleString()}`,
        type: 'PAYSLIP_READY',
        link: `/payroll/payslip/${ps._id}`
      });
    }
  }

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: 'ADMIN',
    action: 'PAYROLL_FINALIZED',
    entity: 'PayrollRun',
    entityId: payrollRun._id,
    after: { month: payrollRun.month, year: payrollRun.year, status: 'FINALIZED' },
    req
  });

  return {
    success: true,
    message: `Payroll for ${payrollRun.month}/${payrollRun.year} finalized and locked successfully.`,
    payrollRun,
    data: payrollRun
  };
};

// Get Single Payslip (Scoped)
const getPayslip = async (id, userRole, requestingEmployeeId) => {
  const payslip = await Payslip.findById(id)
    .populate('employeeId', 'employeeCode fullName email departmentId designationTitle')
    .populate('payrollRunId');

  if (!payslip) {
    const error = new Error('Payslip not found');
    error.statusCode = 404;
    throw error;
  }

  if (userRole === 'EMPLOYEE' && String(payslip.employeeId._id) !== String(requestingEmployeeId)) {
    const error = new Error('Forbidden: You can only view your own payslips.');
    error.statusCode = 403;
    throw error;
  }

  return payslip;
};

// Stream Payslip PDF
const streamPayslipPdf = async (id, userRole, requestingEmployeeId, res) => {
  const payslip = await getPayslip(id, userRole, requestingEmployeeId);
  const employee = payslip.employeeId;
  const settings = await getSettings();

  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="payslip-${employee.employeeCode}-${payslip.month}-${payslip.year}.pdf"`
  );

  doc.pipe(res);

  // Header
  doc.fontSize(20).text(settings.companyName, { align: 'center', bold: true });
  doc.fontSize(12).fillColor('#64748b').text('Monthly Salary Payslip', { align: 'center' });
  doc.text(`Period: ${payslip.month}/${payslip.year}`, { align: 'center' });
  doc.moveDown(1.5);

  // Divider
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(1);

  // Employee Information
  doc.fontSize(11).fillColor('#1e293b');
  doc.text(`Employee Code: ${employee.employeeCode}`, 40, doc.y);
  doc.text(`Employee Name: ${employee.fullName}`, 300, doc.y);
  doc.moveDown(0.5);
  doc.text(`Designation: ${employee.designationTitle}`, 40, doc.y);
  doc.text(`Status: ${payslip.status}`, 300, doc.y);
  doc.moveDown(1.5);

  // Working & Attendance Summary
  doc.fontSize(12).fillColor('#0f766e').text('Attendance Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#334155');
  doc.text(`Working Days in Month: ${payslip.workingDaysInMonth} | Eligible Days: ${payslip.eligibleWorkingDays}`);
  doc.text(`Present Days: ${payslip.presentDays} | Half Days: ${payslip.halfDays} | Late Arrivals: ${payslip.lateCount}`);
  doc.text(`Paid Leaves: ${payslip.paidLeaveDays} | Unpaid Leaves: ${payslip.unpaidLeaveDays} | Absent Days: ${payslip.absentDays}`);
  if (payslip.latePenaltyDays > 0) {
    doc.text(`Late Penalty Deduction: ${payslip.latePenaltyDays} day(s) (3 lates = 0.5 day deduction rule)`);
  }
  doc.moveDown(1.5);

  // Earnings & Deductions Tables
  doc.fontSize(12).fillColor('#0f766e').text('Salary Breakdown', { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(10).fillColor('#1e293b');
  doc.text('Earnings', 40, doc.y, { bold: true });
  doc.text('Amount (PKR)', 200, doc.y, { bold: true });
  doc.text('Deductions', 320, doc.y, { bold: true });
  doc.text('Amount (PKR)', 480, doc.y, { bold: true });
  doc.moveDown(0.5);

  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.5);

  const startTableY = doc.y;
  // Left: Earnings
  doc.text('Basic Salary:', 40, startTableY);
  doc.text(payslip.basic.toLocaleString(), 200, startTableY);

  doc.text('HRA (40%):', 40, startTableY + 18);
  doc.text(payslip.hra.toLocaleString(), 200, startTableY + 18);

  doc.text('Medical (10%):', 40, startTableY + 36);
  doc.text(payslip.medical.toLocaleString(), 200, startTableY + 36);

  doc.text('Prorated Gross:', 40, startTableY + 54, { bold: true });
  doc.text(payslip.proratedGross.toLocaleString(), 200, startTableY + 54, { bold: true });

  // Right: Deductions
  doc.text('Attendance/Unpaid Leave:', 320, startTableY);
  doc.text(payslip.attendanceDeduction.toLocaleString(), 480, startTableY);

  doc.text('Income Tax:', 320, startTableY + 18);
  doc.text(payslip.incomeTax.toLocaleString(), 480, startTableY + 18);

  doc.text('Total Deductions:', 320, startTableY + 54, { bold: true });
  doc.text(payslip.totalDeductions.toLocaleString(), 480, startTableY + 54, { bold: true });

  doc.moveDown(4.5);

  // Net Pay Callout Box
  doc.rect(40, doc.y, 515, 45).fillAndStroke('#f0fdf4', '#86efac');
  doc.fontSize(14).fillColor('#15803d').text(
    `NET PAYABLE SALARY: PKR ${payslip.netPay.toLocaleString()}`,
    55,
    doc.y - 32,
    { bold: true }
  );

  doc.moveDown(3);
  doc.fontSize(9).fillColor('#94a3b8').text(
    'This is a computer-generated payslip from HCM Lite and does not require a physical signature.',
    { align: 'center' }
  );

  doc.end();
};

module.exports = {
  generatePayrollDraft,
  finalizePayroll,
  getPayslip,
  streamPayslipPdf
};
