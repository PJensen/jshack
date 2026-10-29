import { getCatalogItem, getGemItemHooks } from "../../data/itemCatalog.js";
import { createCursedHealthPotionHook } from "../../data/itemCatalogHooks.js";

/**
 * Frozen item-hook contract.
 * Canonical keys are camelCase.
 * Snake_case aliases are accepted for content ergonomics.
 */
export const ITEM_HOOK_ALIASES = Object.freeze({
  before_drink: "beforeDrink",
  on_drink: "onDrink",
  after_drink: "afterDrink",
  can_dip_target: "canDipTarget",
  before_throw: "beforeThrow",
  on_throw: "onThrow",
  after_throw: "afterThrow",
  before_dip: "beforeDip",
  on_dip: "onDip",
  after_dip: "afterDip",
  before_use: "beforeUse",
  on_use: "onUse",
  after_use: "afterUse",
});

export const ITEM_HOOK_KEYS = Object.freeze([
  "beforeDrink",
  "onDrink",
  "afterDrink",
  "canDipTarget",
  "beforeThrow",
  "onThrow",
  "afterThrow",
  "beforeDip",
  "onDip",
  "afterDip",
  "beforeUse",
  "onUse",
  "afterUse",
]);

/**
 * @param {string} key
 * @returns {string}
 */
export function canonicalHookKey(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return "";
  return ITEM_HOOK_ALIASES[normalized] || normalized;
}

/**
 * @param {Record<string, unknown> | null | undefined} source
 * @returns {Record<string, Function>}
 */
export function normalizeItemHooks(source) {
  if (!source || typeof source !== "object") return {};
  const out = {};

  for (let i = 0; i < ITEM_HOOK_KEYS.length; i++) {
    const key = ITEM_HOOK_KEYS[i];
    const direct = source[key];
    if (typeof direct === "function") {
      out[key] = direct;
      continue;
    }

    const aliasEntries = Object.entries(ITEM_HOOK_ALIASES);
    for (let a = 0; a < aliasEntries.length; a++) {
      const [alias, canonical] = aliasEntries[a];
      if (canonical !== key) continue;
      const maybeFn = source[alias];
      if (typeof maybeFn === "function") {
        out[key] = maybeFn;
        break;
      }
    }
  }

  return out;
}

/**
 * @param {any} def
 * @returns {Record<string, Function>}
 */
export function resolveItemHooksFromDef(def) {
  const topLevel = normalizeItemHooks(def);
  const nested = normalizeItemHooks(def?.hooks && typeof def.hooks === "object" ? def.hooks : null);
  return { ...topLevel, ...nested };
}

/**
 * @param {string} identity
 * @returns {Record<string, Function>}
 */
export function getItemHooksByIdentity(identity) {
  const key = String(identity || "").toLowerCase();
  const def = getCatalogItem(key);
  if (def) return resolveItemHooksFromDef(def);
  if (key === "potion_health") return { onDrink: createCursedHealthPotionHook() };
  const gemHooks = getGemItemHooks(key);
  if (gemHooks) return normalizeItemHooks(gemHooks);
  return {};
}

/**
 * @param {string} identity
 * @param {string} hookKey
 * @returns {Function | null}
 */
export function getItemHookByIdentity(identity, hookKey) {
  const canonical = canonicalHookKey(hookKey);
  if (!canonical) return null;
  const hooks = getItemHooksByIdentity(identity);
  const fn = hooks[canonical];
  return typeof fn === "function" ? fn : null;
}
