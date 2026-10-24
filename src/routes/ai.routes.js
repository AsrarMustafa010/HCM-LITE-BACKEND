const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');
const { aiRateLimiter } = require('../middlewares/rateLimit.middleware');

router.use(verifyToken);
router.use(aiRateLimiter);

router.post('/chat', aiController.chat);
router.post('/policy-qa', aiController.chat);
router.post('/dashboard-summary', requireRole(['ADMIN', 'HR']), aiController.getDashboardSummary);
router.post('/smart-leave', aiController.smartLeave);

module.exports = router;
