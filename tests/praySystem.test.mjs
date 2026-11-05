import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createFrom } from "../src/lib/ecs-js/archetype.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { HealthPotion } from "../src/rules/archetypes/Items.js";
import { Devotion } from "../src/rules/components/Devotion.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Beatitude } from "../src/rules/components/Beatitude.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Status } from "../src/rules/components/Status.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { PrayIntent } from "../src/rules/components/Intents/PrayIntent.js";
import { installCurseHooks } from "../src/rules/systems/curseHooks.js";
import { deitySystem, initDeity } from "../src/rules/systems/deitySystem.js";
import { praySystem } from "../src/rules/systems/praySystem.js";

function setup({ serenity, wrath, hp = 20 } = {}) {
  const world = new World({ seed: 0x181 });
  const playerId = createPlayer(world, { name: "Hero", hp, maxHp: 20 });
  world.add(playerId, Devotion, { deityId: "seraphine" });
  world.add(playerId, Status, { statuses: [] });
  const deity = initDeity("seraphine", world);
  deity.mood._vector = {
    wrath,
    serenity,
    hunger: 0,
    amusement: 0,
    sorrow: 0,
    chaos: 0,
  };
  installCurseHooks(world);
  return { world, playerId, deity };
}

function addEquippedItem(world, playerId, state = "uncursed") {
  const itemId = createFrom(world, HealthPotion, {});
  world.get(playerId, Equipment).weapon = itemId;
  world.set(itemId, Beatitude, { state });
  return itemId;
}

function pray(world, playerId) {
  world.add(playerId, PrayIntent, {});
  praySystem(world);
}

Deno.test("wrathful prayer never grants a boon or uncurse, even in desperation", () => {
  const { world, playerId } = setup({ serenity: 0.05, wrath: 0.8, hp: 1 });
  const itemId = addEquippedItem(world, playerId, "cursed");
  world.get(playerId, Status).statuses = [{ type: "cursed", duration: 10 }];
  const boons = [];
  const interventions = [];
  world.on("deity:boon", (event) => boons.push(event));
  world.on("deity:intervention", (event) => interventions.push(event));

  pray(world, playerId);

  assertEquals(boons.length, 0);
  assertEquals(world.get(itemId, Beatitude).state, "cursed");
  assertEquals(world.get(playerId, Vitality).hp, 1);
  assert(interventions.some((event) => event.kind === "prayer_refusal"));
});

Deno.test("displeased prayer mostly refuses and can curse at most one equipped item", () => {
  const { world, playerId } = setup({ serenity: 0.05, wrath: 0.8 });
  const first = addEquippedItem(world, playerId);
  const second = createFrom(world, HealthPotion, {});
  world.get(playerId, Equipment).armor = second;
  const interventions = [];
  world.on("deity:intervention", (event) => interventions.push(event));

  world.rand = () => 0.5;
  pray(world, playerId);
  assertEquals(world.get(first, Beatitude).state, "uncursed");
  assert(interventions.some((event) => event.kind === "prayer_refusal"));

  world.rand = () => 0.02;
  pray(world, playerId);
  const cursed = [first, second].filter((id) => world.get(id, Beatitude).state === "cursed");
  assertEquals(cursed.length, 1);
  assert(interventions.some((event) => event.kind === "prayer_curse"));
});

Deno.test("favorable prayer can still grant aid", () => {
  const { world, playerId } = setup({ serenity: 0.8, wrath: 0.05, hp: 1 });
  world.rand = () => 0.5;
  const boons = [];
  world.on("deity:boon", (event) => boons.push(event));

  for (let step = 0; step < 10 && boons.length === 0; step++) {
    world.step = step;
    pray(world, playerId);
  }

  assert(boons.length > 0, "favorable prayer should eventually grant aid");
});

Deno.test("automatic miracles cannot bypass a hostile standing gate", () => {
  const { world, playerId, deity } = setup({ serenity: 0.05, wrath: 0.8, hp: 1 });
  deitySystem(world);
  const miracles = [];
  world.on("deity:miracle", (event) => miracles.push(event));
  deity._emit("miracle", { serenity: 1, tick: 1 });

  assertEquals(miracles.length, 0);
  assertEquals(world.get(playerId, Vitality).hp, 1);
  assertEquals(world.get(playerId, ActiveEffects).effects.length, 0);
});
