import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { createCorpse } from "../src/rules/archetypes/Food.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Hunger } from "../src/rules/components/Hunger.js";
import { Traits } from "../src/rules/components/Traits.js";
import { useItemSystem } from "../src/rules/systems/useItemSystem.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";
import { FOOD_EATING_TURNS } from "../src/rules/content/useActions/foodEatingAction.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";

function makeRatCorpse(world) {
  return createCorpse(world, {
    id: "rat",
    name: "Rat",
    sizeClass: "S",
    massKg: 2,
    tier: 0,
  }, { x: 0, y: 0 });
}

function eatCorpse(world, player, corpse) {
  addToInventory(world, player, corpse);
  world.add(player, UseIntent, { itemId: corpse, targetId: player });
  useItemSystem(world);
  for (let turn = 0; turn < FOOD_EATING_TURNS; turn++) channelingSystem(world);
}

// ── Iron Stomach progression ──────────────────────────────────────

Deno.test("eating first rat corpse increments ratCorpsesEaten to 1", () => {
  const world = new World({ seed: 0xFEED01 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const corpse = makeRatCorpse(world);
  eatCorpse(world, player, corpse);

  const traits = world.get(player, Traits);
  assert(traits, "player should have Traits component after eating rat");
  assertEquals(traits.ratCorpsesEaten, 1, "should track 1 rat corpse eaten");
  assertEquals(traits.iron_stomach, false, "should not grant iron_stomach after 1 rat");
});

Deno.test("eating 3 rat corpses grants iron_stomach trait", () => {
  const world = new World({ seed: 0xFEED02 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const traitEvents = [];
  world.on("corpse:trait-gained", (ev) => traitEvents.push(ev));

  for (let i = 0; i < 3; i++) {
    const corpse = makeRatCorpse(world);
    eatCorpse(world, player, corpse);
  }

  const traits = world.get(player, Traits);
  assert(traits, "player should have Traits component");
  assertEquals(traits.ratCorpsesEaten, 3, "should count 3 rat corpses");
  assertEquals(traits.iron_stomach, true, "should grant iron_stomach after 3 rats");
  assertEquals(traitEvents.length, 1, "should emit exactly one trait-gained event");
  assertEquals(traitEvents[0].trait, "iron_stomach");
  assertEquals(traitEvents[0].name, "Iron Stomach");
});

Deno.test("eating 4th rat does not duplicate iron_stomach or increment counter", () => {
  const world = new World({ seed: 0xFEED03 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const traitEvents = [];
  world.on("corpse:trait-gained", (ev) => traitEvents.push(ev));

  for (let i = 0; i < 4; i++) {
    const corpse = makeRatCorpse(world);
    eatCorpse(world, player, corpse);
  }

  const traits = world.get(player, Traits);
  assertEquals(traits.ratCorpsesEaten, 3, "counter should stop at 3 (early return)");
  assertEquals(traits.iron_stomach, true, "iron_stomach should still be true");
  assertEquals(traitEvents.length, 1, "should still be exactly one event");
});

Deno.test("bat corpses also count toward iron_stomach", () => {
  const world = new World({ seed: 0xFEED04 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  // 2 rats + 1 bat = 3 disease-carrier corpses → iron_stomach
  for (let i = 0; i < 2; i++) {
    const corpse = makeRatCorpse(world);
    eatCorpse(world, player, corpse);
  }
  const batCorpse = createCorpse(world, {
    id: "bat",
    name: "Bat",
    sizeClass: "XS",
    massKg: 1,
    tier: 0,
  }, { x: 0, y: 0 });
  eatCorpse(world, player, batCorpse);

  const traits = world.get(player, Traits);
  assertEquals(traits.ratCorpsesEaten, 3, "bat corpses should share the counter");
  assertEquals(traits.iron_stomach, true, "mixing rat and bat corpses should grant iron_stomach");
});

Deno.test("rat corpse still applies disease when granting iron_stomach", () => {
  const world = new World({ seed: 0xFEED05 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  // Eat a rat corpse and verify disease is applied
  const corpse = makeRatCorpse(world);
  eatCorpse(world, player, corpse);

  const ae = world.get(player, ActiveEffects);
  assert(ae && Array.isArray(ae.effects), "player should have active effects");
  assert(ae.effects.some((e) => e.key === "disease"), "rat corpse should still apply disease");
});

// ── EatCallbackContext standalone path ────────────────────────────

Deno.test("EatCallbackContext.setTrait queues and commits trait changes", async () => {
  const { EatCallbackContext } = await import("../src/rules/data/callbacks/eat.js");
  const { corpseIronStomachProgress } = await import("../src/rules/data/callbacks/eat.js");

  const world = new World({ seed: 0xFEED06 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });
  const dummyItemId = world.create();

  // Eat 3 times via the standalone EatCallbackContext
  const events = [];
  world.emit = (name, payload) => { events.push({ name, payload }); };

  for (let i = 0; i < 3; i++) {
    const ctx = new EatCallbackContext(world, player, dummyItemId);
    corpseIronStomachProgress(ctx);
    ctx.commit();
  }

  const traits = world.get(player, Traits);
  assert(traits, "should have Traits component");
  assertEquals(traits.ratCorpsesEaten, 3, "standalone context should track count");
  assertEquals(traits.iron_stomach, true, "standalone context should grant iron_stomach");
  assert(events.some((e) => e.name === "corpse:trait-gained"), "should emit trait-gained");
});

Deno.test("corpseProcNode supports gate/effect/script composition", async () => {
  const { EatCallbackContext, corpseProcNode } = await import("../src/rules/data/callbacks/eat.js");

  const world = new World({ seed: 0xFEED07 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });
  const dummyItemId = world.create();
  if (!world.get(player, Hunger)) world.add(player, Hunger, { hunger: 120, satiation: 0 });

  const events = [];
  world.emit = (name, payload) => { events.push({ name, payload }); };

  const hook = corpseProcNode({
    gates: [{ kind: "chance", b: 1 }],
    effects: [
      { kind: "attachTimedBuff", a: "keen_eye", b: 12 },
      { kind: "nutrition", a: 25 },
    ],
    script: (ctx, proc) => {
      proc.emit("corpse:buff-gained", {
        actor: ctx.actor,
        effect: "keen_eye",
        turnsLeft: 12,
        description: "proc-node eat test",
      });
    },
  });

  const beforeHunger = world.get(player, Hunger).hunger;
  const ctx = new EatCallbackContext(world, player, dummyItemId);
  hook(ctx);
  ctx.commit();

  const ae = world.get(player, ActiveEffects);
  assert(ae?.effects?.some((e) => e.key === "keen_eye" && e.turnsLeft === 12), "should apply attachTimedBuff as active effect");
  assert(world.get(player, Hunger).hunger < beforeHunger, "nutrition effect should reduce hunger");
  assert(events.some((e) => e.name === "corpse:buff-gained"), "script should emit event");
});
