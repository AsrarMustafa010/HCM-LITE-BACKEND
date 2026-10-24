const express = require('express');
const router = express.Router();
const setupController = require('../controllers/setup.controller');

// Public route to check if setup is needed
router.get('/status', setupController.getStatus);

// First-run setup initialization (only works when admin count is 0)
router.post('/init', setupController.init);

// Reset demo endpoint for fresh 5-minute rehearsal
router.post('/reset-demo', setupController.resetDemo);

module.exports = router;
