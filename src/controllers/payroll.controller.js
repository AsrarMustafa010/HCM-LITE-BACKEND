const payrollService = require('../services/payroll.service');
const PayrollRun = require('../models/PayrollRun.model');
const Payslip = require('../models/Payslip.model');

const generateDraft = async (req, res, next) => {
  try {
    const { month, year } = req.body;
    const result = await payrollService.generatePayrollDraft(month, year, req.user.userId, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRuns = async (req, res, next) => {
  try {
    const runs = await PayrollRun.find()
      .populate('preparedBy', 'name role')
      .populate('finalizedBy', 'name role')
      .sort({ year: -1, month: -1 });
    res.status(200).json({ success: true, data: runs });
  } catch (error) {
    next(error);
  }
};

const getRunDetails = async (req, res, next) => {
  try {
    const run = await PayrollRun.findById(req.params.id)
      .populate('preparedBy', 'name role')
      .populate('finalizedBy', 'name role');

    if (!run) {
      return res.status(404).json({ success: false, message: 'Payroll run not found' });
    }

    const payslips = await Payslip.find({ payrollRunId: run._id })
      .populate('employeeId', 'employeeCode fullName email departmentId designationTitle');

    res.status(200).json({ success: true, data: { run, payslips } });
  } catch (error) {
    next(error);
  }
};

const finalizeRun = async (req, res, next) => {
  try {
    const result = await payrollService.finalizePayroll(req.params.id, req.user.userId, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const updateRun = async (req, res, next) => {
  try {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) {
      return res.status(404).json({ success: false, message: 'Payroll run not found' });
    }
    if (run.status === 'FINALIZED') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Cannot edit a payroll run after it is finalized and locked.'
      });
    }
    const result = await payrollService.generatePayrollDraft(run.month, run.year, req.user.userId, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const deleteRun = async (req, res, next) => {
  try {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) {
      return res.status(404).json({ success: false, message: 'Payroll run not found' });
    }
    if (run.status === 'FINALIZED') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Cannot delete a payroll run after it is finalized and locked.'
      });
    }
    await Payslip.deleteMany({ payrollRunId: run._id });
    await PayrollRun.findByIdAndDelete(run._id);
    res.status(200).json({ success: true, message: 'Draft payroll run deleted' });
  } catch (error) {
    next(error);
  }
};

const getMyPayslips = async (req, res, next) => {
  try {
    if (req.user.role === 'ADMIN' || req.user.role === 'HR') {
      const filter = req.query.employeeId ? { employeeId: req.query.employeeId } : {};
      const payslips = await Payslip.find(filter)
        .populate({
          path: 'employeeId',
          select: 'employeeCode fullName email departmentId designationTitle',
          populate: { path: 'departmentId', select: 'name code' }
        })
        .sort({ year: -1, month: -1 });
      return res.status(200).json({ success: true, data: payslips });
    }

    const employeeId = req.user.employeeId;
    if (!employeeId) {
      return res.status(200).json({ success: true, data: [] });
    }

    const payslips = await Payslip.find({ employeeId })
      .populate({
        path: 'employeeId',
        select: 'employeeCode fullName email departmentId designationTitle',
        populate: { path: 'departmentId', select: 'name code' }
      })
      .sort({ year: -1, month: -1 });

    res.status(200).json({ success: true, data: payslips });
  } catch (error) {
    next(error);
  }
};

const getPayslip = async (req, res, next) => {
  try {
    const payslip = await payrollService.getPayslip(req.params.id, req.user.role, req.user.employeeId);
    res.status(200).json({ success: true, data: payslip });
  } catch (error) {
    next(error);
  }
};

const downloadPayslipPdf = async (req, res, next) => {
  try {
    await payrollService.streamPayslipPdf(req.params.id, req.user.role, req.user.employeeId, res);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateDraft,
  getRuns,
  getRunDetails,
  finalizeRun,
  updateRun,
  deleteRun,
  getMyPayslips,
  getPayslip,
  downloadPayslipPdf
};
