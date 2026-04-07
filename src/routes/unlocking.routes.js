const express = require("express");
const prisma = require("../prisma");
const auth = require("../middlewares/auth");

const router = express.Router();

/**
 * GET /api/v1/unlocking/sections/available
 * Trả các section khả dụng cho user
 */
router.get("/sections/available", auth, async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
    where: { id: req.user.id },
    select: { current_plan: true },
  });

  const currentPlan = Number(user?.current_plan ?? 0);

  const sections = await prisma.sections.findMany({
    where: {
      is_active: true,
      OR: [
        { is_free_access: true },
        { required_plan: { lte: currentPlan } },
      ],
    },
    orderBy: { order: "asc" },
  });

  // map về đúng Section FE (camelCase, field đầy đủ tối thiểu)
  return res.json(
    sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? "",
      order: s.order,
      imageUrl: s.image_url ?? null,
      iconUrl: s.icon_url ?? null,
      isFreeAccess: s.is_free_access,
      requiredPlan: s.required_plan,
      prerequisiteIds: Array.isArray(s.prerequisite_ids) ? s.prerequisite_ids : (s.prerequisite_ids ?? []),
      estimatedMinutes: Number((s.metadata && s.metadata.EstimatedMinutes) || 0),
      metadata: s.metadata ?? { TotalLevels: 0, EstimatedMinutes: 0 },
      createdDate: s.created_date ? new Date(s.created_date).toISOString() : "",
      createdBy: s.created_by ?? "",
      updatedDate: s.updated_date ? new Date(s.updated_date).toISOString() : "",
      updatedBy: s.updated_by ?? "",
      deletedDate: s.deleted_date ? new Date(s.deleted_date).toISOString() : null,
      deletedBy: s.deleted_by ?? null,
      isActive: s.is_active,
    }))
  );
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
