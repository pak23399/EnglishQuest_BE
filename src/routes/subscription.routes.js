const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/subscription.controller");
const auth = require("../middlewares/auth");

router.get("/active", auth, ctrl.getActive);
router.post("/change-plan", auth, ctrl.changePlan);
router.post("/cancel", auth, ctrl.cancel);

module.exports = router;
