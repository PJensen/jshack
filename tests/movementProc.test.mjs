import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Charges } from "../src/rules/components/Charges.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { ScriptState } from "../src/rules/components/ScriptState.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Breadcrumb } from "../src/rules/components/InvestigationSignal.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { movementProcExtension } from "../src/rules/systems/movementProcSystem.js";

// Force proc package registration.
await import("../src/rules/data/procPackages.js");

Deno.test("movement procs evaluate equipped item packages on genuine steps", () => {
  const world = new World({ seed: 7 });
  world.install(movementProcExtension);

  const actor = world.create();
  world.add(actor, Player);
  world.add(actor, Position, { x: 4, y: 4 });
  world.add(actor, Vitality, { hp: 20, maxHp: 20 });
  const boots = buildCatalogItem(world, "breadcrumb_boots");
  world.add(actor, Equipment, { feet: boots });

  for (let i = 0; i < 3; i++) {
    world.emit("moved", {
      id: actor,
      kind: "step",
      from: { x: 4 + i, y: 4 },
      to: { x: 5 + i, y: 4 },
    });
  }
  assertEquals(world.get(boots, ScriptState).data.stepsTowardCrumb, 3);
  assertEquals([...world.query(Breadcrumb)].length, 0);

  world.emit("moved", {
    id: actor,
    kind: "step",
    from: { x: 7, y: 4 },
    to: { x: 8, y: 4 },
  });

  assertEquals(world.get(boots, ScriptState).data.stepsTowardCrumb, 0);
  assertEquals(world.get(boots, Charges).current, 1);
  assertEquals([...world.query(Breadcrumb)].length, 1);
});

Deno.test("movement procs ignore generic displacement events", () => {
  const world = new World({ seed: 7 });
  world.install(movementProcExtension);

  const actor = world.create();
  world.add(actor, Position, { x: 4, y: 4 });
  world.add(actor, Vitality, { hp: 20, maxHp: 20 });
  const boots = buildCatalogItem(world, "breadcrumb_boots");
  world.add(actor, Equipment, { feet: boots });

  for (let i = 0; i < 4; i++) {
    world.emit("moved", {
      id: actor,
      from: { x: 4 + i, y: 4 },
      to: { x: 5 + i, y: 4 },
    });
  }

  assert(world.get(boots, ScriptState).data.stepsTowardCrumb === 0);
  assertEquals([...world.query(Breadcrumb)].length, 0);
});
