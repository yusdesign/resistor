// ─── LYRICS CORE ───
const LYRICS_CACHE_KEY = 'resistor_lyrics_cache';

let lyricsCache = {};
let rateLimitedUntil = 0;

const LYRICS_MISS_KEY = 'resistor_lyrics_misses';
const MISS_TTL_MS = 24 * 60 * 60 * 1000;

export function loadLyricsCache() {
  const stored = localStorage.getItem(LYRICS_CACHE_KEY);
  if (stored) lyricsCache = JSON.parse(stored);
  return lyricsCache;
}

export function saveLyricsCache() {
  localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(lyricsCache));
}

let lyricsMisses = JSON.parse(localStorage.getItem(LYRICS_MISS_KEY) || '{}');

function saveMisses() {
  localStorage.setItem(LYRICS_MISS_KEY, JSON.stringify(lyricsMisses));
}

async function tryLrclib(artist, title) {
  if (Date.now() < rateLimitedUntil) return null;

  let response;
  try {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    response = await fetch(url);
  } catch (e) {
    return null;
  }

  if (response.status === 503) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
    rateLimitedUntil = Date.now() + retryAfter * 1000;
    return null;
  }
  if (response.status === 404) return null;
  if (!response.ok) return null;

  try {
    const data = await response.json();
    return data.syncedLyrics || data.plainLyrics || null;
  } catch {
    return null;
  }
}

async function tryLyricsOvh(artist, title) {
  let response;
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    response = await fetch(url);
  } catch (e) {
    return null;
  }
  if (!response.ok) return null;

  try {
    const data = await response.json();
    return data.lyrics || null;
  } catch {
    return null;
  }
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

  // Try LRCLIB first (better coverage, and may have synced/timed lyrics)
  let lyrics = await tryLrclib(artist, title);

  // Fall back to lyrics.ovh (CORS-friendly, plain text only)
  if (!lyrics) {
    lyrics = await tryLyricsOvh(artist, title);
  }

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
