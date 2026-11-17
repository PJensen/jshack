import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Charges } from "../src/rules/components/Charges.js";
import { RangedAttackIntent } from "../src/rules/components/Intents/RangedAttackIntent.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { rangedAttackSystem } from "../src/rules/systems/rangedAttackSystem.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";

function setup() {
  const world = new World({ seed: 42 });
  const wand = buildCatalogItem(world, "wand_arcane");
  const actor = world.create();
  world.add(actor, Position, { x: 0, y: 0 });
  world.add(actor, Vitality, { maxHp: 20, hp: 20 });
  world.add(actor, Equipment, { ranged: wand, accuracyDerived: 20, damagePowerDerived: 1 });
  world.add(actor, Inventory, { capacity: 20 });
  world.add(actor, Faction, { key: "player" });
  addToInventory(world, actor, wand);
  return { world, actor, wand };
}

Deno.test("Arcane Wand has its reusable ranged profile and charge pool", () => {
  const { world, wand } = setup();
  const info = world.get(wand, ItemInfo);
  assertEquals(info.type, "wand");
  assertEquals(info.subtype, "projectile");
  assertEquals(info.damageType, "arcane");
  assertEquals(info.projectileStyle, "arcane_wand");
  assertEquals(world.get(wand, Charges), { current: 100, max: 100 });
});

Deno.test("Arcane Wand spends one charge on a valid hit", () => {
  const { world, actor, wand } = setup();
  const target = world.create();
  world.add(target, Position, { x: 5, y: 0 });
  world.add(target, Vitality, { maxHp: 20, hp: 20 });
  world.add(target, Faction, { key: "enemy" });
  const damage = [];
  world.on("damaged", (event) => damage.push(event));
  world.add(actor, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assertEquals(world.get(wand, Charges).current, 99);
  assert(damage.some((event) => event.type === "arcane" && event.projectileKind === "arcane_mote"));
});
