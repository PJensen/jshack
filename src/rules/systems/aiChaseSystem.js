// src/rules/systems/aiChaseSystem.js
// Enemy AI: LOS-based aggro state machine.  Replaces the previous world-level
// "seen" Set with per-entity AggroState so stealth and search behaviour are
// actually simulated on each individual creature.
//
// Intelligence-gated behaviours (sourced from MONSTERS[].intelligence):
//   passive    (aggro:'passive') — sight never triggers hunting while unaware;
//                                  only damage-based aggro works.
//   packSense  (any intel)       — first sighting alerts nearby same-species.
//                                  safety in numbers: unaware pack creatures
//                                  won't aggro from sight unless an ally is nearby.
//   tacticalSpread (intel > 3, always while hunting) — any enemy with intel > 3
//                                  penalises approach angles already covered by any
//                                  other nearby hunting enemy (regardless of species),
//                                  causing groups to fan out and flank naturally.
//   ambush     (def.ambush)      — creature holds position until player is adjacent.
//   retreat    (def.retreatHpPct) — creature flees when HP < threshold.
//   kite       (has spells or ranged weapon) — retreater holds shoot distance instead
//                                  of blindly fleeing; closes if player moves away.
//   rally      (packSense, intel 4-6) — retreating pack members regroup toward the
//                                  nearest non-retreating hunting ally.
//   chokepoint (intel ≥ 8)      — retreater paths to the nearest corridor tile and
//                                  holds there to fight from a defensible position.
//   anticipate (intel ≥ 8)      — on LOS break, projects player's last observed
//                                  movement direction 3 tiles forward as the new
//                                  search target, predicting the escape route.

import { Position }     from "../components/Position.js";
import { Collider } from "../components/Collider.js";
import { Faction }      from "../components/Faction.js";
import { Equipment }    from "../components/Equipment.js";
import { ItemInfo }     from "../components/ItemInfo.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Brain } from "../components/Brain.js";
import { Flying } from "../components/Flying.js";
import { Vitality }     from "../components/Vitality.js";
import { MoveIntent }   from "../components/Intents/MoveIntent.js";
import { FlyIntent } from "../components/Intents/FlyIntent.js";
import { RangedAttackIntent } from "../components/Intents/RangedAttackIntent.js";
import {
  AggroState,
  AGGRO_LEVELS,
  SEARCH_TURNS_HUNTING_GRACE,
  SEARCH_TURNS_ALERTED,
  SEARCH_TURNS_CURIOUS,
} from "../components/AggroState.js";
import { CreatureType, CREATURE_TYPES } from "../components/CreatureType.js";
import { getMonster }        from "../data/monsters.js";
import { hasEquippedTag }    from "../utils/equipTags.js";
import { SeenCallbackContext } from "../data/callbacks/ai.js";
import { runCallbackList }   from "../interaction/dispatch.js";
import { playerEntity }      from "../utils/queries.js";
import { findNextCardinalStep } from "../utils/gridPathfind.js";
import { forEachInRadius }   from "../utils/spatialIndex.js";
import { statusStrength }    from "../utils/statusFacade.js";
import { sleepPreventsPerception } from "../utils/sleep.js";
import { canActThisTurn as speedGateCheck } from "../utils/speedGate.js";
import { hasLOS }            from "../../shared/math/gridLOS.js";
import { buildBlocksVisionMap, blockedCallback } from "../utils/vision.js";
import { hasOverworldAerialLOS } from "../utils/flyingEligibility.js";
import { getTile, isFlyable, isWalkable } from "../environment/dungeon/tileMap.js";
import { TILE_STAIR_DOWN, TILE_STAIR_UP } from "../environment/dungeon/constants.js";
import { getEffectiveVisionRange } from "../utils/blind.js";
import { setAggroTarget } from "../utils/aggroTarget.js";
import { resolveThreatTarget } from "../utils/threat.js";
import { chebyshevScalar } from "../utils/distance.js";
import { CARDINAL_DIRS } from "../utils/directions.js";
import { CentipedeSegment } from "../components/CentipedeSegment.js";
import { Facing } from "../components/Facing.js";
import { Trap } from "../components/Trap.js";

const ACTIVE_RADIUS = 32; // tiles; keep AI work bounded to nearby entities

/** Returns true when any of the player's equipped items carries the "conflict" tag. */
function playerHasConflict(world, playerId) {
  return hasEquippedTag(world, playerId, "conflict");
}

/**
 * Find the nearest *other* enemy entity to (ox, oy) that is alive and within
 * sight range, excluding `selfId`. Returns { id, x, y } or null.
 */
function findNearestRival(world, selfId, ox, oy, sightRange, isBlocked) {
  let best = null;
  let bestDist = Infinity;
  forEachInRadius(world, ox, oy, sightRange, (id, pos) => {
    if (id === selfId) return;
    const fac = world.get(id, Faction);
    if (!fac || fac.key !== "enemy") return;
    const vit = world.get(id, Vitality);
    if (!vit || vit.hp <= 0) return;
    const dist = chebyshevScalar(ox, oy, pos.x, pos.y);
    if (dist >= bestDist) return;
    // Quick LOS check — rival must be visible to attacker
    if (!hasLOS(ox | 0, oy | 0, pos.x | 0, pos.y | 0, isBlocked)) return;
    bestDist = dist;
    best = { id, x: pos.x | 0, y: pos.y | 0 };
  });
  return best;
}

function isSmartPathingMonster(brain, def) {
  return Number(brain?.intelligence ?? def?.intelligence ?? 10) > 3;
}

function emitSightAlert(world, id, pos, def, aggro) {
  if (!def?.alertOnSight && !(Number(def?.sightAlertCooldownTurns || 0) > 0)) {
    world.emit('status', { id, kind: 'alert', at: { x: pos.x | 0, y: pos.y | 0 } });
    return true;
  }
  const step = world.step | 0;
  if (step < (Number(aggro?.nextSightAlertTurn || 0) | 0)) return false;
  world.emit('status', { id, kind: 'alert', at: { x: pos.x | 0, y: pos.y | 0 } });
  const cooldown = Math.max(0, Number(def?.sightAlertCooldownTurns || 0) | 0);
  if (cooldown > 0) aggro.nextSightAlertTurn = step + cooldown;
  return true;
}

/** Returns true when this monster kites — attacks at range while retreating. */
function resolveIsKiter(world, id, brain) {
  if (Array.isArray(brain?.learnedSpellIds) && brain.learnedSpellIds.length > 0) return true;
  const eq = world.get(id, Equipment);
  return !!(eq?.ranged && world.isAlive?.(eq.ranged));
}

/**
 * Count walkable cardinal neighbours of (x, y) using the actor's traversal fn.
 * Used to identify chokepoint (corridor) tiles.
 */
function walkableNeighborCount(x, y, canTraverse) {
  let count = 0;
  for (const dir of CARDINAL_DIRS) {
    if (canTraverse(x + dir.dx, y + dir.dy)) count++;
  }
  return count;
}

/**
 * Returns true when the tile at (x, y) contains an armed, revealed trap.
 * Intel ≥ 6 monsters refuse to step onto these tiles.
 */
function hasRevealedArmedTrap(world, x, y) {
  for (const [, pos, trap] of world.query(Position, Trap)) {
    if (!pos || !trap) continue;
    if ((pos.x | 0) !== x || (pos.y | 0) !== y) continue;
    if (trap.armed && trap.revealed) return true;
  }
  return false;
}

/**
 * Find the nearest chokepoint tile (≤ 2 walkable cardinal neighbours) within
 * CHOKE_SCAN_RADIUS and return the first step toward it, or null if none found.
 */
const CHOKE_SCAN_RADIUS = 8;

function findNearestChokepointDir(world, id, pos, canTraverseTile, canOpenDoors) {
  const ox = pos.x | 0, oy = pos.y | 0;
  let bestX = null, bestY = null, bestDist = Infinity;

  for (let ddy = -CHOKE_SCAN_RADIUS; ddy <= CHOKE_SCAN_RADIUS; ddy++) {
    for (let ddx = -CHOKE_SCAN_RADIUS; ddx <= CHOKE_SCAN_RADIUS; ddx++) {
      const cx = ox + ddx, cy = oy + ddy;
      if (!canTraverseTile(cx, cy)) continue;
      if (walkableNeighborCount(cx, cy, canTraverseTile) > 2) continue;
      const d = chebyshevScalar(ox, oy, cx, cy);
      if (d > 0 && d < bestDist) { bestDist = d; bestX = cx; bestY = cy; }
    }
  }

  if (bestX === null) return null;

  return findNextCardinalStep(world, ox, oy, bestX, bestY, id, {
    goalRadius: 0,
    maxNodes: 128,
    isPassable: canTraverseTile,
    passThroughDoors: canOpenDoors,
    searchPadding: CHOKE_SCAN_RADIUS + 2,
  });
}

/**
 * Rally retreat: path toward the nearest non-retreating hunting ally of the same
 * species.  Returns first step toward ally, or null if no valid ally found.
 */
function chooseRallyDir(world, id, pos, ni, def, canTraverseTile, canOpenDoors) {
  const myIdentity = ni?.identity;
  if (!myIdentity) return null;
  const searchRadius = Math.max(1, (def.packRadius ?? 8) | 0) * 2;

  let bestX = null, bestY = null, bestDist = Infinity;
  forEachInRadius(world, pos.x | 0, pos.y | 0, searchRadius, (neighborId, neighborPos) => {
    if (neighborId === id) return;
    const neighborNI = world.get(neighborId, NamedIdentity);
    if (!neighborNI || neighborNI.identity !== myIdentity) return;
    const neighborAggro = world.get(neighborId, AggroState);
    if (!neighborAggro || neighborAggro.alertLevel !== AGGRO_LEVELS.hunting || neighborAggro.retreating) return;
    const d = chebyshevScalar(pos.x | 0, pos.y | 0, neighborPos.x | 0, neighborPos.y | 0);
    if (d > 0 && d < bestDist) { bestDist = d; bestX = neighborPos.x | 0; bestY = neighborPos.y | 0; }
  });

  if (bestX === null) return null;

  return findNextCardinalStep(world, pos.x | 0, pos.y | 0, bestX, bestY, id, {
    goalRadius: 1,
    maxNodes: 128,
    isPassable: canTraverseTile,
    passThroughDoors: canOpenDoors,
    searchPadding: 8,
  });
}

/**
 * Tactical spread: score all four cardinal directions and penalise any direction
 * within 45° of a nearby hunting enemy's current approach vector.  Applies to
 * any enemy with intel > 3, regardless of species — a goblin and a troll closing
 * from the same angle will naturally split without any explicit coordination.
 *
 * @param {any} world
 * @param {number} id
 * @param {{x:number,y:number}} pos
 * @param {number} targetX
 * @param {number} targetY
 * @param {any} def — monster def
 * @param {(x:number,y:number)=>boolean} canTraverseTile
 * @returns {{dx:number,dy:number}|null}
 */
function choosePackSpreadDir(world, id, pos, targetX, targetY, def, canTraverseTile) {
  const searchRadius = Math.max(1, (def?.packRadius ?? 8) | 0);

  // Collect approach vectors from any nearby hunting enemy (any species).
  const allyNx = [];
  const allyNy = [];
  forEachInRadius(world, pos.x | 0, pos.y | 0, searchRadius, (neighborId, neighborPos) => {
    if (neighborId === id) return;
    const neighborFac = world.get(neighborId, Faction);
    if (!neighborFac || neighborFac.key !== 'enemy') return;
    const neighborAggro = world.get(neighborId, AggroState);
    if (!neighborAggro || neighborAggro.alertLevel !== AGGRO_LEVELS.hunting) return;
    const adx = targetX - (neighborPos.x | 0);
    const ady = targetY - (neighborPos.y | 0);
    const len = Math.sqrt(adx * adx + ady * ady);
    if (len < 0.001) return;
    allyNx.push(adx / len);
    allyNy.push(ady / len);
  });

  if (allyNx.length === 0) return null; // no hunting allies nearby — default pathing

  // Self direction to target (normalised).
  const sdx = targetX - (pos.x | 0);
  const sdy = targetY - (pos.y | 0);
  const selfLen = Math.sqrt(sdx * sdx + sdy * sdy);
  const selfNx = selfLen > 0.001 ? sdx / selfLen : 0;
  const selfNy = selfLen > 0.001 ? sdy / selfLen : 0;

  // Score each cardinal direction; penalise overlap with ally approach vectors.
  // dot > cos(45°) ≈ 0.707 means the two vectors are within 45° of each other.
  const OVERLAP_PENALTY = 2;
  let bestScore = -Infinity;
  let bestDir = null;

  for (const dir of CARDINAL_DIRS) {
    const nx = (pos.x | 0) + dir.dx;
    const ny = (pos.y | 0) + dir.dy;
    if (!isStepTraversable(world, id, nx, ny, targetX, targetY, canTraverseTile)) continue;

    // Base score: how well this direction points toward the target.
    let score = dir.dx * selfNx + dir.dy * selfNy;

    // Penalise if this approach angle is already covered by a hunting ally.
    for (let i = 0; i < allyNx.length; i++) {
      if (dir.dx * allyNx[i] + dir.dy * allyNy[i] > 0.707) score -= OVERLAP_PENALTY;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }

  return bestDir;
}

/**
 * Returns true if this monster's creature type grants it the ability to open doors.
 * Humanoids, undead (skeletal hands), and demons can operate door handles.
 */
function monsterCanOpenDoors(world, id) {
  const ct = world.get(id, CreatureType);
  const type = ct?.type;
  return type === CREATURE_TYPES.humanoid
      || type === CREATURE_TYPES.undead
      || type === CREATURE_TYPES.demon;
}

function isStepTraversable(world, actorId, x, y, targetX, targetY, canTraverseTile) {
  if (!canTraverseTile(x, y)) return false;

  const tile = getTile(x, y);
  if (tile === TILE_STAIR_DOWN || tile === TILE_STAIR_UP) return false;

  // If the actor belongs to a centipede chain, skip same-chain segments
  const actorSeg = world.get(actorId, CentipedeSegment);
  const actorChainId = actorSeg ? actorSeg.chainId : 0;

  for (const [id, pos] of world.query(Position)) {
    if (id === actorId) continue;
    if (!pos || pos.x !== x || pos.y !== y) continue;
    if (x === targetX && y === targetY) continue;

    if (actorChainId) {
      const otherSeg = world.get(id, CentipedeSegment);
      if (otherSeg && otherSeg.chainId === actorChainId) continue;
    }

    const col = world.get(id, Collider);
    const vit = world.get(id, Vitality);
    const solid = !!col?.solid;
    const living = Number(vit?.hp || 0) > 0;
    if (solid || living) return false;
  }

  return true;
}

// ── Damage-triggered aggro listener ──────────────────────────────────

const AGGRO_STEALTH_OFFENSE_INSTALLED = Symbol.for("jshack:aggroFromStealthOffense:installed");

/**
 * Witness-based aggro for hidden attacks:
 * enemies that have LOS to the attacker at the moment of stealth offense
 * enter hunting and track attacker last-known position.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function installAggroFromStealthOffenseListener(world) {
  if (world[AGGRO_STEALTH_OFFENSE_INSTALLED]) return;
  world[AGGRO_STEALTH_OFFENSE_INSTALLED] = true;

  world.on("stealth:offense", ({ entityId, at }) => {
    const attackerId = Number(entityId || 0) | 0;
    if (!(attackerId > 0)) return;
    const attackerPos = at && Number.isFinite(at.x) && Number.isFinite(at.y)
      ? { x: at.x | 0, y: at.y | 0 }
      : world.get(attackerId, Position);
    if (!attackerPos) return;

    const isBlocked = blockedCallback(buildBlocksVisionMap(world));
    forEachInRadius(world, attackerPos.x, attackerPos.y, ACTIVE_RADIUS, (id, pos) => {
      if (id === attackerId) return;
      const fac = world.get(id, Faction);
      if (!fac || fac.key !== "enemy") return;
      const aggro = world.get(id, AggroState);
      if (!aggro) return;
      if (sleepPreventsPerception(world, id)) return;

      const sightRange = Math.max(0, Math.trunc(getEffectiveVisionRange(world, id)));
      if (chebyshevScalar(pos.x, pos.y, attackerPos.x, attackerPos.y) > sightRange) return;
      const canWitness = (
        hasOverworldAerialLOS(world, {
          sourceId: id,
          targetId: attackerId,
          sourcePos: pos,
          targetPos: attackerPos,
          range: sightRange,
        }) || hasLOS(
          pos.x | 0, pos.y | 0,
          attackerPos.x | 0, attackerPos.y | 0,
          isBlocked,
        )
      );
      if (!canWitness) return;

      aggro.alertLevel = AGGRO_LEVELS.hunting;
      aggro.lastKnownX = attackerPos.x | 0;
      aggro.lastKnownY = attackerPos.y | 0;
      aggro.searchTurnsLeft = SEARCH_TURNS_HUNTING_GRACE;
      world.emit?.("status", { id, kind: "alert", at: { x: pos.x | 0, y: pos.y | 0 } });
    });
  });
}

// ── AI chase system ───────────────────────────────────────────────────

/** @param {any} world */
export function aiChaseSystem(world) {
  // Locate the player.
  const _player = playerEntity(world);
  if (!_player) return;
  const playerId  = _player.id;
  const playerPos = _player.pos;

  // Lazily built blocking map for LOS checks (built once, shared this tick).
  let _isBlocked = null;
  const ensureBlockedMap = () => {
    if (!_isBlocked) _isBlocked = blockedCallback(buildBlocksVisionMap(world));
    return _isBlocked;
  };

  // Ring of Conflict: enemies target each other instead of the player.
  const conflictActive = playerHasConflict(world, playerId);

  forEachInRadius(world, playerPos.x, playerPos.y, ACTIVE_RADIUS, (id, pos) => {
    const ni = world.get(id, NamedIdentity);
    const def = ni ? getMonster(String(ni.identity || "")) : null;
    const fac = world.get(id, Faction);
    const canChase = !!fac && fac.key === "enemy";
    if (!canChase && !def?.alertOnSight) return;

    const aggro = world.get(id, AggroState);
    if (!aggro) return; // no AggroState = no AI behaviour
    if (sleepPreventsPerception(world, id)) return;
    // Stasis freezes the creature before any perception hook can mutate the
    // world directly (teleports, breath attacks, channels, or casts).
    if (statusStrength(world, id, "stasis") > 0) return;

    // ── Look up monster def and brain-backed awareness ──────────────
    const brain = world.get(id, Brain);
    const intel = Number(brain?.intelligence ?? def?.intelligence ?? 10);

    const canActThisTurn = speedGateCheck(world, id);
    const hasQueuedAction = world.has(id, MoveIntent) || world.has(id, FlyIntent);

    // Perception is driven by Brain data rather than action cadence.
    // Use getEffectiveVisionRange so that stat envelope effects (e.g. blindness) apply.
    const sightRange = Math.max(0, Math.trunc(getEffectiveVisionRange(world, id)));
    const withinSightRange = chebyshevScalar(pos.x, pos.y, playerPos.x, playerPos.y) <= sightRange;
    const invisibleTarget = statusStrength(world, playerId, "invisible") > 0;
    const adjacentToTarget = chebyshevScalar(pos.x, pos.y, playerPos.x, playerPos.y) <= 1;
    const canSeeNormally = withinSightRange && (
      hasOverworldAerialLOS(world, {
        sourceId: id,
        targetId: playerId,
        sourcePos: pos,
        targetPos: playerPos,
        range: sightRange,
      }) || hasLOS(
        pos.x | 0, pos.y | 0,
        playerPos.x | 0, playerPos.y | 0,
        ensureBlockedMap(),
      )
    );
    // Stealth rule: non-adjacent invisible targets should not keep enemies in chase mode.
    // They fall back to unaware state so idle movement (scurry/patrol) takes over.
    if (invisibleTarget && !adjacentToTarget) {
      if (aggro.alertLevel !== AGGRO_LEVELS.unaware) {
        aggro.alertLevel = AGGRO_LEVELS.unaware;
        setAggroTarget(world, id, aggro, 0, "lost");
        aggro.searchTurnsLeft = 0;
        aggro.retreating = false;
      }
      return;
    }
    const canSee = canSeeNormally;

    // ── Alert level transitions ─────────────────────────────────────
    if (canSee) {
      if (!canChase) {
        emitSightAlert(world, id, pos, def, aggro);
        return;
      }

      // Passive creatures (e.g. bat, cave_snake, snake) don't aggro from sight
      // while unaware — they are only aggroed by taking damage.
      if (def?.aggro === "passive" && aggro.alertLevel === AGGRO_LEVELS.unaware) {
        if (def?.alertOnSight || Number(def?.sightAlertCooldownTurns || 0) > 0) {
          emitSightAlert(world, id, pos, def, aggro);
        }
        return;
      }

      // Safety in numbers: unaware pack creatures won't aggro from sight alone.
      // They need at least one same-species ally within packRadius.
      if (def?.packSense && aggro.alertLevel === AGGRO_LEVELS.unaware) {
        const myIdentity = ni?.identity;
        if (myIdentity) {
          const packRadius = Math.max(1, (def.packRadius ?? 8) | 0);
          let hasAlly = false;
          forEachInRadius(world, pos.x, pos.y, packRadius, (neighborId) => {
            if (hasAlly) return;
            if (neighborId === id) return;
            if (sleepPreventsPerception(world, neighborId)) return;
            const neighborNI = world.get(neighborId, NamedIdentity);
            if (neighborNI && neighborNI.identity === myIdentity) hasAlly = true;
          });
          if (!hasAlly) return;
        }
      }

      const wasHunting = aggro.alertLevel === AGGRO_LEVELS.hunting;

      aggro.alertLevel      = AGGRO_LEVELS.hunting;
      aggro.lastKnownX      = playerPos.x | 0;
      aggro.lastKnownY      = playerPos.y | 0;
      aggro.searchTurnsLeft = SEARCH_TURNS_HUNTING_GRACE;

      // Track player movement direction for intel ≥ 8 anticipation on LOS break.
      const playerFacing = world.get(playerId, Facing);
      if (playerFacing) {
        const fdx = playerFacing.dx | 0;
        const fdy = playerFacing.dy | 0;
        if (fdx !== 0 || fdy !== 0) {
          aggro.lastKnownMoveDx = fdx;
          aggro.lastKnownMoveDy = fdy;
        }
      }

      // ── First sighting: onSeen hooks + pack alerting ────────────
      if (!wasHunting) {
        emitSightAlert(world, id, pos, def, aggro);
        // onSeen hooks (e.g. spider leap)
        const onSeenHooks = def?.hooks?.onSeen;
        if (!hasQueuedAction && canActThisTurn && Array.isArray(onSeenHooks) && onSeenHooks.length > 0) {
          const seenCtx = new SeenCallbackContext(world, {
            actor:     id,
            target:    playerId,
            actorPos:  { x: pos.x | 0, y: pos.y | 0 },
            targetPos: { x: playerPos.x | 0, y: playerPos.y | 0 },
            canActThisTurn,
            hasQueuedMove: hasQueuedAction,
          });
          runCallbackList(onSeenHooks, seenCtx);
          if (seenCtx.handled || seenCtx.cancelled) return;
        }

        // Pack alerting: wake up nearby same-species creatures.
        if (def?.packSense) {
          const myIdentity = ni?.identity;
          if (myIdentity) {
            const packRadius = Math.max(1, (def.packRadius ?? 8) | 0);
            forEachInRadius(world, pos.x, pos.y, packRadius, (neighborId) => {
              if (neighborId === id) return;
              if (sleepPreventsPerception(world, neighborId)) return;
              const neighborNI = world.get(neighborId, NamedIdentity);
              if (!neighborNI || neighborNI.identity !== myIdentity) return;
              const neighborAggro = world.get(neighborId, AggroState);
              if (!neighborAggro || neighborAggro.alertLevel === AGGRO_LEVELS.hunting) return;
              neighborAggro.alertLevel      = AGGRO_LEVELS.alerted;
              neighborAggro.lastKnownX      = playerPos.x | 0;
              neighborAggro.lastKnownY      = playerPos.y | 0;
              neighborAggro.searchTurnsLeft = SEARCH_TURNS_ALERTED;
              const nPos = world.get(neighborId, Position);
              if (nPos) world.emit('status', { id: neighborId, kind: 'alert', at: { x: nPos.x | 0, y: nPos.y | 0 } });
            });
          }
        }
      }

      // ── whileLOS hooks: fire every turn the monster has LOS ──────────
      const whileLOSHooks = def?.hooks?.whileLOS;
      if (Array.isArray(whileLOSHooks) && whileLOSHooks.length > 0) {
        const losCtx = new SeenCallbackContext(world, {
          actor:     id,
          target:    playerId,
          actorPos:  { x: pos.x | 0, y: pos.y | 0 },
          targetPos: { x: playerPos.x | 0, y: playerPos.y | 0 },
          canActThisTurn,
          hasQueuedMove: hasQueuedAction,
        });
        runCallbackList(whileLOSHooks, losCtx);
        if (losCtx.handled || losCtx.cancelled) return;
      }
    } else {
      // No LOS — tick down the search budget.
      switch (aggro.alertLevel) {
        case AGGRO_LEVELS.hunting: {
          // Intel ≥ 8: anticipate escape route by projecting player's last observed
          // movement direction forward rather than searching from the last seen tile.
          if (intel >= 8 && (aggro.lastKnownMoveDx !== 0 || aggro.lastKnownMoveDy !== 0)) {
            aggro.lastKnownX += aggro.lastKnownMoveDx * 3;
            aggro.lastKnownY += aggro.lastKnownMoveDy * 3;
          }
          aggro.alertLevel      = AGGRO_LEVELS.alerted;
          setAggroTarget(world, id, aggro, 0, "lost");
          aggro.searchTurnsLeft = SEARCH_TURNS_ALERTED;
          break;
        }
        case AGGRO_LEVELS.alerted:
          aggro.searchTurnsLeft--;
          if (aggro.searchTurnsLeft <= 0) {
            aggro.alertLevel      = AGGRO_LEVELS.curious;
            setAggroTarget(world, id, aggro, 0, "lost");
            aggro.searchTurnsLeft = SEARCH_TURNS_CURIOUS;
          }
          break;
        case AGGRO_LEVELS.curious:
          aggro.searchTurnsLeft--;
          if (aggro.searchTurnsLeft <= 0) {
            aggro.alertLevel      = AGGRO_LEVELS.unaware;
            setAggroTarget(world, id, aggro, 0, "lost");
            aggro.searchTurnsLeft = 0;
            aggro.retreating      = false; // clear retreat flag on de-aggro
          }
          break;
        default:
          break; // unaware — do nothing
      }
    }

    // ── Choose movement target ──────────────────────────────────────
    let targetX, targetY;
    let selectedTargetId = playerId;
    let conflictRivalId = 0; // entity id of rival when conflict-redirected
    if (aggro.alertLevel === AGGRO_LEVELS.hunting && conflictActive && canSee) {
      const rival = findNearestRival(world, id, pos.x | 0, pos.y | 0, sightRange, ensureBlockedMap());
      if (rival) {
        targetX = rival.x;
        targetY = rival.y;
        conflictRivalId = rival.id;
        selectedTargetId = rival.id;
      } else {
        // No rival in sight — fall back to normal player targeting
        targetX = playerPos.x | 0;
        targetY = playerPos.y | 0;
        selectedTargetId = playerId;
      }
    } else if (aggro.alertLevel === AGGRO_LEVELS.hunting) {
      const threatTargetId = resolveThreatTarget(world, id, { reason: aggro.targetReason || "threat" }) | 0;
      selectedTargetId = threatTargetId > 0 && world.isAlive(threatTargetId) ? threatTargetId : playerId;
      const selectedPos = world.get(selectedTargetId, Position) || playerPos;
      targetX = selectedPos.x | 0;
      targetY = selectedPos.y | 0;
    } else {
      targetX = aggro.lastKnownX;
      targetY = aggro.lastKnownY;
    }

    if (aggro.alertLevel === AGGRO_LEVELS.hunting) {
      setAggroTarget(world, id, aggro, conflictRivalId || selectedTargetId, conflictRivalId ? "conflict" : (selectedTargetId === playerId ? "sight" : (aggro.targetReason || "threat")));
    } else {
      setAggroTarget(world, id, aggro, 0, "lost");
    }

    if (aggro.alertLevel === AGGRO_LEVELS.unaware) return;

    // Awareness keeps updating every turn; cadence only gates intent production.
    if (!canActThisTurn || hasQueuedAction) return;

    // ── Retreat: update flag based on current HP or fear ────────────
    const feared = statusStrength(world, id, "fear") > 0;
    const retreatThreshold = def?.retreatHpPct ?? 0;
    if (feared && aggro.alertLevel === AGGRO_LEVELS.hunting) {
      aggro.retreating = true;
    } else if (retreatThreshold > 0 && aggro.alertLevel === AGGRO_LEVELS.hunting) {
      const vit = world.get(id, Vitality);
      const hpFraction = vit ? vit.hp / Math.max(1, vit.maxHp) : 1;
      aggro.retreating = hpFraction < retreatThreshold;
    } else {
      aggro.retreating = false;
    }

    // ── Ambush: hold position until player is adjacent ──────────────
    // Ambushers (floating eye, carrion shade, mimic) stay still until the
    // player walks into melee range, then strike.
    if (def?.ambush && aggro.alertLevel === AGGRO_LEVELS.hunting) {
      if (chebyshevScalar(pos.x, pos.y, playerPos.x, playerPos.y) > 1) return; // hold position — don't move yet
      // Player is adjacent; fall through to normal attack/move logic.
    }

    const dxt = targetX - (pos.x | 0);
    const dyt = targetY - (pos.y | 0);

    // Reached last-known position without finding the player; give up sooner.
    if (dxt === 0 && dyt === 0 && aggro.alertLevel !== AGGRO_LEVELS.hunting) {
      aggro.alertLevel = aggro.alertLevel === AGGRO_LEVELS.alerted
        ? AGGRO_LEVELS.curious
        : AGGRO_LEVELS.unaware;
      aggro.searchTurnsLeft = aggro.alertLevel === AGGRO_LEVELS.curious
        ? SEARCH_TURNS_CURIOUS
        : 0;
      return;
    }

    // ── Ranged attack: prefer shooting when hunting and in LOS ──────
    const rangedTargetId = conflictRivalId || selectedTargetId;
    const canSeeRangedTarget = conflictRivalId ? true : canSee; // rival already LOS-checked
    const isKiter = resolveIsKiter(world, id, brain);
    // Kiters (ranged weapon or spells) may shoot even while retreating — their movement
    // logic will hold them at a safe distance rather than fleeing past shoot range.
    if (aggro.alertLevel === AGGRO_LEVELS.hunting && canSeeRangedTarget && (!aggro.retreating || (isKiter && !feared))) {
      const eq = world.get(id, Equipment);
      if (eq && eq.ranged && eq.ammo && world.isAlive(eq.ammo)) {
        const weaponInfo = eq.ranged ? world.get(eq.ranged, ItemInfo) : null;
        const maxRange   = weaponInfo?.range || 8;
        const dist       = chebyshevScalar(pos.x | 0, pos.y | 0, targetX, targetY);
        if (dist > 1 && dist <= maxRange) {
          try {
            world.emit?.('combat:telegraph', {
              actor: id,
              target: rangedTargetId,
              mode: 'ranged',
              turns: 0,
            });
          } catch {}
          try { world.add(id, RangedAttackIntent, { targetId: rangedTargetId }); } catch {}
          return;
        }
      }
    }

    // ── Chase / retreat: step on dominant axis ──────────────────────
    if (dxt === 0 && dyt === 0) return;

    const canTraverseTile = world.has(id, Flying) ? isFlyable : isWalkable;
    const canOpenDoors = monsterCanOpenDoors(world, id);

    const ax = Math.abs(dxt);
    const ay = Math.abs(dyt);
    let dx = 0, dy = 0;
    if (ax >= ay) { dx = Math.sign(dxt); dy = 0; } else { dy = Math.sign(dyt); dx = 0; }

    // ── Tactical spread: intel > 3 enemies avoid stacking approach angles ──
    if (!aggro.retreating && intel > 3 && aggro.alertLevel === AGGRO_LEVELS.hunting) {
      const spreadDir = choosePackSpreadDir(world, id, pos, targetX, targetY, def, canTraverseTile);
      if (spreadDir) { dx = spreadDir.dx; dy = spreadDir.dy; }
    }

    if (!aggro.retreating && isSmartPathingMonster(brain, def)) {
      const nx = (pos.x | 0) + dx;
      const ny = (pos.y | 0) + dy;
      if (!isStepTraversable(world, id, nx, ny, targetX, targetY, canTraverseTile)) {
        const next = findNextCardinalStep(world, pos.x | 0, pos.y | 0, targetX, targetY, id, {
          goalRadius: 0,
          maxNodes: 256,
          isPassable: canTraverseTile,
          passThroughDoors: canOpenDoors,
          searchPadding: Math.max(4, Math.min(intel, 16)),
        });
        if (next) {
          dx = next.dx | 0;
          dy = next.dy | 0;
        }
      }
    }

    // ── Retreat movement dispatch ────────────────────────────────────
    // Each tier gets a tactically distinct retreat behaviour based on intelligence
    // and capability.  Higher tiers take priority over lower ones.
    if (aggro.retreating) {
      const dist = chebyshevScalar(pos.x | 0, pos.y | 0, targetX, targetY);

      if (feared) {
        // Fear is panic, not a tactical retreat.
        dx = -dx;
        dy = -dy;

      } else if (isKiter) {
        // Kite: hold at shoot distance (≥ 3 tiles) and let spell/ranged fire.
        // Flee only when the player closes to melee range.
        if (dist < 3) { dx = -dx; dy = -dy; }
        else { return; }

      } else if (intel >= 8) {
        // Chokepoint defense: path to the nearest corridor tile and hold.
        // neighborCount in [1,2] = real corridor; 0 = unloaded/test environment, skip.
        const neighborCount = walkableNeighborCount(pos.x | 0, pos.y | 0, canTraverseTile);
        if (neighborCount >= 1 && neighborCount <= 2) {
          return; // already in a chokepoint — hold and fight
        }
        const chokeDir = findNearestChokepointDir(world, id, pos, canTraverseTile, canOpenDoors);
        if (chokeDir) { dx = chokeDir.dx | 0; dy = chokeDir.dy | 0; }
        else { dx = -dx; dy = -dy; }

      } else if (def?.packSense && intel >= 4 && intel <= 6) {
        // Rally: regroup with the nearest non-retreating hunting ally.
        const rallyDir = chooseRallyDir(world, id, pos, ni, def, canTraverseTile, canOpenDoors);
        if (rallyDir) { dx = rallyDir.dx | 0; dy = rallyDir.dy | 0; }
        else { dx = -dx; dy = -dy; }

      } else {
        // Default: flee directly away from the target.
        dx = -dx;
        dy = -dy;
      }
    }

    // Blinded creatures stumble: random direction instead of intended path.
    if (sightRange <= 0 && (dx !== 0 || dy !== 0)) {
      const dir = CARDINAL_DIRS[Math.floor(world.rand() * CARDINAL_DIRS.length)];
      dx = dir.dx;
      dy = dir.dy;
    }

    // Intel ≥ 6: avoid stepping onto a revealed armed trap.
    // Try each remaining cardinal direction; if all are trapped, proceed anyway.
    if (intel >= 6 && (dx !== 0 || dy !== 0)) {
      const stepX = (pos.x | 0) + dx;
      const stepY = (pos.y | 0) + dy;
      if (hasRevealedArmedTrap(world, stepX, stepY)) {
        for (const dir of CARDINAL_DIRS) {
          if (dir.dx === dx && dir.dy === dy) continue;
          const altX = (pos.x | 0) + dir.dx;
          const altY = (pos.y | 0) + dir.dy;
          if (hasRevealedArmedTrap(world, altX, altY)) continue;
          if (!isStepTraversable(world, id, altX, altY, targetX, targetY, canTraverseTile)) continue;
          dx = dir.dx; dy = dir.dy;
          break;
        }
      }
    }

    try { world.add(id, MoveIntent, { dx, dy }); } catch {}
  });
}
