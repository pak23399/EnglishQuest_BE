// src/services/dictionary.service.js

// In-memory cache để tránh gọi lặp (rất quan trọng khi AI generate 10-50 cards)
const cache = new Map(); // key -> { url, exp }
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
const MAX_CACHE = 2000;

function setCache(key, url) {
  if (cache.size >= MAX_CACHE) {
    // delete oldest
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { url, exp: Date.now() + CACHE_TTL_MS });
}

function getCache(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() > v.exp) {
    cache.delete(key);
    return null;
  }
  return v.url || null;
}

// chọn audio ưu tiên: US trước, rồi GB/UK, rồi cái đầu tiên có audio
function pickAudioUrl(entry) {
  const phonetics = Array.isArray(entry?.phonetics) ? entry.phonetics : [];
  const urls = phonetics
    .map(p => (typeof p?.audio === "string" ? p.audio.trim() : ""))
    .filter(Boolean);

  if (!urls.length) return null;

  // DictionaryAPI hay trả nhiều link: ưu tiên có "us" trước, rồi "uk"/"gb"
  const us = urls.find(u => /-us\.mp3|\/us\//i.test(u));
  if (us) return us;

  const gb = urls.find(u => /-uk\.mp3|-gb\.mp3|\/uk\/|\/gb\//i.test(u));
  if (gb) return gb;

  return urls[0];
}

// “run”, “go”, “take off” …
// bạn có thể chọn chỉ lấy word đầu tiên nếu muốn strict single-word
function normalizeLookupKey(term) {
  return String(term || "")
    .trim()
    .toLowerCase();
}

async function getAudioUrlForTerm(term) {
  const key = normalizeLookupKey(term);
  if (!key) return null;

  const cached = getCache(key);
  if (cached) return cached;

  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`;

  try {
    const resp = await fetch(url, { headers: { "accept": "application/json" } });
    if (!resp.ok) {
      // 404 => từ không có trong dict (hoặc phrase lạ)
      setCache(key, null);
      return null;
    }
    const data = await resp.json();
    const entry = Array.isArray(data) ? data[0] : null;

    const audioUrl = pickAudioUrl(entry);
    setCache(key, audioUrl || null);
    return audioUrl || null;
  } catch (_) {
    // lỗi mạng => đừng fail cả request create deck
    return null;
  }
}

module.exports = { getAudioUrlForTerm };
