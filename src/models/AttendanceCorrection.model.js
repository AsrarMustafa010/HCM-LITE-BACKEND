const mongoose = require('mongoose');

const attendanceCorrectionSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required']
    },
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      default: null
    },
    date: {
      type: String, // YYYY-MM-DD
      required: [true, 'Date is required']
    },
    requestedCheckIn: {
      type: Date,
      required: [true, 'Requested check-in time is required']
    },
    requestedCheckOut: {
      type: Date,
      required: [true, 'Requested check-out time is required']
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
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
    }
  },
  {
    timestamps: true
  }
);

attendanceCorrectionSchema.index({ employeeId: 1, status: 1 });

module.exports = mongoose.model('AttendanceCorrection', attendanceCorrectionSchema);
