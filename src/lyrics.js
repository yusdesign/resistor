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
  const cacheKey = `${artist} - ${title}`;
  if (lyricsCache[cacheKey]) return lyricsCache[cacheKey];

  try {
    // Primary: LRCLIB (free, no auth)
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
