// src/constants/subscription.const.js
const SubscriptionPlan = Object.freeze({
  Free: 0,
  Support: 1,
  Premium: 2,
});

const PaymentStatus = Object.freeze({
  Pending: 0,
  Completed: 1,
  Failed: 2,
});

// ✅ map theo number (key 1,2)
const PlanPricing = Object.freeze({
  [SubscriptionPlan.Support]: 49000,
  [SubscriptionPlan.Premium]: 99000,
});

module.exports = {
  SubscriptionPlan,
  PaymentStatus,
  PlanPricing,
};
