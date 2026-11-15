import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { buildWorldView } from "../src/bridge/schema/worldView.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { attachProcPackage } from "../src/rules/data/procPackages.js";

Deno.test("buildWorldView projects proc-package state effects with metadata", () => {
  const world = new World({ seed: 0xC0FFEE });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 1, y: 1 });

  const target = world.create();
  world.add(target, Position, { x: 2, y: 1 });
  world.add(target, NamedIdentity, { identity: "goblin", name: "Goblin" });
  world.add(target, ActiveEffects, {
    effects: [
      { key: "kinetic_battery", turnsLeft: 12, potency: 3, stacks: 3 },
      { key: "burning", turnsLeft: 2, potency: 1, stacks: 1 },
    ],
  });

  const view = buildWorldView(world);
  const rec = view.entities.find((e) => e.id === target);

  assert(rec, "expected target entity in world view");
  assert(Array.isArray(rec.procStates), "proc states should be projected");
  assertEquals(rec.procStates.length, 1);

  const proc = rec.procStates[0];
  assertEquals(proc.key, "kinetic_battery");
  assertEquals(proc.stacks, 3);
  assertEquals(proc.turnsLeft, 12);
  assertEquals(proc.potency, 3);
  assertEquals(proc.name, "Kinetic Battery");
  assert(typeof proc.description === "string" && proc.description.length > 0, "expected proc description");
});

Deno.test("buildWorldView projects active low-health passive proc indicators", () => {
  const world = new World({ seed: 0xC0FFEE });
  const player = world.create();
  const item = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 1, y: 1 });
  world.add(player, Equipment, { head: item });
  world.add(player, Vitality, { hp: 49, maxHp: 100 });
  world.add(item, NamedIdentity, { identity: "last_stand_circlet", name: "Last Stand Circlet" });
  world.add(item, ItemInfo, { type: "equip", slot: "head", affixes: [] });
  attachProcPackage(world, item, "lastStand");

  const view = buildWorldView(world);
  const rec = view.entities.find((e) => e.id === player);
  const indicator = rec?.procStates?.find((s) => s.key === "last_stand");

  assert(indicator, "expected active Last Stand indicator below half health");
  assertEquals(indicator.name, "Last Stand");
  assertEquals(indicator.potency, 0.25);
});
