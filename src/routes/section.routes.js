const { Router } = require("express");
const auth = require("../middlewares/auth");
const requireAdmin = require("../middlewares/requireAdmin");
const ctrl = require("../controllers/section.controller");

const router = Router();

// AllowAnonymous
router.get("/all", ctrl.getAll);

// Admin required
router.post("/", auth, requireAdmin, ctrl.create);
router.put("/", auth, requireAdmin, ctrl.update);
router.delete("/:id", auth, requireAdmin, ctrl.remove);
router.post("/paged", auth, requireAdmin, ctrl.paged);
router.post("/reorder", auth, requireAdmin, ctrl.reorder);
router.get("/:id/levels", auth, requireAdmin, ctrl.getWithLevels);
router.get("/:id", auth, requireAdmin, ctrl.getById);

module.exports = router;
