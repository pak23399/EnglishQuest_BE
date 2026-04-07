const express = require("express");
const prisma = require("../prisma");
const auth = require("../middlewares/auth");

const router = express.Router();
const MAX_HEARTS_DEFAULT = 5;
const REGEN_RATE_MINUTES = 5;
// router.get("/status", auth, async (req, res) => {
//   const user = await prisma.users.findUnique({ where: { id: req.user.id } });
//   res.json({ hearts: user?.hearts ?? null, lastUpdated: user?.updated_at ?? null });
// });
router.get("/status", auth, async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: {
        hearts: true,
        last_heart_regenerated_at: true,
      },
    });

    const currentHearts = Number(user?.hearts ?? 0);
    const maxHearts = MAX_HEARTS_DEFAULT;

    const lastRegeneratedAt = user?.last_heart_regenerated_at
      ? new Date(user.last_heart_regenerated_at).toISOString()
      : new Date().toISOString();

    const isMaxed = currentHearts >= maxHearts;

    // next regen calc (tối thiểu)
    const last = new Date(lastRegeneratedAt);
    const next = new Date(last.getTime() + REGEN_RATE_MINUTES * 60 * 1000);
    const now = new Date();

    const minutesUntilNextRegen = isMaxed
      ? 0
      : Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 60000));

    return res.json({
      currentHearts,
      maxHearts,
      lastRegeneratedAt,
      nextRegenAt: next.toISOString(),
      minutesUntilNextRegen,
      regenRateMinutes: REGEN_RATE_MINUTES,
      isMaxed,
      canRestoreWithAd: !isMaxed,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/restore-ad", auth, async (req, res) => {
  // MVP: just increment hearts to max 5
  const user = await prisma.users.findUnique({ where: { id: req.user.userId } });
  const next = Math.min((user?.hearts ?? 0) + 1, 5);
  const updated = await prisma.users.update({ where: { id: req.user.userId }, data: { hearts: next } });
  res.json({ hearts: updated.hearts });
});

module.exports = router;
