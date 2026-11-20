import { assert, assertEquals } from "jsr:@std/assert@1.0.18";
import { createDeathLootArcFx } from "../src/display/fx/deathLootArcFx.js";
import {
  startZoomLerp,
  updateZoomPunch,
  getZoomPunchScale,
} from "../src/display/camera/zoomPunch.js";

Deno.test("loot arc reports the real delayed landing time", () => {
  let now = 0;
  const fx = createDeathLootArcFx({
    world: { step: 17 },
    getItemInfo: () => ({ weight: 1 }),
    getFxTime: () => now,
    isWalkable: () => true,
  });

  const delay = fx.schedule(9, { x: 2, y: 2 }, { x: 4, y: 2 }, 0.16, null);
  assert(delay > 0.16, "landing time should include the chest hold and arc duration");
  assertEquals(fx.getPosition(9)?.airborne, true);

  now = delay + 0.01;
  assertEquals(fx.getPosition(9)?.airborne, false);
});

Deno.test("reward camera eases in and back out", () => {
  const cam = {};
  startZoomLerp(cam, 0.02, 0.2, 0.1, 0.3);
  updateZoomPunch(cam, 0.1);
  const rising = getZoomPunchScale(cam);
  updateZoomPunch(cam, 0.1);
  const held = getZoomPunchScale(cam);
  updateZoomPunch(cam, 0.2);
  const falling = getZoomPunchScale(cam);
  updateZoomPunch(cam, 0.2);

  assert(rising > 0 && rising < held, "camera should ease toward the peak");
  assert(falling < held && falling > 0, "camera should ease back out");
  assertEquals(getZoomPunchScale(cam), 0);
});
