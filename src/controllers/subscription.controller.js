const subService = require("../services/subscription.service");

async function getActive(req, res, next) {
  try {
    const sub = await subService.getActiveSubscription(req.user.id);
    // FE muốn nhận thẳng sub (hoặc null)
    return res.json(sub);
  } catch (e) {
    next(e);
  }
}

async function changePlan(req, res, next) {
  try {
    const { newPlan } = req.body;
    const sub = await subService.changePlan(req.user.id, Number(newPlan));
    return res.json(sub);
  } catch (e) {
    next(e);
  }
}

async function cancel(req, res, next) {
  try {
    const sub = await subService.cancelSubscription(req.user.id);
    return res.json(sub);
  } catch (e) {
    next(e);
  }
}

module.exports = { getActive, changePlan, cancel };