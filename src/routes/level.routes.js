const { Router } = require("express");
const auth = require("../middlewares/auth");
const requireAdmin = require("../middlewares/requireAdmin");
const ctrl = require("../controllers/level.controller");

const router = Router();

router.post("/", auth, requireAdmin, ctrl.create);
router.put("/", auth, requireAdmin, ctrl.update);
router.delete("/:id", auth, requireAdmin, ctrl.remove);
router.get("/:id", auth, requireAdmin, ctrl.getById);
router.get("/section/:sectionId", auth, ctrl.getBySection);
router.post("/paged", auth, requireAdmin, ctrl.paged);
router.post("/reorder/:sectionId", auth, requireAdmin, ctrl.reorder);
router.post("/duplicate/:id", auth, requireAdmin, ctrl.duplicate);

module.exports = router;
