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
  if (Date.now() < rateLimitedUntil) {
    dbg('LYRICS', `lrclib: skipping, rate-limited for ${Math.round((rateLimitedUntil - Date.now()) / 1000)}s`);
    return null;
  }

  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  dbg('LYRICS', 'lrclib GET', url);

  let response;
  try {
    response = await fetch(url);
  } catch (e) {
    dbg('LYRICS', 'lrclib: fetch threw', e.name, e.message);
    return null;
  }

  dbg('LYRICS', 'lrclib: HTTP', response.status);

  if (response.status === 429 || response.status === 503) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
    rateLimitedUntil = Date.now() + retryAfter * 1000;
    dbg('LYRICS', `lrclib: rate-limited, backing off ${retryAfter}s`);
    return null;
  }
  if (response.status === 404) {
    dbg('LYRICS', 'lrclib: 404 track not found');
    return null;
  }
  if (!response.ok) {
    dbg('LYRICS', 'lrclib: non-OK status');
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    dbg('LYRICS', 'lrclib: JSON parse failed', e.message);
    return null;
  }

  dbg('LYRICS', 'lrclib: track', data.trackName, '—', data.artistName,
      '| synced:', !!data.syncedLyrics, '| plain:', !!data.plainLyrics);

  const lyrics = data.syncedLyrics || data.plainLyrics || null;
  if (!lyrics) {
    dbg('LYRICS', 'lrclib: 200 but no lyrics (instrumental?)');
    return null;
  }

  dbg('LYRICS', 'lrclib: HIT', lyrics.length, 'chars');
  return lyrics;
}

async function tryLyricsOvhSuggest(artist, title) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const q = encodeURIComponent(`${artist} ${title}`);
  dbg('LYRICS', 'ovh suggest GET', `https://api.lyrics.ovh/suggest/${q}`);

  let search;
  try {
    search = await fetch(`https://api.lyrics.ovh/suggest/${q}`);
  } catch (e) {
    dbg('LYRICS', 'ovh suggest: fetch threw', e.message);
    return null;
  }
  dbg('LYRICS', 'ovh suggest: HTTP', search.status);
  if (!search.ok) return null;

  let results;
  try {
    results = await search.json();
  } catch (e) {
    dbg('LYRICS', 'ovh suggest: JSON parse failed', e.message);
    return null;
  }

  dbg('LYRICS', 'ovh suggest: results', Array.isArray(results) ? results.length : 'not-array');
  if (!Array.isArray(results) || results.length === 0) return null;

  const top = results[0];
  const a = top.artist?.name;
  const t = top.title;
  dbg('LYRICS', 'ovh suggest: top', t, '—', a);
  if (!a || !t) return null;

  if (!norm(t).includes(norm(title))) {
    dbg('LYRICS', 'ovh suggest: top title does not match, discarding');
    return null;
  }

  let response;
  try {
    response = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`
    );
  } catch (e) {
    dbg('LYRICS', 'ovh lyrics: fetch threw', e.message);
    return null;
  }
  dbg('LYRICS', 'ovh lyrics: HTTP', response.status);
  if (!response.ok) return null;

  try {
    const data = await response.json();
    if (!data.lyrics) {
      dbg('LYRICS', 'ovh lyrics: 200 but no lyrics field');
      return null;
    }
    dbg('LYRICS', 'ovh lyrics: HIT', data.lyrics.length, 'chars');
    return data.lyrics;
  } catch (e) {
    dbg('LYRICS', 'ovh lyrics: JSON parse failed', e.message);
    return null;
  }
}

export async function fetchLyrics(artist, title) {
  const isNative = typeof window !== 'undefined'
    && !!window.Capacitor?.isNativePlatform?.();
  if (!isNative) return null;

  const cacheKey = `${artist} - ${title}`;
  dbg('LYRICS', 'fetchLyrics for', artist, '-', title);

  if (lyricsCache[cacheKey]) {
    dbg('LYRICS', 'cache HIT');
    return lyricsCache[cacheKey];
  }
  if (lyricsMisses[cacheKey] && Date.now() - lyricsMisses[cacheKey] < MISS_TTL_MS) {
    dbg('LYRICS', 'negative cache (recent miss)');
    return null;
  }

  let lyrics = await tryLrclib(artist, title);
  if (lyrics) {
    lyricsCache[cacheKey] = lyrics;
    saveLyricsCache();
    return lyrics;
  }

  dbg('LYRICS', 'lrclib miss, trying ovh suggest...');
  lyrics = await tryLyricsOvhSuggest(artist, title);
  if (lyrics) {
    dbg('LYRICS', 'ovh: HIT');
    lyricsCache[cacheKey] = lyrics;
    saveLyricsCache();
    return lyrics;
  }

  dbg('LYRICS', 'all providers missed');
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
