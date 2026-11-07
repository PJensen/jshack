import { ActiveEffects } from "../components/ActiveEffects.js";
import { Position } from "../components/Position.js";
import { Faction } from "../components/Faction.js";
import { forEachInRadius } from "../utils/spatialIndex.js";
import { areFactionsHostile } from "../utils/factionHostility.js";
import { upsertTimedEffect } from "../utils/effectSemantics.js";
import {
  SHADOW_CLOAK_REARM_KEY,
  SHADOW_CLOAK_REARM_TURNS,
} from "../utils/stealthAmbush.js";

const REARM_SAFE_RADIUS = 9;

function activeEffect(ae, key) {
  if (!ae || !Array.isArray(ae.effects)) return null;
  const wanted = String(key || "").trim().toLowerCase();
  for (let i = 0; i < ae.effects.length; i++) {
    const e = ae.effects[i];
    if (!e) continue;
    const k = String(e.key || "").trim().toLowerCase();
    if (k !== wanted) continue;
    if ((Number(e.turnsLeft || 0) | 0) <= 0) continue;
    if ((Number(e.onsetLeft || 0) | 0) > 0) continue;
    return e;
  }
  return null;
}

function effectIndex(ae, key) {
  if (!ae || !Array.isArray(ae.effects)) return -1;
  const wanted = String(key || "").trim().toLowerCase();
  for (let i = 0; i < ae.effects.length; i++) {
    const e = ae.effects[i];
    if (!e) continue;
    if (String(e.key || "").trim().toLowerCase() === wanted) return i;
  }
  return -1;
}

/**
 * Rearms shadow-cloak opener after a quiet period while invisibility remains active.
 * This lets stealth gameplay continue without forcing visibility toggles.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 */
export function stealthAmbushSystem(world) {
  for (const [id, ae, pos] of world.query(ActiveEffects, Position)) {
    if (!ae || !Array.isArray(ae.effects) || !pos) continue;

    const invisible = activeEffect(ae, "invisible");
    const shadowCloak = activeEffect(ae, "shadow_cloak");
    const shadowVeil = activeEffect(ae, "shadow_veil");
    if (shadowVeil) {
      shadowVeil.meta = shadowVeil.meta && typeof shadowVeil.meta === "object" ? shadowVeil.meta : {};
      if (shadowVeil.meta.ambushReady !== false) continue;
      const selfFaction = String(world.get(id, Faction)?.key || "");
      let hostileNearby = false;
      forEachInRadius(world, pos.x | 0, pos.y | 0, REARM_SAFE_RADIUS, (otherId) => {
        if (hostileNearby || otherId === id) return;
        const otherFaction = String(world.get(otherId, Faction)?.key || "");
        if (selfFaction && otherFaction && areFactionsHostile(selfFaction, otherFaction)) hostileNearby = true;
      });
      if (hostileNearby) {
        shadowVeil.meta.rearmTurns = SHADOW_CLOAK_REARM_TURNS;
        continue;
      }
      const turns = Math.max(0, Number(shadowVeil.meta.rearmTurns || 0) | 0);
      if (turns > 1) {
        shadowVeil.meta.rearmTurns = turns - 1;
        continue;
      }
      shadowVeil.meta.rearmTurns = 0;
      shadowVeil.meta.ambushReady = true;
      world.emit?.("stealth:rearmed", {
        entityId: id,
        at: { x: pos.x | 0, y: pos.y | 0 },
      });
      continue;
    }
    const trackerIdx = effectIndex(ae, SHADOW_CLOAK_REARM_KEY);
    const tracker = trackerIdx >= 0 ? ae.effects[trackerIdx] : null;

    if (!invisible) {
      if (trackerIdx >= 0) ae.effects.splice(trackerIdx, 1);
      continue;
    }

    if (shadowCloak) {
      if (trackerIdx >= 0) ae.effects.splice(trackerIdx, 1);
      continue;
    }

    if (!tracker) continue;

    const selfFaction = String(world.get(id, Faction)?.key || "");
    let hostileNearby = false;
    forEachInRadius(world, pos.x | 0, pos.y | 0, REARM_SAFE_RADIUS, (otherId) => {
      if (hostileNearby || otherId === id) return;
      const otherFaction = String(world.get(otherId, Faction)?.key || "");
      if (!selfFaction || !otherFaction) return;
      if (areFactionsHostile(selfFaction, otherFaction)) hostileNearby = true;
    });

    if (hostileNearby) {
      tracker.turnsLeft = SHADOW_CLOAK_REARM_TURNS;
      continue;
    }

    if ((Number(tracker.turnsLeft || 0) | 0) > 1) continue;

    upsertTimedEffect(ae.effects, {
      key: "shadow_cloak",
      turnsLeft: Math.max(1, Number(invisible.turnsLeft || 1) | 0),
      potency: 1,
      stacks: 1,
      sourceId: id,
    });
    const removeIdx = effectIndex(ae, SHADOW_CLOAK_REARM_KEY);
    if (removeIdx >= 0) ae.effects.splice(removeIdx, 1);
    world.emit?.("stealth:rearmed", {
      entityId: id,
      at: { x: pos.x | 0, y: pos.y | 0 },
    });
  }
}

