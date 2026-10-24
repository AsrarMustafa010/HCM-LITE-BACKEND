const analyticsService = require('../services/analytics.service');

const getAdminDashboard = async (req, res, next) => {
  try {
    const data = await analyticsService.getAdminDashboard(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getHrDashboard = async (req, res, next) => {
  try {
    const data = await analyticsService.getHrDashboard(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getEmployeeDashboard = async (req, res, next) => {
  try {
    const employeeId = req.user.role === 'EMPLOYEE' ? req.user.employeeId : (req.query.employeeId || req.user.employeeId);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID required for personal dashboard' });
    }

    const data = await analyticsService.getEmployeeDashboard(employeeId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminDashboard,
  getHrDashboard,
  getEmployeeDashboard
};
