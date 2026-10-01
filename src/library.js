// ─── LIBRARY: tracks + lyrics index + offsets ───
let dbg = () => {};
export function setLibraryDebugger(fn) { dbg = fn; }

let IS_NATIVE = false;
let Soma = null;
export function setLibraryNative(isNative, somaPlugin) {
  IS_NATIVE = isNative;
  Soma = somaPlugin;
}

const LIBRARY_KEY = 'resistor_library';
const LIBRARY_NATIVE_NAMESPACE = 'library';
const MAX_ENTRIES = 200;

let library = {};

export function loadLibrary() {
  try {
    const stored = localStorage.getItem(LIBRARY_KEY);
    if (stored) library = JSON.parse(stored);
  } catch {
    library = {};
  }
  return library;
}

function saveLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch (e) {
    dbg('LIB', 'localStorage save failed:', e.message);
  }
  const plugin = Soma || (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Soma);
  if (IS_NATIVE && plugin) {
    plugin.lyricsCachePut({
      key: `${LIBRARY_NATIVE_NAMESPACE}:all`,
      value: JSON.stringify(library),
    }).catch(e => dbg('LIB', 'native save failed:', e.message));
  }
}

export async function syncLibraryFromNative() {
  const plugin = Soma || (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Soma);
  if (!IS_NATIVE || !plugin) return;
  try {
    const { value } = await plugin.lyricsCacheGet({ key: `${LIBRARY_NATIVE_NAMESPACE}:all` });
    if (!value) return;
    const remote = JSON.parse(value);
    // merge: prefer the entry with the newer lastPlayed
    for (const [k, v] of Object.entries(remote)) {
      if (!library[k] || (v.lastPlayed || '') > (library[k].lastPlayed || '')) {
        library[k] = v;
      }
    }
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); } catch {}
    dbg('LIB', 'synced from native:', Object.keys(library).length, 'entries');
  } catch (e) {
    dbg('LIB', 'native read failed:', e.message);
  }
}

function prune() {
  const keys = Object.keys(library);
  if (keys.length <= MAX_ENTRIES) return;
  keys.sort((a, b) =>
    (library[a].lastPlayed || '').localeCompare(library[b].lastPlayed || ''));
  const toDrop = keys.slice(0, keys.length - MAX_ENTRIES);
  for (const k of toDrop) delete library[k];
}

export function noteTrack(artist, title) {
  if (!artist || !title) return;
  const key = `${artist} - ${title}`;
  const now = new Date().toISOString();
  if (library[key]) {
    library[key].count = (library[key].count || 0) + 1;
    library[key].lastPlayed = now;
  } else {
    library[key] = {
      artist,
      title,
      firstPlayed: now,
      lastPlayed: now,
      count: 1,
      hasLyrics: false,
      synced: false,
      offsetSec: 0,
    };
  }
  prune();
  saveLibrary();
}

export function markLyrics(artist, title, { synced }) {
  const key = `${artist} - ${title}`;
  if (!library[key]) return;
  library[key].hasLyrics = true;
  library[key].synced = !!synced;
  saveLibrary();
}

export function markLyricsMissing(artist, title) {
  const key = `${artist} - ${title}`;
  if (!library[key]) return;
  library[key].hasLyrics = false;
  saveLibrary();
}

export function getOffset(artist, title) {
  const key = `${artist} - ${title}`;
  return library[key]?.offsetSec ?? 0;
}

export function setOffset(artist, title, seconds) {
  const key = `${artist} - ${title}`;
  if (!library[key]) return;
  library[key].offsetSec = seconds;
  saveLibrary();
}

export function getLibraryList() {
  return Object.values(library).sort((a, b) =>
    (b.lastPlayed || '').localeCompare(a.lastPlayed || ''));
}
