const Notification = require('../models/Notification.model');
const { emitToUser } = require('./socket.util');

/**
 * Create an in-app notification and emit via socket
 */
const createNotification = async ({
  userId,
  title,
  message,
  type = 'SYSTEM',
  link = ''
}) => {
  try {
    const notif = await Notification.create({
      userId,
      title,
      message,
      type,
      link
    });

    // Real-time socket delivery
    emitToUser(userId, 'notification', notif);
    return notif;
  } catch (error) {
    console.error(`[Notification Error] Failed to create notification: ${error.message}`);
    return null;
  }
};

module.exports = {
  createNotification
};
