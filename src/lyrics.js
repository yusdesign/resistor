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
    response = await fetch(url, {
      headers: {
        'X-User-Agent': 'Resistor v1.0 (https://github.com/yusdesign/resistor)',
      },
    });
  } catch (e) {
    return null;
  }

  // Rate limited
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
    rateLimitedUntil = Date.now() + retryAfter * 1000;
    return null;
  }
  // Server congestion
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

async function tryLyricsOvhSuggest(artist, title) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  let search;
  try {
    const q = encodeURIComponent(`${artist} ${title}`);
    search = await fetch(`https://api.lyrics.ovh/suggest/${q}`);
  } catch {
    return null;
  }
  if (!search.ok) return null;

  let results;
  try {
    results = await search.json();
  } catch {
    return null;
  }
  if (!Array.isArray(results) || results.length === 0) return null;

  const top = results[0];
  const a = top.artist?.name;
  const t = top.title;
  if (!a || !t) return null;

  if (!norm(t).includes(norm(title))) return null;

  let response;
  try {
    response = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`
    );
  } catch {
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

  let lyrics = await tryLrclib(artist, title);
  if (lyrics) {
    lyricsCache[cacheKey] = lyrics;
    saveLyricsCache();
    return lyrics;
  }

  lyrics = await tryLyricsOvhSuggest(artist, title);
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
