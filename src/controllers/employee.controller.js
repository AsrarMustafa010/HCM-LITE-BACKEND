const employeeService = require('../services/employee.service');

const registerEmployee = async (req, res, next) => {
  try {
    const result = await employeeService.registerEmployee(req.body, req);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const updateEmployee = async (req, res, next) => {
  try {
    const targetId = req.params.id === 'me' || !req.params.id ? req.user.employeeId : req.params.id;
    const employee = await employeeService.updateEmployee(
      targetId,
      req.body,
      req.user.role,
      req.user.employeeId,
      req
    );
    res.status(200).json({ success: true, message: 'Employee updated successfully', data: employee });
  } catch (error) {
    next(error);
  }
};

const getEmployees = async (req, res, next) => {
  try {
    const data = await employeeService.getEmployees(req.query, req.user.role, req.user.employeeId);
    res.status(200).json({ success: true, ...data, data });
  } catch (error) {
    next(error);
  }
};

const getEmployee360 = async (req, res, next) => {
  try {
    const targetId = req.params.id === 'me' || !req.params.id ? req.user.employeeId : req.params.id;
    const data = await employeeService.getEmployee360(targetId, req.user.role, req.user.employeeId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const importEmployeesCsv = async (req, res, next) => {
  try {
    let csvContent = '';
    const rawDryRun = req.body.dryRun !== undefined ? req.body.dryRun : req.query.dryRun;
    const dryRun = rawDryRun === undefined ? true : (rawDryRun === 'true' || rawDryRun === true);

    if (req.file) {
      csvContent = req.file.buffer.toString('utf-8');
    } else if (req.body.csvText) {
      csvContent = req.body.csvText;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide CSV file via multipart or raw csvText in JSON body.'
      });
    }

    const report = await employeeService.importEmployeesCsv(csvContent, dryRun, req);
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
};

const exportEmployeesCsv = async (req, res, next) => {
  try {
    const csvData = await employeeService.exportEmployeesCsv(req.query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
    res.status(200).send(csvData);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerEmployee,
  updateEmployee,
  getEmployees,
  getEmployee360,
  importEmployeesCsv,
  exportEmployeesCsv
};
