// rules/data/bumpResolvers.js
// Ordered dispatch table for bump resolution.
//
// When an actor attempts to move into a blocked tile, the movement system
// iterates this list in priority order and runs the first matching resolver.
// Adding new bump interactions (push boulders, talk to NPCs, kick items)
// is a matter of inserting a new entry — no movement system edits needed.
//
// Each resolver has:
//   name     — human-readable label for debugging / profiling
//   test     — (world, actor, context) => boolean; context contains { nx, ny, target, tiles }
//   resolve  — (world, actor, context) => void; performs the bump action

import { Faction } from "../components/Faction.js";
import { Interactable } from "../components/Interactable.js";
import { Player } from "../components/Player.js";
import { Pet } from "../components/Pet.js";
import { AttackIntent } from "../components/Intents/AttackIntent.js";
import { Equipment } from "../components/Equipment.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { Stamina } from "../components/Stamina.js";
import { Position } from "../components/Position.js";
import { Pushable } from "../components/Pushable.js";
import { Flying } from "../components/Flying.js";
import { DoorState } from "../components/DoorState.js";
import { Owner } from "../components/Owner.js";
import { SecretDoor } from "../components/SecretDoor.js";
import { CreatureType, CREATURE_TYPES } from "../components/CreatureType.js";
import { areFactionsHostile } from "../utils/factionHostility.js";
import { setDoorState } from "../utils/doorAccess.js";
import { findTileReaction } from "./tileReactions.js";
import { getTile, setTile, isLoaded, isWalkable } from "../environment/dungeon/tileMap.js";
import { TILE_DOOR, TILE_VOID, TILE_WALL } from "../environment/dungeon/constants.js";
import { STAMINA_REGEN_COOLDOWN } from "./regenConstants.js";
import { hasActiveDialogSession } from "../dialogues/runtime.js";
import { invalidateTileQueryCache } from "../utils/tileQueryCache.js";

/**
 * @typedef {{
 *   nx: number,
 *   ny: number,
 *   mdx: number,
 *   mdy: number,
 *   target: number,
 *   tiles: import('../utils/tileQueryCache.js').TileQueryState,
 * }} BumpContext
 */

/**
 * @typedef {{
 *   name: string,
 *   test: (world: any, actor: number, ctx: BumpContext) => boolean,
 *   resolve: (world: any, actor: number, ctx: BumpContext) => void,
 * }} BumpResolver
 */

// ── helpers ──────────────────────────────────────────────────────────

function isManhattan1(mdx, mdy) {
  return Math.abs(mdx) + Math.abs(mdy) === 1;
}

function targetIsAtBumpTile(targetId, nx, ny, tiles) {
  if (!(targetId > 0)) return false;
  return tiles.livingByCell.get(`${nx},${ny}`) === targetId;
}

/**
 * Returns true if the creature's type indicates it has hands (can open doors).
 * Humanoids, undead (skeletal hands), and demons can operate door handles.
 * Beasts, constructs, plants, and elementals cannot.
 */
function creatureHasHands(world, actorId) {
  const ct = world.get(actorId, CreatureType);
  const type = ct?.type;
  return type === CREATURE_TYPES.humanoid
      || type === CREATURE_TYPES.undead
      || type === CREATURE_TYPES.demon;
}

/**
 * Find the first closed, unlocked door entity at (nx, ny) via the tile snapshot.
 * Returns the door entity ID or 0 if none.
 */
function findOpenableDoorAt(world, nx, ny, tiles) {
  const k = `${nx},${ny}`;
  const ids = tiles.byCell.get(k);
  if (!ids) return 0;
  for (let i = 0; i < ids.length; i++) {
    const ds = world.get(ids[i], DoorState);
    if (ds && !ds.open && !ds.locked) return ids[i];
  }
  return 0;
}

// ── resolvers (priority order) ──────────────────────────────────────

/** Bump-attack: melee into a hostile living entity on an adjacent tile. */
const hostileMelee = {
  name: "hostile-melee",
  test(world, actor, ctx) {
    if (!isManhattan1(ctx.mdx, ctx.mdy)) return false;
    if (!(ctx.target > 0) || ctx.target === actor) return false;
    // Precision gate: never melee through stale occupancy or non-walkable terrain.
    if (!targetIsAtBumpTile(ctx.target, ctx.nx, ctx.ny, ctx.tiles)) return false;
    if (!isWalkable(ctx.nx, ctx.ny)) return false;
    const actorFac = world.get(actor, Faction);
    const targetFac = world.get(ctx.target, Faction);
    // NPC movement only initiates combat against faction members. Players
    // can still bump-attack destructible objects that have no faction.
    if (!targetFac && !world.has(actor, Player)) return false;
    // Shopkeepers / neutrals with Interactable are handled by npc-interact
    if (targetFac && (targetFac.key === "shopkeeper" || targetFac.key === "neutral" || targetFac.key === "townfolk")
        && world.has(ctx.target, Interactable)) return false;
    if (!areFactionsHostile(actorFac?.key, targetFac?.key)) return false;
    // Spawned creatures never attack their own nest (owner).
    const owner = world.get(actor, Owner);
    if (owner && owner.ownerId === ctx.target) return false;
    return true;
  },
  resolve(world, actor, ctx) {
    if (world.has(actor, AttackIntent)) return;
    world.emit("combat:telegraph", {
      actor,
      target: ctx.target,
      mode: "melee",
      turns: 0,
    });
    // Emit out-of-reach when target is flying and attacker is grounded
    if (world.has(ctx.target, Flying) && !world.has(actor, Flying)) {
      world.emit("combat:target-flying", { attacker: actor, target: ctx.target });
      return;
    }
    let handled = 0;
    try {
      handled = Number(world.emit?.("bump:attack", { attacker: actor, target: ctx.target }) || 0);
    } catch { handled = 0; }
    if (handled <= 0) {
      try { world.add(actor, AttackIntent, { targetId: ctx.target }); } catch {}
    }
  },
};

/** Ally swap: player walks into pet or summoned ally, swap positions. */
const petSwap = {
  name: "pet-swap",
  test(world, actor, ctx) {
    if (!world.has(actor, Player)) return false;
    if (!isManhattan1(ctx.mdx, ctx.mdy)) return false;
    if (!(ctx.target > 0) || ctx.target === actor) return false;
    if (world.has(ctx.target, Pet)) return true;
    const fac = world.get(ctx.target, Faction);
    if (fac?.key === "summoned") return true;
    if (fac?.key === "shopkeeper" || fac?.key === "neutral" || fac?.key === "townfolk") {
      return hasActiveDialogSession(world, actor, ctx.target);
    }
    return false;
  },
  resolve(world, actor, ctx) {
    const actorPos = world.get(actor, Position);
    const petPos = world.get(ctx.target, Position);
    if (!actorPos || !petPos) return;

    const aFrom = { x: actorPos.x, y: actorPos.y };
    const pFrom = { x: petPos.x, y: petPos.y };

    world.set(ctx.target, Position, aFrom);
    world.set(actor, Position, pFrom);

    world.emit("moved", { id: ctx.target, from: pFrom, to: aFrom });
    world.emit("moved", { id: actor, from: aFrom, to: pFrom });
  },
};

/** Bump-interact: walk into a neutral/shopkeeper NPC that has Interactable. */
const npcInteract = {
  name: "npc-interact",
  test(world, actor, ctx) {
    if (!isManhattan1(ctx.mdx, ctx.mdy)) return false;
    if (!(ctx.target > 0) || ctx.target === actor) return false;
    const fac = world.get(ctx.target, Faction);
    if (!fac) return false;
    return (fac.key === "shopkeeper" || fac.key === "neutral" || fac.key === "townfolk")
           && world.has(ctx.target, Interactable);
  },
  resolve(world, actor, ctx) {
    world.emit("bump:interact", { actor, target: ctx.target });
  },
};

/**
 * Enemy door-open: a non-player enemy with hands (humanoid/undead/demon creature type)
 * bumps into a closed, unlocked door and opens it rather than being blocked.
 * The monster spends its action this turn opening the door; it will walk through next turn.
 *
 * Only fires for enemy faction actors — shopkeepers and townfolk have their own
 * door-handling logic in aiTownfolkSystem and must not be intercepted here.
 */
const enemyDoorOpen = {
  name: "enemy-door-open",
  test(world, actor, ctx) {
    if (world.has(actor, Player)) return false; // player uses objectInteract
    const fac = world.get(actor, Faction);
    if (!fac || fac.key !== "enemy") return false; // shopkeepers/townfolk use their own door logic
    if (!isManhattan1(ctx.mdx, ctx.mdy)) return false;
    if (!creatureHasHands(world, actor)) return false;
    return findOpenableDoorAt(world, ctx.nx, ctx.ny, ctx.tiles) > 0;
  },
  resolve(world, actor, ctx) {
    const doorId = findOpenableDoorAt(world, ctx.nx, ctx.ny, ctx.tiles);
    if (!(doorId > 0)) return;
    setDoorState(world, doorId, { open: true, locked: false }, actor);
  },
};

/** Bump-interact: walk into a non-living interactable (door, chest, altar). Player only. */
const objectInteract = {
  name: "object-interact",
  test(world, actor, ctx) {
    if (!world.has(actor, Player)) return false;
    const interactId = ctx.tiles.interactableByCell.get(`${ctx.nx},${ctx.ny}`);
    if (!(interactId > 0)) return false;
    if (ctx.target > 0 && ctx.target !== interactId) return false; // living target handled above
    return true;
  },
  resolve(world, actor, ctx) {
    const interactId = ctx.tiles.interactableByCell.get(`${ctx.nx},${ctx.ny}`);
    world.emit("bump:interact", { actor, target: interactId });
  },
};

/** Hidden door discovery: three deliberate bumps reveal a secret wall door. */
const secretDoorBump = {
  name: "secret-door-bump",
  test(world, actor, ctx) {
    if (!world.has(actor, Player)) return false;
    if (!isManhattan1(ctx.mdx, ctx.mdy)) return false;
    const ids = ctx.tiles.byCell.get(`${ctx.nx},${ctx.ny}`);
    if (!ids) return false;
    for (let i = 0; i < ids.length; i++) {
      const secret = world.get(ids[i], SecretDoor);
      if (secret && !secret.revealed && getTile(ctx.nx, ctx.ny) === TILE_WALL) return true;
    }
    return false;
  },
  resolve(world, actor, ctx) {
    const ids = ctx.tiles.byCell.get(`${ctx.nx},${ctx.ny}`) || [];
    for (let i = 0; i < ids.length; i++) {
      const doorId = ids[i];
      const secret = world.get(doorId, SecretDoor);
      if (!secret || secret.revealed) continue;
      const bumpCount = Math.min(3, Math.max(0, Number(secret.bumpCount || 0) | 0) + 1);
      if (bumpCount < 3) {
        world.set(doorId, SecretDoor, { ...secret, bumpCount });
        const text = bumpCount === 1
          ? "*** the wall feels oddly hollow ***"
          : "*** something answers from behind the wall ***";
        world.emit("message", { text, type: "system" });
        return;
      }
      if (getTile(ctx.nx, ctx.ny) !== TILE_WALL) return;
      setTile(ctx.nx, ctx.ny, TILE_DOOR);
      world.set(doorId, SecretDoor, { ...secret, bumpCount, revealed: true });
      invalidateTileQueryCache(world);
      world.emit("message", { text: "*** the hidden door is revealed! ***", type: "system" });
      world.emit("search:revealed", {
        actorId: actor,
        entityId: doorId,
        kind: "secret_door",
        at: { x: ctx.nx, y: ctx.ny },
        source: "bump",
      });
      return;
    }
  },
};

/** Push entity: player bumps a Pushable entity (e.g. statue) and shoves it one tile. */
const pushEntity = {
  name: "push-entity",
  test(world, actor, ctx) {
    if (!world.has(actor, Player)) return false;
    if (!isManhattan1(ctx.mdx, ctx.mdy)) return false;
    return _findPushable(world, ctx) > 0;
  },
  resolve(world, actor, ctx) {
    const targetId = _findPushable(world, ctx);
    if (targetId <= 0) return;

    const destX = ctx.nx + ctx.mdx;
    const destY = ctx.ny + ctx.mdy;
    const destKey = `${destX},${destY}`;

    if (!isWalkable(destX, destY) || ctx.tiles.blockedByCell.has(destKey)) {
      world.emit("entity:push-blocked", { actor, target: targetId });
      return;
    }

    const from = { x: ctx.nx, y: ctx.ny };
    const to = { x: destX, y: destY };
    world.set(targetId, Position, to);
    world.emit("entity:pushed", { actor, target: targetId, from, to });
    world.emit("moved", { id: targetId, from, to });
  },
};

/** Scan byCell for a Pushable entity at (nx, ny). */
function _findPushable(world, ctx) {
  const k = `${ctx.nx},${ctx.ny}`;
  const ids = ctx.tiles.byCell.get(k);
  if (!ids) return 0;
  for (let i = 0; i < ids.length; i++) {
    if (world.has(ids[i], Pushable)) return ids[i];
  }
  return 0;
}

/** Tile reaction: dig walls, chop trees, etc. Player only. Data-driven via tileReactions.js. */
const tileReaction = {
  name: "tile-reaction",
  test(world, actor, ctx) {
    if (!world.has(actor, Player)) return false;
    if (ctx.target > 0) return false;
    const tileType = getTile(ctx.nx, ctx.ny);
    const eq = world.get(actor, Equipment);
    const weaponId = eq?.weapon || 0;
    if (!weaponId) return false;
    const wInfo = world.get(weaponId, ItemInfo);
    if (!wInfo?.bonuses) return false;
    return findTileReaction(tileType, wInfo.bonuses) !== null;
  },
  resolve(world, actor, ctx) {
    const tileType = getTile(ctx.nx, ctx.ny);
    const eq = world.get(actor, Equipment);
    const weaponId = eq?.weapon || 0;
    const wInfo = world.get(weaponId, ItemInfo);
    const reaction = findTileReaction(tileType, wInfo.bonuses);
    if (!reaction) return;

    const stam = world.get(actor, Stamina);
    const cost = Number(wInfo[reaction.costField] ?? reaction.costDefault);
    if (!stam || Number(stam.stamina ?? 0) < cost) {
      world.emit("attack:insufficient-stamina", {
        attacker: actor,
        need: cost,
        have: Number(stam?.stamina ?? 0),
      });
      return;
    }

    world.set(actor, Stamina, {
      ...stam,
      stamina: stam.stamina - cost,
      regenCooldown: STAMINA_REGEN_COOLDOWN,
    });
    setTile(ctx.nx, ctx.ny, reaction.result);

    // Backfill void neighbors if specified
    if (reaction.backfill != null) {
      for (const [dx, dy] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        if (isLoaded(ctx.nx + dx, ctx.ny + dy) && getTile(ctx.nx + dx, ctx.ny + dy) === TILE_VOID) {
          setTile(ctx.nx + dx, ctx.ny + dy, reaction.backfill);
        }
      }
    }

    world.emit(reaction.event, { actor, x: ctx.nx, y: ctx.ny });
    if (reaction.audioKey) {
      world.emit("audio:play", { key: reaction.audioKey, at: { x: ctx.nx, y: ctx.ny }, sourceId: actor });
    }
  },
};

/** @type {BumpResolver[]} */
export const BUMP_RESOLVERS = [
  hostileMelee,
  petSwap,
  npcInteract,
  enemyDoorOpen,
  secretDoorBump,
  objectInteract,
  pushEntity,
  tileReaction,
];

/**
 * Run bump resolution: iterate resolvers in priority order, execute the first match.
 * @param {any} world
 * @param {number} actor
 * @param {BumpContext} ctx
 * @returns {boolean} true if a resolver handled the bump
 */
export function resolveBump(world, actor, ctx) {
  for (let i = 0; i < BUMP_RESOLVERS.length; i++) {
    const r = BUMP_RESOLVERS[i];
    if (r.test(world, actor, ctx)) {
      r.resolve(world, actor, ctx);
      return true;
    }
  }
  return false;
}
