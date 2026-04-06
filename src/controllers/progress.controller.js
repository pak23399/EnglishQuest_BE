// src/controllers/progress.controller.js
const progressService = require("../services/progress.service");

async function getLevelProgress(req, res) {
  try {
    const userId = req.user.id;
    const { levelId } = req.params;

    const result = await progressService.getLevelProgress(userId, levelId);
    if (result.notFound) return res.status(404).json({ message: result.notFound });

    return res.json(result.data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getSectionProgress(req, res) {
  try {
    const userId = req.user.id;
    const { sectionId } = req.params;

    const result = await progressService.getSectionProgress(userId, sectionId);
    return res.json(result.data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getAllProgress(req, res) {
  try {
    const userId = req.user.id;
    const result = await progressService.getAllProgress(userId);
    return res.json(result.data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getSectionSummary(req, res) {
  try {
    const userId = req.user.id;
    const { sectionId } = req.params;

    const result = await progressService.getSectionSummary(userId, sectionId);
    if (result.notFound) return res.status(404).json({ message: result.notFound });

    return res.json(result.data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getTotalXp(req, res) {
  try {
    const userId = req.user.id;
    const result = await progressService.getTotalXp(userId);
    if (result.notFound) return res.status(404).json({ message: result.notFound });

    // doc: returns a number
    return res.json(result.data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getCompletedLevelsCount(req, res) {
  try {
    const userId = req.user.id;
    const result = await progressService.getCompletedLevelsCount(userId);

    // doc: returns a number
    return res.json(result.data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  getLevelProgress,
  getSectionProgress,
  getAllProgress,
  getSectionSummary,
  getTotalXp,
  getCompletedLevelsCount,
};
