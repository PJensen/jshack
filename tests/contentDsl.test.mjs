import "./helpers/installContentCatalog.mjs";
// tests/contentDsl.test.mjs
// Tests for the content authoring DSL: helpers, registry, defineItem, defineMonster, ScriptCtx.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { parseDice, rollWith, interpolate, inferItemCategory, resolveRarity, SHELF_LIFE } from '../src/content/helpers.js';
import { registerItem, registerMonster, registerPalette, getContentItem, getContentMonster, allContentItems, allContentMonsters, allContentPalettes, clearContentRegistry } from '../src/content/registry.js';
import { defineItem, defineMonster } from '../src/content/define.js';
import { ScriptCtx, compileHook } from '../src/content/scriptCtx.js';

// ═══════════════════════════════════════════════════════════════════
//  helpers.js
// ═══════════════════════════════════════════════════════════════════

Deno.test("parseDice: standard dice notation", () => {
  const r = parseDice("2d6+4");
  assertEquals(r, { count: 2, sides: 6, mod: 4 });
});

Deno.test("parseDice: no modifier", () => {
  const r = parseDice("1d8");
  assertEquals(r, { count: 1, sides: 8, mod: 0 });
});

Deno.test("parseDice: negative modifier", () => {
  const r = parseDice("3d4-1");
  assertEquals(r, { count: 3, sides: 4, mod: -1 });
});

Deno.test("parseDice: plain number", () => {
  const r = parseDice(10);
  assertEquals(r, { count: 0, sides: 0, mod: 10 });
});

Deno.test("parseDice: string number", () => {
  const r = parseDice("5");
  assertEquals(r, { count: 0, sides: 0, mod: 5 });
});

Deno.test("parseDice: null/empty returns null", () => {
  assertEquals(parseDice(null), null);
  assertEquals(parseDice(""), null);
  assertEquals(parseDice("garbage"), null);
});

Deno.test("rollWith: deterministic with fixed RNG", () => {
  // rng always returns 0.5 → each die = 1 + floor(0.5 * sides)
  const rng = () => 0.5;
  // 2d6+4: each die = 1 + floor(0.5 * 6) = 4, total = 4+4+4 = 12
  assertEquals(rollWith(rng, "2d6+4"), 12);
});

Deno.test("rollWith: plain number", () => {
  assertEquals(rollWith(() => 0, 7), 7);
  assertEquals(rollWith(() => 0, "15"), 15);
});

Deno.test("interpolate: replaces known tokens", () => {
  const result = interpolate("{user} drinks the {item}.", { user: "You", item: "Healing Potion" });
  assertEquals(result, "You drinks the Healing Potion.");
});

Deno.test("interpolate: leaves unknown tokens intact", () => {
  const result = interpolate("{user} uses {mystery}.", { user: "You" });
  assertEquals(result, "You uses {mystery}.");
});

Deno.test("inferItemCategory: weapon", () => {
  const r = inferItemCategory("weapon");
  assertEquals(r.catalogKind, "equipment");
  assertEquals(r.slot, "weapon");
  assertEquals(r.itemType, "equip");
});

Deno.test("inferItemCategory: food", () => {
  const r = inferItemCategory("food");
  assertEquals(r.catalogKind, "food");
  assertEquals(r.slot, "bag");
  assertEquals(r.itemType, "food");
});

Deno.test("inferItemCategory: potion", () => {
  const r = inferItemCategory("potion");
  assertEquals(r.itemType, "potion");
});

Deno.test("resolveRarity: string input", () => {
  assertEquals(resolveRarity("rare"), { rarity: 3, rarityName: "rare" });
  assertEquals(resolveRarity("common"), { rarity: 1, rarityName: "common" });
});

Deno.test("resolveRarity: number input", () => {
  const r = resolveRarity(3);
  assertEquals(r.rarity, 3);
});

Deno.test("resolveRarity: undefined defaults to common", () => {
  assertEquals(resolveRarity(undefined), { rarity: 1, rarityName: "common" });
});

// ═══════════════════════════════════════════════════════════════════
//  registry.js
// ═══════════════════════════════════════════════════════════════════

Deno.test("registry: register and retrieve items", () => {
  clearContentRegistry();
  registerItem("test_sword", { id: "test_sword", name: "Test Sword" });
  const item = getContentItem("test_sword");
  assertEquals(item.name, "Test Sword");
  clearContentRegistry();
});

Deno.test("registry: duplicate item throws", () => {
  clearContentRegistry();
  registerItem("dup_item", { id: "dup_item" });
  assertThrows(() => registerItem("dup_item", { id: "dup_item" }), Error, "Duplicate");
  clearContentRegistry();
});

Deno.test("registry: register and retrieve monsters", () => {
  clearContentRegistry();
  registerMonster("test_goblin", { id: "test_goblin", name: "Test Goblin" });
  const mon = getContentMonster("test_goblin");
  assertEquals(mon.name, "Test Goblin");
  clearContentRegistry();
});

Deno.test("registry: palette entries", () => {
  clearContentRegistry();
  registerPalette("test_glyph", { glyph: "!", fg: "#ff0000" });
  const p = allContentPalettes();
  assertEquals(p.get("test_glyph").glyph, "!");
  clearContentRegistry();
});

// ═══════════════════════════════════════════════════════════════════
//  defineItem()
// ═══════════════════════════════════════════════════════════════════

Deno.test("defineItem: basic food item registers catalog + palette", () => {
  clearContentRegistry();
  defineItem("test_bread", {
    name: "Bread",
    type: "food",
    glyph: "%",
    color: "#d4a060",
    weight: 0.5,
    value: 5,
    nutrition: 40,
    shelfLife: "medium",
    description: "A crusty loaf.",
  });

  const entry = getContentItem("test_bread");
  assertEquals(entry.id, "test_bread");
  assertEquals(entry.catalogKind, "food");
  assertEquals(entry.type, "food");
  assertEquals(entry.slot, "bag");
  assertEquals(entry.name, "Bread");
  assertEquals(entry.weight, 0.5);
  assertEquals(entry.description, "A crusty loaf.");

  // Food components
  assert(entry._contentFood, "should have _contentFood");
  assertEquals(entry._contentFood.consumable.effectParams.nutrition, 40);
  assertEquals(entry._contentFood.decay.shelfLife, SHELF_LIFE.medium);

  // Palette
  const pal = allContentPalettes().get("test_bread");
  assertEquals(pal.glyph, "%");
  assertEquals(pal.fg, "#d4a060");

  clearContentRegistry();
});

Deno.test("defineItem: weapon with equipment fields", () => {
  clearContentRegistry();
  defineItem("test_axe", {
    name: "Battle Axe",
    type: "weapon",
    glyph: ")",
    color: "#cccccc",
    weight: 3.5,
    value: 80,
    rarity: "uncommon",
    material: "steel",
    bonuses: { attack: 3, accuracy: 1 },
    damageDice: "1d10",
    damageType: "slash",
    staminaCost: 14,
    twoHanded: true,
  });

  const entry = getContentItem("test_axe");
  assertEquals(entry.catalogKind, "equipment");
  assertEquals(entry.slot, "weapon");
  assertEquals(entry.damageDice, "1d10");
  assertEquals(entry.damageType, "slash");
  assertEquals(entry.twoHanded, true);
  assertEquals(entry.bonuses.attack, 3);
  assertEquals(entry.material, "steel");
  assertEquals(entry.rarity, 2);
  assertEquals(entry.rarityName, "uncommon");

  clearContentRegistry();
});

Deno.test("defineItem: with onUse hook compiles to catalog hook", () => {
  clearContentRegistry();
  let hookCalled = false;

  defineItem("test_scroll", {
    name: "Test Scroll",
    type: "scroll",
    onUse(ctx) {
      hookCalled = true;
      ctx.result("used", true);
    },
  });

  const entry = getContentItem("test_scroll");
  assert(entry.hooks, "should have hooks");
  assert(typeof entry.hooks.on_use === "function", "should have on_use function");

  // Simulate calling the compiled hook with a mock context
  const mockCtx = _makeMockInteractionCtx();
  const mockState = { actor: 1, itemId: 2, identity: "test_scroll" };
  const result = entry.hooks.on_use(mockCtx, mockState);

  assert(hookCalled, "DSL onUse hook should have been called");
  assertEquals(result.used, true);

  clearContentRegistry();
});

Deno.test("defineItem: onDrink hook compiles correctly", () => {
  clearContentRegistry();
  let healed = false;

  defineItem("test_potion", {
    name: "Test Potion",
    type: "potion",
    potion: { route: "oral", doses: 1, feel: "Warm." },
    onDrink(ctx) {
      ctx.heal(ctx.user, 10);
      healed = true;
    },
  });

  const entry = getContentItem("test_potion");
  assert(entry.hooks.on_drink, "should have on_drink hook");
  assert(entry.potion, "should have potion data");
  assertEquals(entry.potion.feel, "Warm.");

  const mockCtx = _makeMockInteractionCtx();
  entry.hooks.on_drink(mockCtx, { actor: 1, itemId: 2 });
  assert(healed, "onDrink should have called heal");

  clearContentRegistry();
});

Deno.test("defineItem: missing name throws", () => {
  clearContentRegistry();
  assertThrows(() => defineItem("bad", { type: "food" }), Error, "name is required");
  clearContentRegistry();
});

Deno.test("defineItem: missing type throws", () => {
  clearContentRegistry();
  assertThrows(() => defineItem("bad", { name: "Bad" }), Error, "type is required");
  clearContentRegistry();
});

// ═══════════════════════════════════════════════════════════════════
//  defineMonster()
// ═══════════════════════════════════════════════════════════════════

Deno.test("defineMonster: basic monster registration", () => {
  clearContentRegistry();
  defineMonster("test_slime", {
    name: "Green Slime",
    glyph: "j",
    color: "#33ff33",
    tags: ["beast", "ooze"],
    tier: 0,
    hp: 15,
    hpPerLevel: 1.5,
    attack: 2,
    defense: 0,
    damageDice: "1d4",
    speed: 1,
    sizeClass: "M",
    massKg: 30,
    intelligence: 1,
    description: "A quivering mass of acidic goo.",
  });

  const mon = getContentMonster("test_slime");
  assertEquals(mon.id, "test_slime");
  assertEquals(mon.name, "Green Slime");
  assertEquals(mon.baseHp, 15);
  assertEquals(mon.hpPerLevel, 1.5);
  assertEquals(mon.intelligence, 1);
  assert(mon.tags.includes("ooze"));

  const pal = allContentPalettes().get("test_slime");
  assertEquals(pal.glyph, "j");
  assertEquals(pal.fg, "#33ff33");

  clearContentRegistry();
});

Deno.test("defineMonster: immune/vulnerable shorthands", () => {
  clearContentRegistry();
  defineMonster("test_elemental", {
    name: "Fire Elemental",
    hp: 30,
    immune: ["fire", "poison"],
    vulnerable: ["cold"],
  });

  const mon = getContentMonster("test_elemental");
  assertEquals(mon.resistances.thermal.burnMult, 0, "fire immune → burnMult 0");
  assertEquals(mon.resistances.chemical.toxMult, 0, "poison immune → toxMult 0");
  // cold vulnerable: freezeMult should be 2.0
  assertEquals(mon.resistances.thermal.freezeMult, 2.0, "cold vulnerable → freezeMult 2");

  clearContentRegistry();
});

Deno.test("defineMonster: missing name throws", () => {
  clearContentRegistry();
  assertThrows(() => defineMonster("bad", {}), Error, "name is required");
  clearContentRegistry();
});

// ═══════════════════════════════════════════════════════════════════
//  ScriptCtx
// ═══════════════════════════════════════════════════════════════════

Deno.test("ScriptCtx: heal calls through to helpers", () => {
  let healedEntity = null, healedAmount = null;
  const mockCtx = _makeMockInteractionCtx({
    heal(e, a) { healedEntity = e; healedAmount = a; },
  });
  const ctx = new ScriptCtx(mockCtx, { actor: 42, itemId: 7 });
  ctx.heal(42, 25);
  assertEquals(healedEntity, 42);
  assertEquals(healedAmount, 25);
});

Deno.test("ScriptCtx: heal with dice expression", () => {
  let healedAmount = null;
  const mockCtx = _makeMockInteractionCtx({
    heal(_e, a) { healedAmount = a; },
    roll(expr) { return 12; }, // pretend roll returns 12
  });
  const ctx = new ScriptCtx(mockCtx, { actor: 1 });
  ctx.heal(1, "2d6+4");
  assertEquals(healedAmount, 12);
});

Deno.test("ScriptCtx: damage calls through", () => {
  let dmgArgs = null;
  const mockCtx = _makeMockInteractionCtx({
    damage(e, a, src) { dmgArgs = { e, a, src }; },
  });
  const ctx = new ScriptCtx(mockCtx, { actor: 1 });
  ctx.damage(5, 10, "fire");
  assertEquals(dmgArgs, { e: 5, a: 10, src: "fire" });
});

Deno.test("ScriptCtx: buff calls addEffect", () => {
  let effectAdded = null;
  const mockCtx = _makeMockInteractionCtx({
    addEffect(e, eff) { effectAdded = eff; },
  });
  const ctx = new ScriptCtx(mockCtx, { actor: 1, itemId: 2, identity: "test_item" });
  ctx.buff(1, "regen", 20, { potency: 3 });
  assertEquals(effectAdded.key, "regen");
  assertEquals(effectAdded.turnsLeft, 20);
  assertEquals(effectAdded.potency, 3);
  assertEquals(effectAdded.meta.source, "test_item");
});

Deno.test("ScriptCtx: cure calls clearEffects", () => {
  let clearedKeys = null;
  const mockCtx = _makeMockInteractionCtx({
    clearEffects(e, keys) { clearedKeys = keys; },
  });
  const ctx = new ScriptCtx(mockCtx, {});
  ctx.cure(1, "poison");
  assertEquals(clearedKeys, ["poison"]);
});

Deno.test("ScriptCtx: cure accepts array", () => {
  let clearedKeys = null;
  const mockCtx = _makeMockInteractionCtx({
    clearEffects(e, keys) { clearedKeys = keys; },
  });
  const ctx = new ScriptCtx(mockCtx, {});
  ctx.cure(1, ["poison", "burning"]);
  assertEquals(clearedKeys, ["poison", "burning"]);
});

Deno.test("ScriptCtx: message with interpolation", () => {
  let logged = null;
  const mockCtx = _makeMockInteractionCtx({
    message(text, type) { logged = { text, type }; },
  });
  mockCtx.query = { name: (id) => id === 1 ? "You" : id === 2 ? "Healing Potion" : null };
  const ctx = new ScriptCtx(mockCtx, { actor: 1, itemId: 2 });
  ctx.message("{user} quaffs the {item}!", "good");
  assertEquals(logged.text, "You quaffs the Healing Potion!");
  assertEquals(logged.type, "good");
});

Deno.test("ScriptCtx: consume sets flag", () => {
  const mockCtx = _makeMockInteractionCtx();
  const ctx = new ScriptCtx(mockCtx, {});
  assert(!ctx._consumed);
  ctx.consume();
  assert(ctx._consumed);
});

Deno.test("ScriptCtx: vfx.burst emits event", () => {
  let emitted = null;
  const mockCtx = _makeMockInteractionCtx({
    emit(event, payload) { emitted = { event, payload }; },
  });
  const ctx = new ScriptCtx(mockCtx, {});
  ctx.vfx.burst(5, { color: '#ff0000', count: 12 });
  assertEquals(emitted.event, "script:vfx:burst");
  assertEquals(emitted.payload.entity, 5);
  assertEquals(emitted.payload.color, "#ff0000");
  assertEquals(emitted.payload.count, 12);
});

Deno.test("ScriptCtx: vfx.floatText emits event", () => {
  let emitted = null;
  const mockCtx = _makeMockInteractionCtx({
    emit(event, payload) { emitted = { event, payload }; },
  });
  const ctx = new ScriptCtx(mockCtx, {});
  ctx.vfx.floatText(3, "CURED", { color: '#55dd55' });
  assertEquals(emitted.event, "script:vfx:floatText");
  assertEquals(emitted.payload.text, "CURED");
  assertEquals(emitted.payload.color, "#55dd55");
});

Deno.test("compileHook: wraps DSL function into catalog-compatible hook", () => {
  let wasRun = false;
  const compiled = compileHook((ctx) => {
    wasRun = true;
    ctx.consume();
    ctx.result("healed", 25);
  });

  const mockCtx = _makeMockInteractionCtx();
  const result = compiled(mockCtx, { actor: 1 });

  assert(wasRun, "compiled hook should execute the DSL function");
  assertEquals(result.consumed, true);
  assertEquals(result.healed, 25);
});

// ═══════════════════════════════════════════════════════════════════
//  End-to-end: defineItem with hook, then simulate use
// ═══════════════════════════════════════════════════════════════════

Deno.test("end-to-end: defineItem with onUse hook, simulate pipeline call", () => {
  clearContentRegistry();

  let healAmount = 0;
  let curedStatus = null;
  let floatTextEmitted = false;
  let messageLogged = null;

  defineItem("e2e_antidote", {
    name: "Antidote Salve",
    type: "food",
    glyph: "%",
    color: "#55dd55",
    weight: 0.3,
    value: 30,
    nutrition: 20,
    shelfLife: "ration",
    rarity: "rare",
    description: "Cures toxins.",

    onUse(ctx) {
      healAmount = ctx.heal(ctx.user, 15);
      ctx.cure(ctx.user, "poison");
      curedStatus = true;
      ctx.message("{user} feels the poison drain away.", "good");
      ctx.vfx.floatText(ctx.user, "CURED", { color: "#55dd55" });
      ctx.consume();
    },
  });

  const entry = getContentItem("e2e_antidote");
  assert(entry.hooks.on_use, "should have compiled on_use hook");
  assertEquals(entry.rarity, 3);
  assertEquals(entry.rarityName, "rare");
  assertEquals(entry._contentFood.consumable.effectParams.nutrition, 20);

  // Simulate calling the hook as the use pipeline would
  const events = [];
  const mockCtx = _makeMockInteractionCtx({
    heal(_e, a) { return a; },
    clearEffects(_e, _k) {},
    message(text, type) { messageLogged = { text, type }; },
    emit(event, payload) { events.push({ event, payload }); },
    roll() { return 15; },
  });
  mockCtx.query = { name: (id) => id === 1 ? "You" : id === 3 ? "Antidote Salve" : null };

  const result = entry.hooks.on_use(mockCtx, { actor: 1, itemId: 3, identity: "e2e_antidote" });

  assertEquals(healAmount, 15);
  assert(curedStatus, "should have cured poison");
  assertEquals(messageLogged.text, "You feels the poison drain away.");
  assertEquals(messageLogged.type, "good");
  assert(result.consumed, "should flag consumed");
  assert(events.some(e => e.event === "script:vfx:floatText"), "should emit VFX event");

  clearContentRegistry();
});

Deno.test("defineItem forwards ammo affinities and loot biases into the catalog", () => {
  clearContentRegistry();
  defineItem("e2e_ammo_affinity_gloves", {
    name: "Affinity Gloves",
    type: "gloves",
    ammoAffinities: { ammo_fire_arrows: { damageBonus: 1 } },
    lootBiases: { FireArrowsStack: 1.35 },
  });
  const entry = getContentItem("e2e_ammo_affinity_gloves");
  assertEquals(entry.ammoAffinities.ammo_fire_arrows.damageBonus, 1);
  assertEquals(entry.lootBiases.FireArrowsStack, 1.35);
});

// ═══════════════════════════════════════════════════════════════════
//  Test helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a mock interaction context matching the shape that ScriptCtx expects.
 * Override individual helpers by passing them in.
 */
function _makeMockInteractionCtx(overrides = {}) {
  const noop = () => {};
  const helpers = {
    heal: overrides.heal || noop,
    damage: overrides.damage || noop,
    addEffect: overrides.addEffect || noop,
    clearEffects: overrides.clearEffects || noop,
    hasStatus: overrides.hasStatus || (() => false),
    hasEffect: overrides.hasEffect || (() => false),
    roll: overrides.roll || (() => 0),
    chance: overrides.chance || (() => false),
    int: overrides.int || ((min, _max) => min),
    pick: overrides.pick || ((arr) => arr?.[0] ?? null),
    consume: overrides.consume || noop,
    spawnItem: overrides.spawnItem || (() => null),
    spawnMonster: overrides.spawnMonster || (() => null),
    hazardSpawn: overrides.hazardSpawn || noop,
    emit: overrides.emit || noop,
    message: overrides.message || noop,
  };
  return {
    actor: 1,
    primary: 2,
    target: 0,
    query: overrides.query || { name: () => null, get: () => null },
    helpers,
    io: { emit: overrides.emit || noop },
  };
}
