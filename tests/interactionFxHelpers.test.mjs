import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { Flying } from "../src/rules/components/Flying.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Position } from "../src/rules/components/Position.js";
import { executeInteraction } from "../src/rules/interaction/runtime/actionRuntime.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { markWet } from "../src/rules/utils/wetTileMap.js";
import { ScriptCtx } from "../src/content/scriptCtx.js";
import { createWorldFacade } from "../src/content/worldFacade.js";

Deno.test("action handlers and script hooks share actor wetness", () => {
  const world = new World({ seed: 5011 });
  const dungeon = world.create();
  world.add(dungeon, DungeonState, { wetTiles: {} });
  const actor = world.create();
  world.add(actor, Position, { x: -31, y: -32 });
  world.add(actor, Vitality, { hp: 10, maxHp: 10 });
  const script = new ScriptCtx(createWorldFacade(world, actor, actor), {});

  function check(expected) {
    const result = executeInteraction(world, {
      verb: "wetness-test",
      actor,
      primary: actor,
      pipeline(ctx) {
        assertEquals(ctx.query.isActorWet(actor), expected > 0);
        assertEquals(ctx.query.actorWetness(actor), expected);
        assertEquals(new ScriptCtx(ctx, {}).actorWetness(), expected);
      },
    });
    assertEquals(result.ok, true);
    assertEquals(script.isActorWet(), expected > 0);
    assertEquals(script.actorWetness(), expected);
  }

  check(0);
  markWet(world, -31, -32, 1);
  check(0.35);
  world.step += 2;
  check(0);
  assertEquals(world.get(dungeon, DungeonState).wetTiles["-31,-32"].expiresAtStep, 1);

  const result = executeInteraction(world, {
    verb: "splash-test",
    actor,
    primary: actor,
    pipeline(ctx) {
      ctx.mutate.wetActor(actor, 1);
      assertEquals(ctx.query.actorWetness(actor), 0, "wetness is applied on commit");
    },
  });
  assertEquals(result.ok, true);
  world.add(actor, Flying);
  check(1);
  world.step += 2;
  check(0.5);
  world.step += 2;
  check(0);
});

Deno.test("ctx.helpers queue deterministic spawn/effect ops and commit together", () => {
  const world = new World({ seed: 5011 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(actor, Position, { x: 4, y: 4 });

  const result = executeInteraction(world, {
    verb: "helper-test",
    actor,
    primary: actor,
    target: actor,
    params: {},
    pipeline: (ctx) => {
      const dropAt = { x: 8, y: 9 };
      const summonAt = { x: 9, y: 9 };
      ctx.helpers.spawnItem("potion_stoneskin", dropAt);
      ctx.helpers.spawnMonster("stone_taunter", summonAt, { tauntMessage: "Stone calls to stone." });
      ctx.helpers.addEffect(actor, {
        key: "stoneskin",
        potency: 2,
        turnsLeft: 6,
        stack: "refresh",
        maxStacks: 1,
      });
      return { metrics: { helperUsed: true } };
    },
  });

  assertEquals(result.ok, true);
  assertEquals(result.canceled, false);
  assertEquals(result.metrics.helperUsed, true);

  let spawnedItemId = 0;
  let spawnedMonsterId = 0;
  for (const [id, ni, pos] of world.query(NamedIdentity, Position)) {
    if (ni.identity === "potion_stoneskin" && pos.x === 8 && pos.y === 9) spawnedItemId = id;
    if (ni.identity === "stone_taunter" && pos.x === 9 && pos.y === 9) spawnedMonsterId = id;
  }

  assert(spawnedItemId > 0, "ctx.helpers.spawnItem should materialize at commit");
  assert(spawnedMonsterId > 0, "ctx.helpers.spawnMonster should materialize at commit");

  const effects = world.get(actor, ActiveEffects);
  assert(Array.isArray(effects?.effects), "actor should have ActiveEffects array");
  assert(effects.effects.some((e) => e.key === "stoneskin"), "ctx.helpers.addEffect should queue stoneskin");
});

Deno.test("ctx.helpers queued ops are discarded when interaction cancels", () => {
  const world = new World({ seed: 5012 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(actor, Position, { x: 2, y: 2 });

  const result = executeInteraction(world, {
    verb: "helper-cancel",
    actor,
    primary: actor,
    target: actor,
    params: {},
    pipeline: (ctx) => {
      ctx.helpers.spawnItem("potion_stoneskin", { x: 3, y: 2 });
      ctx.cancel({ code: "TEST_CANCEL", message: "discard queued helper ops" });
      return { metrics: { helperUsed: true } };
    },
  });

  assertEquals(result.ok, false);
  assertEquals(result.canceled, true);
  assertEquals(result.reason, "TEST_CANCEL");

  let foundSpawn = false;
  for (const [, ni] of world.query(NamedIdentity)) {
    if (ni.identity === "potion_stoneskin") foundSpawn = true;
  }
  assertEquals(foundSpawn, false);
});

Deno.test("ctx.fx remains an alias of ctx.helpers for compatibility", () => {
  const world = new World({ seed: 5013 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(actor, Position, { x: 7, y: 7 });

  const spawned = [];
  world.on("spawned", (ev) => spawned.push(ev));

  const result = executeInteraction(world, {
    verb: "helper-alias",
    actor,
    primary: actor,
    target: actor,
    params: {},
    pipeline: (ctx) => {
      assertEquals(ctx.fx, ctx.helpers);
      ctx.fx.spawnItem("potion_stoneskin", { x: 7, y: 8 });
      return { metrics: { helperAliasUsed: true } };
    },
  });

  assertEquals(result.ok, true);
  assertEquals(result.metrics.helperAliasUsed, true);
  assert(spawned.length >= 1, "ctx.fx alias should queue helper ops");
});

Deno.test("ctx.helpers.hazardSpawn queues generic hazards with medium metadata", () => {
  const world = new World({ seed: 5014 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(actor, Position, { x: 3, y: 3 });

  const spawned = [];
  world.on("hazard:spawned", (ev) => spawned.push(ev));

  const result = executeInteraction(world, {
    verb: "helper-hazard",
    actor,
    primary: actor,
    target: actor,
    params: {},
    pipeline: (ctx) => {
      ctx.helpers.hazardSpawn({
        kind: "poison",
        medium: "floor",
        turnsLeft: 4,
        radius: 2,
        tickDamage: 3,
        damageType: "poison",
        cause: "toxic_slick",
      }, { x: 6, y: 7 });
      return { metrics: { hazardHelperUsed: true } };
    },
  });

  assertEquals(result.ok, true);
  assertEquals(result.metrics.hazardHelperUsed, true);
  assertEquals(spawned.length, 1);
  assertEquals(spawned[0].kind, "poison");
  assertEquals(spawned[0].medium, "floor");
  assertEquals(spawned[0].at?.x, 6);
  assertEquals(spawned[0].at?.y, 7);

  let found = null;
  for (const [id, pos, hazard] of world.query(Position, HazardArea)) {
    if ((pos.x | 0) === 6 && (pos.y | 0) === 7) {
      found = { id, hazard };
      break;
    }
  }
  assert(found, "hazard should be created at requested tile");
  assertEquals(String(found.hazard.kind), "poison");
  assertEquals(String(found.hazard.medium), "floor");
  assertEquals(Number(found.hazard.tickDamage), 3);
});
