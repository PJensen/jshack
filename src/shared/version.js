const VERSION_STORAGE_KEY = 'jshack:lastSeenVersion';
const VERSION_COOKIE_KEY = 'jshack_lastSeenVersion';
const EMPTY_VERSION_STATE = Object.freeze({
  currentVersion: '',
  previousVersion: null,
  isNew: false,
});

/** @type {{ currentVersion: string, previousVersion: string|null, isNew: boolean } | null} */
let versionState = null;

function readFromLocalStorage() {
  try {
    const raw = globalThis?.localStorage?.getItem(VERSION_STORAGE_KEY);
    return typeof raw === 'string' ? raw.trim() : '';
  } catch {
    return '';
  }
}

function writeToLocalStorage(version) {
  try {
    globalThis?.localStorage?.setItem(VERSION_STORAGE_KEY, version);
  } catch {}
}

function readCookieValue(name) {
  const doc = globalThis?.document;
  if (!doc || typeof doc.cookie !== 'string') return '';
  const encodedName = `${encodeURIComponent(name)}=`;
  const chunks = doc.cookie.split(';');
  for (let i = 0; i < chunks.length; i++) {
    const entry = chunks[i].trim();
    if (!entry.startsWith(encodedName)) continue;
    const encodedValue = entry.slice(encodedName.length);
    try { return decodeURIComponent(encodedValue).trim(); }
    catch { return encodedValue.trim(); }
  }
  return '';
}

function writeCookieValue(name, value) {
  const doc = globalThis?.document;
  if (!doc) return;
  const encodedName = encodeURIComponent(name);
  const encodedValue = encodeURIComponent(value);
  doc.cookie = `${encodedName}=${encodedValue}; path=/; max-age=315360000; samesite=lax`;
}

function readStoredVersion() {
  return readFromLocalStorage() || readCookieValue(VERSION_COOKIE_KEY) || '';
}

function writeStoredVersion(version) {
  writeToLocalStorage(version);
  writeCookieValue(VERSION_COOKIE_KEY, version);
}

/**
 * Persists this run's version for this browser/device and reports whether it is newly updated.
 * @param {string} version
 */
export function markVersionSeen(version) {
  const currentVersion = String(version || '').trim();
  if (!currentVersion) return EMPTY_VERSION_STATE;
  const previousRaw = readStoredVersion();
  const previousVersion = previousRaw || null;
  const isNew = Boolean(previousVersion && previousVersion !== currentVersion);
  writeStoredVersion(currentVersion);
  versionState = { currentVersion, previousVersion, isNew };
  return versionState;
}

/**
 * Returns update state for the loaded VERSION value.
 */
export function getVersionState() {
  if (versionState) return versionState;
  const loadedVersion = String((/** @type {any} */ (globalThis)).VERSION || '').trim();
  if (!loadedVersion) return EMPTY_VERSION_STATE;
  return markVersionSeen(loadedVersion);
}

/**
 * Loads the application version from the VERSION file and stores it on global scope.
 */
export async function loadVersion() {
  const res = await fetch('./VERSION', { cache: 'no-store' });
  if (!res.ok) throw new Error('not ok');
  const text = (await res.text()).trim();
  (/** @type {any} */ (globalThis)).VERSION = text;
  markVersionSeen(text);
}

// Start loading the version but do not use top-level await.
// Export the promise so other modules can wait for it if they need to.
export const versionLoaded = loadVersion().catch(() => {});
