import { assert, assertEquals } from "jsr:@std/assert";
import { World, children } from "../src/lib/ecs-js/index.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { createCorpse } from "../src/rules/archetypes/Food.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { CorpseAdaptation } from "../src/rules/components/CorpseAdaptation.js";
import { DerivedExpression } from "../src/rules/components/DerivedExpression.js";
import { Traits } from "../src/rules/components/Traits.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { useItemSystem } from "../src/rules/systems/useItemSystem.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";
import { FOOD_EATING_TURNS } from "../src/rules/content/useActions/foodEatingAction.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { resolveCanonicalStats } from "../src/rules/utils/canonicalStats.js";
import { explainDerivedStats } from "../src/rules/utils/derivedStats.js";

function makeCorpse(world, id, name, sizeClass = "M", massKg = 40, tier = 0) {
  return createCorpse(world, { id, name, sizeClass, massKg, tier }, { x: 0, y: 0 });
}

function eatCorpse(world, player, corpse) {
  addToInventory(world, player, corpse);
  world.add(player, UseIntent, { itemId: corpse, targetId: player });
  useItemSystem(world);
  for (let turn = 0; turn < FOOD_EATING_TURNS; turn++) channelingSystem(world);
}

function countAdaptations(world, player, statKey) {
  let count = 0;
  for (const childId of children(world, player)) {
    const ca = world.get(childId, CorpseAdaptation);
    if (ca && ca.statKey === statKey) count++;
  }
  return count;
}

function sumAdaptations(world, player, statKey) {
  let total = 0;
  for (const childId of children(world, player)) {
    const ca = world.get(childId, CorpseAdaptation);
    if (!ca || ca.statKey !== statKey) continue;
    const expr = world.get(childId, DerivedExpression);
    if (expr) total += Number(expr.value || 0);
  }
  return total;
}

// ── Diminishing poison resistance (cave_snake) ───────────────────

Deno.test("cave_snake corpse creates poisonResist adaptation via stat tree", () => {
  const world = new World({ seed: 0xBEEF01 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const statsBefore = resolveCanonicalStats(world, player);
  assertEquals(statsBefore.poisonResist, 0, "should start with 0 poisonResist");

  const corpse = makeCorpse(world, "cave_snake", "Cave Snake", "XS", 2);
  eatCorpse(world, player, corpse);

  // Should have created a CorpseAdaptation child entity
  assertEquals(countAdaptations(world, player, "poisonResist"), 1, "should have 1 adaptation");

  const statsAfter = resolveCanonicalStats(world, player);
  assert(statsAfter.poisonResist > 0, "poisonResist should be positive after first eat");
  // formula: maxBonus=0.6, remaining=0.6, delta = 0.6 * (1-0.85) = 0.6*0.15 = 0.09
  assertEquals(statsAfter.poisonResist, 0.09, "first eat: delta = maxBonus * (1-decay)");
});

Deno.test("repeated cave_snake eats create multiple adaptations with diminishing deltas", () => {
  const world = new World({ seed: 0xBEEF02 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const bonuses = [0];
  for (let i = 0; i < 5; i++) {
    const corpse = makeCorpse(world, "cave_snake", "Cave Snake", "XS", 2);
    eatCorpse(world, player, corpse);
    bonuses.push(sumAdaptations(world, player, "poisonResist"));
  }

  // Each total should be higher than previous
  for (let i = 1; i < bonuses.length; i++) {
    assert(bonuses[i] > bonuses[i - 1], `eat ${i} should increase poisonResist`);
  }
  // Gains should diminish
  const gain1 = bonuses[1] - bonuses[0];
  const gain5 = bonuses[5] - bonuses[4];
  assert(gain5 < gain1, "later eats should give smaller gains (diminishing returns)");
  // Total should stay below maxBonus of 0.6
  assert(bonuses[5] < 0.6, "should not exceed max bonus");
  // Should have 5 separate child entities
  assertEquals(countAdaptations(world, player, "poisonResist"), 5, "should have 5 adaptations");
});

Deno.test("cave_snake emits resist-building event with percentage", () => {
  const world = new World({ seed: 0xBEEF03 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const events = [];
  world.on("corpse:resist-building", (ev) => events.push(ev));

  const corpse = makeCorpse(world, "cave_snake", "Cave Snake", "XS", 2);
  eatCorpse(world, player, corpse);

  assertEquals(events.length, 1, "should emit resist-building event");
  assertEquals(events[0].type, "poison");
  assert(events[0].pct > 0, "should report positive resistance percentage");
});

// ── Snake: poison + diminishing resist ────────────────────────────

Deno.test("snake corpse poisons and builds poisonResist adaptation", () => {
  const world = new World({ seed: 0xBEEF04 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const corpse = makeCorpse(world, "snake", "Snake", "XS", 3);
  eatCorpse(world, player, corpse);

  const ae = world.get(player, ActiveEffects);
  assert(ae.effects.some(e => e.key === "poison"), "should apply poison");

  const stats = resolveCanonicalStats(world, player);
  assert(stats.poisonResist > 0, "should have positive poisonResist");
});

// ── Cave bear: bear_vigor buff + diminishing kinetic DR ───────────

Deno.test("cave_bear corpse applies bear_vigor and creates kineticDR adaptation", () => {
  const world = new World({ seed: 0xBEEF05 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const statsBefore = resolveCanonicalStats(world, player);

  const corpse = makeCorpse(world, "cave_bear", "Cave Bear", "L", 350);
  eatCorpse(world, player, corpse);

  // Bear vigor buff
  const ae = world.get(player, ActiveEffects);
  const vigor = ae.effects.find(e => e.key === "bear_vigor");
  assert(vigor, "should have bear_vigor effect");
  assertEquals(vigor.turnsLeft, 150, "bear_vigor should last 150 turns");

  // Kinetic DR adaptation created
  assertEquals(countAdaptations(world, player, "kineticDR"), 1, "should have 1 kineticDR adaptation");
  const statsAfter = resolveCanonicalStats(world, player);
  assert(statsAfter.kineticDR > statsBefore.kineticDR, "kineticDR should increase via stat tree");
});

Deno.test("repeated cave_bear eats show diminishing kineticDR gains", () => {
  const world = new World({ seed: 0xBEEF06 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const bonuses = [0];
  for (let i = 0; i < 4; i++) {
    const corpse = makeCorpse(world, "cave_bear", "Cave Bear", "L", 350);
    eatCorpse(world, player, corpse);
    bonuses.push(sumAdaptations(world, player, "kineticDR"));
  }

  // Each should be higher than previous
  for (let i = 1; i < bonuses.length; i++) {
    assert(bonuses[i] > bonuses[i - 1], `eat ${i} should increase kineticDR bonus`);
  }
  // Gains diminish
  const gain1 = bonuses[1] - bonuses[0];
  const gain4 = bonuses[4] - bonuses[3];
  assert(gain4 < gain1, "later eats should give smaller kineticDR gains");
  // Should have 4 separate child entities
  assertEquals(countAdaptations(world, player, "kineticDR"), 4, "should have 4 adaptations");
});

// ── Floating eye: mindwipe + third_eye trait ──────────────────────

Deno.test("floating_eye corpse applies mindwipe and grants third_eye", () => {
  const world = new World({ seed: 0xBEEF07 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const traitEvents = [];
  world.on("corpse:trait-gained", (ev) => traitEvents.push(ev));

  const corpse = makeCorpse(world, "floating_eye", "Floating Eye", "M", 40);
  eatCorpse(world, player, corpse);

  const ae = world.get(player, ActiveEffects);
  assert(ae.effects.some(e => e.key === "mindwipe"), "should apply mindwipe");

  const traits = world.get(player, Traits);
  assertEquals(traits.third_eye, true, "should grant third_eye");
  assert(traitEvents.some(e => e.trait === "third_eye"), "should emit third_eye trait event");
});

// ── Dragon: dragonheart + big fire resist via stat tree ─────────

Deno.test("dragon corpse grants dragonheart with fireResist adaptation", () => {
  const world = new World({ seed: 0xBEEF08 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const traitEvents = [];
  world.on("corpse:trait-gained", (ev) => traitEvents.push(ev));

  const statsBefore = resolveCanonicalStats(world, player);
  assertEquals(statsBefore.fireResist, 0, "should start with 0 fireResist");

  const startHp = world.get(player, Vitality).hp;
  const corpse = makeCorpse(world, "dragon", "Dragon", "XL", 800, 3);
  eatCorpse(world, player, corpse);

  // Trait
  const traits = world.get(player, Traits);
  assertEquals(traits.dragonheart, true, "should grant dragonheart");
  assert(traitEvents.some(e => e.trait === "dragonheart"), "should emit dragonheart event");

  // Fire resist via stat tree: big nudge
  const statsAfter = resolveCanonicalStats(world, player);
  assert(statsAfter.fireResist > 0.5, "should have substantial fireResist");
  assert(statsAfter.fireResist < 0.9, "should not reach max bonus (floor 0.1 → max 0.9)");
  // formula: maxBonus=0.9, remaining=0.9, delta = 0.9 * (1-0.3) = 0.9*0.7 = 0.63
  assertEquals(statsAfter.fireResist, 0.63, "dragon: delta = maxBonus * (1-decay)");

  // Fire damage
  const endHp = world.get(player, Vitality).hp;
  assert(endHp < startHp, "dragon corpse should deal fire damage");

  const ae = world.get(player, ActiveEffects);
  assert(ae.effects.some(e => e.key === "burn"), "should apply burn effect");
});

// ── Orc: blood rage buff ──────────────────────────────────────────

Deno.test("orc corpse applies blood_rage timed buff", () => {
  const world = new World({ seed: 0xBEEF09 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const corpse = makeCorpse(world, "orc", "Orc", "M", 95, 1);
  eatCorpse(world, player, corpse);

  const ae = world.get(player, ActiveEffects);
  const rage = ae.effects.find(e => e.key === "blood_rage");
  assert(rage, "should have blood_rage effect");
  assertEquals(rage.turnsLeft, 100, "blood_rage should last 100 turns");
});

// ── Hobgoblin: war_fed buff ───────────────────────────────────────

Deno.test("hobgoblin corpse applies war_fed timed buff", () => {
  const world = new World({ seed: 0xBEEF0A });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const corpse = makeCorpse(world, "hobgoblin", "Hobgoblin", "M", 100, 1);
  eatCorpse(world, player, corpse);

  const ae = world.get(player, ActiveEffects);
  const fed = ae.effects.find(e => e.key === "war_fed");
  assert(fed, "should have war_fed effect");
  assertEquals(fed.turnsLeft, 120, "war_fed should last 120 turns");
  assertEquals(fed.potency, 2, "war_fed potency should be 2");
});

// ── Troll: regeneration + ravenous ────────────────────────────────

Deno.test("troll corpse applies both regeneration and ravenous", () => {
  const world = new World({ seed: 0xBEEF0B });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const corpse = makeCorpse(world, "troll", "Troll", "L", 200, 2);
  eatCorpse(world, player, corpse);

  const ae = world.get(player, ActiveEffects);
  assert(ae.effects.find(e => e.key === "regeneration"), "should have regeneration");
  assert(ae.effects.find(e => e.key === "ravenous"), "should have ravenous debuff");
});

// ── Wight: heal + weakened + deathless progression ────────────────

Deno.test("wight corpse heals and applies weakened debuff", () => {
  const world = new World({ seed: 0xBEEF0C });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const vit = world.get(player, Vitality);
  vit.hp = vit.maxHp - 10;
  const beforeHp = vit.hp;

  const corpse = makeCorpse(world, "wight", "Wight", "M", 60, 1);
  eatCorpse(world, player, corpse);

  assert(vit.hp > beforeHp, "wight corpse should heal the player");

  const ae = world.get(player, ActiveEffects);
  assert(ae.effects.some(e => e.key === "weakened"), "should apply weakened debuff");
});

Deno.test("eating 3 wight corpses grants deathless trait", () => {
  const world = new World({ seed: 0xBEEF0D });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const traitEvents = [];
  world.on("corpse:trait-gained", (ev) => traitEvents.push(ev));

  for (let i = 0; i < 3; i++) {
    const corpse = makeCorpse(world, "wight", "Wight", "M", 60, 1);
    eatCorpse(world, player, corpse);
  }

  const traits = world.get(player, Traits);
  assertEquals(traits.wightCorpsesEaten, 3, "should count 3 wights");
  assertEquals(traits.deathless, true, "should grant deathless");
  assert(traitEvents.some(e => e.trait === "deathless"), "should emit deathless event");
});

// ── Goblin archer: keen_eye buff ──────────────────────────────────

Deno.test("goblin_archer corpse applies keen_eye buff", () => {
  const world = new World({ seed: 0xBEEF0E });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const corpse = makeCorpse(world, "goblin_archer", "Goblin Archer", "S", 30);
  eatCorpse(world, player, corpse);

  const ae = world.get(player, ActiveEffects);
  const keen = ae.effects.find(e => e.key === "keen_eye");
  assert(keen, "should have keen_eye effect");
  assertEquals(keen.turnsLeft, 80, "keen_eye should last 80 turns");
});

// ── Mimic: random effect ──────────────────────────────────────────

Deno.test("mimic corpse applies some effect (gamble)", () => {
  const world = new World({ seed: 0xBEEF0F });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const corpse = makeCorpse(world, "mimic", "Mimic", "M", 140, 99);
  eatCorpse(world, player, corpse);

  const ae = world.get(player, ActiveEffects);
  assert(ae && Array.isArray(ae.effects), "should have active effects");
});

// ── Stone Taunter: gamble stone_skin or stun ──────────────────────

Deno.test("stone_taunter corpse applies stone_skin or stun", () => {
  const world = new World({ seed: 0xBEEF10 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const corpse = makeCorpse(world, "stone_taunter", "Taunting Statue", "M", 240, 99);
  eatCorpse(world, player, corpse);

  const ae = world.get(player, ActiveEffects);
  const hasStoneSkin = ae.effects.some(e => e.key === "stone_skin");
  const hasStun = ae.effects.some(e => e.key === "stun");
  assert(hasStoneSkin || hasStun, "should apply either stone_skin or stun");
});

// ── EatCallbackContext: addCorpseAdaptation standalone ─────────────

Deno.test("EatCallbackContext.addCorpseAdaptation creates child entity", async () => {
  const { EatCallbackContext } = await import("../src/rules/data/callbacks/eat.js");

  const world = new World({ seed: 0xBEEF11 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });
  const dummyItemId = world.create();

  const ctx = new EatCallbackContext(world, player, dummyItemId);
  ctx.addCorpseAdaptation("poisonResist", 0.15, "test_snake", "poison");
  ctx.commit();

  // Should create a child entity with CorpseAdaptation + DerivedExpression
  assertEquals(countAdaptations(world, player, "poisonResist"), 1, "should have 1 adaptation");
  const bonus = sumAdaptations(world, player, "poisonResist");
  assertEquals(bonus, 0.15, "adaptation value should be 0.15");

  // Should show up in canonical stats
  const stats = resolveCanonicalStats(world, player);
  assertEquals(stats.poisonResist, 0.15, "canonical stats should include adaptation");
});

// ── EatCallbackContext: heal standalone ────────────────────────────

Deno.test("EatCallbackContext.heal restores HP", async () => {
  const { EatCallbackContext } = await import("../src/rules/data/callbacks/eat.js");

  const world = new World({ seed: 0xBEEF12 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });
  const dummyItemId = world.create();

  const vit = world.get(player, Vitality);
  vit.hp = vit.maxHp - 10;
  const before = vit.hp;

  const ctx = new EatCallbackContext(world, player, dummyItemId);
  ctx.heal(5);
  ctx.commit();

  assertEquals(vit.hp, before + 5, "should heal 5 HP");
});

// ── Stat tree attribution: explainDerivedStats shows corpse adaptations ──

Deno.test("explainDerivedStats traces corpse adaptation entries", () => {
  const world = new World({ seed: 0xBEEF13 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  // Eat two cave snakes
  for (let i = 0; i < 2; i++) {
    const corpse = makeCorpse(world, "cave_snake", "Cave Snake", "XS", 2);
    eatCorpse(world, player, corpse);
  }

  const { trace } = explainDerivedStats(world, player);
  const poisonEntries = trace.filter(t => t.target === "poisonResist");
  assertEquals(poisonEntries.length, 2, "trace should show 2 poisonResist entries");

  // Each entry should be an addConst with positive value
  for (const entry of poisonEntries) {
    assertEquals(entry.kind, "addConst", "should be addConst");
    assert(entry.value > 0, "should have positive value");
  }

  // Second delta should be smaller than first (diminishing)
  assert(poisonEntries[1].value < poisonEntries[0].value,
    "second adaptation delta should be smaller (diminishing returns)");
});
