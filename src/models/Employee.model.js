const mongoose = require('mongoose');

const salaryStructureSchema = new mongoose.Schema(
  {
    basic: {
      type: Number,
      required: [true, 'Basic salary is required'],
      min: [1, 'Basic salary must be greater than 0']
    },
    hra: {
      type: Number,
      required: true // default 40% of basic
    },
    medical: {
      type: Number,
      required: true // default 10% of basic
    },
    gross: {
      type: Number,
      required: true // 1.5 * basic
    }
  },
  { _id: false }
);

const employeeSchema = new mongoose.Schema(
  {
    employeeCode: {
      type: String,
      required: [true, 'Employee code is required'],
      unique: true,
      uppercase: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      default: '',
      trim: true
    },
    address: {
      type: String,
      default: '',
      trim: true
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      default: 'Male'
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required']
    },
    designationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
      default: null
    },
    designationTitle: {
      type: String,
      required: [true, 'Designation title is required'],
      trim: true
    },
    joiningDate: {
      type: String, // YYYY-MM-DD
      required: [true, 'Joining date is required'],
      trim: true
    },
    exitDate: {
      type: String, // YYYY-MM-DD
      default: null
    },
    employmentStatus: {
      type: String,
      enum: ['ACTIVE', 'PROBATION', 'EXITED'],
      default: 'ACTIVE'
    },
    salaryStructure: {
      type: salaryStructureSchema,
      required: true
    },
    avatarUrl: {
      type: String,
      default: ''
    },
    faceDescriptor: {
      type: [Number],
      default: []
    }
  },
  {
    timestamps: true
  }
);

// Indexes for high performance directory search and filtering
employeeSchema.index({ fullName: 'text', email: 'text', employeeCode: 'text' });
employeeSchema.index({ departmentId: 1, employmentStatus: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
