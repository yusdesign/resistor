// ─── STORAGE: localStorage + native mirror ───
let dbg = () => {};
export function setStorageDebugger(fn) { dbg = fn; }

let IS_NATIVE = false;
let Soma = null;
export function setStorageNative(isNative, somaPlugin) {
  IS_NATIVE = isNative;
  Soma = somaPlugin;
}

function getSoma() {
  if (Soma) return Soma;
  if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Soma) {
    Soma = window.Capacitor.Plugins.Soma;
    return Soma;
  }
  return null;
}

// localStorage first, native as backup.
export function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    dbg('STORAGE', 'lsGet failed:', e.message);
    return null;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    dbg('STORAGE', 'lsSet failed:', e.message);
  }
}

export async function nativeGet(key) {
  const plugin = getSoma();
  if (!IS_NATIVE || !plugin) return null;
  try {
    const { value } = await plugin.lyricsCacheGet({ key });
    return value;
  } catch (e) {
    dbg('STORAGE', 'nativeGet failed:', e.message);
    return null;
  }
}

export async function nativePut(key, value) {
  const plugin = getSoma();
  if (!IS_NATIVE || !plugin) return;
  try {
    await plugin.lyricsCachePut({ key, value });
  } catch (e) {
    dbg('STORAGE', 'nativePut failed:', e.message);
  }
}

// Read: localStorage, fall back to native, repopulate localStorage.
export async function readValue(key) {
  const local = lsGet(key);
  if (local !== null) return local;
  const remote = await nativeGet(key);
  if (remote !== null) lsSet(key, remote);
  return remote;
}

// Write: both.
export async function writeValue(key, value) {
  lsSet(key, value);
  await nativePut(key, value);
}
