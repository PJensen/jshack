// rules/systems/tileStepEffectSystem.js
// "moved" event listener that applies tile step-on effects:
//   - Shallow water extinguishes burn
//   - Lava scorches + applies burn
//   - Ice slides the actor in the same direction (instant chain)
//
// A Pushable entity on a tile suppresses the effect (statue bridge mechanic).

import { Position } from "../components/Position.js";
import { Vitality } from "../components/Vitality.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { Pushable } from "../components/Pushable.js";
import { Flying } from "../components/Flying.js";
import { findTileStepEffect } from "../data/tileStepEffects.js";
import { TILE_ICE } from "../environment/dungeon/constants.js";
import { getTile, isWalkable } from "../environment/dungeon/tileMap.js";
import { dealDamage } from "../utils/dealDamage.js";
import { upsertTimedEffect } from "../utils/effectSemantics.js";
import { ensureActiveEffects } from "../utils/effects.js";
import { getTileQuerySnapshot } from "../utils/tileQueryCache.js";
import { statusStrength } from "../utils/statusFacade.js";

const INSTALLED = Symbol.for("jshack:tileStepEffect:installed");
const MAX_SLIDE = 50;

// Re-entry guard: entities currently mid-slide don't trigger another slide
const _sliding = new Set();

/**
 * Install the tile step effect listener. Call once per world in configureWorld().
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function installTileStepEffectListener(world) {
  if (!world || world[INSTALLED]) return;
  world[INSTALLED] = true;

  world.on("moved", ({ id, from, to }) => {
    try {
      _handleStep(world, id, from, to);
    } catch (e) {
      console.debug("[tileStepEffect] handler failed:", e);
    }
  });
}

/**
 * @param {any} world
 * @param {number} id
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 */
function _handleStep(world, id, from, to) {
  const tileType = getTile(to.x, to.y);
  const effect = findTileStepEffect(tileType);
  if (!effect) return;

  // Bridge check: a Pushable entity on the tile suppresses the effect
  if (_hasPushableAt(world, to.x, to.y, id)) return;

  // Only living entities are affected
  const vit = world.get(id, Vitality);
  if (!vit || (vit.hp | 0) <= 0) return;
  if (statusStrength(world, id, "stasis") > 0) return;
  if (world.has(id, Flying)) return;

  switch (effect.type) {
    case "extinguish":
      _extinguish(world, id, effect);
      break;
    case "scorch":
      _scorch(world, id, effect);
      break;
    case "slide":
      // Re-entry guard: mid-slide "moved" events apply non-slide effects
      // (e.g. scorch when sliding off ice onto lava) but don't nest slides
      if (_sliding.has(id)) return;
      _slide(world, id, from, to, effect);
      break;
  }
}

/** Check if any Pushable entity (other than `exclude`) occupies (x, y). */
function _hasPushableAt(world, x, y, exclude) {
  // Query live Position data rather than the per-tick snapshot cache,
  // because a statue pushed mid-tick won't appear in the stale cache.
  for (const [id, pos] of world.query(Position)) {
    if (id !== exclude && pos.x === x && pos.y === y && world.has(id, Pushable)) return true;
  }
  return false;
}

/** Shallow water: remove burn effects. */
function _extinguish(world, id, effect) {
  const ae = /** @type {any} */ (world.get(id, ActiveEffects));
  if (!ae || !Array.isArray(ae.effects)) return;
  const before = ae.effects.length;
  ae.effects = ae.effects.filter(e => e.key !== "burn");
  if (ae.effects.length < before) {
    world.emit("tile:waded", { actor: id });
  }
}

/** Lava: deal fire damage + apply burn status. */
function _scorch(world, id, effect) {
  const result = dealDamage(world, {
    target: id,
    amount: effect.damage || 3,
    type: effect.damageType || "fire",
    cause: "lava",
  });

  // Apply burn to survivors
  if (result.applied && !result.killed && effect.status) {
    const status = { ...effect.status };
    const ae = ensureActiveEffects(world, id);
    if (ae) {
      upsertTimedEffect(ae.effects, { stacks: 1, ...status });
    }
  }

  world.emit("tile:scorched", { actor: id });
}

/** Ice: instant chain slide in the movement direction. */
function _slide(world, id, from, to, effect) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return;

  _sliding.add(id);
  let cx = to.x;
  let cy = to.y;
  let steps = 0;

  try {
    while (steps < MAX_SLIDE) {
      const nx = cx + dx;
      const ny = cy + dy;

      if (!isWalkable(nx, ny)) break;

      // Check if blocked by entity
      const snap = getTileQuerySnapshot(world);
      if (snap.blockedByCell.has(`${nx},${ny}`)) break;

      const slideFrom = { x: cx, y: cy };
      const slideTo = { x: nx, y: ny };
      world.set(id, Position, slideTo);
      // Emit "moved" for each step --- triggers scorch/extinguish if
      // the actor slides off ice onto lava/water, but not nested slides
      world.emit("moved", { id, from: slideFrom, to: slideTo });
      steps++;
      cx = nx;
      cy = ny;

      // If we've slid off ice, stop (the "moved" emit above already
      // triggered the landing tile's effect like scorch)
      if (getTile(nx, ny) !== TILE_ICE) break;
    }
  } finally {
    _sliding.delete(id);
  }

  if (steps > 0) {
    world.emit("tile:slid", {
      actor: id,
      from: { x: to.x, y: to.y },
      to: { x: cx, y: cy },
      steps,
    });
  }
}
