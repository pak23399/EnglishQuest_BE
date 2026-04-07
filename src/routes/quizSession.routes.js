const router = require("express").Router();
const prisma = require("../prisma");
const auth = require("../middlewares/auth");
const { randomUUID } = require("crypto");
const { QuizSessionStatus } = require("../constants/quizSession");

function mapQuizSession(s) {
  if (!s) return null;
  const qIds = Array.isArray(s.question_ids) ? s.question_ids : [];
  return {
    id: s.id,
    userId: s.user_id,
    levelId: s.level_id,                 // ✅ FE dùng levelId
    status: s.status,
    heartsRemaining: s.hearts_remaining, // ✅ FE hay dùng heartsRemaining
    currentQuestionIndex: s.current_question_index,
    totalQuestions: qIds.length,
    startedAt: s.started_at,
    completedAt: s.completed_at,
    expiresAt: s.expires_at,
    isActive: s.is_active,
  };
}
/**
 * POST /api/v1/quiz-session/start/{levelId}
 * Body: optional { questionCount }
 */
router.post("/start/:levelId", auth, async (req, res) => {
  try {
    const levelId = req.params.levelId;
    const userId = req.user.id;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { hearts: true },
    });

    // ✅ schema questions: có field "order" (không có order_index)
    // ✅ schema questions: có field "text" (không có content)
    const questions = await prisma.questions.findMany({
      where: { level_id: levelId, is_active: true },
      select: { id: true },
      orderBy: { order: "asc" },
    });

    const qIds = questions.map(q => q.id);

    const session = await prisma.quiz_sessions.create({
      data: {
        id: randomUUID(), // ✅ PK bắt buộc
        user_id: userId,
        level_id: levelId,
        status: QuizSessionStatus.Active,     // ✅ Int
        hearts_remaining: user?.hearts ?? 5,
        current_question_index: 0,
        started_at: now,
        expires_at: expiresAt,
        is_active: true,
        question_ids: qIds,                   // ✅ lưu list question
        answers: {},                          // ✅ json
      },
    });

    // ✅ QUAN TRỌNG: trả về full session cho FE cache
    return res.json(mapQuizSession(session));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to start quiz session" });
  }
});

/**
 * GET /api/v1/quiz-session/active
 */
router.get("/active", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const session = await prisma.quiz_sessions.findFirst({
      where: {
        user_id: userId,
        status: QuizSessionStatus.Active,
        is_active: true,
      },
      orderBy: { started_at: "desc" },
    });

    return res.json(mapQuizSession(session));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/v1/quiz-session/{sessionId}/question
 */
router.get("/:sessionId/question", auth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.quiz_sessions.findUnique({
      where: { id: sessionId },
    });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (!session.is_active) return res.status(400).json({ message: "Session inactive" });

    // Ví dụ: bạn đang lưu question_ids (Json array)
    const qIds = Array.isArray(session.question_ids) ? session.question_ids : [];
    const idx = session.current_question_index ?? 0;

    const qId = qIds[idx];
    if (!qId) return res.json({ done: true });

    const q = await prisma.questions.findUnique({
      where: { id: qId },
      select: {
        id: true,
        text: true,        // ✅ field thật trong schema là text
        options: true,     // ✅ json
        type: true,
        media: true,       // nếu có
      },
    });

    if (!q) return res.status(404).json({ message: "Question not found" });

    // ✅ options json có thể là object[] hoặc string[]
    const rawOptions = Array.isArray(q.options) ? q.options : [];

    const optionsAsStrings = rawOptions.map((opt) => {
      if (typeof opt === "string") return opt;
      if (opt && typeof opt === "object") return opt.Text ?? opt.text ?? "";
      return "";
    }).filter(Boolean);

    return res.json({
      question: {
        id: q.id,
        text: q.text ?? "",         // ✅ FE dùng question.text
        options: optionsAsStrings,  // ✅ FE dùng string[]
        type: q.type,
        audioUrl: q.media?.AudioUrl ?? null,
        imageUrl: q.media?.ImageUrl ?? null,
        correctAnswer: null,
      },
      index: idx,
      total: qIds.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});


/**
 * POST /api/v1/quiz-session/{sessionId}/answer
 * Body: { questionId, answer }
 */
// router.post("/:sessionId/answer", auth, async (req, res) => {
//   try {
//     const { sessionId } = req.params;
//     const { questionId, UserAnswer } = req.body || {};
//     if (!questionId) return res.status(400).json({ message: "Missing questionId" });

//     const session = await prisma.quiz_sessions.findUnique({ where: { id: sessionId } });
//     if (!session) return res.status(404).json({ message: "Session not found" });
//     if (!session.is_active) return res.status(400).json({ message: "Session inactive" });

//     const qIds = Array.isArray(session.question_ids) ? session.question_ids : [];
//     const idx = session.current_question_index ?? 0;

//     // ✅ đảm bảo FE đang trả lời đúng câu hiện tại (tránh spam / answer lặp)
//     const currentQId = qIds[idx];
//     if (currentQId && currentQId !== questionId) {
//       return res.status(409).json({
//         message: "QUESTION_OUT_OF_SYNC",
//         currentQuestionId: currentQId,
//         index: idx,
//       });
//     }

//     const q = await prisma.questions.findUnique({
//       where: { id: questionId },
//       select: { id: true, options: true, correct_answer: true },
//     });
//     if (!q) return res.status(404).json({ message: "Question not found" });

//     const normalize = (s) => String(s ?? "").trim().toLowerCase();

//     const opts = Array.isArray(q.options) ? q.options : [];
//     const correctOpt = opts.find(o => o?.IsCorrect === true);
//     const correctText = correctOpt?.Text ?? correctOpt?.text ?? null;

//     const expected = correctText ?? q.correct_answer ?? "";
//     const isCorrect = normalize(UserAnswer) === normalize(expected);

//     const nextIdx = idx + 1;
//     const done = nextIdx >= qIds.length;

//     const prevAnswers =
//       session.answers && typeof session.answers === "object" ? session.answers : {};

//     await prisma.quiz_sessions.update({
//       where: { id: sessionId },
//       data: {
//         // ✅ lưu answer
//         answers: {
//           ...prevAnswers,
//           [questionId]: {
//             userAnswer: UserAnswer,
//             isCorrect,
//             at: new Date().toISOString(),
//           },
//         },

//         // ✅ CHÌA KHOÁ: tăng index để GET /question trả câu mới
//         current_question_index: done ? idx : nextIdx,

//         // nếu bạn muốn: nếu xong thì tự kết thúc session
//         ...(done
//           ? { is_active: false, status: QuizSessionStatus.Completed, completed_at: new Date() }
//           : {}),
//       },
//     });

//     return res.json({
//       isCorrect,
//       correctAnswer: correctText, // để FE highlight
//       explanation: null,
//       done,
//       nextIndex: nextIdx,
//       total: qIds.length,
//     });
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ message: "Server error" });
//   }
// });


/**
 * POST /api/v1/quiz-session/{sessionId}/complete
 */
// router.post("/:sessionId/complete", auth, async (req, res) => {
//   try {
//     const { sessionId } = req.params;
//     const userId = req.user.id;

//     const session = await prisma.quiz_sessions.findFirst({
//       where: { id: sessionId, user_id: userId },
//       select: { level_id: true, answers: true, started_at: true, hearts_remaining: true, question_ids: true },
//     });
//     if (!session) return res.status(404).json({ message: "Session not found" });

//     const qIds = Array.isArray(session.question_ids) ? session.question_ids : [];
//     const answersObj = (session.answers && typeof session.answers === "object") ? session.answers : {};

//     // (tạm) không tính đúng/sai nếu chưa map cấu trúc options/correct_answer phức tạp
//     const total = qIds.length;
//     const correct = 0;

//     await prisma.quiz_sessions.update({
//       where: { id: sessionId },
//       data: { status: QuizSessionStatus.Completed, is_active: false, completed_at: new Date() },
//     });

//     // tạo attempt tổng kết (bạn có thể refine sau)
//     await prisma.quiz_attempts.create({
//       data: {
//         id: randomUUID(),
//         user_id: userId,
//         level_id: session.level_id,
//         section_id: null,
//         score: 0,
//         total_questions: total,
//         correct_answers: correct,
//         accuracy: total ? correct / total : 0,
//         passed: false,
//         hearts_used: 0,
//         xp_earned: 0,
//         streak_earned: false,
//         started_at: session.started_at,
//         completed_at: new Date(),
//         time_taken_seconds: 0,
//         status: 1, // Int - bạn tự quy ước attempt status
//         answers: answersObj,
//         is_active: true,
//         session_id: sessionId,
//         exam_id: null,
//       },
//     });

//     return res.json({ correct, total });
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ message: "Server error" });
//   }
// });
router.post("/:sessionId/answer", auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { questionId, UserAnswer } = req.body || {};
    if (!questionId) return res.status(400).json({ message: "Missing questionId" });

    const session = await prisma.quiz_sessions.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (!session.is_active) return res.status(400).json({ message: "Session inactive" });

    const qIds = Array.isArray(session.question_ids) ? session.question_ids : [];
    const idx = session.current_question_index ?? 0;

    // ✅ đảm bảo FE đang trả lời đúng câu hiện tại (tránh spam / answer lặp)
    const currentQId = qIds[idx];
    if (currentQId && currentQId !== questionId) {
      return res.status(409).json({
        message: "QUESTION_OUT_OF_SYNC",
        currentQuestionId: currentQId,
        index: idx,
      });
    }

    const q = await prisma.questions.findUnique({
      where: { id: questionId },
      select: { id: true, options: true, correct_answer: true },
    });
    if (!q) return res.status(404).json({ message: "Question not found" });

    const normalize = (s) => String(s ?? "").trim().toLowerCase();

    const opts = Array.isArray(q.options) ? q.options : [];
    const correctOpt = opts.find(o => o?.IsCorrect === true);
    const correctText = correctOpt?.Text ?? correctOpt?.text ?? null;

    const expected = correctText ?? q.correct_answer ?? "";
    const isCorrect = normalize(UserAnswer) === normalize(expected);

    const nextIdx = idx + 1;
    const done = nextIdx >= qIds.length;

    // Lấy answers cũ dưới dạng Object (do code bạn đang dùng Object)
    const prevAnswers =
      session.answers && typeof session.answers === "object" ? session.answers : {};

    await prisma.quiz_sessions.update({
      where: { id: sessionId },
      data: {
        // ✅ lưu answer (Merge object cũ và mới)
        answers: {
          ...prevAnswers,
          [questionId]: {
            userAnswer: UserAnswer,
            isCorrect,
            at: new Date().toISOString(),
          },
        },

        // ✅ CHÌA KHOÁ: tăng index để GET /question trả câu mới
        current_question_index: done ? idx : nextIdx,

        // nếu bạn muốn: nếu xong thì tự kết thúc session
        ...(done
          ? { is_active: false, status: QuizSessionStatus.Completed, completed_at: new Date() }
          : {}),
      },
    });

    return res.json({
      isCorrect,
      correctAnswer: correctText, // để FE highlight
      explanation: null,
      done,
      nextIndex: nextIdx,
      total: qIds.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});
/**
 * POST /api/v1/quiz-session/{sessionId}/complete
 */
router.post("/:sessionId/complete", auth, async (req, res) => {
  // Biến debug để trả về cho FE xem lỗi gì
  let debugLog = {
    step: "Start",
    isPassed: false,
    score: 0,
    accuracy: 0,
    levelId: null,
    foundSectionId: null,
    progressUpdateStatus: "Not Attempted",
    error: null
  };

  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // 1. Lấy session
    const session = await prisma.quiz_sessions.findFirst({
      where: { id: sessionId, user_id: userId },
      select: { 
        level_id: true, 
        answers: true, 
        started_at: true, 
        hearts_remaining: true, 
        question_ids: true 
      },
    });

    if (!session) return res.status(404).json({ message: "Session not found" });
    
    debugLog.levelId = session.level_id;

    // 2. Tính điểm
    const qIds = Array.isArray(session.question_ids) ? session.question_ids : [];
    const answersObj = (session.answers && typeof session.answers === "object") ? session.answers : {};
    
    const total = qIds.length;
    const correct = Object.values(answersObj).filter((ans) => ans?.isCorrect === true).length;
    const accuracy = total ? correct / total : 0;
    const isPassed = accuracy >= 0.8; // Ngưỡng đậu 80%

    debugLog.score = correct;
    debugLog.accuracy = accuracy;
    debugLog.isPassed = isPassed;

    // 3. Update Session
    await prisma.quiz_sessions.update({
      where: { id: sessionId },
      data: { 
        status: QuizSessionStatus.Completed, 
        is_active: false, 
        completed_at: new Date() 
      },
    });

    // 4. Lưu Attempt
    const attempt = await prisma.quiz_attempts.create({
      data: {
        id: randomUUID(),
        user_id: userId,
        level_id: session.level_id,
        section_id: null,
        exam_id: null,
        score: correct * 10,
        total_questions: total,
        correct_answers: correct,
        accuracy: accuracy,
        passed: isPassed,
        hearts_used: 0,
        xp_earned: isPassed ? correct * 10 : 0,
        streak_earned: isPassed,
        time_taken_seconds: 0,
        started_at: session.started_at,
        completed_at: new Date(),
        status: 1, 
        answers: answersObj,
        is_active: true,
        session_id: sessionId,
      },
    });

    // 5. CẬP NHẬT USER_PROGRESS
    if (isPassed) {
      debugLog.step = "Checking Level Info";
      try {
        // Lấy section_id từ bảng Levels
        const levelInfo = await prisma.levels.findUnique({
          where: { id: session.level_id },
          select: { section_id: true }
        });

        debugLog.foundSectionId = levelInfo?.section_id;

        if (levelInfo && levelInfo.section_id) {
          const existingProgress = await prisma.user_progress.findFirst({
            where: {
              user_id: userId,
              level_id: session.level_id
            }
          });

          const STATUS_COMPLETED = 2; 

          if (existingProgress) {
            debugLog.progressUpdateStatus = "Updating Existing";
            await prisma.user_progress.update({
              where: { id: existingProgress.id },
              data: {
                status: STATUS_COMPLETED,
                updated_date: new Date(),
                updated_by: userId,
                completed_at: new Date(),
              }
            });
          } else {
            debugLog.progressUpdateStatus = "Creating New";
            await prisma.user_progress.create({
              data: {
                id: randomUUID(),
                user_id: userId,
                level_id: session.level_id,
                section_id: levelInfo.section_id,
                status: STATUS_COMPLETED,
                started_at: session.started_at,
                completed_at: new Date(),
                created_date: new Date(),
                created_by: userId,
                is_active: true
              }
            });
          }
        } else {
          debugLog.progressUpdateStatus = "Skipped - No Section ID";
          console.warn("⚠️ Không tìm thấy section_id cho level này");
        }
      } catch (err) {
        debugLog.progressUpdateStatus = "Error";
        debugLog.error = err.message;
        console.error("⚠️ Lỗi update progress:", err);
      }
    } else {
      debugLog.progressUpdateStatus = "Skipped - Not Passed";
    }

    // 6. Trả về kết quả KÈM DEBUG INFO
    return res.json({
      ...attempt, 
      correctAnswer:correct,    
      totalQuestions:total,
      xpEarned: attempt.xp_earned,
      correctAnswers: correct,
      newBestScore: true,
      streakEarned: 1,
      unlockedNextLevel: isPassed,
      // 👇 Quan trọng: xem cái này trong response để biết tại sao không insert
      debugReason: debugLog 
    });

  } catch (err) {
    console.error("❌ Critical Error /complete:", err);
    return res.status(500).json({ message: "Server error", debug: debugLog, error: err.message });
  }
});



router.post("/:sessionId/abandon", auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    if (!sessionId) return res.status(400).json({ message: "Missing sessionId" });

    const session = await prisma.quiz_sessions.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.user_id !== userId) return res.status(403).json({ message: "Forbidden" });

    if (!session.is_active) {
      // idempotent: abandon lần 2 vẫn OK
      return res.json({ ok: true });
    }

    await prisma.quiz_sessions.update({
      where: { id: sessionId },
      data: {
        status: QuizSessionStatus.Abandoned,
        is_active: false,
        completed_at: new Date(),
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to abandon session" });
  }
});

router.post("/:sessionId/resume", auth, async (req, res) => {
  const { sessionId } = req.params;
  await prisma.quiz_sessions.update({ where: { id: sessionId }, data: { status: QuizSessionStatus.Active, is_active: true } });
  return res.json({ ok: true });
});

router.get("/history", auth, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 10);
    const userId = req.user.id;

    const history = await prisma.quiz_sessions.findMany({
      where: {
        user_id: userId,
        status: { in: [QuizSessionStatus.Completed, QuizSessionStatus.Abandoned] },
      },
      orderBy: { started_at: "desc" },
      take: limit,
    });

    return res.json({ history });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;