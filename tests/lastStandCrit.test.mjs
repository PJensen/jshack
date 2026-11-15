import { assertEquals } from "jsr:@std/assert";
import "./helpers/installContentCatalog.mjs";
import { World } from "../src/lib/ecs-js/index.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { getCatalogItem } from "../src/rules/data/itemCatalog.js";
import { attachProcPackage } from "../src/rules/data/procPackages.js";
import { buildProcContext, evaluateCritChanceProcPhase } from "../src/rules/utils/procPhases.js";

Deno.test("last stand circlet adds 25% crit below half health", () => {
  const item = getCatalogItem("last_stand_circlet");
  assertEquals(item?.procPackages, ["lastStand"]);

  const world = new World({ seed: 0x5157 });
  const source = world.create();
  const target = world.create();
  const circlet = world.create();
  world.add(source, Equipment, { head: circlet });
  world.add(source, Vitality, { hp: 49, maxHp: 100 });
  world.add(target, Vitality, { hp: 20, maxHp: 20 });
  world.add(circlet, NamedIdentity, { identity: "last_stand_circlet", name: "Last Stand Circlet" });
  world.add(circlet, ItemInfo, { type: "equip", slot: "head", affixes: [] });
  attachProcPackage(world, circlet, "lastStand");

  const belowHalf = evaluateCritChanceProcPhase(world, source, buildProcContext("onBeforeCrit", {
    source,
    target,
    item: 0,
    damage: 4,
    damageType: "slash",
    crit: false,
    tags: [],
    scratch: {},
  }));
  assertEquals(belowHalf, 0.25);

  world.set(source, Vitality, { hp: 50, maxHp: 100 });
  const atHalf = evaluateCritChanceProcPhase(world, source, buildProcContext("onBeforeCrit", {
    source,
    target,
    item: 0,
    damage: 4,
    damageType: "slash",
    crit: false,
    tags: [],
    scratch: {},
  }));
  assertEquals(atHalf, 0);
});
