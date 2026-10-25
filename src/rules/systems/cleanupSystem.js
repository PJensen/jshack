// src/rules/systems/cleanupSystem.js
// Removes entities that have zero (or below) Vitality at the end of the current turn.
// Gameplay rationale: doing cleanup at the end of the turn prevents "dead men walking"
// in subsequent ticks while still allowing all systems in the current turn to react
// to the death (events, affixes, VFX, logging). In-engine, destroy() during a tick
// is deferred to the tick flush, so this acts as end-of-turn removal.

import { Vitality } from "../components/Vitality.js";
import { Inventory } from "../components/Inventory.js";
import { Position } from "../components/Position.js";
import { Player } from "../components/Player.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { Equipment } from "../components/Equipment.js";
import { GroundStackOrder } from "../components/GroundStackOrder.js";
import {
  destroyInventoryRoot,
  inventoryItems,
  placeOnGround,
  removeFromInventory,
} from "../utils/inventoryFacade.js";
import { DungeonState } from "../components/DungeonState.js";
import { Pet } from "../components/Pet.js";
import { Owner } from "../components/Owner.js";
import { createRng } from "../../lib/ecs-js/rng.js";
import {
  getMonster,
  getMonsterLootTable,
  getMonsterTags,
} from "../data/monsters.js";
import { dropLoot } from "../data/lootResolver.js";
import { createCorpse } from "../archetypes/Food.js";
import { createFrom } from "../../lib/ecs-js/archetype.js";
import { Ashes, Bone } from "../archetypes/Items.js";
import { EffectInstance } from "../components/EffectInstance.js";
import { childrenWith } from "../utils/topology.js";
import { removeEffectInstance } from "../utils/effectInstances.js";

const GROUND_STACK_SEQ_KEY = Symbol.for("jshack:groundStack:seq");
const DEATH_IMPACT_KEY = Symbol.for("jshack:deathImpact:map");

export function recordDeathImpactFromDamage(world, { target, impactVector, critical, amount, rawAmount, cause }) {
  if (!(Number(target) > 0)) return;
  const dealt = Number(amount || rawAmount || 0);
  if (!(dealt > 0)) return;
  if (!world[DEATH_IMPACT_KEY]) world[DEATH_IMPACT_KEY] = new Map();
  const dx = Number(impactVector?.dx || 0);
  const dy = Number(impactVector?.dy || 0);
  world[DEATH_IMPACT_KEY].set(Number(target) | 0, {
    dx, dy,
    critical: !!critical,
    cause: String(cause || ''),
    amount: Number(amount || 0) | 0,
    rawAmount: Number(rawAmount || 0) | 0,
    step: world.step | 0,
  });
}

function getDeathImpact(world, entityId) {
  const map = world[DEATH_IMPACT_KEY];
  if (!map) return null;
  const id = Number(entityId) | 0;
  const info = map.get(id);
  if (!info) return null;
  map.delete(id);
  if ((info.step | 0) !== (world.step | 0)) return null;
  return info;
}

function nextGroundStackSeq(world) {
  const current = Number((/** @type {any} */ (world))[GROUND_STACK_SEQ_KEY] || 0) | 0;
  const next = (current + 1) | 0;
  (/** @type {any} */ (world))[GROUND_STACK_SEQ_KEY] = next;
  return next;
}

function stampGroundTop(world, itemId) {
  if (!(Number(itemId) > 0)) return;
  world.add(itemId, GroundStackOrder, { seq: nextGroundStackSeq(world) });
}

function collectDropItemIds(world, actorId, monsterDef) {
  const out = [];
  const seen = new Set();
  const push = (itemId) => {
    const id = Number(itemId || 0) | 0;
    if (!(id > 0) || !world.isAlive(id)) return;
    if (seen.has(id)) return;
    if (!world.has(id, ItemInfo)) return;
    seen.add(id);
    out.push(id);
  };

  // Non-equipped inventory items always drop (picked-up loot, table results)
  for (const itemId of inventoryItems(world, actorId)) push(itemId);

  // Equipped gear: monsters only drop each piece with a tier-scaled chance.
  // Players and pets always drop everything.
  const eq = world.get(actorId, Equipment);
  if (eq && typeof eq === "object") {
    if (!monsterDef || world.has(actorId, Player)) {
      for (const value of Object.values(eq)) push(value);
    } else {
      const tier = Number(monsterDef.tier || 0);
      const dropChance = Math.min(0.60, 0.15 + tier * 0.10);
      const rng = createRng((world.seed ^ (world.step | 0) ^ actorId) >>> 0);
      for (const value of Object.values(eq)) {
        const id = Number(value || 0) | 0;
        if (!(id > 0) || !world.isAlive(id) || seen.has(id)) continue;
        if (!world.has(id, ItemInfo)) continue;
        if (rng.next() < dropChance) {
          seen.add(id);
          out.push(id);
        }
      }
    }
  }
  return out;
}

function corpseDropChance(monsterDef, wasPet) {
  if (wasPet) return 1.0;
  if (!monsterDef) return 0;
  if (Number.isFinite(monsterDef.corpseDropChance)) {
    const v = Number(monsterDef.corpseDropChance);
    return Math.max(0, Math.min(1, v));
  }
  return Math.min(1.0, 0.25 + (monsterDef.tier || 0) * 0.10);
}

function isBurningOnDeath(world, id) {
  const ae = world.get(id, ActiveEffects);
  if (!ae || !Array.isArray(ae.effects)) return false;
  return ae.effects.some((effect) => {
    const key = String(effect?.key || "").toLowerCase();
    return key === "burn" || key === "burning";
  });
}

/**
 * Collect all entities with Vitality and remove those whose hp <= 0.
 * Keep this system small and deterministic; drops/epitaphs/etc. can be layered later.
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function cleanupSystem(world) {
  for (const [id, vit] of world.query(Vitality)) {
    if (!vit) continue;
    if ((vit.hp | 0) <= 0 && world.isAlive(id)) {
      const ident = world.get(id, NamedIdentity);
      const wasPet = world.has(id, Pet);
      const petOwnerId = wasPet
        ? (Number(world.get(id, Owner)?.ownerId || 0) | 0)
        : 0;
      const monsterDef = ident ? getMonster(ident.identity) : null;
      const effectiveMonsterDef = monsterDef || (wasPet
        ? {
          id: ident?.identity || "pet",
          name: ident?.name || "Pet",
          sizeClass: "S",
          massKg: 10,
          tier: 0,
        }
        : null);

      // Drop all inventory items at the entity's current position before destroying
      const pos = world.get(id, Position);
      // Retrieve the killing blow's impact vector (direction + magnitude).
      const deathImpact = pos ? getDeathImpact(world, id) : null;
      // Compute overkill: how far past 0 the killing blow went.
      // Combine with rawAmount for a "force" scalar that modulates scatter.
      const overkill = Math.max(0, -(vit.hp | 0));
      const impactForce = deathImpact
        ? Math.min(3, 1 + (overkill / Math.max(1, deathImpact.amount || 1))
          + (deathImpact.critical ? 0.5 : 0))
        : 1;
      const impulse = deathImpact
        ? { dx: deathImpact.dx * impactForce, dy: deathImpact.dy * impactForce,
            critical: deathImpact.critical, force: impactForce,
            cause: deathImpact.cause }
        : null;

      if (pos) {
        const items = collectDropItemIds(world, id, monsterDef);
        const dx = pos.x | 0;
        const dy = pos.y | 0;
        for (let i = 0; i < items.length; i++) {
          const itemId = items[i];
          const info = world.get(itemId, ItemInfo);
          removeFromInventory(world, id, itemId);
          const placed = placeOnGround(world, itemId, dx, dy, { mergeCompatibleAmmo: true });
          if (placed.itemId > 0) stampGroundTop(world, placed.itemId);
          try {
            world.emit &&
              world.emit("item:dropped", {
                actor: id,
                itemId: placed.itemId || itemId,
                count: info?.count || 1,
                at: { x: dx, y: dy },
                source: "death",
                origin: { x: dx, y: dy },
                impulse,
              });
          } catch (e) {
            console.debug("[cleanupSystem] emit item:dropped failed:", e);
          }
        }
      }

      // Generate loot from monster's loot table
      if (ident && pos) {
        if (effectiveMonsterDef) {
          // Drop loot only if there's a real monster definition with a loot table
          if (monsterDef) {
            const tableId = getMonsterLootTable(monsterDef);
            const step = world.step | 0;
            const lootSeed = ((world.seed >>> 0) ^ ((step * 0x9e3779b9) >>> 0) ^
              ((id * 0x517cc1b7) >>> 0)) >>> 0;
            const rng = createRng(lootSeed);
            let depth = 1;
            for (const [, ds] of world.query(DungeonState)) {
              depth = ds.currentDepth || 1;
              break;
            }
            const deathOrigin = { x: pos.x | 0, y: pos.y | 0 };
            dropLoot(world, tableId, rng, depth, { x: pos.x, y: pos.y },
              { actor: id, source: "death", origin: deathOrigin, impulse });
          }

          // Drop a corpse for the killed monster or pet.
          // Use monster-authored corpseDropChance when present.
          const corpseChance = corpseDropChance(effectiveMonsterDef, wasPet);
          const burnedToDeath = isBurningOnDeath(world, id);
          // Use the RNG if available, otherwise just check corpseChance directly
          let shouldCreateCorpse = false;
          if (burnedToDeath) {
            shouldCreateCorpse = true;
          } else if (monsterDef) {
            const step = world.step | 0;
            const lootSeed = ((world.seed >>> 0) ^ ((step * 0x9e3779b9) >>> 0) ^
              ((id * 0x517cc1b7) >>> 0)) >>> 0;
            const rng = createRng(lootSeed);
            const corpseRoll = rng.next();
            shouldCreateCorpse = corpseRoll < corpseChance;
          } else {
            // For pets without monster defs, always create corpse
            shouldCreateCorpse = wasPet;
          }

          if (shouldCreateCorpse) {
            let droppedId;
            if (burnedToDeath) {
              droppedId = createFrom(world, Ashes, {});
              world.add(droppedId, Position, { x: pos.x, y: pos.y });
            } else {
              // Skeletal monsters drop bones instead of corpses
              const tags = getMonsterTags(effectiveMonsterDef.id);
              const isSkeletal = tags.includes("skeletal");
              if (isSkeletal && !wasPet) {
                droppedId = createFrom(world, Bone, {});
                world.add(droppedId, Position, { x: pos.x, y: pos.y });
              } else {
                droppedId = createCorpse(world, effectiveMonsterDef, {
                  x: pos.x,
                  y: pos.y,
                });
              }
            }

            // If this was a pet, mark the corpse with Pet tag and Owner
            if (!burnedToDeath && wasPet && petOwnerId) {
              try {
                world.add(droppedId, Pet);
                world.add(droppedId, Owner, { ownerId: petOwnerId });
              } catch { /* */ }
            }

            try {
              world.emit &&
                world.emit("item:dropped", {
                  actor: id,
                  itemId: droppedId,
                  count: 1,
                  at: { x: pos.x, y: pos.y },
                  source: "death",
                  origin: { x: pos.x | 0, y: pos.y | 0 },
                  impulse,
                });
            } catch { /* */ }
          }
        }
      }

      // Emit betrayal event if a pet died
      if (wasPet && petOwnerId) {
        try {
          world.emit && world.emit("pet:died", {
            petId: id,
            ownerId: petOwnerId,
            name: ident?.name || "pet",
            at: pos,
          });
        } catch { /* */ }
      }

      for (const [effectId] of [...childrenWith(world, id, EffectInstance)]) {
        removeEffectInstance(world, effectId, "death");
      }
      destroyInventoryRoot(world, id);
      world.destroy(id);
    }
  }
}
