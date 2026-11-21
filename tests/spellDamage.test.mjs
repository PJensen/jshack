import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { BaseStats } from "../src/rules/components/BaseStats.js";
import { Brain } from "../src/rules/components/Brain.js";
import { DerivedExpression } from "../src/rules/components/DerivedExpression.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Status } from "../src/rules/components/Status.js";
import { effectSystem } from "../src/rules/systems/effectSystem.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { getSpell } from "../src/rules/data/spells.js";
import { buildSpellDamageSpec, createSpellDamageContext, getSpellHitChancePct, scaleSpellDamage } from "../src/rules/utils/spellDamage.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { attach } from "../src/lib/ecs-js/index.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { clearAll as clearTileMap, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";

function loadFlatFloor() {
  clearTileMap();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
}

function makeCaster(world, {
  x = 1,
  y = 1,
  intelligence = 10,
  critChanceDerived = 0,
  critMultDerived = 0,
  spellHitDerived = 0,
} = {}) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Brain, { learnedSpellIds: [], intelligence });
  world.add(id, Equipment, { critChanceDerived, critMultDerived, spellHitDerived });
  world.add(id, Faction, { key: "stone_taunter" });
  world.add(id, Vitality, { hp: 30, maxHp: 30 });
  return id;
}

function makeTarget(world, { x = 2, y = 1, hp = 40, faction = "enemy", spellAvoidDerived = 0 } = {}) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Equipment, { spellAvoidDerived });
  world.add(id, Faction, { key: faction });
  world.add(id, Vitality, { hp, maxHp: hp });
  return id;
}

Deno.test("scaleSpellDamage preserves baseline damage and rewards extra intelligence", () => {
  const world = new World({ seed: 0xC0FFEE });
  const baseline = makeCaster(world, { intelligence: 10 });
  const smart = makeCaster(world, { intelligence: 20 });

  assertEquals(scaleSpellDamage(world, baseline, 10), 10);
  assert(scaleSpellDamage(world, smart, 10) > 10, "extra INT should increase spell damage");
});

Deno.test("scaleSpellDamage consumes resolved intelligence from stat expressions", () => {
  const world = new World({ seed: 0xC0FFEE });
  const caster = makeCaster(world, { intelligence: 10 });
  const focus = world.create();
  const expr = world.create();

  world.add(caster, BaseStats, { intelligence: 10 });
  attach(world, focus, caster);
  attach(world, expr, focus);
  world.add(expr, DerivedExpression, {
    target: "intelligence",
    kind: "addConst",
    value: 10,
    stage: "base",
    priority: 10,
  });

  assert(scaleSpellDamage(world, caster, 10) > 10, "resolved INT from expressions should scale spell damage");
});

Deno.test("scaleSpellDamage consumes resolved spellPower from stat expressions", () => {
  const world = new World({ seed: 0xC0FFEE });
  const caster = makeCaster(world, { intelligence: 10 });
  const focus = world.create();
  const expr = world.create();

  world.add(caster, BaseStats, { intelligence: 10 });
  attach(world, focus, caster);
  attach(world, expr, focus);
  world.add(expr, DerivedExpression, {
    target: "spellPower",
    kind: "addConst",
    value: 10,
    stage: "derived",
    priority: 10,
  });

  assert(scaleSpellDamage(world, caster, 10) > 10, "resolved spellPower from expressions should scale spell damage");
});

Deno.test("martial spell damage uses Strength and the equipped mainhand", () => {
  const world = new World({ seed: 0xC0FFEE });
  const caster = makeCaster(world, { intelligence: 10 });
  const target = makeTarget(world);
  world.add(caster, BaseStats, { strength: 20 });

  const withoutWeapon = buildSpellDamageSpec(world, caster, target, {
    spell: getSpell("cleave"),
    baseAmount: 5,
  });

  const weapon = world.create();
  world.add(weapon, ItemInfo, {
    type: "equip",
    slot: "weapon",
    damageDice: "1d6",
    damageBonus: 2,
  });
  world.mutate(caster, Equipment, (equipment) => { equipment.weapon = weapon; });

  const withWeapon = buildSpellDamageSpec(world, caster, target, {
    spell: getSpell("cleave"),
    baseAmount: 5,
  });

  assert(withWeapon.amount > withoutWeapon.amount, "mainhand damage should feed martial spell damage");
  assert(withoutWeapon.amount >= 7, "Strength above baseline should scale martial base damage");
});

Deno.test("martial crit uses Dexterity and spell crit uses Intelligence once", () => {
  const world = new World({ seed: 0xC0FFEE });
  const caster = makeCaster(world, { intelligence: 30 });
  world.add(caster, BaseStats, { strength: 20, dexterity: 16, intelligence: 30 });

  assertEquals(createSpellDamageContext(world, caster, getSpell("cleave")).critChancePct, 8);
  assertEquals(createSpellDamageContext(world, caster, getSpell("smite")).critChancePct, 15);
});

Deno.test("Holy Strike uses martial damage scaling and still deals holy damage", () => {
  loadFlatFloor();
  const world = new World({ seed: 0xC0FFEE });
  const caster = makeCaster(world, { intelligence: 30 });
  world.add(caster, BaseStats, { strength: 20 });
  const target = makeTarget(world);
  const events = [];
  world.on("damaged", (event) => events.push(event));

  runSpellScript(world, caster, getSpell("holy_strike"), {});

  assertEquals(events.length, 1);
  assertEquals(events[0].target, target);
  assertEquals(events[0].type, "holy");
  assertEquals(events[0].rawAmount, events[0].critical ? 10 : 5);
});

Deno.test("hostile spell damage can miss when spellAvoid beats spellHit", () => {
  const world = new World({ seed: 0xC0FFEE });
  const caster = makeCaster(world, { intelligence: 10, spellHitDerived: 0 });
  const target = makeTarget(world, { x: 4, y: 1, hp: 40, spellAvoidDerived: 200 });
  const missEvents = [];
  const damageEvents = [];
  world.on("spell:miss", (event) => missEvents.push(event));
  world.on("damaged", (event) => damageEvents.push(event));

  runSpellScript(world, caster, getSpell("shadow_bolt"), {});

  assertEquals(world.get(target, Vitality).hp, 40);
  assertEquals(damageEvents.length, 0);
  assertEquals(missEvents.length, 1);
  assertEquals(missEvents[0].spellId, "shadow_bolt");
  assertEquals(missEvents[0].targetId, target);
});

Deno.test("confused and mindwiped statuses reduce hostile spell hit chance", () => {
  const world = new World({ seed: 0x5157 });
  const caster = makeCaster(world, { intelligence: 18, spellHitDerived: 6 });
  const target = makeTarget(world, { x: 4, y: 1, hp: 40, spellAvoidDerived: 20 });

  const baseline = getSpellHitChancePct(world, caster, target);
  world.add(caster, Status, {
    statuses: [
      { type: "confused", duration: 3, potency: 1, stacks: 1 },
      { type: "mindwiped", duration: 3, potency: 1, stacks: 1 },
    ],
  });
  const impaired = getSpellHitChancePct(world, caster, target);

  assert(baseline > impaired, `expected impaired spell hit chance below baseline (${baseline} > ${impaired})`);
  assert((baseline - impaired) >= 6, `expected combined mental debuffs to cut spell hit materially, got ${baseline - impaired}`);
});

Deno.test("confused caster can be forced into a spell miss by the hit penalty", () => {
  const world = new World({ seed: 0x5158 });
  const caster = makeCaster(world, { intelligence: 18, spellHitDerived: 6 });
  const target = makeTarget(world, { x: 4, y: 1, hp: 40, spellAvoidDerived: 106 });
  const missEvents = [];
  world.on("spell:miss", (event) => missEvents.push(event));

  world.add(caster, Status, {
    statuses: [{ type: "confused", duration: 3, potency: 1, stacks: 1 }],
  });

  runSpellScript(world, caster, getSpell("shadow_bolt"), {});

  assertEquals(world.get(target, Vitality).hp, 40);
  assertEquals(missEvents.length, 1);
  assertEquals(missEvents[0].spellId, "shadow_bolt");
});

Deno.test("agony applies when spellHit beats spellAvoid and misses otherwise", () => {
  loadFlatFloor();
  const spell = getSpell("agony");

  const hitWorld = new World({ seed: 0xAAA1 });
  const hitCaster = makeCaster(hitWorld, { x: 1, y: 1, intelligence: 18, spellHitDerived: 20 });
  const hitTarget = makeTarget(hitWorld, { x: 2, y: 1, hp: 40, spellAvoidDerived: 0 });
  runSpellScript(hitWorld, hitCaster, spell, { targetId: hitTarget, x: 2, y: 1 });
  assert(hitWorld.get(hitTarget, ActiveEffects)?.effects?.some((effect) => effect.key === "agony"), "Agony should land when spell hit wins");

  const missWorld = new World({ seed: 0xAAA2 });
  const missCaster = makeCaster(missWorld, { x: 1, y: 1, intelligence: 10, spellHitDerived: 0 });
  const missTarget = makeTarget(missWorld, { x: 2, y: 1, hp: 40, spellAvoidDerived: 200 });
  const missEvents = [];
  missWorld.on("spell:miss", (event) => missEvents.push(event));
  runSpellScript(missWorld, missCaster, spell, { targetId: missTarget, x: 2, y: 1 });
  assert(!missWorld.get(missTarget, ActiveEffects)?.effects?.some((effect) => effect.key === "agony"), "Agony should not apply on miss");
  assertEquals(missEvents.length, 1);
  assertEquals(missEvents[0].spellId, "agony");
});

Deno.test("destruction spell damage can crit using crit-derived stats", () => {
  const world = new World({ seed: 0xFACE });
  const caster = makeCaster(world, { intelligence: 10, critChanceDerived: 1.0 });
  const target = makeTarget(world, { x: 4, y: 1, hp: 40 });
  const events = [];
  world.on("damaged", (event) => events.push(event));

  runSpellScript(world, caster, getSpell("shadow_bolt"), {});

  assertEquals(events.length, 1);
  assertEquals(events[0].cause, "spell:shadow_bolt");
  assertEquals(events[0].critical, true);
  assert(events[0].amount >= 16, `crit should at least double the 8-damage baseline, got ${events[0].amount}`);
  assertEquals(world.get(target, Vitality).hp, 40 - events[0].amount);
});

Deno.test("agony DOT inherits spell crit rules on tick", () => {
  loadFlatFloor();
  const world = new World({ seed: 0xBEEF });
  const caster = makeCaster(world, { intelligence: 18, critChanceDerived: 1.0 });
  const target = makeTarget(world, { x: 2, y: 1, hp: 40 });
  const events = [];
  world.on("damaged", (event) => events.push(event));

  world.add(target, ActiveEffects, {
    effects: [{
      key: "agony",
      turnsLeft: 3,
      potency: 1,
      stacks: 1,
      startedAtTurn: world.step,
      sourceId: caster,
      spellId: "agony",
      meta: {
        spellDamage: createSpellDamageContext(world, caster, { id: "agony" }, {
          cause: "spell:agony",
          type: "shadow",
        }),
      },
    }],
  });

  effectSystem(world);

  assert(events.length >= 1, "Agony tick should emit damage");
  assertEquals(events[0].cause, "spell:agony");
  assertEquals(events[0].visibility, "source-known");
  assertEquals(events[0].critical, true);
  assert(events[0].amount >= 2, `crit Agony tick should exceed baseline damage, got ${events[0].amount}`);
});

Deno.test("meteor burn DOT keeps spell metadata so ticks can crit", () => {
  loadFlatFloor();
  const world = new World({ seed: 0xCAFE });
  const caster = makeCaster(world, { x: 1, y: 1, intelligence: 20, critChanceDerived: 1.0 });
  const target = makeTarget(world, { x: 4, y: 1, hp: 50 });
  const events = [];
  world.on("damaged", (event) => events.push(event));

  runSpellScript(world, caster, getSpell("meteor"), { x: 4, y: 1 });

  const burn = world.get(target, ActiveEffects)?.effects?.find((effect) => effect.key === "burn");
  assert(burn, "meteor should apply burn");
  assert(burn.meta?.spellDamage, "spell burn should snapshot spell damage metadata");

  events.length = 0;
  effectSystem(world);

  assert(events.length >= 1, "burn tick should deal damage");
  assertEquals(events[0].cause, "spell:meteor:burn");
  assertEquals(events[0].critical, true);
});

Deno.test("agony tick damage is snapshotted at cast time", () => {
  loadFlatFloor();
  const spell = getSpell("agony");

  const worldA = new World({ seed: 0xDEAD });
  const casterA = makeCaster(worldA, { x: 1, y: 1, intelligence: 18 });
  const targetA = makeTarget(worldA, { x: 2, y: 1, hp: 40 });
  runSpellScript(worldA, casterA, spell, { targetId: targetA, x: 2, y: 1 });

  const worldB = new World({ seed: 0xDEAD });
  loadFlatFloor();
  const casterB = makeCaster(worldB, { x: 1, y: 1, intelligence: 18 });
  const targetB = makeTarget(worldB, { x: 2, y: 1, hp: 40 });
  runSpellScript(worldB, casterB, spell, { targetId: targetB, x: 2, y: 1 });

  worldB.get(casterB, Brain).intelligence = 50;
  worldB.get(casterB, Equipment).critChanceDerived = 1.0;
  worldB.get(casterB, Equipment).critMultDerived = 3.0;

  effectSystem(worldA);
  effectSystem(worldB);

  const dmgA = 40 - worldA.get(targetA, Vitality).hp;
  const dmgB = 40 - worldB.get(targetB, Vitality).hp;
  assertEquals(dmgB, dmgA, "post-cast stat changes should not alter existing Agony ticks");
});
