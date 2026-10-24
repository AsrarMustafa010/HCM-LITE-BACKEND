const leaveService = require('../services/leave.service');

const getBalances = async (req, res, next) => {
  try {
    const employeeId = req.user.role === 'EMPLOYEE' ? req.user.employeeId : (req.query.employeeId || req.user.employeeId);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const balances = await leaveService.getLeaveBalances(employeeId);
    res.status(200).json({ success: true, data: balances });
  } catch (error) {
    next(error);
  }
};

const applyLeave = async (req, res, next) => {
  try {
    const employeeId = req.user.role === 'EMPLOYEE' ? req.user.employeeId : (req.body.employeeId || req.user.employeeId);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const result = await leaveService.applyLeave({
      employeeId,
      leaveTypeId: req.body.leaveTypeId,
      leaveTypeCode: req.body.leaveTypeCode,
      type: req.body.type,
      startDate: req.body.startDate || req.body.fromDate,
      start: req.body.start,
      endDate: req.body.endDate || req.body.toDate,
      end: req.body.end,
      reason: req.body.reason,
      createdViaSmartLeave: req.body.createdViaSmartLeave
    }, req);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const getLeaves = async (req, res, next) => {
  try {
    const leaves = await leaveService.getLeaves(req.query, req.user.role, req.user.employeeId);
    res.status(200).json({ success: true, data: leaves });
  } catch (error) {
    next(error);
  }
};

const cancelLeave = async (req, res, next) => {
  try {
    const result = await leaveService.cancelLeave(req.params.id, req.user.employeeId, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const reviewLeave = async (req, res, next) => {
  try {
    const leave = await leaveService.reviewLeave(
      req.params.id,
      req.body,
      req.user.userId,
      req
    );
    res.status(200).json({ success: true, message: `Leave request ${req.body.status}`, data: leave });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBalances,
  applyLeave,
  getLeaves,
  cancelLeave,
  reviewLeave
};
