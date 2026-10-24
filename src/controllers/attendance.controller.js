const Employee = require('../models/Employee.model');
const Attendance = require('../models/Attendance.model');
const attendanceService = require('../services/attendance.service');

const getAllAttendance = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'EMPLOYEE') {
      filter.employeeId = req.user.employeeId;
    } else if (req.query.employeeId) {
      filter.employeeId = req.query.employeeId;
    }
    if (req.query.date) {
      filter.date = req.query.date;
    }
    const records = await Attendance.find(filter)
      .populate('employeeId', 'employeeCode fullName email departmentId designationTitle')
      .sort({ date: -1, createdAt: -1 });
    res.status(200).json({ success: true, data: records });
  } catch (error) {
    next(error);
  }
};

const enrollFace = async (req, res, next) => {
  try {
    const employeeId = req.user.role === 'EMPLOYEE' ? req.user.employeeId : (req.body.employeeId || req.user.employeeId);
    const { faceDescriptor } = req.body;
    if (!employeeId || !Array.isArray(faceDescriptor) || faceDescriptor.length === 0) {
      return res.status(400).json({ success: false, message: 'Valid faceDescriptor array is required' });
    }
    const emp = await Employee.findByIdAndUpdate(
      employeeId,
      { faceDescriptor: faceDescriptor.map(Number) },
      { new: true }
    );
    res.status(200).json({ success: true, message: 'Face descriptor enrolled successfully', data: { employeeId: emp?._id } });
  } catch (error) {
    next(error);
  }
};

const checkIn = async (req, res, next) => {
  try {
    const employeeId = req.user.role === 'EMPLOYEE' ? req.user.employeeId : (req.body.employeeId || req.user.employeeId);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID required for check in' });
    }

    const rawSource = (req.body.source || req.body.method || 'web').toLowerCase();
    const mappedSource = rawSource.includes('camera') || rawSource.includes('gps') ? 'camera' : 'web';

    const result = await attendanceService.checkIn({
      employeeId,
      source: mappedSource,
      faceDetected: req.body.faceDetected !== undefined ? req.body.faceDetected : (Number(req.body.faceCount) === 1),
      faceCount: req.body.faceCount,
      lat: req.body.lat,
      lng: req.body.lng,
      accuracy: req.body.accuracy !== undefined ? req.body.accuracy : req.body.accuracyMeters,
      faceDescriptor: req.body.faceDescriptor
    }, req);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const checkOut = async (req, res, next) => {
  try {
    const employeeId = req.user.role === 'EMPLOYEE' ? req.user.employeeId : (req.body.employeeId || req.user.employeeId);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID required for check out' });
    }

    const result = await attendanceService.checkOut(employeeId, req);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getDailyBoard = async (req, res, next) => {
  try {
    const data = await attendanceService.getDailyBoard(req.query.date);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getMyCalendar = async (req, res, next) => {
  try {
    const employeeId = req.user.role === 'EMPLOYEE' ? req.user.employeeId : (req.query.employeeId || req.user.employeeId);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID required' });
    }

    const data = await attendanceService.getMyCalendar(employeeId, req.query.month, req.query.year);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const requestCorrection = async (req, res, next) => {
  try {
    const employeeId = req.user.role === 'EMPLOYEE' ? req.user.employeeId : (req.body.employeeId || req.user.employeeId);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID required' });
    }

    const correction = await attendanceService.requestCorrection({
      employeeId,
      date: req.body.date,
      requestedCheckIn: req.body.requestedCheckIn,
      requestedCheckOut: req.body.requestedCheckOut,
      reason: req.body.reason
    }, req);

    res.status(201).json({ success: true, message: 'Correction request submitted', data: correction });
  } catch (error) {
    next(error);
  }
};

const getCorrections = async (req, res, next) => {
  try {
    const corrections = await attendanceService.getCorrections(req.query, req.user.role, req.user.employeeId);
    res.status(200).json({ success: true, data: corrections });
  } catch (error) {
    next(error);
  }
};

const reviewCorrection = async (req, res, next) => {
  try {
    const result = await attendanceService.reviewCorrection(
      req.params.id,
      req.body,
      req.user.userId,
      req
    );
    res.status(200).json({ success: true, message: `Correction request ${req.body.status}`, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllAttendance,
  enrollFace,
  checkIn,
  checkOut,
  getDailyBoard,
  getMyCalendar,
  requestCorrection,
  getCorrections,
  reviewCorrection
};
