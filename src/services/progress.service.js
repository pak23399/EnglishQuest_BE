// src/services/progress.service.js
const prisma = require("../prisma");

const ProgressStatus = {
  NotStarted: 0,
  InProgress: 1,
  Completed: 2,
  Failed: 3,
  Mastered: 4,
};

function toIso(d) {
  return d ? new Date(d).toISOString() : null;
}

function statusToString(statusInt) {
  switch (statusInt) {
    case ProgressStatus.NotStarted:
      return "NotStarted";
    case ProgressStatus.InProgress:
      return "InProgress";
    case ProgressStatus.Completed:
      return "Completed";
    case ProgressStatus.Failed:
      return "Failed";
    case ProgressStatus.Mastered:
      return "Mastered";
    default:
      return "NotStarted";
  }
}

function isCompletedStatus(statusInt) {
  return statusInt === ProgressStatus.Completed || statusInt === ProgressStatus.Mastered;
}

function progressPercentageFromStatus(statusInt) {
  // theo doc: NotStarted=0, InProgress~50, Completed=100
  // Failed: mình để 0 (nếu bạn muốn 50 thì đổi tại đây)
  if (statusInt === ProgressStatus.InProgress) return 50;
  if (isCompletedStatus(statusInt)) return 100;
  return 0;
}

function normalizeStats(stats) {
  const s = stats && typeof stats === "object" ? stats : {};
  return {
    totalAttempts: Number(s.totalAttempts ?? 0),
    bestScore: Number(s.bestScore ?? 0),
    bestAccuracy: Number(s.bestAccuracy ?? 0),
    totalXpEarned: Number(s.totalXpEarned ?? 0),
    firstAttemptAt: s.firstAttemptAt ? toIso(s.firstAttemptAt) : null,
    bestAttemptAt: s.bestAttemptAt ? toIso(s.bestAttemptAt) : null,
  };
}

async function getLevelById(levelId) {
  return prisma.levels.findFirst({
    where: { id: levelId, is_active: true },
    select: { id: true, section_id: true, prerequisite_ids: true },
  });
}

async function computeIsUnlocked(userId, level) {
  const prereqIds = Array.isArray(level?.prerequisite_ids) ? level.prerequisite_ids : [];
  if (prereqIds.length === 0) return true;

  const prereqProgress = await prisma.user_progress.findMany({
    where: {
      user_id: userId,
      level_id: { in: prereqIds },
      is_active: true,
    },
    select: { level_id: true, status: true },
  });

  const completedSet = new Set(
    prereqProgress.filter((p) => isCompletedStatus(p.status)).map((p) => p.level_id)
  );

  return prereqIds.every((id) => completedSet.has(id));
}

function mapLevelProgressDocShape({ userId, level, progressRow, isUnlocked }) {
  const stats = normalizeStats(progressRow?.stats);
  const statusStr = statusToString(progressRow?.status ?? ProgressStatus.NotStarted);
  const completed = isCompletedStatus(progressRow?.status ?? ProgressStatus.NotStarted);

  return {
    id: progressRow?.id ?? null,
    userId,
    levelId: level.id,
    sectionId: level.section_id,
    status: completed ? "Completed" : statusStr, // doc example dùng "Completed"
    stats,
    lastAttemptAt: toIso(progressRow?.last_attempt_at),
    completedAt: toIso(progressRow?.completed_at),
    progressPercentage: progressPercentageFromStatus(progressRow?.status ?? ProgressStatus.NotStarted),
    isUnlocked: Boolean(isUnlocked),

    // ✅ extra for FE (không phá doc)
    isCompleted: completed,
  };
}

async function getLevelProgress(userId, levelId) {
  const level = await getLevelById(levelId);
  if (!level) return { notFound: "LEVEL_NOT_FOUND" };

  const progressRow = await prisma.user_progress.findFirst({
    where: { user_id: userId, level_id: levelId, is_active: true },
    select: {
      id: true,
      status: true,
      stats: true,
      last_attempt_at: true,
      completed_at: true,
    },
  });

  const isUnlocked = await computeIsUnlocked(userId, level);

  return {
    data: mapLevelProgressDocShape({ userId, level, progressRow, isUnlocked }),
  };
}

async function getSectionProgress(userId, sectionId) {
  const levels = await prisma.levels.findMany({
    where: { section_id: sectionId, is_active: true },
    select: { id: true },
    orderBy: { order: "asc" },
  });

  const levelIds = levels.map((l) => l.id);
  if (levelIds.length === 0) return { data: [] };

  const progressRows = await prisma.user_progress.findMany({
    where: { user_id: userId, level_id: { in: levelIds }, is_active: true },
    select: {
      id: true,
      level_id: true,
      status: true,
      stats: true,
      completed_at: true,
      last_attempt_at: true,
    },
  });

  // Doc yêu cầu array items: {id, levelId, status, stats{subset}, progressPercentage} :contentReference[oaicite:4]{index=4}
  const items = progressRows.map((p) => {
    const stats = normalizeStats(p.stats);
    return {
      id: p.id,
      levelId: p.level_id,
      status: statusToString(p.status),
      stats: {
        bestScore: stats.bestScore,
        bestAccuracy: stats.bestAccuracy,
        totalAttempts: stats.totalAttempts,
      },
      progressPercentage: progressPercentageFromStatus(p.status),

      // extra for FE
      isCompleted: isCompletedStatus(p.status),
    };
  });

  return { data: items };
}

async function getAllProgress(userId) {
  const rows = await prisma.user_progress.findMany({
    where: { user_id: userId, is_active: true },
    orderBy: [{ updated_date: "desc" }, { created_date: "desc" }],
    select: {
      id: true,
      user_id: true,
      section_id: true,
      level_id: true,
      status: true,
      stats: true,
      last_attempt_at: true,
      completed_at: true,
    },
  });

  // Doc: Array of objects same structure as Get Level Progress :contentReference[oaicite:5]{index=5}
  // Tối ưu: load levels 1 lần để compute isUnlocked
  const levelIds = [...new Set(rows.map((r) => r.level_id))];
  const levels = await prisma.levels.findMany({
    where: { id: { in: levelIds }, is_active: true },
    select: { id: true, section_id: true, prerequisite_ids: true },
  });
  const levelMap = new Map(levels.map((l) => [l.id, l]));

  const result = [];
  for (const p of rows) {
    const level = levelMap.get(p.level_id);
    if (!level) continue;

    const isUnlocked = await computeIsUnlocked(userId, level);

    result.push(
      mapLevelProgressDocShape({
        userId,
        level,
        progressRow: p,
        isUnlocked,
      })
    );
  }

  return { data: result };
}

async function getSectionSummary(userId, sectionId) {
  const section = await prisma.sections.findFirst({
    where: { id: sectionId, is_active: true },
    select: { id: true, title: true },
  });
  if (!section) return { notFound: "SECTION_NOT_FOUND" };

  const levels = await prisma.levels.findMany({
    where: { section_id: sectionId, is_active: true },
    select: { id: true },
    orderBy: { order: "asc" },
  });

  const levelIds = levels.map((l) => l.id);
  const totalLevels = levelIds.length;

  const progressRows = await prisma.user_progress.findMany({
    where: { user_id: userId, level_id: { in: levelIds }, is_active: true },
    select: { level_id: true, status: true, stats: true },
  });

  const byLevel = new Map(progressRows.map((p) => [p.level_id, p]));
  let completedLevels = 0;
  let inProgressLevels = 0;
  let notStartedLevels = 0;

  let totalXpEarned = 0;
  let accSum = 0;
  let accCount = 0;

  for (const lvlId of levelIds) {
    const p = byLevel.get(lvlId);
    const st = p?.status ?? ProgressStatus.NotStarted;
    const stats = normalizeStats(p?.stats);

    totalXpEarned += stats.totalXpEarned;

    if (stats.totalAttempts > 0) {
      accSum += stats.bestAccuracy;
      accCount += 1;
    }

    if (isCompletedStatus(st)) completedLevels += 1;
    else if (st === ProgressStatus.InProgress) inProgressLevels += 1;
    else notStartedLevels += 1;
  }

  const averageAccuracy = accCount > 0 ? Number((accSum / accCount).toFixed(2)) : 0;
  const progressPercentage = totalLevels > 0 ? Number(((completedLevels / totalLevels) * 100).toFixed(1)) : 0;

  return {
    data: {
      sectionId: section.id,
      sectionTitle: section.title,
      totalLevels,
      completedLevels,
      inProgressLevels,
      notStartedLevels,
      totalXpEarned,
      averageAccuracy,
      progressPercentage,
    },
  };
}

async function getTotalXp(userId) {
  const user = await prisma.users.findFirst({
    where: { id: userId, is_active: true },
    select: { total_xp: true },
  });
  if (!user) return { notFound: "USER_NOT_FOUND_ERROR" };
  return { data: Number(user.total_xp ?? 0) };
}

async function getCompletedLevelsCount(userId) {
  const rows = await prisma.user_progress.findMany({
    where: { user_id: userId, is_active: true },
    select: { status: true },
  });

  const completed = rows.filter((p) => isCompletedStatus(p.status)).length;
  return { data: completed };
}

module.exports = {
  getLevelProgress,
  getSectionProgress,
  getAllProgress,
  getSectionSummary,
  getTotalXp,
  getCompletedLevelsCount,

  // export helpers if needed elsewhere
  ProgressStatus,
  isCompletedStatus,
};
