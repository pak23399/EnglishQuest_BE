const crypto = require("crypto");
const prisma = require("../prisma"); // file wrapper: module.exports = prisma
const subscriptionService = require("./subscription.service");
const { PlanPricing, PaymentStatus } = require("../constants/subscription.const");

// Fallback nếu constants của bạn chưa có PaymentStatus/PlanPricing đúng tên:
const _PaymentStatus = PaymentStatus || { Pending: 0, Completed: 1, Failed: 2 };
const _PlanPricing = PlanPricing || { 1: 199000, 2: 99000 }; // Support=1, Premium=2 (tạm)

function sortObject(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
}
function encodeVnp(v) {
  return encodeURIComponent(String(v)).replace(/%20/g, "+");
}
function buildQueryString(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeVnp(v)}`)
    .join("&");
}

function hmacSHA512(secret, data) {
  return crypto.createHmac("sha512", secret).update(data, "utf-8").digest("hex");
}

function formatVnpDate(date) {
  // YYYYMMDDHHmmss
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function createPaymentUrl({ userId, plan, clientIp }) {
  const tmnCode = getEnv("VNP_TMN_CODE");
  const hashSecret = getEnv("VNP_HASH_SECRET");
  const vnpUrl = getEnv("VNP_URL");
  const returnUrl = getEnv("VNP_RETURN_URL");
  plan = Number(plan);
  const amount = _PlanPricing[plan];
  if (!amount || amount <= 0) throw new Error("Invalid plan amount");

  const now = new Date();
  const externalPaymentId = String(Date.now()); // giống kiểu ticks đơn giản

  // 1) tạo payment record (Pending)
  const payment = await prisma.payments.create({
    data: {
      id: crypto.randomUUID(),
      user_id: userId,
      payment_id: externalPaymentId,   // external txn ref
      purchased_plan: Number(plan),
      status: _PaymentStatus.Pending,
      amount: amount,                 // Prisma Decimal: truyền number OK, Prisma tự convert
      transaction_id: null,
      is_active: true,
      created_date: now,
      updated_date: now,
      // nếu schema payments của bạn có user_id thì add vào đây
      // user_id: userId,
    },
  });
  const normalizedIp =
  clientIp === "::1" || clientIp === "0:0:0:0:0:0:0:1"
    ? "127.0.0.1"
    : clientIp || "127.0.0.1";
  // 2) build VNPay params
  // VNPay amount * 100
  const vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: tmnCode,
    vnp_Amount: amount * 100,
    vnp_CurrCode: "VND",
    vnp_TxnRef: externalPaymentId,
    vnp_OrderInfo: `Purchase plan ${plan}`,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: normalizedIp,
    vnp_CreateDate: formatVnpDate(now),
  };

  const sorted = sortObject(vnpParams);
  const signData = buildQueryString(sorted);
  const secureHash = hmacSHA512(hashSecret, signData);
  const paymentUrl = `${vnpUrl}?${buildQueryString({
    ...sorted,
    vnp_SecureHash: secureHash,
  })}`;
   console.log("SIGN_DATA:", signData);
  console.log("SECURE_HASH:", secureHash);
  console.log("VNP_URL:", paymentUrl);
  return { paymentUrl, payment };
}

function verifyVnpReturn(vnpData) {
  const hashSecret = getEnv("VNP_HASH_SECRET");

  const { vnp_SecureHash, vnp_SecureHashType, ...rest } = vnpData;
  if (!vnp_SecureHash) return false;

  const sorted = sortObject(rest);
  const signData = buildQueryString(sorted);
  const expected = hmacSHA512(hashSecret, signData);

  return expected === vnp_SecureHash;
}

async function handleVnpayReturn(vnpData) {
  const isValid = verifyVnpReturn(vnpData);
  if (!isValid) return { ok: false, reason: "Invalid signature" };

  const externalPaymentId = vnpData.vnp_TxnRef;
  const responseCode = vnpData.vnp_ResponseCode; // "00" success
  const transactionNo = vnpData.vnp_TransactionNo || null;

  const payment = await prisma.payments.findFirst({
    where: { payment_id: externalPaymentId },
  });
  if (!payment) return { ok: false, reason: "Payment not found" };

  // idempotent
  if (payment.status !== _PaymentStatus.Pending) {
    return { ok: true, alreadyProcessed: true };
  }

  // fail
  if (responseCode !== "00") {
    await prisma.payments.update({
      where: { id: payment.id },
      data: {
        status: _PaymentStatus.Failed,
        transaction_id: transactionNo,
        updated_date: new Date(),
      },
    });
    return { ok: false, reason: "Payment failed" };
  }

  // success: update payment + activate subscription atomically
  const result = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payments.update({
      where: { id: payment.id },
      data: {
        status: _PaymentStatus.Completed,
        transaction_id: transactionNo,
        updated_date: new Date(),
      },
    });

    // ⚠️ Quan trọng: activatePlan cần userId.
    // Nếu bảng payments của bạn có user_id thì dùng updatedPayment.user_id.
    // Nếu không có, bạn phải truyền userId vào payment record khi create ở trên.
    const userId = updatedPayment.user_id || payment.user_id;
    if (!userId) throw new Error("payments.user_id is missing (need to store user_id on payment)");

    const sub = await subscriptionService.activatePlan(
      userId,
      updatedPayment.purchased_plan,
      updatedPayment.id
    );

    return { updatedPayment, sub };
  });

  return { ok: true, subscription: result.sub };
}

module.exports = {
  createPaymentUrl,
  handleVnpayReturn,
};
