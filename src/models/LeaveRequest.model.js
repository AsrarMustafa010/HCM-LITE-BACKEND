const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required']
    },
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveType',
      required: [true, 'Leave type is required']
    },
    leaveTypeCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    startDate: {
      type: String, // YYYY-MM-DD
      required: [true, 'Start date is required']
    },
    endDate: {
      type: String, // YYYY-MM-DD
      required: [true, 'End date is required']
    },
    workingDays: {
      type: Number,
      required: [true, 'Working days count is required'],
      min: [1, 'Working days must be at least 1']
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewerComment: {
      type: String,
      default: '',
      trim: true
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    createdViaSmartLeave: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

leaveRequestSchema.index({ employeeId: 1, status: 1 });
leaveRequestSchema.index({ startDate: 1, endDate: 1, status: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
