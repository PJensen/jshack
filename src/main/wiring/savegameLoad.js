import { applySnapshot } from "../../lib/ecs-js/serialization.js";
import { buildSavegameSerializationRegistry } from "./savegameSerializationRegistry.js";
import { normalizeEffectSnapshot } from "../../rules/utils/effectInstances.js";
import { clearSpatialIndex } from "../../rules/utils/spatialIndex.js";
import { invalidateTileQueryCache } from "../../rules/utils/tileQueryCache.js";
import { normalizeInventorySnapshot } from "../../rules/utils/inventorySnapshotMigration.js";
import { ensureCalendarState } from "../../rules/utils/calendarState.js";
export { SAVEGAME_KEY } from "../../shared/savegameKeys.js";
import { SAVEGAME_KEY } from "../../shared/savegameKeys.js";

/**
 * @param {Storage | null | undefined} [storage]
 * @returns {Storage | null}
 */
function resolveStorage(storage) {
  if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") return storage;
  const ls = globalThis?.localStorage;
  if (ls && typeof ls.getItem === "function" && typeof ls.setItem === "function") return ls;
  return null;
}

/**
 * @param {Storage | null | undefined} [storage]
 * @returns {boolean}
 */
export function hasSavegame(storage) {
  const store = resolveStorage(storage);
  if (!store) return false;
  try {
    return !!store.getItem(SAVEGAME_KEY);
  } catch {
    return false;
  }
}

/**
 * @param {Storage | null | undefined} [storage]
 * @returns {any | null}
 */
export function readSavegamePayload(storage) {
  const store = resolveStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(SAVEGAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || !parsed.world || parsed.world.v !== 1 || !parsed.world.comps) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {Storage | null | undefined} [storage]
 */
export function clearSavegamePayload(storage) {
  const store = resolveStorage(storage);
  if (!store) return;
  try { store.removeItem(SAVEGAME_KEY); } catch (e) { console.warn('[savegameLoad] storage operation failed:', e); }
}

/**
 * Validate basic save invariants before mutating world state.
 * Requires exactly one player and a valid position for that player.
 * @param {any} save
 * @returns {{ ok: boolean, reason?: string, playerId?: number }}
 */
export function validateSaveSnapshot(save) {
  const comps = save?.world?.comps;
  if (!comps || typeof comps !== "object") return { ok: false, reason: "missing comps" };
  const playerRows = Array.isArray(comps.Player) ? comps.Player : [];
  if (playerRows.length !== 1) return { ok: false, reason: `expected 1 player, found ${playerRows.length}` };
  const playerId = Number(playerRows[0]?.[0] || 0) | 0;
  if (!(playerId > 0)) return { ok: false, reason: "invalid player id" };
  const posRows = Array.isArray(comps.Position) ? comps.Position : [];
  const posRow = posRows.find((row) => (Number(row?.[0] || 0) | 0) === playerId);
  const pos = posRow?.[1];
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
    return { ok: false, reason: "player position missing/invalid" };
  }
  return { ok: true, playerId };
}

/**
 * @param {any} save
 * @returns {number|null}
 */
export function readSavedDepth(save) {
  const rows = save?.world?.comps?.DungeonState;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const ds = rows[0]?.[1];
  const depth = Number(ds?.currentDepth);
  if (!Number.isFinite(depth) || depth < 0) return null;
  return depth | 0;
}

/**
 * @param {any} save
 * @returns {number|null}
 */
export function readSavedSeed(save) {
  const seed = Number(save?.world?.meta?.seed);
  if (!Number.isFinite(seed)) return null;
  return (seed >>> 0);
}

/**
 * Restore a save snapshot onto an existing world.
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {any} save
 * @returns {{ playerId: number }}
 */
export function restoreSnapshotFromSavegame(world, save) {
  const normalizedWorld = normalizeEffectSnapshot(normalizeInventorySnapshot(save?.world));
  const normalizedSave = (normalizedWorld === save?.world)
    ? save
    : { ...save, world: normalizedWorld };
  const validity = validateSaveSnapshot(normalizedSave);
  if (!validity.ok) throw new Error(`invalid save: ${validity.reason}`);
  const reg = buildSavegameSerializationRegistry(world);
  const WorldCtor = world?.constructor;
  if (WorldCtor && typeof WorldCtor.fromSnapshot === "function") {
    // Validate/normalize through core API (throws on malformed or unknown data).
    // We still apply the original payload to preserve exact saved entity/component rows.
    WorldCtor.fromSnapshot(normalizedSave.world, reg, { skipUnknown: false });
  }

  applySnapshot(world, normalizedSave.world, reg, { mode: "replace" });
  if (Number.isInteger(normalizedSave.world.meta?.step)) world.step = normalizedSave.world.meta.step;
  ensureCalendarState(world);
  clearSpatialIndex(world);
  invalidateTileQueryCache(world);
  return { playerId: validity.playerId || 0 };
}
