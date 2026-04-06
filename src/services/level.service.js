const { v4: uuidv4 } = require("uuid");
const prisma = require("../prisma");

function mapLevel(row) {
  if (!row) return null;
  return {
    id: row.id,
    sectionId: row.section_id,
    title: row.title,
    description: row.description,
    order: row.order,
    difficulty: row.difficulty,
    prerequisiteIds: row.prerequisite_ids ?? [],
    config: row.config ?? null,
    createdDate: row.created_date,
    isActive: row.is_active,
  };
}

function buildConfigFromBody(body, existingConfig) {
  const base = (existingConfig && typeof existingConfig === "object") ? { ...existingConfig } : {};
  const patch = {};

  if (body.passingScore !== undefined) patch.passingScore = Number(body.passingScore);
  if (body.totalQuestions !== undefined) patch.totalQuestions = Number(body.totalQuestions);
  if (body.xpReward !== undefined) patch.xpReward = Number(body.xpReward);
  if (body.estimatedMinutes !== undefined) patch.estimatedMinutes = Number(body.estimatedMinutes);
  if (body.isRandomized !== undefined) patch.isRandomized = Boolean(body.isRandomized);

  return { ...base, ...patch };
}

async function createLevel(userId, body) {
  const now = new Date();
  const config = buildConfigFromBody(body, null);

  const data = {
    id: uuidv4(),
    section_id: body.sectionId,
    title: body.title,
    description: body.description ?? null,
    order: Number(body.order ?? 1),
    difficulty: Number(body.difficulty ?? 0),
    prerequisite_ids: body.prerequisiteIds ?? [],
    config,
    created_date: now,
    created_by: userId,
    updated_date: now,
    updated_by: userId,
    is_active: true,
  };

  const created = await prisma.levels.create({ data });
  return mapLevel(created);
}

async function updateLevel(userId, body) {
  const now = new Date();
  const existing = await prisma.levels.findFirst({ where: { id: body.id } });
  if (!existing) return null;

  const config = buildConfigFromBody(body, existing.config);

  const data = {
    ...(body.sectionId !== undefined ? { section_id: body.sectionId } : {}),
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.order !== undefined ? { order: Number(body.order) } : {}),
    ...(body.difficulty !== undefined ? { difficulty: Number(body.difficulty) } : {}),
    ...(body.prerequisiteIds !== undefined ? { prerequisite_ids: body.prerequisiteIds } : {}),
    ...(Object.keys(config).length ? { config } : {}),
    updated_date: now,
    updated_by: userId,
  };

  const updated = await prisma.levels.update({ where: { id: body.id }, data });
  return mapLevel(updated);
}

async function deleteLevel(userId, id) {
  const now = new Date();
  await prisma.levels.update({
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

async function getLevelById(id) {
  const row = await prisma.levels.findFirst({ where: { id } });
  return mapLevel(row);
}

async function getLevelsBySection(sectionId) {
  const rows = await prisma.levels.findMany({
    where: { section_id: sectionId, is_active: true },
    orderBy: { order: "asc" },
  });
  return rows.map(mapLevel);
}

async function getLevelsPaged({ pageNumber = 1, pageSize = 10 }) {
  pageNumber = Number(pageNumber) || 1;
  pageSize = Number(pageSize) || 10;

  const where = {};
  const totalCount = await prisma.levels.count({ where });

  const rows = await prisma.levels.findMany({
    where,
    orderBy: [{ section_id: "asc" }, { order: "asc" }],
    skip: (pageNumber - 1) * pageSize,
    take: pageSize,
  });

  return { data: rows.map(mapLevel), pageNumber, pageSize, totalCount };
}

async function reorderLevels(userId, sectionId, ids) {
  const now = new Date();
  await prisma.$transaction(
    ids.map((id, idx) =>
      prisma.levels.update({
        where: { id },
        data: { order: idx + 1, updated_date: now, updated_by: userId },
      })
    )
  );
  return { status: true };
}

async function duplicateLevel(userId, id) {
  const now = new Date();

  const level = await prisma.levels.findFirst({ where: { id } });
  if (!level) return null;

  const maxOrder = await prisma.levels.aggregate({
    where: { section_id: level.section_id },
    _max: { order: true },
  });

  const newLevelId = uuidv4();
  const newLevel = await prisma.levels.create({
    data: {
      id: newLevelId,
      section_id: level.section_id,
      title: `${level.title} (Copy)`,
      description: level.description,
      order: (maxOrder._max.order || 0) + 1,
      difficulty: level.difficulty,
      prerequisite_ids: level.prerequisite_ids ?? [],
      config: level.config ?? null,
      created_date: now,
      created_by: userId,
      updated_date: now,
      updated_by: userId,
      is_active: true,
    },
  });

  // duplicate questions
  const questions = await prisma.questions.findMany({
    where: { level_id: level.id, is_active: true },
    orderBy: { order: "asc" },
  });

  await prisma.$transaction(
    questions.map((q) =>
      prisma.questions.create({
        data: {
          id: uuidv4(),
          level_id: newLevelId,
          type: q.type,
          text: q.text,
          correct_answer: q.correct_answer,
          difficulty: q.difficulty,
          points: q.points,
          order: q.order,
          options: q.options ?? null,
          type_data: q.type_data ?? null,
          media: q.media ?? null,
          created_date: now,
          created_by: userId,
          updated_date: now,
          updated_by: userId,
          is_active: true,
        },
      })
    )
  );

  return mapLevel(newLevel);
}

module.exports = {
  createLevel,
  updateLevel,
  deleteLevel,
  getLevelById,
  getLevelsBySection,
  getLevelsPaged,
  reorderLevels,
  duplicateLevel,
};
