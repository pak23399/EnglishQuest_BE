// src/routes/examAdmin.routes.js
const router = require("express").Router();
const prisma = require("../prisma");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/roles");
const { randomUUID } = require("crypto");

// ---------------- helpers ----------------
function toISO(d) {
  return d ? d.toISOString() : undefined;
}

function mapAdminExam(e) {
  return {
    id: e.id,
    title: e.title,
    description: e.description || "",
    durationMinutes: e.duration_minutes,
    passingScore: e.passing_score,
    xpReward: e.xp_reward,
    shuffleQuestions: e.shuffle_questions,
    shuffleOptions: e.shuffle_options,
    maxAttempts: e.max_attempts,
    scheduleStart: toISO(e.schedule_start),
    scheduleEnd: toISO(e.schedule_end),
    difficulty: e.difficulty,
    totalQuestions: e.total_questions,
    isActive: e.is_active,
    createdDate: toISO(e.created_date) || new Date().toISOString(),
    updatedDate: toISO(e.updated_date) || new Date().toISOString(),
    reviewSettings: e.review_settings || undefined,
  };
}

function mapExamListItem(e) {
  return {
    id: e.id,
    title: e.title,
    description: e.description || "",
    durationMinutes: e.duration_minutes,
    passingScore: e.passing_score,
    xpReward: e.xp_reward,
    difficulty: e.difficulty,
    scheduleStart: toISO(e.schedule_start),
    scheduleEnd: toISO(e.schedule_end),
    shuffleQuestions: e.shuffle_questions,
    shuffleOptions: e.shuffle_options,
    maxAttempts: e.max_attempts,
    totalQuestions: e.total_questions,
    isActive: e.is_active,
  };
}

function mapAdminExamQuestion(q) {
  return {
    id: q.id,
    text: q.text,
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correctAnswer: q.correct_answer,
    points: q.points,
    explanation: q.type_data?.explanation,
    order: q.order,
    isActive: q.is_active,
  };
}

function normalizeSchedule({ scheduleStart, scheduleEnd, clearSchedule }) {
  if (clearSchedule) {
    return { schedule_start: null, schedule_end: null };
  }
  return {
    schedule_start: scheduleStart ? new Date(scheduleStart) : undefined,
    schedule_end: scheduleEnd ? new Date(scheduleEnd) : undefined,
  };
}

// ---------------- middleware ----------------
const adminGuard = [auth, requireRole("Admin")];

// =========================
// CRUD Exam
// =========================

/**
 * POST /api/v1/exam-admin
 * Body: CreateExamRequest
 * Response: AdminExam
 */
router.post("/", ...adminGuard, async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      title,
      description,
      durationMinutes,
      passingScore,
      xpReward,
      shuffleQuestions,
      shuffleOptions,
      maxAttempts,
      scheduleStart,
      scheduleEnd,
      difficulty,
      reviewSettings,
    } = req.body || {};

    if (!title || typeof title !== "string") {
      return res.status(400).json({ message: "Invalid title" });
    }

    const now = new Date();

    const created = await prisma.exams.create({
      data: {
        id: randomUUID(),
        title: title.trim(),
        description: description || "",
        duration_minutes: Number(durationMinutes || 0),
        passing_score: Number(passingScore || 0),
        xp_reward: Number(xpReward || 0),
        difficulty: Number(difficulty || 0),
        shuffle_questions: !!shuffleQuestions,
        shuffle_options: !!shuffleOptions,
        max_attempts: Number(maxAttempts || 0),
        total_questions: 0, // sẽ cập nhật theo số câu hỏi thực tế
        is_active: true,
        review_settings: reviewSettings || null,
        ...normalizeSchedule({ scheduleStart, scheduleEnd, clearSchedule: false }),
        created_date: now,
        created_by: userId,
        updated_date: now,
        updated_by: userId,
      },
    });

    return res.json(mapAdminExam(created));
  } catch (err) {
    console.error("exam-admin create error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * PUT /api/v1/exam-admin
 * Body: UpdateExamRequest
 * Response: AdminExam
 */
router.put("/", ...adminGuard, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body || {};
    const id = String(data.id || "").trim();
    if (!id) return res.status(400).json({ message: "Missing exam id" });

    const existing = await prisma.exams.findFirst({
      where: { id, deleted_date: null },
    });
    if (!existing) return res.status(404).json({ message: "Exam not found" });

    const patch = {
      title: data.title !== undefined ? String(data.title).trim() : undefined,
      description: data.description !== undefined ? String(data.description) : undefined,
      duration_minutes: data.durationMinutes !== undefined ? Number(data.durationMinutes) : undefined,
      passing_score: data.passingScore !== undefined ? Number(data.passingScore) : undefined,
      xp_reward: data.xpReward !== undefined ? Number(data.xpReward) : undefined,
      shuffle_questions: data.shuffleQuestions !== undefined ? !!data.shuffleQuestions : undefined,
      shuffle_options: data.shuffleOptions !== undefined ? !!data.shuffleOptions : undefined,
      max_attempts: data.maxAttempts !== undefined ? Number(data.maxAttempts) : undefined,
      difficulty: data.difficulty !== undefined ? Number(data.difficulty) : undefined,
      review_settings: data.reviewSettings !== undefined ? (data.reviewSettings || null) : undefined,
      ...normalizeSchedule({
        scheduleStart: data.scheduleStart,
        scheduleEnd: data.scheduleEnd,
        clearSchedule: !!data.clearSchedule,
      }),
      updated_date: new Date(),
      updated_by: userId,
    };

    const updated = await prisma.exams.update({
      where: { id },
      data: patch,
    });

    return res.json(mapAdminExam(updated));
  } catch (err) {
    console.error("exam-admin update error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/v1/exam-admin/:examId
 * Response: AdminExam
 */
router.get("/:examId", ...adminGuard, async (req, res) => {
  try {
    const id = req.params.examId;
    const exam = await prisma.exams.findFirst({
      where: { id, deleted_date: null },
    });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    return res.json(mapAdminExam(exam));
  } catch (err) {
    console.error("exam-admin get error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * DELETE /api/v1/exam-admin/:examId
 * Response: boolean (FE không dùng, nhưng service typed boolean/void tuỳ)
 */
router.delete("/:examId", ...adminGuard, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.examId;

    // soft delete để an toàn
    await prisma.exams.update({
      where: { id },
      data: { deleted_date: new Date(), deleted_by: userId, is_active: false },
    });

    return res.json(true);
  } catch (err) {
    console.error("exam-admin delete error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * POST /api/v1/exam-admin/list
 * Body: ExamListRequest { page, limit, searchText?, difficulty?, isActive? }
 * Response: ExamListResponse { items, meta }
 */
router.post("/list", ...adminGuard, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.body.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.body.limit || 50)));
    const searchText = (req.body.searchText || "").trim();
    const difficulty = req.body.difficulty;
    const isActive = req.body.isActive;

    const where = {
      deleted_date: null,
      ...(searchText
        ? {
            OR: [
              { title: { contains: searchText, mode: "insensitive" } },
              { description: { contains: searchText, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(Number.isFinite(Number(difficulty)) ? { difficulty: Number(difficulty) } : {}),
      ...(typeof isActive === "boolean" ? { is_active: isActive } : {}),
    };

    const [totalItems, rows] = await Promise.all([
      prisma.exams.count({ where }),
      prisma.exams.findMany({
        where,
        orderBy: [{ created_date: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = rows.map(mapExamListItem);

    return res.json({
      items,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    });
  } catch (err) {
    console.error("exam-admin list error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * POST /api/v1/exam-admin/:examId/toggle-active
 * Response: AdminExam (FE ignore response, nhưng typed AdminExam)
 */
router.post("/:examId/toggle-active", ...adminGuard, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.examId;

    const exam = await prisma.exams.findFirst({
      where: { id, deleted_date: null },
    });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const updated = await prisma.exams.update({
      where: { id },
      data: {
        is_active: !exam.is_active,
        updated_date: new Date(),
        updated_by: userId,
      },
    });

    return res.json(mapAdminExam(updated));
  } catch (err) {
    console.error("exam-admin toggle error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// Questions management
// =========================

/**
 * POST /api/v1/exam-admin/:examId/questions
 * Body: AddExamQuestionsRequest { questions: CreateExamQuestionRequest[] }
 * Response: AdminExamQuestion[]
 */
router.post("/:examId/questions", ...adminGuard, async (req, res) => {
  try {
    const userId = req.user.id;
    const examId = req.params.examId;
    const { questions } = req.body || {};

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: "No questions provided" });
    }

    const exam = await prisma.exams.findFirst({ where: { id: examId, deleted_date: null } });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    // find current max order
    const maxOrderRow = await prisma.questions.aggregate({
      where: { exam_id: examId, deleted_date: null },
      _max: { order: true },
    });
    let nextOrder = (maxOrderRow._max.order || 0) + 1;

    const created = [];
    for (const q of questions) {
      if (!q?.text || !Array.isArray(q.options) || !q.correctAnswer) {
        return res.status(400).json({ message: "Invalid question payload" });
      }

      const order = q.order !== undefined ? Number(q.order) : nextOrder++;

      const row = await prisma.questions.create({
        data: {
          id: randomUUID(),
          exam_id: examId,
          level_id: null,
          type: 0, // nếu bạn có enum type riêng cho "exam MCQ", set lại cho đúng
          text: String(q.text),
          options: q.options,
          correct_answer: String(q.correctAnswer),
          points: Number(q.points || 1),
          difficulty: exam.difficulty,
          order,
          is_active: true,
          type_data: q.explanation ? { explanation: q.explanation } : null,
          created_date: new Date(),
          created_by: userId,
          updated_date: new Date(),
          updated_by: userId,
        },
      });
      created.push(row);
    }

    // update total_questions
    const total = await prisma.questions.count({ where: { exam_id: examId, deleted_date: null } });
    await prisma.exams.update({
      where: { id: examId },
      data: { total_questions: total, updated_date: new Date(), updated_by: userId },
    });

    // return created questions mapped
    return res.json(created.map(mapAdminExamQuestion).sort((a, b) => a.order - b.order));
  } catch (err) {
    console.error("exam-admin addQuestions error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * PUT /api/v1/exam-admin/questions/:questionId
 * Body: UpdateExamQuestionRequest
 * Response: AdminExamQuestion
 */
router.put("/questions/:questionId", ...adminGuard, async (req, res) => {
  try {
    const userId = req.user.id;
    const questionId = req.params.questionId;
    const data = req.body || {};

    const existing = await prisma.questions.findFirst({
      where: { id: questionId, deleted_date: null },
    });
    if (!existing) return res.status(404).json({ message: "Question not found" });
    if (!existing.exam_id) return res.status(400).json({ message: "Not an exam question" });

    const patch = {
      text: data.text !== undefined ? String(data.text) : undefined,
      options: data.options !== undefined ? data.options : undefined,
      correct_answer: data.correctAnswer !== undefined ? String(data.correctAnswer) : undefined,
      points: data.points !== undefined ? Number(data.points) : undefined,
      order: data.order !== undefined ? Number(data.order) : undefined,
      type_data:
        data.explanation !== undefined
          ? (data.explanation ? { ...(existing.type_data || {}), explanation: data.explanation } : null)
          : undefined,
      updated_date: new Date(),
      updated_by: userId,
    };

    const updated = await prisma.questions.update({
      where: { id: questionId },
      data: patch,
    });

    return res.json(mapAdminExamQuestion(updated));
  } catch (err) {
    console.error("exam-admin updateQuestion error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * DELETE /api/v1/exam-admin/questions/:questionId
 * Response: boolean
 */
router.delete("/questions/:questionId", ...adminGuard, async (req, res) => {
  try {
    const userId = req.user.id;
    const questionId = req.params.questionId;

    const q = await prisma.questions.findFirst({ where: { id: questionId, deleted_date: null } });
    if (!q) return res.status(404).json({ message: "Question not found" });
    if (!q.exam_id) return res.status(400).json({ message: "Not an exam question" });

    // soft delete
    await prisma.questions.update({
      where: { id: questionId },
      data: { deleted_date: new Date(), deleted_by: userId, is_active: false },
    });

    // update exam total_questions
    const total = await prisma.questions.count({ where: { exam_id: q.exam_id, deleted_date: null } });
    await prisma.exams.update({
      where: { id: q.exam_id },
      data: { total_questions: total, updated_date: new Date(), updated_by: userId },
    });

    return res.json(true);
  } catch (err) {
    console.error("exam-admin deleteQuestion error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/v1/exam-admin/:examId/questions
 * Response: AdminExamQuestion[]
 */
router.get("/:examId/questions", ...adminGuard, async (req, res) => {
  try {
    const examId = req.params.examId;

    const exam = await prisma.exams.findFirst({ where: { id: examId, deleted_date: null } });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const rows = await prisma.questions.findMany({
      where: { exam_id: examId, deleted_date: null },
      orderBy: { order: "asc" },
    });

    return res.json(rows.map(mapAdminExamQuestion));
  } catch (err) {
    console.error("exam-admin getExamQuestions error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * PUT /api/v1/exam-admin/:examId/questions/reorder
 * Body: ReorderQuestionsRequest { questionIds: string[] }
 * Response: boolean
 */
router.put("/:examId/questions/reorder", ...adminGuard, async (req, res) => {
  try {
    const userId = req.user.id;
    const examId = req.params.examId;
    const { questionIds } = req.body || {};

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ message: "questionIds is required" });
    }

    // Ensure all belong to this exam
    const found = await prisma.questions.findMany({
      where: { id: { in: questionIds }, exam_id: examId, deleted_date: null },
      select: { id: true },
    });

    if (found.length !== questionIds.length) {
      return res.status(400).json({ message: "Some questionIds are invalid for this exam" });
    }

    // Update order sequentially
    await prisma.$transaction(
      questionIds.map((id, idx) =>
        prisma.questions.update({
          where: { id },
          data: { order: idx + 1, updated_date: new Date(), updated_by: userId },
        })
      )
    );

    return res.json(true);
  } catch (err) {
    console.error("exam-admin reorder error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// Participants & Statistics
// =========================

/**
 * POST /api/v1/exam-admin/:examId/participants
 * Body: ExamParticipantsRequest
 * Response: ExamParticipantsResponse
 */
router.post("/:examId/participants", ...adminGuard, async (req, res) => {
  try {
    const examId = req.params.examId;
    const page = Math.max(1, Number(req.body.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.body.limit || 20)));
    const passed = req.body.passed;
    const sortBy = req.body.sortBy || "completedAt";
    const sortDesc = req.body.sortDesc !== false; // default true

    const orderByMap = {
      score: { score: sortDesc ? "desc" : "asc" },
      accuracy: { accuracy: sortDesc ? "desc" : "asc" },
      timeTakenSeconds: { time_taken_seconds: sortDesc ? "desc" : "asc" },
      completedAt: { completed_at: sortDesc ? "desc" : "asc" },
    };
    const orderBy = orderByMap[sortBy] || orderByMap.completedAt;

    const where = {
      exam_id: examId,
      deleted_date: null,
      ...(typeof passed === "boolean" ? { passed } : {}),
      completed_at: { not: null },
    };

    const [totalItems, rows] = await Promise.all([
      prisma.quiz_attempts.count({ where }),
      prisma.quiz_attempts.findMany({
        where,
        include: {
          users: { select: { id: true, username: true, full_name: true, avatar: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = rows.map((a) => ({
      attemptId: a.id,
      userId: a.user_id,
      userName: a.users?.full_name || a.users?.username || "Unknown",
      avatar: a.users?.avatar || undefined,
      score: a.score,
      totalQuestions: a.total_questions,
      correctAnswers: a.correct_answers,
      accuracy: a.accuracy,
      passed: a.passed,
      timeTakenSeconds: a.time_taken_seconds,
      completedAt: a.completed_at ? a.completed_at.toISOString() : new Date().toISOString(),
    }));

    return res.json({
      items,
      meta: {
        totalItems,
        currentPage: page,
      },
    });
  } catch (err) {
    console.error("exam-admin participants error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/v1/exam-admin/:examId/stats
 * Response: ExamStatistics
 */
router.get("/:examId/stats", ...adminGuard, async (req, res) => {
  try {
    const examId = req.params.examId;

    const exam = await prisma.exams.findFirst({ where: { id: examId, deleted_date: null } });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const attempts = await prisma.quiz_attempts.findMany({
      where: { exam_id: examId, deleted_date: null, completed_at: { not: null } },
      select: {
        score: true,
        accuracy: true,
        time_taken_seconds: true,
        passed: true,
      },
    });

    const totalAttempts = attempts.length;
    const passedCount = attempts.filter((a) => a.passed).length;
    const failedCount = totalAttempts - passedCount;

    const scores = attempts.map((a) => a.score);
    const accuracies = attempts.map((a) => a.accuracy);
    const times = attempts.map((a) => a.time_taken_seconds);

    const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

    const stats = {
      examId: exam.id,
      examTitle: exam.title,
      totalParticipants: await prisma.quiz_attempts.count({
        where: { exam_id: examId, deleted_date: null, completed_at: { not: null } },
        // distinct users:
        // Prisma distinct works with findMany; easiest is raw, but keep simple:
      }),
      totalAttempts,
      passedCount,
      failedCount,
      passRate: totalAttempts ? passedCount / totalAttempts : 0,
      averageScore: avg(scores),
      averageAccuracy: avg(accuracies),
      averageTimeTakenSeconds: avg(times),
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
    };

    return res.json(stats);
  } catch (err) {
    console.error("exam-admin stats error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/v1/exam-admin/attempts/:attemptId
 * Response: ParticipantAttemptDetail
 */
router.get("/attempts/:attemptId", ...adminGuard, async (req, res) => {
  try {
    const attemptId = req.params.attemptId;

    const attempt = await prisma.quiz_attempts.findFirst({
      where: { id: attemptId, deleted_date: null },
      include: {
        exams: true,
        users: { select: { id: true, username: true, full_name: true } },
        quiz_sessions: true,
      },
    });

    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (!attempt.exam_id || !attempt.exams) return res.status(400).json({ message: "Not an exam attempt" });

    // Get question order from session.question_ids if possible
    const qIds = Array.isArray(attempt.quiz_sessions?.question_ids)
      ? attempt.quiz_sessions.question_ids
      : [];

    // Submitted answers stored in attempt.answers (Json)
    const answersObj =
      attempt.answers && attempt.answers.answers ? attempt.answers.answers : attempt.answers || {};

    const orderedIds = qIds.length ? qIds : Object.keys(answersObj);

    const questions = await prisma.questions.findMany({
      where: { id: { in: orderedIds }, deleted_date: null },
      select: { id: true, text: true, options: true, correct_answer: true, order: true, type_data: true },
    });
    const map = new Map(questions.map((q) => [q.id, q]));

    const answers = orderedIds
      .map((qid, idx) => {
        const q = map.get(qid);
        if (!q) return null;

        const userAnswer = typeof answersObj[qid] === "string" ? answersObj[qid] : "";
        const correctAnswer = q.correct_answer;
        const isCorrect = userAnswer === correctAnswer;

        return {
          questionId: qid,
          questionOrder: idx + 1,
          questionText: q.text,
          options: Array.isArray(q.options) ? q.options.map(String) : [],
          userAnswer,
          correctAnswer,
          isCorrect,
          explanation: q.type_data?.explanation,
        };
      })
      .filter(Boolean);

    return res.json({
      attemptId: attempt.id,
      examId: attempt.exam_id,
      examTitle: attempt.exams.title,
      userId: attempt.user_id,
      userName: attempt.users?.full_name || attempt.users?.username || "Unknown",
      score: attempt.score,
      totalQuestions: attempt.total_questions,
      correctAnswers: attempt.correct_answers,
      accuracy: attempt.accuracy,
      passed: attempt.passed,
      timeTakenSeconds: attempt.time_taken_seconds,
      startedAt: attempt.started_at.toISOString(),
      completedAt: attempt.completed_at ? attempt.completed_at.toISOString() : new Date().toISOString(),
      answers,
    });
  } catch (err) {
    console.error("exam-admin attempt detail error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// Import Questions
// =========================

/**
 * POST /api/v1/exam-admin/:examId/import
 * Body: ImportQuestionsRequest { replaceExisting, questions:[{text, options, correctAnswer, explanation?}] }
 * Response: ImportQuestionsResponse
 */
router.post("/:examId/import", ...adminGuard, async (req, res) => {
  try {
    const userId = req.user.id;
    const examId = req.params.examId;
    const { replaceExisting, questions } = req.body || {};

    if (!Array.isArray(questions)) {
      return res.status(400).json({ message: "questions must be an array" });
    }

    const exam = await prisma.exams.findFirst({ where: { id: examId, deleted_date: null } });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const errors = [];
    let importedCount = 0;
    let failedCount = 0;

    await prisma.$transaction(async (tx) => {
      if (replaceExisting) {
        // soft delete existing exam questions
        await tx.questions.updateMany({
          where: { exam_id: examId, deleted_date: null },
          data: { deleted_date: new Date(), deleted_by: userId, is_active: false },
        });
      }

      // compute next order
      const maxOrderRow = await tx.questions.aggregate({
        where: { exam_id: examId, deleted_date: null },
        _max: { order: true },
      });
      let nextOrder = (maxOrderRow._max.order || 0) + 1;

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        try {
          if (!q?.text || !Array.isArray(q.options) || !q.correctAnswer) {
            throw new Error(`Invalid question at index ${i}`);
          }

          await tx.questions.create({
            data: {
              id: randomUUID(),
              exam_id: examId,
              level_id: null,
              type: 0,
              text: String(q.text),
              options: q.options,
              correct_answer: String(q.correctAnswer),
              points: 1,
              difficulty: exam.difficulty,
              order: nextOrder++,
              is_active: true,
              type_data: q.explanation ? { explanation: q.explanation } : null,
              created_date: new Date(),
              created_by: userId,
              updated_date: new Date(),
              updated_by: userId,
            },
          });

          importedCount++;
        } catch (e) {
          failedCount++;
          errors.push(String(e?.message || e));
        }
      }

      const totalQuestions = await tx.questions.count({ where: { exam_id: examId, deleted_date: null } });
      await tx.exams.update({
        where: { id: examId },
        data: { total_questions: totalQuestions, updated_date: new Date(), updated_by: userId },
      });
    });

    const totalQuestions = await prisma.questions.count({ where: { exam_id: examId, deleted_date: null } });

    return res.json({
      importedCount,
      failedCount,
      totalQuestions,
      errors,
      isSuccess: failedCount === 0,
    });
  } catch (err) {
    console.error("exam-admin import error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
