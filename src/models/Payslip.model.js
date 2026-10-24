const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema(
  {
    payrollRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRun',
      required: true
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    month: {
      type: Number,
      required: true
    },
    year: {
      type: Number,
      required: true
    },
    workingDaysInMonth: {
      type: Number,
      required: true
    },
    eligibleWorkingDays: {
      type: Number,
      required: true
    },
    presentDays: {
      type: Number,
      default: 0
    },
    lateCount: {
      type: Number,
      default: 0
    },
    halfDays: {
      type: Number,
      default: 0
    },
    paidLeaveDays: {
      type: Number,
      default: 0
    },
    unpaidLeaveDays: {
      type: Number,
      default: 0
    },
    absentDays: {
      type: Number,
      default: 0
    },
    latePenaltyDays: {
      type: Number,
      default: 0
    },
    basic: {
      type: Number,
      required: true
    },
    hra: {
      type: Number,
      required: true
    },
    medical: {
      type: Number,
      required: true
    },
    fullGross: {
      type: Number,
      required: true
    },
    proratedGross: {
      type: Number,
      required: true
    },
    perDayRate: {
      type: Number,
      required: true
    },
    attendanceDeduction: {
      type: Number,
      required: true
    },
    incomeTax: {
      type: Number,
      required: true
    },
    totalDeductions: {
      type: Number,
      required: true
    },
    netPay: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['DRAFT', 'FINALIZED'],
      default: 'DRAFT'
    }
  },
  {
    timestamps: true
  }
);

payslipSchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true });
payslipSchema.index({ employeeId: 1, month: 1, year: 1 });

module.exports = mongoose.model('Payslip', payslipSchema);
