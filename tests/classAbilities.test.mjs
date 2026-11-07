// tests/classAbilities.test.mjs
// Tests for the 8 new class abilities: war_cry, cleave, bloodthirst,
// purify, divine_shield, consecrate, smoke_bomb, poison_blade.

import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { SPELL_DEFS } from "../src/rules/data/spells.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { Position } from "../src/rules/components/Position.js";
import { Brain } from "../src/rules/components/Brain.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Stamina } from "../src/rules/components/Stamina.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Facing } from "../src/rules/components/Facing.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { getEffectiveVisionRange } from "../src/rules/utils/blind.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { dealDamage } from "../src/rules/utils/dealDamage.js";
import { effectSystem } from "../src/rules/systems/effectSystem.js";
import { resolveCombatSnapshot } from "../src/rules/utils/resolveCombatSnapshot.js";

function makeWorld(seed = 0xBEEF) {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  const world = new World({ seed });
  // DungeonState needed for hazard floor attachment
  const ds = world.create();
  world.add(ds, DungeonState, {
    currentDepth: 1, worldSeed: seed, floorEntityIds: [],
    profileType: 'dungeon',
  });
  return world;
}

function makeCaster(world, x = 5, y = 5, faction = 'player') {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Brain, { visionRange: 8, intelligence: 10, learnedSpellIds: [] });
  world.add(id, Faction, { key: faction });
  world.add(id, Vitality, { maxHp: 30, hp: 30 });
  return id;
}

function makeEnemy(world, x, y, hp = 20) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Faction, { key: 'enemy' });
  world.add(id, Vitality, { maxHp: hp, hp });
  world.add(id, Brain, { visionRange: 6, intelligence: 5, learnedSpellIds: [] });
  world.add(id, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
  world.add(id, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: 5, lastKnownY: 5,
    searchTurnsLeft: 10, retreating: false,
  });
  return id;
}

function effectKeys(world, id) {
  const ae = world.get(id, ActiveEffects);
  const list = Array.isArray(ae?.effects) ? ae.effects : [];
  return list.map((e) => String(e?.key || ""));
}

// ─── War Cry ────────────────────────────────────────────────────────────────

Deno.test("war_cry weakens enemies within radius", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  const near = makeEnemy(world, 7, 5);   // distance 2, within radius 3
  const far = makeEnemy(world, 12, 5);   // distance 7, outside radius 3

  runSpellScript(world, caster, SPELL_DEFS.war_cry, {});

  assert(effectKeys(world, near).includes('weaken'), 'near enemy should be weakened');
  assert(!effectKeys(world, far).includes('weaken'), 'far enemy should not be weakened');
});

Deno.test("war_cry resets hunting enemies to alerted", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  const enemy = makeEnemy(world, 6, 5);

  assertEquals(world.get(enemy, AggroState).alertLevel, AGGRO_LEVELS.hunting);
  runSpellScript(world, caster, SPELL_DEFS.war_cry, {});
  assertEquals(world.get(enemy, AggroState).alertLevel, AGGRO_LEVELS.alerted);
});

Deno.test("war_cry emits event with affected count", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  makeEnemy(world, 6, 5);
  makeEnemy(world, 6, 6);

  const events = [];
  world.on('spell:war_cry', (ev) => events.push(ev));
  runSpellScript(world, caster, SPELL_DEFS.war_cry, {});

  assertEquals(events.length, 1);
  assertEquals(events[0].affected, 2);
  assertEquals(events[0].affectedIds.length, 2);
});

// ─── Cleave ─────────────────────────────────────────────────────────────────

Deno.test("cleave damages all adjacent hostiles", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  const adj1 = makeEnemy(world, 6, 5);
  const adj2 = makeEnemy(world, 5, 6);
  const far = makeEnemy(world, 8, 5);   // distance 3, not adjacent

  runSpellScript(world, caster, SPELL_DEFS.cleave, {});

  assert(world.get(adj1, Vitality).hp < 20, 'adjacent enemy 1 should be damaged');
  assert(world.get(adj2, Vitality).hp < 20, 'adjacent enemy 2 should be damaged');
  assertEquals(world.get(far, Vitality).hp, 20, 'non-adjacent enemy should be unharmed');
});

Deno.test("cleave emits event with hit list", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  makeEnemy(world, 6, 5);
  makeEnemy(world, 4, 5);

  const events = [];
  world.on('spell:cleave', (ev) => events.push(ev));
  runSpellScript(world, caster, SPELL_DEFS.cleave, {});

  assertEquals(events.length, 1);
  assertEquals(events[0].hits.length, 2);
});

// ─── Bloodthirst ────────────────────────────────────────────────────────────

Deno.test("bloodthirst applies self-buff for 30 turns", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);

  runSpellScript(world, caster, SPELL_DEFS.bloodthirst, {});

  const keys = effectKeys(world, caster);
  assert(keys.includes('bloodthirst'), 'caster should have bloodthirst buff');

  const ae = world.get(caster, ActiveEffects);
  const bt = ae.effects.find((e) => e?.key === 'bloodthirst');
  assertEquals(bt.turnsLeft, 31); // +1 for effectSystem tick
});

Deno.test("bloodthirst emits spell event", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);

  const events = [];
  world.on('spell:bloodthirst', (ev) => events.push(ev));
  runSpellScript(world, caster, SPELL_DEFS.bloodthirst, {});

  assertEquals(events.length, 1);
  assertEquals(events[0].duration, 30);
});

// ─── Purify ─────────────────────────────────────────────────────────────────

Deno.test("purify removes negative effects but keeps positive ones", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  world.add(caster, ActiveEffects, { effects: [
    { key: 'poison', turnsLeft: 5, potency: 2, stacks: 1 },
    { key: 'burn', turnsLeft: 3, potency: 1, stacks: 1 },
    { key: 'regen', turnsLeft: 10, potency: 1, stacks: 1 },
    { key: 'stun', turnsLeft: 2, potency: 1, stacks: 1 },
    { key: 'berserk', turnsLeft: 50, potency: 1, stacks: 1 },
  ]});

  runSpellScript(world, caster, SPELL_DEFS.purify, {});

  const keys = effectKeys(world, caster);
  assert(!keys.includes('poison'), 'poison should be removed');
  assert(!keys.includes('burn'), 'burn should be removed');
  assert(!keys.includes('stun'), 'stun should be removed');
  assert(keys.includes('regen'), 'regen should be kept');
  assert(keys.includes('berserk'), 'berserk should be kept');
});

Deno.test("purify emits removed count", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  world.add(caster, ActiveEffects, { effects: [
    { key: 'poison', turnsLeft: 5, potency: 2, stacks: 1 },
    { key: 'curse', turnsLeft: 3, potency: 1, stacks: 1 },
  ]});

  const events = [];
  world.on('spell:purify', (ev) => events.push(ev));
  runSpellScript(world, caster, SPELL_DEFS.purify, {});

  assertEquals(events.length, 1);
  assertEquals(events[0].removed, 2);
});

Deno.test("purify with no negative effects removes nothing", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  world.add(caster, ActiveEffects, { effects: [
    { key: 'regen', turnsLeft: 10, potency: 1, stacks: 1 },
  ]});

  const events = [];
  world.on('spell:purify', (ev) => events.push(ev));
  runSpellScript(world, caster, SPELL_DEFS.purify, {});

  assertEquals(events[0].removed, 0);
  assertEquals(effectKeys(world, caster).length, 1);
});

// ─── Divine Shield ──────────────────────────────────────────────────────────

Deno.test("divine_shield applies one authored breakable ward", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);

  runSpellScript(world, caster, SPELL_DEFS.divine_shield, {});

  const keys = effectKeys(world, caster);
  assert(keys.includes('divine_shield'), 'should apply divine_shield');
  assertEquals(keys.length, 1, 'divine_shield should not fan out into status rows');

  const ae = world.get(caster, ActiveEffects);
  const ward = ae.effects.find((e) => e?.key === 'divine_shield');
  assertEquals(ward.turnsLeft, 20);
  assertEquals(ward.potency, 3, 'divine_shield ward should retain its hardening potency');
  assertEquals(ward.meta.guardStacks, 2, 'divine_shield should start with two guard stacks');
});

Deno.test("divine_shield reads guard mechanics from the spell definition", () => {
  const world = makeWorld();
  const caster = makeCaster(world);
  runSpellScript(world, caster, {
    ...SPELL_DEFS.divine_shield,
    activeEffect: {
      duration: 9,
      potency: 6,
      stacks: 1,
      mechanics: { guardStacks: 4, maxGuardStacks: 4, blessed: false },
    },
  }, {});

  const ward = world.get(caster, ActiveEffects).effects.find((e) => e?.key === "divine_shield");
  assertEquals(ward.turnsLeft, 9);
  assertEquals(ward.potency, 6);
  assertEquals(ward.meta.guardStacks, 4);
  assertEquals(ward.meta.maxGuardStacks, 4);
  assertEquals(ward.meta.blessed, false);
});

Deno.test("divine_shield guard is breakable without creating shield status rows", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  const attacker = makeEnemy(world, 5, 4);
  world.add(caster, Facing, { dx: 0, dy: -1 });
  runSpellScript(world, caster, SPELL_DEFS.divine_shield, {});

  const before = world.get(caster, Vitality).hp;
  dealDamage(world, { target: caster, source: attacker, amount: 10, type: 'physical', cause: 'test' });
  const ward = world.get(caster, ActiveEffects).effects.find((e) => e?.key === 'divine_shield');
  assertEquals(world.get(caster, Vitality).hp, before - 8, 'front hit should be mitigated by the ward');
  assertEquals(ward.meta.guardStacks, 1);

  dealDamage(world, { target: caster, source: attacker, amount: 10, type: 'physical', cause: 'test' });
  assertEquals(ward.meta.guardStacks, 0);
  assertEquals(ward.meta.guardBrokenTurns, 4);
  assertEquals(effectKeys(world, caster).filter((key) => key === 'divine_shield').length, 1);
});

Deno.test("iron_flesh owns its defense, drag, and recoil identity", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  const attacker = makeEnemy(world, 5, 4);
  runSpellScript(world, caster, SPELL_DEFS.iron_flesh, {});

  assertEquals(effectKeys(world, caster), ['iron_flesh']);
  const attackerHp = world.get(attacker, Vitality).hp;
  dealDamage(world, { target: caster, source: attacker, amount: 3, type: 'physical', cause: 'test' });
  assertEquals(world.get(attacker, Vitality).hp, attackerHp - 2, 'iron flesh should recoil through the damage pipeline');
});

Deno.test("iron_flesh reads its active mechanics from the spell definition", () => {
  const world = makeWorld();
  const caster = makeCaster(world);
  runSpellScript(world, caster, {
    ...SPELL_DEFS.iron_flesh,
    activeEffect: {
      duration: 6,
      potency: 7,
      stacks: 1,
      capabilities: ["slowed"],
      mechanics: { recoilDamage: 5 },
    },
  }, {});

  const effect = world.get(caster, ActiveEffects).effects.find((e) => e?.key === "iron_flesh");
  assertEquals(effect.turnsLeft, 7);
  assertEquals(effect.potency, 7);
  assertEquals(effect.meta.recoilDamage, 5);
});

Deno.test("quicken owns its combat identity and stamina cadence", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  world.add(caster, Stamina, { stamina: 10, maxStamina: 20, regenCooldown: 0 });
  runSpellScript(world, caster, SPELL_DEFS.quicken, {});

  assertEquals(effectKeys(world, caster), ['quicken']);
  effectSystem(world, 1);
  assertEquals(world.get(caster, Stamina).stamina, 15, 'quicken should restore five stamina per tick');
});

Deno.test("ignite_weapons and mark_of_death own their spell identities", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  const enemy = makeEnemy(world, 6, 5);

  runSpellScript(world, caster, SPELL_DEFS.ignite_weapons, {});
  assertEquals(effectKeys(world, caster), ['ignite_weapons']);

  runSpellScript(world, caster, SPELL_DEFS.mark_of_death, { targetId: enemy });
  assertEquals(effectKeys(world, enemy), ['mark_of_death']);
});

Deno.test("rampage owns its battle-fury identity", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  runSpellScript(world, caster, SPELL_DEFS.rampage, {});

  assertEquals(effectKeys(world, caster), ['rampage']);
  const snapshot = resolveCombatSnapshot(world, caster);
  assertEquals(snapshot.status.berserk, 1);
});

// ─── Consecrate ─────────────────────────────────────────────────────────────

Deno.test("consecrate spawns a holy hazard and grants caster regen", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);

  runSpellScript(world, caster, SPELL_DEFS.consecrate, {});

  // Check hazard was spawned
  let hazardFound = false;
  let hazardDuration = 0;
  for (const [, h] of world.query(HazardArea)) {
    if (h.kind === 'holy') {
      hazardFound = true;
      hazardDuration = Number(h.turnsLeft) | 0;
      break;
    }
  }
  assert(hazardFound, 'consecrate should spawn a holy hazard');
  assertEquals(hazardDuration, 5, 'consecrate hazard should last five turns');

  // Check the spell-owned recovery identity on caster
  const keys = effectKeys(world, caster);
  assertEquals(keys, ['consecrate']);
  const ae = world.get(caster, ActiveEffects);
  const recovery = ae.effects.find((e) => e?.key === 'consecrate');
  assertEquals(recovery?.meta?.tickHeal, 2);
});

Deno.test("consecrate hazard has correct damage type", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);

  runSpellScript(world, caster, SPELL_DEFS.consecrate, {});

  for (const [, h] of world.query(HazardArea)) {
    if (h.kind === 'holy') {
      assertEquals(h.damageType, 'holy');
      assert(h.tickDamage > 0, 'tick damage should be positive');
      assertEquals(h.radius, 2);
      break;
    }
  }
});

Deno.test("consecrate reads its recovery mechanics from the spell definition", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  runSpellScript(world, caster, {
    ...SPELL_DEFS.consecrate,
    activeEffect: { duration: 7, potency: 4, stacks: 2, mechanics: { tickHeal: 4, hazardDuration: 3 } },
  }, {});

  const recovery = world.get(caster, ActiveEffects).effects.find((e) => e?.key === 'consecrate');
  assertEquals(recovery.turnsLeft, 7);
  assertEquals(recovery.potency, 4);
  assertEquals(recovery.stacks, 2);
  assertEquals(recovery.meta.tickHeal, 4);
  for (const [, hazard] of world.query(HazardArea)) {
    if (hazard.kind === 'holy') assertEquals(hazard.turnsLeft, 3);
  }
});

// ─── Smoke Bomb ─────────────────────────────────────────────────────────────

Deno.test("smoke_bomb blinds and resets aggro on nearby enemies", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  const near = makeEnemy(world, 7, 5);   // distance 2
  const far = makeEnemy(world, 12, 5);   // distance 7, outside radius 3

  runSpellScript(world, caster, SPELL_DEFS.smoke_bomb, {});

  // Near enemy should have lost vision
  const nearVision = getEffectiveVisionRange(world, near);
  assert(nearVision < 6, 'near enemy should have reduced vision from blind');

  // Near enemy should be unaware
  assertEquals(world.get(near, AggroState).alertLevel, AGGRO_LEVELS.unaware);

  // Far enemy should still be hunting
  assertEquals(world.get(far, AggroState).alertLevel, AGGRO_LEVELS.hunting);
});

Deno.test("smoke_bomb emits affected count", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  makeEnemy(world, 6, 5);

  const events = [];
  world.on('spell:smoke_bomb', (ev) => events.push(ev));
  runSpellScript(world, caster, SPELL_DEFS.smoke_bomb, {});

  assertEquals(events.length, 1);
  assertEquals(events[0].affected, 1);
});

// ─── Poison Blade ───────────────────────────────────────────────────────────

Deno.test("poison_blade coats equipped weapon with 8 poison charges", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);

  const weapon = world.create();
  world.add(weapon, ItemInfo, { id: 'dagger_quick', damageDice: '1d4' });
  world.add(weapon, NamedIdentity, { name: 'Quick Dagger', identity: 'dagger_quick' });
  world.add(caster, Equipment, { weapon, offhand: 0, armor: 0, feet: 0 });

  runSpellScript(world, caster, SPELL_DEFS.poison_blade, {});

  const info = world.get(weapon, ItemInfo);
  assert(info.coating, 'weapon should have a coating');
  assertEquals(info.coating.kind, 'poison');
  assertEquals(info.coating.charges, 8);
});

Deno.test("poison_blade stacks on existing coating charges", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);

  const weapon = world.create();
  world.add(weapon, ItemInfo, { id: 'dagger_quick', damageDice: '1d4', coating: { kind: 'poison', charges: 3 } });
  world.add(weapon, NamedIdentity, { name: 'Quick Dagger', identity: 'dagger_quick' });
  world.add(caster, Equipment, { weapon, offhand: 0, armor: 0, feet: 0 });

  runSpellScript(world, caster, SPELL_DEFS.poison_blade, {});

  assertEquals(world.get(weapon, ItemInfo).coating.charges, 11); // 3 + 8
});

Deno.test("poison_blade fizzles with no weapon equipped", () => {
  const world = makeWorld();
  const caster = makeCaster(world, 5, 5);
  world.add(caster, Equipment, { weapon: 0, offhand: 0, armor: 0, feet: 0 });

  const events = [];
  world.on('spell:poison_blade', (ev) => events.push(ev));
  runSpellScript(world, caster, SPELL_DEFS.poison_blade, {});

  assertEquals(events.length, 1);
  assert(events[0].fizzle, 'should fizzle with no weapon');
});

// ─── Class spell assignments ────────────────────────────────────────────────

import { CLASS_DEFS } from "../src/rules/data/classes.js";

Deno.test("warden starts with savage_strike and cleave", () => {
  const spells = CLASS_DEFS.warden.startingSpells;
  assert(spells.includes('savage_strike'));
  assert(spells.includes('cleave'));
  assertEquals(spells.length, 2);
});

Deno.test("cleric starts with holy_strike and smite", () => {
  const spells = CLASS_DEFS.cleric.startingSpells;
  assert(spells.includes('holy_strike'));
  assert(spells.includes('smite'));
  assertEquals(spells.length, 2);
});

Deno.test("outlaw starts with cheap_shot and poison_blade", () => {
  const spells = CLASS_DEFS.outlaw.startingSpells;
  assert(spells.includes('cheap_shot'));
  assert(spells.includes('poison_blade'));
  assertEquals(spells.length, 2);
});
