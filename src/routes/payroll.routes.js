const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payroll.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

router.use(verifyToken);

// Payroll Runs (HR generates draft, Admin finalizes; Finalized runs cannot be edited or deleted by anyone)
router.post('/runs', requireRole(['ADMIN', 'HR']), payrollController.generateDraft);
router.get('/runs', requireRole(['ADMIN', 'HR']), payrollController.getRuns);
router.get('/runs/:id', requireRole(['ADMIN', 'HR']), payrollController.getRunDetails);
router.put('/runs/:id', requireRole(['ADMIN', 'HR']), payrollController.updateRun);
router.delete('/runs/:id', requireRole(['ADMIN', 'HR']), payrollController.deleteRun);
router.patch('/runs/:id/finalize', requireRole(['ADMIN']), payrollController.finalizeRun);

// Payslips
router.get('/payslips', payrollController.getMyPayslips);
router.get('/my-payslips', payrollController.getMyPayslips);
router.get('/payslips/:id/pdf', payrollController.downloadPayslipPdf);
router.get('/payslips/:id', payrollController.getPayslip);

module.exports = router;
