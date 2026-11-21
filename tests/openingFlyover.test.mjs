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

Deno.test("opening titles fade around the named waypoint and clear at landing", () => {
  const cam = {};
  const view = makeView();
  const flyover = createOpeningFlyover({ startScale: 28, endScale: 70, duration: 6 });
  flyover.start(cam, view);
  assertEquals(flyover.getTitleCard(), null);
  flyover.update(cam, view, 1.4);
  const approach = flyover.getTitleCard();
  assertEquals(approach.title, "Bear Cave");
  assert(approach.alpha > 0 && approach.alpha < 1);
  flyover.update(cam, view, 0.6);
  assertEquals({ x: cam.x, y: cam.y }, { x: 42, y: 18 });
  assertEquals(flyover.getTitleCard(), { title: "Bear Cave", alpha: 1 });
  flyover.update(cam, view, 1);
  assertEquals(flyover.getTitleCard(), null);
  flyover.update(cam, view, 1);
  assertEquals(flyover.getTitleCard(), { title: "The Miller", alpha: 1 });
  flyover.update(cam, view, 2);
  assertEquals(flyover.getTitleCard(), null);
});

