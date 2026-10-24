const express = require('express');
const router = express.Router();
const orgController = require('../controllers/org.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

// All org routes require authentication
router.use(verifyToken);

// Company Settings
router.get('/settings', orgController.getSettings);
router.put('/settings', requireRole(['ADMIN']), orgController.updateSettings);

// Departments
router.get('/departments', orgController.getDepartments);
router.post('/departments', requireRole(['ADMIN']), orgController.createDepartment);
router.put('/departments/:id', requireRole(['ADMIN']), orgController.updateDepartment);
router.delete('/departments/:id', requireRole(['ADMIN']), orgController.deleteDepartment);

// Designations
router.get('/designations', orgController.getDesignations);
router.post('/designations', requireRole(['ADMIN']), orgController.createDesignation);
router.put('/designations/:id', requireRole(['ADMIN']), orgController.updateDesignation);
router.delete('/designations/:id', requireRole(['ADMIN']), orgController.deleteDesignation);

// Leave Types
router.get('/leave-types', orgController.getLeaveTypes);
router.post('/leave-types', requireRole(['ADMIN']), orgController.createLeaveType);
router.put('/leave-types/:id', requireRole(['ADMIN']), orgController.updateLeaveType);
router.delete('/leave-types/:id', requireRole(['ADMIN']), orgController.deleteLeaveType);

// Holidays
router.get('/holidays', orgController.getHolidays);
router.post('/holidays', requireRole(['ADMIN']), orgController.createHoliday);
router.put('/holidays/:id', requireRole(['ADMIN']), orgController.updateHoliday);
router.delete('/holidays/:id', requireRole(['ADMIN']), orgController.deleteHoliday);

// User Logins (Admin Only)
router.get('/users', requireRole(['ADMIN']), orgController.getUsers);
router.post('/users', requireRole(['ADMIN']), orgController.createHrUser);
router.post('/users/hr', requireRole(['ADMIN']), orgController.createHrUser);
router.patch('/users/:id/status', requireRole(['ADMIN']), orgController.updateUserStatus);
router.post('/users/:id/reset-password', requireRole(['ADMIN']), orgController.resetUserPassword);

module.exports = router;
