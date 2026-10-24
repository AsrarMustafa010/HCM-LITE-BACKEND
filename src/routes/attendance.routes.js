const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

router.use(verifyToken);

// Web and Camera+GPS Check-In / Check-Out & Face Enrollment
router.post('/enroll-face', requireRole(['ADMIN', 'HR', 'EMPLOYEE']), attendanceController.enrollFace);
router.post('/check-in', requireRole(['ADMIN', 'HR', 'EMPLOYEE']), attendanceController.checkIn);
router.post('/check-out', requireRole(['ADMIN', 'HR', 'EMPLOYEE']), attendanceController.checkOut);

// All Attendance Records (Scoped by Role) & Daily Board
router.get('/', attendanceController.getAllAttendance);
router.get('/board', requireRole(['ADMIN', 'HR']), attendanceController.getDailyBoard);

// Calendar View
router.get('/my-calendar', attendanceController.getMyCalendar);

// Attendance Corrections
router.post('/corrections', attendanceController.requestCorrection);
router.get('/corrections', attendanceController.getCorrections);
router.patch('/corrections/:id/review', requireRole(['ADMIN', 'HR']), attendanceController.reviewCorrection);

module.exports = router;
