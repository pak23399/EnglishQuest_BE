// src/routes/exam.routes.js
const router = require("express").Router();
const prisma = require("../prisma");
const auth = require("../middlewares/auth");
const { randomUUID } = require("crypto");

// --- helpers ---
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toISO(d) {
  return d ? d.toISOString() : null;
}

function parseJsonArray(x) {
  return Array.isArray(x) ? x : [];
}

function parseOptionsJson(q) {
  // questions.options is Json? -> expected string[]
  if (Array.isArray(q.options)) return q.options.map(String);
  return [];
}

function canReviewNow(exam, attemptCompletedAt) {
  const rs = exam.review_settings || {};
  const allowReview = rs.allowReview !== false; // default true
  if (!allowReview) return { ok: false, reason: "Review disabled" };

  const afterMin = Number(rs.reviewAvailableAfterMinutes || 0);
  if (!attemptCompletedAt) return { ok: false, reason: "Not completed" };

  const availableAt = new Date(attemptCompletedAt.getTime() + afterMin * 60 * 1000);
  if (Date.now() < availableAt.getTime()) {
    return { ok: false, reason: "Review not yet available" };
  }
  return { ok: true, rs };
}

/**
 * POST /api/v1/exam/start
 * Body: { examId }
 * Response: ExamSession
 */
router.post("/start", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const examId = String(req.body.examId || "").trim();
    if (!examId) return res.status(400).json({ message: "Missing examId" });

    const exam = await prisma.exams.findFirst({
      where: { id: examId, deleted_date: null, is_active: true },
    });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    // Resume existing active session if exists
    const activeSession = await prisma.quiz_sessions.findFirst({
      where: {
        user_id: userId,
        exam_id: examId,
        is_active: true,
        completed_at: null,
        deleted_date: null,
      },
      orderBy: { started_at: "desc" },
    });

    // load questions for exam
    let questions = await prisma.questions.findMany({
      where: {
        exam_id: examId,
        is_active: true,
        deleted_date: null,
      },
      select: {
        id: true,
        text: true,
        options: true,
        points: true,
        order: true,
        correct_answer: true, // used later in submit/result/review
      },
      orderBy: { order: "asc" },
    });

    // limit to exam.total_questions if needed
    if (Number.isFinite(exam.total_questions) && exam.total_questions > 0) {
      questions = questions.slice(0, exam.total_questions);
    }

    // shuffle question order if exam.shuffle_questions
    if (exam.shuffle_questions) questions = shuffle(questions);

    const questionIds = questions.map((q) => q.id);

    // If resume, keep original question_ids ordering stored in session
    let session = activeSession;
    let isResumed = false;
    let savedAnswers = undefined;

    if (session) {
      isResumed = true;
      const storedQids = parseJsonArray(session.question_ids);
      if (storedQids.length > 0) {
        // reorder questions based on stored ids
        const map = new Map(questions.map((q) => [q.id, q]));
        const ordered = storedQids.map((id) => map.get(id)).filter(Boolean);
        questions = ordered;
      }
      if (session.answers && typeof session.answers === "object") {
        // FE expects Record<string,string>
        savedAnswers = session.answers.answers || session.answers || undefined;
        // if you stored {answers, sequenceNumber, savedAt} this still works
      }
    } else {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + exam.duration_minutes * 60 * 1000);

      session = await prisma.quiz_sessions.create({
        data: {
          id: randomUUID(),
          user_id: userId,
          level_id: null,
          exam_id: examId,
          status: 0, // Active
          hearts_remaining: 0,
          current_question_index: 0,
          started_at: now,
          expires_at: expiresAt,
          question_ids: questionIds,
          answers: { answers: {}, sequenceNumber: 0, savedAt: now.toISOString() },
          is_active: true,
        },
      });
    }

    // shuffle options if exam.shuffle_options
    const mappedQuestions = questions.map((q, idx) => {
      let opts = parseOptionsJson(q);
      if (exam.shuffle_options) opts = shuffle(opts);
      return {
        id: q.id,
        text: q.text,
        options: opts,
        points: q.points,
        order: idx + 1, // FE uses order to show numbering
      };
    });

    return res.json({
      sessionId: session.id,
      startedAt: toISO(session.started_at),
      expiresAt: toISO(session.expires_at),
      durationMinutes: exam.duration_minutes,
      totalQuestions: mappedQuestions.length,
      questions: mappedQuestions,
      savedAnswers,
      isResumed,
    });
  } catch (err) {
    console.error("exam/start error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * POST /api/v1/exam/sessions/:sessionId/autosave
 * Body: { answers: Record<string,string>, sequenceNumber: number }
 * Response: AutosaveResponse { savedAt, sequenceNumber, answerCount }
 */
router.post("/sessions/:sessionId/autosave", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = req.params.sessionId;

    const { answers, sequenceNumber } = req.body || {};
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ message: "Invalid answers" });
    }

    const session = await prisma.quiz_sessions.findFirst({
      where: {
        id: sessionId,
        user_id: userId,
        is_active: true,
        deleted_date: null,
      },
    });
    if (!session) return res.status(404).json({ message: "Session not found" });

    const savedAt = new Date().toISOString();
    const seq = Number(sequenceNumber || 0);
    const answerCount = Object.keys(answers).length;

    await prisma.quiz_sessions.update({
      where: { id: sessionId },
      data: {
        answers: { answers, sequenceNumber: seq, savedAt },
        updated_date: new Date(),
        updated_by: userId,
      },
    });

    return res.json({ savedAt, sequenceNumber: seq, answerCount });
  } catch (err) {
    console.error("exam/autosave error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * POST /api/v1/exam/sessions/:sessionId/submit
 * Header: Idempotency-Key (optional)
 * Body: { answers: Record<string,string> }
 * Response: SubmitExamResponse { submissionId, status, message }
 */
router.post("/sessions/:sessionId/submit", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = req.params.sessionId;
    const idempotencyKey = req.headers["idempotency-key"]; // FE sends this

    const { answers } = req.body || {};
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ message: "Invalid answers" });
    }

    const session = await prisma.quiz_sessions.findFirst({
      where: { id: sessionId, user_id: userId, deleted_date: null },
    });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (!session.exam_id) return res.status(400).json({ message: "Not an exam session" });

    // OPTIONAL: idempotency - if already submitted, return existing attempt
    if (idempotencyKey) {
      const existing = await prisma.quiz_attempts.findFirst({
        where: {
          session_id: sessionId,
          user_id: userId,
          deleted_date: null,
          // You can store idempotencyKey in answers json if you want
        },
        orderBy: { created_date: "desc" },
      });
      if (existing && existing.completed_at) {
        return res.json({
          submissionId: existing.id,
          status: "Completed",
          message: "Already submitted",
        });
      }
    }

    const exam = await prisma.exams.findFirst({
      where: { id: session.exam_id, deleted_date: null },
    });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const qIds = parseJsonArray(session.question_ids);
    const questions = await prisma.questions.findMany({
      where: { id: { in: qIds }, deleted_date: null },
      select: {
        id: true,
        text: true,
        correct_answer: true,
        points: true,
        order: true,
      },
    });

    const questionById = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = qIds.map((id) => questionById.get(id)).filter(Boolean);

    const totalQuestions = orderedQuestions.length;
    let correctAnswers = 0;

    for (const q of orderedQuestions) {
      const userAns = answers[q.id];
      if (typeof userAns === "string" && userAns === q.correct_answer) correctAnswers++;
    }

    const accuracy = totalQuestions === 0 ? 0 : correctAnswers / totalQuestions;
    const score = Math.round(accuracy * 100);
    const passed = score >= exam.passing_score;

    const now = new Date();
    const startedAt = session.started_at || now;
    const timeTakenSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
    const xpEarned = passed ? exam.xp_reward : 0;

    const attemptId = randomUUID();

    await prisma.quiz_attempts.create({
      data: {
        id: attemptId,
        user_id: userId,
        level_id: null,
        section_id: null,
        session_id: sessionId,
        exam_id: exam.id,
        score,
        total_questions: totalQuestions,
        correct_answers: correctAnswers,
        accuracy,
        passed,
        hearts_used: 0,
        xp_earned: xpEarned,
        streak_earned: false,
        started_at: startedAt,
        completed_at: now,
        time_taken_seconds: timeTakenSeconds,
        status: 1, // Completed (your system uses Int)
        answers: { answers }, // keep submitted answers
        is_active: true,
      },
    });

    await prisma.quiz_sessions.update({
      where: { id: sessionId },
      data: {
        status: 1, // Completed
        completed_at: now,
        is_active: false,
        answers: { answers, sequenceNumber: 999999, savedAt: now.toISOString() },
      },
    });

    return res.json({
      submissionId: attemptId,
      status: "Completed",
      message: "Exam submitted and graded.",
    });
  } catch (err) {
    console.error("exam/submit error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/v1/exam/submissions/:submissionId
 * Response: ExamResult
 */
router.get("/submissions/:submissionId", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const submissionId = req.params.submissionId;

    const attempt = await prisma.quiz_attempts.findFirst({
      where: { id: submissionId, user_id: userId, deleted_date: null },
      include: { exams: true },
    });
    if (!attempt) return res.status(404).json({ message: "Submission not found" });
    if (!attempt.exam_id) return res.status(400).json({ message: "Not an exam submission" });

    const answersObj = (attempt.answers && attempt.answers.answers) ? attempt.answers.answers : (attempt.answers || {});
    const qIds = Object.keys(answersObj);

    // Better: load from the session's question_ids to preserve order
    let orderedIds = [];
    if (attempt.session_id) {
      const session = await prisma.quiz_sessions.findUnique({ where: { id: attempt.session_id } });
      orderedIds = parseJsonArray(session?.question_ids);
    }
    if (orderedIds.length === 0) orderedIds = qIds;

    const questions = await prisma.questions.findMany({
      where: { id: { in: orderedIds }, deleted_date: null },
      select: {
        id: true,
        text: true,
        correct_answer: true,
        points: true,
      },
    });
    const qb = new Map(questions.map((q) => [q.id, q]));

    const questionResults = orderedIds
      .map((qid) => {
        const q = qb.get(qid);
        if (!q) return null;

        const userAnswer = (answersObj && typeof answersObj[qid] === "string") ? answersObj[qid] : "";
        const isCorrect = userAnswer === q.correct_answer;
        return {
          questionId: qid,
          questionText: q.text,
          userAnswer,
          correctAnswer: q.correct_answer,
          isCorrect,
          points: isCorrect ? q.points : 0,
          timeSpentSeconds: 0, // not tracked in DB
        };
      })
      .filter(Boolean);

    return res.json({
      sessionId: attempt.session_id || "",
      score: attempt.score,
      totalQuestions: attempt.total_questions,
      correctAnswers: attempt.correct_answers,
      accuracy: attempt.accuracy,
      passed: attempt.passed,
      timeTakenSeconds: attempt.time_taken_seconds,
      completedAt: toISO(attempt.completed_at) || toISO(new Date()),
      xpEarned: attempt.xp_earned,
      questionResults,
    });
  } catch (err) {
    console.error("exam/submissions error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/v1/exam/history
 * Response: ExamHistoryItem[]
 */
router.get("/history", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const attempts = await prisma.quiz_attempts.findMany({
      where: {
        user_id: userId,
        exam_id: { not: null },
        deleted_date: null,
      },
      include: { exams: true },
      orderBy: { completed_at: "desc" },
      take: 200,
    });

    const items = attempts.map((a) => {
      const exam = a.exams;
      const reviewCheck = exam ? canReviewNow(exam, a.completed_at) : { ok: false };
      return {
        attemptId: a.id,
        examId: a.exam_id,
        examTitle: exam?.title || "Unknown",
        score: a.score,
        accuracy: a.accuracy,
        passed: a.passed,
        timeTakenSeconds: a.time_taken_seconds,
        completedAt: toISO(a.completed_at) || toISO(new Date()),
        canReview: !!reviewCheck.ok,
        xpEarned: a.xp_earned,
      };
    });

    return res.json(items);
  } catch (err) {
    console.error("exam/history error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/v1/exam/attempts/:attemptId/review
 * Response: ExamReview (respects review_settings)
 */
router.get("/attempts/:attemptId/review", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const attemptId = req.params.attemptId;

    const attempt = await prisma.quiz_attempts.findFirst({
      where: { id: attemptId, user_id: userId, deleted_date: null },
      include: { exams: true },
    });
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (!attempt.exam_id || !attempt.exams) return res.status(400).json({ message: "Not an exam attempt" });

    const exam = attempt.exams;
    const review = canReviewNow(exam, attempt.completed_at);
    if (!review.ok) return res.status(403).json({ message: review.reason });

    const rs = review.rs || {};
    const showUserAnswers = rs.showUserAnswers !== false; // default true
    const showPassFail = rs.showPassFail !== false;       // default true

    // Load questions in order (session question_ids preferred)
    let orderedIds = [];
    if (attempt.session_id) {
      const session = await prisma.quiz_sessions.findUnique({ where: { id: attempt.session_id } });
      orderedIds = parseJsonArray(session?.question_ids);
    }

    const answersObj = (attempt.answers && attempt.answers.answers) ? attempt.answers.answers : (attempt.answers || {});
    if (orderedIds.length === 0) orderedIds = Object.keys(answersObj);

    const questions = await prisma.questions.findMany({
      where: { id: { in: orderedIds }, deleted_date: null },
      select: { id: true, text: true, options: true, correct_answer: true },
    });
    const qb = new Map(questions.map((q) => [q.id, q]));

    const answers = orderedIds
      .map((qid, idx) => {
        const q = qb.get(qid);
        if (!q) return null;

        const userAnswerRaw = (answersObj && typeof answersObj[qid] === "string") ? answersObj[qid] : null;
        const userAnswer = showUserAnswers ? userAnswerRaw : null;
        const isCorrect = userAnswerRaw === q.correct_answer;

        return {
          questionId: qid,
          questionOrder: idx + 1,
          questionText: q.text,
          options: parseOptionsJson(q),
          userAnswer,
          correctAnswer: q.correct_answer,
          isCorrect,
        };
      })
      .filter(Boolean);

    return res.json({
      attemptId: attempt.id,
      examId: exam.id,
      examTitle: exam.title,
      score: attempt.score,
      totalQuestions: attempt.total_questions,
      correctAnswers: attempt.correct_answers,
      accuracy: attempt.accuracy,
      passed: showPassFail ? attempt.passed : null,
      timeTakenSeconds: attempt.time_taken_seconds,
      completedAt: toISO(attempt.completed_at) || toISO(new Date()),
      answers,
    });
  } catch (err) {
    console.error("exam/review error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
