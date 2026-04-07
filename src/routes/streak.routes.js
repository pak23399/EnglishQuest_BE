const express = require("express");
const prisma = require("../prisma");
const auth = require("../middlewares/auth");

const router = express.Router();

// router.get("/info", auth, async (req, res) => {
//   const user = await prisma.users.findUnique({ where: { id: req.user.userId } });
//   res.json({ streak: user?.current_streak ?? 0, freezeCount: user?.streak_freeze_count ?? 0 });
// });
router.get("/info", auth, async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: {
        streak_data: true,
        last_activity_at: true,
      },
    });

    const streakData = user?.streak_data || {};
    const currentStreak = Number(streakData.currentStreak ?? streakData.current_streak ?? 0);
    const longestStreak = Number(streakData.longestStreak ?? streakData.longest_streak ?? currentStreak ?? 0);
    const streakFreezeCount = Number(streakData.streakFreezeCount ?? streakData.streak_freeze_count ?? 0);

    const lastActivityDate = user?.last_activity_at
      ? new Date(user.last_activity_at).toISOString()
      : null;

    // logic tối thiểu: nếu hôm nay chưa activity thì canEarnToday = true
    const today = new Date();
    const didToday =
      lastActivityDate &&
      new Date(lastActivityDate).toDateString() === today.toDateString();

    return res.json({
      currentStreak,
      longestStreak,
      lastActivityDate: lastActivityDate || "",
      streakFreezeCount,
      isAtRisk: false,
      canEarnToday: !didToday,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
});


router.post("/freeze", auth, async (req, res) => {
  // MVP: decrement freeze count if >0
  const user = await prisma.users.findUnique({ where: { id: req.user.userId } });
  const count = user?.streak_freeze_count ?? 0;
  if (count <= 0) return res.status(400).json({ message: "No freeze available" });
  const updated = await prisma.users.update({ where: { id: req.user.userId }, data: { streak_freeze_count: count - 1 } });
  res.json({ freezeCount: updated.streak_freeze_count });
});

module.exports = router;
