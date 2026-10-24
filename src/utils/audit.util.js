const AuditLog = require('../models/AuditLog.model');

/**
 * Log action to immutable AuditLog collection
 */
const logAudit = async ({
  actorId,
  actorName,
  actorRole,
  action,
  entity,
  entityId = null,
  before = null,
  after = null,
  req = null
}) => {
  try {
    const ipAddress = req ? req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '' : '';
    await AuditLog.create({
      actorId,
      actorName: actorName || 'System',
      actorRole: actorRole || 'SYSTEM',
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      before,
      after,
      ipAddress
    });
  } catch (error) {
    console.error(`[AuditLog Error] Failed to record audit log: ${error.message}`);
  }
};

module.exports = {
  logAudit
};
