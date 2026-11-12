// Unified item catalog: equipment + magic/usable items.
// This is the single source of truth for item-like definitions.
// Split into category files for maintainability; this barrel re-exports
// the merged catalog and public API.
import { EQUIPMENT_ITEMS } from "./itemCatalogEquipment.js";
import { MAGIC_ITEMS } from "./itemCatalogMagic.js";
import { GEM_DEFS } from "./gems.js";
import { isWeaponCatalogItem, resolveWeaponVisualMeta } from "./weaponVisuals.js";
import { resolveWeaponFamily } from "./weaponFamilies.js";
import {
  canGemSocketDipTarget,
  createGemSocketDipHook,
} from "./itemCatalogHooks.js";

function buildItemCatalog() {
  const merged = {
    ...EQUIPMENT_ITEMS,
    ...MAGIC_ITEMS,
  };
  const out = {};
  for (const [id, rec] of Object.entries(merged)) {
    if (isWeaponCatalogItem(rec)) {
      const meta = resolveWeaponVisualMeta(rec);
      const withVisuals = {
        ...rec,
        weaponLengthCm: meta.weaponLengthCm,
        weaponVfxProfile: meta.weaponVfxProfile,
      };
      out[id] = {
        ...withVisuals,
        weaponFamily: rec.weaponFamily || resolveWeaponFamily(withVisuals) || "",
      };
      continue;
    }
    const weaponFamily = resolveWeaponFamily(rec);
    out[id] = weaponFamily ? { ...rec, weaponFamily } : rec;
  }
  return out;
}

export const ITEM_CATALOG = buildItemCatalog();

// ── Gem socket hook registry (separate from ITEM_CATALOG to avoid duplication) ──
// Gems are defined in gems.js; hooks live here and are resolved via getGemItemHooks().
const GEM_ITEM_HOOKS = Object.freeze(Object.fromEntries(
  Object.entries(GEM_DEFS)
    .filter(([, gem]) => gem?.socketable === true)
    .map(([identity]) => [identity, {
      canDipTarget: canGemSocketDipTarget,
      onDip: createGemSocketDipHook(identity),
    }]),
));

/**
 * Returns gem socket hooks for a given gem identity, or null if not found.
 * @param {string} identity
 * @returns {{ canDipTarget: Function, onDip: Function } | null}
 */
export function getGemItemHooks(identity) {
  return GEM_ITEM_HOOKS[String(identity || "").toLowerCase()] || null;
}

const ITEM_CATALOG_ID_ALIASES = Object.freeze({
  // Save compatibility: pre-catalog touchstone identity
  touchstone: "stone_touchstone",
});

/**
 * @param {string} id
 * @returns {string}
 */
function resolveCatalogItemId(id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return "";
  return ITEM_CATALOG_ID_ALIASES[key] || key;
}

export function listCatalogItems() { return Object.values(ITEM_CATALOG); }
export function getCatalogItem(id) {
  const key = resolveCatalogItemId(id);
  if (!key) return null;
  return ITEM_CATALOG[key] || null;
}
export function isCatalogEquipment(def) { return !!def && String(def.catalogKind) === "equipment"; }
export function isCatalogMagic(def) { return !!def && String(def.catalogKind) === "magic"; }

/**
 * Register a content-DSL item into the unified catalog at runtime.
 * @param {string} id
 * @param {object} def - catalog-compatible item definition
 * @param {{ override?: boolean }} [opts]
 */
export function registerCatalogItem(id, def, opts = {}) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return;
  if (ITEM_CATALOG[key] && opts.override !== true) return;
  ITEM_CATALOG[key] = def;
}
