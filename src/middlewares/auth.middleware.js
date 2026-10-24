const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables (.env)');
  }
  return secret;
};

/**
 * Verify JWT Token, attach user to request, and enforce first-login password change
 */
const verifyToken = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token missing. Please log in.'
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());

    // Check if user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account inactive or user not found. Please log in again.'
      });
    }

    req.user = {
      userId: user._id,
      role: user.role,
      employeeId: user.employeeId,
      email: user.email,
      name: user.name,
      mustChangePassword: user.mustChangePassword
    };

    // Enforce temporary password change on first sign-in (Section 2 & 3 M1/M3 Rule)
    if (user.mustChangePassword) {
      const allowedPaths = ['/api/auth/change-password', '/api/auth/me', '/api/auth/logout'];
      if (!allowedPaths.some(p => req.originalUrl.startsWith(p))) {
        return res.status(403).json({
          success: false,
          mustChangePassword: true,
          message: 'You must change your temporary password on first sign-in before accessing other features.'
        });
      }
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please log in again.'
    });
  }
};

/**
 * Require specific roles
 * Example: requireRole(['ADMIN', 'HR'])
 */
const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to roles [${allowedRoles.join(', ')}]. Your role: ${req.user.role}`
      });
    }

    next();
  };
};

/**
 * Standalone middleware alias if mounted explicitly
 */
const enforcePasswordChange = (req, res, next) => {
  if (req.user && req.user.mustChangePassword) {
    const allowedPaths = ['/api/auth/change-password', '/api/auth/me', '/api/auth/logout'];
    if (!allowedPaths.some(p => req.originalUrl.startsWith(p))) {
      return res.status(403).json({
        success: false,
        mustChangePassword: true,
        message: 'You must change your temporary password before accessing other features.'
      });
    }
  }
  next();
};

/**
 * Employee Data Scope Guard:
 * Blocks an EMPLOYEE from reading or modifying any other employee's records
 */
const scopeGuard = (paramKey = 'id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.role === 'EMPLOYEE') {
      const targetId = req.params[paramKey] || req.query.employeeId || req.body.employeeId;

      if (!req.user.employeeId) {
        return res.status(403).json({
          success: false,
          message: 'Employee record not linked to this user account.'
        });
      }

      if (targetId && String(targetId) !== String(req.user.employeeId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You only have permission to access your own employee data.'
        });
      }
    }

    next();
  };
};

module.exports = {
  getJwtSecret,
  verifyToken,
  requireRole,
  enforcePasswordChange,
  scopeGuard
};
