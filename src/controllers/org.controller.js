const orgService = require('../services/org.service');

// Settings
const getSettings = async (req, res, next) => {
  try {
    const settings = await orgService.getSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const settings = await orgService.updateSettings(req.body, req);
    res.status(200).json({ success: true, message: 'Settings updated successfully', data: settings });
  } catch (error) {
    next(error);
  }
};

// Departments
const getDepartments = async (req, res, next) => {
  try {
    const departments = await orgService.getDepartments();
    res.status(200).json({ success: true, data: departments });
  } catch (error) {
    next(error);
  }
};

const createDepartment = async (req, res, next) => {
  try {
    const dept = await orgService.createDepartment(req.body, req);
    res.status(201).json({ success: true, data: dept });
  } catch (error) {
    next(error);
  }
};

const updateDepartment = async (req, res, next) => {
  try {
    const dept = await orgService.updateDepartment(req.params.id, req.body, req);
    res.status(200).json({ success: true, data: dept });
  } catch (error) {
    next(error);
  }
};

const deleteDepartment = async (req, res, next) => {
  try {
    const result = await orgService.deleteDepartment(req.params.id, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Designations
const getDesignations = async (req, res, next) => {
  try {
    const designations = await orgService.getDesignations();
    res.status(200).json({ success: true, data: designations });
  } catch (error) {
    next(error);
  }
};

const createDesignation = async (req, res, next) => {
  try {
    const desig = await orgService.createDesignation(req.body, req);
    res.status(201).json({ success: true, data: desig });
  } catch (error) {
    next(error);
  }
};

const updateDesignation = async (req, res, next) => {
  try {
    const desig = await orgService.updateDesignation(req.params.id, req.body, req);
    res.status(200).json({ success: true, data: desig });
  } catch (error) {
    next(error);
  }
};

const deleteDesignation = async (req, res, next) => {
  try {
    const result = await orgService.deleteDesignation(req.params.id, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Leave Types
const getLeaveTypes = async (req, res, next) => {
  try {
    const leaveTypes = await orgService.getLeaveTypes();
    res.status(200).json({ success: true, data: leaveTypes });
  } catch (error) {
    next(error);
  }
};

const createLeaveType = async (req, res, next) => {
  try {
    const lt = await orgService.createLeaveType(req.body, req);
    res.status(201).json({ success: true, data: lt });
  } catch (error) {
    next(error);
  }
};

const updateLeaveType = async (req, res, next) => {
  try {
    const lt = await orgService.updateLeaveType(req.params.id, req.body, req);
    res.status(200).json({ success: true, data: lt });
  } catch (error) {
    next(error);
  }
};

const deleteLeaveType = async (req, res, next) => {
  try {
    const result = await orgService.deleteLeaveType(req.params.id, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Holidays
const getHolidays = async (req, res, next) => {
  try {
    const holidays = await orgService.getHolidays();
    res.status(200).json({ success: true, data: holidays });
  } catch (error) {
    next(error);
  }
};

const createHoliday = async (req, res, next) => {
  try {
    const holiday = await orgService.createHoliday(req.body, req);
    res.status(201).json({ success: true, data: holiday });
  } catch (error) {
    next(error);
  }
};

const updateHoliday = async (req, res, next) => {
  try {
    const holiday = await orgService.updateHoliday(req.params.id, req.body, req);
    res.status(200).json({ success: true, data: holiday });
  } catch (error) {
    next(error);
  }
};

const deleteHoliday = async (req, res, next) => {
  try {
    const result = await orgService.deleteHoliday(req.params.id, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Users
const getUsers = async (req, res, next) => {
  try {
    const users = await orgService.getUsers();
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

const createHrUser = async (req, res, next) => {
  try {
    const result = await orgService.createHrUser(req.body, req);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const updateUserStatus = async (req, res, next) => {
  try {
    const { isActive } = req.body;
    const result = await orgService.updateUserStatus(req.params.id, isActive, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resetUserPassword = async (req, res, next) => {
  try {
    const { newTempPassword } = req.body;
    const result = await orgService.resetUserPassword(req.params.id, newTempPassword, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
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
