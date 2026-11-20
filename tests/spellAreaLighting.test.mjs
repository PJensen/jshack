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
