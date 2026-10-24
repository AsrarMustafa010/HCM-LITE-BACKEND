const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required']
    },
    date: {
      type: String, // YYYY-MM-DD (PKT)
      required: [true, 'Attendance date (YYYY-MM-DD) is required']
    },
    checkIn: {
      type: Date,
      default: null
    },
    checkOut: {
      type: Date,
      default: null
    },
    workedHours: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['present', 'late', 'half_day', 'absent', 'on_leave', 'missing_checkout'],
      required: true
    },
    isLate: {
      type: Boolean,
      default: false
    },
    minutesLate: {
      type: Number,
      default: 0
    },
    source: {
      type: String,
      enum: ['web', 'camera', 'manual_correction'],
      default: 'web'
    },
    locationMeta: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      distanceMeters: { type: Number, default: null },
      faceDetected: { type: Boolean, default: null },
      faceMatched: { type: Boolean, default: null }
    }
  },
  {
    timestamps: true
  }
);

// One attendance record per employee per day!
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
