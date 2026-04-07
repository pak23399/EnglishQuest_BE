const { Router } = require("express");
const auth = require("../middlewares/auth");
const requireAdmin = require("../middlewares/requireAdmin");
const ctrl = require("../controllers/question.controller");

const router = Router();

router.post("/", auth, requireAdmin, ctrl.create);
router.post("/bulk", auth, requireAdmin, ctrl.bulk);
router.put("/", auth, requireAdmin, ctrl.update);
router.delete("/:id", auth, requireAdmin, ctrl.remove);
router.post("/delete-multiple", auth, requireAdmin, ctrl.deleteMultiple);
router.get("/:id", auth, requireAdmin, ctrl.getById);
router.get("/level/:levelId", auth, requireAdmin, ctrl.getByLevel);
router.post("/paged", auth, requireAdmin, ctrl.paged);
router.post("/reorder/:levelId", auth, requireAdmin, ctrl.reorder);
router.post("/duplicate/:id", auth, requireAdmin, ctrl.duplicate);

// NEW import-json (doc)
router.post("/import-json", auth, requireAdmin, ctrl.importJson);

module.exports = router;
