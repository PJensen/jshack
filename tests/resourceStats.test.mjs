import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Encumbrance } from "../src/rules/components/Encumbrance.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Mana } from "../src/rules/components/Mana.js";
import { Stamina } from "../src/rules/components/Stamina.js";
import { Status } from "../src/rules/components/Status.js";
import { manaRegenerationSystem } from "../src/rules/systems/manaRegenerationSystem.js";
import { staminaRegenerationSystem } from "../src/rules/systems/staminaRegenerationSystem.js";
import { resolveResourceStats } from "../src/rules/utils/resourceStats.js";

function equippedBonus(world, bonuses) {
  const item = world.create();
  world.add(item, ItemInfo, { type: "equip", slot: "ring1", bonuses, affixes: [] });
  return item;
}

Deno.test("resource stats resolve effective caps and nominal recovery from equipment", () => {
  const world = new World({ seed: 1 });
  const actor = world.create();
  const item = equippedBonus(world, { maxMana: 12, manaRegen: 0.5, maxStamina: 8, staminaRegen: 1 });
  world.add(actor, Equipment, { ring1: item });
  world.add(actor, Mana, { maxMana: 20, mana: 5, manaRegen: 2, regenCooldown: 0 });
  world.add(actor, Stamina, { maxStamina: 30, stamina: 4, staminaRegen: 3, regenCooldown: 0 });

  assertEquals(resolveResourceStats(world, actor, "mana"), {
    resource: "mana",
    entityId: actor,
    current: 5,
    baseMax: 20,
    maxBonus: 12,
    max: 32,
    baseRecovery: 2,
    passiveRecovery: 0.5,
    derivedRecovery: 0,
    nominalRecovery: 2.5,
    recoveryMultiplier: 1,
    effectiveRecovery: 2.5,
    regenCooldown: 0,
    recoverySuppressed: false,
    suppressionReasons: [],
  });

  const stamina = resolveResourceStats(world, actor, "stamina");
  assertEquals(stamina?.max, 38);
  assertEquals(stamina?.nominalRecovery, 4);
  assertEquals(stamina?.effectiveRecovery, 4);
});

Deno.test("resource stats separates nominal mana recovery from hunger suppression", () => {
  const world = new World({ seed: 2 });
  const actor = world.create();
  world.add(actor, Mana, { maxMana: 20, mana: 5, manaRegen: 4, regenCooldown: 0 });
  world.add(actor, Status, { statuses: [{ type: "famished", duration: 3 }] });

  const resource = resolveResourceStats(world, actor, "mana");
  assertEquals(resource?.nominalRecovery, 4);
  assertEquals(resource?.recoveryMultiplier, 0.5);
  assertEquals(resource?.effectiveRecovery, 2);
  assertEquals(resource?.suppressionReasons, ["famished"]);

  manaRegenerationSystem(world);
  assertEquals(world.get(actor, Mana)?.mana, 7);
});

Deno.test("resource stats separates nominal stamina recovery from load suppression and cooldown", () => {
  const world = new World({ seed: 3 });
  const actor = world.create();
  world.add(actor, Stamina, { maxStamina: 20, stamina: 5, staminaRegen: 4, regenCooldown: 0 });
  world.add(actor, Encumbrance, { heavilyLoaded: true, overloaded: false });

  let resource = resolveResourceStats(world, actor, "stamina");
  assertEquals(resource?.nominalRecovery, 4);
  assertEquals(resource?.recoveryMultiplier, 0.5);
  assertEquals(resource?.effectiveRecovery, 2);

  staminaRegenerationSystem(world);
  assertEquals(world.get(actor, Stamina)?.stamina, 7);

  world.get(actor, Stamina).regenCooldown = 1;
  resource = resolveResourceStats(world, actor, "stamina");
  assertEquals(resource?.nominalRecovery, 4);
  assertEquals(resource?.effectiveRecovery, 0);
  assertEquals(resource?.suppressionReasons, ["cooldown", "heavilyLoaded"]);
});
