import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { FrostNovaCast } from "../src/events/FrostNovaCast.js";
import { createSpellAreaFxController } from "../src/display/fx/spellAreaFx.js";

Deno.test("spell area lights use tile centers", () => {
  const world = new World({ seed: 1 });
  const controller = createSpellAreaFxController({
    world,
    cam: {},
    fx: { pool: { spawn() {} } },
    PERF: { quality: "high" },
    getFxTime: () => 0,
  });
  controller.installListeners();

  world.emit(new FrostNovaCast({
    actor: 1,
    origin: { x: 5, y: 7 },
    frozen: [],
    radius: 2,
  }));

  const light = controller.getActiveLights()[0];
  assertEquals({ x: light.x, y: light.y }, { x: 5.5, y: 7.5 });
});

Deno.test("meteor impact requests slow motion after the camera approach", () => {
  const world = new World({ seed: 1 });
  const slowdowns = [];
  const controller = createSpellAreaFxController({
    world,
    cam: { x: 0, y: 0, targetX: 0, targetY: 0, scale: 1, targetScale: 1 },
    fx: { pool: { spawn() {} } },
    PERF: { quality: "high" },
    getFxTime: () => 0,
    hitstopFx: { requestSlowdown: (...args) => slowdowns.push(args) },
  });
  controller.installListeners();

  world.emit("spell:meteor", { origin: { x: 5, y: 7 }, radius: 2 });
  controller.tick(0.35);
  assertEquals(slowdowns.length, 0);
  controller.tick(0.02);
  assertEquals(slowdowns, [[0.72, 0.22]]);
});
