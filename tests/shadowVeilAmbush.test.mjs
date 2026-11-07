import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Player } from "../src/rules/components/Player.js";
import { AttackIntent } from "../src/rules/components/Intents/AttackIntent.js";
import { RangedAttackIntent } from "../src/rules/components/Intents/RangedAttackIntent.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { combatSystem } from "../src/rules/systems/combatSystem.js";
import { rangedAttackSystem } from "../src/rules/systems/rangedAttackSystem.js";
import { aiChaseSystem } from "../src/rules/systems/aiChaseSystem.js";
import { effectSystem } from "../src/rules/systems/effectSystem.js";
import { stealthAmbushSystem } from "../src/rules/systems/stealthAmbushSystem.js";
import { resolveCombatSnapshot } from "../src/rules/utils/resolveCombatSnapshot.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { configureWorld } from "../src/main/scheduler.js";
import { SPELL_DEFS } from "../src/rules/data/spells.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";

function createMeleePair(seed = 7) {
  const world = new World({ seed });
  const attacker = world.create();
  const defender = world.create();

  world.add(attacker, Position, { x: 4, y: 4 });
  world.add(defender, Position, { x: 4, y: 5 });
  world.add(attacker, Vitality, { maxHp: 20, hp: 20 });
  world.add(defender, Vitality, { maxHp: 20, hp: 20 });
  world.add(attacker, Equipment, {
    accuracyDerived: 10,
    damagePowerDerived: 8,
    naturalDamageDice: "1d8",
  });
  world.add(defender, Equipment, { evadeDerived: 0 });

  return { world, attacker, defender };
}

function createRangedPair(seed = 11) {
  const world = new World({ seed });
  const attacker = world.create();
  const defender = world.create();
  const bowId = world.create();
  const ammoId = world.create();

  world.add(attacker, Position, { x: 2, y: 2 });
  world.add(defender, Position, { x: 5, y: 2 });
  world.add(attacker, Vitality, { maxHp: 20, hp: 20 });
  world.add(defender, Vitality, { maxHp: 20, hp: 20 });
  world.add(attacker, Inventory, { capacity: 16 });
  world.add(attacker, Equipment, { ranged: bowId, ammo: ammoId, accuracyDerived: 8, damagePowerDerived: 6 });
  world.add(defender, Equipment, { evadeDerived: 0 });

  world.add(bowId, ItemInfo, {
    type: "equip",
    slot: "ranged",
    subtype: "bow",
    damageDice: "1d6",
    range: 8,
    count: 1,
    bonuses: {},
    affixes: [],
    rarity: 1,
    rarityName: "common",
    weight: 1,
    value: 0,
    description: "Test Bow",
  });
  world.add(ammoId, ItemInfo, {
    type: "ammo",
    slot: "",
    count: 6,
    bonuses: {},
    affixes: [],
    rarity: 1,
    rarityName: "common",
    weight: 0,
    value: 0,
    description: "Test Ammo",
  });
  addToInventory(world, attacker, bowId);
  addToInventory(world, attacker, ammoId);

  return { world, attacker, defender };
}

function addStealthEffects(world, entityId) {
  world.add(entityId, ActiveEffects, {
    effects: [
      { key: "invisible", turnsLeft: 30, potency: 1, stacks: 1 },
      { key: "shadow_cloak", turnsLeft: 30, potency: 1, stacks: 1 },
    ],
  });
}

Deno.test("shadow veil owns concealment and ambush lifecycle", () => {
  const { world, attacker, defender } = createMeleePair(37);
  runSpellScript(world, attacker, SPELL_DEFS.shadow_veil, {});
  const before = resolveCombatSnapshot(world, attacker, { mode: "melee" });
  assertEquals(effectKeys(world, attacker), ["shadow_veil"]);
  assert(before.damageMult >= 4, "shadow veil should prime its opener damage");

  world.add(attacker, AttackIntent, { targetId: defender });
  combatSystem(world);
  const veil = world.get(attacker, ActiveEffects).effects[0];
  const after = resolveCombatSnapshot(world, attacker, { mode: "melee" });
  assertEquals(veil.key, "shadow_veil");
  assertEquals(veil.meta.ambushReady, false);
  assert(after.damageMult < before.damageMult, "shadow veil opener should be consumed without ending concealment");
});

function effectKeys(world, entityId) {
  const ae = world.get(entityId, ActiveEffects);
  return Array.isArray(ae?.effects) ? ae.effects.map((e) => String(e?.key || "")) : [];
}

Deno.test("shadow cloak crit bonus applies only while invisible", () => {
  const base = createMeleePair(17);
  base.world.add(base.attacker, ActiveEffects, {
    effects: [{ key: "shadow_cloak", turnsLeft: 30, potency: 1, stacks: 1 }],
  });
  const withoutInvis = resolveCombatSnapshot(base.world, base.attacker, { mode: "melee" });

  const stealthed = createMeleePair(17);
  addStealthEffects(stealthed.world, stealthed.attacker);
  const withInvis = resolveCombatSnapshot(stealthed.world, stealthed.attacker, { mode: "melee" });

  assert(withInvis.critChance > withoutInvis.critChance, "invisibility should enable shadow cloak crit chance bonus");
  assert(withInvis.critMult > withoutInvis.critMult, "invisibility should enable shadow cloak crit multiplier bonus");
  assert(withInvis.damageMult >= withoutInvis.damageMult * 4, "invisibility + shadow cloak should grant 4x opener damage multiplier");
});

Deno.test("melee hidden attack keeps invisibility and consumes ambush bonus", () => {
  const { world, attacker, defender } = createMeleePair(23);
  addStealthEffects(world, attacker);
  const before = resolveCombatSnapshot(world, attacker, { mode: "melee" });
  let offenseEvents = 0;
  world.on("stealth:offense", ({ entityId, mode, targetId, hidden, ambushConsumed }) => {
    if (entityId === attacker && mode === "melee" && targetId === defender && hidden && ambushConsumed) offenseEvents += 1;
  });

  world.add(attacker, AttackIntent, { targetId: defender });
  combatSystem(world);

  const after = resolveCombatSnapshot(world, attacker, { mode: "melee" });
  const keys = effectKeys(world, attacker);
  assert(keys.includes("invisible"), "attacker should remain invisible after hidden offense");
  assert(!keys.includes("shadow_cloak"), "shadow_cloak opener buff should be consumed by first offensive action");
  assert(after.critChance < before.critChance, "ambush crit chance should drop after opener consumption");
  assert(after.critMult < before.critMult, "ambush crit multiplier should drop after opener consumption");
  assert(after.damageMult < before.damageMult, "ambush damage multiplier should be consumed after first hidden attack");
  assertEquals(offenseEvents, 1);
});

Deno.test("ranged hidden attack keeps invisibility and consumes opener buff", () => {
  const { world, attacker, defender } = createRangedPair(29);
  addStealthEffects(world, attacker);
  let offenseEvents = 0;
  world.on("stealth:offense", ({ entityId, mode, targetId, hidden, ambushConsumed }) => {
    if (entityId === attacker && mode === "ranged" && targetId === defender && hidden && ambushConsumed) offenseEvents += 1;
  });

  world.add(attacker, RangedAttackIntent, { targetId: defender, toX: 5, toY: 2 });
  rangedAttackSystem(world);

  const keys = effectKeys(world, attacker);
  assert(keys.includes("invisible"), "attacker should remain invisible after hidden offense");
  assert(!keys.includes("shadow_cloak"), "shadow_cloak opener buff should be consumed by first ranged offensive action");
  assertEquals(offenseEvents, 1);
});

Deno.test("aiChase disengages non-adjacent enemies when player is invisible", () => {
  const world = new World({ seed: 31 });
  const player = world.create();
  world.add(player, Position, { x: 4, y: 4 });
  world.add(player, ActiveEffects, { effects: [{ key: "invisible", turnsLeft: 20, potency: 1, stacks: 1 }] });
  world.add(player, Faction, { key: "player" });
  world.add(player, Vitality, { maxHp: 20, hp: 20 });
  world.add(player, Player, {});

  const enemy = world.create();
  world.add(enemy, Position, { x: 4, y: 9 });
  world.add(enemy, Faction, { key: "enemy" });
  world.add(enemy, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: 4,
    lastKnownY: 4,
    searchTurnsLeft: 8,
    retreating: false,
    patrolDx: 0,
    patrolDy: 0,
  });

  aiChaseSystem(world);
  assertEquals(world.get(enemy, AggroState)?.alertLevel, AGGRO_LEVELS.unaware);
  assert(!world.has(enemy, MoveIntent), "enemy should not get chase intent while target is invisible and non-adjacent");
});

Deno.test("shadow cloak re-arms after quiet period while invisibility remains active", () => {
  const { world, attacker, defender } = createMeleePair(37);
  world.add(attacker, Faction, { key: "player" });
  world.add(defender, Faction, { key: "enemy" });
  addStealthEffects(world, attacker);

  world.add(attacker, AttackIntent, { targetId: defender });
  combatSystem(world);
  let keys = effectKeys(world, attacker);
  assert(keys.includes("invisible"), "invisibility should persist after opener");
  assert(!keys.includes("shadow_cloak"), "opener should be consumed");

  // Move enemy far away so rearm cooldown can tick down as "quiet".
  world.set(defender, Position, { x: 80, y: 80 });

  for (let i = 0; i < 10; i++) {
    stealthAmbushSystem(world);
    effectSystem(world);
  }

  keys = effectKeys(world, attacker);
  assert(keys.includes("invisible"), "invisibility should still be active");
  assert(keys.includes("shadow_cloak"), "shadow cloak should re-arm after quiet period");
});

Deno.test("configureWorld installs stealth offense witness aggro listener", () => {
  const world = new World({ seed: 41 });
  configureWorld(world);

  const attacker = world.create();
  world.add(attacker, Position, { x: 4, y: 4 });
  world.add(attacker, Faction, { key: "player" });

  const enemy = world.create();
  world.add(enemy, Position, { x: 4, y: 6 });
  world.add(enemy, Faction, { key: "enemy" });
  world.add(enemy, AggroState, {
    alertLevel: AGGRO_LEVELS.unaware,
    lastKnownX: 0,
    lastKnownY: 0,
    searchTurnsLeft: 0,
    retreating: false,
    patrolDx: 0,
    patrolDy: 0,
  });

  world.emit("stealth:offense", { entityId: attacker, at: { x: 4, y: 4 } });
  const aggro = world.get(enemy, AggroState);
  assertEquals(aggro?.alertLevel, AGGRO_LEVELS.hunting);
  assertEquals(aggro?.lastKnownX, 4);
  assertEquals(aggro?.lastKnownY, 4);
  assert((aggro?.searchTurnsLeft || 0) > 0);
});
