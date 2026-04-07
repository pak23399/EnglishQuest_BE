// src/services/ai.service.js
const prisma = require("../prisma");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const { getAudioUrlForTerm } = require("./dictionary.service");

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function parseVocabList(input) {
  const raw = String(input || "").trim();
  if (!raw) return { mode: "topic", topic: "", vocab: [] };

  // Split by newline or common separators
  const parts = raw
    .split(/[\n,;|]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  // Unique case-insensitive
  const seen = new Set();
  const vocab = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      vocab.push(p);
    }
  }

  // Heuristic: if user pasted multiple items and used separators/newlines => vocab mode
  const looksLikeList =
    vocab.length >= 2 && (raw.includes("\n") || /[,;|]/.test(raw));

  if (looksLikeList) return { mode: "vocab", topic: "", vocab };
  return { mode: "topic", topic: raw, vocab: [] };
}

function normalizeCards(cards, targetCount) {
  const out = [];
  const seen = new Set();

  for (const c of cards || []) {
    const englishTerm = String(c.englishTerm || "").trim();
    const vietnameseTerm = String(c.vietnameseTerm || "").trim();
    if (!englishTerm || !vietnameseTerm) continue;

    const key = englishTerm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      englishTerm,
      vietnameseTerm,
      englishExample: c.englishExample ? String(c.englishExample).trim() : null,
      vietnameseExample: c.vietnameseExample ? String(c.vietnameseExample).trim() : null,
      pronunciation: c.pronunciation ? String(c.pronunciation).trim() : null,
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
      partOfSpeech: c.partOfSpeech ? String(c.partOfSpeech).trim() : null,
    });

    if (out.length >= targetCount) break;
  }

  return out;
}

async function extractResponseText(resp) {
  // 1) Some versions: resp.text() is a function
  if (resp && typeof resp.text === "function") return await resp.text();
  if (resp && typeof resp.text === "string") return resp.text;

  // 2) Some versions: resp.response.text()
  if (resp?.response && typeof resp.response.text === "function") return await resp.response.text();
  if (resp?.response && typeof resp.response.text === "string") return resp.response.text;

  // 3) Fallback: candidates content parts
  const parts = resp?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts.map(p => p?.text || "").join("");
    if (joined.trim()) return joined;
  }

  return "";
}

function stripCodeFences(s) {
  const t = String(s || "").trim();
  // remove ```json ... ``` or ``` ... ```
  return t
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

// Extract the first JSON object/array found in a string
function extractFirstJson(s) {
  const t = String(s || "");
  const firstObj = t.indexOf("{");
  const firstArr = t.indexOf("[");
  let start = -1;

  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);

  if (start === -1) return null;

  const openChar = t[start];
  const closeChar = openChar === "{" ? "}" : "]";

  let depth = 0;
  let inStr = false;
  let escape = false;

  for (let i = start; i < t.length; i++) {
    const ch = t[i];

    if (inStr) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === "\"") inStr = false;
      continue;
    }

    if (ch === "\"") { inStr = true; continue; }

    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;

    if (depth === 0) {
      return t.slice(start, i + 1);
    }
  }

  return null;
}

function safeJsonParse(rawText) {
  const cleaned = stripCodeFences(rawText);
  // try direct parse
  try { return JSON.parse(cleaned); } catch (_) {}

  // try extracting first JSON chunk
  const chunk = extractFirstJson(cleaned);
  if (!chunk) throw new Error("No JSON found in model output");
  return JSON.parse(chunk);
}
async function getNextDeckOrder(userId) {
  const maxOrder = await prisma.flashcard_decks.aggregate({
    where: { user_id: userId, is_active: true, deleted_date: null },
    _max: { order: true },
  });
  return (maxOrder._max.order ?? 0) + 1;
}

/**
 * Generates flashcards using Gemini.
 * - body.topic: string (topic OR pasted vocab list)
 * - body.count: number
 * - body.deckTitle?: string
 * - body.deckDescription?: string
 * - body.isPublic?: boolean
 */
async function generateFlashcards(userId, body) {
  const inputText = String(body?.topic || "").trim();
  const count = Number(body?.count || 10);
  const deckTitleInput = body?.deckTitle ? String(body.deckTitle).trim() : "";
  const deckDescriptionInput = body?.deckDescription ? String(body.deckDescription).trim() : "";
  const isPublic = body?.isPublic === true;

  if (!inputText) throw httpError(400, "topic is required");
  const n = Math.min(50, Math.max(1, Number.isFinite(count) ? count : 10));

  const parsed = parseVocabList(inputText);

  // JSON schema for structured output
  // -------------------- Schema (preferred keys for FE) --------------------
  const schema = {
    type: "object",
    properties: {
      flashcards: {
        type: "array",
        items: {
          type: "object",
          properties: {
            englishTerm: { type: "string" },
            vietnameseTerm: { type: "string" },
            englishExample: { type: "string" },
            vietnameseExample: { type: "string" },
            pronunciation: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            partOfSpeech: { type: "string" },
          },
          required: ["englishTerm", "vietnameseTerm"],
        },
      },
    },
    required: ["flashcards"],
  };

  // Strong format rule to reduce key drifting
  const hardRule = [
    "IMPORTANT OUTPUT FORMAT:",
    'Return ONLY valid JSON object with exactly this shape: {"flashcards":[...]}',
    "Each flashcard MUST use EXACT keys:",
    "- englishTerm (string)",
    "- vietnameseTerm (string)",
    "Optional keys:",
    "- englishExample, vietnameseExample, pronunciation, tags, partOfSpeech",
    "Do NOT use other key names like english_word, english_term, english, vietnamese_translation, etc.",
    "No markdown. No code fences. No extra text.",
  ].join("\n");

  // -------------------- Prompt --------------------
  let prompt = "";
  if (parsed.mode === "vocab") {
    const list = parsed.vocab.slice(0, 200);
    prompt = [
      hardRule,
      "",
      "You generate English-Vietnamese flashcards for a learning app.",
      `The user provided a vocabulary list. Create exactly ${n} flashcards.`,
      "",
      "Rules:",
      "- Use the provided terms first, keep the same spelling.",
      "- If the list contains phrases/sentences, turn them into useful flashcards.",
      "- If the list has fewer than required, add closely related terms to reach the required count.",
      "- Vietnamese translation must be natural and correct.",
      "- Provide short examples in BOTH English and Vietnamese when possible.",
      "- Avoid duplicates.",
      "",
      "Vocabulary list:",
      list.map((x) => `- ${x}`).join("\n"),
    ].join("\n");
  } else {
    prompt = [
      hardRule,
      "",
      "You generate English-Vietnamese flashcards for a learning app.",
      `Topic: ${parsed.topic}`,
      `Create exactly ${n} flashcards for this topic.`,
      "",
      "Rules:",
      "- Mix common words/phrases that are useful in real life.",
      "- Vietnamese translation must be natural and correct.",
      "- Provide short examples in BOTH English and Vietnamese when possible.",
      "- Avoid duplicates.",
    ].join("\n");
  }

  // -------------------- Call Gemini --------------------
  const resp = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.4,
    },
  });

  // -------------------- Parse JSON --------------------
  const text = await extractResponseText(resp);
  if (!text.trim()) throw httpError(502, "AI returned empty response");

  let json;
  try {
    json = safeJsonParse(text);
    console.log("AI parsed JSON keys:", Object.keys(json || {}));
    console.log(
      "AI parsed JSON sample:",
      JSON.stringify(json, null, 2).slice(0, 2000)
    );
  } catch (e) {
    console.error("Gemini raw output (first 1500 chars):", text.slice(0, 1500));
    throw httpError(502, "AI returned invalid JSON");
  }

  // -------------------- Normalize (tolerant mapping) --------------------
  function pickFirstString(obj, keys) {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  // Support: {flashcards:[...]}, OR array directly, OR {items:[...]}, OR {cards:[...]}
  const rawCards = Array.isArray(json?.flashcards)
    ? json.flashcards
    : Array.isArray(json)
      ? json
      : Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.cards)
          ? json.cards
          : [];

  const normalized = rawCards
    .map((c) => {
      const englishTerm = pickFirstString(c, [
        "englishTerm",
        "english_term",
        "english_word",
        "english_phrase",
        "englishPhrase",
        "english",
        "en",
        "term",
        "word",
        "front",
      ]);

      const vietnameseTerm = pickFirstString(c, [
        "vietnameseTerm",
        "vietnamese_term",
        "vietnamese_translation",
        "vietnamese",
        "vi",
        "translation",
        "meaning",
        "back",
      ]);

      const englishExample = pickFirstString(c, [
        "englishExample",
        "english_example",
        "example_english",
        "exampleEn",
        "exampleEnglish",
        "example",
      ]);

      const vietnameseExample = pickFirstString(c, [
        "vietnameseExample",
        "vietnamese_example",
        "example_vietnamese",
        "exampleVi",
        "exampleVietnamese",
      ]);

      const pronunciation = pickFirstString(c, ["pronunciation", "ipa"]);

      const tags = Array.isArray(c?.tags) ? c.tags.map(String).slice(0, 10) : [];
      const partOfSpeech = pickFirstString(c, ["partOfSpeech", "pos"]);

      return {
        englishTerm,
        vietnameseTerm,
        englishExample: englishExample || null,
        vietnameseExample: vietnameseExample || null,
        pronunciation: pronunciation || null,
        tags,
        partOfSpeech: partOfSpeech || null,
      };
    })
    .filter((x) => x.englishTerm && x.vietnameseTerm)
    .slice(0, n);

  if (normalized.length === 0) {
    console.error(
      "AI returned no valid flashcards. First raw card sample:",
      JSON.stringify(rawCards?.[0] || {}, null, 2)
    );
    throw httpError(502, "AI returned no valid flashcards");
  }

  const audioUrls = await Promise.all(
    normalized.map(c => getAudioUrlForTerm(c.englishTerm).catch(() => null))
  );

  const previewCards = normalized.map((c, idx) => ({
    ...c,
    audioUrl: audioUrls[idx] ?? null,
  }));


  // Return shape FE expects
  return {
    flashcards: previewCards,
  suggestedDeckTitle:
    deckTitleInput ||
    (parsed.mode === "topic" ? `AI: ${parsed.topic}` : "AI: Vocabulary List"),
  suggestedDeckDescription: deckDescriptionInput || null,
  isPublic,
  };
}
async function saveGeneratedFlashcards(userId, body) {
  const deckTitle = String(body?.deckTitle || body?.title || "").trim();
  if (!deckTitle) throw httpError(400, "deckTitle is required");

  const deckDescription = body?.deckDescription ? String(body.deckDescription).trim() : null;
  const isPublic = body?.isPublic === true;

  const flashcards = Array.isArray(body?.flashcards) ? body.flashcards : [];
  if (flashcards.length === 0) throw httpError(400, "flashcards is required");

  // Normalize input from FE (expects englishTerm/vietnameseTerm)
  const normalized = flashcards.map((c) => ({
    englishTerm: String(c.englishTerm || "").trim(),
    vietnameseTerm: String(c.vietnameseTerm || "").trim(),
    englishExample: c.englishExample ? String(c.englishExample).trim() : null,
    vietnameseExample: c.vietnameseExample ? String(c.vietnameseExample).trim() : null,
    pronunciation: c.pronunciation ? String(c.pronunciation).trim() : null,
    tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    partOfSpeech: c.partOfSpeech ? String(c.partOfSpeech).trim() : null,
  })).filter(x => x.englishTerm && x.vietnameseTerm);

  if (normalized.length === 0) throw httpError(400, "No valid flashcards to save");

  const now = new Date();
  const deckId = crypto.randomUUID();
  const deckOrder = await getNextDeckOrder(userId);

  const deck = await prisma.flashcard_decks.create({
    data: {
      id: deckId,
      user_id: userId,
      title: deckTitle,
      description: deckDescription,
      image_url: null,
      order: deckOrder,
      difficulty: 1,
      is_public: isPublic,
      copy_count: 0,
      created_date: now,
      created_by: userId,
      is_active: true,
    },
  });

  // ✅ Lookup audio per card (dictionary)
  const audioUrls = await Promise.all(
    normalized.map(c => getAudioUrlForTerm(c.englishTerm).catch(() => null))
  );

  // ✅ IMPORTANT: audio_url must be single value per row, not the whole array
  const rows = normalized.map((c, idx) => ({
    id: crypto.randomUUID(),
    deck_id: deck.id,
    english_term: c.englishTerm,
    vietnamese_term: c.vietnameseTerm,
    english_example: c.englishExample,
    vietnamese_example: c.vietnameseExample,
    pronunciation: c.pronunciation,
    audio_url: audioUrls[idx] ?? null,   // ✅ FIX HERE
    image_url: null,
    difficulty: 1,
    order: idx + 1,
    metadata: { tags: c.tags ?? [], partOfSpeech: c.partOfSpeech ?? null, notes: null },
    created_date: now,
    created_by: userId,
    is_active: true,
  }));

  await prisma.flashcards.createMany({ data: rows });

  return {
    deckId: deck.id,
    deckTitle: deck.title,
    importedCount: rows.length,
  };
}

module.exports = {
  generateFlashcards,
  saveGeneratedFlashcards,
};
