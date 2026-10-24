const bcrypt = require('bcryptjs');
const CompanySettings = require('../models/CompanySettings.model');
const User = require('../models/User.model');
const LeaveType = require('../models/LeaveType.model');
const Department = require('../models/Department.model');
const Designation = require('../models/Designation.model');
const Holiday = require('../models/Holiday.model');
const Employee = require('../models/Employee.model');
const Attendance = require('../models/Attendance.model');
const AttendanceCorrection = require('../models/AttendanceCorrection.model');
const LeaveRequest = require('../models/LeaveRequest.model');
const PayrollRun = require('../models/PayrollRun.model');
const Payslip = require('../models/Payslip.model');
const Announcement = require('../models/Announcement.model');
const Notification = require('../models/Notification.model');
const AuditLog = require('../models/AuditLog.model');
const AiLog = require('../models/AiLog.model');
const { generateToken } = require('./auth.service');
const { logAudit } = require('../utils/audit.util');

const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual Leave', code: 'ANNUAL', yearlyQuota: 14, isPaid: true, isUnlimited: false },
  { name: 'Sick Leave', code: 'SICK', yearlyQuota: 8, isPaid: true, isUnlimited: false },
  { name: 'Casual Leave', code: 'CASUAL', yearlyQuota: 10, isPaid: true, isUnlimited: false },
  { name: 'Unpaid Leave', code: 'UNPAID', yearlyQuota: 0, isPaid: false, isUnlimited: true }
];

// Check if first-run setup / Admin signup has already been completed in MongoDB
const getSetupStatus = async () => {
  const adminCount = await User.countDocuments({ role: 'ADMIN' });
  const settings = adminCount > 0 ? await CompanySettings.findOne() : null;
  return {
    isSetupComplete: adminCount > 0,
    companyName: settings ? settings.companyName : null,
    settings: settings || null
  };
};

// Seed default leave types when Admin creates the company
const seedDefaultLeaveTypes = async () => {
  for (const lt of DEFAULT_LEAVE_TYPES) {
    const existing = await LeaveType.findOne({ code: lt.code });
    if (!existing) {
      await LeaveType.create(lt);
    }
  }
};

// Admin Signup & Company Setup (Saves Admin + Company directly in MongoDB)
const initSetup = async (payload, req = null) => {
  const adminCount = await User.countDocuments({ role: 'ADMIN' });
  if (adminCount > 0) {
    const error = new Error('Company and Admin account are already registered. Please log in, or ask Admin to create your account.');
    error.statusCode = 403;
    throw error;
  }

  const companyName = (payload.companyName || payload.company || 'HCM Lite Company').trim();
  const adminEmail = (payload.adminEmail || payload.email || '').toLowerCase().trim();
  const adminPassword = payload.adminPassword || payload.password;
  const adminName = (payload.adminName || payload.name || payload.fullName || 'Company Admin').trim();

  const {
    officeStartTime = '09:00',
    officeEndTime = '17:00',
    graceMinutes = 15,
    halfDayHoursThreshold = 5,
    weekendDays = [0, 6],
    officeLocation = { lat: 24.8607, lng: 67.0011, radiusMeters: 150, address: 'Zaitoon Ashraf IT Park' },
    latePenaltyRule = { enabled: true, latesPerHalfDay: 3 }
  } = payload;

  if (!adminEmail || !adminPassword) {
    const error = new Error('Email and password are required to sign up.');
    error.statusCode = 400;
    throw error;
  }

  if (String(adminPassword).length < 6) {
    const error = new Error('Admin password must be at least 6 characters long.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Save CompanySettings in MongoDB
  let settings = await CompanySettings.findOne();
  if (!settings) {
    settings = await CompanySettings.create({
      companyName,
      officeStartTime,
      officeEndTime,
      graceMinutes: Number(graceMinutes),
      halfDayHoursThreshold: Number(halfDayHoursThreshold),
      weekendDays,
      officeLocation,
      latePenaltyRule,
      isInitialized: true
    });
  } else {
    settings.companyName = companyName;
    settings.officeStartTime = officeStartTime;
    settings.officeEndTime = officeEndTime;
    settings.graceMinutes = Number(graceMinutes);
    settings.halfDayHoursThreshold = Number(halfDayHoursThreshold);
    settings.weekendDays = weekendDays;
    settings.officeLocation = officeLocation;
    settings.latePenaltyRule = latePenaltyRule;
    settings.isInitialized = true;
    await settings.save();
  }

  // 2. Seed Default Leave Types in MongoDB
  await seedDefaultLeaveTypes();

  // 3. Create Admin User in MongoDB
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  const adminUser = await User.create({
    name: adminName,
    email: adminEmail,
    passwordHash,
    role: 'ADMIN',
    isActive: true,
    mustChangePassword: false
  });

  // 4. Issue JWT Token so Admin is immediately logged in
  const token = generateToken(adminUser);

  // 5. Log Audit in MongoDB
  await logAudit({
    actorId: adminUser._id,
    actorName: adminUser.name,
    actorRole: 'ADMIN',
    action: 'FIRST_RUN_SETUP',
    entity: 'CompanySettings',
    entityId: settings._id,
    after: { companyName: settings.companyName, adminEmail: adminUser.email },
    req
  });

  const userPayload = {
    id: adminUser._id,
    name: adminUser.name,
    email: adminUser.email,
    role: adminUser.role,
    mustChangePassword: false
  };

  return {
    success: true,
    message: 'Company and Admin account registered in database successfully.',
    companyName: settings.companyName,
    settings,
    token,
    user: userPayload,
    data: {
      companyName: settings.companyName,
      settings,
      token,
      user: userPayload
    }
  };
};

// Reset demo: Cleans all collections for fresh judging rehearsal
const resetDemo = async () => {
  await Promise.all([
    CompanySettings.deleteMany({}),
    User.deleteMany({}),
    Department.deleteMany({}),
    Designation.deleteMany({}),
    LeaveType.deleteMany({}),
    Holiday.deleteMany({}),
    Employee.deleteMany({}),
    Attendance.deleteMany({}),
    AttendanceCorrection.deleteMany({}),
    LeaveRequest.deleteMany({}),
    PayrollRun.deleteMany({}),
    Payslip.deleteMany({}),
    Announcement.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
    AiLog.deleteMany({})
  ]);

  return {
    success: true,
    message: 'System reset complete. All collections cleared for a clean live demo run.'
  };
};

module.exports = {
  getSetupStatus,
  initSetup,
  resetDemo
};
