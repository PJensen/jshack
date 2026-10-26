import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";
import { ItemInfo } from "../components/ItemInfo.js";

const EMPTY_AFFINITY = Object.freeze({});

function normalizedMap(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/** Resolve type-specific projectile modifiers from all equipped non-ammo gear. */
export function getAmmoAffinity(world, actorId, ammoIdentity) {
  const eq = world?.get(actorId, Equipment);
  if (!eq) return EMPTY_AFFINITY;
  const key = String(ammoIdentity || "").toLowerCase();
  const out = {};
  for (const slot of NON_AMMO_GEAR_SLOTS) {
    const itemId = Number(eq[slot] || 0) | 0;
    if (!(itemId > 0) || !world.isAlive(itemId)) continue;
    const affinities = normalizedMap(world.get(itemId, ItemInfo)?.ammoAffinities);
    const modifier = affinities?.[key] || affinities?.["*"];
    if (!modifier || typeof modifier !== "object") continue;
    for (const [name, value] of Object.entries(modifier)) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) continue;
      out[name] = name === "damageMultiplier" || name === "lootWeightMultiplier"
        ? (out[name] == null ? 1 : out[name]) * amount
        : (out[name] || 0) + amount;
    }
  }
  return Object.freeze(out);
}

/** Collect broad loot steering authored on the player's equipped gear. */
export function getEquippedLootBiases(world, actorId) {
  const eq = world?.get(actorId, Equipment);
  if (!eq) return null;
  const out = {};
  for (const slot of NON_AMMO_GEAR_SLOTS) {
    const itemId = Number(eq[slot] || 0) | 0;
    if (!(itemId > 0) || !world.isAlive(itemId)) continue;
    const biases = normalizedMap(world.get(itemId, ItemInfo)?.lootBiases);
    if (!biases) continue;
    for (const [key, value] of Object.entries(biases)) {
      const multiplier = Number(value);
      if (Number.isFinite(multiplier) && multiplier > 0) out[key] = (out[key] || 1) * multiplier;
    }
  }
  return Object.keys(out).length ? out : null;
}
