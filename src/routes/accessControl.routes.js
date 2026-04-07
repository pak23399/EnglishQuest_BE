const router = require("express").Router();
const prisma = require("../prisma");
const auth = require("../middlewares/auth");

// GET /api/v1/access-control/level/{levelId}/check
router.get("/level/:levelId/check", auth, async (req, res) => {
  const levelId = req.params.levelId;
  const userId = req.user.userId;

  const progress = await prisma.user_progress.findFirst({ where: { user_id: userId, level_id: levelId } });
  const unlocked = progress ? true : false;
  res.json({ unlocked, progress });
});

// GET /api/v1/access-control/section/{sectionId}/check
router.get("/section/:sectionId/check", auth, async (req, res) => {
  const sectionId = req.params.sectionId;
  const levels = await prisma.levels.findMany({ where: { section_id: sectionId }, orderBy: { order_index: "asc" } });
  res.json({ levels });
});

module.exports = router;
