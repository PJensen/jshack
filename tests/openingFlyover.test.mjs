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

Deno.test("opening labels stay pinned while the camera follows the flight line", () => {
  const cam = {};
  const view = makeView();
  const flyover = createOpeningFlyover({ startScale: 28, endScale: 70, duration: 6 });
  flyover.start(cam, view);
  assertEquals(flyover.getMapLabel(), null);
  const seen = new Set();
  let sawFade = false;
  for (let i = 0; i < 120; i++) {
    flyover.update(cam, view, 0.05);
    const label = flyover.getMapLabel();
    const mapLabels = flyover.getMapLabels();
    for (const mapLabel of mapLabels) {
      const waypoint = view.entities.find((entity) => entity.title === mapLabel.title);
      assertEquals({ x: mapLabel.x, y: mapLabel.y }, waypoint.pos);
      seen.add(mapLabel.title);
      sawFade ||= mapLabel.alpha > 0 && mapLabel.alpha < 1;
    }
    if (label) {
      seen.add(label.title);
      const waypoint = view.entities.find((entity) => entity.title === label.title);
      assertEquals({ x: label.x, y: label.y }, waypoint.pos);
      sawFade ||= label.alpha > 0 && label.alpha < 1;
    }
  }
  assertEquals([...seen], ["Bear Cave", "The Miller"]);
  assert(sawFade);
  assertEquals(flyover.update(cam, view, 0.05), false);
  assertEquals(flyover.getMapLabel(), null);
  assertEquals(cam.scale, 70);
});

Deno.test("opening tour keeps all place names available without making them stops", () => {
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
    for (const label of flyover.getMapLabels()) seen.add(label.title);
  }
  assert(seen.size > 0, "the straight flight should still reveal places");
  assertEquals(flyover.isActive(), false);
});

Deno.test("opening route stays on one outer-corner-to-player line", () => {
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
  const end = [0, 0];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  let maxLineError = 0;
  for (let i = 0; i < 200; i++) {
    if (!flyover.update(cam, view, 0.1)) break;
    maxLineError = Math.max(maxLineError, Math.abs((cam.x - start[0]) * dy - (cam.y - start[1]) * dx));
  }
  assert(maxLineError < 0.000001, "places must not pull the camera into visible zigzags");
  assertEquals([cam.x, cam.y], [0, 0]);
});

Deno.test("camera does not bounce when passing a nearby place", () => {
  const cam = {};
  const view = {
    player: { id: 1, pos: { x: 0, y: 0 } },
    entities: [{ id: 2, pos: { x: 35, y: 0 }, tags: ["landmark"] }],
  };
  const flyover = createOpeningFlyover({ startScale: 28, endScale: 70, duration: 6 });
  flyover.start(cam, view);
  const positions = [];
  for (let i = 0; i < 30; i++) {
    flyover.update(cam, view, 0.1);
    positions.push(cam.x);
  }
  const direction = Math.sign(positions.at(-1) - positions[0]);
  for (let i = 1; i < positions.length; i++) {
    assert(direction * (positions[i] - positions[i - 1]) >= -0.000001, "camera should not reverse over a place");
  }
});

Deno.test("nearby place labels fade without stopping the flight", () => {
  const cam = {};
  const view = makeView();
  const flyover = createOpeningFlyover({ startScale: 28, endScale: 70 });
  flyover.start(cam, view);
  let sawLabel = false;
  for (let i = 0; i < 300; i++) {
    if (!flyover.update(cam, view, 0.05)) break;
    for (const label of flyover.getMapLabels()) {
      if (label.title !== "Bear Cave") continue;
      assertEquals({ x: label.x, y: label.y }, { x: 42, y: 18 });
      sawLabel = true;
    }
  }
  assert(sawLabel, "the flight should pass close enough to reveal the place");
  assertEquals(cam.scale, 70);
});

