const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User.model');
const Employee = require('../models/Employee.model');
const { getJwtSecret } = require('../middlewares/auth.middleware');
const { logAudit } = require('../utils/audit.util');
const { sendOtpEmail } = require('../utils/email.util');

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
      employeeId: user.employeeId,
      email: user.email,
      name: user.name,
      mustChangePassword: user.mustChangePassword
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const login = async (email, password, req = null) => {
  if (!email || !password) {
    const error = new Error('Please provide email and password');
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error('Account has been deactivated. Please contact your administrator.');
    error.statusCode = 403;
    throw error;
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = generateToken(user);

  let employeeDetails = null;
  if (user.employeeId) {
    employeeDetails = await Employee.findById(user.employeeId)
      .populate('departmentId', 'name code')
      .populate('designationId', 'title level');
  }

  const userPayload = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
    employee: employeeDetails
  };

  return {
    token,
    user: userPayload,
    data: {
      token,
      user: userPayload
    }
  };
};

const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  let employeeDetails = null;
  if (user.employeeId) {
    employeeDetails = await Employee.findById(user.employeeId)
      .populate('departmentId', 'name code')
      .populate('designationId', 'title level');
  }

  return {
    ...user.toObject(),
    employee: employeeDetails
  };
};

const changePassword = async (userId, currentPassword, newPassword, req = null) => {
  if (!newPassword || newPassword.length < 6) {
    const error = new Error('New password must be at least 6 characters long');
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  // If currentPassword is provided or user is not on first-login temp password, verify currentPassword
  if (!user.mustChangePassword || currentPassword) {
    if (!currentPassword) {
      const error = new Error('Current password is required');
      error.statusCode = 400;
      throw error;
    }
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      const error = new Error('Current password is incorrect');
      error.statusCode = 400;
      throw error;
    }
  }

  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  user.mustChangePassword = false;
  await user.save();

  await logAudit({
    actorId: user._id,
    actorName: user.name,
    actorRole: user.role,
    action: 'PASSWORD_CHANGED',
    entity: 'User',
    entityId: user._id,
    req
  });

  const token = generateToken(user);

  return {
    success: true,
    message: 'Password changed successfully.',
    token,
    mustChangePassword: false
  };
};

const forgotPassword = async (email) => {
  if (!email) {
    const error = new Error('Please provide your email address');
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+resetPasswordToken +resetPasswordExpires');
  if (!user) {
    return {
      success: true,
      message: 'If that email is registered, a password reset code has been sent.'
    };
  }

  // Generate 6-digit OTP
  const otp = crypto.randomInt(100000, 999999).toString();
  const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

  user.resetPasswordToken = hashedOtp;
  user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  await user.save();

  await sendOtpEmail({ to: user.email, name: user.name, otp });

  return {
    success: true,
    message: 'If that email is registered, a password reset code has been sent.'
  };
};

const resetPassword = async (email, otp, newPassword, req = null) => {
  const tokenValue = otp || req?.body?.token;
  if (!email || !tokenValue || !newPassword) {
    const error = new Error('Email, OTP/reset code, and new password are required');
    error.statusCode = 400;
    throw error;
  }

  if (newPassword.length < 6) {
    const error = new Error('Password must be at least 6 characters long');
    error.statusCode = 400;
    throw error;
  }

  const hashedOtp = crypto.createHash('sha256').update(String(tokenValue).trim()).digest('hex');

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    resetPasswordToken: hashedOtp,
    resetPasswordExpires: { $gt: Date.now() }
  }).select('+passwordHash +resetPasswordToken +resetPasswordExpires');

  if (!user) {
    const error = new Error('Invalid or expired reset code. Please request a new one.');
    error.statusCode = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  user.mustChangePassword = false;
  await user.save();

  await logAudit({
    actorId: user._id,
    actorName: user.name,
    actorRole: user.role,
    action: 'PASSWORD_RESET_COMPLETED',
    entity: 'User',
    entityId: user._id,
    req
  });

  return {
    success: true,
    message: 'Password reset successful. You may now log in with your new password.'
  };
};

module.exports = {
  generateToken,
  login,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword
};
