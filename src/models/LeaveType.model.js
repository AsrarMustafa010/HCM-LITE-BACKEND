const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Leave type name is required'],
      unique: true,
      trim: true
    },
    code: {
      type: String,
      required: [true, 'Leave type code is required'],
      unique: true,
      uppercase: true,
      trim: true
    },
    yearlyQuota: {
      type: Number,
      required: [true, 'Yearly quota is required'],
      default: 0
    },
    isPaid: {
      type: Boolean,
      default: true
    },
    isUnlimited: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
