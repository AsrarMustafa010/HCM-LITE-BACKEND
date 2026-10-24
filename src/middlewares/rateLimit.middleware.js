const rateLimit = require('express-rate-limit');

/**
 * AI Rate Limiter: 20 requests per user per hour
 */
const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each user/IP to 20 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per authenticated user ID, or IP fallback
    return req.user?.userId ? String(req.user.userId) : req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'AI Assistant rate limit reached (maximum 20 requests per hour). Please try again later.',
      isAiGenerated: true,
      label: 'AI-generated'
    });
  }
});

module.exports = {
  aiRateLimiter
};
