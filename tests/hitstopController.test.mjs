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
