const Announcement = require('../models/Announcement.model');
const Notification = require('../models/Notification.model');
const AuditLog = require('../models/AuditLog.model');
const { emitBroadcast, emitToRole } = require('../utils/socket.util');
const { logAudit } = require('../utils/audit.util');

// ==================== ANNOUNCEMENTS ====================
const getAnnouncements = async (req, res, next) => {
  try {
    const announcements = await Announcement.find({
      targetRoles: { $in: [req.user.role] }
    })
      .populate('postedBy', 'name role')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: announcements });
  } catch (error) {
    next(error);
  }
};

const createAnnouncement = async (req, res, next) => {
  try {
    const title = req.body.title;
    const content = req.body.content || req.body.body || req.body.message;
    const targetRoles = req.body.targetRoles;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    const announcement = await Announcement.create({
      title: title.trim(),
      content: content.trim(),
      postedBy: req.user.userId,
      authorRole: req.user.role,
      targetRoles: targetRoles && targetRoles.length > 0 ? targetRoles : ['ADMIN', 'HR', 'EMPLOYEE']
    });

    // Real-time broadcast
    emitBroadcast('announcement', announcement);

    await logAudit({
      actorId: req.user.userId,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: 'ANNOUNCEMENT_POSTED',
      entity: 'Announcement',
      entityId: announcement._id,
      after: { title: announcement.title },
      req
    });

    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

// ==================== NOTIFICATIONS ====================
const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({ userId: req.user.userId, isRead: false });

    res.status(200).json({ success: true, unreadCount, data: notifications });
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    if (req.params.id === 'read-all') {
      await Notification.updateMany({ userId: req.user.userId, isRead: false }, { isRead: true });
      return res.status(200).json({ success: true, message: 'All notifications marked as read' });
    }

    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { isRead: true },
      { new: true }
    );

    res.status(200).json({ success: true, data: notif });
  } catch (error) {
    next(error);
  }
};

// ==================== AUDIT LOGS (ADMIN ONLY) ====================
const getAuditLogs = async (req, res, next) => {
  try {
    const { entity, action, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (entity) filter.entity = entity;
    if (action) filter.action = action;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .populate('actorId', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      logs,
      data: logs
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAnnouncements,
  createAnnouncement,
  getNotifications,
  markAsRead,
  getAuditLogs
};
