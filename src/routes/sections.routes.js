const router = require("express").Router();
const prisma = require("../prisma");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/roles");

// GET /api/v1/section/all
router.get("/all", auth, requireRole("Admin"), async (req, res) => {
  const sections = await prisma.sections.findMany({ orderBy: { order_index: "asc" } });
  res.json({ data: sections });
});

router.get("/:id", auth, requireRole("Admin"), async (req, res) => {
  const section = await prisma.sections.findUnique({ where: { id: req.params.id } });
  if (!section) return res.status(404).json({ message: "Not found" });
  res.json({ data: section });
});

router.post("/", auth, requireRole("Admin"), async (req, res) => {
  const { name, order_index } = req.body || {};
  const section = await prisma.sections.create({ data: { name, order_index: Number(order_index || 0) } });
  res.status(201).json({ data: section });
});

router.put("/", auth, requireRole("Admin"), async (req, res) => {
  const { id, name, order_index } = req.body || {};
  const section = await prisma.sections.update({
    where: { id },
    data: { name, order_index: Number(order_index || 0) },
  });
  res.json({ data: section });
});

router.delete("/:id", auth, requireRole("Admin"), async (req, res) => {
  await prisma.sections.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// POST /api/v1/section/reorder
router.post("/reorder", auth, requireRole("Admin"), async (req, res) => {
  const { orders } = req.body || {}; // [{id, order_index}]
  if (!Array.isArray(orders)) return res.status(400).json({ message: "orders must be array" });

  await prisma.$transaction(
    orders.map((o) =>
      prisma.sections.update({ where: { id: o.id }, data: { order_index: Number(o.order_index) } })
    )
  );
  res.json({ ok: true });
});

// GET /api/v1/section/{id}/levels
router.get("/:id/levels", auth, requireRole("Admin"), async (req, res) => {
  const levels = await prisma.levels.findMany({
    where: { section_id: req.params.id },
    orderBy: { order_index: "asc" },
  });
  res.json({ data: levels });
});

module.exports = router;
