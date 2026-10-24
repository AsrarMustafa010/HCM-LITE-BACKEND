const mongoose = require('mongoose');

const payrollRunSchema = new mongoose.Schema(
  {
    month: {
      type: Number,
      required: [true, 'Month is required (1-12)'],
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: [true, 'Year is required']
    },
    workingDaysInMonth: {
      type: Number,
      required: [true, 'Working days count in month is required']
    },
    status: {
      type: String,
      enum: ['DRAFT', 'FINALIZED'],
      default: 'DRAFT'
    },
    totalEmployees: {
      type: Number,
      default: 0
    },
    totalGross: {
      type: Number,
      default: 0
    },
    totalDeductions: {
      type: Number,
      default: 0
    },
    totalTax: {
      type: Number,
      default: 0
    },
    totalNetPay: {
      type: Number,
      default: 0
    },
    preparedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    finalizedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

payrollRunSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
