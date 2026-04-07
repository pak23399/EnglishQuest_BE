const svc = require("../services/flashcard.service");

function ok(res, data) {
  return res.json(data);
}

module.exports = {
  // 1
  createFlashcard: async (req, res) => {
    try { return ok(res, await svc.createFlashcard(req.user.id, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 2
  bulkCreateFlashcards: async (req, res) => {
    try { return ok(res, await svc.bulkCreateFlashcards(req.user.id, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 3
  updateFlashcard: async (req, res) => {
    try { return ok(res, await svc.updateFlashcard(req.user.id, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 4
  deleteFlashcard: async (req, res) => {
    try { return ok(res, await svc.deleteFlashcard(req.user.id, req.params.id)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 5
  getFlashcardById: async (req, res) => {
    try { return ok(res, await svc.getFlashcardById(req.user?.id || null, req.params.id)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 6
  getByDeck: async (req, res) => {
    try { return ok(res, await svc.getFlashcardsByDeck(req.user?.id || null, req.params.deckId)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 7
  pagedFlashcards: async (req, res) => {
    try { return ok(res, await svc.pagedFlashcards(req.user?.id || null, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },

  // 8
  createDeck: async (req, res) => {
    try { return ok(res, await svc.createDeck(req.user.id, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 9
  updateDeck: async (req, res) => {
    try { return ok(res, await svc.updateDeck(req.user.id, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 10
  deleteDeck: async (req, res) => {
    try { return ok(res, await svc.deleteDeck(req.user.id, req.params.id)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 11
  getDeckById: async (req, res) => {
    try { return ok(res, await svc.getDeckById(req.user?.id || null, req.params.id)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 12
  getDeckWithCards: async (req, res) => {
    try { return ok(res, await svc.getDeckWithCards(req.user?.id || null, req.params.id)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 13
  pagedDecks: async (req, res) => {
    try { return ok(res, await svc.pagedDecks(req.user?.id || null, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 14
  copyDeck: async (req, res) => {
    try { return ok(res, await svc.copyDeck(req.user.id, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },

  // 15
  getStudySession: async (req, res) => {
    try { return ok(res, await svc.getStudySession(req.user.id, req.params.deckId, req.query)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 16
  submitAnswer: async (req, res) => {
    try { return ok(res, await svc.submitAnswer(req.user.id, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 17
  batchSubmitAnswers: async (req, res) => {
    try { return ok(res, await svc.batchSubmitAnswers(req.user.id, req.body)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },

  // 18
  getDeckProgress: async (req, res) => {
    try { return ok(res, await svc.getDeckProgress(req.user.id, req.params.deckId)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 19
  getOverallProgress: async (req, res) => {
    try { return ok(res, await svc.getOverallProgress(req.user.id)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
  // 20
  getPerCardProgress: async (req, res) => {
    try { return ok(res, await svc.getPerCardProgress(req.user.id, req.params.deckId)); }
    catch (e) { return res.status(e.status || 500).json({ message: e.message || "Server error" }); }
  },
};
