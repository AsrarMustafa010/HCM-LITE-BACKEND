const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');
const Employee = require('../models/Employee.model');
const User = require('../models/User.model');
const Department = require('../models/Department.model');
const Designation = require('../models/Designation.model');
const Attendance = require('../models/Attendance.model');
const LeaveRequest = require('../models/LeaveRequest.model');
const LeaveType = require('../models/LeaveType.model');
const Payslip = require('../models/Payslip.model');
const { logAudit } = require('../utils/audit.util');
const { sendWelcomeEmail } = require('../utils/email.util');

const generateStrongTempPassword = () => {
  return `Emp@${crypto.randomBytes(4).toString('hex')}1!`;
};

// Register an employee (HR only)
const registerEmployee = async (data, req = null) => {
  const {
    employeeCode,
    fullName,
    email,
    phone = '',
    address = '',
    gender = 'Male',
    departmentId,
    department,
    designationId = null,
    designation,
    designationTitle = 'Associate',
    joiningDate,
    employmentStatus = 'ACTIVE',
    basicSalary,
    hra,
    medical,
    temporaryPassword,
    tempPassword,
    password,
    avatarUrl = ''
  } = data;

  const tempPasswordToUse = temporaryPassword || tempPassword || password || generateStrongTempPassword();
  const resolvedDepartmentId = departmentId || department;
  const resolvedDesignationId = (designationId || (designation && /^[0-9a-fA-F]{24}$/.test(String(designation)) ? designation : null));

  let resolvedCode = employeeCode ? employeeCode.toUpperCase().trim() : '';
  if (!resolvedCode) {
    const count = await Employee.countDocuments();
    resolvedCode = `EMP-${String(count + 1).padStart(3, '0')}`;
  }

  if (!fullName || !email || !resolvedDepartmentId || !joiningDate || !basicSalary) {
    const error = new Error('Full name, email, department, joining date, and basic salary are required.');
    error.statusCode = 400;
    throw error;
  }

  // Check unique employee code and email
  const existingCode = await Employee.findOne({ employeeCode: resolvedCode });
  if (existingCode) {
    const error = new Error(`Employee with code ${resolvedCode} already exists.`);
    error.statusCode = 409;
    throw error;
  }

  const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingEmail) {
    const error = new Error(`User with email ${email} already exists.`);
    error.statusCode = 409;
    throw error;
  }

  // Resolve designation title if designationId is passed
  let resolvedDesignationTitle = designationTitle || (!resolvedDesignationId && designation ? designation : 'Associate');
  if (resolvedDesignationId && !data.designationTitle) {
    const desigDoc = await Designation.findById(resolvedDesignationId);
    if (desigDoc) resolvedDesignationTitle = desigDoc.title;
  }

  // Calculate Salary Structure (M6 Business Rule)
  const basic = Number(basicSalary);
  if (isNaN(basic) || basic <= 0) {
    const error = new Error('Basic salary must be greater than 0.');
    error.statusCode = 422;
    throw error;
  }
  const hraVal = hra !== undefined ? Number(hra) : Math.round(basic * 0.40);
  const medVal = medical !== undefined ? Number(medical) : Math.round(basic * 0.10);
  const gross = basic + hraVal + medVal;

  // 1. Create User account for employee with mustChangePassword = true
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(tempPasswordToUse, salt);

  const newUser = await User.create({
    name: fullName.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role: 'EMPLOYEE',
    isActive: true,
    mustChangePassword: true
  });

  // 2. Create Employee record
  const newEmployee = await Employee.create({
    employeeCode: resolvedCode,
    userId: newUser._id,
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    address: address.trim(),
    gender,
    departmentId: resolvedDepartmentId,
    designationId: resolvedDesignationId,
    designationTitle: resolvedDesignationTitle.trim(),
    joiningDate: joiningDate.trim(),
    employmentStatus,
    salaryStructure: {
      basic,
      hra: hraVal,
      medical: medVal,
      gross
    },
    avatarUrl
  });

  // 3. Link Employee back to User
  newUser.employeeId = newEmployee._id;
  await newUser.save();

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'EMPLOYEE_REGISTERED',
    entity: 'Employee',
    entityId: newEmployee._id,
    after: { employeeCode: newEmployee.employeeCode, email: newEmployee.email },
    req
  });

  // Send welcome email with temp password
  await sendWelcomeEmail({
    to: newEmployee.email,
    name: newEmployee.fullName,
    temporaryPassword: tempPasswordToUse,
    role: 'EMPLOYEE'
  });

  const empObj = {
    ...newEmployee.toObject(),
    basicSalary: basic,
    grossSalary: gross
  };

  return {
    success: true,
    message: 'Employee registered successfully and login created.',
    temporaryPassword: tempPasswordToUse,
    employee: empObj,
    data: {
      temporaryPassword: tempPasswordToUse,
      employee: empObj
    }
  };
};

// Edit employee details (HR manages all; EMPLOYEE edits own phone & address; ADMIN is View-only per Section 8 #06/#14)
const updateEmployee = async (id, updateData, userRole, requestingEmployeeId, req = null) => {
  if (userRole === 'ADMIN') {
    const error = new Error('Forbidden: Admin has view-only access to employee details and salary structures. Only HR can manage employee records.');
    error.statusCode = 403;
    throw error;
  }

  const employee = await Employee.findById(id);
  if (!employee) {
    const error = new Error('Employee not found');
    error.statusCode = 404;
    throw error;
  }

  const before = employee.toObject();

  if (userRole === 'EMPLOYEE') {
    // Employee can ONLY edit own phone and address
    if (String(employee._id) !== String(requestingEmployeeId)) {
      const error = new Error('Forbidden: You can only edit your own profile.');
      error.statusCode = 403;
      throw error;
    }

    if (updateData.phone !== undefined) employee.phone = updateData.phone;
    if (updateData.address !== undefined) employee.address = updateData.address;
    if (updateData.avatarUrl !== undefined) employee.avatarUrl = updateData.avatarUrl;
    if (Array.isArray(updateData.faceDescriptor)) employee.faceDescriptor = updateData.faceDescriptor;
  } else if (userRole === 'HR') {
    // HR & ADMIN can edit job details, department, salary structure, status, etc.
    if (updateData.fullName) employee.fullName = updateData.fullName.trim();
    if (updateData.phone !== undefined) employee.phone = updateData.phone;
    if (updateData.address !== undefined) employee.address = updateData.address;
    if (updateData.gender) employee.gender = updateData.gender;
    if (updateData.departmentId) employee.departmentId = updateData.departmentId;
    if (updateData.designationId !== undefined) employee.designationId = updateData.designationId;
    if (updateData.designationTitle) employee.designationTitle = updateData.designationTitle;
    if (updateData.employmentStatus) employee.employmentStatus = updateData.employmentStatus;
    if (updateData.exitDate !== undefined) employee.exitDate = updateData.exitDate;
    if (updateData.avatarUrl !== undefined) employee.avatarUrl = updateData.avatarUrl;
    if (updateData.faceDescriptor) employee.faceDescriptor = updateData.faceDescriptor;

    if (updateData.basicSalary !== undefined || updateData.salaryStructure) {
      const basic = Number(updateData.basicSalary || updateData.salaryStructure?.basic || employee.salaryStructure.basic);
      const hra = updateData.hra !== undefined ? Number(updateData.hra) : Math.round(basic * 0.40);
      const med = updateData.medical !== undefined ? Number(updateData.medical) : Math.round(basic * 0.10);
      employee.salaryStructure = {
        basic,
        hra,
        medical: med,
        gross: basic + hra + med
      };
    }
  }

  await employee.save();

  // Keep User display name in sync if name was updated
  if (updateData.fullName) {
    await User.findByIdAndUpdate(employee.userId, { name: employee.fullName });
  }

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'EMPLOYEE_UPDATED',
    entity: 'Employee',
    entityId: employee._id,
    before,
    after: employee.toObject(),
    req
  });

  return employee;
};

// Employee Directory with Search, Filters & Pagination
const getEmployees = async (query = {}, userRole, requestingEmployeeId) => {
  // If role is EMPLOYEE, restrict strictly to own record
  if (userRole === 'EMPLOYEE') {
    const ownRecord = await Employee.findById(requestingEmployeeId)
      .populate('departmentId', 'name code')
      .populate('designationId', 'title level');
    return {
      employees: ownRecord ? [ownRecord] : [],
      total: ownRecord ? 1 : 0,
      page: 1,
      totalPages: 1
    };
  }

  const { search, departmentId, employmentStatus, designationId, page = 1, limit = 20 } = query;
  const filter = {};

  if (departmentId) filter.departmentId = departmentId;
  if (employmentStatus) filter.employmentStatus = employmentStatus;
  if (designationId) filter.designationId = designationId;

  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { fullName: searchRegex },
      { email: searchRegex },
      { employeeCode: searchRegex }
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Employee.countDocuments(filter);
  const employees = await Employee.find(filter)
    .populate('departmentId', 'name code')
    .populate('designationId', 'title level')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  return {
    employees,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit))
  };
};

// Employee 360 Degree View
const getEmployee360 = async (id, userRole, requestingEmployeeId) => {
  if (userRole === 'EMPLOYEE' && String(id) !== String(requestingEmployeeId)) {
    const error = new Error('Forbidden: You can only view your own 360 profile.');
    error.statusCode = 403;
    throw error;
  }

  const employee = await Employee.findById(id)
    .populate('departmentId', 'name code')
    .populate('designationId', 'title level');

  if (!employee) {
    const error = new Error('Employee not found');
    error.statusCode = 404;
    throw error;
  }

  // 1. Attendance Summary (all time / current year)
  const attendanceRecords = await Attendance.find({ employeeId: id });
  const attendanceCounts = {
    totalRecords: attendanceRecords.length,
    present: attendanceRecords.filter(a => a.status === 'present').length,
    late: attendanceRecords.filter(a => a.isLate).length,
    halfDay: attendanceRecords.filter(a => a.status === 'half_day').length,
    missingCheckout: attendanceRecords.filter(a => a.status === 'missing_checkout').length,
    onLeave: attendanceRecords.filter(a => a.status === 'on_leave').length
  };

  // 2. Leave Quotas and Balances for Current Year
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const leaveTypes = await LeaveType.find({ isActive: true });
  const approvedLeaves = await LeaveRequest.find({
    employeeId: id,
    status: 'APPROVED',
    startDate: { $gte: yearStart },
    endDate: { $lte: yearEnd }
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
      remainingBalance: lt.isUnlimited ? 'Unlimited' : Math.max(0, lt.yearlyQuota - usedDays),
      isUnlimited: lt.isUnlimited
    };
  });

  // 3. Recent 5 Leave Requests
  const recentLeaves = await LeaveRequest.find({ employeeId: id })
    .sort({ createdAt: -1 })
    .limit(5);

  // 4. Recent 5 Payslips
  const recentPayslips = await Payslip.find({ employeeId: id, status: 'FINALIZED' })
    .sort({ year: -1, month: -1 })
    .limit(5);

  return {
    employee,
    attendanceCounts,
    leaveBalances,
    recentLeaves,
    recentPayslips
  };
};

// CSV Import with Dry-Run Error Report (HR only)
const importEmployeesCsv = async (csvDataString, dryRun = true, req = null) => {
  let records;
  try {
    records = parse(csvDataString, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
  } catch (err) {
    const error = new Error(`CSV Parsing Error: ${err.message}`);
    error.statusCode = 400;
    throw error;
  }

  const departments = await Department.find();
  const deptMap = {};
  departments.forEach(d => {
    deptMap[d.code.toUpperCase()] = d._id;
    deptMap[d.name.toLowerCase()] = d._id;
  });

  const existingCodes = new Set((await Employee.find().select('employeeCode')).map(e => e.employeeCode.toUpperCase()));
  const existingEmails = new Set((await User.find().select('email')).map(u => u.email.toLowerCase()));

  const errors = [];
  const validRows = [];
  const seenCodesInCsv = new Set();
  const seenEmailsInCsv = new Set();

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 1; // 1-indexed for judge report
    const row = records[i];
    const rowErrors = [];

    const code = (row.employeeCode || row.code || `CSV-${String(rowNum).padStart(3, '0')}`).toUpperCase().trim();
    const name = (row.fullName || row.name || '').trim();
    const email = (row.email || '').toLowerCase().trim();
    const deptCode = (row.departmentCode || row.department || '').trim();
    const joiningDate = (row.joiningDate || row.date || '').trim();
    const basicSalary = Number(row.basicSalary || row.salary);

    // Rule 1: Required fields
    if (!code) rowErrors.push({ row: rowNum, field: 'employeeCode', reason: 'Employee code is required' });
    if (!name) rowErrors.push({ row: rowNum, field: 'fullName', reason: 'Full name is required' });
    if (!email) rowErrors.push({ row: rowNum, field: 'email', reason: 'Email is required' });
    if (!deptCode) rowErrors.push({ row: rowNum, field: 'departmentCode', reason: 'Department code is required' });
    if (!joiningDate) rowErrors.push({ row: rowNum, field: 'joiningDate', reason: 'Joining date is required' });
    if (row.basicSalary === undefined && row.salary === undefined) {
      rowErrors.push({ row: rowNum, field: 'basicSalary', reason: 'Basic salary is required' });
    } else if (isNaN(basicSalary)) {
      rowErrors.push({ row: rowNum, field: 'basicSalary', reason: 'Basic salary must be a valid number' });
    }

    // Rule 2: Valid email regex
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (email && !emailRegex.test(email)) {
      rowErrors.push({ row: rowNum, field: 'email', reason: 'Invalid email format' });
    }

    // Rule 3: Unique Code & Email
    if (code) {
      if (existingCodes.has(code) || seenCodesInCsv.has(code)) {
        rowErrors.push({ row: rowNum, field: 'employeeCode', reason: `Employee code ${code} is already in use` });
      }
      seenCodesInCsv.add(code);
    }

    if (email) {
      if (existingEmails.has(email) || seenEmailsInCsv.has(email)) {
        rowErrors.push({ row: rowNum, field: 'email', reason: `Email ${email} is already registered` });
      }
      seenEmailsInCsv.add(email);
    }

    // Rule 4: Known Department
    const matchedDeptId = deptMap[deptCode.toUpperCase()] || deptMap[deptCode.toLowerCase()];
    if (deptCode && !matchedDeptId) {
      rowErrors.push({ row: rowNum, field: 'departmentCode', reason: `Unknown department: ${deptCode}` });
    }

    // Rule 5: Valid ISO Date format YYYY-MM-DD
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (joiningDate) {
      if (!isoDateRegex.test(joiningDate)) {
        rowErrors.push({ row: rowNum, field: 'joiningDate', reason: 'Joining date must be ISO format YYYY-MM-DD' });
      } else {
        const [y, m, d] = joiningDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d) {
          rowErrors.push({ row: rowNum, field: 'joiningDate', reason: `Invalid calendar date: ${joiningDate}` });
        }
      }
    }

    // Rule 6: Salary > 0
    if (!isNaN(basicSalary) && basicSalary <= 0) {
      rowErrors.push({ row: rowNum, field: 'basicSalary', reason: 'Salary must be greater than 0' });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      validRows.push({
        employeeCode: code,
        fullName: name,
        email,
        phone: row.phone || '',
        gender: row.gender || 'Male',
        departmentId: matchedDeptId,
        designationTitle: row.designation || 'Associate',
        joiningDate,
        basicSalary
      });
    }
  }

  // If dryRun is true OR there are validation errors, do NOT commit to database
  const invalidRowsCount = records.length - validRows.length;
  if (dryRun || errors.length > 0) {
    return {
      dryRun: Boolean(dryRun),
      totalRows: records.length,
      validRowsCount: validRows.length,
      validCount: validRows.length,
      invalidRowsCount,
      invalidCount: invalidRowsCount,
      errorCount: errors.length,
      errors,
      importedCount: 0,
      message: dryRun
        ? `Dry run finished. Found ${errors.length} errors across ${records.length} rows.`
        : `Import rejected. ${errors.length} validation errors found. Please correct them and re-import.`
    };
  }

  // Execute actual database insertion
  const salt = await bcrypt.genSalt(10);
  let importedCount = 0;

  for (const item of validRows) {
    const tempPass = generateStrongTempPassword();
    const passwordHash = await bcrypt.hash(tempPass, salt);
    const user = await User.create({
      name: item.fullName,
      email: item.email,
      passwordHash,
      role: 'EMPLOYEE',
      isActive: true,
      mustChangePassword: true
    });

    const basic = Number(item.basicSalary);
    const emp = await Employee.create({
      employeeCode: item.employeeCode,
      userId: user._id,
      fullName: item.fullName,
      email: item.email,
      phone: item.phone,
      gender: item.gender,
      departmentId: item.departmentId,
      designationTitle: item.designationTitle,
      joiningDate: item.joiningDate,
      employmentStatus: 'ACTIVE',
      salaryStructure: {
        basic,
        hra: Math.round(basic * 0.40),
        medical: Math.round(basic * 0.10),
        gross: basic + Math.round(basic * 0.40) + Math.round(basic * 0.10)
      }
    });

    user.employeeId = emp._id;
    await user.save();
    importedCount++;
  }

  await logAudit({
    actorId: req?.user?.userId,
    actorName: req?.user?.name,
    actorRole: req?.user?.role,
    action: 'CSV_EMPLOYEES_IMPORTED',
    entity: 'Employee',
    after: { importedCount },
    req
  });

  return {
    dryRun: false,
    totalRows: records.length,
    validRowsCount: validRows.length,
    errorCount: 0,
    errors: [],
    importedCount,
    message: `Successfully imported ${importedCount} employees.`
  };
};

// CSV Export
const exportEmployeesCsv = async (query = {}) => {
  const { employees } = await getEmployees(query, 'ADMIN', null);
  const headers = ['employeeCode', 'fullName', 'email', 'phone', 'gender', 'department', 'designation', 'joiningDate', 'status', 'basicSalary', 'grossSalary'];

  const rows = employees.map(e => [
    `"${e.employeeCode}"`,
    `"${e.fullName}"`,
    `"${e.email}"`,
    `"${e.phone || ''}"`,
    `"${e.gender}"`,
    `"${e.departmentId?.name || ''}"`,
    `"${e.designationTitle}"`,
    `"${e.joiningDate}"`,
    `"${e.employmentStatus}"`,
    e.salaryStructure?.basic || 0,
    e.salaryStructure?.gross || 0
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
};

module.exports = {
  registerEmployee,
  updateEmployee,
  getEmployees,
  getEmployee360,
  importEmployeesCsv,
  exportEmployeesCsv
};
