const express = require('express');
const router = express.Router();
const commsController = require('../controllers/comms.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

router.use(verifyToken);

// Announcements
router.get('/announcements', commsController.getAnnouncements);
router.post('/announcements', requireRole(['ADMIN', 'HR']), commsController.createAnnouncement);

// In-app Notifications
router.get('/notifications', commsController.getNotifications);
router.patch('/notifications/:id/read', commsController.markAsRead);

// Audit Logs (ADMIN only - Strictly Immutable)
router.get('/audit-logs', requireRole(['ADMIN']), commsController.getAuditLogs);
const rejectAuditMutation = (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Forbidden: Audit log entries are immutable and cannot be modified or deleted.'
  });
};
router.put('/audit-logs/:id', rejectAuditMutation);
router.patch('/audit-logs/:id', rejectAuditMutation);
router.delete('/audit-logs/:id', rejectAuditMutation);
router.delete('/audit-logs', rejectAuditMutation);

module.exports = router;
