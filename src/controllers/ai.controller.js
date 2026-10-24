const aiService = require('../services/ai.service');

const chat = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const result = await aiService.chatAssistant(message, req.user);
    res.status(200).json({ success: true, ...result, data: result });
  } catch (error) {
    next(error);
  }
};

const getDashboardSummary = async (req, res, next) => {
  try {
    const { kpis } = req.body;
    if (!kpis) {
      return res.status(400).json({ success: false, message: 'KPI data is required' });
    }

    const result = await aiService.generateDashboardSummary(kpis, req.user);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const smartLeave = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Natural language text is required' });
    }

    const result = await aiService.parseSmartLeave(text, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  chat,
  getDashboardSummary,
  smartLeave
};
