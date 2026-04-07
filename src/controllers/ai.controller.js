// src/controllers/ai.controller.js
const aiService = require("../services/ai.service");

exports.generateFlashcards = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await aiService.generateFlashcards(userId, req.body);
    return res.json(result);
  } catch (e) {
    // If service throws httpError(status, message)
    const status = e.status || 500;
    const message = e.message || "Server error";
    return res.status(status).json({ message });
  }
};
exports.saveGeneratedFlashcards = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await aiService.saveGeneratedFlashcards(userId, req.body);
    return res.json(result);
  } catch (e) {
    const status = e.status || 500;
    const message = e.message || "Server error";
    return res.status(status).json({ message });
  }
};

