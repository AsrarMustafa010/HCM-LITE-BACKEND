const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const CompanySettings = require('../models/CompanySettings.model');
const Department = require('../models/Department.model');
const Designation = require('../models/Designation.model');
const LeaveType = require('../models/LeaveType.model');
const Holiday = require('../models/Holiday.model');
const User = require('../models/User.model');
const Employee = require('../models/Employee.model');
const { logAudit } = require('../utils/audit.util');
const { sendWelcomeEmail } = require('../utils/email.util');
const { getCurrentDateString } = require('../utils/date.util');

const generateStrongTempPassword = () => {
  return `Hcm@${crypto.randomBytes(4).toString('hex')}1!`;
};

// ==================== COMPANY SETTINGS ====================
const getSettings = async () => {
  let settings = await CompanySettings.findOne();
  if (!settings) {
    return new CompanySettings({
      companyName: 'Unconfigured Company',
      officeStartTime: '09:00',
      officeEndTime: '17:00',
      graceMinutes: 15,
      halfDayHoursThreshold: 5,
      weekendDays: [0, 6],
      officeLocation: { lat: 24.8607, lng: 67.0011, radiusMeters: 150, address: 'Zaitoon Ashraf IT Park' },
      isInitialized: false
    });
  }
  return settings;
};

const updateSettings = async (updateData, req = null) => {
  let current = await CompanySettings.findOne();
  const before = current ? current.toObject() : null;

  if (!current) {
    current = new CompanySettings({
      companyName: updateData.companyName || 'HCM Lite',
      ...updateData,
      isInitialized: true
    });
  } else {
    Object.assign(current, updateData);
  }
  await current.save();

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'SETTINGS_UPDATED',
    entity: 'CompanySettings',
    entityId: current._id,
    before,
    after: current.toObject(),
    req
  });

  return current;
};

// ==================== DEPARTMENTS ====================
const getDepartments = async () => {
  return await Department.find().sort({ name: 1 });
};

const createDepartment = async ({ name, code, description }, req = null) => {
  if (!name) {
    const error = new Error('Department name is required');
    error.statusCode = 400;
    throw error;
  }

  const resolvedCode = (code || name.trim().replace(/[^a-zA-Z0-9]/g, '').substring(0, 4) || 'DEPT').toUpperCase().trim();

  const dept = await Department.create({
    name: name.trim(),
    code: resolvedCode,
    description: description || ''
  });

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'DEPARTMENT_CREATED',
    entity: 'Department',
    entityId: dept._id,
    after: dept.toObject(),
    req
  });

  return dept;
};

const updateDepartment = async (id, updateData, req = null) => {
  const dept = await Department.findById(id);
  if (!dept) {
    const error = new Error('Department not found');
    error.statusCode = 404;
    throw error;
  }

  const before = dept.toObject();
  if (updateData.name) dept.name = updateData.name.trim();
  if (updateData.code) dept.code = updateData.code.toUpperCase().trim();
  if (updateData.description !== undefined) dept.description = updateData.description;
  if (updateData.isActive !== undefined) dept.isActive = updateData.isActive;

  await dept.save();

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'DEPARTMENT_UPDATED',
    entity: 'Department',
    entityId: dept._id,
    before,
    after: dept.toObject(),
    req
  });

  return dept;
};

const deleteDepartment = async (id, req = null) => {
  const dept = await Department.findById(id);
  if (!dept) {
    const error = new Error('Department not found');
    error.statusCode = 404;
    throw error;
  }

  await Department.findByIdAndDelete(id);

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'DEPARTMENT_DELETED',
    entity: 'Department',
    entityId: id,
    before: dept.toObject(),
    req
  });

  return { success: true, message: 'Department deleted successfully' };
};

// ==================== DESIGNATIONS ====================
const getDesignations = async () => {
  return await Designation.find().populate('departmentId', 'name code').sort({ title: 1 });
};

const createDesignation = async ({ title, name, departmentId, department, level }, req = null) => {
  const resolvedTitle = title || name;
  const resolvedDeptId = departmentId || department || null;
  if (!resolvedTitle) {
    const error = new Error('Designation title is required');
    error.statusCode = 400;
    throw error;
  }

  const designation = await Designation.create({
    title: resolvedTitle.trim(),
    departmentId: resolvedDeptId,
    level: level || 'Mid'
  });

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'DESIGNATION_CREATED',
    entity: 'Designation',
    entityId: designation._id,
    after: designation.toObject(),
    req
  });

  return designation;
};

const updateDesignation = async (id, updateData, req = null) => {
  const desig = await Designation.findById(id);
  if (!desig) {
    const error = new Error('Designation not found');
    error.statusCode = 404;
    throw error;
  }

  const before = desig.toObject();
  if (updateData.title) desig.title = updateData.title.trim();
  if (updateData.departmentId !== undefined) desig.departmentId = updateData.departmentId;
  if (updateData.level) desig.level = updateData.level;
  if (updateData.isActive !== undefined) desig.isActive = updateData.isActive;

  await desig.save();

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'DESIGNATION_UPDATED',
    entity: 'Designation',
    entityId: desig._id,
    before,
    after: desig.toObject(),
    req
  });

  return desig;
};

const deleteDesignation = async (id, req = null) => {
  const desig = await Designation.findById(id);
  if (!desig) {
    const error = new Error('Designation not found');
    error.statusCode = 404;
    throw error;
  }

  await Designation.findByIdAndDelete(id);

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'DESIGNATION_DELETED',
    entity: 'Designation',
    entityId: id,
    before: desig.toObject(),
    req
  });

  return { success: true, message: 'Designation deleted successfully' };
};

// ==================== LEAVE TYPES ====================
const getLeaveTypes = async () => {
  return await LeaveType.find().sort({ code: 1 });
};

const createLeaveType = async ({ name, code, yearlyQuota, isPaid, isUnlimited }, req = null) => {
  if (!name || !code) {
    const error = new Error('Leave type name and code are required');
    error.statusCode = 400;
    throw error;
  }

  const leaveType = await LeaveType.create({
    name: name.trim(),
    code: code.toUpperCase().trim(),
    yearlyQuota: Number(yearlyQuota) || 0,
    isPaid: isPaid !== undefined ? isPaid : true,
    isUnlimited: isUnlimited !== undefined ? isUnlimited : false
  });

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'LEAVE_TYPE_CREATED',
    entity: 'LeaveType',
    entityId: leaveType._id,
    after: leaveType.toObject(),
    req
  });

  return leaveType;
};

const updateLeaveType = async (id, updateData, req = null) => {
  const lt = await LeaveType.findById(id);
  if (!lt) {
    const error = new Error('Leave type not found');
    error.statusCode = 404;
    throw error;
  }

  const before = lt.toObject();
  if (updateData.name) lt.name = updateData.name.trim();
  if (updateData.code) lt.code = updateData.code.toUpperCase().trim();
  if (updateData.yearlyQuota !== undefined) lt.yearlyQuota = Number(updateData.yearlyQuota);
  if (updateData.isPaid !== undefined) lt.isPaid = updateData.isPaid;
  if (updateData.isUnlimited !== undefined) lt.isUnlimited = updateData.isUnlimited;
  if (updateData.isActive !== undefined) lt.isActive = updateData.isActive;

  await lt.save();

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'LEAVE_TYPE_UPDATED',
    entity: 'LeaveType',
    entityId: lt._id,
    before,
    after: lt.toObject(),
    req
  });

  return lt;
};

const deleteLeaveType = async (id, req = null) => {
  const lt = await LeaveType.findById(id);
  if (!lt) {
    const error = new Error('Leave type not found');
    error.statusCode = 404;
    throw error;
  }

  await LeaveType.findByIdAndDelete(id);

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'LEAVE_TYPE_DELETED',
    entity: 'LeaveType',
    entityId: id,
    before: lt.toObject(),
    req
  });

  return { success: true, message: 'Leave type deleted successfully' };
};

// ==================== HOLIDAYS ====================
const getHolidays = async () => {
  return await Holiday.find().sort({ date: 1 });
};

const createHoliday = async ({ name, date, description }, req = null) => {
  if (!name || !date) {
    const error = new Error('Holiday name and date (YYYY-MM-DD) are required');
    error.statusCode = 400;
    throw error;
  }

  const holiday = await Holiday.create({
    name: name.trim(),
    date: date.trim(),
    description: description || ''
  });

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'HOLIDAY_CREATED',
    entity: 'Holiday',
    entityId: holiday._id,
    after: holiday.toObject(),
    req
  });

  return holiday;
};

const updateHoliday = async (id, updateData, req = null) => {
  const holiday = await Holiday.findById(id);
  if (!holiday) {
    const error = new Error('Holiday not found');
    error.statusCode = 404;
    throw error;
  }

  const before = holiday.toObject();
  if (updateData.name) holiday.name = updateData.name.trim();
  if (updateData.date) holiday.date = updateData.date.trim();
  if (updateData.description !== undefined) holiday.description = updateData.description;
  await holiday.save();

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'HOLIDAY_UPDATED',
    entity: 'Holiday',
    entityId: holiday._id,
    before,
    after: holiday.toObject(),
    req
  });

  return holiday;
};

const deleteHoliday = async (id, req = null) => {
  const holiday = await Holiday.findById(id);
  if (!holiday) {
    const error = new Error('Holiday not found');
    error.statusCode = 404;
    throw error;
  }

  await Holiday.findByIdAndDelete(id);

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'HOLIDAY_DELETED',
    entity: 'Holiday',
    entityId: id,
    before: holiday.toObject(),
    req
  });

  return { success: true, message: 'Holiday deleted successfully' };
};

// ==================== USER LOGINS (ADMIN ONLY) ====================
const getUsers = async () => {
  return await User.find().select('-passwordHash').populate('employeeId', 'employeeCode fullName departmentId').sort({ createdAt: -1 });
};

const createHrUser = async ({ name, email, password, tempPassword, temporaryPassword }, req = null) => {
  if (!name || !email) {
    const error = new Error('Name and email are required');
    error.statusCode = 400;
    throw error;
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    const error = new Error('A user with this email already exists');
    error.statusCode = 409;
    throw error;
  }

  const resolvedTempPass = password || tempPassword || temporaryPassword || generateStrongTempPassword();
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(resolvedTempPass, salt);

  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role: 'HR',
    isActive: true,
    mustChangePassword: true
  });

  // Also link HR user to an Employee profile so HR can check in/out and apply for own leave (Section 8 #09, #12, #21)
  try {
    let hrDept = await Department.findOne({ $or: [{ code: 'HR' }, { name: /^Human Resources$/i }] });
    if (!hrDept) {
      hrDept = await Department.findOne();
    }
    if (!hrDept) {
      hrDept = await Department.create({ name: 'Human Resources', code: 'HR', description: 'People Operations' });
    }
    const hrCount = await Employee.countDocuments({ employeeCode: /^HR-/ });
    const hrCode = `HR-${String(hrCount + 1).padStart(3, '0')}`;
    const basic = 80000;
    const hrEmployee = await Employee.create({
      employeeCode: hrCode,
      userId: user._id,
      fullName: user.name,
      email: user.email,
      departmentId: hrDept._id,
      designationTitle: 'HR Manager',
      joiningDate: getCurrentDateString(),
      employmentStatus: 'ACTIVE',
      salaryStructure: {
        basic,
        hra: Math.round(basic * 0.40),
        medical: Math.round(basic * 0.10),
        gross: Math.round(basic * 1.50)
      }
    });
    user.employeeId = hrEmployee._id;
    await user.save();
  } catch (err) {
    // Non-fatal if employee profile already exists
  }

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'HR_USER_CREATED',
    entity: 'User',
    entityId: user._id,
    after: { name: user.name, email: user.email, role: user.role },
    req
  });

  // Attempt sending welcome email with temp password
  await sendWelcomeEmail({ to: user.email, name: user.name, temporaryPassword: resolvedTempPass, role: 'HR' });

  const userPayload = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword
  };

  return {
    success: true,
    message: 'HR login created successfully',
    temporaryPassword: resolvedTempPass,
    user: userPayload,
    data: {
      temporaryPassword: resolvedTempPass,
      user: userPayload
    }
  };
};

const updateUserStatus = async (userId, isActive, req = null) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  // Prevent admin from deactivating themselves
  if (req?.user?.userId && String(user._id) === String(req.user.userId)) {
    const error = new Error('You cannot deactivate your own admin account');
    error.statusCode = 400;
    throw error;
  }

  const before = user.toObject();
  user.isActive = isActive;
  await user.save();

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entity: 'User',
    entityId: user._id,
    before,
    after: user.toObject(),
    req
  });

  return {
    success: true,
    message: `User account has been ${isActive ? 'activated' : 'deactivated'}.`,
    user: { id: user._id, email: user.email, isActive: user.isActive }
  };
};

const resetUserPassword = async (userId, newTempPassword, req = null) => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const tempPass = newTempPassword || generateStrongTempPassword();
  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(tempPass, salt);
  user.mustChangePassword = true;
  await user.save();

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'ADMIN_RESET_USER_PASSWORD',
    entity: 'User',
    entityId: user._id,
    req
  });

  return {
    success: true,
    message: 'Password reset successfully. User must change it upon next login.',
    temporaryPassword: tempPass
  };
};

module.exports = {
  getSettings,
  updateSettings,
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDesignations,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getUsers,
  createHrUser,
  updateUserStatus,
  resetUserPassword
};
