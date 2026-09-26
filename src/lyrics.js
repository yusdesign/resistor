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
  // Lyrics only make sense when we actually have a track playing —
  // which only happens in the APK. On the web, skip entirely.
  const isNative = typeof window !== 'undefined'
    && !!window.Capacitor?.isNativePlatform?.();
  if (!isNative) return null;

  const cacheKey = `${artist} - ${title}`;
  if (lyricsCache[cacheKey]) return lyricsCache[cacheKey];

  try {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const lyrics = data.syncedLyrics || data.plainLyrics || null;
      if (lyrics) {
        lyricsCache[cacheKey] = lyrics;
        saveLyricsCache();
        return lyrics;
      }
    }
    return null;
  } catch (e) {
    console.debug('Lyrics fetch error:', e.message);
    return null;
  }
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
