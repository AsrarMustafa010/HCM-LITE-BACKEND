const Attendance = require('../models/Attendance.model');
const AttendanceCorrection = require('../models/AttendanceCorrection.model');
const Employee = require('../models/Employee.model');
const Holiday = require('../models/Holiday.model');
const CompanySettings = require('../models/CompanySettings.model');
const { getCurrentDateString, getCurrentTimeString, isWeekendOrHoliday } = require('../utils/date.util');
const { isPointWithinRadius, compareFaceDescriptors } = require('../utils/geo.util');
const { logAudit } = require('../utils/audit.util');
const { createNotification } = require('../utils/notify.util');
const { emitBroadcast } = require('../utils/socket.util');

// Get company settings helper (without prematurely saving to DB before setup)
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

// Format a Date object into HH:mm in Asia/Karachi
const getTimeHHMMInPKT = (dateObj) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(dateObj);
  const hour = (parts.find(p => p.type === 'hour')?.value || '00').replace('24', '00');
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
};

// Auto-reconcile past records that have checkIn but no checkOut into 'missing_checkout'
const reconcileMissingCheckouts = async (todayStr) => {
  await Attendance.updateMany(
    {
      date: { $lt: todayStr },
      checkIn: { $ne: null },
      checkOut: null,
      status: { $in: ['present', 'late'] }
    },
    {
      $set: { status: 'missing_checkout' }
    }
  );
};

// Check-in (Web or Camera+GPS)
const checkIn = async ({ employeeId, source = 'web', faceDetected, faceCount, lat, lng, accuracy, faceDescriptor }, req = null) => {
  const settings = await getSettings();
  const todayStr = getCurrentDateString(); // YYYY-MM-DD in PKT
  const now = new Date();

  // Rule: Check if employee already has an attendance record for today
  let record = await Attendance.findOne({ employeeId, date: todayStr });
  if (record && record.checkIn) {
    const error = new Error('Already checked in today. Only one check-in allowed per day.');
    error.statusCode = 409; // 409 Conflict required by Section 3 M4
    throw error;
  }

  const employee = await Employee.findById(employeeId);
  if (!employee) {
    const error = new Error('Employee record not found');
    error.statusCode = 404;
    throw error;
  }

  // Camera + GPS Geofencing Validation (Bonus Feature)
  let locationMeta = {
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null,
    accuracy: accuracy != null ? Number(accuracy) : null,
    distanceMeters: null,
    faceDetected: false,
    faceMatched: null
  };

  if (source === 'camera') {
    // 1. Face Detection Validation (exactly 1 face)
    const count = faceCount !== undefined ? Number(faceCount) : (faceDetected ? 1 : 0);
    if (!faceDetected || count !== 1) {
      const error = new Error('Camera check-in rejected: Exactly one face must be detected in the frame.');
      error.statusCode = 422;
      throw error;
    }
    locationMeta.faceDetected = true;

    // 2. GPS Accuracy Validation (<= 100m)
    if (lat == null || lng == null || accuracy == null || Number(accuracy) > 100) {
      const error = new Error(`Camera check-in rejected: GPS accuracy must be within 100 meters (reported: ${accuracy ?? 'unknown'}m).`);
      error.statusCode = 422;
      throw error;
    }

    // 3. Geofence Distance Validation (Haversine formula via geolib)
    const office = settings.officeLocation;
    const geoResult = isPointWithinRadius(office.lat, office.lng, Number(lat), Number(lng), office.radiusMeters);
    locationMeta.distanceMeters = geoResult.distanceMeters;

    if (!geoResult.isWithin) {
      const error = new Error(`Camera check-in rejected: Outside office area. Distance is ${geoResult.distanceMeters}m (Allowed radius: ${office.radiusMeters}m).`);
      error.statusCode = 422;
      throw error;
    }

    // 4. Optional Face Descriptor Match
    if (employee.faceDescriptor && employee.faceDescriptor.length === 128 && Array.isArray(faceDescriptor)) {
      const matchResult = compareFaceDescriptors(employee.faceDescriptor, faceDescriptor);
      locationMeta.faceMatched = matchResult.matched;
      if (!matchResult.matched) {
        const error = new Error('Camera check-in rejected: Face does not match enrolled employee face descriptor.');
        error.statusCode = 422;
        throw error;
      }
    }
  }

  // Attendance Status Rules: Late after officeStartTime + graceMinutes
  const currentTimeHHMM = getTimeHHMMInPKT(now);
  const [startHour, startMin] = settings.officeStartTime.split(':').map(Number);
  const totalGraceMinutes = startHour * 60 + startMin + settings.graceMinutes;

  const [currHour, currMin] = currentTimeHHMM.split(':').map(Number);
  const currentTotalMinutes = currHour * 60 + currMin;

  const isLate = currentTotalMinutes > totalGraceMinutes;
  const minutesLate = isLate ? currentTotalMinutes - (startHour * 60 + startMin) : 0;
  const status = isLate ? 'late' : 'present';

  if (!record) {
    record = await Attendance.create({
      employeeId,
      date: todayStr,
      checkIn: now,
      status,
      isLate,
      minutesLate,
      source,
      locationMeta
    });
  } else {
    record.checkIn = now;
    record.status = status;
    record.isLate = isLate;
    record.minutesLate = minutesLate;
    record.source = source;
    record.locationMeta = locationMeta;
    await record.save();
  }

  emitBroadcast('attendance_update', {
    employeeId,
    employeeName: employee.fullName,
    date: todayStr,
    status: record.status,
    checkIn: record.checkIn
  });

  return {
    success: true,
    message: isLate ? `Checked in late (${minutesLate} min after start)` : 'Checked in on time',
    attendance: record,
    data: record
  };
};

// Check-out
const checkOut = async (employeeId, req = null) => {
  const settings = await getSettings();
  const todayStr = getCurrentDateString();
  const now = new Date();

  const record = await Attendance.findOne({ employeeId, date: todayStr });
  if (!record || !record.checkIn) {
    const error = new Error('Cannot check out without a check-in record for today.');
    error.statusCode = 400;
    throw error;
  }

  if (record.checkOut) {
    const error = new Error('Already checked out today.');
    error.statusCode = 409;
    throw error;
  }

  record.checkOut = now;
  const diffMs = Math.max(0, record.checkOut.getTime() - record.checkIn.getTime());
  const workedHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
  record.workedHours = workedHours;

  // Rule: half_day under 5 hours threshold
  if (workedHours < settings.halfDayHoursThreshold) {
    record.status = 'half_day';
  } else if (record.isLate) {
    record.status = 'late';
  } else {
    record.status = 'present';
  }

  await record.save();

  emitBroadcast('attendance_update', {
    employeeId,
    date: todayStr,
    status: record.status,
    checkOut: record.checkOut,
    workedHours
  });

  return {
    success: true,
    message: record.status === 'half_day'
      ? `Checked out. Worked ${workedHours} hours (Marked as Half Day under ${settings.halfDayHoursThreshold}h)`
      : `Checked out successfully. Worked ${workedHours} hours.`,
    attendance: record,
    data: record
  };
};

// Daily Attendance Board (for Admin & HR)
const getDailyBoard = async (dateStr = null) => {
  const todayStr = getCurrentDateString();
  const targetDate = dateStr || todayStr;
  await reconcileMissingCheckouts(todayStr);

  const settings = await getSettings();
  const holidays = (await Holiday.find()).map(h => h.date);

  const employees = await Employee.find({ employmentStatus: { $in: ['ACTIVE', 'PROBATION'] } })
    .populate('departmentId', 'name code')
    .sort({ fullName: 1 });

  const records = await Attendance.find({ date: targetDate });
  const recordMap = {};
  records.forEach(r => {
    recordMap[String(r.employeeId)] = r;
  });

  const isOffDay = isWeekendOrHoliday(targetDate, settings.weekendDays, holidays);

  const board = employees.map(emp => {
    const att = recordMap[String(emp._id)];
    let displayStatus = 'absent';

    if (att) {
      displayStatus = att.status;
    } else if (isOffDay) {
      displayStatus = 'holiday_weekend';
    }

    return {
      employeeId: emp._id,
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      department: emp.departmentId?.name || 'General',
      status: displayStatus,
      checkIn: att?.checkIn || null,
      checkOut: att?.checkOut || null,
      workedHours: att?.workedHours || 0,
      isLate: att?.isLate || false,
      minutesLate: att?.minutesLate || 0,
      source: att?.source || 'none'
    };
  });

  const summary = {
    date: targetDate,
    totalEmployees: employees.length,
    present: board.filter(b => b.status === 'present').length,
    late: board.filter(b => b.status === 'late').length,
    halfDay: board.filter(b => b.status === 'half_day').length,
    missingCheckout: board.filter(b => b.status === 'missing_checkout').length,
    onLeave: board.filter(b => b.status === 'on_leave').length,
    absent: board.filter(b => b.status === 'absent').length
  };

  return {
    date: targetDate,
    summary,
    board
  };
};

// Employee Monthly Attendance Calendar
const getMyCalendar = async (employeeId, month, year) => {
  const todayStr = getCurrentDateString();
  await reconcileMissingCheckouts(todayStr);

  const current = new Date();
  const targetMonth = month ? Number(month) : current.getMonth() + 1;
  const targetYear = year ? Number(year) : current.getFullYear();

  const employee = await Employee.findById(employeeId);
  const joiningDateStr = employee?.joiningDate || '2000-01-01';

  const settings = await getSettings();
  const holidays = await Holiday.find();
  const holidayMap = {};
  holidays.forEach(h => { holidayMap[h.date] = h.name; });

  const startOfMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const endOfMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const attendanceList = await Attendance.find({
    employeeId,
    date: { $gte: startOfMonthStr, $lte: endOfMonthStr }
  });

  const attMap = {};
  attendanceList.forEach(a => { attMap[a.date] = a; });

  const days = [];
  for (let d = 1; d <= lastDay; d++) {
    const dStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(targetYear, targetMonth - 1, d);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = settings.weekendDays.includes(dayOfWeek);
    const holidayName = holidayMap[dStr] || null;

    const att = attMap[dStr];
    let dayStatus = 'upcoming';
    if (att) {
      dayStatus = att.status;
    } else if (isWeekend) {
      dayStatus = 'weekend';
    } else if (holidayName) {
      dayStatus = 'holiday';
    } else if (dStr < todayStr && dStr >= joiningDateStr) {
      dayStatus = 'absent';
    }

    days.push({
      date: dStr,
      dayOfWeek,
      isWeekend,
      holidayName,
      status: dayStatus,
      checkIn: att?.checkIn || null,
      checkOut: att?.checkOut || null,
      workedHours: att?.workedHours || 0,
      isLate: att?.isLate || false,
      minutesLate: att?.minutesLate || 0
    });
  }

  return {
    month: targetMonth,
    year: targetYear,
    days
  };
};

// Attendance Correction Request
const parseDateOrHHMM = (dateStr, val) => {
  if (!val) return null;
  if (typeof val === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(val.trim())) {
    const [hh, mm] = val.trim().split(':');
    return new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:00`);
  }
  return new Date(val);
};

const requestCorrection = async ({ employeeId, date, requestedCheckIn, requestedCheckOut, reason }, req = null) => {
  if (!date || !requestedCheckIn || !requestedCheckOut || !reason) {
    const error = new Error('Date, requested check-in, requested check-out, and reason are required.');
    error.statusCode = 400;
    throw error;
  }

  const existingAtt = await Attendance.findOne({ employeeId, date });

  const correction = await AttendanceCorrection.create({
    employeeId,
    attendanceId: existingAtt ? existingAtt._id : null,
    date,
    requestedCheckIn: parseDateOrHHMM(date, requestedCheckIn),
    requestedCheckOut: parseDateOrHHMM(date, requestedCheckOut),
    reason: reason.trim(),
    status: 'PENDING'
  });

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'ATTENDANCE_CORRECTION_REQUESTED',
    entity: 'AttendanceCorrection',
    entityId: correction._id,
    req
  });

  return correction;
};

// List Attendance Corrections
const getCorrections = async (query = {}, userRole, requestingEmployeeId) => {
  const filter = {};
  if (userRole === 'EMPLOYEE') {
    filter.employeeId = requestingEmployeeId;
  } else if (query.employeeId) {
    filter.employeeId = query.employeeId;
  }

  if (query.status) {
    filter.status = query.status;
  }

  return await AttendanceCorrection.find(filter)
    .populate('employeeId', 'employeeCode fullName email departmentId')
    .populate('reviewedBy', 'name role')
    .sort({ createdAt: -1 });
};

// Review Attendance Correction (HR only)
const reviewCorrection = async (id, { status, reviewerComment, comment }, reviewerUserId, req = null) => {
  const finalComment = reviewerComment || comment || '';
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    const error = new Error('Status must be APPROVED or REJECTED');
    error.statusCode = 400;
    throw error;
  }

  const correction = await AttendanceCorrection.findById(id).populate('employeeId');
  if (!correction) {
    const error = new Error('Correction request not found');
    error.statusCode = 404;
    throw error;
  }

  if (correction.status !== 'PENDING') {
    const error = new Error(`This correction request has already been ${correction.status}.`);
    error.statusCode = 400;
    throw error;
  }

  const before = correction.toObject();
  correction.status = status;
  correction.reviewerComment = finalComment;
  correction.reviewedBy = reviewerUserId;
  correction.reviewedAt = new Date();
  await correction.save();

  if (status === 'APPROVED') {
    const settings = await getSettings();
    const checkIn = new Date(correction.requestedCheckIn);
    const checkOut = new Date(correction.requestedCheckOut);
    const workedHours = Number((Math.max(0, checkOut - checkIn) / (1000 * 60 * 60)).toFixed(2));

    // Calculate if requestedCheckIn was late according to company settings
    const checkInHHMM = getTimeHHMMInPKT(checkIn);
    const [startHour, startMin] = settings.officeStartTime.split(':').map(Number);
    const totalGraceMinutes = startHour * 60 + startMin + settings.graceMinutes;
    const [inHour, inMin] = checkInHHMM.split(':').map(Number);
    const inTotalMinutes = inHour * 60 + inMin;

    const isLate = inTotalMinutes > totalGraceMinutes;
    const minutesLate = isLate ? inTotalMinutes - (startHour * 60 + startMin) : 0;

    let finalStatus = 'present';
    if (workedHours < settings.halfDayHoursThreshold) {
      finalStatus = 'half_day';
    } else if (isLate) {
      finalStatus = 'late';
    }

    await Attendance.findOneAndUpdate(
      { employeeId: correction.employeeId._id, date: correction.date },
      {
        employeeId: correction.employeeId._id,
        date: correction.date,
        checkIn,
        checkOut,
        workedHours,
        status: finalStatus,
        source: 'manual_correction',
        isLate,
        minutesLate
      },
      { upsert: true, new: true }
    );
  }

  // In-app Notification for employee
  await createNotification({
    userId: correction.employeeId.userId,
    title: `Attendance Correction ${status}`,
    message: `Your attendance correction for ${correction.date} has been ${status}. ${finalComment ? `Note: ${finalComment}` : ''}`,
    type: 'CORRECTION_DECISION'
  });

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: `ATTENDANCE_CORRECTION_${status}`,
    entity: 'AttendanceCorrection',
    entityId: correction._id,
    before,
    after: correction.toObject(),
    req
  });

  return correction;
};

module.exports = {
  checkIn,
  checkOut,
  getDailyBoard,
  getMyCalendar,
  requestCorrection,
  getCorrections,
  reviewCorrection,
  reconcileMissingCheckouts
};
