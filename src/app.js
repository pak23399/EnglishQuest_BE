const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");
const quizSessionRoutes = require("./routes/quizSession.routes");
const progressRoutes = require("./routes/progress.routes");
const leaderboardRoutes = require("./routes/leaderboard.routes");
const heartRoutes = require("./routes/heart.routes");
const streakRoutes = require("./routes/streak.routes");
const accessControlRoutes = require("./routes/accessControl.routes");
const paymentRoutes = require("./routes/payment.routes");
// Admin routes
const sectionRoutes = require("./routes/section.routes");
const levelRoutes = require("./routes/level.routes");
const questionRoutes = require("./routes/question.routes");
const subscriptionRoutes = require("./routes/subscription.routes");

const app = express();
app.use(express.json({limit: "2mb"}));
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(morgan("dev"));
app.set("etag", false);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    credentials: true,
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));

// v1 routes (match doc casing too)
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/quiz-session", quizSessionRoutes);
app.use("/api/v1/progress", progressRoutes);
app.use("/api/v1/leaderboard", leaderboardRoutes);
app.use("/api/v1/access-control", accessControlRoutes);
app.use("/api/v1/heart", require("./routes/heart.routes"));
app.use("/api/v1/streak", require("./routes/streak.routes"));
app.use("/api/v1/subscription", require("./routes/subscription.routes"));
app.use("/api/v1/unlocking", require("./routes/unlocking.routes"));
// admin modules
app.use("/api/v1/section", sectionRoutes);
app.use("/api/v1/level", levelRoutes);
app.use("/api/v1/question", questionRoutes);
app.use("/api/v1/exam", require("./routes/exam.routes"));
app.use("/api/v1/exam-admin", require("./routes/examAdmin.routes"));
app.use("/api/v1/flashcard", require("./routes/flashcard.routes"));
app.use("/api/v1/ai", require("./routes/ai.routes"));
app.use("/api/v1/subscription", subscriptionRoutes);
app.use("/api/v1/payment", paymentRoutes);

// 404
app.use((req, res) => res.status(404).json({ message: "Not Found" }));

module.exports = app;
