const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leave.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

router.use(verifyToken);

// Leave Balances & History
router.get('/balance', leaveController.getBalances);
router.get('/', leaveController.getLeaves);

// Apply & Cancel
router.post('/', leaveController.applyLeave);
router.patch('/:id/cancel', leaveController.cancelLeave);

// Review (HR & Admin)
router.patch('/:id/review', requireRole(['ADMIN', 'HR']), leaveController.reviewLeave);

module.exports = router;
