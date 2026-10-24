const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const setupController = require('../controllers/setup.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Admin Signup / First-Run Company Registration (Saves Admin & Company directly in MongoDB)
router.post('/signup', setupController.init);
router.post('/register', setupController.init);

// Public authentication routes
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Protected routes
router.get('/me', verifyToken, authController.getMe);
router.post('/change-password', verifyToken, authController.changePassword);

module.exports = router;
