const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

router.use(verifyToken);

router.get('/admin', requireRole(['ADMIN']), dashboardController.getAdminDashboard);
router.get('/hr', requireRole(['ADMIN', 'HR']), dashboardController.getHrDashboard);
router.get('/employee', dashboardController.getEmployeeDashboard);

module.exports = router;
