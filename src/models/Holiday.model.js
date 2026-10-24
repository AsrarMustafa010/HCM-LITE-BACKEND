const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Holiday name is required'],
      trim: true
    },
    date: {
      type: String, // YYYY-MM-DD
      required: [true, 'Holiday date (YYYY-MM-DD) is required'],
      unique: true,
      trim: true
    },
    description: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Holiday', holidaySchema);
