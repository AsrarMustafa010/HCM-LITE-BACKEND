const LeaveRequest = require('../models/LeaveRequest.model');
const LeaveType = require('../models/LeaveType.model');
const Holiday = require('../models/Holiday.model');
const CompanySettings = require('../models/CompanySettings.model');
const Employee = require('../models/Employee.model');
const Attendance = require('../models/Attendance.model');
const { getWorkingDays } = require('../utils/date.util');
const { logAudit } = require('../utils/audit.util');
const { createNotification } = require('../utils/notify.util');
const { sendLeaveDecisionEmail } = require('../utils/email.util');

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

// Calculate leave balances for an employee in current year
const getLeaveBalances = async (employeeId) => {
  const currentYear = new Date().getFullYear();
  const yearStartStr = `${currentYear}-01-01`;
  const yearEndStr = `${currentYear}-12-31`;

  const leaveTypes = await LeaveType.find({ isActive: true });
  const approvedLeaves = await LeaveRequest.find({
    employeeId,
    status: 'APPROVED',
    startDate: { $gte: yearStartStr },
    endDate: { $lte: yearEndStr }
  });

  const pendingLeaves = await LeaveRequest.find({
    employeeId,
    status: 'PENDING',
    startDate: { $gte: yearStartStr },
    endDate: { $lte: yearEndStr }
  });

  return leaveTypes.map(lt => {
    const usedDays = approvedLeaves
      .filter(l => String(l.leaveTypeId) === String(lt._id))
      .reduce((sum, l) => sum + (l.workingDays || 0), 0);

    const pendingDays = pendingLeaves
      .filter(l => String(l.leaveTypeId) === String(lt._id))
      .reduce((sum, l) => sum + (l.workingDays || 0), 0);

    return {
      leaveTypeId: lt._id,
      name: lt.name,
      code: lt.code,
      yearlyQuota: lt.yearlyQuota,
      usedDays,
      pendingDays,
      remainingBalance: lt.isUnlimited ? 9999 : Math.max(0, lt.yearlyQuota - usedDays),
      availableToApply: lt.isUnlimited ? 9999 : Math.max(0, lt.yearlyQuota - usedDays - pendingDays),
      isUnlimited: lt.isUnlimited,
      isPaid: lt.isPaid
    };
  });
};

// Apply for leave (accepts leaveTypeId OR leaveTypeCode / type)
const applyLeave = async ({ employeeId, leaveTypeId, leaveTypeCode, type, startDate, start, endDate, end, reason, createdViaSmartLeave = false }, req = null) => {
  const finalStartDate = (startDate || start || '').trim();
  const finalEndDate = (endDate || end || '').trim();
  const typeIdentifier = leaveTypeId || leaveTypeCode || type;

  if (!employeeId || !typeIdentifier || !finalStartDate || !finalEndDate || !reason) {
    const error = new Error('Employee ID, leave type, start date, end date, and reason are required.');
    error.statusCode = 400;
    throw error;
  }

  if (finalStartDate > finalEndDate) {
    const error = new Error('Start date cannot be after end date.');
    error.statusCode = 422;
    throw error;
  }

  // Resolve LeaveType by ObjectId or code/name
  let leaveType = null;
  if (/^[0-9a-fA-F]{24}$/.test(String(typeIdentifier))) {
    leaveType = await LeaveType.findById(typeIdentifier);
  }
  if (!leaveType) {
    const cleanCode = String(typeIdentifier).toUpperCase().replace(/\s*LEAVE\s*/i, '').trim();
    leaveType = await LeaveType.findOne({
      $or: [
        { code: cleanCode },
        { name: new RegExp(`^${String(typeIdentifier).trim()}`, 'i') }
      ]
    });
  }

  if (!leaveType || !leaveType.isActive) {
    const error = new Error('Selected leave type is invalid or inactive.');
    error.statusCode = 400;
    throw error;
  }

  const settings = await getSettings();
  const holidays = (await Holiday.find()).map(h => h.date);

  // 1. Calculate working days (skipping weekends & holidays)
  const { count: workingDaysCount } = getWorkingDays(
    finalStartDate,
    finalEndDate,
    settings.weekendDays,
    holidays
  );

  if (workingDaysCount === 0) {
    const error = new Error('Selected dates contain 0 working days (all selected dates fall on weekends or public holidays).');
    error.statusCode = 422; // 422 Unprocessable Entity
    throw error;
  }

  // 2. Check for overlapping pending or approved leave requests (Section 3 M5 Rule -> 422)
  const overlapping = await LeaveRequest.findOne({
    employeeId,
    status: { $in: ['PENDING', 'APPROVED'] },
    startDate: { $lte: finalEndDate },
    endDate: { $gte: finalStartDate }
  });

  if (overlapping) {
    const error = new Error(`Leave request overlaps with an existing ${overlapping.status.toLowerCase()} leave (${overlapping.startDate} to ${overlapping.endDate}).`);
    error.statusCode = 422; // 422 Unprocessable Entity
    throw error;
  }

  // 3. Check Quota Balance (Section 3 M5 Rule -> 422 on over-balance)
  if (!leaveType.isUnlimited) {
    const balances = await getLeaveBalances(employeeId);
    const balanceInfo = balances.find(b => String(b.leaveTypeId) === String(leaveType._id));
    const available = balanceInfo ? balanceInfo.availableToApply : 0;

    if (workingDaysCount > available) {
      const error = new Error(`Insufficient leave balance for ${leaveType.name}. Requested: ${workingDaysCount} working day(s), Available: ${available} day(s).`);
      error.statusCode = 422; // 422 Unprocessable Entity
      throw error;
    }
  }

  // 4. Create Leave Request
  const leaveRequest = await LeaveRequest.create({
    employeeId,
    leaveTypeId: leaveType._id,
    leaveTypeCode: leaveType.code,
    startDate: finalStartDate,
    endDate: finalEndDate,
    workingDays: workingDaysCount,
    reason: reason.trim(),
    status: 'PENDING',
    createdViaSmartLeave: Boolean(createdViaSmartLeave)
  });

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'LEAVE_APPLIED',
    entity: 'LeaveRequest',
    entityId: leaveRequest._id,
    after: { leaveType: leaveType.name, startDate: finalStartDate, endDate: finalEndDate, workingDays: workingDaysCount },
    req
  });

  const leaveObj = {
    ...leaveRequest.toObject(),
    daysCount: workingDaysCount
  };

  return {
    success: true,
    message: `Leave application submitted for ${workingDaysCount} working day(s).`,
    leaveRequest: leaveObj,
    data: leaveObj
  };
};

// Get Leave Requests with filters
const getLeaves = async (query = {}, userRole, requestingEmployeeId) => {
  const filter = {};
  if (userRole === 'EMPLOYEE') {
    filter.employeeId = requestingEmployeeId;
  } else if (query.employeeId) {
    filter.employeeId = query.employeeId;
  }

  if (query.status) filter.status = query.status;
  if (query.leaveTypeId) filter.leaveTypeId = query.leaveTypeId;

  return await LeaveRequest.find(filter)
    .populate('employeeId', 'employeeCode fullName email departmentId')
    .populate('leaveTypeId', 'name code isPaid')
    .populate('reviewedBy', 'name role')
    .sort({ createdAt: -1 });
};

// Cancel own pending leave
const cancelLeave = async (id, requestingEmployeeId, req = null) => {
  const leave = await LeaveRequest.findById(id);
  if (!leave) {
    const error = new Error('Leave request not found');
    error.statusCode = 404;
    throw error;
  }

  if (String(leave.employeeId) !== String(requestingEmployeeId) && req?.user?.role !== 'ADMIN') {
    const error = new Error('Forbidden: You can only cancel your own leave requests.');
    error.statusCode = 403;
    throw error;
  }

  if (leave.status !== 'PENDING') {
    const error = new Error(`Cannot cancel a leave request that is already ${leave.status}.`);
    error.statusCode = 400;
    throw error;
  }

  leave.status = 'CANCELLED';
  await leave.save();

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'LEAVE_CANCELLED',
    entity: 'LeaveRequest',
    entityId: leave._id,
    req
  });

  return {
    success: true,
    message: 'Leave request cancelled successfully.',
    leave
  };
};

// Review Leave Request (HR only)
const reviewLeave = async (id, { status, comment, reviewerComment }, reviewerUserId, req = null) => {
  const finalComment = comment || reviewerComment || '';
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    const error = new Error('Status must be APPROVED or REJECTED');
    error.statusCode = 400;
    throw error;
  }

  const leave = await LeaveRequest.findById(id)
    .populate('employeeId')
    .populate('leaveTypeId');

  if (!leave) {
    const error = new Error('Leave request not found');
    error.statusCode = 404;
    throw error;
  }

  if (leave.status !== 'PENDING') {
    const error = new Error(`This leave request has already been ${leave.status}.`);
    error.statusCode = 400;
    throw error;
  }

  // Re-verify balance before approving
  if (status === 'APPROVED' && leave.leaveTypeId && !leave.leaveTypeId.isUnlimited) {
    const balances = await getLeaveBalances(leave.employeeId._id);
    const balanceInfo = balances.find(b => String(b.leaveTypeId) === String(leave.leaveTypeId._id));
    if (balanceInfo && leave.workingDays > balanceInfo.remainingBalance) {
      const error = new Error(`Cannot approve: Insufficient remaining balance (${balanceInfo.remainingBalance} days left).`);
      error.statusCode = 422;
      throw error;
    }
  }

  const before = leave.toObject();
  leave.status = status;
  leave.reviewerComment = finalComment;
  leave.reviewedBy = reviewerUserId;
  leave.reviewedAt = new Date();
  await leave.save();

  // If approved, mark Attendance records for those working days as 'on_leave'
  if (status === 'APPROVED') {
    const settings = await getSettings();
    const holidays = (await Holiday.find()).map(h => h.date);
    const { dates: workingDates } = getWorkingDays(leave.startDate, leave.endDate, settings.weekendDays, holidays);

    for (const dStr of workingDates) {
      await Attendance.findOneAndUpdate(
        { employeeId: leave.employeeId._id, date: dStr },
        {
          employeeId: leave.employeeId._id,
          date: dStr,
          status: 'on_leave',
          source: 'manual_correction'
        },
        { upsert: true, new: true }
      );
    }
  }

  // Send in-app notification
  await createNotification({
    userId: leave.employeeId.userId,
    title: `Leave Request ${status}`,
    message: `Your ${leave.leaveTypeId.name} leave request (${leave.startDate} to ${leave.endDate}) has been ${status}. ${finalComment ? `HR Note: ${finalComment}` : ''}`,
    type: 'LEAVE_DECISION'
  });

  // Send email
  await sendLeaveDecisionEmail({
    to: leave.employeeId.email,
    name: leave.employeeId.fullName,
    leaveType: leave.leaveTypeId.name,
    startDate: leave.startDate,
    endDate: leave.endDate,
    status,
    comment: finalComment
  });

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: `LEAVE_${status}`,
    entity: 'LeaveRequest',
    entityId: leave._id,
    before,
    after: leave.toObject(),
    req
  });

  return leave;
};

module.exports = {
  getLeaveBalances,
  applyLeave,
  getLeaves,
  cancelLeave,
  reviewLeave
};
