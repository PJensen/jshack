import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Stamina } from "../src/rules/components/Stamina.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { CreatureType, CREATURE_TYPES } from "../src/rules/components/CreatureType.js";
import { ThrowIntent } from "../src/rules/components/Intents/ThrowIntent.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { executeInteraction } from "../src/rules/interaction/runtime/actionRuntime.js";
import { applyPipeline } from "../src/rules/interaction/verbs/applyPipeline.js";
import { buildEffectRows } from "../src/main/ui/effectRows.js";
import { applyWeaponCoatingOnHit } from "../src/rules/data/weaponCoatings.js";
import { throwSystem } from "../src/rules/systems/throwSystem.js";
import { hazardSystem } from "../src/rules/systems/hazardSystem.js";
import { addToInventory, inventoryContains } from "../src/rules/utils/inventoryFacade.js";

function makeActor(world, { x = 0, y = 0, hp = 20, stamina = null } = {}) {
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(actor, Position, { x, y });
  world.add(actor, Vitality, { hp, maxHp: Math.max(hp, 20) });
  if (stamina) world.add(actor, Stamina, stamina);
  return actor;
}

function dip(world, actor, potionIdentity, targetId) {
  const potion = createItemById(world, potionIdentity);
  assert(potion != null, `${potionIdentity} should be creatable`);
  addToInventory(world, actor, potion);
  addToInventory(world, actor, targetId);
  const result = executeInteraction(world, {
    verb: "apply",
    actor,
    primary: potion,
    target: targetId,
    params: {},
    pipeline: applyPipeline,
  });
  assertEquals(result.ok, true);
  assertEquals(result.metrics.consumedTool, true);
  assert(!world.isAlive(potion), `${potionIdentity} should be consumed`);
  assert(!inventoryContains(world, actor, potion), `${potionIdentity} should leave inventory`);
  return result;
}

function coating(world, itemId) {
  return world.get(itemId, ItemInfo)?.coating;
}

Deno.test("selected potion dips add vigor, adrenaline, and lethargy coatings", () => {
  for (const [seed, potionIdentity, kind, charges] of [
    [9101, "potion_vigor", "lifedraw", 8],
    [9102, "potion_adrenaline", "adrenaline", 8],
    [9103, "potion_lethargy", "lethargy", 6],
  ]) {
    const world = new World({ seed });
    const actor = makeActor(world);
    const blade = buildCatalogItem(world, "dagger_quick");
    dip(world, actor, potionIdentity, blade);
    assertEquals(coating(world, blade)?.kind, kind);
    assertEquals(coating(world, blade)?.charges, charges);
  }
});

Deno.test("keen edge dip permanently stacks crit chance on weapon", () => {
  const world = new World({ seed: 9102 });
  const actor = makeActor(world);
  const dagger = buildCatalogItem(world, "dagger_quick");
  const before = Number(world.get(dagger, ItemInfo)?.bonuses?.critChance || 0);

  dip(world, actor, "potion_keen_edge", dagger);
  dip(world, actor, "potion_keen_edge", dagger);

  const after = Number(world.get(dagger, ItemInfo)?.bonuses?.critChance || 0);
  assertEquals(after, before + 0.04);
  assert(!coating(world, dagger), "keen edge should not use coating charges");
});

Deno.test("selected potion coatings proc on hit", () => {
  const world = new World({ seed: 1 });
  const attacker = makeActor(world, {
    hp: 10,
    stamina: { stamina: 1, maxStamina: 10, staminaRegen: 1, regenCooldown: 0 },
  });
  const defender = makeActor(world, { hp: 20 });

  const lifedraw = buildCatalogItem(world, "dagger_quick");
  world.get(lifedraw, ItemInfo).coating = { kind: "lifedraw", charges: 1 };
  world.get(attacker, Vitality).hp = 5;
  applyWeaponCoatingOnHit(world, { attacker, defender, weaponId: lifedraw, didHit: true });
  assertEquals(world.get(attacker, Vitality).hp, 6);
  assert(!world.get(lifedraw, ItemInfo).coating, "lifedraw should consume its charge");

  const adrenaline = buildCatalogItem(world, "dagger_quick");
  world.get(adrenaline, ItemInfo).coating = { kind: "adrenaline", charges: 1 };
  applyWeaponCoatingOnHit(world, { attacker, defender, weaponId: adrenaline, didHit: true });
  assertEquals(world.get(attacker, Stamina).stamina, 4);

  const lethargy = buildCatalogItem(world, "dagger_quick");
  world.get(lethargy, ItemInfo).coating = { kind: "lethargy", charges: 1 };
  applyWeaponCoatingOnHit(world, { attacker, defender, weaponId: lethargy, didHit: true });
  const slowed = world.get(defender, ActiveEffects)?.effects?.find((e) => e.key === "slowed");
  assert(slowed, "lethargy coating should slow defender");
  assertEquals(slowed.turnsLeft, 4);

  const paralysis = buildCatalogItem(world, "dagger_quick");
  world.get(paralysis, ItemInfo).coating = { kind: "paralysis", charges: 20 };
  applyWeaponCoatingOnHit(world, { attacker, defender, weaponId: paralysis, didHit: true });
  const paralysisRow = buildEffectRows(world, defender).find((row) => row.key === "stunned");
  assertEquals([paralysisRow?.name, paralysisRow?.glyph], ["Paralyzed", "🔒"]);
});

Deno.test("potion status badges preserve distinct sources and generic stun", () => {
  const world = new World({ seed: 9110 });
  const actor = makeActor(world, { stamina: { stamina: 5, maxStamina: 10, staminaRegen: 1 } });

  world.add(actor, ActiveEffects, { effects: [{ key: "lethargic", turnsLeft: 30, potency: 1, stacks: 1, meta: { source: "potion_lethargy" } }] });
  const lethargicRow = buildEffectRows(world, actor).find((row) => row.key === "lethargic");
  assertEquals([lethargicRow?.name, lethargicRow?.glyph, lethargicRow?.turns], ["Lethargic", "🦥", 30]);

  world.get(actor, ActiveEffects).effects.push({ key: "stun", turnsLeft: 10, potency: 1, stacks: 1, meta: { source: "potion_paralysis" } });
  const paralyzedRow = buildEffectRows(world, actor).find((row) => row.key === "stunned");
  assertEquals([paralyzedRow?.name, paralyzedRow?.glyph, paralyzedRow?.turns], ["Paralyzed", "🔒", 10]);

  const generic = makeActor(world);
  world.add(generic, ActiveEffects, { effects: [{ key: "stun", turnsLeft: 3, potency: 1, stacks: 1 }] });
  const stunnedRow = buildEffectRows(world, generic).find((row) => row.key === "stunned");
  assertEquals([stunnedRow?.key, stunnedRow?.sourceKey], ["stunned", ""]);
});

Deno.test("vigor throw creates blood pool that heals living and hurts undead", () => {
  const world = new World({ seed: 9104 });
  const actor = makeActor(world, { x: 0, y: 0 });
  const potion = createItemById(world, "potion_vigor");
  addToInventory(world, actor, potion);

  const living = makeActor(world, { x: 2, y: 0, hp: 20 });
  world.get(living, Vitality).hp = 10;
  const undead = makeActor(world, { x: 2, y: 1, hp: 20 });
  world.add(undead, CreatureType, { type: CREATURE_TYPES.undead });

  world.add(actor, ThrowIntent, { itemId: potion, x: 2, y: 0 });
  throwSystem(world);

  const hazards = [...world.query(Position, HazardArea)].filter(([, , h]) => h.kind === "blood_pool");
  assertEquals(hazards.length, 1);

  hazardSystem(world);
  assertEquals(world.get(living, Vitality).hp, 11);
  assertEquals(world.get(undead, Vitality).hp, 18);
});

Deno.test("adrenaline and lethargy throws apply splash effects", () => {
  const world = new World({ seed: 9105 });
  const actor = makeActor(world, { x: 0, y: 0 });

  const rageTarget = makeActor(world, { x: 2, y: 0 });
  const adrenaline = createItemById(world, "potion_adrenaline");
  addToInventory(world, actor, adrenaline);
  world.add(actor, ThrowIntent, { itemId: adrenaline, x: 2, y: 0 });
  throwSystem(world);
  const berserk = world.get(rageTarget, ActiveEffects)?.effects?.find((e) => e.key === "berserk");
  assert(berserk, "adrenaline throw should enrage target");

  const slowTarget = makeActor(world, { x: 4, y: 0 });
  const lethargy = createItemById(world, "potion_lethargy");
  addToInventory(world, actor, lethargy);
  world.add(actor, ThrowIntent, { itemId: lethargy, x: 4, y: 0 });
  throwSystem(world);
  const slowed = world.get(slowTarget, ActiveEffects)?.effects?.find((e) => e.key === "slowed");
  assert(slowed, "lethargy throw should slow target");
  assert([...world.query(HazardArea)].some(([, h]) => h.kind === "sticky_syrup"), "lethargy throw should leave sticky syrup");
  const slowedRow = buildEffectRows(world, slowTarget).find((row) => row.key === "slowed");
  assertEquals([slowedRow?.name, slowedRow?.glyph], ["Slowed", "🐌"]);
});
