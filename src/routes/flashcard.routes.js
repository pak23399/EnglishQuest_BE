const router = require("express").Router();
const auth = require("../middlewares/auth");
const optionalAuth = require("../middlewares/optionalAuth");
const ctrl = require("../controllers/flashcard.controller");

// Flashcards (static first)
router.post("/", auth, ctrl.createFlashcard);
router.post("/bulk", auth, ctrl.bulkCreateFlashcards);
router.post("/paged", optionalAuth, ctrl.pagedFlashcards);
router.get("/by-deck/:deckId", optionalAuth, ctrl.getByDeck);

// Decks
router.post("/decks", auth, ctrl.createDeck);
router.put("/decks", auth, ctrl.updateDeck);
router.delete("/decks/:id", auth, ctrl.deleteDeck);
router.get("/decks/:id", optionalAuth, ctrl.getDeckById);
router.get("/decks/:id/cards", optionalAuth, ctrl.getDeckWithCards);
router.post("/decks/paged", optionalAuth, ctrl.pagedDecks);
router.post("/decks/copy", auth, ctrl.copyDeck);

// Study
router.get("/study/:deckId", auth, ctrl.getStudySession);
router.post("/study/answer", auth, ctrl.submitAnswer);
router.post("/study/answers", auth, ctrl.batchSubmitAnswers);

// Progress
router.get("/progress/deck/:deckId", auth, ctrl.getDeckProgress);
router.get("/progress", auth, ctrl.getOverallProgress);
router.get("/progress/deck/:deckId/cards", auth, ctrl.getPerCardProgress);

// ✅ LAST: param route
router.get("/:id", optionalAuth, ctrl.getFlashcardById);
router.put("/", auth, ctrl.updateFlashcard); // PUT /flashcard (không bị ảnh hưởng)
router.delete("/:id", auth, ctrl.deleteFlashcard);

module.exports = router;
