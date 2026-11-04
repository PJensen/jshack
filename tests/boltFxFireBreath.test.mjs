import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createBoltFxController } from "../src/display/fx/boltFxController.js";
import { isInputLocked } from "../src/display/input/inputLock.js";
import { assert } from "jsr:@std/assert";

function installTestWindow() {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const prevWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    value: {},
    configurable: true,
    writable: true,
  });
  return () => {
    if (hadWindow) {
      Object.defineProperty(globalThis, "window", {
        value: prevWindow,
        configurable: true,
        writable: true,
      });
    } else {
      delete globalThis.window;
    }
  };
}

Deno.test("boltFx fire breath is a blocking slow-travel VFX window", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 7 });
    const controller = createBoltFxController({
      world,
      cam: {},
      fx: { pool: { spawn() {} } },
      getPosition: (id) => (id === 99 ? { x: 4, y: 1 } : null),
    });
    controller.installListeners();

    world.emit("monster:firebreath", {
      from: { x: 1, y: 1 },
      to: { x: 4, y: 1 },
      tiles: [
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
      ],
      hitIds: [99],
    });

    assertEquals(controller.isBlocking(), true);
    assertEquals(isInputLocked(), true);

    controller.tick(0.25);
    assertEquals(controller.isBlocking(), true);
    assertEquals(isInputLocked(), true);

    controller.tick(0.45);
    assertEquals(controller.isBlocking(), true);
    assertEquals(isInputLocked(), true);

    controller.tick(0.15);
    assertEquals(controller.isBlocking(), false);
    assertEquals(isInputLocked(), false);
  } finally {
    restoreWindow();
  }
});

Deno.test("boltFx renders sunsword holy beam as non-blocking styled line light", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 9 });
    const controller = createBoltFxController({
      world,
      cam: {},
      fx: { pool: { spawn() {} } },
      getPosition: () => null,
    });
    controller.installListeners();

    world.emit("content:beam:vfx", {
      fromX: 1,
      fromY: 1,
      toX: 4,
      toY: 1,
      style: "holy",
    });

    assertEquals(controller.isBlocking(), false);
    const lights = controller.getActiveLights();
    assert(lights.length >= 2, "expected holy beam to contribute active lights");
    assertEquals(lights.some((light) => Array.isArray(light.color)
      && light.color[0] === 255
      && light.color[1] === 240
      && light.color[2] === 180), true);

    // Lights should decay over time — tick well past any reasonable TTL
    controller.tick(10);
    assertEquals(controller.getActiveLights().length, 0);
  } finally {
    restoreWindow();
  }
});

Deno.test("boltFx consumes a genuine deity wrath event as lightning", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 11 });
    const controller = createBoltFxController({
      world,
      cam: {},
      fx: { pool: { spawn() {} } },
      getPosition: (id) => (id === 7 ? { x: 3, y: 4 } : null),
    });
    controller.installListeners();

    world.emit("deity:wrath", {
      playerId: 7,
      deityId: "seraphine",
      intensity: 1,
      severityScale: 1,
      wrathDebt: 0,
    });

    assertEquals(controller.hasScreenEffects(), true);
  } finally {
    restoreWindow();
  }
});
