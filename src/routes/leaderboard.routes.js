const router = require("express").Router();
const prisma = require("../prisma");
const auth = require("../middlewares/auth");

async function top(periodType, take) {
  // simplest: read leaderboard_cache if exists, else aggregate from users
  const rows = await prisma.leaderboard_cache.findMany({
    where: { period_type: periodType },
    orderBy: { rank: "asc" },
    take,
  }).catch(() => null);

  if (rows) return rows;

  // fallback: order users by total_xp if field exists
  const users = await prisma.users.findMany({
    orderBy: { total_xp: "desc" },
    take,
    select: { id: true, full_name: true, total_xp: true },
  }).catch(() => []);
  return users.map((u, idx) => ({ rank: idx + 1, user_id: u.id, display_name: u.full_name, score: u.total_xp }));
}

router.post("/global", auth, async (req, res) => {
  const data = await top("global", Number(req.body?.limit || 50));
  res.json({ data });
});

router.post("/weekly", auth, async (req, res) => {
  const data = await top("weekly", Number(req.body?.limit || 50));
  res.json({ data });
});

router.post("/monthly", auth, async (req, res) => {
  const data = await top("monthly", Number(req.body?.limit || 50));
  res.json({ data });
});

router.get("/my-rank", auth, async (req, res) => {
  // MVP: not calculating precisely
  res.json({ message: "Not implemented in MVP" });
});

router.get("/around-me", auth, async (req, res) => {
  res.json({ message: "Not implemented in MVP" });
});

module.exports = router;
