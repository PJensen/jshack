// src/rules/systems/movementSystem.js
// Consumes MoveIntent, applies grid-based movement with simple collision.
//
// This system is responsible for three concerns only:
//   1. Direction resolution (including confusion misstep)
//   2. Collision detection and bump dispatch (via bumpResolvers)
//   3. Position update and blocking reservation
//
// Side effects like auto-pickup are handled by listeners
// on the "moved" event.

import { Position } from "../components/Position.js";
import { MoveIntent } from "../components/Intents/MoveIntent.js";
import { Facing } from "../components/Facing.js";
import { Inventory } from "../components/Inventory.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { Settings } from "../components/Settings.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Collider } from "../components/Collider.js";
import { Vitality } from "../components/Vitality.js";
import { isWalkable, isFlyable } from "../environment/dungeon/tileMap.js";
import { Flying } from "../components/Flying.js";
import { getTileQuerySnapshot, forEachItemAt } from "../utils/tileQueryCache.js";
import { combatSeed, mulberry32 } from "../utils/rng.js";
import { statusStrength } from "../utils/statusFacade.js";
import { sleepPreventsMovement } from "../utils/sleep.js";
import { addToInventory, hasCapacityForItem } from "../utils/inventoryFacade.js";
import { resolveBump } from "../data/bumpResolvers.js";
import { CentipedeSegment } from "../components/CentipedeSegment.js";
import { Encumbrance } from "../components/Encumbrance.js";
import { Player } from "../components/Player.js";
import { DungeonState } from "../components/DungeonState.js";
import { isFacingTurnCostEnabled, normalizeFacingVector } from "../utils/facing.js";
import { markMovedThisTurn } from "../utils/posture.js";
import { ALL_DIRS } from "../utils/directions.js";
import { xyKey } from "../utils/gridKey.js";
import { defineExtension } from "../../lib/ecs-js/index.js";

const NOCLIP_SYM = Symbol.for("jshack:debug:noclip");

/**
 * Final movement firewall for displacement paths that do not consume a
 * MoveIntent (scripted movement, pushes, swaps, and similar direct writes).
 *
 * The normal movement resolver already rejects stasis, but the shared
 * `moved` boundary is the only place every movement-producing path reports
 * the position change. Restore the source position before downstream moved
 * listeners can observe a frozen actor at the destination.
 */
export const stasisMovementFirewallExtension = defineExtension(
  "jshack:rules:stasis-movement-firewall",
  (world) => {
    world.on("moved", ({ id, from, to }) => {
      if (statusStrength(world, id, "stasis") <= 0) return;
      const current = world.get(id, Position);
      if (!current || !from || !to) return;
      if ((current.x | 0) !== (to.x | 0) || (current.y | 0) !== (to.y | 0)) return;
      world.set(id, Position, { x: from.x | 0, y: from.y | 0 });
      world.emit("intent:blocked", { actor: id, reason: "stasis" });
    });
  },
);

/** Tracks per-entity move-attempt counter for the slowed cadence. */
const slowMoveTicks = new Map();

/** @param {any} world @param {number} id */
function hasIdentity(world, id, identity) {
  const ni = world.get(id, NamedIdentity);
  return String(ni?.identity || "").toLowerCase() === identity;
}



/** @param {any} world @param {import('../utils/tileQueryCache.js').TileQueryState} tiles @param {number} x @param {number} y */
function isBlockedOnlyByWebs(world, tiles, x, y) {
  const ids = tiles.byCell.get(xyKey(x, y));
  if (!ids || ids.length === 0) return false;

  let foundBlocking = false;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const col = world.get(id, Collider);
    const vit = world.get(id, Vitality);
    const isBlocking = !!(col?.solid) || Number(vit?.hp || 0) > 0;
    if (!isBlocking) continue;
    foundBlocking = true;
    if (!hasIdentity(world, id, "web")) return false;
  }
  return foundBlocking;
}

const MISSTEP_DIRS = ALL_DIRS;

// ── Spider web listener (retired) ──────────────────────────────────

const SPIDER_WEB_INSTALLED = Symbol.for("jshack:spiderWeb:installed");

/**
 * Deprecated no-op.
 * Kept for backwards compatibility with existing imports/tests.
 * Spiders now create webs only via explicit abilities (e.g. web spit),
 * never as a passive "leave web on move" trail.
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function installSpiderWebListener(world) {
  if (!world || world[SPIDER_WEB_INSTALLED]) return;
  world[SPIDER_WEB_INSTALLED] = true;
}

// ── Auto-pickup on arrival listener ─────────────────────────────────

const AUTO_PICKUP_INSTALLED = Symbol.for("jshack:moveAutoPickup:installed");

/**
 * Install a listener that auto-picks up items (e.g. currency) when any actor
 * with Inventory moves onto a tile. Works for all actors, not just the player.
 * Must be called once per world in configureWorld().
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function installMoveAutoPickupListener(world) {
  if (!world) return;
  // Keep the movement firewall behind this pre-existing installer so a stale
  // scheduler module cannot strand boot on a newly-added named export.
  world.install(stasisMovementFirewallExtension);
  if (world[AUTO_PICKUP_INSTALLED]) return;
  world[AUTO_PICKUP_INSTALLED] = true;

  world.on("moved", ({ id: actor, to }) => {
    try {
      const inv = world.get(actor, Inventory);
      if (!inv) return;
      const set = world.get(actor, Settings);
      if (set?.autoPickup === false) return;
      const kinds = Array.isArray(set?.autoPickupKinds) && set.autoPickupKinds.length
        ? set.autoPickupKinds : ["currency"];

      forEachItemAt(world, to.x, to.y, (itemId) => {
        if (!world.isAlive(itemId)) return;
        const ipos = world.get(itemId, Position);
        if (!ipos || ipos.x !== to.x || ipos.y !== to.y) return;
        const info = world.get(itemId, ItemInfo);
        if (!info || !info.type || !kinds.includes(info.type)) return;
        const count = info.count || 1;
        const ignoreCapacity = info.type === "currency";
        if (ignoreCapacity || hasCapacityForItem(world, actor, itemId)) {
          addToInventory(world, actor, itemId);
        }
        world.emit("item:pickup", { actor, itemId, itemType: info.type, count, itemX: to.x, itemY: to.y });
      });
    } catch (e) {
      console.debug("[movementSystem] auto-pickup failed:", e);
    }
  });
}

// ── Movement system ─────────────────────────────────────────────────

/** @param {import('../../lib/ecs-js/index.js').World} world */
export function movementSystem(world) {
  const tiles = getTileQuerySnapshot(world);
  // Start from snapshot and reserve destinations as actors move this tick.
  const blocking = new Set(tiles.blockedByCell);

  for (const [actor, intent] of world.query(MoveIntent)) {
    try {
      const pos = world.get(actor, Position);
      if (!pos) { world.remove(actor, MoveIntent); continue; }
      if (intent.cancelled === true) { world.remove(actor, MoveIntent); continue; }

      // Dead entities must not move — prevents a spurious "moved" event firing
      // after the entity dies mid-tick (e.g. grid bug killed while it still has
      // an AI-queued MoveIntent).  The event would be harmless for most listeners
      // but the deferred position update produced by world.set would be applied
      // at end-of-tick, briefly placing the entity at the wrong tile before it
      // is destroyed by cleanupSystem — enough to confuse any system that reads
      // the entity's position between the flush and the cleanup.
      const vit = world.get(actor, Vitality);
      if (vit && (vit.hp | 0) <= 0) { world.remove(actor, MoveIntent); continue; }
      if (sleepPreventsMovement(world, actor)) { world.remove(actor, MoveIntent); continue; }
      if (statusStrength(world, actor, "stasis") > 0) {
        world.set(actor, MoveIntent, {
          ...intent,
          cancelled: true,
          cancelReason: "stasis",
        });
        world.emit?.("intent:blocked", { actor, reason: "stasis" });
        world.remove(actor, MoveIntent);
        continue;
      }
      if (statusStrength(world, actor, "stunned") > 0 || statusStrength(world, actor, "rooted") > 0) {
        world.remove(actor, MoveIntent);
        continue;
      }

      const intendedDx = intent.dx | 0;
      const intendedDy = intent.dy | 0;
      let mdx = intendedDx;
      let mdy = intendedDy;

      // Confusion: movement inputs become a deterministic random misstep.
      const confusePower = statusStrength(world, actor, "confused");
      if (confusePower > 0 && (intendedDx !== 0 || intendedDy !== 0)) {
        const options = MISSTEP_DIRS.filter(d => !(d.dx === intendedDx && d.dy === intendedDy));
        if (options.length > 0) {
          const posSalt = (((pos.x | 0) & 0xffff) << 16) ^ ((pos.y | 0) & 0xffff);
          const r = mulberry32(combatSeed(world.seed, world.step, actor, posSalt, 0xC0F00D11));
          const idx = (r() * options.length) | 0;
          ({ dx: mdx, dy: mdy } = options[idx]);
          world.emit("status:confused-misstep", {
            actor,
            from: { dx: intendedDx, dy: intendedDy },
            to: { dx: mdx, dy: mdy },
          });
        }
      }

      // Overloaded actors cannot move diagonally; force to dominant axis.
      if (mdx !== 0 && mdy !== 0) {
        const enc = /** @type {any} */ (world.get(actor, Encumbrance));
        if (enc?.overloaded) {
          if (Math.abs(intendedDx) >= Math.abs(intendedDy)) { mdy = 0; } else { mdx = 0; }
        }
      }

      // "Slowed" skips every Nth movement attempt (stacks+1 cadence).
      // 1 stack → move every 2nd attempt, 2 → every 3rd, 3 → every 4th.
      const slowedStacks = Math.min(3, statusStrength(world, actor, "slowed"));
      if (slowedStacks > 0) {
        const tick = (slowMoveTicks.get(actor) || 0) + 1;
        slowMoveTicks.set(actor, tick);
        if (tick % (slowedStacks + 1) !== 0) {
          world.emit("movement:slowed", { actor, stacks: slowedStacks, x: pos.x, y: pos.y, dx: mdx, dy: mdy });
          continue;
        }
      } else {
        slowMoveTicks.delete(actor);
      }

      const nx = pos.x + mdx;
      const ny = pos.y + mdy;
      const k = xyKey(nx, ny);
      const target = tiles.livingByCell.get(k) || 0;

      // Record facing direction on every move attempt (successful or not)
      const facingBefore = world.has(actor, Facing)
        ? normalizeFacingVector(world.get(actor, Facing)?.dx, world.get(actor, Facing)?.dy)
        : null;
      if (world.has(actor, Facing)) {
        world.set(actor, Facing, { dx: mdx, dy: mdy });
      }
      const facingAfter = normalizeFacingVector(mdx, mdy);
      const facingChangedFromKnownDirection = !!(
        facingBefore
        && facingAfter
        && (facingBefore.dx !== facingAfter.dx || facingBefore.dy !== facingAfter.dy)
      );
      if (isFacingTurnCostEnabled(world) && facingChangedFromKnownDirection) {
        continue;
      }

      // Flying entities bypass terrain (water, lava, trees, mountains) but not walls/void.
      const actorFlying = world.has(actor, Flying);
      const terrainBlocked = actorFlying ? !isFlyable(nx, ny) : !isWalkable(nx, ny);

      const canTraverseWebs = hasIdentity(world, actor, "spider")
        || statusStrength(world, actor, "web_immune") > 0;
      const spiderCanTraverseWeb =
        canTraverseWebs
        && isWalkable(nx, ny)
        && blocking.has(k)
        && tiles.blockedByCell.has(k)
        && isBlockedOnlyByWebs(world, tiles, nx, ny);

      // Centipede heads can step into tiles occupied by their own body segments.
      // The body cascade listener will shift the segment out after the move.
      let centipedeCanPassOwnBody = false;
      if (blocking.has(k) && !spiderCanTraverseWeb) {
        const actorSeg = world.get(actor, CentipedeSegment);
        if (actorSeg) {
          const chainId = actorSeg.chainId;
          const ids = tiles.byCell.get(k);
          if (ids) {
            centipedeCanPassOwnBody = true;
            for (let i = 0; i < ids.length; i++) {
              const eid = ids[i];
              if (eid === actor) continue;
              const col = world.get(eid, Collider);
              const evit = world.get(eid, Vitality);
              const isBlocking = !!(col?.solid) || Number(evit?.hp || 0) > 0;
              if (!isBlocking) continue;
              const eSeg = world.get(eid, CentipedeSegment);
              if (!eSeg || eSeg.chainId !== chainId) { centipedeCanPassOwnBody = false; break; }
            }
          }
        }
      }

      const flyingOccupant = target > 0 && target !== actor && world.has(target, Flying);

      const noclip = world[NOCLIP_SYM] && world.has(actor, Player);

      if (!noclip && (terrainBlocked || (blocking.has(k) && !spiderCanTraverseWeb && !centipedeCanPassOwnBody) || flyingOccupant)) {
        // Blocked — delegate to bump resolver dispatch table
        resolveBump(world, actor, { nx, ny, mdx, mdy, target, tiles });
      } else {
        // Successful move
        const from = { x: pos.x, y: pos.y };
        world.set(actor, Position, { x: nx, y: ny });
        markMovedThisTurn(world, actor);
        world.emit?.("moved", { id: actor, from, to: { x: nx, y: ny } });
        // Reserve the destination so subsequent movers can't step into the same tile
        blocking.add(k);
        // Keep livingByCell in sync so bump resolvers see entities that moved
        // this tick (prevents stale-snapshot bugs like toggling a door when a
        // creature stepped onto it earlier in the same movement pass).
        const actorVit = world.get(actor, Vitality);
        if (actorVit && (actorVit.hp | 0) > 0 && !world.has(actor, Flying)) {
          const fromKey = xyKey(from.x, from.y);
          if (tiles.livingByCell.get(fromKey) === actor) {
            tiles.livingByCell.delete(fromKey);
          }
          tiles.livingByCell.set(k, actor);
        }
      }
    } catch (e) { console.error("[movementSystem] movement resolution failed:", e); }
    finally {
      // Consume the intent regardless (even if we early-continue for facing turns).
      try { world.remove(actor, MoveIntent); } catch {}
    }
  }
}
