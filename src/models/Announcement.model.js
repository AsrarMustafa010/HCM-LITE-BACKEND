const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Announcement title is required'],
      trim: true
    },
    content: {
      type: String,
      required: [true, 'Announcement content is required'],
      trim: true
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    authorRole: {
      type: String,
      enum: ['ADMIN', 'HR'],
      required: true
    },
    targetRoles: {
      type: [String],
      enum: ['ADMIN', 'HR', 'EMPLOYEE'],
      default: ['ADMIN', 'HR', 'EMPLOYEE']
    }
  },
  {
    timestamps: true
  }
);

announcementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
