import { makeRegistry, serializeWorld } from "../../lib/ecs-js/serialization.js";
import * as Exported from "../../rules/components/index.js";
import { Alignment } from "../../rules/components/Alignment.js";
import { Brain } from "../../rules/components/Brain.js";
import { Collider } from "../../rules/components/Collider.js";
import { Damage } from "../../rules/components/Damage.js";
import { DoorState } from "../../rules/components/DoorState.js";
import { Dungeon, DungeonLevel, DungeonLevelLink } from "../../rules/components/Dungeon.js";
import { DungeonState } from "../../rules/components/DungeonState.js";
import { Faction } from "../../rules/components/Faction.js";
import { FoodDecay } from "../../rules/components/FoodDecay.js";
import { Inventory } from "../../rules/components/Inventory.js";
import { InteractIntent } from "../../rules/components/Intents/InteractIntent.js";
import { MeleeAttackIntent } from "../../rules/components/Intents/MeleeAttackIntent.js";
import { AttackDirectionIntent } from "../../rules/components/Intents/AttackDirectionIntent.js";
import { Interactable } from "../../rules/components/Interactable.js";
import { AltarOfferingState } from "../../rules/components/AltarOfferingState.js";
import { Mana } from "../../rules/components/Mana.js";
import { CombatLog as MessageLog } from "../../rules/components/MessageLog.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { Owner } from "../../rules/components/Owner.js";
import { Pet } from "../../rules/components/Pet.js";
import { Position } from "../../rules/components/Position.js";
import { Potion } from "../../rules/components/Potion.js";
import { Projectile } from "../../rules/components/Projectile.js";
import { Score } from "../../rules/components/Score.js";
import { ShopInventory } from "../../rules/components/ShopInventory.js";
import { Speed } from "../../rules/components/Speed.js";
import { Spell } from "../../rules/components/Spell.js";
import { Terrain } from "../../rules/components/Terrain.js";
import { Tombstone } from "../../rules/components/Tombstone.js";
import { Trap } from "../../rules/components/Trap.js";
import { Trigger } from "../../rules/components/Trigger.js";
import { Parent, Sibling } from "../../lib/ecs-js/hierarchy.js";
import { InventoryRoot } from "../../rules/components/InventoryRoot.js";
import { Weight } from "../../rules/components/Weight.js";
import { ItemCooldown } from "../../rules/components/ItemCooldown.js";
import { ScriptState } from "../../rules/components/ScriptState.js";

// Chest-relevant components are intentionally prioritized at the front.
const CHEST_FIRST_COMPONENTS = Object.freeze([
  Inventory,
  Interactable,
  AltarOfferingState,
  NamedIdentity,
  Position,
]);

const KNOWN_COMPONENTS = Object.freeze([
  ...Object.values(Exported),
  Alignment,
  Brain,
  Collider,
  Damage,
  DoorState,
  Dungeon,
  DungeonLevel,
  DungeonLevelLink,
  DungeonState,
  Faction,
  FoodDecay,
  InteractIntent,
  MeleeAttackIntent,
  AttackDirectionIntent,
  Mana,
  MessageLog,
  Owner,
  Pet,
  Potion,
  Projectile,
  Score,
  ShopInventory,
  Speed,
  Spell,
  Terrain,
  Tombstone,
  Trap,
  Trigger,
  Parent,
  Sibling,
  InventoryRoot,
  Weight,
  ItemCooldown,
  ScriptState,
]);

/**
 * Build runtime serialization registry.
 * Uses ecs-js makeRegistry() and keeps chest-related components first.
 * @param {import("../../lib/ecs-js/index.js").World} world
 */
export function buildSavegameSerializationRegistry(world) {
  /** @type {any[]} */
  const runtime = [];
  for (const [, store] of world?._store || []) {
    const comp = store?._comp;
    if (!comp) continue;
    runtime.push(comp);
  }
  return makeRegistry(CHEST_FIRST_COMPONENTS, KNOWN_COMPONENTS, runtime);
}

/**
 * Ordered component names currently in the savegame registry.
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @returns {string[]}
 */
export function getSavegameRegistryNames(world) {
  return Array.from(buildSavegameSerializationRegistry(world).keys());
}

// The game turn is separate from ecs-js's serialized time/frame metadata.
// Absolute item cooldowns must resume against the same turn after loading.
export function serializeSavegameWorld(world, options = {}) {
  const snapshot = serializeWorld(world, { include: getSavegameRegistryNames(world), ...options });
  return { ...snapshot, meta: { ...snapshot.meta, step: world.step } };
}
