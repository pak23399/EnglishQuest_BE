// src/routes/ai.routes.js
const router = require("express").Router();
const auth = require("../middlewares/auth");
const aiController = require("../controllers/ai.controller");

// FE button "Generate with AI" -> POST /api/v1/ai/generate-flashcards
router.post("/generate-flashcards", auth, aiController.generateFlashcards);
router.post("/save-generated-flashcards", auth, aiController.saveGeneratedFlashcards);

module.exports = router;
