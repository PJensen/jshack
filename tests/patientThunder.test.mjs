import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { ScriptState } from "../src/rules/components/ScriptState.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { evaluateEquippedAffixProcs } from "../src/rules/utils/affixTopology.js";
import { applyProcAccumulator } from "../src/rules/utils/procApplication.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { itemProcTickSystem } from "../src/rules/systems/itemProcTickSystem.js";

Deno.test("Patient Thunder demonstrates equipped lifecycle topology", () => {
  const world = new World({ seed: 31 });
  const actor = world.create();
  const target = world.create();
  world.add(actor, Player);
  world.add(actor, Inventory);
  world.add(actor, Equipment);
  world.add(actor, Position, { x: 2, y: 2 });
  world.add(target, Position, { x: 3, y: 2 });
  world.add(target, Vitality, { hp: 20, maxHp: 20 });
  const weapon = buildCatalogItem(world, "patient_thunder");
  addToInventory(world, actor, weapon, { silent: true });
  world.mutate(actor, Equipment, (equipment) => { equipment.weapon = weapon; });

  itemProcTickSystem(world);
  itemProcTickSystem(world);
  assertEquals(world.get(weapon, ScriptState).data.patience, 2);

  const out = evaluateEquippedAffixProcs(world, actor, {
    kind: "onHit", source: actor, target,
    damage: { amount: 4, crit: false }, tags: new Set(["melee"]), scratch: {},
  });
  assert(out.directDamage.some((entry) => entry.type === "electric" && entry.amount === 4));
  applyProcAccumulator(world, out);
  assertEquals(world.get(weapon, ScriptState).data.patience, 0);
});
