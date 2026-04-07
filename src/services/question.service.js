const { v4: uuidv4 } = require("uuid");
const prisma = require("../prisma");

function mapQuestion(row) {
  if (!row) return null;

  const explanation =
    row?.type_data && typeof row.type_data === "object"
      ? row.type_data.explanation ?? null
      : null;

  return {
    id: row.id,
    levelId: row.level_id,
    type: row.type,
    text: row.text,
    correctAnswer: row.correct_answer,
    explanation,
    difficulty: row.difficulty,
    points: row.points,
    order: row.order,
    options: row.options ?? [],
    media: row.media ?? { audioUrl: null, imageUrl: null, videoUrl: null },
    createdDate: row.created_date,
    isActive: row.is_active,
  };
}

function buildMedia(body, existing) {
  const base = (existing && typeof existing === "object") ? { ...existing } : {};
  if (body.audioUrl !== undefined) base.audioUrl = body.audioUrl;
  if (body.imageUrl !== undefined) base.imageUrl = body.imageUrl;
  if (body.videoUrl !== undefined) base.videoUrl = body.videoUrl;
  return base;
}

function buildTypeData(body, existing) {
  const base = (existing && typeof existing === "object") ? { ...existing } : {};
  if (body.explanation !== undefined) base.explanation = body.explanation;
  if (body.pattern !== undefined) base.pattern = body.pattern; // import-json có pattern
  return base;
}

async function createQuestion(userId, body) {
  const now = new Date();
  const data = {
    id: uuidv4(),
    level_id: body.levelId,
    type: Number(body.type),
    text: body.text,
    correct_answer: body.correctAnswer,
    difficulty: Number(body.difficulty ?? 0),
    points: Number(body.points ?? 10),
    order: Number(body.order ?? 1),
    options: body.options ?? null,
    type_data: buildTypeData(body, null),
    media: buildMedia(body, null),
    created_date: now,
    created_by: userId,
    updated_date: now,
    updated_by: userId,
    is_active: true,
  };

  const created = await prisma.questions.create({ data });
  return mapQuestion(created);
}

async function bulkCreateQuestions(userId, body) {
  const now = new Date();
  const levelId = body.levelId;
  const items = body.questions || [];

  const created = await prisma.$transaction(
    items.map((q, idx) =>
      prisma.questions.create({
        data: {
          id: uuidv4(),
          level_id: levelId,
          type: Number(q.type),
          text: q.text,
          correct_answer: q.correctAnswer,
          difficulty: Number(q.difficulty ?? 0),
          points: Number(q.points ?? 10),
          order: Number(q.order ?? (idx + 1)),
          options: q.options ?? null,
          type_data: buildTypeData(q, null),
          media: buildMedia(q, null),
          created_date: now,
          created_by: userId,
          updated_date: now,
          updated_by: userId,
          is_active: true,
        },
      })
    )
  );

  return created.map(mapQuestion);
}

async function updateQuestion(userId, body) {
  const now = new Date();
  const existing = await prisma.questions.findFirst({ where: { id: body.id } });
  if (!existing) return null;

  const data = {
    ...(body.levelId !== undefined ? { level_id: body.levelId } : {}),
    ...(body.type !== undefined ? { type: Number(body.type) } : {}),
    ...(body.text !== undefined ? { text: body.text } : {}),
    ...(body.correctAnswer !== undefined ? { correct_answer: body.correctAnswer } : {}),
    ...(body.difficulty !== undefined ? { difficulty: Number(body.difficulty) } : {}),
    ...(body.points !== undefined ? { points: Number(body.points) } : {}),
    ...(body.order !== undefined ? { order: Number(body.order) } : {}),
    ...(body.options !== undefined ? { options: body.options } : {}),
    ...(body.explanation !== undefined || body.pattern !== undefined
      ? { type_data: buildTypeData(body, existing.type_data) }
      : {}),
    ...(body.audioUrl !== undefined || body.imageUrl !== undefined || body.videoUrl !== undefined
      ? { media: buildMedia(body, existing.media) }
      : {}),
    updated_date: now,
    updated_by: userId,
  };

  const updated = await prisma.questions.update({ where: { id: body.id }, data });
  return mapQuestion(updated);
}

async function deleteQuestion(userId, id) {
  const now = new Date();
  await prisma.questions.update({
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

async function deleteMultipleQuestions(userId, ids) {
  const now = new Date();
  await prisma.questions.updateMany({
    where: { id: { in: ids } },
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

async function getQuestionById(id) {
  const row = await prisma.questions.findFirst({ where: { id } });
  return mapQuestion(row);
}

async function getQuestionsByLevel(levelId) {
  const rows = await prisma.questions.findMany({
    where: { level_id: levelId, is_active: true },
    orderBy: { order: "asc" },
  });
  return rows.map(mapQuestion);
}

async function getQuestionsPaged(filter) {
  let { pageNumber = 1, pageSize = 20, levelId, type, difficulty, searchText } = filter || {};
  pageNumber = Number(pageNumber) || 1;
  pageSize = Number(pageSize) || 20;

  const where = {};
  if (levelId) where.level_id = levelId;
  if (type !== undefined && type !== null) where.type = Number(type);
  if (difficulty !== undefined && difficulty !== null) where.difficulty = Number(difficulty);
  if (searchText) where.text = { contains: searchText, mode: "insensitive" };

  const totalCount = await prisma.questions.count({ where });
  const rows = await prisma.questions.findMany({
    where,
    orderBy: [{ level_id: "asc" }, { order: "asc" }],
    skip: (pageNumber - 1) * pageSize,
    take: pageSize,
  });

  return { data: rows.map(mapQuestion), pageNumber, pageSize, totalCount };
}

async function reorderQuestions(userId, levelId, ids) {
  const now = new Date();
  await prisma.$transaction(
    ids.map((id, idx) =>
      prisma.questions.update({
        where: { id },
        data: { order: idx + 1, updated_date: now, updated_by: userId },
      })
    )
  );
  return { status: true };
}

async function duplicateQuestion(userId, id) {
  const now = new Date();
  const q = await prisma.questions.findFirst({ where: { id } });
  if (!q) return null;

  const maxOrder = await prisma.questions.aggregate({
    where: { level_id: q.level_id },
    _max: { order: true },
  });

  const created = await prisma.questions.create({
    data: {
      id: uuidv4(),
      level_id: q.level_id,
      type: q.type,
      text: `${q.text} (Copy)`,
      correct_answer: q.correct_answer,
      difficulty: q.difficulty,
      points: q.points,
      order: (maxOrder._max.order || 0) + 1,
      options: q.options ?? null,
      type_data: q.type_data ?? null,
      media: q.media ?? null,
      created_date: now,
      created_by: userId,
      updated_date: now,
      updated_by: userId,
      is_active: true,
    },
  });

  return mapQuestion(created);
}

// import-json: map string type -> int (theo bảng doc import-json)
const IMPORT_TYPE_MAP = {
  "fill-in-the-blank": 1,
  meaning: 2,
  "correct-sentence": 3,
  pattern: 4,
  listening: 5,
  "multiple-choice": 6,
  "true-false": 7,
  matching: 8,
  ordering: 9,
};

function normalizeImportType(t) {
  if (typeof t === "number") return t;
  if (typeof t === "string") return IMPORT_TYPE_MAP[t.toLowerCase()] ?? 0;
  return 0;
}

async function importQuestionsJson(userId, body) {
  const now = new Date();
  const { levelId, replaceExisting = false, questions = [] } = body || {};

  if (!levelId) {
    return {
      isSuccess: false,
      message: "levelId is required",
      importedCount: 0,
      failedCount: questions.length,
      replacedCount: 0,
      importedQuestionIds: [],
      errors: [{ index: -1, message: "Missing levelId" }],
    };
  }

  let replacedCount = 0;
  if (replaceExisting) {
    const del = await prisma.questions.updateMany({
      where: { level_id: levelId },
      data: {
        is_active: false,
        deleted_date: now,
        deleted_by: userId,
        updated_date: now,
        updated_by: userId,
      },
    });
    replacedCount = del.count || 0;
  }

  const importedIds = [];
  const errors = [];

  // order auto
  const maxOrder = await prisma.questions.aggregate({
    where: { level_id: levelId, is_active: true },
    _max: { order: true },
  });
  let currentOrder = (maxOrder._max.order || 0) + 1;

  for (let i = 0; i < questions.length; i++) {
    const item = questions[i];
    try {
      if (!item?.text || !item?.correctAnswer) {
        throw new Error("Missing required fields: text/correctAnswer");
      }

      const type = normalizeImportType(item.type);
      const order = item.order && Number(item.order) > 0 ? Number(item.order) : currentOrder++;

      const media = {
        ...(item.audioUrl ? { audioUrl: item.audioUrl } : {}),
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      };

      const typeData = {
        ...(item.explanation ? { explanation: item.explanation } : {}),
        ...(item.pattern ? { pattern: item.pattern } : {}),
      };

      const created = await prisma.questions.create({
        data: {
          id: uuidv4(),
          level_id: levelId,
          type,
          text: item.text,
          correct_answer: item.correctAnswer,
          difficulty: Number(item.difficulty ?? 0),
          points: Number(item.points ?? 10),
          order,
          options: item.options ?? null,
          type_data: typeData,
          media: Object.keys(media).length ? media : null,
          created_date: now,
          created_by: userId,
          updated_date: now,
          updated_by: userId,
          is_active: true,
        },
      });

      importedIds.push(created.id);
    } catch (e) {
      errors.push({ index: i, message: e.message || "Unknown error" });
    }
  }

  const importedCount = importedIds.length;
  const failedCount = questions.length - importedCount;

  return {
    isSuccess: failedCount === 0,
    message:
      failedCount === 0
        ? `Successfully imported ${importedCount} questions`
        : `Imported ${importedCount}, failed ${failedCount}`,
    importedCount,
    failedCount,
    replacedCount,
    importedQuestionIds: importedIds,
    errors,
  };
}

module.exports = {
  createQuestion,
  bulkCreateQuestions,
  updateQuestion,
  deleteQuestion,
  deleteMultipleQuestions,
  getQuestionById,
  getQuestionsByLevel,
  getQuestionsPaged,
  reorderQuestions,
  duplicateQuestion,
  importQuestionsJson,
};
