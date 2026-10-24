const express = require('express');
const router = express.Router();
const multer = require('multer');
const employeeController = require('../controllers/employee.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.use(verifyToken);

// Employee Directory & Export
router.get('/', employeeController.getEmployees);
router.get('/csv-export', requireRole(['ADMIN', 'HR']), employeeController.exportEmployeesCsv);

// CSV Import with Dry-Run Report (HR & Admin)
router.post('/csv-import', requireRole(['ADMIN', 'HR']), upload.single('file'), employeeController.importEmployeesCsv);

// Register Employee (HR & Admin)
router.post('/', requireRole(['ADMIN', 'HR']), employeeController.registerEmployee);

// Employee Details & 360 Profile
router.get('/:id/360', employeeController.getEmployee360);
router.get('/:id', employeeController.getEmployee360);
router.put('/:id', requireRole(['ADMIN', 'HR', 'EMPLOYEE']), employeeController.updateEmployee);
router.patch('/:id/salary', requireRole(['ADMIN', 'HR']), employeeController.updateEmployee);

module.exports = router;
