import { ActiveEffects } from "../components/ActiveEffects.js";
import { Status } from "../components/Status.js";
import { Position } from "../components/Position.js";
import { canonicalStatusKey } from "./effectSemantics.js";
import { effectStrength, statusStrength } from "./statusFacade.js";

export const SHADOW_CLOAK_REARM_KEY = "shadow_cloak_rearm";
export const SHADOW_CLOAK_REARM_TURNS = 7;

function activeEffect(ae, key) {
  if (!ae || !Array.isArray(ae.effects)) return null;
  for (let i = 0; i < ae.effects.length; i++) {
    const effect = ae.effects[i];
    if (String(effect?.key || '').trim().toLowerCase() !== key) continue;
    if ((Number(effect?.turnsLeft || 0) | 0) <= 0) continue;
    if ((Number(effect?.onsetLeft || 0) | 0) > 0) continue;
    return effect;
  }
  return null;
}

function normalizeStatusType(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Remove projected/explicit status entries by semantic status type.
 * This updates both ActiveEffects (canonical) and Status fallback.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} entityId
 * @param {string} statusType
 * @returns {boolean} true if any entry was removed
 */
export function clearStatusType(world, entityId, statusType) {
  const id = Number(entityId || 0) | 0;
  const wanted = normalizeStatusType(statusType);
  if (!(id > 0) || !wanted) return false;

  let changed = false;

  const ae = world.get(id, ActiveEffects);
  if (ae && Array.isArray(ae.effects)) {
    for (let i = ae.effects.length - 1; i >= 0; i--) {
      const effect = ae.effects[i];
      const key = String(effect?.key || "").trim().toLowerCase();
      if (!key) continue;
      if (canonicalStatusKey(key) !== wanted) continue;
      ae.effects.splice(i, 1);
      changed = true;
    }
  }

  const status = world.get(id, Status);
  if (status && Array.isArray(status.statuses)) {
    for (let i = status.statuses.length - 1; i >= 0; i--) {
      const type = normalizeStatusType(status.statuses[i]?.type);
      if (type !== wanted) continue;
      status.statuses.splice(i, 1);
      changed = true;
    }
  }

  return changed;
}

/**
 * Canonical stealth-offense pathway.
 * While hidden, offensive actions consume the one-shot ambush buff
 * (`shadow_cloak`) but keep invisibility active.
 * Emits `stealth:offense` for witness-based AI reactions.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} entityId
 * @param {{ reason?: string, mode?: string, targetId?: number }} [context]
 * @returns {{ hidden:boolean, ambushConsumed:boolean }}
 */
export function breakStealthOnOffense(world, entityId, context = {}) {
  const id = Number(entityId || 0) | 0;
  if (!(id > 0)) return { hidden: false, ambushConsumed: false };
  const hidden = statusStrength(world, id, "invisible") > 0 || effectStrength(world, id, "shadow_veil") > 0;
  if (!hidden) return { hidden: false, ambushConsumed: false };
  const ae = world.get(id, ActiveEffects);
  const veil = activeEffect(ae, "shadow_veil");
  let ambushConsumed = false;
  if (veil) {
    veil.meta = veil.meta && typeof veil.meta === "object" ? veil.meta : {};
    if (veil.meta.ambushReady !== false) {
      veil.meta.ambushReady = false;
      veil.meta.rearmTurns = SHADOW_CLOAK_REARM_TURNS;
      ambushConsumed = true;
    }
  } else {
    ambushConsumed = clearStatusType(world, id, "shadow_cloak");
  }
  if (ambushConsumed) {
    if (ae && Array.isArray(ae.effects)) {
      if (veil) {
        // Shadow Veil owns rearm state in metadata; no tracker row is needed.
      } else {
      let tracker = null;
      for (let i = 0; i < ae.effects.length; i++) {
        const e = ae.effects[i];
        if (String(e?.key || "").trim().toLowerCase() !== SHADOW_CLOAK_REARM_KEY) continue;
        tracker = e;
        break;
      }
      if (!tracker) {
        ae.effects.push({
          key: SHADOW_CLOAK_REARM_KEY,
          turnsLeft: SHADOW_CLOAK_REARM_TURNS,
          potency: 1,
          stacks: 1,
          sourceId: id,
        });
      } else {
        tracker.turnsLeft = SHADOW_CLOAK_REARM_TURNS;
        tracker.potency = 1;
        tracker.stacks = 1;
      }
      }
    }
  }
  const pos = world.get(id, Position);

  world.emit?.("stealth:offense", {
    entityId: id,
    reason: String(context.reason || "offense"),
    mode: String(context.mode || "melee"),
    targetId: Number(context.targetId || 0) | 0,
    at: pos ? { x: pos.x | 0, y: pos.y | 0 } : null,
    hidden: true,
    ambushConsumed,
  });
  return { hidden: true, ambushConsumed };
}
