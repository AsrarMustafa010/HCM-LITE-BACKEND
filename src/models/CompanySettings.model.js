const mongoose = require('mongoose');

const companySettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true
    },
    officeStartTime: {
      type: String,
      default: '09:00', // 24h format HH:mm
      trim: true
    },
    officeEndTime: {
      type: String,
      default: '17:00',
      trim: true
    },
    graceMinutes: {
      type: Number,
      default: 15 // late after 09:15
    },
    halfDayHoursThreshold: {
      type: Number,
      default: 5 // half day if under 5 hours
    },
    weekendDays: {
      type: [Number],
      default: [0, 6] // 0 = Sunday, 6 = Saturday
    },
    officeLocation: {
      lat: { type: Number, default: 24.8607 },
      lng: { type: Number, default: 67.0011 },
      radiusMeters: { type: Number, default: 150 },
      address: { type: String, default: 'Zaitoon Ashraf IT Park, Karachi' }
    },
    latePenaltyRule: {
      enabled: { type: Boolean, default: true },
      latesPerHalfDay: { type: Number, default: 3 } // 3 lates = 0.5 day deduction
    },
    requirePhotoOnCameraCheckIn: {
      type: Boolean,
      default: false
    },
    isInitialized: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
