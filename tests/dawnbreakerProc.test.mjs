import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { CreatureType } from "../src/rules/components/CreatureType.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { ScriptState } from "../src/rules/components/ScriptState.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { evaluateEquippedAffixProcs } from "../src/rules/utils/affixTopology.js";
import { applyProcAccumulator } from "../src/rules/utils/procApplication.js";

Deno.test("Dawnbreaker passive combat behavior uses equipped proc topology", () => {
  const world = new World({ seed: 17 });
  world.rand = () => 0;
  const actor = world.create();
  const target = world.create();
  const weapon = buildCatalogItem(world, "dawnbreaker");
  world.add(actor, Equipment, { weapon });
  world.add(actor, Position, { x: 2, y: 2 });
  world.add(actor, Vitality, { hp: 30, maxHp: 30 });
  world.add(target, Position, { x: 3, y: 2 });
  world.add(target, Vitality, { hp: 30, maxHp: 30 });
  world.add(target, CreatureType, { type: "undead" });

  const presentations = [];
  world.on("script:present", (event) => presentations.push(event));

  for (let i = 0; i < 2; i++) {
    const out = evaluateEquippedAffixProcs(world, actor, {
      kind: "onHit",
      source: actor,
      target,
      damage: { amount: 8, type: "slash", crit: false, blocked: false },
      tags: new Set(["melee"]),
      scratch: {},
    });
    applyProcAccumulator(world, out);
  }

  assertEquals(world.get(weapon, ScriptState).data.radiance, 6);
  assertEquals(presentations.length, 2);

  const awakening = evaluateEquippedAffixProcs(world, actor, {
    kind: "onHit",
    source: actor,
    target,
    damage: { amount: 8, type: "slash", crit: false, blocked: false },
    tags: new Set(["melee"]),
    scratch: {},
  });
  applyProcAccumulator(world, awakening);
  assertEquals(world.get(weapon, ScriptState).data.radiance, 9);
  assertEquals(world.get(weapon, ScriptState).data.awakened, true);
  assertEquals(presentations[2]?.id, "awaken");

  const awakened = evaluateEquippedAffixProcs(world, actor, {
    kind: "onHit",
    source: actor,
    target,
    damage: { amount: 8, type: "slash", crit: false, blocked: false },
    tags: new Set(["melee"]),
    scratch: {},
  });
  applyProcAccumulator(world, awakened);
  assert(
    awakened.directDamage.some((entry) => entry.target === target && entry.type === "radiant"),
    "awakened strikes should add radiant proc damage",
  );
  assertEquals(presentations.at(-1)?.id, "radiant_strike");
});
