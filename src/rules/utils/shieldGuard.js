import { ActiveEffects } from "../components/ActiveEffects.js";
import { CombatPosture, COMBAT_POSTURES } from "../components/CombatPosture.js";
import { Equipment } from "../components/Equipment.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Stamina } from "../components/Stamina.js";
import { STAMINA_REGEN_COOLDOWN } from "../data/regenConstants.js";
import { toInt } from "./numberCoerce.js";

export const SHIELD_GUARD_KEY = "shield_guard";
export const SHIELD_BROKEN_KEY = "shield_broken";
export const DIVINE_SHIELD_KEY = "divine_shield";
export const SHIELD_MAX_GUARD_STACKS = 2;

function isActiveTimedEffect(effect) {
  if (!effect || typeof effect !== "object") return false;
  if (toInt(effect.onsetLeft, 0) > 0) return false;
  return toInt(effect.turnsLeft, 0) > 0;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 */
export function hasEquippedShield(world, entityId) {
  const id = Number(entityId || 0) | 0;
  if (!(id > 0) || !world?.isAlive?.(id)) return false;
  const eq = world.get(id, Equipment);
  const offhandId = Number(eq?.offhand || 0) | 0;
  if (!(offhandId > 0) || !world.isAlive(offhandId)) return false;
  const info = world.get(offhandId, ItemInfo);
  if (!info) return false;
  const slot = String(info.slot || "").toLowerCase();
  const subtype = String(info.subtype || "").toLowerCase();
  const identity = String(world.get(offhandId, NamedIdentity)?.identity || "").toLowerCase();
  const name = String(world.get(offhandId, NamedIdentity)?.name || "").toLowerCase();
  if (subtype === "shield") return true;
  if (slot === "offhand" && !info.damageDice) {
    if (identity.includes("shield") || name.includes("shield")) return true;
  }
  return false;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 */
export function ensureShieldGuardState(world, entityId) {
  const id = Number(entityId || 0) | 0;
  if (!(id > 0) || !world?.isAlive?.(id)) return null;
  let ae = world.get(id, ActiveEffects);
  if (!ae || !Array.isArray(ae.effects)) {
    try { world.add(id, ActiveEffects, { effects: [] }); } catch {}
    ae = world.get(id, ActiveEffects);
  }
  if (!ae || !Array.isArray(ae.effects)) return null;
  return ae;
}

/**
 * @param {Array<any>} effects
 * @param {string} key
 */
function findEffect(effects, key) {
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (!e || String(e.key || "") !== key) continue;
    if (!isActiveTimedEffect(e)) continue;
    return e;
  }
  return null;
}

function findActiveBreakableGuard(effects) {
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (!effect || !effect.meta || effect.meta.maxGuardStacks == null) continue;
    if (!isActiveTimedEffect(effect)) continue;
    const meta = effect.meta && typeof effect.meta === "object" ? effect.meta : null;
    if (toInt(meta?.guardBrokenTurns, 0) > 0) continue;
    if (toInt(meta?.guardStacks, 0) <= 0) continue;
    return effect;
  }
  return null;
}

/**
 * @param {Array<any>} effects
 * @param {string} key
 */
function removeEffect(effects, key) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    if (!e || String(e.key || "") !== key) continue;
    effects.splice(i, 1);
  }
}

/**
 * Ensure equipped-shield defenders expose a guard icon/state unless broken.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 */
export function refreshShieldGuard(world, entityId) {
  const id = Number(entityId || 0) | 0;
  if (!(id > 0) || !world?.isAlive?.(id)) return;
  const ae = ensureShieldGuardState(world, id);
  if (!ae) return;
  const effects = ae.effects;
  const broken = findEffect(effects, SHIELD_BROKEN_KEY);
  const posture = world.get(id, CombatPosture);
  const stance = String(posture?.stance || "").toLowerCase();
  if (!hasEquippedShield(world, id) || stance !== COMBAT_POSTURES.guarded) {
    removeEffect(effects, SHIELD_GUARD_KEY);
    removeEffect(effects, SHIELD_BROKEN_KEY);
    return;
  }
  if (broken) {
    removeEffect(effects, SHIELD_GUARD_KEY);
    return;
  }
  let guard = findEffect(effects, SHIELD_GUARD_KEY);
  if (!guard) {
    guard = {
      key: SHIELD_GUARD_KEY,
      turnsLeft: 2,
      potency: 1,
      stacks: SHIELD_MAX_GUARD_STACKS,
      meta: { maxStacks: SHIELD_MAX_GUARD_STACKS },
    };
    effects.push(guard);
    return;
  }
  guard.turnsLeft = Math.max(2, toInt(guard.turnsLeft, 0));
  if (toInt(guard.stacks, 0) <= 0) guard.stacks = SHIELD_MAX_GUARD_STACKS;
  if (!guard.meta || typeof guard.meta !== "object") guard.meta = { maxStacks: SHIELD_MAX_GUARD_STACKS };
}

/**
 * Consume one shield guard stack; emits break event and broken state when depleted.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 * @param {{source?:number, at?:{x:number,y:number}}} [context]
 * @returns {{guarded:boolean, stacks:number, broken:boolean}}
 */
export function consumeShieldGuardStack(world, entityId, context = {}) {
  const id = Number(entityId || 0) | 0;
  if (!(id > 0) || !world?.isAlive?.(id)) return { guarded: false, stacks: 0, broken: false };
  const ae = ensureShieldGuardState(world, id);
  if (!ae) return { guarded: false, stacks: 0, broken: false };
  const guard = findEffect(ae.effects, SHIELD_GUARD_KEY) || findActiveBreakableGuard(ae.effects);
  if (!guard) return { guarded: false, stacks: 0, broken: false };

  const divine = guard.meta && guard.meta.maxGuardStacks != null;
  const currentStacks = divine
    ? toInt(guard.meta?.guardStacks, toInt(guard.meta?.maxGuardStacks, SHIELD_MAX_GUARD_STACKS))
    : toInt(guard.stacks, SHIELD_MAX_GUARD_STACKS);
  const nextStacks = Math.max(0, currentStacks - 1);
  if (divine) {
    if (!guard.meta || typeof guard.meta !== "object") guard.meta = {};
    guard.meta.guardStacks = nextStacks;
  } else {
    guard.stacks = nextStacks;
  }
  guard.turnsLeft = Math.max(2, toInt(guard.turnsLeft, 0));
  // Drain stamina proportional to damage blocked: floor(damage * 0.5)
  const dmgAmount = Math.max(0, Number(context.damageAmount || 0) | 0);
  if (dmgAmount > 0) {
    const stam = world.get(id, Stamina);
    if (stam) {
      const cost = Math.floor(dmgAmount * 0.5);
      stam.stamina = Math.max(0, (Number(stam.stamina) || 0) - cost);
      stam.regenCooldown = STAMINA_REGEN_COOLDOWN;
    }
  }

  if (nextStacks > 0) {
    try {
      world.emit?.("shield:chip", {
        id,
        source: Number(context.source || 0) | 0,
        stacks: nextStacks,
        at: context.at || undefined,
      });
    } catch {}
    return { guarded: true, stacks: nextStacks, broken: false };
  }

  if (divine) {
    guard.meta.guardBrokenTurns = 4;
  } else {
    removeEffect(ae.effects, SHIELD_GUARD_KEY);
    ae.effects.push({
      key: SHIELD_BROKEN_KEY,
      turnsLeft: 4,
      potency: 1,
      stacks: 1,
    });
  }
  try {
    world.emit?.("shield:broken", {
      id,
      source: Number(context.source || 0) | 0,
      at: context.at || undefined,
    });
  } catch {}
  return { guarded: true, stacks: 0, broken: true };
}
