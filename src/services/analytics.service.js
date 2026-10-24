const Employee = require('../models/Employee.model');
const Attendance = require('../models/Attendance.model');
const LeaveRequest = require('../models/LeaveRequest.model');
const LeaveType = require('../models/LeaveType.model');
const Department = require('../models/Department.model');
const PayrollRun = require('../models/PayrollRun.model');
const Payslip = require('../models/Payslip.model');
const AuditLog = require('../models/AuditLog.model');
const Announcement = require('../models/Announcement.model');
const AttendanceCorrection = require('../models/AttendanceCorrection.model');
const Holiday = require('../models/Holiday.model');
const CompanySettings = require('../models/CompanySettings.model');
const { getCurrentDateString, getWorkingDays } = require('../utils/date.util');

// ==================== ADMIN DASHBOARD ====================
const getAdminDashboard = async ({ startDate, endDate, departmentId } = {}) => {
  const currentYear = new Date().getFullYear();
  const start = startDate || `${currentYear}-01-01`;
  const end = endDate || getCurrentDateString();

  const filter = {};
  if (departmentId) filter.departmentId = departmentId;

  // 1. Headcount & Attrition (Section 7 Formula: Active + probation on end date / exits in period ÷ average headcount × 100)
  const activeEmployees = await Employee.find({
    ...filter,
    employmentStatus: { $in: ['ACTIVE', 'PROBATION'] },
    joiningDate: { $lte: end },
    $or: [{ exitDate: null }, { exitDate: { $gt: end } }]
  });

  const exitedEmployeesInPeriod = await Employee.find({
    ...filter,
    exitDate: { $gte: start, $lte: end }
  });

  const headcount = activeEmployees.length;
  const exitsCount = exitedEmployeesInPeriod.length;
  const avgHeadcount = Math.max(1, headcount + exitsCount / 2);
  const attritionRate = Number(((exitsCount / avgHeadcount) * 100).toFixed(2));

  // 2. Headcount & Payroll Cost by Department
  const departments = await Department.find();
  const deptMap = {};
  departments.forEach(d => {
    deptMap[String(d._id)] = {
      departmentId: d._id,
      name: d.name,
      code: d.code,
      count: 0,
      grossPayroll: 0,
      netPayroll: 0,
      payrollCost: 0,
      averageSalary: 0
    };
  });

  const desigSalaryMap = {};

  activeEmployees.forEach(e => {
    const dId = String(e.departmentId);
    const gross = e.salaryStructure?.gross || 0;
    if (deptMap[dId]) {
      deptMap[dId].count++;
      deptMap[dId].grossPayroll += gross;
    }

    const desigTitle = e.designationTitle || 'General';
    if (!desigSalaryMap[desigTitle]) {
      desigSalaryMap[desigTitle] = { designation: desigTitle, count: 0, totalGross: 0, averageSalary: 0 };
    }
    desigSalaryMap[desigTitle].count++;
    desigSalaryMap[desigTitle].totalGross += gross;
  });

  Object.values(desigSalaryMap).forEach(item => {
    item.averageSalary = item.count > 0 ? Math.round(item.totalGross / item.count) : 0;
  });

  // 3. Payroll Cost & Average Salary (from latest run or current active structures)
  const latestPayrollRun = await PayrollRun.findOne().sort({ year: -1, month: -1 });
  let totalPayrollCost = 0;
  let totalGrossPayroll = 0;
  let averageSalary = 0;

  if (latestPayrollRun) {
    totalPayrollCost = latestPayrollRun.totalNetPay;
    totalGrossPayroll = latestPayrollRun.totalGross;
    const payslips = await Payslip.find({ payrollRunId: latestPayrollRun._id }).populate('employeeId');

    payslips.forEach(ps => {
      if (ps.employeeId && ps.employeeId.departmentId) {
        const dId = String(ps.employeeId.departmentId);
        if (deptMap[dId]) {
          deptMap[dId].netPayroll += ps.netPay;
          deptMap[dId].payrollCost += ps.netPay;
        }
      }
    });

    averageSalary = headcount > 0 ? Math.round(latestPayrollRun.totalGross / headcount) : 0;
  } else {
    const grossSum = activeEmployees.reduce((sum, e) => sum + (e.salaryStructure?.gross || 0), 0);
    totalPayrollCost = grossSum;
    totalGrossPayroll = grossSum;
    averageSalary = headcount > 0 ? Math.round(grossSum / headcount) : 0;
    Object.values(deptMap).forEach(d => {
      d.netPayroll = d.grossPayroll;
      d.payrollCost = d.grossPayroll;
    });
  }

  Object.values(deptMap).forEach(d => {
    d.averageSalary = d.count > 0 ? Math.round(d.grossPayroll / d.count) : 0;
  });

  // 4. Gender & Tenure Breakdown
  const genderBreakdown = {
    Male: activeEmployees.filter(e => e.gender === 'Male').length,
    Female: activeEmployees.filter(e => e.gender === 'Female').length,
    Other: activeEmployees.filter(e => e.gender === 'Other').length
  };

  const now = new Date();
  const tenureBreakdown = {
    under1Year: 0,
    oneToThreeYears: 0,
    aboveThreeYears: 0
  };

  activeEmployees.forEach(e => {
    const joinYear = new Date(e.joiningDate).getFullYear();
    const diffYears = now.getFullYear() - joinYear;
    if (diffYears < 1) tenureBreakdown.under1Year++;
    else if (diffYears <= 3) tenureBreakdown.oneToThreeYears++;
    else tenureBreakdown.aboveThreeYears++;
  });

  // 5. Recent Audit Feed
  const recentAuditFeed = await AuditLog.find().sort({ createdAt: -1 }).limit(10);

  // 6. Bonus: Attrition Risk Score per Employee
  const currentMonth = now.getMonth() + 1;
  const recentAttendances = await Attendance.find({
    date: { $gte: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01` }
  });

  const lateCountsByEmp = {};
  recentAttendances.forEach(a => {
    if (a.isLate) {
      lateCountsByEmp[String(a.employeeId)] = (lateCountsByEmp[String(a.employeeId)] || 0) + 1;
    }
  });

  const attritionRiskScores = activeEmployees.slice(0, 10).map(e => {
    const lates = lateCountsByEmp[String(e._id)] || 0;
    let riskScore = 15;
    if (lates >= 3) riskScore += 35;
    else if (lates >= 1) riskScore += 15;
    if (e.employmentStatus === 'PROBATION') riskScore += 20;

    let riskLevel = 'Low';
    if (riskScore >= 50) riskLevel = 'High';
    else if (riskScore >= 30) riskLevel = 'Medium';

    return {
      employeeId: e._id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      department: deptMap[String(e.departmentId)]?.name || 'General',
      riskScore,
      riskLevel
    };
  });

  return {
    kpis: {
      headcount,
      attritionRateYTD: attritionRate,
      totalPayrollCost,
      totalGrossPayroll,
      averageSalary
    },
    headcountByDepartment: Object.values(deptMap),
    payrollCostByDepartment: Object.values(deptMap),
    averageSalaryByDesignation: Object.values(desigSalaryMap),
    genderBreakdown,
    tenureBreakdown,
    recentAuditFeed,
    attritionRiskScores
  };
};

// ==================== HR DASHBOARD ====================
const getHrDashboard = async ({ startDate, endDate, departmentId } = {}) => {
  const todayStr = getCurrentDateString();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const periodStart = startDate || `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const periodEnd = endDate || todayStr;

  const filter = {};
  if (departmentId) filter.departmentId = departmentId;

  const activeEmployees = await Employee.find({
    ...filter,
    employmentStatus: { $in: ['ACTIVE', 'PROBATION'] }
  }).populate('departmentId', 'name code');

  const totalEmployees = activeEmployees.length;
  const employeeIds = activeEmployees.map(e => e._id);

  // 1. Today's Attendance Metrics
  const todayAttendance = await Attendance.find({
    date: todayStr,
    employeeId: { $in: employeeIds }
  });

  const presentCount = todayAttendance.filter(a => ['present', 'late', 'half_day', 'missing_checkout'].includes(a.status)).length;
  const lateCount = todayAttendance.filter(a => a.isLate).length;
  const onLeaveFromAtt = todayAttendance.filter(a => a.status === 'on_leave').length;

  // Also check approved LeaveRequests covering today
  const approvedLeavesToday = await LeaveRequest.countDocuments({
    status: 'APPROVED',
    employeeId: { $in: employeeIds },
    startDate: { $lte: todayStr },
    endDate: { $gte: todayStr }
  });
  const onLeaveCount = Math.max(onLeaveFromAtt, approvedLeavesToday);

  // 2. Pending Approvals (Leaves + Attendance Corrections)
  const pendingLeavesCount = await LeaveRequest.countDocuments({
    status: 'PENDING',
    employeeId: { $in: employeeIds }
  });
  const pendingCorrectionsCount = await AttendanceCorrection.countDocuments({
    status: 'PENDING',
    employeeId: { $in: employeeIds }
  });

  // 3. Attendance Trend (Last 7 Days)
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dStr = d.toISOString().split('T')[0];

    const dayRecords = await Attendance.find({ date: dStr, employeeId: { $in: employeeIds } });
    const present = dayRecords.filter(a => ['present', 'late', 'half_day', 'missing_checkout'].includes(a.status)).length;
    const lates = dayRecords.filter(a => a.isLate).length;
    const onLeave = dayRecords.filter(a => a.status === 'on_leave').length;

    trend.push({
      date: dStr,
      present,
      late: lates,
      onLeave
    });
  }

  // 4. Section 7 Formulas: Attendance Rate & Late %
  // Attendance rate = (present + late + missing_checkout + 0.5 * half_day) / (working_day_records - on_leave)
  const periodAttendances = await Attendance.find({
    date: { $gte: periodStart, $lte: periodEnd },
    employeeId: { $in: employeeIds }
  });

  const settings = await CompanySettings.findOne();
  const weekendDays = settings ? settings.weekendDays : [0, 6];
  const holidays = (await Holiday.find()).map(h => h.date);
  const { count: workingDaysInPeriod } = getWorkingDays(periodStart, periodEnd, weekendDays, holidays);
  const expectedWorkingDaysTotal = Math.max(1, totalEmployees * Math.max(1, workingDaysInPeriod));

  const halfDaysToday = todayAttendance.filter(a => a.status === 'half_day').length;
  const fullPresentToday = todayAttendance.filter(a => ['present', 'late', 'missing_checkout'].includes(a.status)).length;
  const effectivePresentToday = fullPresentToday + 0.5 * halfDaysToday;
  const eligibleWorkingToday = Math.max(1, totalEmployees - onLeaveCount);
  const attendanceRate = totalEmployees > 0
    ? Number(Math.min(100, (effectivePresentToday / eligibleWorkingToday) * 100).toFixed(1))
    : 0;

  // Late % = late ÷ (present + late)
  const totalPresentAndLate = periodAttendances.filter(a => ['present', 'late', 'half_day', 'missing_checkout'].includes(a.status)).length;
  const totalLateInPeriod = periodAttendances.filter(a => a.isLate).length;
  const latePercentage = totalPresentAndLate > 0
    ? Number(((totalLateInPeriod / totalPresentAndLate) * 100).toFixed(1))
    : 0;

  // 5. Absenteeism by Department (Section 7 Formula: absent days ÷ expected working days, per department)
  const departments = await Department.find();
  const absenteeismByDepartment = departments.map(dept => {
    const deptEmployees = activeEmployees.filter(e => String(e.departmentId?._id || e.departmentId) === String(dept._id));
    const deptEmpIds = new Set(deptEmployees.map(e => String(e._id)));
    const deptExpectedDays = Math.max(1, deptEmployees.length * Math.max(1, workingDaysInPeriod));

    const deptAttRecords = periodAttendances.filter(a => deptEmpIds.has(String(a.employeeId)));
    const recordedOrLeaveDays = deptAttRecords.length;
    const absentDays = deptEmployees.length > 0 ? Math.max(0, deptExpectedDays - recordedOrLeaveDays) : 0;
    const absenteeismRate = deptEmployees.length > 0
      ? Number(((absentDays / deptExpectedDays) * 100).toFixed(1))
      : 0;

    return {
      departmentId: dept._id,
      departmentName: dept.name,
      headcount: deptEmployees.length,
      presentToday: todayAttendance.filter(a => deptEmpIds.has(String(a.employeeId)) && ['present', 'late', 'half_day'].includes(a.status)).length,
      absentDays,
      expectedWorkingDays: deptEmployees.length * Math.max(1, workingDaysInPeriod),
      absenteeismRate
    };
  });

  // 6. Leave Breakdown by Type & Leave Utilization (Approved days ÷ quota)
  const leaveTypes = await LeaveType.find({ isActive: true });
  const approvedLeaves = await LeaveRequest.find({
    status: 'APPROVED',
    employeeId: { $in: employeeIds },
    startDate: { $lte: periodEnd },
    endDate: { $gte: periodStart }
  }).populate('leaveTypeId');

  const leaveByTypeMap = {};
  approvedLeaves.forEach(l => {
    const typeName = l.leaveTypeId?.name || l.leaveTypeCode;
    leaveByTypeMap[typeName] = (leaveByTypeMap[typeName] || 0) + l.workingDays;
  });

  const leaveUtilization = leaveTypes.map(lt => {
    const approvedDays = approvedLeaves
      .filter(l => String(l.leaveTypeId?._id || l.leaveTypeId) === String(lt._id))
      .reduce((sum, l) => sum + (l.workingDays || 0), 0);
    const totalQuota = lt.isUnlimited ? 0 : lt.yearlyQuota * Math.max(1, totalEmployees);
    const utilizationRate = totalQuota > 0 ? Number(((approvedDays / totalQuota) * 100).toFixed(1)) : 0;

    return {
      leaveType: lt.name,
      code: lt.code,
      approvedDays,
      quotaPerEmployee: lt.yearlyQuota,
      totalDepartmentQuota: totalQuota,
      utilizationRate
    };
  });

  // 7. Top 5 Late-Comers
  const lateAttendances = await Attendance.find({
    date: { $gte: periodStart, $lte: periodEnd },
    isLate: true,
    employeeId: { $in: employeeIds }
  }).populate('employeeId', 'employeeCode fullName email departmentId');

  const lateCountsMap = {};
  lateAttendances.forEach(a => {
    if (a.employeeId) {
      const eId = String(a.employeeId._id);
      if (!lateCountsMap[eId]) {
        lateCountsMap[eId] = {
          employeeId: a.employeeId._id,
          employeeCode: a.employeeId.employeeCode,
          fullName: a.employeeId.fullName,
          lateCount: 0,
          totalMinutesLate: 0
        };
      }
      lateCountsMap[eId].lateCount++;
      lateCountsMap[eId].totalMinutesLate += a.minutesLate || 0;
    }
  });

  const top5LateComers = Object.values(lateCountsMap)
    .sort((a, b) => b.lateCount - a.lateCount)
    .slice(0, 5);

  // 8. Bonus: Absence Anomaly Flags
  const absenceAnomalyFlags = Object.values(lateCountsMap)
    .filter(e => e.lateCount >= 3)
    .map(e => ({
      employeeId: e.employeeId,
      employeeName: e.fullName,
      issue: `Repeated Late Arrivals (${e.lateCount} lates — triggers 0.5 day penalty)`
    }));

  return {
    kpis: {
      headcount: totalEmployees,
      presentToday: presentCount,
      onLeaveToday: onLeaveCount,
      lateToday: lateCount,
      attendanceRate,
      latePercentage,
      pendingApprovals: pendingLeavesCount + pendingCorrectionsCount
    },
    attendanceTrend: trend,
    absenteeismByDepartment,
    leaveByType: leaveByTypeMap,
    leaveUtilization,
    top5LateComers,
    absenceAnomalyFlags
  };
};

// ==================== EMPLOYEE DASHBOARD ====================
const getEmployeeDashboard = async (employeeId) => {
  const todayStr = getCurrentDateString();
  const now = new Date();

  // 1. Today's Check-in Record
  const todayRecord = await Attendance.findOne({ employeeId, date: todayStr });

  // 2. Hours this week vs 40h standard
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday
  startOfWeek.setDate(diff);
  const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

  const weekAttendances = await Attendance.find({
    employeeId,
    date: { $gte: startOfWeekStr, $lte: todayStr }
  });

  const hoursThisWeek = Number(
    weekAttendances.reduce((sum, a) => sum + (a.workedHours || 0), 0).toFixed(2)
  );

  // 3. Late count this month
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lateCountThisMonth = await Attendance.countDocuments({
    employeeId,
    date: { $gte: currentMonthStr },
    isLate: true
  });

  // 4. Leave Balances
  const leaveTypes = await LeaveType.find({ isActive: true });
  const approvedLeaves = await LeaveRequest.find({
    employeeId,
    status: 'APPROVED',
    startDate: { $gte: `${now.getFullYear()}-01-01` }
  });

  const leaveBalances = leaveTypes.map(lt => {
    const usedDays = approvedLeaves
      .filter(l => String(l.leaveTypeId) === String(lt._id))
      .reduce((sum, l) => sum + (l.workingDays || 0), 0);

    return {
      leaveTypeId: lt._id,
      name: lt.name,
      code: lt.code,
      yearlyQuota: lt.yearlyQuota,
      usedDays,
      remainingBalance: lt.isUnlimited ? 'Unlimited' : Math.max(0, lt.yearlyQuota - usedDays)
    };
  });

  // 5. Last Payslip
  const lastPayslip = await Payslip.findOne({ employeeId, status: 'FINALIZED' })
    .sort({ year: -1, month: -1 });

  // 6. Recent Announcements
  const announcements = await Announcement.find({ targetRoles: { $in: ['EMPLOYEE'] } })
    .sort({ createdAt: -1 })
    .limit(5);

  return {
    todayStatus: {
      date: todayStr,
      isCheckedIn: !!todayRecord?.checkIn,
      isCheckedOut: !!todayRecord?.checkOut,
      checkInTime: todayRecord?.checkIn || null,
      checkOutTime: todayRecord?.checkOut || null,
      workedHours: todayRecord?.workedHours || 0,
      status: todayRecord?.status || 'no_checkin'
    },
    weeklyHours: {
      worked: hoursThisWeek,
      target: 40,
      percentage: Math.min(100, Math.round((hoursThisWeek / 40) * 100))
    },
    lateCountThisMonth,
    leaveBalances,
    lastPayslip: lastPayslip
      ? {
          month: lastPayslip.month,
          year: lastPayslip.year,
          netPay: lastPayslip.netPay,
          grossPay: lastPayslip.proratedGross,
          id: lastPayslip._id
        }
      : null,
    recentAnnouncements: announcements
  };
};

module.exports = {
  getAdminDashboard,
  getHrDashboard,
  getEmployeeDashboard
};
