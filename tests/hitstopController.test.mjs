import { assert, assertEquals } from "jsr:@std/assert@1.0.18";
import { createHitstopController } from "../src/display/fx/hitstopController.js";

function harness() {
  const listeners = new Map();
  const world = {
    on(name, listener) {
      listeners.set(name, listener);
    },
  };
  const controller = createHitstopController();
  controller.installListeners({ world, isPlayer: () => false });
  return { controller, damaged: listeners.get("damaged") };
}

Deno.test("critical hits trigger hitstop even below the normal damage floor", () => {
  const { controller, damaged } = harness();
  assert(controller.durationForHit(1, true, false) > 0);

  damaged({ amount: 1, critical: true, projectileDelay: 0 });
  assert(controller.scale(0.016) < 0.016);
});

Deno.test("projectile hitstop waits for the delayed impact", () => {
  const { controller, damaged } = harness();

  damaged({ amount: 8, critical: true, projectileDelay: 0.05 });
  assertEquals(controller.scale(0.016), 0.016);
  assert(controller.scale(0.04) < 0.04);
});

Deno.test("cinematic slowdown advances display time below real time", () => {
  const { controller } = harness();
  controller.requestSlowdown(0.5, 0.22);
  assert(Math.abs(controller.scale(0.1) - 0.022) < 1e-9);
  assert(controller.isActive());
});
