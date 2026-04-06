const { v4: uuidv4 } = require("uuid");
const prisma = require("../prisma"); // dùng prisma.js bạn đang có

function mapSection(row, totalLevels = 0) {
  if (!row) return null;

  const estimatedMinutes =
    row?.metadata && typeof row.metadata === "object"
      ? row.metadata.estimatedMinutes ?? null
      : null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    order: row.order,
    requiredPlan: row.required_plan,
    isFreeAccess: row.is_free_access,
    prerequisiteIds: row.prerequisite_ids ?? [],
    estimatedMinutes,
    totalLevels,
    createdDate: row.created_date,
    isActive: row.is_active,
    imageUrl: row.image_url ?? null,
    iconUrl: row.icon_url ?? null,
  };
}

async function createSection(userId, body) {
  const now = new Date();

  const data = {
    id: uuidv4(),
    title: body.title,
    description: body.description ?? null,
    order: Number(body.order ?? 1),
    required_plan: Number(body.requiredPlan ?? 0),
    is_free_access: Boolean(body.isFree ?? body.isFreeAccess ?? true),
    prerequisite_ids: body.prerequisiteSectionIds ?? body.prerequisiteIds ?? [],
    metadata: { estimatedMinutes: body.estimatedMinutes ?? null },
    created_date: now,
    created_by: userId,
    updated_date: now,
    updated_by: userId,
    is_active: true,
    image_url: body.imageUrl ?? null,
    icon_url: body.iconUrl ?? null,
  };

  const created = await prisma.sections.create({ data });

  return mapSection(created, 0);
}

async function updateSection(userId, body) {
  const now = new Date();

  const existing = await prisma.sections.findFirst({
    where: { id: body.id },
  });
  if (!existing) return null;

  const metadata = (existing.metadata && typeof existing.metadata === "object")
    ? { ...existing.metadata }
    : {};

  if (body.estimatedMinutes !== undefined) {
    metadata.estimatedMinutes = body.estimatedMinutes;
  }

  const data = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.order !== undefined ? { order: Number(body.order) } : {}),
    ...(body.requiredPlan !== undefined ? { required_plan: Number(body.requiredPlan) } : {}),
    ...(body.isFree !== undefined ? { is_free_access: Boolean(body.isFree) } : {}),
    ...(body.isFreeAccess !== undefined ? { is_free_access: Boolean(body.isFreeAccess) } : {}),
    ...(body.prerequisiteSectionIds !== undefined ? { prerequisite_ids: body.prerequisiteSectionIds } : {}),
    ...(body.prerequisiteIds !== undefined ? { prerequisite_ids: body.prerequisiteIds } : {}),
    ...(body.imageUrl !== undefined ? { image_url: body.imageUrl } : {}),
    ...(body.iconUrl !== undefined ? { icon_url: body.iconUrl } : {}),
    ...(body.estimatedMinutes !== undefined ? { metadata } : {}),
    updated_date: now,
    updated_by: userId,
  };

  const updated = await prisma.sections.update({
    where: { id: body.id },
    data,
  });

  const totalLevels = await prisma.levels.count({
    where: { section_id: body.id, is_active: true },
  });

  return mapSection(updated, totalLevels);
}

async function deleteSection(userId, id) {
  // doc: 400 nếu section có levels
  const levelCount = await prisma.levels.count({
    where: { section_id: id, is_active: true },
  });
  if (levelCount > 0) {
    const err = new Error("Section has levels");
    err.status = 400;
    throw err;
  }

  const now = new Date();
  await prisma.sections.update({
    where: { id },
    data: {
      is_active: false,
      deleted_date: now,
      deleted_by: userId,
      updated_date: now,
      updated_by: userId,
    },
  });

  return { status: true };
}

async function getSectionById(id) {
  const row = await prisma.sections.findFirst({ where: { id } });
  if (!row) return null;

  const totalLevels = await prisma.levels.count({
    where: { section_id: id, is_active: true },
  });

  return mapSection(row, totalLevels);
}

async function getAllSectionsPublic() {
  const rows = await prisma.sections.findMany({
    where: { is_active: true },
    orderBy: { order: "asc" },
  });

  // totalLevels: có thể tính nhanh bằng count group, nhưng đơn giản loop
  const result = [];
  for (const s of rows) {
    const totalLevels = await prisma.levels.count({
      where: { section_id: s.id, is_active: true },
    });
    result.push(mapSection(s, totalLevels));
  }
  return result;
}

async function getSectionsPaged({ pageNumber = 1, pageSize = 10 }) {
  pageNumber = Number(pageNumber) || 1;
  pageSize = Number(pageSize) || 10;

  const where = {}; // admin có thể xem cả inactive nếu muốn, nhưng doc không nói -> lấy tất cả
  const totalCount = await prisma.sections.count({ where });

  const rows = await prisma.sections.findMany({
    where,
    orderBy: { order: "asc" },
    skip: (pageNumber - 1) * pageSize,
    take: pageSize,
  });

  const data = [];
  for (const s of rows) {
    const totalLevels = await prisma.levels.count({
      where: { section_id: s.id, is_active: true },
    });
    data.push(mapSection(s, totalLevels));
  }

  return { data, pageNumber, pageSize, totalCount };
}

async function reorderSections(userId, ids) {
  const now = new Date();
  await prisma.$transaction(
    ids.map((id, idx) =>
      prisma.sections.update({
        where: { id },
        data: { order: idx + 1, updated_date: now, updated_by: userId },
      })
    )
  );
  return { status: true };
}

async function getSectionWithLevels(id) {
  const row = await prisma.sections.findFirst({
    where: { id },
    include: {
      levels: {
        where: { is_active: true },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!row) return null;

  const section = mapSection(row, row.levels?.length ?? 0);
  section.levels = (row.levels || []).map((l) => ({
    id: l.id,
    sectionId: l.section_id,
    title: l.title,
    description: l.description,
    order: l.order,
    difficulty: l.difficulty,
    prerequisiteIds: l.prerequisite_ids ?? [],
    config: l.config ?? null,
    createdDate: l.created_date,
    isActive: l.is_active,
  }));
  return section;
}

module.exports = {
  createSection,
  updateSection,
  deleteSection,
  getSectionById,
  getAllSectionsPublic,
  getSectionsPaged,
  reorderSections,
  getSectionWithLevels,
};
