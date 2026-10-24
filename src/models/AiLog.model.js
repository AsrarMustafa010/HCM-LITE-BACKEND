const mongoose = require('mongoose');

const aiLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    role: {
      type: String,
      default: 'ANONYMOUS'
    },
    feature: {
      type: String,
      enum: ['CHAT', 'SUMMARY', 'SMART_LEAVE', 'POLICY_QA'],
      required: true
    },
    prompt: {
      type: String,
      required: true
    },
    toolsCalled: {
      type: [String],
      default: []
    },
    response: {
      type: String,
      default: ''
    },
    providerUsed: {
      type: String,
      enum: ['gemini', 'groq', 'fallback'],
      default: 'gemini'
    },
    durationMs: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'ERROR', 'REFUSED'],
      default: 'SUCCESS'
    }
  },
  {
    timestamps: true
  }
);

aiLogSchema.index({ createdAt: -1, userId: 1 });

module.exports = mongoose.model('AiLog', aiLogSchema);
