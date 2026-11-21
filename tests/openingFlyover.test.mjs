import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert";
import { createOpeningFlyover } from "../src/display/camera/openingFlyover.js";

function makeView() {
  return {
    player: { id: 1, pos: { x: 0, y: 0 } },
    entities: [
      { id: 2, kind: "stair_down", pos: { x: 42, y: 18 }, title: "Bear Cave", tags: ["dungeon_entrance"] },
      { id: 3, kind: "quest_giver", pos: { x: -28, y: -20 }, title: "The Miller", tags: ["quest_giver"] },
      { id: 4, kind: "tree", pos: { x: 20, y: -42 }, tags: [] },
    ],
  };
}

Deno.test("opening flyover starts far away and reaches the player", () => {
  let completed = false;
  const cam = { x: 0, y: 0, scale: 70, targetX: 0, targetY: 0, targetScale: 70 };
  const flyover = createOpeningFlyover({
    startScale: 28,
    endScale: 70,
    duration: 2,
    onComplete: () => { completed = true; },
  });
  const view = makeView();

  assert(flyover.start(cam, view));
  assertNotEquals(cam.x, view.player.pos.x);
  assertNotEquals(cam.y, view.player.pos.y);
  assertEquals(cam.scale, 28);

  flyover.update(cam, view, 1);
  assert(flyover.isActive());
  flyover.update(cam, view, 1);
  assertEquals(flyover.isActive(), false);
  assertEquals(cam.x, view.player.pos.x);
  assertEquals(cam.y, view.player.pos.y);
  assertEquals(cam.scale, 70);
  assertEquals(completed, true);
});

Deno.test("opening labels stay pinned and the camera pulls back between stops", () => {
  const cam = {};
  const view = makeView();
  const flyover = createOpeningFlyover({ startScale: 28, endScale: 70, duration: 6 });
  flyover.start(cam, view);
  assertEquals(flyover.getMapLabel(), null);
  const seen = new Set();
  let firstPeak = 0;
  let surveyScale = Infinity;
  let sawFade = false;
  for (let i = 0; i < 120; i++) {
    flyover.update(cam, view, 0.05);
    const label = flyover.getMapLabel();
    if (label) {
      seen.add(label.title);
      const waypoint = view.entities.find((entity) => entity.title === label.title);
      assertEquals({ x: label.x, y: label.y }, waypoint.pos);
      sawFade ||= label.alpha > 0 && label.alpha < 1;
      if (label.title === "Bear Cave") firstPeak = Math.max(firstPeak, cam.scale);
    } else if (seen.size === 1) {
      surveyScale = Math.min(surveyScale, cam.scale);
    }
  }
  assertEquals([...seen], ["Bear Cave", "The Miller"]);
  assert(sawFade);
  assertEquals(firstPeak, 56, "the landmark should fill more of the viewport");
  assert(surveyScale < 30, "zoom should pull back after the close-up");
  assertEquals(flyover.update(cam, view, 0.05), false);
  assertEquals(flyover.getMapLabel(), null);
  assertEquals(cam.scale, 70);
});

Deno.test("opening tour fits every landmark and lengthens to make room for titles", () => {
  const cam = {};
  const view = makeView();
  view.entities = Array.from({ length: 8 }, (_, i) => ({
    id: i + 2,
    pos: { x: i * 4 - 20, y: 30 },
    title: `Landmark ${i}`,
    tags: ["landmark"],
  }));
  const flyover = createOpeningFlyover({ startScale: 28, endScale: 70 });
  assert(flyover.start(cam, view));
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    if (!flyover.update(cam, view, 0.1)) break;
    const label = flyover.getMapLabel();
    if (label?.alpha === 1) seen.add(label.title);
  }
  assertEquals(seen.size, view.entities.length);
  assertEquals(flyover.isActive(), false);
});

Deno.test("opening route trims the nearest-neighbor detour with fixed endpoints", () => {
  const coordinates = [[27, 62], [-56, 20], [-71, 49], [26, 4], [5, -46]];
  const view = {
    bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    player: { id: 1, pos: { x: 0, y: 0 } },
    entities: coordinates.map(([x, y], i) => ({
      id: i + 2, pos: { x, y }, title: String(i), tags: ["landmark"],
    })),
  };
  const flyover = createOpeningFlyover({ startScale: 28, endScale: 70 });
  const cam = {};
  flyover.start(cam, view);
  const start = [cam.x, cam.y];
  const visits = new Set();
  for (let i = 0; i < 200; i++) {
    if (!flyover.update(cam, view, 0.1)) break;
    const label = flyover.getMapLabel();
    if (label) visits.add(Number(label.title));
  }
  const distance = (order) => {
    const points = [start, ...order.map((i) => coordinates[i]), [0, 0]];
    return points.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - points[i][0], y - points[i][1]), 0);
  };
  assertEquals(visits.size, coordinates.length);
  assert(distance([...visits]) < distance([4, 3, 0, 1, 2]));
  assertEquals([cam.x, cam.y], [0, 0]);
});

Deno.test("camera velocity carries through an unnamed waypoint", () => {
  const cam = {};
  const view = {
    player: { id: 1, pos: { x: 0, y: 0 } },
    entities: [{ id: 2, pos: { x: 35, y: 0 }, tags: ["landmark"] }],
  };
  const flyover = createOpeningFlyover({ startScale: 28, endScale: 70, duration: 6 });
  flyover.start(cam, view);
  const firstLeg = Math.hypot(cam.x - 35, cam.y);
  const arrival = 6 * (0.3 + 0.4 * firstLeg / (firstLeg + 35));
  const dt = 0.001;
  flyover.update(cam, view, arrival - dt);
  const before = cam.x;
  flyover.update(cam, view, dt);
  const at = cam.x;
  flyover.update(cam, view, dt);
  const after = cam.x;
  assert(Math.abs(at - 35) < 0.00001);
  assert(at - before < -dt && after - at < -dt, "camera should keep moving through arrival");
  assert(Math.abs((at - before) - (after - at)) < dt * 0.1);
});

Deno.test("named stops hold the close-up and pinned label for a full second", () => {
  const cam = {};
  const view = makeView();
  const flyover = createOpeningFlyover({ startScale: 28, endScale: 70 });
  flyover.start(cam, view);
  let heldFrames = 0;
  for (let i = 0; i < 300; i++) {
    if (!flyover.update(cam, view, 0.05)) break;
    if (cam.x !== 42 || cam.y !== 18 || cam.scale !== 56) continue;
    assertEquals(flyover.getMapLabel(), { title: "Bear Cave", x: 42, y: 18, alpha: 1 });
    heldFrames++;
  }
  assert(heldFrames >= 20, "the close-up should hold for at least one second");
  assertEquals(cam.scale, 70);
});

