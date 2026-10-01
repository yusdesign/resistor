import { readValue, writeValue, setStorageDebugger, setStorageNative } from './storage.js';

let dbg = () => {};
export function setLibraryDebugger(fn) { dbg = fn; }

let IS_NATIVE = false;
let Soma = null;
export function setLibraryNative(isNative, somaPlugin) {
  IS_NATIVE = isNative;
  Soma = somaPlugin;
}

const LIBRARY_KEY = 'resistor_library';
const MAX_ENTRIES = 200;

let library = {};

export async function loadLibrary() {
  const stored = await readValue(LIBRARY_KEY);
  if (stored) {
    try { library = JSON.parse(stored); } catch { library = {}; }
  }
  return library;
}

export function getLibraryEntry(artist, title) {
  return library[`${artist} - ${title}`] || null;
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
      artist, title,
      firstPlayed: now, lastPlayed: now,
      count: 1,
      hasLyrics: false,
      synced: false,
      offsetSec: 0,
    };
    pruneLibrary();
  }
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
  return library[`${artist} - ${title}`]?.offsetSec ?? 0;
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

function pruneLibrary() {
  const keys = Object.keys(library);
  if (keys.length <= MAX_ENTRIES) return;
  keys.sort((a, b) =>
    (library[a].lastPlayed || '').localeCompare(library[b].lastPlayed || ''));
  const toDrop = keys.slice(0, keys.length - MAX_ENTRIES);
  for (const k of toDrop) delete library[k];
}

function saveLibrary() {
  writeValue(LIBRARY_KEY, JSON.stringify(library));
}
