const prisma = require("../prisma");
const { getAudioUrlForTerm } = require("./dictionary.service");
const crypto = require("crypto");
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function parseMeta(meta) {
  if (!meta) return {};
  if (typeof meta === "object") return meta;
  return {};
}

function toFlashcardDto(fc, deckTitle) {
  const meta = parseMeta(fc.metadata);
  return {
    id: fc.id,
    deckId: fc.deck_id,
    deckTitle: deckTitle ?? null,
    englishTerm: fc.english_term,
    vietnameseTerm: fc.vietnamese_term,
    englishExample: fc.english_example ?? null,
    vietnameseExample: fc.vietnamese_example ?? null,
    pronunciation: fc.pronunciation ?? null,
    audioUrl: fc.audio_url ?? null,
    imageUrl: fc.image_url ?? null,
    difficulty: fc.difficulty,
    order: fc.order,
    tags: meta.tags ?? [],
    partOfSpeech: meta.partOfSpeech ?? null,
    notes: meta.notes ?? null,
    createdDate: fc.created_date ?? null,
    isActive: fc.is_active,
  };
}

function toDeckDto(deck, ownerUsername, isOwner, cardCount, completedCards, masteredCards) {
  return {
    id: deck.id,
    userId: deck.user_id,
    ownerUsername: ownerUsername ?? null,
    title: deck.title,
    description: deck.description ?? null,
    imageUrl: deck.image_url ?? null,
    order: deck.order,
    difficulty: deck.difficulty,
    isPublic: deck.is_public,
    copyCount: deck.copy_count,
    cardCount: cardCount ?? 0,
    completedCards: completedCards ?? null,
    masteredCards: masteredCards ?? null,
    isOwner: !!isOwner,
    createdDate: deck.created_date ?? null,
    isActive: deck.is_active,
  };
}

async function getDeckOrNull(deckId) {
  return prisma.flashcard_decks.findFirst({
    where: { id: deckId, is_active: true, deleted_date: null },
    include: { users: { select: { username: true } } },
  });
}

function canViewDeck(deck, userIdOrNull) {
  if (!deck) return false;
  if (deck.is_public) return true;
  return !!userIdOrNull && deck.user_id === userIdOrNull;
}

async function assertOwnerDeck(deckId, userId) {
  const deck = await prisma.flashcard_decks.findFirst({
    where: { id: deckId, is_active: true, deleted_date: null },
  });
  if (!deck) throw httpError(404, "Deck not found");
  if (deck.user_id !== userId) throw httpError(400, "You don't own this deck");
  return deck;
}

function pagedResult(items, page, limit, totalCount) {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  return {
    meta: {
      totalItems: totalCount,
      itemCount: items.length,
      itemsPerPage: limit,
      totalPages,
      currentPage: page,
    },
    items,
  };
}


// --- SRS (simple + stable) ---
function computeSrsNext(progress, rating) {
  // rating: 0 Again, 1 Hard, 2 Good, 3 Easy  (doc enum) :contentReference[oaicite:9]{index=9}
  const now = new Date();
  const curEase = typeof progress.ease_factor === "number" ? progress.ease_factor : 2.5;
  const curInterval = typeof progress.interval_days === "number" ? progress.interval_days : 0;
  const curReps = typeof progress.repetition_count === "number" ? progress.repetition_count : 0;

  let ease = curEase;
  let intervalDays = curInterval;
  let status = progress.status ?? 0;

  if (rating === 0) {
    // Again: reset
    status = 1; // Learning
    intervalDays = 0;
    ease = Math.max(1.3, ease - 0.2);
    const nextReviewAt = new Date(now.getTime() + 60 * 1000); // 1 minute
    return { status, intervalDays, ease, nextReviewAt };
  }

  // Hard/Good/Easy
  if (rating === 1) ease = Math.max(1.3, ease - 0.15);
  if (rating === 2) ease = Math.max(1.3, ease);
  if (rating === 3) ease = Math.min(3.0, ease + 0.15);

  const base =
    curReps === 0 ? 1 :
    curReps === 1 ? 3 :
    Math.max(1, Math.round(curInterval * ease));

  const multiplier = rating === 1 ? 1.2 : rating === 2 ? 1.0 : 1.3;
  intervalDays = Math.max(1, Math.round(base * multiplier));

  // status promotion
  if (curReps + 1 >= 7 && rating >= 2) status = 3;       // Mastered
  else if (curReps + 1 >= 2 && rating >= 2) status = 2;  // Review
  else status = 1;                                       // Learning

  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return { status, intervalDays, ease, nextReviewAt };
}

module.exports = {
  // 1 Create Flashcard
  createFlashcard: async (userId, body) => {
    const {
      deckId,
      englishTerm,
      vietnameseTerm,
      englishExample,
      vietnameseExample,
      pronunciation,
      audioUrl,
      imageUrl,
      difficulty = 1,
      order = 1,
      tags = [],
      partOfSpeech = null,
      notes = null,
    } = body || {};

    if (!deckId || !englishTerm || !vietnameseTerm) {
      throw httpError(400, "Missing required fields");
    }

    const deck = await assertOwnerDeck(deckId, userId);
    const finalAudioUrl = audioUrl ?? (await getAudioUrlForTerm(englishTerm));

    const created = await prisma.flashcards.create({
      data: {
        id: crypto.randomUUID(),
        deck_id: deckId,
        english_term: englishTerm,
        vietnamese_term: vietnameseTerm,
        english_example: englishExample ?? null,
        vietnamese_example: vietnameseExample ?? null,
        pronunciation: pronunciation ?? null,
        audio_url: finalAudioUrl ?? null,
        image_url: imageUrl ?? null,
        difficulty: Number(difficulty) || 1,
        order: Number(order) || 1,
        metadata: { tags: Array.isArray(tags) ? tags : [], partOfSpeech, notes },
        created_date: new Date(),
        created_by: userId,
        is_active: true,
      },
    });

    return toFlashcardDto(created, deck.title);
  },

  // 2 Bulk Create Flashcards
  bulkCreateFlashcards: async (userId, body) => {
    const flashcards = body?.flashcards;
    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      throw httpError(400, "flashcards is required");
    }

    const deckIds = [...new Set(flashcards.map(x => x.deckId).filter(Boolean))];
    if (deckIds.length === 0) throw httpError(400, "deckId is required");

    const decks = await prisma.flashcard_decks.findMany({
      where: { id: { in: deckIds }, is_active: true, deleted_date: null },
      select: { id: true, user_id: true, title: true },
    });

    const deckMap = new Map(decks.map(d => [d.id, d]));
    for (const deckId of deckIds) {
      const d = deckMap.get(deckId);
      if (!d) throw httpError(404, `Deck not found: ${deckId}`);
      if (d.user_id !== userId) throw httpError(400, "You don't own this deck");
    }

    const audioList = await Promise.all(
      flashcards.map(x =>
        x.audioUrl ? Promise.resolve(x.audioUrl) : getAudioUrlForTerm(x.englishTerm)
      )
    );

    const now = new Date();

    const data = flashcards.map((x, i) => ({
      id: crypto.randomUUID(),
      deck_id: x.deckId,
      english_term: x.englishTerm,
      vietnamese_term: x.vietnameseTerm,
      english_example: x.englishExample ?? null,
      vietnamese_example: x.vietnameseExample ?? null,
      pronunciation: x.pronunciation ?? null,
      audio_url: audioList[i] ?? null,     // ✅ FIX: dùng index i
      image_url: x.imageUrl ?? null,
      difficulty: Number(x.difficulty ?? 1) || 1,
      order: Number(x.order ?? 1) || 1,
      metadata: {
        tags: x.tags ?? [],
        partOfSpeech: x.partOfSpeech ?? null,
        notes: x.notes ?? null
      },
      created_date: now,
      created_by: userId,
      is_active: true,
    }));

    const ids = data.map(d => d.id);
    await prisma.flashcards.createMany({ data });

    const rows = await prisma.flashcards.findMany({
      where: { id: { in: ids } },
      include: { flashcard_decks: { select: { title: true } } },
    });

    return rows.map(r => toFlashcardDto(r, r.flashcard_decks?.title));
  },


  // 3 Update Flashcard
  updateFlashcard: async (userId, body) => {
    const { id } = body || {};
    if (!id) throw httpError(400, "id is required");

    const existing = await prisma.flashcards.findFirst({
      where: { id, is_active: true, deleted_date: null },
      include: { flashcard_decks: true },
    });
    if (!existing) throw httpError(404, "Flashcard not found");

    // must own deck
    if (existing.flashcard_decks.user_id !== userId) throw httpError(400, "You don't own this deck");

    const meta = parseMeta(existing.metadata);
    const nextMeta = {
      tags: body.tags ?? meta.tags ?? [],
      partOfSpeech: body.partOfSpeech ?? meta.partOfSpeech ?? null,
      notes: body.notes ?? meta.notes ?? null,
    };

    const updated = await prisma.flashcards.update({
      where: { id },
      data: {
        english_term: body.englishTerm ?? undefined,
        vietnamese_term: body.vietnameseTerm ?? undefined,
        english_example: body.englishExample ?? undefined,
        vietnamese_example: body.vietnameseExample ?? undefined,
        pronunciation: body.pronunciation ?? undefined,
        audio_url: body.audioUrl ?? undefined,
        image_url: body.imageUrl ?? undefined,
        difficulty: body.difficulty ?? undefined,
        order: body.order ?? undefined,
        metadata: nextMeta,
        updated_date: new Date(),
        updated_by: userId,
      },
    });

    return toFlashcardDto(updated, existing.flashcard_decks.title);
  },

  // 4 Delete Flashcard
  deleteFlashcard: async (userId, id) => {
    const existing = await prisma.flashcards.findFirst({
      where: { id, is_active: true, deleted_date: null },
      include: { flashcard_decks: true },
    });
    if (!existing) throw httpError(404, "Flashcard not found");
    if (existing.flashcard_decks.user_id !== userId) throw httpError(400, "You don't own this deck");

    await prisma.flashcards.update({
      where: { id },
      data: { deleted_date: new Date(), deleted_by: userId, is_active: false },
    });

    return { status: true };
  },

  // 5 Get Flashcard by ID [Public] (but only if deck public or owner)
  getFlashcardById: async (viewerUserIdOrNull, id) => {
    const fc = await prisma.flashcards.findFirst({
      where: { id, is_active: true, deleted_date: null },
      include: { flashcard_decks: { include: { users: { select: { username: true } } } } },
    });
    if (!fc) return null;

    const deck = fc.flashcard_decks;
    if (!canViewDeck(deck, viewerUserIdOrNull)) return null;

    return toFlashcardDto(fc, deck.title);
  },

  // 6 Get Flashcards by Deck [Public] (but only if deck public or owner)
  getFlashcardsByDeck: async (viewerUserIdOrNull, deckId) => {
    const deck = await getDeckOrNull(deckId);
    if (!deck) return [];
    if (!canViewDeck(deck, viewerUserIdOrNull)) return [];

    const cards = await prisma.flashcards.findMany({
      where: { deck_id: deckId, is_active: true, deleted_date: null },
      orderBy: { order: "asc" },
    });

    return cards.map(c => toFlashcardDto(c, deck.title));
  },

  // 7 Filter Flashcards (Paged) [Public]
  pagedFlashcards: async (viewerUserIdOrNull, body) => {
    const page = Math.max(1, Number(body?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(body?.limit || 20)));

    const deckId = body?.deckId || null;

    let deckTitle = null;
    if (deckId) {
      const deck = await getDeckOrNull(deckId);
      if (!deck || !canViewDeck(deck, viewerUserIdOrNull)) {
        return pagedResult([], page, limit, 0);
      }
      deckTitle = deck.title;
    }

    const where = {
      is_active: true,
      deleted_date: null,
      ...(deckId ? { deck_id: deckId } : {}),
      ...(body?.difficulty != null ? { difficulty: Number(body.difficulty) } : {}),
      ...(body?.searchText
        ? {
            OR: [
              { english_term: { contains: body.searchText, mode: "insensitive" } },
              { vietnamese_term: { contains: body.searchText, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [totalCount, rows] = await Promise.all([
      prisma.flashcards.count({ where }),
      prisma.flashcards.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ deck_id: "asc" }, { order: "asc" }],
      }),
    ]);

    const items = rows.map(r => toFlashcardDto(r, deckTitle));
    return pagedResult(items, page, limit, totalCount);
  },

  // 8 Create Deck (auth)
  createDeck: async (userId, body) => {
    const { title, description, imageUrl, difficulty = 1, isPublic = false } = body || {};
    if (!title) throw httpError(400, "title is required");

    const maxOrder = await prisma.flashcard_decks.aggregate({
      where: { user_id: userId, is_active: true, deleted_date: null },
      _max: { order: true },
    });

    const deck = await prisma.flashcard_decks.create({
      data: {
        id: crypto.randomUUID(),
        user_id: userId,
        title,
        description: description ?? null,
        image_url: imageUrl ?? null,
        order: (maxOrder._max.order ?? 0) + 1,
        difficulty: Number(difficulty) || 1,
        is_public: !!isPublic,
        copy_count: 0,
        created_date: new Date(),
        created_by: userId,
        is_active: true,
      },
      include: { users: { select: { username: true } } },
    });

    return toDeckDto(deck, deck.users?.username, true, 0, null, null);
  },

  // 9 Update Deck (auth + owner)
  updateDeck: async (userId, body) => {
    const { id } = body || {};
    if (!id) throw httpError(400, "id is required");

    const deck = await assertOwnerDeck(id, userId);

    const updated = await prisma.flashcard_decks.update({
      where: { id },
      data: {
        title: body.title ?? undefined,
        description: body.description ?? undefined,
        image_url: body.imageUrl ?? undefined,
        difficulty: body.difficulty ?? undefined,
        is_public: body.isPublic ?? undefined,
        updated_date: new Date(),
        updated_by: userId,
      },
      include: { users: { select: { username: true } } },
    });

    const cardCount = await prisma.flashcards.count({ where: { deck_id: id, is_active: true, deleted_date: null } });
    return toDeckDto(updated, updated.users?.username, true, cardCount, null, null);
  },

  // 10 Delete Deck (auth + owner)
  deleteDeck: async (userId, deckId) => {
    await assertOwnerDeck(deckId, userId);

    await prisma.flashcard_decks.update({
      where: { id: deckId },
      data: { deleted_date: new Date(), deleted_by: userId, is_active: false },
    });

    return { status: true };
  },

  // 11 Get Deck by ID [AllowAnonymous] (public or owner)
  getDeckById: async (viewerUserIdOrNull, deckId) => {
    const deck = await getDeckOrNull(deckId);
    if (!deck) return null;
    if (!canViewDeck(deck, viewerUserIdOrNull)) return null;

    const cardCount = await prisma.flashcards.count({ where: { deck_id: deckId, is_active: true, deleted_date: null } });
    const isOwner = !!viewerUserIdOrNull && deck.user_id === viewerUserIdOrNull;

    // completedCards/masteredCards are user-specific (doc returns null in deck create) :contentReference[oaicite:10]{index=10}
    return toDeckDto(deck, deck.users?.username, isOwner, cardCount, null, null);
  },

  // 12 Get Deck with Cards [AllowAnonymous]
  getDeckWithCards: async (viewerUserIdOrNull, deckId) => {
    const deck = await getDeckOrNull(deckId);
    if (!deck) return null;
    if (!canViewDeck(deck, viewerUserIdOrNull)) return null;

    const cards = await prisma.flashcards.findMany({
      where: { deck_id: deckId, is_active: true, deleted_date: null },
      select: { id: true, english_term: true, vietnamese_term: true, order: true },
      orderBy: { order: "asc" },
    });

    return {
      id: deck.id,
      userId: deck.user_id,
      ownerUsername: deck.users?.username ?? null,
      title: deck.title,
      description: deck.description ?? null,
      isPublic: deck.is_public,
      isOwner: !!viewerUserIdOrNull && deck.user_id === viewerUserIdOrNull,
      cardCount: cards.length,
      flashcards: cards.map(c => ({
        id: c.id,
        englishTerm: c.english_term,
        vietnameseTerm: c.vietnamese_term,
        order: c.order,
      })),
    };
  },

  // 13 Filter Decks (Paged) [AllowAnonymous]
  pagedDecks: async (viewerUserIdOrNull, body) => {
    const page = Math.max(1, Number(body?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(body?.limit || 20)));

    const myDecksOnly = body?.myDecksOnly === true;
    const searchText = body?.searchText || null;

    const wherePublicOrMine = viewerUserIdOrNull
      ? { OR: [{ is_public: true }, { user_id: viewerUserIdOrNull }] }
      : { is_public: true };

    const where = {
      is_active: true,
      deleted_date: null,
      ...(myDecksOnly
        ? { user_id: viewerUserIdOrNull || "__NO_USER__" }
        : wherePublicOrMine),
      ...(body?.difficulty != null ? { difficulty: Number(body.difficulty) } : {}),
      ...(searchText
        ? { title: { contains: searchText, mode: "insensitive" } }
        : {}),
    };

    const [totalCount, decks] = await Promise.all([
      prisma.flashcard_decks.count({ where }),
      prisma.flashcard_decks.findMany({
        where,
        include: { users: { select: { username: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ user_id: "asc" }, { order: "asc" }],
      }),
    ]);

    // own decks appear first (doc note) :contentReference[oaicite:11]{index=11}
    const sorted = viewerUserIdOrNull
      ? decks.sort((a, b) => (a.user_id === viewerUserIdOrNull ? -1 : 1) - (b.user_id === viewerUserIdOrNull ? -1 : 1))
      : decks;

    const deckIds = sorted.map(d => d.id);
    const counts = await prisma.flashcards.groupBy({
      by: ["deck_id"],
      where: { deck_id: { in: deckIds }, is_active: true, deleted_date: null },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map(x => [x.deck_id, x._count._all]));

    const items = sorted.map(d => toDeckDto(
      d,
      d.users?.username,
      !!viewerUserIdOrNull && d.user_id === viewerUserIdOrNull,
      countMap.get(d.id) || 0,
      null,
      null
    ));

    return pagedResult(items, page, limit, totalCount);
  },

  // 14 Copy Deck (auth)
  copyDeck: async (userId, body) => {
    const { sourceDeckId, newTitle } = body || {};
    if (!sourceDeckId) throw httpError(400, "sourceDeckId is required");

    const src = await prisma.flashcard_decks.findFirst({
      where: { id: sourceDeckId, is_active: true, deleted_date: null },
    });
    if (!src) throw httpError(404, "Source deck not found");
    if (!src.is_public) throw httpError(400, "Source deck is not public"); // doc :contentReference[oaicite:12]{index=12}

    const srcCards = await prisma.flashcards.findMany({
      where: { deck_id: sourceDeckId, is_active: true, deleted_date: null },
      orderBy: { order: "asc" },
    });

    const now = new Date();
    const copiedDeckId = crypto.randomUUID();

    const copiedDeck = await prisma.flashcard_decks.create({
      data: {
        id: copiedDeckId,
        user_id: userId,
        title: newTitle || `${src.title} (Copy)`,
        description: src.description,
        image_url: src.image_url,
        order: 1,
        difficulty: src.difficulty,
        is_public: false, // doc: copied decks are private :contentReference[oaicite:13]{index=13}
        copy_count: 0,
        created_date: now,
        created_by: userId,
        is_active: true,
      },
      include: { users: { select: { username: true } } },
    });

    if (srcCards.length) {
      await prisma.flashcards.createMany({
        data: srcCards.map(c => ({
          id: crypto.randomUUID(),
          deck_id: copiedDeckId,
          english_term: c.english_term,
          vietnamese_term: c.vietnamese_term,
          english_example: c.english_example,
          vietnamese_example: c.vietnamese_example,
          pronunciation: c.pronunciation,
          audio_url: c.audio_url,
          image_url: c.image_url,
          difficulty: c.difficulty,
          order: c.order,
          metadata: c.metadata,
          created_date: now,
          created_by: userId,
          is_active: true,
        })),
      });
    }

    // increment copy_count
    await prisma.flashcard_decks.update({
      where: { id: sourceDeckId },
      data: { copy_count: { increment: 1 }, updated_date: now },
    });

    return toDeckDto(copiedDeck, copiedDeck.users?.username, true, srcCards.length, null, null);
  },

  // 15 Get Study Session (auth)
  getStudySession: async (userId, deckId, query) => {
    const deck = await getDeckOrNull(deckId);
    if (!deck) throw httpError(404, "Deck not found");
    if (!canViewDeck(deck, userId)) throw httpError(403, "Forbidden");

    const maxCards = Math.min(100, Math.max(1, Number(query?.maxCards || 20)));

    // due cards: join progress; include NEW cards where no progress row yet
    const allCards = await prisma.flashcards.findMany({
      where: { deck_id: deckId, is_active: true, deleted_date: null },
      orderBy: { order: "asc" },
    });

    const progressRows = await prisma.flashcard_progress.findMany({
      where: { user_id: userId, flashcard_id: { in: allCards.map(c => c.id) }, is_active: true, deleted_date: null },
    });
    const progMap = new Map(progressRows.map(p => [p.flashcard_id, p]));

    const now = new Date();
    const due = [];
    for (const c of allCards) {
      const p = progMap.get(c.id);
      if (!p) {
        due.push({ card: c, prog: null, dueScore: 0 }); // new cards first
      } else {
        const next = p.next_review_at ? new Date(p.next_review_at) : null;
        if (!next || next <= now) {
          due.push({ card: c, prog: p, dueScore: next ? next.getTime() : 1 });
        }
      }
    }

    due.sort((a, b) => a.dueScore - b.dueScore);
    const picked = due.slice(0, maxCards);

    const cards = picked.map(({ card, prog }) => {
      const meta = parseMeta(card.metadata);
      return {
        flashcardId: card.id,
        englishTerm: card.english_term,
        vietnameseTerm: card.vietnamese_term,
        englishExample: card.english_example ?? null,
        vietnameseExample: card.vietnamese_example ?? null,
        pronunciation: card.pronunciation ?? null,
        audioUrl: card.audio_url ?? null,
        imageUrl: card.image_url ?? null,
        status: prog?.status ?? 0,
        repetitionCount: prog?.repetition_count ?? 0,
        tags: meta.tags ?? [],
        partOfSpeech: meta.partOfSpeech ?? null,
      };
    });

    // counts for response :contentReference[oaicite:14]{index=14}
    const stats = { totalDue: due.length, newCards: 0, learningCards: 0, reviewCards: 0 };
    for (const x of due) {
      const st = x.prog?.status ?? 0;
      if (st === 0) stats.newCards++;
      else if (st === 1) stats.learningCards++;
      else if (st === 2) stats.reviewCards++;
    }

    return {
      deckId: deck.id,
      deckTitle: deck.title,
      cards,
      totalDue: stats.totalDue,
      newCards: stats.newCards,
      learningCards: stats.learningCards,
      reviewCards: stats.reviewCards,
    };
  },

  // 16 Submit Answer (auth)
  submitAnswer: async (userId, body) => {
    const { flashcardId, rating } = body || {};
    if (!flashcardId || rating == null) throw httpError(400, "flashcardId and rating are required");

    const card = await prisma.flashcards.findFirst({
      where: { id: flashcardId, is_active: true, deleted_date: null },
      include: { flashcard_decks: true },
    });
    if (!card) throw httpError(404, "Flashcard not found");
    if (!canViewDeck(card.flashcard_decks, userId)) throw httpError(403, "Forbidden");

    const existing = await prisma.flashcard_progress.findFirst({
      where: { user_id: userId, flashcard_id: flashcardId, is_active: true, deleted_date: null },
    });

    const base = existing || {
      status: 0,
      repetition_count: 0,
      ease_factor: 2.5,
      interval_days: 0,
      correct_count: 0,
      incorrect_count: 0,
    };

    const { status, intervalDays, ease, nextReviewAt } = computeSrsNext(base, Number(rating));

    const isCorrect = Number(rating) >= 2; // simple mapping for totals in doc response
    const correct_count = (base.correct_count || 0) + (isCorrect ? 1 : 0);
    const incorrect_count = (base.incorrect_count || 0) + (!isCorrect ? 1 : 0);

    await prisma.flashcard_progress.upsert({
      where: { user_id_flashcard_id: { user_id: userId, flashcard_id: flashcardId } },
      update: {
        status,
        repetition_count: (base.repetition_count || 0) + 1,
        ease_factor: ease,
        interval_days: intervalDays,
        next_review_at: nextReviewAt,
        last_reviewed_at: new Date(),
        correct_count,
        incorrect_count,
        updated_date: new Date(),
        updated_by: userId,
        is_active: true,
      },
      create: {
        id: crypto.randomUUID(),
        user_id: userId,
        flashcard_id: flashcardId,
        status,
        repetition_count: 1,
        ease_factor: ease,
        interval_days: intervalDays,
        next_review_at: nextReviewAt,
        last_reviewed_at: new Date(),
        correct_count,
        incorrect_count,
        created_date: new Date(),
        created_by: userId,
        is_active: true,
      },
    });

    // doc response shape :contentReference[oaicite:15]{index=15}
    return {
      flashcardId,
      newStatus: status,
      newIntervalDays: intervalDays,
      nextReviewAt,
      totalCorrect: correct_count,
      totalIncorrect: incorrect_count,
    };
  },

  // 17 Batch Submit Answers (auth)
  batchSubmitAnswers: async (userId, body) => {
    const answers = body?.answers;
    if (!Array.isArray(answers) || answers.length === 0) throw httpError(400, "answers is required");

    const out = [];
    for (const a of answers) {
      out.push(await module.exports.submitAnswer(userId, a));
    }
    return out;
  },

  // 18 Get Deck Progress (auth)
  getDeckProgress: async (userId, deckId) => {
    const deck = await getDeckOrNull(deckId);
    if (!deck) throw httpError(404, "Deck not found");
    if (!canViewDeck(deck, userId)) throw httpError(403, "Forbidden");

    const cards = await prisma.flashcards.findMany({
      where: { deck_id: deckId, is_active: true, deleted_date: null },
      select: { id: true },
    });
    const ids = cards.map(x => x.id);

    const progress = await prisma.flashcard_progress.findMany({
      where: { user_id: userId, flashcard_id: { in: ids }, is_active: true, deleted_date: null },
    });

    const totalCards = ids.length;
    let newCards = totalCards - progress.length;
    let learningCards = 0, reviewCards = 0, masteredCards = 0;
    let correct = 0, incorrect = 0;
    let lastStudiedAt = null;
    let dueToday = 0;

    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    for (const p of progress) {
      if (p.status === 1) learningCards++;
      else if (p.status === 2) reviewCards++;
      else if (p.status === 3) masteredCards++;
      correct += p.correct_count || 0;
      incorrect += p.incorrect_count || 0;

      if (p.last_reviewed_at) {
        const t = new Date(p.last_reviewed_at);
        if (!lastStudiedAt || t > new Date(lastStudiedAt)) lastStudiedAt = t;
      }
      if (!p.next_review_at || new Date(p.next_review_at) <= endOfToday) dueToday++;
    }

    const overallAccuracy = correct + incorrect > 0 ? (correct / (correct + incorrect)) * 100 : 0;

    // doc response :contentReference[oaicite:16]{index=16}
    return {
      deckId: deck.id,
      deckTitle: deck.title,
      deckImageUrl: deck.image_url ?? null,
      totalCards,
      newCards,
      learningCards,
      reviewCards,
      masteredCards,
      overallAccuracy,
      lastStudiedAt,
      dueToday,
    };
  },

  // 19 Get Overall Progress (auth)
  getOverallProgress: async (userId) => {
    // get user decks (own + copied), but progress is for user’s cards
    const decks = await prisma.flashcard_decks.findMany({
      where: { user_id: userId, is_active: true, deleted_date: null },
      select: { id: true, title: true, image_url: true },
      orderBy: { order: "asc" },
    });

    let totalDecks = decks.length;
    let totalCards = 0;
    let totalMastered = 0;
    let totalLearning = 0;
    let totalDueToday = 0;
    let correct = 0, incorrect = 0;
    let lastStudiedAt = null;

    const deckProgress = [];
    for (const d of decks) {
      const cards = await prisma.flashcards.findMany({
        where: { deck_id: d.id, is_active: true, deleted_date: null },
        select: { id: true },
      });
      const ids = cards.map(x => x.id);
      totalCards += ids.length;

      const progress = await prisma.flashcard_progress.findMany({
        where: { user_id: userId, flashcard_id: { in: ids }, is_active: true, deleted_date: null },
      });

      const now = new Date();
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      let masteredCards = 0;
      let learningCards = 0;
      let dueToday = 0;

      for (const p of progress) {
        if (p.status === 3) masteredCards++;
        if (p.status === 1) learningCards++;
        if (!p.next_review_at || new Date(p.next_review_at) <= endOfToday) dueToday++;

        correct += p.correct_count || 0;
        incorrect += p.incorrect_count || 0;

        if (p.last_reviewed_at) {
          const t = new Date(p.last_reviewed_at);
          if (!lastStudiedAt || t > new Date(lastStudiedAt)) lastStudiedAt = t;
        }
      }

      totalMastered += masteredCards;
      totalLearning += learningCards;
      totalDueToday += dueToday;

      deckProgress.push({
        deckId: d.id,
        deckTitle: d.title,
        totalCards: ids.length,
        masteredCards,
        dueToday,
      });
    }

    const overallAccuracy = correct + incorrect > 0 ? (correct / (correct + incorrect)) * 100 : 0;

    // studyStreak: doc có field nhưng backend JS hiện tại chưa có logic streak flashcard riêng
    // => trả 0 để giữ đúng shape, sau này bạn có thể thay bằng logic thực
    return {
      totalDecks,
      totalCards,
      totalMastered,
      totalLearning,
      totalDueToday,
      overallAccuracy,
      studyStreak: 0,
      lastStudiedAt,
      deckProgress,
    };
  },

  // 20 Get Per-Card Progress (auth)
  getPerCardProgress: async (userId, deckId) => {
    const deck = await getDeckOrNull(deckId);
    if (!deck) throw httpError(404, "Deck not found");
    if (!canViewDeck(deck, userId)) throw httpError(403, "Forbidden");

    const cards = await prisma.flashcards.findMany({
      where: { deck_id: deckId, is_active: true, deleted_date: null },
      select: { id: true, english_term: true, vietnamese_term: true },
      orderBy: { order: "asc" },
    });

    const progress = await prisma.flashcard_progress.findMany({
      where: { user_id: userId, flashcard_id: { in: cards.map(c => c.id) }, is_active: true, deleted_date: null },
    });
    const progMap = new Map(progress.map(p => [p.flashcard_id, p]));

    return cards.map(c => {
      const p = progMap.get(c.id);
      const correctCount = p?.correct_count ?? 0;
      const incorrectCount = p?.incorrect_count ?? 0;
      const accuracy = (correctCount + incorrectCount) > 0
        ? (correctCount / (correctCount + incorrectCount)) * 100
        : 0;

      // doc response shape :contentReference[oaicite:17]{index=17}
      return {
        flashcardId: c.id,
        englishTerm: c.english_term,
        vietnameseTerm: c.vietnamese_term,
        status: p?.status ?? 0,
        repetitionCount: p?.repetition_count ?? 0,
        easeFactor: p?.ease_factor ?? 2.5,
        intervalDays: p?.interval_days ?? 0,
        nextReviewAt: p?.next_review_at ?? null,
        lastReviewedAt: p?.last_reviewed_at ?? null,
        correctCount,
        incorrectCount,
        accuracy,
      };
    });
  },
};
