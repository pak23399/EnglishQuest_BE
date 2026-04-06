// // progress.routes.js
// const express = require("express");
// const prisma = require("../prisma");
// const auth = require("../middlewares/auth");

// const router = express.Router();

// function toIso(d) {
//   return d ? new Date(d).toISOString() : null;
// }

// /**
//  * Best-effort mapping for progress.status (int) -> string (API doc expects string)
//  * You can adjust these numbers if your DB uses different enum values.
//  */
// function statusToString(statusInt, completedAt) {
//   if (completedAt) return "Completed";
//   switch (statusInt) {
//     case 2:
//       return "Completed";
//     case 1:
//       return "InProgress";
//     case 0:
//       return "NotStarted";
//     default:
//       // fall back: treat any unknown but has attempts as InProgress later
//       return "NotStarted";
//   }
// }

// function getStatsSafe(stats) {
//   const s = stats && typeof stats === "object" ? stats : {};
//   return {
//     totalAttempts: Number(s.totalAttempts ?? 0),
//     bestScore: Number(s.bestScore ?? 0),
//     bestAccuracy: Number(s.bestAccuracy ?? 0),
//     totalXpEarned: Number(s.totalXpEarned ?? 0),
//     firstAttemptAt: s.firstAttemptAt ? new Date(s.firstAttemptAt).toISOString() : null,
//     bestAttemptAt: s.bestAttemptAt ? new Date(s.bestAttemptAt).toISOString() : null,
//   };
// }

// function calcProgressPercentage(progressRow) {
//   // Doc shows 100 when completed. If not completed, doc doesn't define granular formula.
//   // We do a simple best-effort:
//   if (progressRow?.completed_at) return 100;
//   const stats = getStatsSafe(progressRow?.stats);
//   if (stats.totalAttempts > 0) return 50;
//   return 0;
// }

// async function computeIsUnlocked({ userId, level }) {
//   // level.prerequisite_ids is JSON array of level UUIDs
//   const prereqIdsRaw = level?.prerequisite_ids;
//   const prereqIds = Array.isArray(prereqIdsRaw) ? prereqIdsRaw : [];

//   if (prereqIds.length === 0) return true;

//   const prereqProgress = await prisma.user_progress.findMany({
//     where: {
//       user_id: userId,
//       level_id: { in: prereqIds },
//       is_active: true,
//     },
//     select: {
//       level_id: true,
//       status: true,
//       completed_at: true,
//       stats: true,
//     },
//   });

//   // Completed if completed_at exists OR mapped status == Completed
//   const completedSet = new Set(
//     prereqProgress
//       .filter((p) => statusToString(p.status, p.completed_at) === "Completed")
//       .map((p) => p.level_id)
//   );

//   return prereqIds.every((id) => completedSet.has(id));
// }

// function mapLevelProgressResponse({ userId, level, progressRow }) {
//   // If no progress row exists, return a default object but still match API response shape.
//   const stats = getStatsSafe(progressRow?.stats);
//   const status = progressRow ? statusToString(progressRow.status, progressRow.completed_at) : "NotStarted";

//   // If status unknown but has attempts, treat as InProgress
//   const statusFinal =
//     status === "NotStarted" && stats.totalAttempts > 0 && !progressRow?.completed_at ? "InProgress" : status;

//   return {
//     id: progressRow?.id ?? null,
//     userId,
//     levelId: level.id,
//     sectionId: level.section_id,
//     status: statusFinal,
//     stats,
//     lastAttemptAt: toIso(progressRow?.last_attempt_at) ?? null,
//     completedAt: toIso(progressRow?.completed_at) ?? null,
//     progressPercentage: calcProgressPercentage(progressRow),
//     // isUnlocked is computed outside (async) to match doc behavior
//   };
// }

// // ---------------------------------------------------------
// // 4) GET /api/v1/progress/section/{sectionId}/summary
// // NOTE: put before /section/:sectionId to avoid any ambiguity.
// // ---------------------------------------------------------
// router.get("/section/:sectionId/summary", auth, async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const sectionId = req.params.sectionId;

//     const section = await prisma.sections.findFirst({
//       where: { id: sectionId, is_active: true },
//       select: { id: true, title: true },
//     });

//     if (!section) return res.status(404).json({ message: "SECTION_NOT_FOUND" });

//     const levels = await prisma.levels.findMany({
//       where: { section_id: sectionId, is_active: true },
//       select: { id: true },
//       orderBy: { order: "asc" },
//     });

//     const levelIds = levels.map((l) => l.id);
//     const totalLevels = levelIds.length;

//     const progressRows = await prisma.user_progress.findMany({
//       where: { user_id: userId, level_id: { in: levelIds }, is_active: true },
//       select: { level_id: true, status: true, completed_at: true, stats: true },
//     });

//     let completedLevels = 0;
//     let inProgressLevels = 0;
//     let notStartedLevels = 0;

//     // total XP earned in this section: sum stats.totalXpEarned
//     let totalXpEarned = 0;

//     // averageAccuracy: average bestAccuracy among levels with attempts (>0)
//     let accSum = 0;
//     let accCount = 0;

//     const progressByLevel = new Map(progressRows.map((p) => [p.level_id, p]));

//     for (const lvlId of levelIds) {
//       const p = progressByLevel.get(lvlId);
//       const stats = getStatsSafe(p?.stats);
//       const s = p ? statusToString(p.status, p.completed_at) : "NotStarted";

//       totalXpEarned += Number(stats.totalXpEarned ?? 0);

//       if (stats.totalAttempts > 0) {
//         accSum += Number(stats.bestAccuracy ?? 0);
//         accCount += 1;
//       }

//       if (s === "Completed") completedLevels += 1;
//       else if (stats.totalAttempts > 0 || s === "InProgress") inProgressLevels += 1;
//       else notStartedLevels += 1;
//     }

//     const averageAccuracy = accCount > 0 ? Number((accSum / accCount).toFixed(2)) : 0;
//     const progressPercentage = totalLevels > 0 ? Number(((completedLevels / totalLevels) * 100).toFixed(1)) : 0;

//     return res.json({
//       sectionId: section.id,
//       sectionTitle: section.title,
//       totalLevels,
//       completedLevels,
//       inProgressLevels,
//       notStartedLevels,
//       totalXpEarned,
//       averageAccuracy,
//       progressPercentage,
//     });
//   } catch (e) {
//     console.error(e);
//     return res.status(500).json({ message: "Server error" });
//   }
// });

// // ---------------------------------------------------------
// // 5) GET /api/v1/progress/stats/xp
// // ---------------------------------------------------------
// router.get("/stats/xp", auth, async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const user = await prisma.users.findFirst({
//       where: { id: userId, is_active: true },
//       select: { total_xp: true },
//     });

//     if (!user) return res.status(404).json({ message: "USER_NOT_FOUND_ERROR" });

//     // API doc: returns a number
//     return res.json(Number(user.total_xp ?? 0));
//   } catch (e) {
//     console.error(e);
//     return res.status(500).json({ message: "Server error" });
//   }
// });

// // ---------------------------------------------------------
// // 6) GET /api/v1/progress/stats/completed-levels
// // ---------------------------------------------------------
// router.get("/stats/completed-levels", auth, async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const rows = await prisma.user_progress.findMany({
//       where: { user_id: userId, is_active: true },
//       select: { status: true, completed_at: true, stats: true },
//     });

//     const completed = rows.filter((p) => statusToString(p.status, p.completed_at) === "Completed").length;

//     // API doc: returns a number
//     return res.json(completed);
//   } catch (e) {
//     console.error(e);
//     return res.status(500).json({ message: "Server error" });
//   }
// });

// // ---------------------------------------------------------
// // 1) GET /api/v1/progress/level/{levelId}
// // ---------------------------------------------------------
// router.get("/level/:levelId", auth, async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const levelId = req.params.levelId;

//     const level = await prisma.levels.findFirst({
//       where: { id: levelId, is_active: true },
//       select: { id: true, section_id: true, prerequisite_ids: true },
//     });

//     if (!level) return res.status(404).json({ message: "LEVEL_NOT_FOUND" });

//     const progressRow = await prisma.user_progress.findFirst({
//       where: { user_id: userId, level_id: levelId, is_active: true },
//       select: {
//         id: true,
//         user_id: true,
//         section_id: true,
//         level_id: true,
//         status: true,
//         started_at: true,
//         completed_at: true,
//         last_attempt_at: true,
//         stats: true,
//       },
//     });

//     const base = mapLevelProgressResponse({ userId, level, progressRow });
//     const isUnlocked = await computeIsUnlocked({ userId, level });

//     return res.json({ ...base, isUnlocked });
//   } catch (e) {
//     console.error(e);
//     return res.status(500).json({ message: "Server error" });
//   }
// });

// // ---------------------------------------------------------
// // 2) GET /api/v1/progress/section/{sectionId}
// // ---------------------------------------------------------
// router.get("/section/:sectionId", auth, async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const sectionId = req.params.sectionId;

//     const levels = await prisma.levels.findMany({
//       where: { section_id: sectionId, is_active: true },
//       select: { id: true },
//       orderBy: { order: "asc" },
//     });

//     const levelIds = levels.map((l) => l.id);

//     // If section has no levels, return empty array as per doc style
//     if (levelIds.length === 0) return res.json([]);

//     const progressRows = await prisma.user_progress.findMany({
//       where: { user_id: userId, level_id: { in: levelIds }, is_active: true },
//       select: {
//         id: true,
//         level_id: true,
//         status: true,
//         completed_at: true,
//         last_attempt_at: true,
//         stats: true,
//       },
//       orderBy: [{ updated_date: "desc" }, { created_date: "desc" }],
//     });

//     // Doc response for section: array items include {id, levelId, status, stats{bestScore,bestAccuracy,totalAttempts}, progressPercentage}
//     const result = progressRows.map((p) => {
//       const stats = getStatsSafe(p.stats);
//       return {
//         id: p.id,
//         levelId: p.level_id,
//         status:
//           statusToString(p.status, p.completed_at) === "NotStarted" && stats.totalAttempts > 0 && !p.completed_at
//             ? "InProgress"
//             : statusToString(p.status, p.completed_at),
//         stats: {
//           bestScore: stats.bestScore,
//           bestAccuracy: stats.bestAccuracy,
//           totalAttempts: stats.totalAttempts,
//         },
//         progressPercentage: calcProgressPercentage(p),
//       };
//     });

//     return res.json(result);
//   } catch (e) {
//     console.error(e);
//     return res.status(500).json({ message: "Server error" });
//   }
// });

// // ---------------------------------------------------------
// // 3) GET /api/v1/progress/all
// // ---------------------------------------------------------
// router.get("/all", auth, async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const rows = await prisma.user_progress.findMany({
//       where: {
//         user_id: userId,
//         is_active: true,
//       },
//       orderBy: [{ updated_date: "desc" }, { created_date: "desc" }],
//       select: {
//         id: true,
//         user_id: true,
//         section_id: true,
//         level_id: true,
//         status: true,
//         started_at: true,
//         completed_at: true,
//         last_attempt_at: true,
//         stats: true,
//       },
//     });

//     // API doc: Array of objects same structure as Get Level Progress
//     // We'll compute isUnlocked per item based on level prerequisites.
//     const levelIds = [...new Set(rows.map((r) => r.level_id))];
//     const levels = await prisma.levels.findMany({
//       where: { id: { in: levelIds }, is_active: true },
//       select: { id: true, section_id: true, prerequisite_ids: true },
//     });
//     const levelMap = new Map(levels.map((l) => [l.id, l]));

//     const result = [];
//     for (const p of rows) {
//       const level = levelMap.get(p.level_id);
//       // if level missing (deleted/inactive), still return but isUnlocked=false
//       const stats = getStatsSafe(p.stats);
//       const status =
//         statusToString(p.status, p.completed_at) === "NotStarted" && stats.totalAttempts > 0 && !p.completed_at
//           ? "InProgress"
//           : statusToString(p.status, p.completed_at);

//       let isUnlocked = false;
//       if (level) isUnlocked = await computeIsUnlocked({ userId, level });

//       result.push({
//         id: p.id,
//         userId: p.user_id,
//         levelId: p.level_id,
//         sectionId: p.section_id,
//         status,
//         stats,
//         lastAttemptAt: toIso(p.last_attempt_at),
//         completedAt: toIso(p.completed_at),
//         progressPercentage: calcProgressPercentage(p),
//         isUnlocked,
//       });
//     }

//     return res.json(result);
//   } catch (e) {
//     console.error(e);
//     return res.status(500).json({ message: "Server error" });
//   }
// });

// module.exports = router;


// src/routes/progress.routes.js
const express = require("express");
const auth = require("../middlewares/auth");
const progressController = require("../controllers/progress.controller");

const router = express.Router();

/**
 * Base path: /api/v1/progress
 * Spec:
 * - GET /level/{levelId} :contentReference[oaicite:6]{index=6}
 * - GET /section/{sectionId} :contentReference[oaicite:7]{index=7}
 * - GET /all :contentReference[oaicite:8]{index=8}
 * - GET /section/{sectionId}/summary (doc phần sau)
 * - GET /stats/xp, /stats/completed-levels (doc phần sau)
 */

// đặt summary trước để tránh xung đột với /section/:sectionId
router.get("/section/:sectionId/summary", auth, progressController.getSectionSummary);

router.get("/stats/xp", auth, progressController.getTotalXp);
router.get("/stats/completed-levels", auth, progressController.getCompletedLevelsCount);

router.get("/level/:levelId", auth, progressController.getLevelProgress);
router.get("/section/:sectionId", auth, progressController.getSectionProgress);
router.get("/all", auth, progressController.getAllProgress);

module.exports = router;
