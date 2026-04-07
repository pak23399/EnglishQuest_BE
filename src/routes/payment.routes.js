const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/payment.controller");
const auth = require("../middlewares/auth");

router.post("/create", auth, ctrl.create);
router.get("/vnpay-return", ctrl.vnpayReturn); // allow anonymous

module.exports = router;