const paymentService = require("../services/payment.service");

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket.remoteAddress;
}

async function create(req, res, next) {
  try {
    const userId = req.user.id;

    // ✅ Accept plan from query (FE hay dùng) hoặc body (cho chắc)
    const plan = Number(req.query.plan ?? req.body.plan);
    if (!Number.isFinite(plan)) {
      return res.status(400).json({ message: "Invalid plan" });
    }

    const clientIp = getClientIp(req);

    const { paymentUrl } = await paymentService.createPaymentUrl({
      userId,
      plan,
      clientIp,
    });

    // ✅ FE thường expect { paymentUrl }
    return res.json({success: true,  paymentUrl });
  } catch (e) {
    next(e);
  }
}

// vnpay-return thường redirect về FE, không cần "trả JSON cho FE"
async function vnpayReturn(req, res, next) {
  try {
    const feBase = process.env.FE_BASE_URL || "http://localhost:5173";

    // ✅ Nếu request không phải từ VNPay (không có vnp_TxnRef) thì redirect về FE luôn
    if (!req.query.vnp_TxnRef) {
      const status = req.query.status || "success";
      const txnRef = req.query.txnRef || "";
      const transactionNo = req.query.transactionNo || "";

      if (status === "success") {
        return res.redirect(`${feBase}/payment/success?txnRef=${txnRef}&transactionNo=${transactionNo}`);
      }
      return res.redirect(`${feBase}/payment/failed?message=${encodeURIComponent("Payment processing error")}`);
    }

    // ✅ VNPay thật
    const result = await paymentService.handleVnpayReturn(req.query);

    if (result.ok) {
      const txnRef = req.query.vnp_TxnRef || "";
      const transactionNo = req.query.vnp_TransactionNo || "";
      return res.redirect(`${feBase}/payment/success?txnRef=${txnRef}&transactionNo=${transactionNo}`);
    }

    return res.redirect(`${feBase}/payment/failed?message=${encodeURIComponent(result.reason || "Payment failed")}`);
  } catch (e) {
    next(e);
  }
}



module.exports = { create, vnpayReturn };
