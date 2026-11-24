import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { buildWorldView } from "../src/bridge/schema/worldView.js";
import { collectLightSources } from "../src/display/lighting/sources/index.js";
import { getPatternNames } from "../src/display/lighting/sources/temporalPatterns.js";
import { Position } from "../src/rules/components/Position.js";
import { LightEmitter } from "../src/rules/components/LightEmitter.js";
import { groundItemPresentationPosition } from "../src/display/fx/groundItemPresentation.js";

Deno.test("WorldView projects scalar light emitters", () => {
  const world = new World({ seed: 0x11947 });
  const id = world.create();
  world.add(id, Position, { x: 7, y: 9 });
  world.add(id, LightEmitter, {
    radius: 3.5,
    shadowSoftness: 5,
    temporalPattern: "pulse",
    phaseSeed: 17,
    intensity: 0.6,
    intensityScale: 0.75,
    colorShiftScale: 0.4,
    baseColor: "#78c8ff",
  });

  const view = buildWorldView(world);
  assertEquals(view.lightEmitters, [{
    id,
    pos: { x: 7, y: 9 },
    radius: 3.5,
    shadowSoftness: 5,
    temporalPattern: "pulse",
    phaseSeed: 17,
    intensity: 0.6,
    intensityScale: 0.75,
    colorShiftScale: 0.4,
    voidStrength: null,
    baseColor: [120, 200, 255],
  }]);
});

Deno.test("LightEmitter stores one flat authored light, not an emitter list", () => {
  const world = new World({ seed: 0x11947 });
  const id = world.create();
  world.add(id, Position, { x: 2, y: 4 });
  world.add(id, LightEmitter, {
    radius: 3,
    shadowSoftness: 8,
    temporalPattern: "ember",
    intensity: 0.5,
    baseColor: "#ff7828",
  });

  const light = world.get(id, LightEmitter);
  assert(!("emitters" in light));
  assertEquals(light.baseColor, "#ff7828");
  assertEquals(light.intensity, 0.5);
  assertEquals(buildWorldView(world).lightEmitters.length, 1);
});

Deno.test("WorldView supports short hex and array baseColor fallback", () => {
  const world = new World({ seed: 0x11947 });
  const shortHex = world.create();
  const arrayColor = world.create();
  world.add(shortHex, Position, { x: 2, y: 4 });
  world.add(shortHex, LightEmitter, {
    radius: 3,
    baseColor: "#fc8",
  });
  world.add(arrayColor, Position, { x: 3, y: 4 });
  world.add(arrayColor, LightEmitter, {
    radius: 3,
    baseColor: [255, 120, 40],
  });

  const view = buildWorldView(world);
  assertEquals(view.lightEmitters.find((light) => light.id === shortHex)?.baseColor, [255, 204, 136]);
  assertEquals(view.lightEmitters.find((light) => light.id === arrayColor)?.baseColor, [255, 120, 40]);
});

Deno.test("collectLightSources consumes authored light emitters", () => {
  const lights = collectLightSources({
    turn: 1,
    player: null,
    lightEmitters: [{
      id: 4,
      pos: { x: 8, y: 3 },
      radius: 2.8,
      shadowSoftness: 5,
      temporalPattern: "void",
      phaseSeed: 0,
      intensity: 0.5,
      intensityScale: 1,
      colorShiftScale: 1,
      voidStrength: 0.65,
      baseColor: [155, 120, 255],
    }],
    entities: [{ id: 4, kind: "void_crack", pos: { x: 8, y: 3 }, tags: [] }],
  }, { fxTime: 1, dt: 0.016 });

  assert(lights.some((light) => light.kind === "void" && light.x === 8.5 && light.radius === 2.8));
  assert(lights.some((light) => light.kind === "void" && light.voidStrength > 0 && light.voidStrength < 0.65));
  assertEquals(lights.filter((light) => light.kind === "void" && light.x === 8.5).length, 1);
});

Deno.test("ground-item lights share the item glyph anchor", () => {
  const lights = collectLightSources({
    turn: 1,
    player: null,
    entities: [{
      id: 21,
      kind: "sword",
      layer: 250,
      pos: { x: 8, y: 3 },
      tags: ["glowing"],
    }, {
      id: 22,
      kind: "goblin",
      layer: 300,
      pos: { x: 8, y: 3 },
      tags: ["glowing"],
    }],
  }, { fxTime: 1, dt: 0.016 });

  const itemLight = lights[0];
  const actorLight = lights[1];
  assertEquals([itemLight?.x, itemLight?.y], [8.5, 3.5]);
  assertEquals([actorLight?.x, actorLight?.y], [8.5, 3.5]);
});

Deno.test("potion lights stay anchored to the dropped glyph on both axes", () => {
  const lights = collectLightSources({
    turn: 1,
    player: null,
    entities: [{
      id: 23,
      kind: "potion_health",
      layer: 250,
      pos: { x: 8, y: 3 },
      visualOff: { dx: 0.12, dy: -0.08 },
      tags: ["potion_glow"],
    }],
  }, { fxTime: 1, dt: 0.016 });

  const potionLight = lights[0];
  assertEquals([potionLight?.x, potionLight?.y], [8.62, 3.42]);
});

Deno.test("ground-item presentation anchor follows the loot arc, then settles with visual offset", () => {
  const entity = {
    pos: { x: 8, y: 3 },
    visualOff: { dx: 0.12, dy: -0.08 },
  };

  assertEquals(groundItemPresentationPosition(entity, { x: 8.75, y: 2.25 }), { x: 8.75, y: 2.25 });
  assertEquals(groundItemPresentationPosition(entity), { x: 8.12, y: 2.92 });
});

Deno.test("potion light accepts the same transient loot position as its glyph", () => {
  const lights = collectLightSources({
    turn: 1,
    player: null,
    entities: [{
      id: 24,
      kind: "potion_health",
      layer: 250,
      pos: { x: 8, y: 3 },
      visualOff: { dx: 0.12, dy: -0.08 },
      tags: ["potion_glow"],
    }],
  }, {
    fxTime: 1,
    dt: 0.016,
    getGroundItemPosition: () => ({ x: 8.75, y: 2.25 }),
  });

  assertEquals([lights[0]?.x, lights[0]?.y], [9.25, 2.75]);
});

Deno.test("portal temporal patterns are available for authored portal lighting", () => {
  assert(getPatternNames().includes("portal"));
  assert(getPatternNames().includes("rift"));

  const lights = collectLightSources({
    turn: 1,
    player: null,
    lightEmitters: [{
      id: 43,
      pos: { x: 2, y: 6 },
      radius: 3.6,
      shadowSoftness: 4,
      temporalPattern: "portal",
      phaseSeed: 11,
      intensity: 0.88,
      intensityScale: 1,
      colorShiftScale: 0.65,
      voidStrength: null,
      baseColor: [112, 214, 255],
    }, {
      id: 44,
      pos: { x: 4, y: 6 },
      radius: 4.2,
      shadowSoftness: 3,
      temporalPattern: "rift",
      phaseSeed: 19,
      intensity: 0.92,
      intensityScale: 1,
      colorShiftScale: 0.85,
      voidStrength: null,
      baseColor: [182, 106, 255],
    }],
    entities: [
      { id: 43, kind: "return_portal", pos: { x: 2, y: 6 }, tags: [] },
      { id: 44, kind: "rift_portal", pos: { x: 4, y: 6 }, tags: [] },
    ],
  }, { fxTime: 1, dt: 0.016 });

  const portalLight = lights.find((entry) => entry.x === 2.5 && entry.y === 6.5);
  assert(portalLight, "return portal authored light should be collected");
  assertEquals(portalLight.softness, 4);
  assert(Array.isArray(portalLight.color) && portalLight.color[2] > portalLight.color[0], "portal light should stay blue");

  const light = lights.find((entry) => entry.x === 4.5 && entry.y === 6.5);
  assert(light, "rift authored light should be collected");
  assertEquals(light.softness, 3);
  assert(light.flicker > 0.55 && light.flicker < 1.3, "rift light should breathe without extreme spikes");
  assert(Array.isArray(light.color) && light.color[2] > light.color[0], "rift light should stay violet-blue");
});
