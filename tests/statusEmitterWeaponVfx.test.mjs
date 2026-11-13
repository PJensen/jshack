import { assert, assertEquals } from "jsr:@std/assert";
import { createStatusEmitterController } from "../src/display/passes/vfx/particles/statusEmitterController.js";

function makeWorld() {
  const listeners = new Map();
  return {
    on(event, handler) {
      const bucket = listeners.get(event) || [];
      bucket.push(handler);
      listeners.set(event, bucket);
    },
    emit(event, payload) {
      const bucket = listeners.get(event) || [];
      for (let i = 0; i < bucket.length; i++) bucket[i](payload);
    },
  };
}

function makeFxHarness() {
  const ensured = [];
  const removed = [];
  const stepCalls = [];
  return {
    ensured,
    removed,
    stepCalls,
    fx: {
      ensureEmitter(key, cfg) {
        ensured.push({ key, cfg });
      },
      removeEmitter(key) {
        removed.push(key);
      },
      step(dtSec, origins) {
        stepCalls.push({
          dtSec: Number(dtSec || 0),
          origins: Array.isArray(origins) ? origins.map((origin) => ({ ...origin })) : [],
        });
      },
    },
  };
}

Deno.test("status emitter controller resolves per-slot weapon profile emitters/lights", () => {
  const world = makeWorld();
  const harness = makeFxHarness();
  const controller = createStatusEmitterController({ world, fx: harness.fx });

  const view = {
    entities: [
      {
        id: 7,
        kind: "player",
        pos: { x: 10, y: 5 },
        facing: { dx: 1, dy: 0 },
        tags: [],
        weaponVfx: [
          {
            id: "venom_weapon",
            slot: "weapon",
            carryAnchor: { forward: 0.4, lateral: 0.18, vertical: -0.02 },
            carryEmitter: { rate: 9, color: "#6ddb55" },
            carryLight: { radius: 1.3, color: [120, 255, 80], flicker: { mode: "sin", base: 0.9, amp: 0.1, speed: 5.0, phase: 0.31 } },
          },
          {
            id: "flame_weapon",
            slot: "offhand",
            carryAnchor: { forward: 0.4, lateral: 0.18, vertical: -0.04 },
            carryEmitter: { rate: 11, color: "#ff7a30" },
            carryLight: { radius: 1.38, color: [255, 118, 40], flicker: { mode: "sin", base: 0.9, amp: 0.1, speed: 6.2, phase: 0.33 } },
          },
        ],
      },
    ],
  };

  controller.step(0.016, view, 1.0);
  assertEquals(harness.ensured.length, 2);
  assert(harness.ensured.some((rec) => rec.key === "wpvfx:venom_weapon:weapon:7"));
  assert(harness.ensured.some((rec) => rec.key === "wpvfx:flame_weapon:offhand:7"));

  const lastStep = harness.stepCalls[harness.stepCalls.length - 1];
  const emittedOrigins = lastStep.origins.filter((origin) => origin.key.startsWith("wpvfx:"));
  assertEquals(emittedOrigins.length, 2);
  const dx = Math.abs(Number(emittedOrigins[0].x) - Number(emittedOrigins[1].x));
  const dy = Math.abs(Number(emittedOrigins[0].y) - Number(emittedOrigins[1].y));
  assert(dx > 0.0001 || dy > 0.0001, "weapon/offhand should render at distinct hand origins");

  const lights = controller.getActiveLights();
  assertEquals(lights.length, 2);
});

Deno.test("status emitter controller removes weapon profile emitters when profile disappears", () => {
  const world = makeWorld();
  const harness = makeFxHarness();
  const controller = createStatusEmitterController({ world, fx: harness.fx });

  controller.step(0.016, {
    entities: [
      {
        id: 3,
        kind: "player",
        pos: { x: 2, y: 2 },
        facing: { dx: 0, dy: 1 },
        tags: [],
        weaponVfx: [
          {
            id: "storm_weapon",
            slot: "weapon",
            carryAnchor: { forward: 0.4, lateral: 0.18, vertical: -0.05 },
            carryEmitter: { rate: 12, color: "#8ac5ff" },
            carryLight: { radius: 1.34, color: [145, 205, 255] },
          },
        ],
      },
    ],
  }, 1.0);

  controller.step(0.016, { entities: [] }, 1.1);
  assert(harness.removed.includes("wpvfx:storm_weapon:weapon:3"));
});

Deno.test("status emitter controller gives rift portals low-rate motes and light", () => {
  const world = makeWorld();
  const harness = makeFxHarness();
  const controller = createStatusEmitterController({ world, fx: harness.fx });

  controller.step(0.25, {
    entities: [
      {
        id: 11,
        kind: "rift_portal",
        pos: { x: 6, y: 4 },
        tags: [],
      },
    ],
  }, 2.0);

  const emitter = harness.ensured.find((rec) => rec.key === "rift:11");
  assert(emitter, "rift portal should create a continuous particle emitter");
  assertEquals(emitter.cfg.rate, 7);

  const lastStep = harness.stepCalls[harness.stepCalls.length - 1];
  assert(lastStep.origins.some((origin) => origin.key === "rift:11"));
  const lights = controller.getActiveLights();
  assertEquals(lights.length, 1);
  assert(lights[0].radius > 1.5 && lights[0].radius < 3);

  controller.step(0.016, { entities: [] }, 2.1);
  assert(harness.removed.includes("rift:11"));
});

Deno.test("status emitter controller gives return portals calmer motes and light", () => {
  const world = makeWorld();
  const harness = makeFxHarness();
  const controller = createStatusEmitterController({ world, fx: harness.fx });

  controller.step(0.25, {
    entities: [
      {
        id: 12,
        kind: "return_portal",
        pos: { x: 2, y: 8 },
        tags: [],
      },
    ],
  }, 2.0);

  const emitter = harness.ensured.find((rec) => rec.key === "portal:12");
  assert(emitter, "return portal should create a continuous particle emitter");
  assertEquals(emitter.cfg.rate, 5);

  const lights = controller.getActiveLights();
  assertEquals(lights.length, 1);
  assert(lights[0].radius > 1.3 && lights[0].radius < 2.2);

  controller.step(0.016, { entities: [] }, 2.1);
  assert(harness.removed.includes("portal:12"));
});

Deno.test("status emitter controller gives aura recipients colorized item-style light", () => {
  const world = makeWorld();
  const harness = makeFxHarness();
  const controller = createStatusEmitterController({ world, fx: harness.fx });

  controller.step(0.016, {
    entities: [
      {
        id: 21,
        kind: "dire_wolf",
        pos: { x: 4, y: 6 },
        tags: [],
        auraGlows: [{ key: "pack", strength: 1 }],
      },
    ],
  }, 1.0);

  const packEmitter = harness.ensured.find((rec) => rec.key === "aura:pack:21");
  assert(packEmitter);
  assertEquals(packEmitter.cfg.rate, 0, "positive pack auras should not emit particles");
  const lights = controller.getActiveLights();
  assertEquals(lights.length, 1);
  assert(lights[0].color[1] > lights[0].color[0]);
  assert(lights[0].color[1] > lights[0].color[2]);
  assert(lights[0].radius > 0.8 && lights[0].radius < 1.6);
  const firstFlicker = lights[0].flicker;

  controller.step(0.016, {
    entities: [{ id: 21, kind: "dire_wolf", pos: { x: 4, y: 6 }, tags: [], auraGlows: [{ key: "pack", strength: 1 }] }],
  }, 2.0);
  assert(controller.getActiveLights()[0].flicker !== firstFlicker, "aura light should follow its temporal pattern");

  const lastStep = harness.stepCalls[harness.stepCalls.length - 1];
  assert(lastStep.origins.some((origin) => origin.key === "aura:pack:21"));
});
