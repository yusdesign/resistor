// ─── LYRICS CORE ───
const LYRICS_CACHE_KEY = 'resistor_lyrics_cache';

let lyricsCache = {};

export function loadLyricsCache() {
  const stored = localStorage.getItem(LYRICS_CACHE_KEY);
  if (stored) lyricsCache = JSON.parse(stored);
  return lyricsCache;
}

export function saveLyricsCache() {
  localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(lyricsCache));
}

export async function fetchLyrics(artist, title) {
  const isNative = typeof window !== 'undefined'
    && !!window.Capacitor?.isNativePlatform?.();
  if (!isNative) return null;

  const cacheKey = `${artist} - ${title}`;
  if (lyricsCache[cacheKey]) return lyricsCache[cacheKey];
  if (lyricsMisses[cacheKey] && Date.now() - lyricsMisses[cacheKey] < MISS_TTL_MS) {
    return null;
  }
  if (Date.now() < rateLimitedUntil) return null;

  let response;
  try {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    response = await fetch(url);
  } catch (e) {
    lyricsMisses[cacheKey] = Date.now();
    saveMisses();
    return null;
  }

  // 503 — server is at its concurrent-load limit. Back off globally.
  if (response.status === 503) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
    rateLimitedUntil = Date.now() + retryAfter * 1000;
    return null;
  }

  // 404 — track genuinely not in the DB. Cache as a miss.
  if (response.status === 404) {
    lyricsMisses[cacheKey] = Date.now();
    saveMisses();
    return null;
  }

  if (!response.ok) {
    // 400, 5xx other than 503 — transient, don't cache
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    lyricsMisses[cacheKey] = Date.now();
    saveMisses();
    return null;
  }

  // 200 with instrumental: true → both fields null. Cache as miss.
  const lyrics = data.syncedLyrics || data.plainLyrics || null;
  if (lyrics) {
    lyricsCache[cacheKey] = lyrics;
    saveLyricsCache();
    return lyrics;
  }

  lyricsMisses[cacheKey] = Date.now();
  saveMisses();
  return null;
}

export function parseLrc(text) {
  // returns [{ time: seconds, text: "line" }, ...] or null if not LRC
  if (!text || !/^\[\d{2}:\d{2}/m.test(text)) return null;
  const lines = [];
  for (const raw of text.split('\n')) {
    const m = raw.match(/^\[(\d{2}):(\d{2})(?:[.:](\d{2,3}))?\]\s?(.*)$/);
    if (!m) continue;
    const mm = parseInt(m[1], 10);
    const ss = parseInt(m[2], 10);
    const frac = m[3] ? parseInt(m[3], 10) / (m[3].length === 3 ? 1000 : 100) : 0;
    lines.push({ time: mm * 60 + ss + frac, text: m[4] });
  }
  return lines.length ? lines : null;
}
