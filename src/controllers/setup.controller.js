const setupService = require('../services/setup.service');

const getStatus = async (req, res, next) => {
  try {
    const status = await setupService.getSetupStatus();
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};

const init = async (req, res, next) => {
  try {
    const result = await setupService.initSetup(req.body, req);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const resetDemo = async (req, res, next) => {
  try {
    const result = await setupService.resetDemo();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStatus,
  init,
  resetDemo
};
