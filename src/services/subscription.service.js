const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/* ===== ENUM ===== */
const SubscriptionPlan = { Free: 0, Support: 1, Premium: 2 };
const SubscriptionStatus = { Inactive: 0, Active: 1, Cancelled: 2, Expired: 3 };

function computeAutoRenew(plan) {
  // Support lifetime: không renew
  if (plan === SubscriptionPlan.Support) return false;
  // Premium: có thể renew (tuỳ bạn)
  if (plan === SubscriptionPlan.Premium) return true;
  return false;
}

function computeEndDate(plan, start) {
  if (plan === SubscriptionPlan.Support) return null; // lifetime
  if (plan === SubscriptionPlan.Premium)
    return new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  return start;
}

/* ===== SERVICES ===== */

async function getActiveSubscription(userId) {
  return prisma.user_subscriptions.findFirst({
    where: {
      user_id: userId,
      is_active: true,
      status: SubscriptionStatus.Active,
      OR: [{ end_date: null }, { end_date: { gt: new Date() } }],
    },
    orderBy: { created_date: "desc" },
    include: { payments: true },
  });
}

async function changePlan(userId, newPlan) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const active = await tx.user_subscriptions.findFirst({
      where: {
        user_id: userId,
        is_active: true,
        status: SubscriptionStatus.Active,
        OR: [{ end_date: null }, { end_date: { gt: now } }],
      },
      orderBy: { created_date: "desc" },
    });

    if (!active) throw new Error("No active subscription found");
    if (active.plan === newPlan) return active;

    await tx.user_subscriptions.update({
      where: { id: active.id },
      data: {
        is_active: false,
        status: SubscriptionStatus.Cancelled,
        updated_date: now,
      },
    });

    return tx.user_subscriptions.create({
      data: {
        id: crypto.randomUUID(),
        user_id: userId,
        payment_id: null,
        plan: newPlan,
        status: SubscriptionStatus.Active,
        is_active: true,
        start_date: now,
        end_date: computeEndDate(newPlan, now),
        created_date: now,
        updated_date: now,
      },
    });
  });
}

async function cancelSubscription(userId) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const active = await tx.user_subscriptions.findFirst({
      where: {
        user_id: userId,
        is_active: true,
        status: SubscriptionStatus.Active,
        OR: [{ end_date: null }, { end_date: { gt: now } }],
      },
      orderBy: { created_date: "desc" },
    });

    if (!active) throw new Error("No active subscription found");

    return tx.user_subscriptions.update({
      where: { id: active.id },
      data: {
        is_active: false,
        status: SubscriptionStatus.Cancelled,
        updated_date: now,
      },
    });
  });
}

async function activatePlan(userId, plan, paymentUuid) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const active = await tx.user_subscriptions.findFirst({
      where: {
        user_id: userId,
        is_active: true,
        status: SubscriptionStatus.Active,
        OR: [{ end_date: null }, { end_date: { gt: now } }],
      },
      orderBy: { created_date: "desc" },
    });

    if (active) {
      await tx.user_subscriptions.update({
        where: { id: active.id },
        data: {
          is_active: false,
          status: SubscriptionStatus.Cancelled,
          updated_date: now,
        },
      });
    }

    return tx.user_subscriptions.create({
      data: {
        id: crypto.randomUUID(),
        user_id: userId,
        payment_id: paymentUuid || null,
        plan,
        status: SubscriptionStatus.Active,
        is_active: true,
        auto_renew: computeAutoRenew(plan),
        start_date: now,
        end_date: computeEndDate(plan, now),
        created_date: now,
        updated_date: now,
      },
    });
  });
}

/* ===== EXPORT ===== */
module.exports = {
  SubscriptionPlan,
  SubscriptionStatus,
  getActiveSubscription,
  changePlan,
  cancelSubscription,
  activatePlan,
};
